// ============================================================================
// ai-review-agent — relecture IA automatique des pending_review (2026-08-27)
//
// Cron */10 min (migration 20260827110000). Prend 1 analyse pending_review
// sans avis IA, rassemble le PDF source + la lecture pipeline (verdict,
// critères, matchs catalogue avec confidences) et demande à Claude Opus 5
// un AVIS DE RELECTURE avec :
//   - le PDF ORIGINAL (base64) — pas la version extraite,
//   - une RECHERCHE WEB de prix réels sur les postes douteux (grounding
//     externe = parade à la circularité des hallucinations),
//   - un JSON structuré : accord/désaccord, confiance, points vérifiés
//     sourcés, notes expert prêtes à coller.
// L'agent n'écrit JAMAIS dans la conclusion — avis seulement, l'humain
// clique. Accord mesurable vs analysis_corrections (Phase C).
// ============================================================================

import { buildReviewInstruction } from "./prompt.ts";
import { callProvider, mimeDepuisChemin, type Provider } from "./providers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
// ⚠️ Côté Supabase le secret s'appelle GOOGLE_AI_API_KEY (GOOGLE_API_KEY est
// le nom utilisé côté Vercel) — 8 autres edge functions lisent déjà ce nom.
const GOOGLE_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") ?? Deno.env.get("GOOGLE_API_KEY") ?? "";
// 2026-08-30 — Gemini par défaut : ~0,02 € la relecture contre ~0,85 € avec
// Claude, grounding Google gratuit sous 1 500 requêtes/jour, et qualité
// équivalente sur le cas ALES (mêmes défauts trouvés). Bascule de secours :
// `npx supabase secrets set AI_REVIEW_PROVIDER=claude`.
const PROVIDER: Provider = Deno.env.get("AI_REVIEW_PROVIDER") === "claude" ? "claude" : "gemini";

// Le PDF est transmis par URL SIGNÉE, jamais téléchargé ni encodé ici : sur un
// devis de 573 Ko, le download + base64 dans le worker consommait assez de CPU
// pour que la edge tue le run en silence (aucune erreur, claim laissé en
// "running" → 3 abandons). Anthropic va chercher le fichier lui-même.
const SIGNED_URL_TTL_S = 3600;
// Sous ce montant HT, la relecture n'est lancée QUE si un critère rouge est
// présent (cf. garde de proportion dans processOne).
const MIN_QUOTE_HT = 5000;

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

