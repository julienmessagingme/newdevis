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
    const ratingMatch = point.match(/[rR]éputation en ligne.*?(\d+(?:[.,]\d+)?)\s*\/\s*5.*?\((\d+)\s*avis/i);
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
    // Case C: Not found but searched
    else if (lowerPoint.includes("réputation en ligne") && (lowerPoint.includes("aucun avis") || lowerPoint.includes("non trouvé") || lowerPoint.includes("non disponible"))) {
      reputationSearched = true;
      reputation = {
        score: "ORANGE",
        explanation: point,
        status: "not_found"
      };
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
  // ROUGE: ONLY for CONFIRMED critical issues
  // ORANGE: Minor vigilance points
  // VERT: No issues
  // CRITICAL: not_found / error / informational → NEVER ROUGE
  // ============================================================

  const criticalAlertCount = alertes.filter(a =>
    a.includes("🔴") &&
    !isInformational(a) &&
    (a.toLowerCase().includes("procédure collective") ||
     a.toLowerCase().includes("résultat net négatif") ||
     a.toLowerCase().includes("endettement très élevé") ||
     a.toLowerCase().includes("pertes importantes") ||
     a.toLowerCase().includes("radiée") ||
     a.toLowerCase().includes("cessation") ||
     a.toLowerCase().includes("dissoute") ||
     a.toLowerCase().includes("liquidation"))
  ).length;

  let score: "VERT" | "ORANGE" | "ROUGE";
  if (procedureCollective === true || criticalAlertCount > 0) {
    score = "ROUGE";
  } else if (alertCount > 0 && lookupStatus !== "not_found" && lookupStatus !== "error") {
    score = "ORANGE";
  } else if (positiveCount < 2 && lookupStatus !== "ok") {
    score = "ORANGE";
  } else if (positiveCount >= 2) {
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
