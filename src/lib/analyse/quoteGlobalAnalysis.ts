import type { JobTypeDisplayRow } from "@/hooks/useMarketPriceAPI";
import { isLikelyHeterogeneousGroup, type HomogeneityGroupInput } from "@/lib/analyse/groupHomogeneity";

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
    let classification = classifyItem(price, marketMax);
    const surcout = price > marketMax ? price - marketMax : 0;

    // ──────────────────────────────────────────────────────────────────────
    // V3.4 Niveaux 1+2 — Garde-fou groupes hétérogènes via module partagé.
    //
    // Si un groupe est probablement mal regroupé par Gemini (chape + primaire +
    // dalle + acier dans un seul "Carrelage"), le prix unitaire calculé est
    // aberrant. Dans ce cas, on REFUSE de classer en anomalie ou survalue —
    // le KPI doit être prudent (faux positif > faux négatif côté crédibilité).
    //
    // La détection combine :
    //   - Niveau 2 : scoring sémantique sur les descriptions des lignes (prioritaire)
    //   - Niveau 1 : critère ratio prix unitaire > 2× max marché (fallback)
    // Voir `src/lib/analyse/groupHomogeneity.ts` pour le détail de l'algorithme.
    // ──────────────────────────────────────────────────────────────────────
    const isHeterogeneous = isLikelyHeterogeneousGroup(rowToHomogeneityInput(row));
    if (isHeterogeneous && (classification === "anomalie" || classification === "survalue")) {
      // Downgrade à "legerement_eleve" — le wording UI passe en "Comparaison
      // indicative" plutôt qu'"Anomalie marché".
      classification = "legerement_eleve";
    }

    // Si groupe hétérogène, la détection d'anomalies par LIGNE (V3.3.2) ne doit
    // pas non plus s'appliquer — la comparaison serait fausse pour la même raison.
    const wasDowngradedHeterogeneous = isHeterogeneous;

    // V3.3.2 (2026-05-11) — Détection d'anomalies au niveau LIGNE individuelle.
    //
    // Avant : seul le total du groupe était comparé au marché. Un groupe avec 37 m²
    // de carrelage à 2 822€ pouvait être classé "normal" (vs 1702-3478€ marché)
    // alors qu'une LIGNE individuelle dans le groupe facturait 209€/m² (vs 46-94 attendu).
    // → contradiction avec le verdict expert qui remonte bien ces anomalies de ligne.
    //
    // Désormais : on scanne aussi les devis_lines individuelles. Si une ligne dépasse
    // >50% son prix unitaire max marché, le groupe est upgradé en "anomalie" (à moins
    // qu'il ne le soit déjà). Garde stricte pour éviter les faux positifs :
    //   - line.unit doit matcher mainUnit (ou les deux doivent être en m²)
    //   - line.quantity > 0
    //   - line.amountHT > 0
    if ((classification === "normal" || classification === "legerement_eleve") && !wasDowngradedHeterogeneous) {
      const mainUnit = row.mainUnit?.toLowerCase().trim() || "";
      const mainQty  = row.mainQuantity > 0 ? row.mainQuantity : 0;
      const unitMaxMarket = mainQty > 0 ? marketMax / mainQty : 0;

      if (unitMaxMarket > 0) {
        const lineAnomalyDetected = row.devisLines.some(line => {
          const lineUnit = (line.unit || "").toLowerCase().trim();
          const lineQty  = typeof line.quantity === "number" ? line.quantity : 0;
          const lineAmt  = typeof line.amountHT === "number" ? line.amountHT : 0;
          // Unité ligne doit matcher unité groupe (sinon comparaison invalide)
          const sameUnit = lineUnit === mainUnit
            || (lineUnit.includes("m²") && mainUnit.includes("m²"))
            || (lineUnit.includes("m2") && mainUnit.includes("m2"));
          if (!sameUnit || lineQty <= 0 || lineAmt <= 0) return false;
          const lineUnitPrice = lineAmt / lineQty;
          // Seuil : ligne anormale si > 1.5× le prix unitaire max marché
          return lineUnitPrice > unitMaxMarket * 1.5;
        });
        if (lineAnomalyDetected) {
          classification = "anomalie";
        }
      }
    }

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
  // RÈGLE 2 : tout poste "survalue" (+30 % au-dessus du max marché) déclenche a_negocier.
  // Un seul poste anomalie suffit. Plusieurs anomalies → risque_eleve.
  let status: GlobalStatus;
  if (nbAnomalie >= 2) {
    status = "risque_eleve";
  } else if (nbAnomalie >= 1 || nbSurvalue >= 1) {
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
