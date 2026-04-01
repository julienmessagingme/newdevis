import type { JobTypeDisplayRow } from "@/hooks/useMarketPriceAPI";

// ============================================================
// TYPES
// ============================================================

/** Classification d'un poste individuel par rapport au max marché */
export type ItemClassification = "normal" | "legerement_eleve" | "survalue" | "anomalie";

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
  let surcoutEstime = 0;

  const anomalieItems: ClassifiedItem[] = [];
  const survalueItems: ClassifiedItem[] = [];

  for (const row of analyzable) {
    const price = row.devisTotalHT!;
    const marketMax = row.theoreticalMaxHT;
    const classification = classifyItem(price, marketMax);
    const surcout = price > marketMax ? price - marketMax : 0;

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
    }
  }

  // Statut global — anomalies en premier (priorité maximale)
  let status: GlobalStatus;
  if (nbAnomalie >= 2) {
    status = "risque_eleve";
  } else if (nbSurvalue >= 5) {
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
// HELPER — classification rapide d'une row pour les badges
// ============================================================

/**
 * Retourne la classification d'une JobTypeDisplayRow ou null
 * si le poste n'est pas comparable (hors catalogue, pas de montant…).
 */
export function classifyRow(
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
  return classifyItem(row.devisTotalHT, row.theoreticalMaxHT);
}
