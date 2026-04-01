export const prerender = false;

/**
 * POST /api/analyse/[id]/conclusion
 *
 * Génère (ou retourne le cache de) la conclusion experte IA d'une analyse de devis.
 * Appelle Gemini pour produire :
 *   - Une phrase de verdict global
 *   - La liste des anomalies avec prix unitaires et surcoûts
 *   - La justification du reste du devis
 *
 * Stocke le résultat JSON dans analyses.conclusion_ia pour éviter de refacturer.
 */

import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import { jsonOk, jsonError, optionsResponse } from "@/lib/apiHelpers";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

import type { AnomalieConclusion, ConclusionData } from "@/lib/conclusionTypes";
export type { AnomalieConclusion, ConclusionData } from "@/lib/conclusionTypes";

// ── Helpers ───────────────────────────────────────────────────────────────────

const FORFAIT_UNIT_KEYWORDS = ["forfait", "global", "prestation", "ensemble", "installation complète"];
const FORFAIT_DESC_KEYWORDS = ["forfait", "forfait global", "prestation globale", "au forfait", "tout compris"];

function isForfaitGroup(g: any): boolean {
  const unit = (g.main_unit || "").toLowerCase().trim();
  if (FORFAIT_UNIT_KEYWORDS.some((kw) => unit === kw || unit.startsWith(kw))) return true;
  const lines: any[] = g.devis_lines || [];
  if (lines.length === 0) return false;
  const forfaitLines = lines.filter((l: any) => {
    const desc = (l.description || "").toLowerCase();
    const lineUnit = (l.unit || "").toLowerCase();
    return (
      FORFAIT_DESC_KEYWORDS.some((kw) => desc.includes(kw)) ||
      FORFAIT_UNIT_KEYWORDS.some((kw) => lineUnit === kw || lineUnit.startsWith(kw))
    );
  });
  return forfaitLines.length >= Math.ceil(lines.length * 0.6);
}

function buildGroupSummary(priceData: unknown[]): string {
  if (!Array.isArray(priceData) || priceData.length === 0) return "Aucune donnée de poste disponible.";

  return priceData
    .filter((g: any) => g.job_type_label !== "Autre" && g.devis_total_ht > 0)
    .map((g: any) => {
      const qty: number = g.main_quantity || 1;
      const unit: string = g.main_unit || "unité";
      const total: number = g.devis_total_ht || 0;
      const unitPrice: number = qty > 0 ? total / qty : 0;
      const prices: any[] = g.prices || [];
      const forfait = isForfaitGroup(g);

      const lignes: string = (g.devis_lines || [])
        .slice(0, 4)
        .map((l: any) => `"${l.description}"${l.amount_ht ? ` (${l.amount_ht}€)` : ""}`)
        .join(" | ");

      // Pour les forfaits globaux, on ne calcule PAS de fourchette unitaire
      // car la comparaison est non pertinente (prix global ≠ prix unitaire catalogue)
      if (forfait) {
        return [
          `POSTE: ${g.job_type_label} [FORFAIT GLOBAL — comparaison unitaire NON APPLICABLE]`,
          `  Facturation: forfait global`,
          `  Total devis: ${total.toFixed(0)} €`,
          `  Note: Ce poste est facturé en forfait. Le prix unitaire marché ne s'applique PAS ici.`,
          `  Lignes: ${lignes || "—"}`,
        ].join("\n");
      }

      // Poste à prix unitaire : calcul normal
      let minHT = 0;
      let maxHT = 0;
      let unitMin = 0;
      let unitMax = 0;
      for (const p of prices) {
        minHT  += (p.price_min_unit_ht || 0) * qty + (p.fixed_min_ht || 0);
        maxHT  += (p.price_max_unit_ht || 0) * qty + (p.fixed_max_ht || 0);
        unitMin += p.price_min_unit_ht || 0;
        unitMax += p.price_max_unit_ht || 0;
      }

      const hasMarket = prices.length > 0 && maxHT > 0;
      const ecartVsMax = hasMarket && maxHT > 0
        ? `${total > maxHT ? "+" : ""}${Math.round(((total - maxHT) / maxHT) * 100)}% vs max`
        : "hors catalogue";

      return [
        `POSTE: ${g.job_type_label}`,
        `  Quantité: ${qty} ${unit}`,
        `  Prix unitaire devis: ${unitPrice.toFixed(2)} €/${unit}`,
        `  Total devis: ${total.toFixed(0)} €`,
        hasMarket
          ? `  Référence marché unitaire: ${unitMin.toFixed(0)}–${unitMax.toFixed(0)} €/${unit} (total: ${minHT.toFixed(0)}–${maxHT.toFixed(0)} €)`
          : "  Référence marché: hors catalogue",
        `  Écart: ${ecartVsMax}`,
        `  Lignes: ${lignes || "—"}`,
      ].join("\n");
    })
    .join("\n\n");
}

