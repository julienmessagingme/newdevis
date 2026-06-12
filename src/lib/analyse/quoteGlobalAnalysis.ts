import type { JobTypeDisplayRow } from "@/hooks/useMarketPriceAPI";
import { isLikelyHeterogeneousGroup, type HomogeneityGroupInput } from "@/lib/analyse/groupHomogeneity";
import { hasSurfaceUnitMismatch, surfaceMismatchConfidence, SURFACE_MISMATCH_THRESHOLD, type SurfaceGroup } from "@/lib/analyse/surfaceUtils";

/**
 * Adapte un `JobTypeDisplayRow` (format client) vers `HomogeneityGroupInput`
 * pour pouvoir réutiliser le module partagé `groupHomogeneity.ts` qui attend
 * un format compatible avec le serveur. Le mapping est trivial — les noms de
 * champs sont identiques sauf `mainQuantity` ↔ `main_quantity`.
 */
function rowToHomogeneityInput(row: JobTypeDisplayRow): HomogeneityGroupInput {
  return {
    job_type_label: row.jobTypeLabel,
    main_quantity:  row.mainQuantity,
    devis_total_ht: row.devisTotalHT ?? 0,
    devis_lines:    row.devisLines.map(l => ({
      description: l.description,
      amount_ht:   typeof l.amountHT === "number" ? l.amountHT : undefined,
    })),
    prices: row.prices.map(p => ({
      price_max_unit_ht: typeof (p as { price_max_unit_ht?: number }).price_max_unit_ht === "number"
        ? (p as { price_max_unit_ht: number }).price_max_unit_ht
        : undefined,
    })),
  };
}

// ============================================================
// TYPES
// ============================================================

/**
 * Classification d'un poste individuel par rapport au max marché.
 *
 * V3.4.15 — ajout de `surface_mismatch` : poste facturé en u/forfait sur une
 * prestation surfacique (carrelage, peinture, doublage…) SANS surface précisée
 * dans les lignes. La comparaison au marché (en €/m²) n'est PAS fiable — on
 * affiche un badge jaune "Surface à vérifier" au lieu de "Anomalie marché"
 * (qui serait accusateur sans fondement).
 *
 * Cette classification a priorité sur "anomalie"/"survalue" : un poste avec
 * surface_mismatch ne peut PAS être classé en anomalie (on n'est pas comparable).
 */
export type ItemClassification = "normal" | "legerement_eleve" | "survalue" | "anomalie" | "surface_mismatch" | "low_confidence_match";

/**
 * V3.5.11 (2026-06-09) — Seuils de confidence pour la garde anti-faux-positif.
 *
 * Au-dessus de HIGH (0.85), un match est considéré fiable — anomalie acceptée.
 * Entre MEDIUM (0.70) et HIGH (0.85), c'est tiède : seules les anomalies
 * franches (ratio > 2× max marché) restent, le reste est downgradé en
 * `low_confidence_match` (UI : badge gris "Comparaison incertaine").
 * Sous MEDIUM, le matcher vectoriel V3.5.0 retourne déjà `no_match` (pas de
 * card prix marché du tout) ou `low` (déjà downgradé par les gardes V3.5.9).
 *
 * Cas d'origine : devis Côte Maison Travaux + Florian Miranda où les fausses
 * anomalies "+3 150€" et "+220€" étaient toutes sur des matches similarity
 * 0.70-0.85 que la garde lexicale V3.5.9 laissait passer mais qui restaient
 * sémantiquement bancals.
 */
const CONFIDENCE_THRESHOLD_HIGH = 0.85;
const STRONG_ANOMALY_RATIO_OVERRIDE = 2.0;

/** Verdict global sur l'ensemble du devis */
export type GlobalStatus = "correct" | "a_negocier" | "risque_eleve";

/** Représentation minimale d'un poste pour la synthèse */
export interface QuoteItem {
  label: string;
  price: number;
  marketMin: number;
  marketMax: number;
}

/** Poste classifié avec surcoût calculé */
export interface ClassifiedItem extends QuoteItem {
  classification: ItemClassification;
  /** Montant au-dessus du max marché (0 si dans la fourchette) */
  surcout: number;
}

