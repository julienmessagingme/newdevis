export const prerender = false;
export const config = { maxDuration: 60 };

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
import {
  computeVerdict, computeMarketBounds, countMajorAnomalies,
  extractFlagsFromCriteria, extractCompanyRisk, generateVerdictReasons,
} from "@/lib/verdictEngine";

// ── Helpers ───────────────────────────────────────────────────────────────────

// "f" et "fft" = abréviations françaises de "forfait" courantes dans les devis BTP
const FORFAIT_UNIT_KEYWORDS = ["forfait", "global", "prestation", "ensemble", "installation complète", "f", "fft", "ff", "ens"];

// Postes dont la comparaison marché se fait en m² mais que l'artisan peut facturer en U/forfait
const SURFACE_WORK_KEYWORDS = [
  "cloison", "doublage", "contre-cloison", "peinture", "enduit", "lasure",
  "carrelage", "faïence", "parquet", "plancher", "ragréage", "chape",
  "isolation", "isol", "plafond", "toile de verre", "papier peint",
  "revêtement sol", "revêtement mur", "sol stratifié", "moquette",
];
// Équipements/appareils vendus naturellement à l'unité → jamais en m²
const EQUIPMENT_KEYWORDS = [
  "chauffe-eau", "chauffe eau", "cumulus", "ballon",
  "climatisation", "climatiseur", "clim", "split",
  "pompe à chaleur", "pompe a chaleur", "pac",
  "radiateur", "convecteur", "sèche-serviette", "seche serviette",
  "chaudière", "chaudiere", "poêle", "poele",
  "ventilation", "vmc", "extracteur",
  "robinet", "mitigeur", "sanitaire", "wc", "toilette",
  "porte", "fenêtre", "fenetre", "baie", "volet",
  "tableau électrique", "tableau electrique", "disjoncteur",
];
const M2_UNITS = ["m²", "m2", "m ²", "mètre carré", "metre carre", "m2 ht", "m² ht"];
const UNIT_LIKE = ["u", "unité", "unité", "unite", "forfait", "ens", "ensemble",
                   "prestation", "pce", "pièce", "piece", "lot", "global", "art", "article"];

/**
 * Extrait la surface totale en m² connue depuis les lignes du groupe.
 * Cherche les lignes ayant une unité m² avec une quantité positive.
 * Retourne null si aucune surface explicite trouvée.
 */
function extractKnownSurface(lines: any[]): number | null {
  let total = 0;
  for (const l of lines) {
    const u = (l.unit || l.unite || "").toLowerCase().trim();
    const qty = typeof l.quantity === "number" ? l.quantity
      : typeof l.quantite === "number" ? l.quantite : 0;
    if (qty > 0 && M2_UNITS.some(m => u.includes(m))) {
      total += qty;
    }
  }
  return total > 0 ? total : null;
}

function hasSurfaceUnitMismatch(group: Record<string, any>): boolean {
  const label = (group.job_type_label || "").toLowerCase();
  const unit  = (group.main_unit || "").toLowerCase().trim();
  const lines: any[] = group.devis_lines || [];

  // Exclure les équipements vendus à l'unité par nature
  if (EQUIPMENT_KEYWORDS.some(kw => label.includes(kw))) return false;
  // Vérifier aussi dans les lignes du groupe (au cas où le label Gemini est générique)
  const allDescriptions = lines.map((l: any) => (l.description || "").toLowerCase()).join(" ");
  if (EQUIPMENT_KEYWORDS.some(kw => allDescriptions.includes(kw))) return false;

  // Le poste doit être de nature surfacique (label OU lignes)
  const isSurfaceWork = SURFACE_WORK_KEYWORDS.some(kw => label.includes(kw)) ||
    lines.some((l: any) => SURFACE_WORK_KEYWORDS.some(kw =>
      (l.description || "").toLowerCase().includes(kw)
    ));
  if (!isSurfaceWork) return false;

  // L'unité ne doit PAS être m²
  const isM2 = M2_UNITS.some(u => unit.includes(u));
  const isUnitLike = UNIT_LIKE.some(u => unit === u || unit.startsWith(u + " "));
  if (!(!isM2 && isUnitLike)) return false;

  // Si la surface est explicitement connue via une ligne m² dans le groupe, pas de mismatch
  const knownSurface = extractKnownSurface(lines);
  if (knownSurface !== null) return false;

  return true;
}

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

    // Exclure les forfaits et les mismatches surface/unité (comparaison non fiable)
    const unit = ((group.main_unit as string) || "").toLowerCase().trim();
    if (FORFAIT_UNIT_KEYWORDS.some((kw) => unit === kw || unit.startsWith(kw))) continue;
    if (hasSurfaceUnitMismatch(group)) continue;

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
// ── Sanitisation texte LLM ───────────────────────────────────────────────────