// ── Main route ────────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ params, request }) => {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "").trim();
  if (!token) return jsonError("Non autorisé", 401);

  const supabaseUrl   = import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceKey    = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  const googleApiKey  = import.meta.env.GOOGLE_API_KEY;

  if (!supabaseUrl || !serviceKey) return jsonError("Configuration serveur manquante", 500);
  if (!googleApiKey) return jsonError("Clé IA manquante", 500);

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return jsonError("Non autorisé", 401);

  const analysisId = params.id!;

  // ── Récupère l'analyse ────────────────────────────────────────────────────
  const { data: analysis } = await (supabase as any)
    .from("analyses")
    .select("id, user_id, raw_text, resume, work_type, score, conclusion_ia")
    .eq("id", analysisId)
    .single();

  if (!analysis) return jsonError("Analyse introuvable", 404);
  if (analysis.user_id !== user.id) return jsonError("Accès refusé", 403);

  // ── Cache hit (sauf si force=true dans le body) ───────────────────────────
  let forceRegen = false;
  try {
    const body = await request.json().catch(() => ({}));
    forceRegen = body?.force === true;
  } catch { /* body vide ou non-JSON */ }

  if (!forceRegen && analysis.conclusion_ia) {
    try {
      const cached: ConclusionData = JSON.parse(analysis.conclusion_ia);
      // Valide que c'est bien une ConclusionData v2 (avec les nouveaux champs)
      if (cached.phrase_intro && cached.verdict_global && cached.verdict_decisionnel) {
        return jsonOk({ conclusion: cached, cached: true });
      }
      // Ancienne version sans verdict_decisionnel → régénère automatiquement
    } catch {
      // JSON corrompu → régénère
    }
  }

  // ── Parse raw_text ────────────────────────────────────────────────────────
  let priceData: unknown[] = [];
  let extractedData: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(analysis.raw_text || "{}");
    priceData       = Array.isArray(parsed.n8n_price_data) ? parsed.n8n_price_data : [];
    extractedData   = (parsed.extracted_data as Record<string, unknown>) || {};
  } catch {
    // raw_text invalide
  }

  const client   = (extractedData.client  as Record<string, unknown>) || {};
  const totaux   = (extractedData.totaux  as Record<string, unknown>) || {};
  const entreprise = (extractedData.entreprise as Record<string, unknown>) || {};

  const ville      = (client.ville      as string) || "";
  const codePostal = (client.code_postal as string) || "";
  const totalHT    = typeof totaux.ht  === "number" ? totaux.ht  : null;
  const totalTTC   = typeof totaux.ttc === "number" ? totaux.ttc : null;
  const tauxTVA    = typeof totaux.taux_tva === "number" ? totaux.taux_tva : null;
  const workType   = (analysis.work_type as string) || "";
  const resume     = (analysis.resume   as string) || "";
  const nomEntreprise = (entreprise.nom as string) || "";

  const groupsSummary = buildGroupSummary(priceData);

  // ── Prompt Gemini ─────────────────────────────────────────────────────────
  const userPrompt = `Tu es un expert en rénovation immobilière. Analyse ce devis et aide un particulier à décider s'il doit signer ou non.

CONTEXTE DU DEVIS:
- Entreprise: ${nomEntreprise || "inconnue"}
- Montant HT: ${totalHT ? `${totalHT.toLocaleString("fr-FR")} €` : "inconnu"}
- Montant TTC: ${totalTTC ? `${totalTTC.toLocaleString("fr-FR")} €` : "inconnu"}
- TVA: ${tauxTVA ? `${tauxTVA}%` : "inconnue"}
- Ville: ${ville || "inconnue"}${codePostal ? ` (${codePostal})` : ""}
- Type de travaux: ${workType || "rénovation"}
- Résumé du devis: ${resume || "non disponible"}

ANALYSE PAR POSTE (déjà calculée):
${groupsSummary}

MISSION — produis 6 éléments :

1. ANOMALIES RÉELLES : postes dont le prix unitaire est > 2× le max marché, ou incohérence description/prix flagrante (ex: "carrelage 30×30 standard" facturé au prix d'un carrelage premium).
   → Pour chaque anomalie : prix unitaire exact, fourchette attendue, surcoût estimé, explication courte.

2. JUSTIFICATIONS : en 1-2 phrases, ce qui explique le reste du prix (matériaux premium cohérents, complexité, étage, TVA réduite, etc.)

3. VERDICT DÉCISIONNEL (choisir UNE seule option) :
   - "signer" → prix cohérent, aucune anomalie réelle, risque faible, le particulier peut signer en confiance
   - "signer_avec_negociation" → quelques postes élevés mais le devis reste acceptable après négociation, risque modéré
   - "ne_pas_signer" → anomalies graves non justifiées OU surcoût > 15% du total OU incohérences majeures, risque élevé

4. SURCOÛT GLOBAL (fourchette min/max en €) :
   - Somme estimée des surcoûts récupérables par la négociation
   - min = estimation basse, max = estimation haute
   - Si aucune anomalie → min: 0, max: 0

5. NIVEAU DE RISQUE :
   - "faible" → devis cohérent, entreprise identifiée, prix dans le marché
   - "modéré" → quelques écarts, négociation utile, à surveiller
   - "élevé" → anomalies graves, incohérences multiples, risque financier réel

6. ACTIONS AVANT SIGNATURE (exactement 3 actions concrètes, formulées pour un particulier) :
   - Actions réalistes et actionnables IMMÉDIATEMENT (appel, email, demande de document)
   - Adaptées aux anomalies et au niveau de risque détectés
   - Ex: "Demandez à l'entreprise une facture fournisseur pour le carrelage CHICCO pour justifier le prix"
   - Si aucune anomalie, les actions portent sur les bonnes pratiques contractuelles

RÈGLES STRICTES:
- INTERDIT : signaler un poste marqué [FORFAIT GLOBAL] comme anomalie de prix. Un forfait global ne peut PAS être comparé à un prix unitaire catalogue. Ces postes sont à commenter uniquement si le montant total semble disproportionné au regard de la prestation décrite.
- NE PAS signaler comme anomalie ce qui s'explique par la localisation, l'étage, des matériaux premium COHÉRENTS, ou une complexité technique réelle.
- Surcoût = total_devis_poste − fourchette_max_marché (jamais négatif, 0 si dans la fourchette). Pour les forfaits : surcoût = 0 sauf incohérence flagrante sur le montant total.
- Si aucune anomalie → anomalies: [], has_anomalies: false, verdict_decisionnel: "signer" ou "signer_avec_negociation".
- Les 3 actions doivent être différentes et couvrir l'essentiel : vérification prix + négociation + protection juridique/technique.
- Sois factuel, direct, écris pour un particulier non-expert.

RÉPONDS UNIQUEMENT avec ce JSON (pas de texte avant ou après) :
{
  "verdict_global": "dans_la_norme | eleve_justifie | a_negocier | a_risque",
  "phrase_intro": "phrase complète d'une ligne : montant + ville + type projet + verdict (ex: '110 404 € HT pour une rénovation complète à Rennes — dans la fourchette haute du marché')",
  "anomalies": [
    {
      "poste": "nom exact du poste",
      "ligne_devis": "libellé exact de la ligne concernée",
      "prix_unitaire_devis": 27.72,
      "unite": "m²",
      "fourchette_min": 8,
      "fourchette_max": 12,
      "surcout_estime": 250,
      "explication": "explication courte (1 ligne max)"
    }
  ],
  "justifications": "phrase courte expliquant ce qui justifie le prix global",
  "has_anomalies": true,
  "verdict_decisionnel": "signer | signer_avec_negociation | ne_pas_signer",
  "surcout_global": { "min": 1200, "max": 2000 },
  "niveau_risque": "faible | modéré | élevé",
  "actions_avant_signature": [
    "Action 1 concrète et actionnable",
    "Action 2 concrète et actionnable",
    "Action 3 concrète et actionnable"
  ]
}`;

  // ── Appel Gemini ──────────────────────────────────────────────────────────
  let conclusionData: ConclusionData;
  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 30_000);

    const aiResponse = await fetch(GEMINI_URL, {
      method:  "POST",
      signal:  controller.signal,
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${googleApiKey}`,
      },
      body: JSON.stringify({
        model:           "gemini-2.0-flash",
        messages:        [{ role: "user", content: userPrompt }],
        response_format: { type: "json_object" },
        max_tokens:      4096,
        temperature:     0.1,
      }),
    });
    clearTimeout(timeoutId);

    if (!aiResponse.ok) {
      const details = await aiResponse.text().catch(() => "");
      const safe = details.replace(/Bearer\s+[a-zA-Z0-9_.-]+/gi, "Bearer ***").substring(0, 200);
      console.error("[conclusion] Gemini error:", aiResponse.status, safe);
      return jsonError("Le service d'analyse est temporairement indisponible", 502);
    }

    const aiResult  = await aiResponse.json();
    const content   = aiResult.choices?.[0]?.message?.content;
    if (!content) return jsonError("Réponse IA vide", 502);

    // Nettoyage robuste JSON
    let jsonStr = content.trim();
    const blockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (blockMatch) jsonStr = blockMatch[1].trim();
    const start = jsonStr.indexOf("{");
    const end   = jsonStr.lastIndexOf("}");
    if (start !== -1 && end > start) jsonStr = jsonStr.slice(start, end + 1);

    // Vérification troncature (JSON mal fermé = max_tokens atteint)
    if (!jsonStr.endsWith("}")) {
      console.error("[conclusion] JSON tronqué — max_tokens probablement atteint. Longueur:", jsonStr.length);
      return jsonError("La réponse IA est incomplète. Réessayez.", 502);
    }

    const parsed = JSON.parse(jsonStr);

    // ── Normalisation & sanitisation ─────────────────────────────────────────
    const validVerdicts    = ["dans_la_norme", "eleve_justifie", "a_negocier", "a_risque"] as const;
    const validDecisions   = ["signer", "signer_avec_negociation", "ne_pas_signer"] as const;
    const validRisques     = ["faible", "modéré", "élevé"] as const;

    const sanitizedAnomalies: AnomalieConclusion[] = Array.isArray(parsed.anomalies)
      ? parsed.anomalies
          .filter((a: any) => a && typeof a === "object" && a.poste)
          .map((a: any): AnomalieConclusion => ({
            poste:               String(a.poste        || ""),
            ligne_devis:         String(a.ligne_devis  || a.poste || ""),
            prix_unitaire_devis: typeof a.prix_unitaire_devis === "number" ? a.prix_unitaire_devis : 0,
            unite:               String(a.unite        || "unité"),
            fourchette_min:      typeof a.fourchette_min  === "number" ? a.fourchette_min  : null,
            fourchette_max:      typeof a.fourchette_max  === "number" ? a.fourchette_max  : null,
            surcout_estime:      typeof a.surcout_estime  === "number" ? a.surcout_estime  : null,
            explication:         typeof a.explication     === "string" ? a.explication.trim() : null,
          }))
      : [];

    // Surcoût global : utilise la réponse IA si valide, sinon recalcule depuis les anomalies
    const rawSurcout = parsed.surcout_global;
    const surcoutMin = (rawSurcout && typeof rawSurcout.min === "number" && rawSurcout.min >= 0)
      ? rawSurcout.min
      : Math.round(sanitizedAnomalies.reduce((s, a) => s + (a.surcout_estime ?? 0), 0) * 0.7);
    const surcoutMax = (rawSurcout && typeof rawSurcout.max === "number" && rawSurcout.max >= 0)
      ? rawSurcout.max
      : Math.round(sanitizedAnomalies.reduce((s, a) => s + (a.surcout_estime ?? 0), 0) * 1.3);

    // Actions : garde exactement 3, complète avec des valeurs par défaut si nécessaire
    const rawActions: string[] = Array.isArray(parsed.actions_avant_signature)
      ? parsed.actions_avant_signature
          .filter((a: unknown) => typeof a === "string" && a.trim().length > 0)
          .map((a: string) => a.trim())
          .slice(0, 3)
      : [];
    const DEFAULT_ACTIONS = [
      "Vérifiez les assurances décennale et RC Pro de l'entreprise avant de signer.",
      "Demandez un échéancier de paiement détaillé et ne versez pas plus de 30 % à la commande.",
      "Faites inscrire dans le contrat la date de début et la durée prévisionnelle des travaux.",
    ];
    while (rawActions.length < 3) rawActions.push(DEFAULT_ACTIONS[rawActions.length]);

    conclusionData = {
      verdict_global:          validVerdicts.includes(parsed.verdict_global)   ? parsed.verdict_global   : "a_negocier",
      phrase_intro:            typeof parsed.phrase_intro  === "string" ? parsed.phrase_intro.trim()  : "",
      anomalies:               sanitizedAnomalies,
      justifications:          typeof parsed.justifications === "string" ? parsed.justifications.trim() : "",
      has_anomalies:           sanitizedAnomalies.length > 0,
      verdict_decisionnel:     validDecisions.includes(parsed.verdict_decisionnel)   ? parsed.verdict_decisionnel   : "signer_avec_negociation",
      surcout_global:          { min: surcoutMin, max: surcoutMax },
      niveau_risque:           validRisques.includes(parsed.niveau_risque)     ? parsed.niveau_risque     : "modéré",
      actions_avant_signature: rawActions,
      generated_at:            new Date().toISOString(),
    };

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    if (msg.includes("abort") || msg.includes("AbortError")) {
      return jsonError("L'analyse a pris trop de temps. Réessayez.", 504);
    }
    if (msg.includes("JSON") || msg.includes("SyntaxError") || msg.includes("parse")) {
      console.error("[conclusion] JSON parse error:", msg);
      return jsonError("La réponse IA était malformée. Réessayez.", 502);
    }
    console.error("[conclusion] Unexpected error:", msg);
    return jsonError("Erreur inattendue. Réessayez.", 502);
  }

  // ── Persistance ───────────────────────────────────────────────────────────
  await (supabase as any)
    .from("analyses")
    .update({ conclusion_ia: JSON.stringify(conclusionData) })
    .eq("id", analysisId);

  return jsonOk({ conclusion: conclusionData, cached: false });
};

export const OPTIONS: APIRoute = () => optionsResponse("POST,OPTIONS");
