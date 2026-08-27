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

function b64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

Deno.serve(async (_req) => {
  if (!ANTHROPIC_API_KEY) {
    console.error("[ai-review] ANTHROPIC_API_KEY manquant");
    return new Response(JSON.stringify({ ok: false, error: "missing key" }), { status: 500 });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1 analyse par run (l'appel Claude + web search peut prendre 1-2 min)
  const { data: pending, error } = await supabase
    .from("analyses")
    .select("id, file_name, file_path, raw_text, conclusion_ia, score, created_at")
    .eq("review_status", "pending_review")
    .is("ai_reviewed_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) {
    console.error("[ai-review] select:", error.message);
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
  if (!pending?.length) {
    return new Response(JSON.stringify({ ok: true, reviewed: 0 }));
  }
  const a = pending[0];
  console.log(`[ai-review] relecture ${a.id.slice(0, 8)} — ${a.file_name}`);

  // ── Contexte pipeline ────────────────────────────────────────────────────
  let raw: Record<string, unknown> = {};
  try { raw = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : (a.raw_text ?? {}); } catch { /* vide */ }
  const ci = (() => {
    try { return typeof a.conclusion_ia === "string" ? JSON.parse(a.conclusion_ia) : a.conclusion_ia; } catch { return null; }
  })();
  const scoring = (raw.scoring ?? {}) as Record<string, unknown>;
  const priceData = Array.isArray(raw.n8n_price_data) ? raw.n8n_price_data as Array<Record<string, any>> : [];
  const groupsSummary = priceData.slice(0, 60).map((g) => {
    const p = g.prices?.[0] ?? {};
    const conf = g.vectorial?.confidence ?? "legacy";
    const desc = (g.devis_lines?.[0]?.description ?? "").slice(0, 70);
    return `- "${desc}" ${g.devis_total_ht ?? "?"}€ → match "${g.job_type_label ?? "aucun"}" [${conf}] marché ${p.price_min ?? p.min ?? "?"}-${p.price_max ?? p.max ?? "?"}€/${p.unit ?? "?"}`;
  }).join("\n");

  // ── PDF source ───────────────────────────────────────────────────────────
  let pdfBlock: Record<string, unknown> | null = null;
  if (a.file_path) {
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
1. Lis le devis PDF joint (source de vérité — pas l'extraction).
2. Identifie les 2 à 4 postes les plus déterminants (les plus chers ou les plus douteux) et VÉRIFIE leurs prix avec la recherche web (prix France 2026, sources récentes). Cite tes sources.
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
      max_tokens: 16000,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
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
    return new Response(JSON.stringify({ ok: false }), { status: 502 });
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
  return new Response(JSON.stringify({ ok: true, reviewed: 1, analysis: a.id }));
});