/**
 * Supprime les formulations contradictoires avec le verdict dans les textes générés par Gemini.
 * Appelé AVANT toute persistance ou affichage.
 *
 * Règle : si le verdict n'est pas "signer", les termes validants sont interdits.
 */
function sanitizeLLMText(text: string, verdict: "signer" | "a_negocier" | "refuser"): string {
  if (!text || verdict === "signer") return text;

  // Termes interdits quand verdict ≠ signer (ordre : du plus spécifique au plus générique)
  const FORBIDDEN: Array<[RegExp, string]> = [
    [/vous pouvez (signer|procéder|valider)/gi,  "vous pouvez négocier ce devis"],
    [/\bbon devis\b/gi,                           "devis à vérifier"],
    [/\bdevis (est |semble |paraît )?(correct|acceptable|conforme|cohérent)\b/gi,
                                                  "devis présente des écarts"],
    [/\bprix (est |semble |paraît )?(correct|acceptable|conforme|cohérent|dans la norme)\b/gi,
                                                  "prix présente des écarts"],
    [/\b(est |semble |paraît )(correct|acceptable|conforme|cohérent)\b/gi,
                                                  "présente des écarts"],
    [/\bprix (est |reste )?(justifié|raisonnable|normal)\b/gi,
                                                  "prix est à négocier"],
    [/\bpas d['']anomalie\b/gi,                   "des points à vérifier"],
    [/\baucune anomalie\b/gi,                     "des points à vérifier"],
  ];

  let result = text;
  for (const [pattern, replacement] of FORBIDDEN) {
    result = result.replace(pattern, replacement);
  }
  return result;
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

interface MarketPosition {
  isBelowAverage: boolean;
  isAboveMax: boolean;
  globalLabel: "inférieur_au_marché" | "dans_la_norme" | "au_dessus_de_la_moyenne" | "au_dessus_du_max" | "hors_catalogue";
  totalDevis: number;
  totalMarketMin: number;
  totalMarketAvg: number;
  totalMarketMax: number;
}

function computeServerMarketPosition(priceData: unknown[]): MarketPosition {
  if (!Array.isArray(priceData)) return { isBelowAverage: false, isAboveMax: false, globalLabel: "hors_catalogue", totalDevis: 0, totalMarketMin: 0, totalMarketAvg: 0, totalMarketMax: 0 };

  let totalDevis = 0;
  let totalMarketMin = 0;
  let totalMarketAvg = 0;
  let totalMarketMax = 0;
  let hasMarketData = false;

  for (const g of priceData) {
    if (!g || typeof g !== "object") continue;
    const group = g as Record<string, any>;
    if (group.job_type_label === "Autre") continue;
    if (isForfaitGroup(group)) continue;
    if (hasSurfaceUnitMismatch(group)) continue;

    const devisTotal: number = typeof group.devis_total_ht === "number" ? group.devis_total_ht : 0;
    if (devisTotal <= 0) continue;

    const prices: any[] = Array.isArray(group.prices) ? group.prices : [];
    if (prices.length === 0) continue;

    const qty: number = typeof group.main_quantity === "number" && group.main_quantity > 0 ? group.main_quantity : 1;

    let minHT = 0;
    let maxHT = 0;
    for (const p of prices) {
      minHT += (typeof p.price_min_unit_ht === "number" ? p.price_min_unit_ht : 0) * qty + (typeof p.fixed_min_ht === "number" ? p.fixed_min_ht : 0);
      maxHT += (typeof p.price_max_unit_ht === "number" ? p.price_max_unit_ht : 0) * qty + (typeof p.fixed_max_ht === "number" ? p.fixed_max_ht : 0);
    }
    if (maxHT <= 0) continue;

    hasMarketData = true;
    totalDevis     += devisTotal;
    totalMarketMin += minHT;
    totalMarketMax += maxHT;
    totalMarketAvg += (minHT + maxHT) / 2;
  }

  if (!hasMarketData || totalMarketMax <= 0) {
    return { isBelowAverage: false, isAboveMax: false, globalLabel: "hors_catalogue", totalDevis, totalMarketMin, totalMarketAvg, totalMarketMax };
  }

  const isBelowAverage = totalDevis < totalMarketAvg;
  const isBelowMin     = totalDevis < totalMarketMin;
  const isAboveMax     = totalDevis > totalMarketMax;
  const isAboveAvg     = totalDevis > totalMarketAvg;

  let globalLabel: MarketPosition["globalLabel"];
  if (isBelowMin || isBelowAverage) globalLabel = "inférieur_au_marché";
  else if (isAboveMax)               globalLabel = "au_dessus_du_max";
  else if (isAboveAvg)               globalLabel = "au_dessus_de_la_moyenne";
  else                               globalLabel = "dans_la_norme";

  return { isBelowAverage, isAboveMax, globalLabel, totalDevis, totalMarketMin, totalMarketAvg, totalMarketMax };
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

      // Mismatch surface/unité : l'artisan a facturé en U/forfait un poste normalement en m²
      // → la comparaison unitaire est impossible, on signale explicitement
      if (hasSurfaceUnitMismatch(g)) {
        return [
          `POSTE: ${g.job_type_label} [⚠️ MISMATCH UNITÉ — comparaison impossible]`,
          `  Facturation: ${qty} ${unit} (mais le catalogue raisonne en m²)`,
          `  Total devis: ${total.toFixed(0)} €`,
          `  ⚠️ IMPORTANT: L'unité "${unit}" est incompatible avec le catalogue m². NE PAS signaler ce poste comme anomalie de prix. Action requise : demander la surface en m² à l'artisan pour pouvoir comparer.`,
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
      const avgHT = (minHT + maxHT) / 2;

      const hasMarket = prices.length > 0 && maxHT > 0;
      const ecartVsAvg = hasMarket && avgHT > 0
        ? `${total > avgHT ? "+" : ""}${Math.round(((total - avgHT) / avgHT) * 100)}% vs moyenne`
        : "hors catalogue";
      const positionLabel = hasMarket
        ? total < minHT ? " [TRÈS BAS — sous le min marché]"
          : total < avgHT ? " [BAS — sous la moyenne marché]"
          : total > maxHT ? " [ÉLEVÉ — au-dessus du max marché]"
          : total > avgHT ? " [LÉGÈREMENT ÉLEVÉ — au-dessus de la moyenne]"
          : ""
        : "";

      return [
        `POSTE: ${g.job_type_label}${positionLabel}`,
        `  Quantité: ${qty} ${unit}`,
        `  Prix unitaire devis: ${unitPrice.toFixed(2)} €/${unit}`,
        `  Total devis: ${total.toFixed(0)} €`,
        hasMarket
          ? `  Référence marché unitaire: ${unitMin.toFixed(0)}–${unitMax.toFixed(0)} €/${unit} (total: ${minHT.toFixed(0)}–${maxHT.toFixed(0)} €, moyenne: ${avgHT.toFixed(0)} €)`
          : "  Référence marché: hors catalogue",
        `  Écart vs moyenne: ${ecartVsAvg}`,
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

  // ── Parse scoring (critères rouges + oranges pour verdictEngine) ────────────
  let criteres_rouges: string[]  = [];
  let criteres_oranges: string[] = [];
  let entreprise_radiee = false;
  try {
    const scoreData = typeof analysis.score === "string"
      ? JSON.parse(analysis.score)
      : (analysis.score as Record<string, unknown>) || {};
    criteres_rouges  = Array.isArray(scoreData.criteres_rouges)  ? scoreData.criteres_rouges  : [];
    criteres_oranges = Array.isArray(scoreData.criteres_oranges) ? scoreData.criteres_oranges : [];
    entreprise_radiee = criteres_rouges.some((r: string) => r.toLowerCase().includes("radié"));
  } catch {
    // score invalide
  }

  const client   = (extractedData.client  as Record<string, unknown>) || {};
  const totaux   = (extractedData.totaux  as Record<string, unknown>) || {};
  const entreprise = (extractedData.entreprise as Record<string, unknown>) || {};
  const dates    = (extractedData.dates   as Record<string, unknown>) || {};

  const ville      = (client.ville      as string) || "";
  const codePostal = (client.code_postal as string) || "";
  const totalHT    = typeof totaux.ht  === "number" ? totaux.ht  : null;
  const totalTTC   = typeof totaux.ttc === "number" ? totaux.ttc : null;
  const tauxTVA    = typeof totaux.taux_tva === "number" ? totaux.taux_tva : null;
  const workType   = (analysis.work_type as string) || "";
  const resume     = (analysis.resume   as string) || "";
  const nomEntreprise = (entreprise.nom as string) || "";

  // Devis ancien : calcul âge pour avertissement
  let devisAgeWarning = "";
  const dateDevis = typeof dates.date_devis === "string" ? dates.date_devis : null;
  if (dateDevis) {
    const devisDate = new Date(dateDevis);
    const now = new Date();
    const ageMonths = (now.getFullYear() - devisDate.getFullYear()) * 12 + (now.getMonth() - devisDate.getMonth());
    if (ageMonths > 12) {
      devisAgeWarning = `⚠️ DEVIS ANCIEN : ce devis date de ${devisDate.getFullYear()} (${Math.floor(ageMonths / 12)} an${Math.floor(ageMonths / 12) > 1 ? "s" : ""} environ). Les prix des matériaux et de la main d'œuvre ont évolué depuis — la comparaison au marché est indicative, pas définitive. Mentionner ce point explicitement dans la conclusion.`;
    }
  }

  const groupsSummary  = buildGroupSummary(priceData);
  const marketPosition = computeServerMarketPosition(priceData);

  // ── Verdict déterministe PRÉ-CALCULÉ (injecté dans le prompt) ───────────────
  // Le moteur tourne AVANT Gemini pour contraindre le LLM, pas après.
  const preMarketBounds   = computeMarketBounds(priceData);
  const preMajorAnomalies = countMajorAnomalies(priceData);
  const preFlags          = extractFlagsFromCriteria(criteres_rouges, criteres_oranges);
  const preRisk           = extractCompanyRisk(criteres_rouges, criteres_oranges);
  const preAvgMarket = (preMarketBounds.min + preMarketBounds.max) / 2;
  const preDispersion = preAvgMarket > 0
    ? (preMarketBounds.max - preMarketBounds.min) / preAvgMarket : 0;

  const preEngine         = computeVerdict({
    total_amount:          typeof totalHT === "number" ? totalHT : 0,
    market_estimate_min:   preMarketBounds.min,
    market_estimate_max:   preMarketBounds.max,
    anomalies_major_count: preMajorAnomalies,
    anomalies_total_count: preMajorAnomalies,
    company_risk:          preRisk,
    flags:                 preFlags,
    market_dispersion_pct: preDispersion,
    // chantier_complexity : V2 — non disponible encore, fallback "medium" automatique
  });

  // Mapping engine verdict → labels lisibles dans le prompt LLM
  const ENGINE_DECISION_LABEL: Record<string, string> = {
    signer:    "signer",
    a_negocier: "signer_avec_negociation",
    refuser:   "ne_pas_signer",
  };
  const ENGINE_GLOBAL_LABEL: Record<string, string> = {
    signer:    "dans_la_norme",
    a_negocier: "a_negocier",
    refuser:   "a_risque",
  };
  const imposedDecision = ENGINE_DECISION_LABEL[preEngine.verdict] ?? "signer_avec_negociation";
  const imposedGlobal   = ENGINE_GLOBAL_LABEL[preEngine.verdict]   ?? "a_negocier";

  const verdictImposedBlock = `
VERDICT IMPOSÉ PAR LE MOTEUR DÉTERMINISTE:
- verdict_decisionnel: "${imposedDecision}"
- verdict_global: "${imposedGlobal}"
- Surcoût estimé: ${preEngine.overprice > 0 ? `+${Math.round(preEngine.overprice_pct * 100)}% vs moyenne marché (${Math.round(preEngine.overprice).toLocaleString("fr-FR")} €)` : "dans la norme ou sous la moyenne"}
- Seuil de tolérance appliqué: ${Math.round(preEngine.threshold_ok * 100)}%${preEngine.is_hard_block ? "\n- HARD BLOCK ACTIF (entreprise radiée ou paiement suspect)" : ""}

RÈGLES ABSOLUES (ne pas déroger):
1. Tu DOIS produire exactement verdict_decisionnel="${imposedDecision}" et verdict_global="${imposedGlobal}".
2. INTERDIT de contredire ce verdict dans phrase_intro, justifications ou actions_avant_signature.
3. Si verdict_decisionnel="ne_pas_signer" → INTERDIT d'écrire des phrases comme "vous pouvez signer", "le devis est acceptable", "le prix est cohérent".
4. Si verdict_decisionnel="signer" → INTERDIT de recommander de "négocier le prix" ou de "demander une réduction".
5. Ton rôle : EXPLIQUER et JUSTIFIER ce verdict factuel, pas le recalculer.`;

  const marketPositionContext = marketPosition.globalLabel !== "hors_catalogue"
    ? `\nPOSITIONNEMENT GLOBAL DU DEVIS vs MARCHÉ:
- Total devis (postes comparables): ${marketPosition.totalDevis.toFixed(0)} €
- Fourchette marché totale: ${marketPosition.totalMarketMin.toFixed(0)} – ${marketPosition.totalMarketMax.toFixed(0)} € (moyenne: ${marketPosition.totalMarketAvg.toFixed(0)} €)
- Position: ${marketPosition.globalLabel === "inférieur_au_marché" ? "INFÉRIEUR À LA MOYENNE — le devis est attractif" : marketPosition.globalLabel === "au_dessus_du_max" ? "AU-DESSUS DU MAX — prix anormalement élevé" : marketPosition.globalLabel === "au_dessus_de_la_moyenne" ? "AU-DESSUS DE LA MOYENNE" : "DANS LA NORME"}`
    : "";

  // ── Prompt Gemini ─────────────────────────────────────────────────────────
  const critiquesBlock = criteres_rouges.length > 0
    ? `\nALERTES CRITIQUES DÉTECTÉES (facteurs bloquants) :\n${criteres_rouges.map(r => `🔴 ${r}`).join("\n")}\n⚠️ CES ALERTES PRIMENT sur l'analyse de prix. Si l'entreprise est radiée ou en procédure collective, la conclusion DOIT être "ne_pas_signer" et "a_risque", indépendamment du positionnement tarifaire.`
    : "";

  const userPrompt = `Tu es un expert en rénovation immobilière. Analyse ce devis et aide un particulier à décider s'il doit signer ou non.
${verdictImposedBlock}

CONTEXTE DU DEVIS:
- Entreprise: ${nomEntreprise || "inconnue"}
- Montant HT: ${totalHT ? `${totalHT.toLocaleString("fr-FR")} €` : "inconnu"}
- Montant TTC: ${totalTTC ? `${totalTTC.toLocaleString("fr-FR")} €` : "inconnu"}
- TVA: ${tauxTVA ? `${tauxTVA}%` : "inconnue"}
- Ville: ${ville || "inconnue"}${codePostal ? ` (${codePostal})` : ""}
- Type de travaux: ${workType || "rénovation"}
- Résumé du devis: ${resume || "non disponible"}${marketPositionContext}${critiquesBlock}
${devisAgeWarning ? `\n${devisAgeWarning}` : ""}

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
- ALERTES CRITIQUES EN TÊTE : si des "ALERTES CRITIQUES DÉTECTÉES" figurent dans le contexte (entreprise radiée, procédure collective), le verdict DOIT être "a_risque" + "ne_pas_signer". L'analyse de prix reste secondaire. La phrase_intro et les justifications doivent mentionner explicitement le problème (ex: "entreprise radiée des registres officiels").
- DEVIS ANCIEN : si un avertissement "DEVIS ANCIEN" figure dans le contexte, la phrase_intro doit mentionner l'année du devis et préciser que les prix sont susceptibles d'avoir évolué. Les justifications doivent noter que la comparaison au marché actuel est indicative.
- DISTINCTION CRITIQUE entre "a_negocier" et "eleve_justifie" :
  → "a_negocier" signifie que le prix EST réellement trop élevé et que le particulier DOIT négocier à la baisse. N'utilise ce verdict QUE s'il y a au moins une anomalie réelle non justifiée.
  → "eleve_justifie" signifie que le prix est au-dessus de la moyenne du marché MAIS s'explique par la complexité, la nature spécifique de la mission, des matériaux premium ou une zone géographique chère. Le particulier N'A PAS à négocier le prix — il doit vérifier les qualifications et clauses. Le badge affiché sera "Élevé mais justifié", PAS "À négocier".
  → RÈGLE : Si tes justifications expliquent pourquoi le prix est normal → utilise "eleve_justifie", pas "a_negocier". Ces deux verdicts ne peuvent PAS coexister dans le même raisonnement.
  → RÈGLE : Si la référence marché est marquée "Comparaison indicative" (référence peu fiable pour ce type de prestation), ne pas utiliser "a_negocier" uniquement à cause de l'écart de prix — ce serait une fausse anomalie basée sur une mauvaise référence. Utilise "eleve_justifie" si le prix s'explique par la prestation, ou "dans_la_norme" si l'analyse ne permet pas de conclure.
- PRIX ATTRACTIF : si le POSITIONNEMENT GLOBAL est "INFÉRIEUR À LA MOYENNE", c'est une bonne affaire. Sauf anomalie réelle (prix unitaire > 2× le max OU incohérence flagrante), le verdict doit être "signer". Ne jamais recommander de "négocier le prix" dans les actions quand le devis est déjà sous la moyenne du marché — c'est incohérent. Les actions doivent porter sur les vérifications qualité, assurances, et clauses contractuelles.
- Des variations de prix ENTRE LIGNES du même type (ex: volets à des prix différents selon dimensions/options) ne sont PAS des anomalies si le total global est dans ou sous la fourchette marché.
- INTERDIT : signaler un poste marqué [FORFAIT GLOBAL] comme anomalie de prix. Un forfait global ne peut PAS être comparé à un prix unitaire catalogue. Ces postes sont à commenter uniquement si le montant total semble disproportionné au regard de la prestation décrite.
- MISMATCH D'UNITÉ : un poste marqué [⚠️ MISMATCH UNITÉ] (ex: cloison ou peinture facturé en U plutôt qu'en m²) ne peut PAS être comparé au catalogue marché — n'inclure AUCUNE anomalie de prix pour ces postes. Dans les actions_avant_signature, inclure UNE action du type : "Demandez la surface exacte en m² pour [nom du poste] — facturé en U sans surface indiquée, impossible de comparer au marché. Si < 8 m² le prix est élevé, négociez ; si > 12 m² le prix est cohérent."
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
    const timeoutId  = setTimeout(() => controller.abort(), 80_000); // 80s — Gemini 2.5 peut prendre 45-60s

    const aiResponse = await fetch(GEMINI_URL, {
      method:  "POST",
      signal:  controller.signal,
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${googleApiKey}`,
      },
      body: JSON.stringify({
        model:       "gemini-2.5-flash",
        messages:    [{ role: "user", content: userPrompt }],
        max_tokens:  16384,
        temperature: 0.1,
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
    const geminiActions: string[] = Array.isArray(parsed.actions_avant_signature)
      ? parsed.actions_avant_signature
          .filter((a: unknown) => typeof a === "string" && a.trim().length > 0)
          .map((a: string) => a.trim())
          .slice(0, 3)
      : [];

    // Détection mismatch surface/unité — injecte une action spécifique si pertinent
    const surfaceMismatchGroups = Array.isArray(priceData)
      ? (priceData as Record<string, any>[]).filter(
          g => g && typeof g === "object" && g.job_type_label !== "Autre" && hasSurfaceUnitMismatch(g)
        )
      : [];
    const surfaceActions: string[] = surfaceMismatchGroups.map(g => {
      const posteName = (g.job_type_label as string) || "ce poste";
      const unitUsed  = (g.main_unit as string) || "U";
      return `Demandez la surface exacte en m² pour "${posteName}" — facturé en ${unitUsed} sans surface précisée, impossible de comparer au marché. Si < 8 m² le prix est élevé, négociez ; si > 12 m² le prix est cohérent.`;
    });

    // Merge : actions surface en tête, puis Gemini, puis défauts
    const mergedActions: string[] = [...surfaceActions, ...geminiActions];
    const DEFAULT_ACTIONS = [
      "Vérifiez les assurances décennale et RC Pro de l'entreprise avant de signer.",
      "Demandez un échéancier de paiement détaillé et ne versez pas plus de 30 % à la commande.",
      "Faites inscrire dans le contrat la date de début et la durée prévisionnelle des travaux.",
    ];
    while (mergedActions.length < 3) mergedActions.push(DEFAULT_ACTIONS[mergedActions.length % DEFAULT_ACTIONS.length]);

    // ── Sanitisation texte LLM — supprime les contradictions avec le verdict ─────
    // Appliqué avant toute persistance ou affichage.
    const sanitizeVerdict = preEngine.verdict; // "signer" | "a_negocier" | "refuser"
    const phraseIntro    = sanitizeLLMText(
      typeof parsed.phrase_intro  === "string" ? parsed.phrase_intro.trim()   : "",
      sanitizeVerdict,
    );
    const justifications = sanitizeLLMText(
      typeof parsed.justifications === "string" ? parsed.justifications.trim() : "",
      sanitizeVerdict,
    );
    // Sanitise les explications des anomalies
    sanitizedAnomalies.forEach(a => {
      if (a.explication) a.explication = sanitizeLLMText(a.explication, sanitizeVerdict);
    });
    // Sanitise les actions (évite "vous pouvez signer" dans les actions quand verdict ≠ signer)
    const rawActions = mergedActions.slice(0, 3).map(a => sanitizeLLMText(a, sanitizeVerdict));

    // ── Note contextuelle marché (seuils adaptatifs UX) ──────────────────────────
    // Affichée dans ConclusionIA quand le moteur a assoupli les seuils.
    const marketContextParts: string[] = [];
    if (preEngine.market_dispersion_pct > 0.4) {
      marketContextParts.push("Marché avec forte variation de prix — tolérance ajustée");
    }
    if (preEngine.chantier_complexity === "high") {
      marketContextParts.push("Travaux complexes — variation de prix normale");
    }
    const market_context_note = marketContextParts.length > 0
      ? marketContextParts.join(" · ")
      : undefined;

    // ── Raisons du verdict (section "Pourquoi ce verdict ?") ─────────────────────
    const verdict_reasons = generateVerdictReasons({
      verdict:               preEngine.verdict,
      overprice:             preEngine.overprice,
      overprice_pct:         preEngine.overprice_pct,
      anomalies_major_count: preMajorAnomalies,
      company_risk:          preRisk,
      flags:                 preFlags,
      has_market_data:       preEngine.has_market_data,
      market_dispersion_pct: preEngine.market_dispersion_pct,
      chantier_complexity:   preEngine.chantier_complexity,
      threshold_ok:          preEngine.threshold_ok,
    });

    // ── Verdict déterministe — appliqué depuis preEngine (calculé avant Gemini) ──
    // Le LLM génère uniquement les explications textuelles.
    // preEngine est la source de vérité absolue pour le verdict final.
    const DECISION_MAP: Record<string, ConclusionData["verdict_decisionnel"]> = {
      signer:    "signer",
      a_negocier: "signer_avec_negociation",
      refuser:   "ne_pas_signer",
    };
    const GLOBAL_MAP: Record<string, ConclusionData["verdict_global"]> = {
      signer:    "dans_la_norme",
      a_negocier: "a_negocier",
      refuser:   "a_risque",
    };

    let verdictGlobal: ConclusionData["verdict_global"]        = GLOBAL_MAP[preEngine.verdict]   ?? "a_negocier";
    let verdictDecision: ConclusionData["verdict_decisionnel"] = DECISION_MAP[preEngine.verdict] ?? "signer_avec_negociation";

    // ── Cohérence forcée : niveau_risque DOIT correspondre à verdict_global ──
    const RISQUE_FORCED: Record<string, "faible" | "modéré" | "élevé"> = {
      dans_la_norme:  "faible",
      eleve_justifie: "modéré",
      a_negocier:     "modéré",
      a_risque:       "élevé",
    };
    const niveauRisque: "faible" | "modéré" | "élevé" = RISQUE_FORCED[verdictGlobal] ?? "modéré";

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
      verdict_reasons,
      ...(market_context_note     ? { market_context_note } : {}),
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
