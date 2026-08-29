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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const MODEL = "claude-opus-5";
// Le PDF est transmis par URL SIGNÉE, jamais téléchargé ni encodé ici : sur un
// devis de 573 Ko, le download + base64 dans le worker consommait assez de CPU
// pour que la edge tue le run en silence (aucune erreur, claim laissé en
// "running" → 3 abandons). Anthropic va chercher le fichier lui-même.
const SIGNED_URL_TTL_S = 3600;

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
  const groupsSummary = priceData.slice(0, 40).map((g) => {
    const p = g.prices?.[0] ?? {};
    const conf = g.vectorial?.confidence ?? "legacy";
    const desc = (g.devis_lines?.[0]?.description ?? "").slice(0, 50);
    return `- "${desc}" ${g.devis_total_ht ?? "?"}€ → match "${g.job_type_label ?? "aucun"}" [${conf}] marché ${p.price_min ?? p.min ?? "?"}-${p.price_max ?? p.max ?? "?"}€/${p.unit ?? "?"}`;
  }).join("\n");

  // ── PDF source ───────────────────────────────────────────────────────────
  let pdfBlock: Record<string, unknown> | null = null;
  if (a.file_path) {
    try {
      const { data: signed, error: signErr } = await supabase.storage
        .from("devis").createSignedUrl(a.file_path, SIGNED_URL_TTL_S);
      if (signed?.signedUrl) {
        pdfBlock = { type: "document", source: { type: "url", url: signed.signedUrl } };
      } else {
        console.log("[ai-review] URL signée indisponible:", signErr?.message ?? "?");
      }
    } catch (e) {
      console.log("[ai-review] URL signée échouée:", e instanceof Error ? e.message : e);
    }
  }

  const instruction = `Tu es un expert en chiffrage de travaux BTP en France, relecteur indépendant chez VerifierMonDevis.
Une analyse automatique de devis a été signalée pour revue humaine. RELIS-LA de façon INDÉPENDANTE.

LECTURE DU PIPELINE AUTOMATIQUE (à challenger, pas à recopier) :
- Verdict : ${ci?.verdict_global ?? "?"} / ${ci?.verdict_decisionnel ?? "?"}
- Surcoût estimé : ${JSON.stringify(ci?.surcout_global ?? null)}
- Anomalies retenues : ${JSON.stringify(ci?.anomalies ?? [])?.slice(0, 800)}
- Critères rouges : ${JSON.stringify(scoring.criteres_rouges ?? [])}
- Critères oranges : ${JSON.stringify(scoring.criteres_oranges ?? [])?.slice(0, 500)}
- Matchs catalogue (avec confiance) :
${groupsSummary || "(aucun)"}

TA MISSION :
1. ${pdfBlock
    ? "Lis le devis PDF joint (source de vérité — pas l'extraction)."
    : "Le PDF n'a pas pu être joint (devis volumineux) : appuie-toi sur les lignes extraites ci-dessus, et signale dans ton résumé que tu n'as pas relu le document original."}
2. Identifie les 2 postes les plus déterminants (les plus chers ou les plus douteux) et VÉRIFIE leurs prix avec la recherche web (2 recherches MAXIMUM, prix France 2026). Cite tes sources. Va droit au but.
3. Vérifie la cohérence du verdict pipeline : faux positifs de matching (forfait comparé à un prix unitaire, prestation intellectuelle, fourniture seule…), signaux manqués (clauses, acompte, TVA, entreprise).
4. Sois HONNÊTE sur l'incertitude : si un poste n'a pas de référence fiable, dis-le — n'invente jamais une fourchette.

Réponds UNIQUEMENT avec ce JSON (aucun texte autour) :
{
  "accord_avec_ia": "oui" | "partiel" | "non",
  "verdict_recommande": "signer" | "signer_avec_negociation" | "ne_pas_signer",
  "action_recommandee": "valider" | "corriger" | "rejeter_faux_positif",
  "confiance": 0.0-1.0,
  "resume": "2-3 phrases : ton avis global et pourquoi",
  "points_verifies": [{"poste": "...", "prix_devis": "...", "avis": "cohérent|élevé|bas|sans référence", "detail": "...", "source_web": "url ou null"}],
  "drapeaux": ["éléments que le pipeline a manqués ou sur-signalés"],
  "notes_expert_proposees": "notes prêtes à coller dans le champ Notes expert de l'écran de revue"
}`;

  const content: Array<Record<string, unknown>> = [];
  if (pdfBlock) content.push(pdfBlock);
  content.push({ type: "text", text: instruction });

  const t0 = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 5000,
      // ⚠️ NE PAS ajouter `speed: "fast"` : le mode rapide n'est pas ouvert sur
      // notre organisation (« rate limit of 0 fast mode input tokens per
      // minute ») → 429 immédiat sur CHAQUE appel. Ajouté le 2026-08-29 pour
      // « tenir dans le budget edge », il a en réalité éteint le relecteur pour
      // toutes les analyses. Mesuré depuis, sans mode rapide : 49 s sans PDF et
      // 58 s avec PDF sur le devis 25030 (82 lignes, 219 k€) — le budget edge
      // n'a jamais été le problème. À ne réactiver qu'après vérification du
      // quota fast mode sur la clé API.
      // effort low + 2 recherches suffisent pour un avis structuré et sourcé.
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }],
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) {
    const errTxt = (await res.text()).slice(0, 300);
    console.error(`[ai-review] Anthropic ${res.status}: ${errTxt}`);
    // Stamp quand même à l'échec DÉFINITIF client (4xx) pour ne pas boucler ;
    // les 5xx/429 seront retentés au prochain tick.
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      await supabase.from("analyses").update({
        ai_reviewed_at: new Date().toISOString(),
        ai_review_opinion: { error: `Anthropic ${res.status}`, detail: errTxt },
      }).eq("id", a.id);
      return;
    }
    // Retryable (429 / 5xx) : on garde le claim mais on CONSIGNE la cause. Sans
    // ça, un 429 systématique se déguisait en « devis trop lourd » au bout de 3
    // tentatives et envoyait le diagnostic dans le mur (cas du mode rapide non
    // ouvert sur l'organisation, 2026-08-29).
    await supabase.from("analyses").update({
      ai_review_opinion: { status: "running", attempt, last_error: `Anthropic ${res.status}: ${errTxt}` },
    }).eq("id", a.id);
    return;
  }
  const result = await res.json();
  // Le premier bloc peut être du thinking / des blocs web_search → prendre les text
  const text = (result.content ?? [])
    .filter((b: Record<string, unknown>) => b?.type === "text")
    .map((b: Record<string, unknown>) => b.text)
    .join("\n");
  let opinion: Record<string, unknown>;
  try {
    const jsonMatch = String(text).match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no JSON");
    opinion = JSON.parse(jsonMatch[0]);
  } catch {
    console.error("[ai-review] JSON introuvable dans la réponse:", String(text).slice(0, 300));
    opinion = { error: "parse_failed", raw: String(text).slice(0, 1500) };
  }
  opinion.model = MODEL;
  opinion.duration_ms = Date.now() - t0;
  opinion.pdf_lu = Boolean(pdfBlock);

  const { error: upErr } = await supabase.from("analyses").update({
    ai_review_opinion: opinion,
    ai_reviewed_at: new Date().toISOString(),
  }).eq("id", a.id);
  if (upErr) console.error("[ai-review] update:", upErr.message);

  console.log(`[ai-review] ${a.id.slice(0, 8)} terminé en ${Math.round((Date.now() - t0) / 1000)}s — accord=${opinion.accord_avec_ia ?? "?"} action=${opinion.action_recommandee ?? "?"}`);
}

Deno.serve(async (_req) => {
  if (!ANTHROPIC_API_KEY) {
    console.error("[ai-review] ANTHROPIC_API_KEY manquant");
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
