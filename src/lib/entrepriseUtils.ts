// ============================================================
// TYPES
// ============================================================

export interface ReputationOnline {
  rating?: number;
  reviews_count?: number;
  score: "VERT" | "ORANGE" | "ROUGE";
  explanation: string;
  status: "found" | "uncertain" | "not_found" | "not_searched";
}

export interface EntrepriseInfo {
  siren_siret: string | null;
  anciennete: string | null;
  financesDisponibles: boolean | null;
  resultatNet: string | null;
  chiffreAffaires: string | null;
  autonomieFinanciere: string | null;
  tauxEndettement: string | null;
  ratioLiquidite: string | null;
  procedureCollective: boolean | null;
  reputation: ReputationOnline | null;
  score: "VERT" | "ORANGE" | "ROUGE";
}

// ============================================================
// EXTRACTION FUNCTION
// ============================================================

// Helper: Check if point is informational (ℹ️) - these NEVER count as alerts
const isInformational = (point: string): boolean => {
  return point.includes("ℹ️") ||
         point.toLowerCase().includes("non concluante") ||
         point.toLowerCase().includes("indisponible temporairement") ||
         point.toLowerCase().includes("n'indique pas un problème") ||
         point.toLowerCase().includes("n'indique pas un risque");
};

export const extractEntrepriseData = (pointsOk: string[], alertes: string[]): EntrepriseInfo => {
  const allPoints = [...pointsOk, ...alertes];

  let siren_siret: string | null = null;
  let anciennete: string | null = null;
  let financesDisponibles: boolean | null = null;
  let resultatNet: string | null = null;
  let chiffreAffaires: string | null = null;
  let autonomieFinanciere: string | null = null;
  let tauxEndettement: string | null = null;
  let ratioLiquidite: string | null = null;
  let procedureCollective: boolean | null = null;
  let reputation: ReputationOnline | null = null;
  let positiveCount = 0;
  let alertCount = 0;
  let lookupStatus: "ok" | "not_found" | "error" | "skipped" | null = null;

  // Track if we found any reputation-related info
  let reputationSearched = false;

  for (const point of allPoints) {
    const lowerPoint = point.toLowerCase();

    // CRITICAL: Detect lookup status from messages
    if (lowerPoint.includes("vérification registre non concluante") ||
        lowerPoint.includes("recherche non concluante")) {
      lookupStatus = "not_found";
    } else if (lowerPoint.includes("vérification registre indisponible")) {
      lookupStatus = "error";
    } else if (lowerPoint.includes("entreprise identifiée")) {
      lookupStatus = "ok";
    }

    // Extract SIREN/SIRET
    if (lowerPoint.includes("siret") || lowerPoint.includes("siren")) {
      const match = point.match(/(\d{9,14})/);
      if (match) {
        siren_siret = match[1];
      }
      // CRITICAL: Informational points (ℹ️) NEVER count as alerts
      if (isInformational(point)) {
        // Neutral - no impact on score
      } else if (lowerPoint.includes("valide") || pointsOk.includes(point)) {
        positiveCount++;
      } else if (alertes.includes(point) && !isInformational(point)) {
        alertCount++;
      }
    }

    // Extract ancienneté
    if (lowerPoint.includes("ancienneté") || lowerPoint.includes("anciennete") || lowerPoint.includes("créée") || lowerPoint.includes("immatriculée")) {
      const yearMatch = point.match(/(\d{4})/);
      const durationMatch = point.match(/(\d+)\s*an/i);
      if (yearMatch) {
        anciennete = `Depuis ${yearMatch[1]}`;
      } else if (durationMatch) {
        anciennete = `${durationMatch[1]} ans d'activité`;
      }
      if (pointsOk.includes(point)) {
        positiveCount++;
      }
    }

    // Extract financial data
    if (lowerPoint.includes("données financières")) {
      financesDisponibles = lowerPoint.includes("disponible");
      if (financesDisponibles && pointsOk.includes(point)) {
        positiveCount++;
      }
    }

    if (lowerPoint.includes("chiffre d'affaires") || lowerPoint.includes("chiffre d\u2019affaires")) {
      const match = point.match(/([\d\s,.]+)\s*€/);
      if (match) {
        chiffreAffaires = match[1].trim() + " €";
      }
    }

    if (lowerPoint.includes("résultat net")) {
      if (lowerPoint.includes("négatif") || alertes.includes(point)) {
        resultatNet = "Négatif";
        alertCount++;
      } else if (lowerPoint.includes("positif")) {
        resultatNet = "Positif";
        positiveCount++;
      }
    }

    if (lowerPoint.includes("autonomie financière")) {
      const match = point.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (match) {
        autonomieFinanciere = match[1] + "%";
      }
      if (pointsOk.includes(point)) {
        positiveCount++;
      }
    }

    if (lowerPoint.includes("endettement")) {
      const match = point.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (match) {
        tauxEndettement = match[1] + "%";
      }
      if (alertes.includes(point)) {
        alertCount++;
      }
    }

    if (lowerPoint.includes("liquidité")) {
      const match = point.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (match) {
        ratioLiquidite = match[1] + "%";
      }
      if (alertes.includes(point)) {
        alertCount++;
      }
    }

    // Extract procedure collective
    if (lowerPoint.includes("procédure collective") || lowerPoint.includes("redressement") || lowerPoint.includes("liquidation")) {
      procedureCollective = !lowerPoint.includes("aucune") && !lowerPoint.includes("néant");
      if (procedureCollective) {
        alertCount += 2;
      } else {
        positiveCount++;
      }
    }

    // Extract reputation - Case A: Rating found
    // Matches both "Réputation en ligne : X/5 (Y avis)" AND "Note Google : X/5 (Y avis)"
    const ratingMatch = point.match(/(?:réputation en ligne|note google).*?(\d+(?:[.,]\d+)?)\s*\/\s*5.*?\((\d+)\s*avis/i);
    if (ratingMatch) {
      reputationSearched = true;
      const rating = parseFloat(ratingMatch[1].replace(',', '.'));
      const reviewsCount = parseInt(ratingMatch[2], 10);

      // IMPORTANT: Reputation NEVER triggers ROUGE
      let score: "VERT" | "ORANGE";
      if (rating >= 4.0) {
        score = "VERT";
        positiveCount++;
      } else {
        score = "ORANGE";
      }

      reputation = {
        rating,
        reviews_count: reviewsCount,
        score,
        explanation: point,
        status: "found"
      };
    }
    // Case B: Uncertain match
    else if (lowerPoint.includes("réputation en ligne") && (lowerPoint.includes("correspondance incertaine") || lowerPoint.includes("incertaine") || lowerPoint.includes("à confirmer"))) {
      reputationSearched = true;
      reputation = {
        score: "ORANGE",
        explanation: "Note non affichée (correspondance à confirmer)",
        status: "uncertain"
      };
    }
    // Case C: Not found via "réputation en ligne" format
    else if (lowerPoint.includes("réputation en ligne") && (lowerPoint.includes("aucun avis") || lowerPoint.includes("non trouvé") || lowerPoint.includes("non disponible"))) {
      reputationSearched = true;
      reputation = {
        score: "ORANGE",
        explanation: point,
        status: "not_found"
      };
    }
    // Case C2: Not found via "Aucun avis Google trouvé" format (render.ts / score.ts)
    else if (lowerPoint.includes("aucun avis google") && lowerPoint.includes("trouvé")) {
      reputationSearched = true;
      if (!reputation) {
        reputation = {
          score: "ORANGE",
          explanation: point,
          status: "not_found"
        };
      }
    }
  }

  // ALWAYS show reputation block if company is identifiable
  if (!reputation) {
    if (siren_siret) {
      reputation = {
        score: "ORANGE",
        explanation: reputationSearched ? "Recherche effectuée" : "Recherche en attente",
        status: reputationSearched ? "not_found" : "not_searched"
      };
    } else {
      reputation = {
        score: "ORANGE",
        explanation: "Entreprise non identifiable avec certitude",
        status: "not_searched"
      };
    }
  }

  // ============================================================
  // SCORING RULES
  // ============================================================
  // ROUGE: procédure collective ou alerte financière critique confirmée
  // VERT: entreprise identifiée + pas de procédure collective + (bonne réputation Google OU pas de Google)
  // ORANGE: tout le reste
  // ============================================================

  const hasCriticalAlert = alertes.some(a =>
    a.includes("🔴") &&
    !isInformational(a) &&
    (a.toLowerCase().includes("procédure collective") ||
     a.toLowerCase().includes("endettement très élevé") ||
     a.toLowerCase().includes("pertes importantes") ||
     a.toLowerCase().includes("radiée") ||
     a.toLowerCase().includes("cessation") ||
     a.toLowerCase().includes("dissoute") ||
     a.toLowerCase().includes("liquidation") ||
     a.toLowerCase().includes("comptes non déposés"))
  );

  // Réputation Google : considérée bonne si >= 4.0 OU si pas de données Google (pas pénalisant)
  const googleOk = !reputation || reputation.status !== "found" || (reputation.rating !== undefined && reputation.rating >= 4.0);

  let score: "VERT" | "ORANGE" | "ROUGE";
  if (procedureCollective === true || hasCriticalAlert) {
    score = "ROUGE";
  } else if (lookupStatus === "ok" && !procedureCollective && googleOk) {
    // Entreprise identifiée, pas de procédure collective, réputation OK (ou pas de Google)
    score = "VERT";
  } else {
    score = "ORANGE";
  }

  return {
    siren_siret,
    anciennete,
    financesDisponibles,
    resultatNet,
    chiffreAffaires,
    autonomieFinanciere,
    tauxEndettement,
    ratioLiquidite,
    procedureCollective,
    reputation,
    score
  };
};

// ============================================================
// FINANCIAL HEALTH — Types and Computation
// ============================================================

export interface FinancialRatios {
  date_cloture: string;
  chiffre_affaires: number | null;
  resultat_net: number | null;
  taux_endettement: number | null;
  ratio_liquidite: number | null;
  autonomie_financiere: number | null;
  capacite_remboursement: number | null;
  marge_ebe: number | null;
}

export type FinancialHealthStatus = "VERT" | "ORANGE" | "ROUGE" | "NO_DATA";

export interface FinancialHealthData {
  status: FinancialHealthStatus;
  dernier_exercice_year: string | null;
  isStale: boolean;
  orangeSignals: string[];
  exercises: FinancialRatios[];   // up to 3, most recent first
  latestRatios: FinancialRatios | null;
}

/**
 * Compute a dedicated financial health sub-score for the "Santé financière (comptes)" row.
 * Does NOT affect the global block score (info.score from extractEntrepriseData).
 *
 * ROUGE  : procédure collective OR entreprise radiée
 * ORANGE : ancienneté < 3 ans | données >= 2 ans | CA en baisse 2 exercices consécutifs | résultat net passé de positif à négatif
 * VERT   : sinon
 * NO_DATA: aucun exercice disponible (micro-entreprise, bilan non publié…)
 */
export const computeFinancialHealth = (
  finances: FinancialRatios[],
  procedure_collective: boolean | null,
  anciennete_annees: number | null,
  entreprise_radiee: boolean | null
): FinancialHealthData => {
  const exercises = (finances || []).slice(0, 3); // max 3 exercices affichés
  const latestRatios = exercises[0] ?? null;
  const year = latestRatios?.date_cloture
    ? latestRatios.date_cloture.substring(0, 4)
    : null;

  // ROUGE : procédure collective ou entreprise radiée
  if (procedure_collective === true || entreprise_radiee === true) {
    return {
      status: "ROUGE",
      dernier_exercice_year: year,
      isStale: false,
      orangeSignals: [],
      exercises,
      latestRatios,
    };
  }

  // NO_DATA : aucun exercice (micro-entreprise, auto-entrepreneur, bilan non déposé)
  if (!exercises.length || !latestRatios) {
    return {
      status: "NO_DATA",
      dernier_exercice_year: null,
      isStale: false,
      orangeSignals: [],
      exercises: [],
      latestRatios: null,
    };
  }

  // Vérification ancienneté des données (>= 2 ans = non récentes)
  let isStale = false;
  if (latestRatios.date_cloture) {
    const closureDate = new Date(latestRatios.date_cloture);
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    isStale = closureDate <= twoYearsAgo;
  }

  const orangeSignals: string[] = [];

  // Signal 1 : données non récentes
  if (isStale) {
    orangeSignals.push("stale");
  }

  // Signal 2 : entreprise récente (< 3 ans)
  if (anciennete_annees !== null && anciennete_annees < 3) {
    orangeSignals.push("recent");
  }

  // Signal 3 : tendance CA en baisse sur 2 exercices consécutifs (besoin de 3 points)
  if (
    exercises.length >= 3 &&
    exercises[0].chiffre_affaires !== null &&
    exercises[1].chiffre_affaires !== null &&
    exercises[2].chiffre_affaires !== null &&
    exercises[0].chiffre_affaires < exercises[1].chiffre_affaires &&
    exercises[1].chiffre_affaires < exercises[2].chiffre_affaires
  ) {
    orangeSignals.push("ca_decline_2y");
  }

  // Signal 4 : résultat net passé de positif (N-1) à négatif (N)
  if (
    latestRatios.resultat_net !== null &&
    latestRatios.resultat_net < 0 &&
    exercises.length >= 2 &&
    exercises[1].resultat_net !== null &&
    exercises[1].resultat_net >= 0
  ) {
    orangeSignals.push("resultat_turned_negative");
  }

  return {
    status: orangeSignals.length > 0 ? "ORANGE" : "VERT",
    dernier_exercice_year: year,
    isStale,
    orangeSignals,
    exercises,
    latestRatios,
  };
};

// ============================================================
// FILTER FUNCTION
// ============================================================

export const filterOutEntrepriseItems = (items: string[]): string[] => {
  return items.filter(item => {
    const lower = item.toLowerCase();
    return !lower.includes("siret") &&
           !lower.includes("siren") &&
           !lower.includes("ancienneté") &&
           !lower.includes("anciennete") &&
           !lower.includes("créée") &&
           !lower.includes("immatriculée") &&
           !lower.includes("données financières") &&
           !lower.includes("donnée financière") &&
           !lower.includes("vérification financière") &&
           !lower.includes("chiffre d'affaires") &&
           !lower.includes("résultat net") &&
           !lower.includes("autonomie financière") &&
           !lower.includes("endettement") &&
           !lower.includes("liquidité") &&
           !lower.includes("procédure collective") &&
           !lower.includes("redressement") &&
           !lower.includes("liquidation") &&
           !lower.includes("réputation en ligne") &&
           !lower.includes("avis google") &&
           !lower.includes("entreprise identifiée") &&
           !lower.includes("entreprise établie") &&
           !lower.includes("entreprise récente") &&
           !lower.includes("vérification registre") &&
           !lower.includes("recherche non concluante") &&
           !lower.includes("societe.com") &&
           !lower.includes("infogreffe") &&
           !lower.includes("établissement non trouvé") &&
           !lower.includes("qualification rge") &&
           !lower.includes("qualibat");
  });
};