/** Résultat de l'analyse globale */
export interface GlobalAnalysis {
  /** Verdict global */
  status: GlobalStatus;
  /** Nombre de postes dans chaque catégorie */
  nbNormal: number;
  nbLegerementEleve: number;
  nbSurvalue: number;
  nbAnomalie: number;
  /** V3.4.15 — Postes avec surface mismatch confirmé (badge jaune "Surface à vérifier"). */
  nbSurfaceMismatch: number;
  /** Postes facturés au forfait global — exclus de l'analyse comparative */
  nbForfait: number;
  /** Surcoût brut (Σ price - marketMax pour les postes au-dessus) */
  surcoutEstime: number;
  /** Fourchette basse du surcoût (×0.7) */
  surcoutMin: number;
  /** Fourchette haute du surcoût (×1.3) */
  surcoutMax: number;
  /** Postes classifiés comme "anomalie" */
  anomalieItems: ClassifiedItem[];
  /** Postes classifiés comme "survalue" */
  survalueItems: ClassifiedItem[];
  /** Nombre total de postes ayant une référence marché analysés (hors forfaits) */
  totalItemsAnalyzed: number;
}

// ============================================================
// CLASSIFICATION D'UN POSTE
// ============================================================

/**
 * Classifie un poste selon son écart au max marché.
 *
 *  ≤ marketMax          → normal
 *  marketMax +0..+30%   → legerement_eleve
 *  marketMax +30..+100% → survalue
 *  marketMax > +100%    → anomalie
 */
export function classifyItem(price: number, marketMax: number): ItemClassification {
  if (marketMax <= 0) return "normal"; // pas de référence → neutre
  if (price <= marketMax) return "normal";
  const ratio = price / marketMax; // > 1.0 ici
  if (ratio <= 1.3) return "legerement_eleve";
  if (ratio <= 2.0) return "survalue";
  return "anomalie";
}

// ============================================================
// FONCTION PRINCIPALE
// ============================================================

/**
 * Analyse un tableau de JobTypeDisplayRow (format natif de useMarketPriceAPI)
 * et produit une synthèse globale utilisable pour la prise de décision.
 *
 * Seuls les postes ayant une référence marché (theoreticalMaxHT > 0)
 * et un montant devis connu (devisTotalHT != null) sont pris en compte.
 * Les postes "Autre" (hors catalogue) et les lignes vides sont exclus.
 */
export function analyzeQuoteGlobal(rows: JobTypeDisplayRow[]): GlobalAnalysis {
  // Forfaits : présents dans le catalogue mais comparaison non fiable → exclus du verdict
  const forfaitRows = rows.filter(
    (row) =>
      row.isForfait &&
      row.devisLines.length > 0 &&
      row.jobTypeLabel !== "Autre" &&
      row.theoreticalMaxHT > 0 &&
      row.devisTotalHT !== null,
  );

  // Filtrer les postes comparables (hors forfaits)
  const analyzable = rows.filter(
    (row) =>
      !row.isForfait &&
      row.devisLines.length > 0 &&
      row.jobTypeLabel !== "Autre" &&
      row.theoreticalMaxHT > 0 &&
      row.devisTotalHT !== null,
  );

  let nbNormal = 0;
  let nbLegerementEleve = 0;
  let nbSurvalue = 0;
  let nbAnomalie = 0;
  let nbSurfaceMismatch = 0;
  let surcoutEstime = 0;

  const anomalieItems: ClassifiedItem[] = [];
  const survalueItems: ClassifiedItem[] = [];

  for (const row of analyzable) {
    const price = row.devisTotalHT!;
    const marketMax = row.theoreticalMaxHT;
    const surcout = price > marketMax ? price - marketMax : 0;

    // V3.4.22 (2026-05-21) — Source de vérité UNIQUE via classifyRowEnriched().
    // Avant : la classification était dupliquée (logique inline ici + fonction
    // classifyRow plus légère) → divergence systématique (pastille = 2, cartes = 4).
    // Désormais : les 2 consommateurs (pastille de répartition + badges de cartes)
    // partagent EXACTEMENT cette même fonction. Garantie de cohérence.
    // Filtres appliqués (dans l'ordre) :
    //   1. surface_mismatch (V3.4.15) — prestation surfacique sans surface
    //   2. downgrade hétérogène (V3.4) — groupe Gemini mélangé → "legerement_eleve"
    //   3. upgrade ligne (V3.3.2) — ligne individuelle > 1.5× → "anomalie"
    const classification: ItemClassification = classifyRowEnriched(row) ?? "normal";

    surcoutEstime += surcout;

    const item: ClassifiedItem = {
      label: row.jobTypeLabel,
      price,
      marketMin: row.theoreticalMinHT,
      marketMax,
      classification,
      surcout,
    };

    switch (classification) {
      case "normal":
        nbNormal++;
        break;
      case "legerement_eleve":
        nbLegerementEleve++;
        break;
      case "survalue":
        nbSurvalue++;
        survalueItems.push(item);
        break;
      case "anomalie":
        nbAnomalie++;
        anomalieItems.push(item);
        break;
      case "surface_mismatch":
        // V3.4.15 — compté à part. Pas dans anomalieItems (la comparaison
        // n'est pas fiable au €/m²) mais visible dans la répartition.
        nbSurfaceMismatch++;
        break;
      case "low_confidence_match":
        // V3.5.11 — anomalie/survalue downgradée car match vectoriel <0.85
        // (zone medium). Ni "normal" (pour ne pas masquer la réserve), ni
        // "anomalie" (pour ne pas hurler sur un match incertain). Compté
        // dans nbNormal pour ne pas polluer le verdict global.
        nbNormal++;
        break;
    }
  }

  // Statut global — anomalies en premier (priorité maximale)
  // RÈGLE 2 : tout poste "survalue" (+30 % au-dessus du max marché) déclenche a_negocier.
  // Un seul poste anomalie suffit. Plusieurs anomalies → risque_eleve.
  // V3.4.15 — ajout règle surface_mismatch : ≥3 postes "Surface à vérifier"
  // déclenche a_negocier (sans surface, on ne peut pas valider, donc à clarifier).
  let status: GlobalStatus;
  if (nbAnomalie >= 2) {
    status = "risque_eleve";
  } else if (nbAnomalie >= 1 || nbSurvalue >= 1 || nbSurfaceMismatch >= 3) {
    status = "a_negocier";
  } else {
    status = "correct";
  }

  return {
    status,
    nbNormal,
    nbLegerementEleve,
    nbSurvalue,
    nbAnomalie,
    nbSurfaceMismatch,
    nbForfait: forfaitRows.length,
    surcoutEstime: Math.round(surcoutEstime),
    surcoutMin: Math.round(surcoutEstime * 0.7),
    surcoutMax: Math.round(surcoutEstime * 1.3),
    anomalieItems,
    survalueItems,
    totalItemsAnalyzed: analyzable.length,
  };
}

