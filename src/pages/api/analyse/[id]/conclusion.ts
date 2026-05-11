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
import { jsonOk, jsonError, optionsResponse } from "@/lib/api/apiHelpers";

// Version du moteur de scoring — incrémenter à chaque changement de logique pour
// invalider automatiquement le cache `conclusion_ia` des analyses existantes.
const ENGINE_VERSION = "3.3";

// ──────────────────────────────────────────────────────────────────────────────
// Matérialité du surcoût serveur — triple garde alignée sur computeVerdict V3.1
// ──────────────────────────────────────────────────────────────────────────────
// Un surcoût n'est "matériel" (= digne d'escalader le verdict ou de bannir les
// wordings positifs) que si :
//   1. son montant absolu dépasse un seuil (sinon "ridicule de renégocier")
//   2. son poids relatif sur le devis dépasse un seuil (sinon noise statistique)
//
// Exemples :
//   - Devis 48 000 € + surcout 180 €  → 0.4% → NON MATÉRIEL → pas d'escalade
//   - Devis 48 000 € + surcout 1 500 € → 3.1% → MATÉRIEL → escalade
//   - Devis 16 000 € + surcout 3 400 € → 21%  → MATÉRIEL → escalade (Kern)
//   - Devis 100 000 € + surcout 2 000 € → 2%  → NON MATÉRIEL → pas d'escalade
//
// Sans cette double garde, on recrée le bug inverse (faux orange sur micro-écarts).
const MATERIAL_SURCOUT_EUR_THRESHOLD = 1000;   // €
const MATERIAL_SURCOUT_PCT_THRESHOLD = 0.03;   // 3% du total devis

function isMaterialServerSurcout(
  surcoutMax: unknown,
  totalDevis: unknown,
  fallbackTotal?: unknown,
): boolean {
  if (typeof surcoutMax !== "number" || surcoutMax <= MATERIAL_SURCOUT_EUR_THRESHOLD) return false;
  // V3.3 — accepte un fallback (typiquement marketPosition.totalDevis) quand le totalHT
  // principal n'a pas été extrait par Gemini. Sans ce fallback, la garde de cohérence
  // était inopérante sur les devis qui stockent en format legacy.
  const effectiveTotal = (typeof totalDevis === "number" && totalDevis > 0)
    ? totalDevis
    : (typeof fallbackTotal === "number" && fallbackTotal > 0 ? fallbackTotal : 0);
  if (effectiveTotal <= 0) return false;
  const ratio = surcoutMax / effectiveTotal;
  return ratio > MATERIAL_SURCOUT_PCT_THRESHOLD;
}

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