async function processOne(a: Record<string, any>, supabase: ReturnType<typeof createClient>): Promise<void> {
  console.log(`[ai-review] relecture ${a.id.slice(0, 8)} — ${a.file_name}`);
  // CLAIM immédiat : le tick suivant (10 min) ne doit pas reprendre la même
  // analyse pendant le traitement. Si le run meurt, le filet « opinion null
  // et claim > 1h » du select la remettra dans la file.
  const attempt = Number((a.ai_review_opinion as Record<string, unknown> | null)?.attempt ?? 0) + 1;
  await supabase.from("analyses").update({
    ai_reviewed_at: new Date().toISOString(),
    // Marqueur de run EN COURS : distingue « jamais tenté » (null) de
    // « tentative n en cours » — le filet de reprise s'appuie dessus et
    // abandonne proprement après MAX_ATTEMPTS au lieu de boucler.
    ai_review_opinion: { status: "running", attempt },
  }).eq("id", a.id);

  // ── Contexte pipeline ────────────────────────────────────────────────────
  let raw: Record<string, unknown> = {};
  try { raw = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : (a.raw_text ?? {}); } catch { /* vide */ }
  const ci = (() => {
    try { return typeof a.conclusion_ia === "string" ? JSON.parse(a.conclusion_ia) : a.conclusion_ia; } catch { return null; }
  })();
  const scoring = (raw.scoring ?? {}) as Record<string, unknown>;
  const priceData = Array.isArray(raw.n8n_price_data) ? raw.n8n_price_data as Array<Record<string, any>> : [];

  // ── Garde de proportion : un avis d'expert coûte ~0,85 € ─────────────────
  // On ne le dépense pas sur un petit devis SANS signal grave. Deux garde-fous
  // délibérés : un critère rouge (entreprise radiée, clause illégale, IBAN
  // suspect…) passe outre le seuil — la gravité ne dépend pas du montant — et
  // un montant inconnu déclenche aussi la relecture (l'incertitude est un
  // risque, pas une économie). Mesuré sur les 30 analyses déjà passées en
  // revue : médiane 12 180 €, une seule sous le seuil sans critère rouge —
  // c'est donc une assurance pour la montée en volume, pas une économie
  // immédiate.
  const totalHT = Number(
    (raw.extracted_data as any)?.totaux?.ht ?? (raw.extracted as any)?.totaux?.ht ?? 0,
  ) || 0;
  const criteresRouges = Array.isArray((scoring as any).criteres_rouges)
    ? (scoring as any).criteres_rouges.length
    : 0;
  if (totalHT > 0 && totalHT < MIN_QUOTE_HT && criteresRouges === 0) {
    await supabase.from("analyses").update({
      ai_reviewed_at: new Date().toISOString(),
      ai_review_opinion: { skipped: "montant_sous_seuil", montant_ht: totalHT, seuil: MIN_QUOTE_HT },
    }).eq("id", a.id);
    console.log(`[ai-review] ${a.id.slice(0, 8)} ignoré — ${totalHT} € HT < ${MIN_QUOTE_HT} € et aucun critère rouge`);
    return;
  }

  // ── PDF source ───────────────────────────────────────────────────────────
  let pdfUrl: string | null = null;
  if (a.file_path) {
    try {
      const { data: signed, error: signErr } = await supabase.storage
        .from("devis").createSignedUrl(a.file_path, SIGNED_URL_TTL_S);
      if (signed?.signedUrl) {
        pdfUrl = signed.signedUrl;
      } else {
        console.log("[ai-review] URL signée indisponible:", signErr?.message ?? "?");
      }
    } catch (e) {
      console.log("[ai-review] URL signée échouée:", e instanceof Error ? e.message : e);
    }
  }

  const instruction = buildReviewInstruction({
    conclusion: ci,
    scoring,
    priceData,
    hasPdf: Boolean(pdfUrl),
  });

  const t0 = Date.now();
  const res = await callProvider(
    PROVIDER,
    { gemini: GOOGLE_API_KEY, claude: ANTHROPIC_API_KEY },
    instruction,
    pdfUrl,
    mimeDepuisChemin(String(a.file_path ?? "")),
  );
  if (!res.ok) {
    const errTxt = res.errorText ?? "";
    const status = res.status ?? 0;
    console.error(`[ai-review] ${PROVIDER} ${status}: ${errTxt}`);

    // ⚠️ 2026-08-30 — SOLDE DE CRÉDITS ÉPUISÉ : c'est un 400, donc l'ancien
    // code le classait « erreur définitive » et estampillait l'analyse. Or la
    // cause n'a RIEN à voir avec cette analyse : c'est le compte API qui est à
    // sec, et ça se répare en rechargeant. Une analyse marquée en erreur ne
    // serait jamais reprise une fois les crédits restaurés — on perdrait
    // silencieusement toutes les relectures de la panne. On remet donc
    // l'analyse dans la file INTACTE, sans consommer de tentative.
    if (/credit balance|billing|insufficient.quota|payment required|quota/i.test(errTxt) || status === 402) {
      await supabase.from("analyses").update({
        ai_reviewed_at: null,
        ai_review_opinion: null,
      }).eq("id", a.id);
      console.error(`[ai-review] QUOTA/CRÉDITS ÉPUISÉS sur ${PROVIDER} — relecture suspendue, analyse remise en file intacte.`);
      return;
    }

    // Stamp quand même à l'échec DÉFINITIF client (4xx) pour ne pas boucler ;
    // les 5xx/429 seront retentés au prochain tick.
    if (status >= 400 && status < 500 && status !== 429) {
      await supabase.from("analyses").update({
        ai_reviewed_at: new Date().toISOString(),
        ai_review_opinion: { error: `${PROVIDER} ${status}`, detail: errTxt },
      }).eq("id", a.id);
      return;
    }
    // Retryable (429 / 5xx) : on garde le claim mais on CONSIGNE la cause. Sans
    // ça, un 429 systématique se déguisait en « devis trop lourd » au bout de 3
    // tentatives et envoyait le diagnostic dans le mur (cas du mode rapide non
    // ouvert sur l'organisation, 2026-08-29).
    await supabase.from("analyses").update({
      ai_review_opinion: { status: "running", attempt, last_error: `${PROVIDER} ${status}: ${errTxt}` },
    }).eq("id", a.id);
    return;
  }
  const text = res.text ?? "";
  let opinion: Record<string, unknown>;
  try {
    const jsonMatch = String(text).match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no JSON");
    opinion = JSON.parse(jsonMatch[0]);
  } catch {
    console.error("[ai-review] JSON introuvable dans la réponse:", String(text).slice(0, 300));
    opinion = { error: "parse_failed", raw: String(text).slice(0, 1500) };
  }
  opinion.model = PROVIDER;
  opinion.duration_ms = Date.now() - t0;
  opinion.pdf_lu = Boolean(pdfUrl);
  // Tokens conservés : c'est la seule trace qui permet de suivre le coût réel
  // du relecteur sans dépendre d'une facture a posteriori.
  if (res.usage) opinion.usage = res.usage;

  const { error: upErr } = await supabase.from("analyses").update({
    ai_review_opinion: opinion,
    ai_reviewed_at: new Date().toISOString(),
  }).eq("id", a.id);
  if (upErr) console.error("[ai-review] update:", upErr.message);

  console.log(`[ai-review] ${a.id.slice(0, 8)} terminé en ${Math.round((Date.now() - t0) / 1000)}s — accord=${opinion.accord_avec_ia ?? "?"} action=${opinion.action_recommandee ?? "?"}`);
}

