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
const PDF_MAX_BYTES = 8 * 1024 * 1024; // marge sous la limite requête API
// 2026-08-29 — au-delà de ce nombre de lignes, on renonce au PDF : sur le
// devis 25030 (82 lignes, 219 k€) la lecture des pages faisait dépasser le
// plafond de temps des fonctions edge, même en effort low (3 tentatives, 3
// abandons). L'extraction du pipeline (déjà dans le prompt) prend le relais ;
// la recherche web est conservée, c'est elle qui casse la circularité.
const BIG_QUOTE_LINES = 55;

function b64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

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
  const isBigQuote = priceData.length > BIG_QUOTE_LINES;
  if (isBigQuote) {
    console.log("[ai-review] gros devis (" + priceData.length + " lignes) — relecture sans PDF (budget edge)");
  }
  if (a.file_path && !isBigQuote) {
    try {
      const { data: dl } = await supabase.storage.from("devis").download(a.file_path);
      if (dl && dl.size <= PDF_MAX_BYTES && (dl.type ?? "").includes("pdf")) {
        const bytes = new Uint8Array(await dl.arrayBuffer());
        pdfBlock = {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: b64(bytes) },
        };
      } else if (dl && dl.size > PDF_MAX_BYTES) {
        console.log(`[ai-review] PDF trop lourd (${dl.size}o) — relecture sans document`);
      }
    } catch (e) {
      console.log("[ai-review] download PDF échoué:", e instanceof Error ? e.message : e);
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
      // Mode rapide Opus 5 (research preview) : même modèle, sortie jusqu'à
      // 2,5× plus rapide — décisif pour tenir dans le budget des edge functions.
      "anthropic-beta": "fast-mode-2026-02-01",
    },
    body: JSON.stringify({
      model: MODEL,
      speed: "fast",
      max_tokens: 5000,
      // 2026-08-29 — budget resserré une 2e fois : un devis de 82 lignes
      // (219 k€, cas NAZON/25030) dépassait encore le plafond edge (~400 s)
      // en effort medium. effort low + 2 recherches suffisent pour un avis
      // structuré et ramènent l'appel sous les 2 minutes. Le grounding web
      // est conservé — c'est lui qui casse la circularité.
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
    }
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
        ai_review_opinion: { error: "timeout_edge", detail: `abandon après ${MAX_ATTEMPTS} tentatives (devis trop lourd pour le budget edge)` },
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