import type { AnomalieConclusion, ConclusionData } from "@/lib/analyse/conclusionTypes";
export type { AnomalieConclusion, ConclusionData } from "@/lib/analyse/conclusionTypes";
import {
  computeVerdict, computeMarketBounds, countMajorAnomalies,
  extractFlagsFromCriteria, extractCompanyRisk, generateVerdictReasons,
  extractCompanyStatusFromCriteria, computeWeightedAnomalies,
} from "@/lib/analyse/verdictEngine";

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
 * V3.2.3 — Score de confiance pour le mismatch surface/unité, retourné dans [0, 1].
 *
 * `hasSurfaceUnitMismatch` retourne un bool brut basé sur des heuristiques qui peuvent
 * se tromper (extraction Gemini défaillante sur l'unité, label ambigu). Si la fonction
 * retourne `true` à tort, on injecte une action "Demandez la surface en m²" qui est
 * **ridicule pour le user** (il sait déjà sa surface, c'est juste qu'on ne l'a pas extraite).
 *
 * Ce score additionne plusieurs signaux convergents et permet d'appliquer un SEUIL ÉLEVÉ
 * avant de générer l'action. On préfère rater quelques mismatches réels que produire
 * des actions absurdes — la crédibilité passe avant l'exhaustivité.
 *
 * Échelle :
 *   0.00–0.60 : signal faible — ne pas générer d'action surface
 *   0.60–0.80 : signal moyen — déclenchement optionnel
 *   0.80–1.00 : signal fort — déclenchement recommandé
 *
 * Seuil recommandé pour générer une action : >= 0.70 (cf. emitSurfaceActions).
 */
function surfaceMismatchConfidence(group: Record<string, any>): number {
  // Pré-condition : le mismatch heuristique de base doit déjà tenir
  if (!hasSurfaceUnitMismatch(group)) return 0;

  const label = (group.job_type_label || "").toLowerCase();
  const unit  = (group.main_unit || "").toLowerCase().trim();
  const lines: any[] = group.devis_lines || [];
  const descriptions: string[] = lines.map((l: any) => (l.description || "").toLowerCase());

  let confidence = 0;

  // (1) Le label match un mot-clé surface → +0.30 (signal fort, label vient de Gemini groupement)
  if (SURFACE_WORK_KEYWORDS.some(kw => label.includes(kw))) {
    confidence += 0.30;
  }

  // (2) Une description match un mot-clé surface → +0.20 (signal fort)
  //     Plusieurs descriptions matchent → +0.10 supplémentaire (renforce la conviction)
  const matchingDescCount = descriptions.filter(d =>
    SURFACE_WORK_KEYWORDS.some(kw => d.includes(kw))
  ).length;
  if (matchingDescCount >= 1) confidence += 0.20;
  if (matchingDescCount >= 2) confidence += 0.10;

  // (3) L'unité est explicitement dans UNIT_LIKE (pas vide ou ambiguë) → +0.20
  //     Une unité bien identifiée renforce le diagnostic. Une unité vide affaiblit.
  if (unit.length > 0 && UNIT_LIKE.some(u => unit === u || unit.startsWith(u + " "))) {
    confidence += 0.20;
  }

  // (4) Aucune ligne m² dans le groupe → +0.15 (déjà vérifié par hasSurfaceUnitMismatch,
  //     mais on le récompense explicitement pour aligner avec le narratif "surface non
  //     précisée"). Si une description CONTIENT "m²" en texte libre sans être l'unité
  //     officielle de la ligne → on baisse la confiance (Gemini a peut-être loupé l'extraction).
  const knownSurface = extractKnownSurface(lines);
  if (knownSurface === null) {
    confidence += 0.15;
    // Soft penalty : si une description mentionne "m²" en texte libre, c'est suspect
    const hasM2InDescription = descriptions.some(d => /\bm[²2]\b/.test(d));
    if (hasM2InDescription) confidence -= 0.15;
  }

  // (5) Quantité = 1 ou 2 (cohérent avec un forfait) → +0.05
  //     Une quantité plus élevée évoque un U comptable (5 portes, 10 cloisons), pas un forfait.
  const mainQty = typeof group.main_quantity === "number" ? group.main_quantity : 0;
  if (mainQty >= 1 && mainQty <= 2) confidence += 0.05;

  return Math.max(0, Math.min(1, confidence));
}

// Seuil au-dessus duquel on génère une action "Demandez la surface". En dessous,
// on s'abstient pour ne pas demander au user de fournir une info qu'il a déjà donnée.
const SURFACE_MISMATCH_ACTION_THRESHOLD = 0.70;

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
 * V3.2 (2026-05-11) — Sanitization en 2 niveaux :
 * - ALWAYS_FORBIDDEN : phrases bannies QUEL QUE SOIT le verdict, parce qu'elles ont
 *   systématiquement créé des contradictions à l'écran (ex: "prix attractif sous la
 *   moyenne" sur un devis avec +5 000 € détectés en surcoût postes).
 * - CONDITIONAL_FORBIDDEN : phrases bannies seulement si verdict ≠ signer.
 *
 * Cette double protection sert de filet de sécurité ultime — même si le LLM contourne
 * les règles du prompt, on neutralise les contradictions avant persistance.
 */
function sanitizeLLMText(
  text: string,
  verdict: "signer" | "a_negocier" | "refuser",
  hasServerSurcout: boolean = false,
): string {
  if (!text) return text;

  let result = text;

  // ── Niveau 1 — toujours interdit (anti-hallucination universelle) ────────────
  // Ces termes sont systématiquement source de contradiction à l'écran.
  // Bug Kern Terrassement : "Prix attractif — 6 k€ sous la moyenne" affiché alors que
  // computeServerSurcout retournait +3 400 € sur les postes. Impossible.
  const ALWAYS_FORBIDDEN: Array<[RegExp, string]> = [
    [/\bprix attractif[fs]?\b/gi,                           "prix à examiner poste par poste"],
    [/\b(très )?bon (rapport )?qualité[- ]?prix\b/gi,       "ratio à vérifier"],
    [/\bdevis (compétitif|attractif)\b/gi,                  "devis à examiner"],
    [/\bsous la moyenne du marché\b/gi,                     "à comparer poste par poste"],
    [/\binférieur au marché( global)?\b/gi,                 "à examiner poste par poste"],
    [/\bglobalement cohérent[es]? (avec |au )?(le |la )?marché\b/gi,
                                                            "à examiner poste par poste"],
    [/\bglobalement conforme[s]? (avec |au )?(le |la )?marché\b/gi,
                                                            "à examiner poste par poste"],
    [/\bdans la norme du marché\b/gi,                       "à comparer poste par poste"],
    [/\bcohérent[es]? avec les prix du marché\b/gi,         "à examiner poste par poste"],
  ];

  for (const [pattern, replacement] of ALWAYS_FORBIDDEN) {
    result = result.replace(pattern, replacement);
  }

  // ── Niveau 2 — interdit seulement si verdict ≠ signer ────────────────────────
  if (verdict !== "signer") {
    const CONDITIONAL_FORBIDDEN: Array<[RegExp, string]> = [
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

    for (const [pattern, replacement] of CONDITIONAL_FORBIDDEN) {
      result = result.replace(pattern, replacement);
    }
  }

  // ── Niveau 3 — anti-hallucination "prix bas" si le serveur a détecté un surcoût ─
  // Si computeServerSurcout > 0, le LLM ne peut JAMAIS dire que le prix est avantageux.
  if (hasServerSurcout) {
    const POSITIVE_PRICE_TERMS: Array<[RegExp, string]> = [
      [/\b(prix )?avantageux\b/gi,                          "prix à examiner"],
      [/\bbonne affaire\b/gi,                               "devis à examiner"],
      [/\beconom[a-z]+ par rapport au marché\b/gi,          "à examiner par rapport au marché"],
    ];
    for (const [pattern, replacement] of POSITIVE_PRICE_TERMS) {
      result = result.replace(pattern, replacement);
    }
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
      // V3.2 — invalidation automatique si engine_version désuète.
      // Ainsi, dès qu'on déploie une version corrigée du moteur, toutes les analyses
      // existantes sont régénérées à la prochaine visite sans intervention utilisateur.
      const cachedVersion = (cached as any).engine_version as string | undefined;
      if (cached.phrase_intro && cached.verdict_global && cached.verdict_decisionnel && cachedVersion === ENGINE_VERSION) {
        return jsonOk({ conclusion: cached, cached: true });
      }
      console.log(`[conclusion] cache invalidé — version cachée=${cachedVersion ?? "(absente)"} attendue=${ENGINE_VERSION}`);
      // Sinon : régénère automatiquement avec le moteur courant
    } catch {
      // JSON corrompu → régénère
    }
  }

  // ── Parse raw_text ────────────────────────────────────────────────────────
  let priceData: unknown[] = [];
  let extractedData: Record<string, unknown> = {};
  // V3.3 — capture aussi le format legacy `extracted` (utilisé par certaines anciennes
  // analyses) pour permettre le fallback de totalHT plus bas. Sans ça, les analyses
  // pré-format-actuel sortent totalHT=null → garde de cohérence inopérante.
  let extractedLegacy: Record<string, unknown> = {};
  let isMultipleQuotes = false;
  let segmentAnalyses: Array<Record<string, unknown>> = [];
  let globalMetricsRaw: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(analysis.raw_text || "{}");
    priceData       = Array.isArray(parsed.n8n_price_data) ? parsed.n8n_price_data : [];
    extractedData   = (parsed.extracted_data as Record<string, unknown>) || {};
    extractedLegacy = (parsed.extracted as Record<string, unknown>) || {};
    // Multi-devis : lire segment_analyses + global_metrics pré-calculés
    const docDet    = parsed.document_detection as Record<string, unknown> | undefined;
    isMultipleQuotes = docDet?.multiple_quotes === true && Array.isArray(parsed.segment_analyses) && parsed.segment_analyses.length > 1;
    if (isMultipleQuotes) {
      segmentAnalyses  = parsed.segment_analyses as Array<Record<string, unknown>>;
      globalMetricsRaw = parsed.global_metrics as Record<string, unknown> | null ?? null;
    }
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

  // ──────────────────────────────────────────────────────────────────────────
  // totalHT — résolution robuste avec fallbacks alignés sur le client (V3.3)
  //
  // Bug observé sur Kern Terrassement : la garde de cohérence retournait false
  // parce que totaux.ht était null. Sans totalHT, isMaterialServerSurcout ne peut
  // pas calculer le ratio relatif → pas d'escalade → bandeau "Vous pouvez signer"
  // affiché malgré +5 900 € de surcoût (36% du devis).
  //
  // 3 niveaux de résolution :
  //   1. extracted_data.totaux.ht (format actuel)
  //   2. extracted.totaux.ht (format legacy — fallback aligné sur AnalysisResult.tsx)
  //   3. somme des devis_total_ht de priceData (proxy fiable si tous postes extraits)
  //
  // Si les 3 niveaux échouent, totalHT reste null et on log un warning.
  // ──────────────────────────────────────────────────────────────────────────
  const totalHT: number | null = (() => {
    if (typeof totaux.ht === "number" && totaux.ht > 0) return totaux.ht;
    // Fallback 1 : format legacy
    const legacyTotaux = (extractedLegacy.totaux as Record<string, unknown> | undefined);
    if (legacyTotaux && typeof legacyTotaux.ht === "number" && legacyTotaux.ht > 0) {
      console.warn("[conclusion] totalHT issu du format legacy extracted.totaux.ht");
      return legacyTotaux.ht;
    }
    // Fallback 2 : somme des postes du priceData
    if (Array.isArray(priceData) && priceData.length > 0) {
      const sumPostes = (priceData as Array<Record<string, unknown>>).reduce((acc, g) => {
        const t = typeof g?.devis_total_ht === "number" ? g.devis_total_ht : 0;
        return acc + t;
      }, 0);
      if (sumPostes > 0) {
        console.warn(`[conclusion] totalHT déduit de la somme priceData : ${sumPostes} €`);
        return sumPostes;
      }
    }
    console.warn("[conclusion] totalHT introuvable — garde de cohérence relative inopérante");
    return null;
  })();
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
  // RÈGLE 5 — Le moteur tourne AVANT Gemini pour contraindre le LLM, pas après.
  // En mode multi-devis : utilise global_metrics pré-calculé (source de vérité unique).
  // En mode mono-devis : calcul normal via verdictEngine.

  const preFlags         = extractFlagsFromCriteria(criteres_rouges, criteres_oranges);
  const preRisk          = extractCompanyRisk(criteres_rouges, criteres_oranges);
  const preCompanyStatus = extractCompanyStatusFromCriteria(criteres_rouges);

  let preEngine: ReturnType<typeof computeVerdict>;
  // NOTE: déclaré ici (scope externe) car utilisé après le bloc if/else à la ligne ~875
  let preMajorAnomalies = 0;

  if (isMultipleQuotes && globalMetricsRaw) {
    // Multi-devis : construire un VerdictResult factice depuis global_metrics
    // Le verdict réel est déjà dans global_metrics.verdict_global
    const gVerdict = String(globalMetricsRaw.verdict_global ?? "signer") as "signer" | "a_negocier" | "refuser";
    const gOverpricePct = typeof globalMetricsRaw.overprice_pct === "number" ? globalMetricsRaw.overprice_pct : 0;
    const gOverprice    = typeof globalMetricsRaw.overprice_total === "number" ? globalMetricsRaw.overprice_total : 0;
    const gRouge        = typeof globalMetricsRaw.segments_rouge === "number" ? globalMetricsRaw.segments_rouge : 0;
    preMajorAnomalies   = gRouge; // segments en rouge = anomalies majeures en mode multi
    preEngine = {
      verdict:               gVerdict,
      color:                 gVerdict === "refuser" ? "red" : gVerdict === "a_negocier" ? "orange" : "green",
      score_legacy:          gVerdict === "refuser" ? "ROUGE" : gVerdict === "a_negocier" ? "ORANGE" : "VERT",
      overprice:             gOverprice,
      overprice_pct:         gOverpricePct,
      anomalies_major_count: gRouge,
      is_hard_block:         preFlags.entreprise_radiee || preFlags.siret_invalide || preFlags.absence_assurance || preFlags.paiement_cash_suspect || preFlags.iban_suspect,
      has_market_data:       (typeof globalMetricsRaw.total_marche_max === "number" ? globalMetricsRaw.total_marche_max : 0) > 0,
      price_label:           gVerdict === "refuser" ? "🛑 Devis anormal" : gVerdict === "a_negocier" ? "⚠️ À négocier" : "✅ Juste prix",
      threshold_ok:          0.08,
      threshold_refuse:      0.20,
      market_dispersion_pct: 0,
      chantier_complexity:   "medium",
    };
  } else {
    // Mono-devis : calcul normal
    const preMarketBounds   = computeMarketBounds(priceData);
    preMajorAnomalies       = countMajorAnomalies(priceData);
    const weightedAnomalies = computeWeightedAnomalies(priceData, typeof totalHT === "number" ? totalHT : 0);
    const preAvgMarket = (preMarketBounds.min + preMarketBounds.max) / 2;
    const preDispersion = preAvgMarket > 0
      ? (preMarketBounds.max - preMarketBounds.min) / preAvgMarket : 0;

    preEngine = computeVerdict({
      total_amount:          typeof totalHT === "number" ? totalHT : 0,
      market_estimate_min:   preMarketBounds.min,
      market_estimate_max:   preMarketBounds.max,
      anomalies_major_count: preMajorAnomalies,
      anomalies_total_count: preMajorAnomalies,
      company_risk:          preRisk,
      flags:                 preFlags,
      market_dispersion_pct: preDispersion,
      company_status:        preCompanyStatus ?? undefined,
      weighted_anomalies:    weightedAnomalies,
    });
  }

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

  // Bloc analyse pondérée V3 pour le LLM
  const wa = preEngine.weighted_anomalies;
  const weightedBlock = wa
    ? `\nANALYSE PONDÉRÉE DES ANOMALIES (V3 — source de vérité):
- Postes surdévalués (> +30% médiane marché): ${wa.anomalies_count} sur ${wa.total_analyzed} postes comparables
- Poids de ces postes dans le devis: ${Math.round(wa.poids_anomalies * 100)}%
- Surcoût réel issu de ces postes: ${wa.surcout_total > 0 ? `+${wa.surcout_total.toLocaleString("fr-FR")} € (+${Math.round(wa.surcout_pct * 100)}% du total)` : "aucun"}
- Impact global des anomalies: ${wa.impact_anomalies.toUpperCase()}${wa.impact_anomalies === "faible" ? " (< 20% du total — anomalies isolées)" : wa.impact_anomalies === "modéré" ? " (20–50% du total)" : " (≥ 50% du total)"}`
    : "";

  const verdictImposedBlock = `
VERDICT IMPOSÉ PAR LE MOTEUR DÉTERMINISTE:
- verdict_decisionnel: "${imposedDecision}"
- verdict_global: "${imposedGlobal}"
- Surcoût estimé: ${preEngine.overprice > 0 ? `+${Math.round(preEngine.overprice_pct * 100)}% vs moyenne marché (${Math.round(preEngine.overprice).toLocaleString("fr-FR")} €)` : "dans la norme ou sous la moyenne"}
- Seuil de tolérance appliqué: ${Math.round(preEngine.threshold_ok * 100)}%${preEngine.hard_block_reason === "company_status" ? `\n- HARD BLOCK PRIORITÉ 0 : STATUT JURIDIQUE À RISQUE (${preCompanyStatus ?? "cessation/liquidation/redressement/radiée"}) — verdict REFUSER forcé indépendamment du prix` : preEngine.is_hard_block ? "\n- HARD BLOCK ACTIF (entreprise radiée ou paiement suspect)" : ""}${weightedBlock}

RÈGLES ABSOLUES (ne pas déroger):
1. Tu DOIS produire exactement verdict_decisionnel="${imposedDecision}" et verdict_global="${imposedGlobal}".
2. INTERDIT de contredire ce verdict dans phrase_intro, justifications ou actions_avant_signature.
3. Si verdict_decisionnel="ne_pas_signer" → INTERDIT d'écrire des phrases comme "vous pouvez signer", "le devis est acceptable", "le prix est cohérent", "prix attractif", "bon rapport qualité-prix", "devis compétitif". Le prix peut être bas ET le verdict refuser (ex: entreprise en cessation) — ne jamais valoriser le prix dans ce cas.
4. Si verdict_decisionnel="signer" → INTERDIT de recommander de "négocier le prix" ou de "demander une réduction".
5. Si verdict_decisionnel="signer_avec_negociation" → INTERDIT d'écrire "vous pouvez signer en confiance" ou "aucune anomalie". Il y a au moins un poste trop élevé.
6. Ton rôle : EXPLIQUER et JUSTIFIER ce verdict factuel, pas le recalculer.
7. INTERDIT ABSOLU dans TOUS les champs textuels (phrase_intro, justifications, actions) :
   - "prix attractif", "prix attractive", "très bon prix", "excellent prix"
   - "sous la moyenne du marché", "inférieur au marché global", "devis compétitif"
   - "globalement cohérent", "globalement conforme", "dans la norme du marché"
   Ces wordings créent des contradictions avec le surcoût détecté poste par poste.
   Même si le total cumulé est sous la moyenne marché (compensation entre postes),
   tu dois nommer les postes problématiques au lieu de présenter le devis comme attractif.${wa?.impact_anomalies === "faible" ? `
8. IMPACT ANOMALIES FAIBLE (${Math.round((wa?.poids_anomalies ?? 0) * 100)}% du total) — RÈGLES DE WORDING :
   - INTERDIT : "surcoût massif", "devis très au-dessus du marché"
   - OBLIGATOIRE : mentionner les postes élevés comme négociation locale, pas comme rejet global
   - phrase_intro doit rester factuelle (montant + ville + type) sans qualificatif positif global` : ""}`;

  // Si hard block (company_status ou flags), ne pas contextualiser le prix comme "attractif"
  const pricePositionLabel = (() => {
    if (preEngine.is_hard_block) return "NON PERTINENT — blocage juridique/sécurité prioritaire";
    switch (marketPosition.globalLabel) {
      case "inférieur_au_marché":    return "INFÉRIEUR À LA MOYENNE — le devis est sous les prix du marché";
      case "au_dessus_du_max":       return "AU-DESSUS DU MAX — prix anormalement élevé";
      case "au_dessus_de_la_moyenne": return "AU-DESSUS DE LA MOYENNE";
      default:                       return "DANS LA NORME";
    }
  })();
  const marketPositionContext = marketPosition.globalLabel !== "hors_catalogue"
    ? `\nPOSITIONNEMENT GLOBAL DU DEVIS vs MARCHÉ:
- Total devis (postes comparables): ${marketPosition.totalDevis.toFixed(0)} €
- Fourchette marché totale: ${marketPosition.totalMarketMin.toFixed(0)} – ${marketPosition.totalMarketMax.toFixed(0)} € (moyenne: ${marketPosition.totalMarketAvg.toFixed(0)} €)
- Position: ${pricePositionLabel}`
    : "";

  // ── Prompt Gemini ─────────────────────────────────────────────────────────
  const critiquesBlock = criteres_rouges.length > 0
    ? `\nALERTES CRITIQUES DÉTECTÉES (facteurs bloquants) :\n${criteres_rouges.map(r => `🔴 ${r}`).join("\n")}\n⚠️ CES ALERTES PRIMENT sur l'analyse de prix. Si l'entreprise est radiée ou en procédure collective, la conclusion DOIT être "ne_pas_signer" et "a_risque", indépendamment du positionnement tarifaire.`
    : "";

  // ── Bloc multi-devis (RÈGLE 5) ───────────────────────────────────────────────
  const multiDevisBlock = isMultipleQuotes && segmentAnalyses.length > 0 ? (() => {
    const segLines = segmentAnalyses.map((seg, i) => {
      const v = String(seg.verdict ?? "signer");
      const emoji = v === "refuser" ? "🔴" : v === "a_negocier" ? "🟠" : "🟢";
      const totalHtSeg = typeof seg.total_ht === "number" ? `${seg.total_ht.toLocaleString("fr-FR")} € HT` : "montant inconnu";
      const marketMin = typeof seg.market_min === "number" ? seg.market_min : 0;
      const marketMax = typeof seg.market_max === "number" ? seg.market_max : 0;
      const hasMarket = typeof seg.has_market_data === "boolean" ? seg.has_market_data : marketMax > 0;
      const marketStr = hasMarket ? `fourchette marché ${marketMin.toLocaleString("fr-FR")}–${marketMax.toLocaleString("fr-FR")} €` : "hors catalogue marché";
      const anomalies = typeof seg.anomalies_count === "number" ? seg.anomalies_count : 0;
      const overpricePct = typeof seg.overprice_pct === "number" ? `${seg.overprice_pct >= 0 ? "+" : ""}${Math.round(seg.overprice_pct * 100)}%` : "";
      return `  ${emoji} Artisan ${i + 1}: ${String(seg.entreprise_nom ?? "Inconnu")} (${String(seg.lot_type ?? "lot")})
     Total: ${totalHtSeg} | Verdict: ${v.toUpperCase()} | ${marketStr}${overpricePct ? ` | Écart marché: ${overpricePct}` : ""}${anomalies > 0 ? ` | ${anomalies} anomalie(s)` : ""}`;
    }).join("\n");

    const artisansARisque = segmentAnalyses
      .filter(s => String(s.verdict) === "refuser" || String(s.verdict) === "a_negocier")
      .map(s => `${String(s.entreprise_nom ?? "?")} (${String(s.verdict ?? "?")})`);

    const globalV = String(globalMetricsRaw?.verdict_global ?? "signer");
    const globalTotal = typeof globalMetricsRaw?.total_devis_ht === "number"
      ? `${(globalMetricsRaw.total_devis_ht as number).toLocaleString("fr-FR")} € HT`
      : "montant total inconnu";

    return `
⚠️ MODE MULTI-DEVIS — PDF contenant ${segmentAnalyses.length} artisans distincts.
RÈGLE ABSOLUE : chaque artisan est analysé INDÉPENDAMMENT. Ne jamais mélanger leurs données.

VERDICTS PAR ARTISAN (pré-calculés — NE PAS recalculer) :
${segLines}

VERDICT GLOBAL : ${globalV.toUpperCase()} | Total chantier : ${globalTotal}
${artisansARisque.length > 0 ? `ARTISANS À RISQUE : ${artisansARisque.join(", ")}` : "Aucun artisan à risque."}

CONTRAINTES ABSOLUES MULTI-DEVIS (RÈGLE 5) :
1. INTERDIT d'écrire "le devis est cohérent" ou "vous pouvez signer" si verdict_global ≠ signer.
2. INTERDIT d'écrire "le devis est acceptable" si ≥ 1 artisan a verdict refuser ou a_negocier.
3. Si un artisan a verdict REFUSER → mentionner explicitement son nom et la raison.
4. Ton rôle : expliquer et justifier global_verdict="${globalV}", pas le recalculer.
5. La phrase_intro DOIT mentionner le nombre d'artisans et le verdict global.
6. Les anomalies et actions doivent être attribuées à l'artisan concerné (indiquer le nom).`;
  })() : "";

  const userPrompt = `Tu es un expert en rénovation immobilière. Analyse ce devis et aide un particulier à décider s'il doit signer ou non.
${verdictImposedBlock}
${multiDevisBlock}

CONTEXTE DU DEVIS:
- Entreprise: ${isMultipleQuotes ? `${segmentAnalyses.length} artisans (voir détail ci-dessus)` : nomEntreprise || "inconnue"}
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

    // Détection mismatch surface/unité — injecte une action spécifique SI confidence suffisante.
    // V3.2.3 — On filtre désormais sur un score de confiance >= 0.70 (au lieu d'un bool brut).
    // Risque sans seuil : une mauvaise extraction d'unité par Gemini déclenchait l'action
    // "Demandez la surface en m²" alors que le user AVAIT déjà fourni la surface — message
    // ridicule pour le user, perte de crédibilité.
    //
    // V3.2 : déduplication par job_type_label (un seul message par type de poste, max 2).
    const surfaceMismatchCandidates = Array.isArray(priceData)
      ? (priceData as Record<string, any>[])
          .filter(g => g && typeof g === "object" && g.job_type_label !== "Autre")
          .map(g => ({ group: g, confidence: surfaceMismatchConfidence(g) }))
          .filter(({ confidence }) => confidence >= SURFACE_MISMATCH_ACTION_THRESHOLD)
          // Si plusieurs groupes ex-aequo, on garde ceux de plus haute confiance en premier
          .sort((a, b) => b.confidence - a.confidence)
      : [];

    // Dédupliquer par job_type_label (un seul message par type de poste, max 2 messages au total)
    const seenLabels = new Set<string>();
    const surfaceActions: string[] = [];
    for (const { group: g, confidence } of surfaceMismatchCandidates) {
      const posteName = (g.job_type_label as string) || "ce poste";
      const normalizedLabel = posteName.toLowerCase().trim();
      if (seenLabels.has(normalizedLabel)) continue;
      seenLabels.add(normalizedLabel);
      const unitUsed = (g.main_unit as string) || "U";
      console.log(`[conclusion] surface mismatch confirmé pour "${posteName}" — confidence=${confidence.toFixed(2)}`);
      surfaceActions.push(
        `Demandez la surface exacte en m² pour "${posteName}" — facturé en ${unitUsed} sans surface précisée, impossible de comparer au marché. Si < 8 m² le prix est élevé, négociez ; si > 12 m² le prix est cohérent.`
      );
      if (surfaceActions.length >= 2) break; // max 2 actions surface différentes
    }

    // Merge : actions surface en tête, puis Gemini, puis défauts
    const mergedActions: string[] = [...surfaceActions, ...geminiActions];
    const DEFAULT_ACTIONS = [
      "Vérifiez les assurances décennale et RC Pro de l'entreprise avant de signer.",
      "Demandez un échéancier de paiement détaillé et ne versez pas plus de 30 % à la commande.",
      "Faites inscrire dans le contrat la date de début et la durée prévisionnelle des travaux.",
    ];
    while (mergedActions.length < 3) mergedActions.push(DEFAULT_ACTIONS[mergedActions.length % DEFAULT_ACTIONS.length]);

    // ── Sanitisation texte LLM — supprime les contradictions avec le verdict ─────
    // V3.2.1 : `hasServerSurcout` utilise la triple garde matérielle (montant absolu
    // > 1 000€ ET poids relatif > 3% du devis) pour éviter de bannir "avantageux"
    // sur un devis 48k€ avec 180€ de surcoût (faux positif de sanitization).
    const sanitizeVerdict = preEngine.verdict; // "signer" | "a_negocier" | "refuser"
    const hasServerSurcout = isMaterialServerSurcout(surcoutMax, totalHT, marketPosition.totalDevis);

    const phraseIntro    = sanitizeLLMText(
      typeof parsed.phrase_intro  === "string" ? parsed.phrase_intro.trim()   : "",
      sanitizeVerdict,
      hasServerSurcout,
    );
    const justifications = sanitizeLLMText(
      typeof parsed.justifications === "string" ? parsed.justifications.trim() : "",
      sanitizeVerdict,
      hasServerSurcout,
    );
    // Sanitise les explications des anomalies
    sanitizedAnomalies.forEach(a => {
      if (a.explication) a.explication = sanitizeLLMText(a.explication, sanitizeVerdict, hasServerSurcout);
    });
    // Sanitise les actions (évite "vous pouvez signer" dans les actions quand verdict ≠ signer)
    const rawActions = mergedActions.slice(0, 3).map(a => sanitizeLLMText(a, sanitizeVerdict, hasServerSurcout));

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

    // ──────────────────────────────────────────────────────────────────────────
    // GARDE DE COHÉRENCE FINALE (V3.2.1 — 2026-05-11)
    //
    // Source de vérité ultime : `computeServerSurcout` (déterministe).
    // Si le serveur a détecté un surcoût MATÉRIEL (cf. isMaterialServerSurcout :
    // > 1 000€ ABSOLU ET > 3% du devis RELATIF) mais que preEngine.verdict === "signer"
    // (parce que `weighted_anomalies` a raté les anomalies), on ESCALADE
    // automatiquement en "signer_avec_negociation".
    //
    // ⚠️ La triple garde (absolu + relatif) est CRITIQUE pour éviter le bug inverse :
    //   - 48 000€ + 180€ surcout → 0.4% → PAS MATÉRIEL → pas d'escalade (verdict reste signer)
    //   - 16 390€ + 3 400€ surcout → 21% → MATÉRIEL → escalade (cas Kern Terrassement)
    //
    // Sans ces deux conditions, on créerait un faux orange "à négocier pour 0.4% du devis"
    // qui briserait à nouveau la crédibilité — exactement le piège inverse de Kern.
    // ──────────────────────────────────────────────────────────────────────────
    let coherenceEscalated = false;
    if (preEngine.verdict === "signer" && isMaterialServerSurcout(surcoutMax, totalHT, marketPosition.totalDevis)) {
      const ratioPct = typeof totalHT === "number" && totalHT > 0
        ? Math.round((surcoutMax / totalHT) * 100)
        : 0;
      console.warn(
        `[conclusion] GARDE COHÉRENCE déclenchée — preEngine="signer" mais computeServerSurcout=` +
        `${surcoutMin}-${surcoutMax}€ (${ratioPct}% du devis) → escalade auto en "signer_avec_negociation".`
      );
      verdictGlobal   = "a_negocier";
      verdictDecision = "signer_avec_negociation";
      coherenceEscalated = true;
    }

    // ── Raisons du verdict (section "Pourquoi ce verdict ?") ─────────────────────
    // V3.2.2 — On ne falsifie PLUS les données métier (anomalies_count, surcout_total)
    // pour forcer une cohérence affichée. On passe les VRAIES valeurs au moteur, et
    // si la garde de cohérence a escaladé le verdict (divergence inexpliquée entre
    // computeServerSurcout et weighted_anomalies), on PREPEND une raison HONNÊTE
    // qui nomme explicitement la divergence — au lieu d'inventer 2 anomalies fictives.
    //
    // Raison du changement : injecter `anomalies_count = 2` artificiellement ferait
    // afficher "2 postes au-dessus du marché" sans pouvoir les nommer. Si un user
    // demande lesquels, on est nu. Mieux vaut admettre la divergence.
    const finalVerdictForReasons: "signer" | "a_negocier" | "refuser" =
      verdictDecision === "ne_pas_signer" ? "refuser"
      : verdictDecision === "signer_avec_negociation" ? "a_negocier"
      : "signer";

    const verdict_reasons = generateVerdictReasons({
      verdict:               finalVerdictForReasons,
      overprice:             preEngine.overprice,
      overprice_pct:         preEngine.overprice_pct,
      anomalies_major_count: preMajorAnomalies,                    // vraie valeur, pas boostée
      company_risk:          preRisk,
      flags:                 preFlags,
      has_market_data:       preEngine.has_market_data,
      market_dispersion_pct: preEngine.market_dispersion_pct,
      chantier_complexity:   preEngine.chantier_complexity,
      threshold_ok:          preEngine.threshold_ok,
      weighted_anomalies:    preEngine.weighted_anomalies,         // vraie valeur, pas boostée
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Honnêteté en cas de divergence — V3.2.2
    //
    // Si la garde de cohérence a déclenché l'escalade SANS que le moteur ne voie
    // d'anomalies (cas où preEngine.verdict était "signer" mais computeServerSurcout
    // a vu un surcoût matériel), on ajoute une raison qui DIT la divergence au lieu
    // de l'inventer.
    //
    // Cas concret : devis avec compensation globale (gros postes correctement chiffrés
    // qui tirent le total vers le bas + petits postes très au-dessus du marché qui
    // ne pèsent pas assez dans le poids cumulé pour franchir le seuil V3.1).
    // Dans ce cas, le user mérite l'info brute, pas une narration fabriquée.
    //
    // L'engagement honnête est aussi plus crédible commercialement : "voici ce qu'on
    // a vu, à toi d'arbitrer avec l'artisan" > "voici 2 anomalies (qui n'existent pas)".
    // ──────────────────────────────────────────────────────────────────────────
    const hasAnomaliesIdentified = preMajorAnomalies > 0 ||
      (preEngine.weighted_anomalies && preEngine.weighted_anomalies.anomalies_count > 0);

    if (coherenceEscalated && !hasAnomaliesIdentified) {
      const refTotal = (typeof totalHT === "number" && totalHT > 0)
        ? totalHT
        : (marketPosition.totalDevis > 0 ? marketPosition.totalDevis : 0);
      const ratioPct = refTotal > 0 ? Math.round((surcoutMax / refTotal) * 100) : 0;
      const surcoutMid = Math.round((surcoutMin + surcoutMax) / 2);
      const divergenceReason =
        `⚠️ Écart détecté : l'estimation serveur indique un surcoût d'environ ${surcoutMid.toLocaleString("fr-FR")} € ` +
        `(${ratioPct}% du devis) sur les postes comparables au marché, mais l'analyse poste par poste n'a pas identifié ` +
        `de ligne anormalement chère. À approfondir avec l'artisan pour comprendre la composition.`;

      // PREPEND : le message de divergence devient la raison #1, cap à 3 raisons au total
      verdict_reasons.reasons = [divergenceReason, ...verdict_reasons.reasons].slice(0, 3);
      // Summary cohérent avec le message
      verdict_reasons.summary = "Écart détecté — analyse à approfondir avec l'artisan";
    }

    // ── Sanitization finale du verdict_reasons (V3.3) ─────────────────────────
    // Le summary et les reasons sont générés par `generateVerdictReasons` (déterministe),
    // mais l'évolution des wordings au fil du temps peut laisser passer des phrases
    // contradictoires (ex: "cohérent avec les prix du marché" sur un devis avec surcoût).
    // On les fait passer par sanitizeLLMText comme dernier filet de sécurité, en réutilisant
    // les règles ALWAYS_FORBIDDEN (anti-contradiction universelle).
    const finalSanitizeVerdict: "signer" | "a_negocier" | "refuser" = finalVerdictForReasons;
    if (verdict_reasons.summary) {
      verdict_reasons.summary = sanitizeLLMText(verdict_reasons.summary, finalSanitizeVerdict, hasServerSurcout);
    }
    if (Array.isArray(verdict_reasons.reasons)) {
      verdict_reasons.reasons = verdict_reasons.reasons.map(r =>
        sanitizeLLMText(r, finalSanitizeVerdict, hasServerSurcout)
      );
    }

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
      has_anomalies:           sanitizedAnomalies.length > 0 || hasServerSurcout,
      verdict_decisionnel:     verdictDecision as "signer" | "signer_avec_negociation" | "ne_pas_signer",
      surcout_global:          { min: surcoutMin, max: surcoutMax },
      niveau_risque:           niveauRisque,
      actions_avant_signature: rawActions,
      verdict_reasons,
      ...(market_context_note     ? { market_context_note } : {}),
      generated_at:            new Date().toISOString(),
      // V3.2 — version du moteur, permet l'invalidation automatique du cache lors d'un futur fix.
      engine_version:          ENGINE_VERSION,
      // Trace si la garde de cohérence a été déclenchée (utile pour debug / monitoring)
      ...(coherenceEscalated ? { coherence_escalated: true } : {}),
    } as ConclusionData & { engine_version: string; coherence_escalated?: boolean };

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
