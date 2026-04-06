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

/**
 * Calcule le surcoût total côté serveur depuis les données brutes priceData,
 * en utilisant la même formule que quoteGlobalAnalysis.ts (côté client).
 * Garantit la cohérence entre GlobalAnalysisCard et ConclusionIA.
 *
 * Surcoût = Σ (devis_total_ht − theoreticalMaxHT) pour les postes où devis > max
 * theoreticalMaxHT = Σ (price_max_unit_ht × qty + fixed_max_ht)
 */
function computeServerSurcout(priceData: unknown[]): { min: number; max: number } {
  if (!Array.isArray(priceData)) return { min: 0, max: 0 };

  let surcoutEstime = 0;

  for (const g of priceData) {
    if (!g || typeof g !== "object") continue;
    const group = g as Record<string, any>;

    if (group.job_type_label === "Autre") continue;

    const devisTotal: number = typeof group.devis_total_ht === "number" ? group.devis_total_ht : 0;
    if (devisTotal <= 0) continue;

    const prices: any[] = Array.isArray(group.prices) ? group.prices : [];
    if (prices.length === 0) continue;

    // Exclure les forfaits (comparaison non fiable)
    const unit = ((group.main_unit as string) || "").toLowerCase().trim();
    if (FORFAIT_UNIT_KEYWORDS.some((kw) => unit === kw || unit.startsWith(kw))) continue;

    const qty: number = typeof group.main_quantity === "number" && group.main_quantity > 0
      ? group.main_quantity : 1;

    // Calcule theoreticalMaxHT (identique à useMarketPriceAPI.ts)
    let theoreticalMaxHT = 0;
    for (const p of prices) {
      theoreticalMaxHT +=
        (typeof p.price_max_unit_ht === "number" ? p.price_max_unit_ht : 0) * qty +
        (typeof p.fixed_max_ht      === "number" ? p.fixed_max_ht      : 0);
    }
    if (theoreticalMaxHT <= 0) continue;

    if (devisTotal > theoreticalMaxHT) {
      surcoutEstime += devisTotal - theoreticalMaxHT;
    }
  }

  return {
    min: Math.round(surcoutEstime * 0.7),
    max: Math.round(surcoutEstime * 1.3),
  };
}
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
   - "signer_avec_negociation" → 1 anomalie isolée OU quelques postes élevés mais le reste du devis est acceptable — la négociation suffit à corriger l'écart
   - "ne_pas_signer" → UNIQUEMENT si : 2 anomalies ou plus ET non justifiées, OU surcoût > 30% du total HT, OU incohérences majeures sur plusieurs postes. UNE seule anomalie isolée ne justifie PAS "ne_pas_signer" sauf si elle représente à elle seule > 50% du total HT.

4. SURCOÛT GLOBAL (fourchette min/max en €) :
   - Formule : Σ (total_devis_poste − total_fourchette_max_marché) pour chaque poste anormal.
   - IMPORTANT : utilise les TOTAUX HT (chiffre entre parenthèses "total: X–Y €"), PAS les prix unitaires.
   - Exemple : poste à 12 275€ avec fourchette marché total 900–2800€ → surcoût = 12 275 − 2 800 = 9 475€.
   - min = somme brute × 0.7 (hypothèse basse), max = somme brute × 1.3 (hypothèse haute).
   - Si aucune anomalie → min: 0, max: 0.

5. NIVEAU DE RISQUE — DOIT être cohérent avec verdict_global (règle stricte) :
   - verdict_global "dans_la_norme" → niveau_risque: "faible"
   - verdict_global "eleve_justifie" → niveau_risque: "modéré"
   - verdict_global "a_negocier"    → niveau_risque: "modéré"
   - verdict_global "a_risque"      → niveau_risque: "élevé" (OBLIGATOIRE)

6. ACTIONS AVANT SIGNATURE (exactement 3 actions concrètes, formulées pour un particulier) :
   - Actions réalistes et actionnables IMMÉDIATEMENT (appel, email, demande de document)
   - Adaptées aux anomalies et au niveau de risque détectés
   - Ex: "Demandez à l'entreprise une facture fournisseur pour le carrelage CHICCO pour justifier le prix"
   - Si aucune anomalie, les actions portent sur les bonnes pratiques contractuelles