// ============================================================
// HELPER UNIFIÉ — classification enrichie d'une row
// ============================================================

/**
 * V3.4.22 (2026-05-21) — Source de vérité UNIQUE pour la classification
 * d'un poste, partagée entre :
 *   - les badges des cartes (BlockPrixMarche.tsx via classifyRow)
 *   - la pastille de répartition (GlobalAnalysisCard via analyzeQuoteGlobal)
 *
 * Avant V3.4.22, ces 2 consommateurs appliquaient des règles différentes :
 *   - classifyRow : ratio brut + surface_mismatch SEUL
 *   - analyzeQuoteGlobal : ratio + surface_mismatch + downgrade hétérogène
 *                          + upgrade ligne (V3.3.2)
 * → Conséquence : 4 cartes rouges "Anomalie marché" mais pastille "2 Prix anormal".
 *
 * Désormais, les 2 partagent EXACTEMENT cette fonction. Garantie de cohérence.
 *
 * Retourne null si le poste n'est pas comparable (forfait, hors catalogue, etc.)
 * — auquel cas le BlockPrixMarche n'affiche aucun badge.
 */
export function classifyRowEnriched(
  row: JobTypeDisplayRow,
): ItemClassification | null {
  if (
    row.isForfait ||
    row.jobTypeLabel === "Autre" ||
    row.theoreticalMaxHT <= 0 ||
    row.devisTotalHT === null
  ) {
    return null;
  }

  const price = row.devisTotalHT;
  const marketMax = row.theoreticalMaxHT;
  let classification: ItemClassification = classifyItem(price, marketMax);

  // ── Garde 1 — Surface mismatch (V3.4.15) ──────────────────────────────────
  // Prestations surfaciques sans surface précisée → "Surface à vérifier"
  // au lieu d'anomalie (comparaison au €/m² non fiable).
  const surfaceInput: SurfaceGroup = {
    label: row.jobTypeLabel,
    unit: row.mainUnit ?? "",
    lines: row.devisLines.map(l => ({
      description: l.description,
      unit: l.unit,
      quantity: typeof l.quantity === "number" ? l.quantity : null,
    })),
    mainQuantity: row.mainQuantity,
  };
  if (surfaceMismatchConfidence(surfaceInput) >= SURFACE_MISMATCH_THRESHOLD) {
    return "surface_mismatch";
  }

  // ── Garde 2 — Downgrade groupes hétérogènes (V3.4) ────────────────────────
  // Si Gemini a mélangé plusieurs lots dans un seul groupe (chape + carrelage
  // + sanitaires), la comparaison au catalogue est fausse. On downgrade
  // anomalie/survalue à "legerement_eleve" pour ne pas crier "Anomalie marché"
  // sur ce qui est en réalité un groupement imparfait.
  const isHeterogeneous = isLikelyHeterogeneousGroup(rowToHomogeneityInput(row));
  if (isHeterogeneous && (classification === "anomalie" || classification === "survalue")) {
    classification = "legerement_eleve";
  }
  const wasDowngradedHeterogeneous = isHeterogeneous;

  // ── Garde 4 — Confidence vectorielle (V3.5.11 — 2026-06-09) ──────────────
  //
  // Le matcher vectoriel V3.5.0 garde aveuglément le top-1 cosine dès que
  // similarity ≥ 0.50 (puis filtré par les gardes lexicales V3.5.9). Mais sur
  // la zone tiède 0.70-0.85 (confidence="medium"), même après les gardes V3.5.9
  // certains matchs restent sémantiquement bancals.
  //
  // Politique anti-hallucination conservatrice : on n'affiche une anomalie
  // ROUGE que si le match est `high` (similarity ≥ 0.85) OU si le ratio prix
  // est franchement aberrant (devis > 2× max marché — signal fort qui résiste
  // à un match imparfait).
  //
  // Pour les matches `medium` ou `low` avec un ratio modéré, on bascule en
  // `low_confidence_match` → badge UI gris "Comparaison incertaine" au lieu
  // de "🔴 Anomalie marché". Le user voit qu'il y a une réserve, on n'invente
  // pas d'alerte franche sur un match qu'on n'est pas sûr.
  //
  // Cas d'origine : devis Côte Maison Travaux + Florian Miranda où des cards
  // rouges fausses étaient affichées sur des matchs cosine ~0.74-0.82.
  const vectorialConfidence = row.vectorial?.confidence;
  const topSimilarity = row.vectorial?.top_similarity ?? null;
  const isHighConfidence =
    vectorialConfidence === "high" ||
    (topSimilarity !== null && topSimilarity >= CONFIDENCE_THRESHOLD_HIGH) ||
    // Pas de méta vectorielle → pipeline legacy V3.6, on n'applique pas la garde
    vectorialConfidence === undefined;

  if (!isHighConfidence && (classification === "anomalie" || classification === "survalue")) {
    const ratio = marketMax > 0 ? price / marketMax : 1;
    const isStrongAnomaly = ratio >= STRONG_ANOMALY_RATIO_OVERRIDE;
    if (!isStrongAnomaly) {
      return "low_confidence_match";
    }
    // Ratio ≥ 2× max marché → l'anomalie est trop évidente pour être rejetée
    // par le seul argument de confidence. On garde "anomalie".
  }

  // ── Garde 5 — Upgrade ligne (V3.3.2) ──────────────────────────────────────
  // Si une ligne individuelle du groupe dépasse > 1.5× le prix unitaire max
  // marché, on upgrade le groupe en "anomalie" même si le total semble normal.
  // (Pas appliqué si downgrade hétérogène — la comparaison serait fausse pour
  // la même raison.)
  if ((classification === "normal" || classification === "legerement_eleve") && !wasDowngradedHeterogeneous) {
    const mainUnit = row.mainUnit?.toLowerCase().trim() || "";
    const mainQty  = row.mainQuantity > 0 ? row.mainQuantity : 0;
    const unitMaxMarket = mainQty > 0 ? marketMax / mainQty : 0;

    if (unitMaxMarket > 0) {
      const lineAnomalyDetected = row.devisLines.some(line => {
        const lineUnit = (line.unit || "").toLowerCase().trim();
        const lineQty  = typeof line.quantity === "number" ? line.quantity : 0;
        const lineAmt  = typeof line.amountHT === "number" ? line.amountHT : 0;
        const sameUnit = lineUnit === mainUnit
          || (lineUnit.includes("m²") && mainUnit.includes("m²"))
          || (lineUnit.includes("m2") && mainUnit.includes("m2"));
        if (!sameUnit || lineQty <= 0 || lineAmt <= 0) return false;
        const lineUnitPrice = lineAmt / lineQty;
        return lineUnitPrice > unitMaxMarket * 1.5;
      });
      if (lineAnomalyDetected) {
        classification = "anomalie";
      }
    }
  }

  return classification;
}

/**
 * Alias compatibilité — utilisé par BlockPrixMarche.tsx pour décider du badge
 * affiché sur chaque carte. Délègue à classifyRowEnriched() pour garantir que
 * pastille de répartition et badges de cartes sont 100% cohérents.
 *
 * Compat rétro : tout consommateur qui appelle `classifyRow` voit désormais
 * la classification enrichie (pas juste le ratio brut). Pas de breaking change
 * sur l'API publique.
 */
export function classifyRow(
  row: JobTypeDisplayRow,
): ItemClassification | null {
  return classifyRowEnriched(row);
}
