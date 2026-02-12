// ============================================================
// TYPES
// ============================================================

export interface DevisInfo {
  prixTotal: string | null;
  prixTotalNumber: number | null;
  comparaisonMarche: string | null;
  prixMarcheFourchette: string | null;
  prixMinMarche: number | null;
  prixMaxMarche: number | null;
  ecart: "normal" | "elevé" | "tres_elevé" | "inferieur" | null;
  detailMoDoeuvre: boolean | null;
  detailMateriaux: boolean | null;
  tvaApplicable: string | null;
  acomptePourcentage: number | null;
  score: "VERT" | "ORANGE" | "ROUGE";
  explanations: string[];
  hasDevisRelatedInfo: boolean;
}

// ============================================================
// EXTRACTION FUNCTION
// ============================================================

const parsePrice = (priceStr: string): number | null => {
  const cleaned = priceStr.replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
};

export const extractDevisData = (pointsOk: string[], alertes: string[]): DevisInfo => {
  const allPoints = [...pointsOk, ...alertes];

  let prixTotal: string | null = null;
  let prixTotalNumber: number | null = null;
  let comparaisonMarche: string | null = null;
  let prixMarcheFourchette: string | null = null;
  let prixMinMarche: number | null = null;
  let prixMaxMarche: number | null = null;
  let ecart: "normal" | "elevé" | "tres_elevé" | "inferieur" | null = null;
  let detailMoDoeuvre: boolean | null = null;
  let detailMateriaux: boolean | null = null;
  let tvaApplicable: string | null = null;
  let acomptePourcentage: number | null = null;
  let positiveCount = 0;
  let alertCount = 0;
  const explanations: string[] = [];
  let hasDevisRelatedInfo = false;

  for (const point of allPoints) {
    const lowerPoint = point.toLowerCase();

    // Detect if there's any devis-related content
    if (lowerPoint.includes("prix") || lowerPoint.includes("montant") ||
        lowerPoint.includes("devis") || lowerPoint.includes("total") ||
        lowerPoint.includes("ht") || lowerPoint.includes("ttc") ||
        lowerPoint.includes("calcul") || lowerPoint.includes("cohéren") ||
        lowerPoint.includes("main d'œuvre") || lowerPoint.includes("main-d'œuvre") ||
        lowerPoint.includes("main d'oeuvre") || lowerPoint.includes("matéri") ||
        lowerPoint.includes("fourniture") || lowerPoint.includes("tva") ||
        lowerPoint.includes("remise") || lowerPoint.includes("tarif")) {
      hasDevisRelatedInfo = true;
    }

    // Extract prix total
    const prixMatch = point.match(/(?:prix|montant|total)[^\d]*([\d\s,\.]+)\s*€/i);
    if (prixMatch && !lowerPoint.includes("marché") && !lowerPoint.includes("fourchette")) {
      prixTotal = prixMatch[1].trim() + " €";
      prixTotalNumber = parsePrice(prixMatch[1]);
    }

    // Extract comparaison marché
    if (lowerPoint.includes("marché") || lowerPoint.includes("fourchette") || lowerPoint.includes("prix de référence")) {
      if (lowerPoint.includes("conforme") || lowerPoint.includes("dans la fourchette") || lowerPoint.includes("cohérent")) {
        comparaisonMarche = "Conforme au marché";
        ecart = "normal";
        positiveCount++;
      } else if (lowerPoint.includes("supérieur") || lowerPoint.includes("élevé")) {
        if (lowerPoint.includes("très") || lowerPoint.includes("significativement")) {
          comparaisonMarche = "Très supérieur au marché";
          ecart = "tres_elevé";
          alertCount += 2;
          explanations.push("Le prix est significativement supérieur aux références du marché pour ce type de travaux.");
        } else {
          comparaisonMarche = "Supérieur au marché";
          ecart = "elevé";
          alertCount++;
          explanations.push("Le prix est supérieur à la moyenne du marché. Il peut être justifié par des spécificités du chantier.");
        }
      } else if (lowerPoint.includes("inférieur")) {
        comparaisonMarche = "Inférieur au marché";
        ecart = "inferieur";
        positiveCount++;
      }

      // Try to extract fourchette
      const fourchetteMatch = point.match(/([\d\s,\.]+)\s*€?\s*[-–à]\s*([\d\s,\.]+)\s*€/);
      if (fourchetteMatch) {
        prixMarcheFourchette = `${fourchetteMatch[1].trim()} € - ${fourchetteMatch[2].trim()} €`;
        prixMinMarche = parsePrice(fourchetteMatch[1]);
        prixMaxMarche = parsePrice(fourchetteMatch[2]);
      }
    }

    // Extract main d'oeuvre/matériaux details
    if (lowerPoint.includes("main d'œuvre") || lowerPoint.includes("main-d'œuvre") || lowerPoint.includes("main d'oeuvre")) {
      if (lowerPoint.includes("détaillé") || lowerPoint.includes("indiqué") || lowerPoint.includes("détaille")) {
        detailMoDoeuvre = true;
        if (pointsOk.includes(point)) positiveCount++;
      } else if (lowerPoint.includes("succinct") || lowerPoint.includes("pas détail") || lowerPoint.includes("imprécis")) {
        detailMoDoeuvre = false;
        if (alertes.includes(point)) {
          alertCount++;
          explanations.push("Le détail de la main d'œuvre n'est pas suffisamment précis.");
        }
      }
    }

    if (lowerPoint.includes("matériau") || lowerPoint.includes("fourniture") || lowerPoint.includes("matéri")) {
      if (lowerPoint.includes("détaillé") || lowerPoint.includes("indiqué") || lowerPoint.includes("référence")) {
        detailMateriaux = true;
        if (pointsOk.includes(point)) positiveCount++;
      } else if (lowerPoint.includes("pas détail") || lowerPoint.includes("imprécis")) {
        detailMateriaux = false;
        if (alertes.includes(point)) alertCount++;
      }
    }

    // Detect pricing/calculation issues from alertes
    if (alertes.includes(point)) {
      if (lowerPoint.includes("incohéren") && (lowerPoint.includes("prix") || lowerPoint.includes("calcul"))) {
        alertCount++;
        if (!explanations.some(e => e.includes("calcul"))) {
          explanations.push("Des incohérences ont été détectées dans le calcul des prix.");
        }
      }
      if (lowerPoint.includes("structure") && lowerPoint.includes("prix") && lowerPoint.includes("confus")) {
        alertCount++;
        if (!explanations.some(e => e.includes("structure"))) {
          explanations.push("La structure tarifaire du devis manque de clarté.");
        }
      }
    }

    // Extract TVA
    if (lowerPoint.includes("tva")) {
      const tvaMatch = point.match(/(\d+(?:[\.,]\d+)?)\s*%/);
      if (tvaMatch) {
        tvaApplicable = tvaMatch[1] + " %";
      }
      if (pointsOk.includes(point)) positiveCount++;
    }

    // Extract acompte
    if (lowerPoint.includes("acompte") && !lowerPoint.includes("iban") && !lowerPoint.includes("virement")) {
      const acompteMatch = point.match(/(\d+)\s*%/);
      if (acompteMatch) {
        acomptePourcentage = parseInt(acompteMatch[1], 10);
      }
    }
  }

  // Determine overall score
  let score: "VERT" | "ORANGE" | "ROUGE";
  if (alertCount >= 2 || ecart === "tres_elevé") {
    score = "ROUGE";
  } else if (alertCount > 0 || (hasDevisRelatedInfo && positiveCount < 2)) {
    score = "ORANGE";
  } else if (positiveCount >= 2) {
    score = "VERT";
  } else {
    score = "ORANGE";
  }

  return {
    prixTotal,
    prixTotalNumber,
    comparaisonMarche,
    prixMarcheFourchette,
    prixMinMarche,
    prixMaxMarche,
    ecart,
    detailMoDoeuvre,
    detailMateriaux,
    tvaApplicable,
    acomptePourcentage,
    score,
    explanations,
    hasDevisRelatedInfo
  };
};

// ============================================================
// FILTER FUNCTION
// ============================================================

export const filterOutDevisItems = (items: string[]): string[] => {
  return items.filter(item => {
    const lower = item.toLowerCase();
    return !lower.includes("prix") &&
           !lower.includes("montant") &&
           !lower.includes("marché") &&
           !lower.includes("fourchette") &&
           !lower.includes("main d'œuvre") &&
           !lower.includes("main-d'œuvre") &&
           !lower.includes("main d'oeuvre") &&
           !lower.includes("matériau") &&
           !lower.includes("fourniture") &&
           !lower.includes("tva") &&
           !lower.includes("calcul") &&
           !lower.includes("structure") &&
           !lower.includes("tarif") &&
           !lower.includes("ht") &&
           !lower.includes("ttc") &&
           !(lower.includes("acompte") && !lower.includes("iban") && !lower.includes("virement"));
  });
};