RÈGLES STRICTES:
- INTERDIT : signaler un poste marqué [FORFAIT GLOBAL] comme anomalie de prix. Un forfait global ne peut PAS être comparé à un prix unitaire catalogue. Ces postes sont à commenter uniquement si le montant total semble disproportionné au regard de la prestation décrite.
- NE PAS signaler comme anomalie ce qui s'explique par la localisation, l'étage, des matériaux premium COHÉRENTS, ou une complexité technique réelle.
- Surcoût = total_devis_poste − total_fourchette_max_marché (TOTAUX, jamais prix unitaires). Jamais négatif, 0 si dans la fourchette. Pour les forfaits : surcoût = 0 sauf incohérence flagrante sur le montant total.
- COHÉRENCE OBLIGATOIRE : verdict_global et niveau_risque DOIVENT être alignés (voir règle 5). Ne jamais retourner "a_risque" avec niveau_risque "modéré" ou "faible".
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

    // Surcoût global — source de vérité : calcul serveur (miroir de quoteGlobalAnalysis.ts)
    // Le calcul serveur est plus fiable que Gemini qui confond prix unitaires et totaux.
    const serverSurcout = computeServerSurcout(priceData);
    const surcoutMin = serverSurcout.max > 0
      ? serverSurcout.min
      : (() => {
          const rawSurcout = parsed.surcout_global;
          return (rawSurcout && typeof rawSurcout.min === "number" && rawSurcout.min >= 0)
            ? rawSurcout.min
            : Math.round(sanitizedAnomalies.reduce((s, a) => s + (a.surcout_estime ?? 0), 0) * 0.7);
        })();
    const surcoutMax = serverSurcout.max > 0
      ? serverSurcout.max
      : (() => {
          const rawSurcout = parsed.surcout_global;
          return (rawSurcout && typeof rawSurcout.max === "number" && rawSurcout.max >= 0)
            ? rawSurcout.max
            : Math.round(sanitizedAnomalies.reduce((s, a) => s + (a.surcout_estime ?? 0), 0) * 1.3);
        })();

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

    const verdictGlobal    = validVerdicts.includes(parsed.verdict_global)       ? parsed.verdict_global       : "a_negocier";
    const phraseIntro      = typeof parsed.phrase_intro  === "string"            ? parsed.phrase_intro.trim()  : "";
    const justifications   = typeof parsed.justifications === "string"           ? parsed.justifications.trim() : "";
    let   verdictDecision  = validDecisions.includes(parsed.verdict_decisionnel) ? parsed.verdict_decisionnel  : "signer_avec_negociation";

    // ── Cohérence forcée : niveau_risque DOIT correspondre à verdict_global ──
    // Gemini génère parfois "a_risque" + "modéré" ou "a_negocier" + "élevé" de façon incohérente.
    const RISQUE_FORCED: Record<string, "faible" | "modéré" | "élevé"> = {
      dans_la_norme:  "faible",
      eleve_justifie: "modéré",
      a_negocier:     "modéré",
      a_risque:       "élevé",
    };
    const niveauRisque: "faible" | "modéré" | "élevé" = RISQUE_FORCED[verdictGlobal] ?? "modéré";

    // ── Cohérence verdict_decisionnel ──────────────────────────────────────────
    // Empêche "signer" avec un verdict négatif, et "ne_pas_signer" sur un verdict correct
    if (verdictGlobal === "dans_la_norme") {
      verdictDecision = "signer";
    } else if ((verdictGlobal === "a_negocier" || verdictGlobal === "eleve_justifie") && verdictDecision === "signer") {
      verdictDecision = "signer_avec_negociation";
    } else if (verdictGlobal === "a_risque") {
      // "ne_pas_signer" uniquement si 2+ anomalies réelles ou surcoût > 30% du total HT
      const totalHTNum = typeof totalHT === "number" ? totalHT : 0;
      const surcoutRatio = totalHTNum > 0 ? surcoutMax / totalHTNum : 0;
      if (sanitizedAnomalies.length >= 2 || surcoutRatio > 0.30) {
        verdictDecision = "ne_pas_signer";
      } else {
        // 1 seule anomalie → on recommande de négocier, pas de bloquer
        if (verdictDecision === "signer") verdictDecision = "signer_avec_negociation";
      }
    }

    conclusionData = {
      verdict_global:          verdictGlobal,
      phrase_intro:            phraseIntro,
      anomalies:               sanitizedAnomalies,
      justifications,
      has_anomalies:           sanitizedAnomalies.length > 0,
      verdict_decisionnel:     verdictDecision as "signer" | "signer_avec_negociation" | "ne_pas_signer",
      surcout_global:          { min: surcoutMin, max: surcoutMax },
      niveau_risque:           niveauRisque,
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