Deno.serve(async (_req) => {
  const cleManquante = PROVIDER === "claude" ? !ANTHROPIC_API_KEY : !GOOGLE_API_KEY;
  if (cleManquante) {
    console.error(`[ai-review] clé API manquante pour le fournisseur ${PROVIDER}`);
    return new Response(JSON.stringify({ ok: false, error: "missing key" }), { status: 500 });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1 analyse par tick. Filet de reprise : un run marqué `running` depuis
  // plus de 15 min est mort (edge tuée) → on retente, jusqu'à MAX_ATTEMPTS.
  // Au-delà, on écrit une erreur explicite pour ne pas boucler indéfiniment.
  const MAX_ATTEMPTS = 3;
  const staleAt = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: candidates, error } = await supabase
    .from("analyses")
    .select("id, file_name, file_path, raw_text, conclusion_ia, score, created_at, ai_reviewed_at, ai_review_opinion")
    .eq("review_status", "pending_review")
    .or(`ai_reviewed_at.is.null,ai_reviewed_at.lt.${staleAt}`)
    .order("created_at", { ascending: true })
    .limit(5);

  const pending = (candidates ?? []).filter((c) => {
    const op = c.ai_review_opinion as Record<string, unknown> | null;
    if (!op) return true;                       // jamais tenté
    if (op.status !== "running") return false;  // avis présent ou erreur définitive
    return Number(op.attempt ?? 0) < MAX_ATTEMPTS;
  }).slice(0, 1);

  // Abandon propre des analyses qui ont épuisé leurs tentatives.
  for (const c of candidates ?? []) {
    const op = c.ai_review_opinion as Record<string, unknown> | null;
    if (op?.status === "running" && Number(op.attempt ?? 0) >= MAX_ATTEMPTS) {
      await supabase.from("analyses").update({
        ai_review_opinion: {
          error: "abandon",
          // La dernière erreur API prime sur le diagnostic générique : c'est
          // elle qui dit POURQUOI (quota, 5xx, ou run tué par la edge).
          detail: op.last_error
            ? `abandon après ${MAX_ATTEMPTS} tentatives — ${op.last_error}`
            : `abandon après ${MAX_ATTEMPTS} tentatives (run interrompu, aucune réponse API)`,
        },
      }).eq("id", c.id);
      console.warn(`[ai-review] ${c.id.slice(0, 8)} abandonné après ${MAX_ATTEMPTS} tentatives`);
    }
  }
  if (error) {
    console.error("[ai-review] select:", error.message);
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
  if (!pending?.length) {
    return new Response(JSON.stringify({ ok: true, reviewed: 0 }));
  }

  // Réponse immédiate (la gateway coupe à 150 s d'inactivité) — le traitement
  // (Claude Opus 5 + PDF + web search, 1-4 min) continue en arrière-plan.
  EdgeRuntime.waitUntil(processOne(pending[0], supabase));
  return new Response(JSON.stringify({ ok: true, launched: pending[0].id }), { status: 202 });
});
