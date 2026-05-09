// ============================================================
// TYPES
// ============================================================

export interface AttestationComparison {
  nom_entreprise: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
  siret_siren: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
  adresse: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
  periode_validite: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
  activite_couverte: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
  coherence_globale: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
}

export interface SecuriteInfo {
  decennale: {
    mentionnee: boolean;
    critique: boolean;
    attestationStatus: "verified" | "incoherent" | "incomplete" | null;
    score: "VERT" | "ORANGE" | "ROUGE";
  };
  rcpro: {
    mentionnee: boolean;
    attestationStatus: "verified" | "incoherent" | "incomplete" | null;
    score: "VERT" | "ORANGE" | "ROUGE";
  };
  paiement: {
    modes: string[];
    acomptePourcentage: number | null;
    paiementIntegralAvantTravaux: boolean;
    ibanValid: boolean | null;
    ibanFrance: boolean | null;
    ibanCountry: string | null;
    especes: boolean;
    score: "VERT" | "ORANGE" | "ROUGE";
  };
  globalScore: "VERT" | "ORANGE" | "ROUGE";
  vigilanceReasons: string[];
  recommendations: string[];
}

// ============================================================
// EXTRACTION FUNCTION
// ============================================================

export const extractSecuriteData = (
  pointsOk: string[],
  alertes: string[],
  attestationComparison?: { decennale?: AttestationComparison; rc_pro?: AttestationComparison },
  assuranceLevel2Score?: string | null
): SecuriteInfo => {
  const allPoints = [...pointsOk, ...alertes];

  const info: SecuriteInfo = {
    decennale: { mentionnee: false, critique: false, attestationStatus: null, score: "ORANGE" },
    rcpro: { mentionnee: false, attestationStatus: null, score: "ORANGE" },
    paiement: {
      modes: [],
      acomptePourcentage: null,
      paiementIntegralAvantTravaux: false,
      ibanValid: null,
      ibanFrance: null,
      ibanCountry: null,
      especes: false,
      score: "ORANGE"
    },
    globalScore: "ORANGE",
    vigilanceReasons: [],
    recommendations: []
  };

  let alertCount = 0;

  let hasEcheancier = false;
  let acompteBeforeTravaux = 0;

  for (const point of allPoints) {
    const lowerPoint = point.toLowerCase();

    // ====== ASSURANCES - IMPROVED DETECTION ======
    const mentionsBothInsurances = (lowerPoint.includes("décennale") || lowerPoint.includes("decennale")) &&
                                    (lowerPoint.includes("responsabilité civile") || lowerPoint.includes("rc pro") || lowerPoint.includes("rc professionnelle"));

    if (mentionsBothInsurances && !lowerPoint.includes("non")) {
      info.decennale.mentionnee = true;
      info.rcpro.mentionnee = true;
    } else {
      if (lowerPoint.includes("décennale") || lowerPoint.includes("decennale")) {
        if (lowerPoint.includes("non mentionnée") || lowerPoint.includes("non détectée") || lowerPoint.includes("absence")) {
          // Not mentioned - keep as ORANGE, never ROUGE at level 1
        } else if (lowerPoint.includes("mentionnée") || lowerPoint.includes("indiquée") || lowerPoint.includes("présent")) {
          info.decennale.mentionnee = true;
        } else {
          info.decennale.mentionnee = true; // Benefit of doubt
        }

        if (lowerPoint.includes("travaux concernés") || lowerPoint.includes("obligatoire")) {
          info.decennale.critique = true;
        }
      }

      if (lowerPoint.includes("rc pro") || lowerPoint.includes("rc professionnelle") ||
          (lowerPoint.includes("responsabilité civile") && lowerPoint.includes("professionnelle"))) {
        if (lowerPoint.includes("non mentionnée") || lowerPoint.includes("non détectée") || lowerPoint.includes("absence")) {
          // Not mentioned - keep as ORANGE
        } else if (lowerPoint.includes("mentionnée") || lowerPoint.includes("indiquée") || lowerPoint.includes("présent")) {
          info.rcpro.mentionnee = true;
        } else {
          info.rcpro.mentionnee = true;
        }
      }
    }

    // ====== PAIEMENT - IMPROVED DETECTION ======
    if (lowerPoint.includes("virement") ||
        (lowerPoint.includes("rib") && !lowerPoint.includes("contrib")) ||
        (lowerPoint.includes("iban") && !lowerPoint.includes("attrib"))) {
      if (!info.paiement.modes.includes("Virement")) info.paiement.modes.push("Virement");
    }
    if (lowerPoint.includes("chèque") || lowerPoint.includes("cheque")) {
      if (!info.paiement.modes.includes("Chèque")) info.paiement.modes.push("Chèque");
    }
    if (lowerPoint.includes("carte bancaire") || lowerPoint.includes("carte bleue") ||
        (lowerPoint.includes(" cb ") || lowerPoint.includes(" cb,") || lowerPoint.includes(",cb") ||
         lowerPoint.startsWith("cb ") || lowerPoint.endsWith(" cb"))) {
      if (!info.paiement.modes.includes("Carte bancaire")) info.paiement.modes.push("Carte bancaire");
    }
    if (lowerPoint.includes("à réception") || lowerPoint.includes("à la livraison") || lowerPoint.includes("a reception")) {
      if (!info.paiement.modes.includes("À réception")) info.paiement.modes.push("À réception");
    }

    const explicitCash = lowerPoint.includes("espèces") || lowerPoint.includes("especes") ||
                          (lowerPoint.includes("cash") && !lowerPoint.includes("cashback"));
    if (explicitCash) {
      if (!info.paiement.modes.includes("Espèces")) info.paiement.modes.push("Espèces");
      info.paiement.especes = true;
      alertCount++;
      info.vigilanceReasons.push("Paiement en espèces explicitement demandé");
    }

    const echeancierMatch = point.match(/(\d+)\s*%.*?(\d+)\s*%/i);
    if (echeancierMatch || lowerPoint.includes("écheancier") || lowerPoint.includes("echeancier") ||
        lowerPoint.includes("en plusieurs fois") || lowerPoint.includes("étapes") || lowerPoint.includes("avancement")) {
      hasEcheancier = true;
    }

    const beforeWorkPatterns = [
      /(\d+)\s*%\s*(?:à la commande|acompte|à la signature|avant travaux)/i,
      /acompte[^\d]*(\d+)\s*%/i
    ];
    for (const pattern of beforeWorkPatterns) {
      const match = point.match(pattern);
      if (match) {
        const percentage = parseInt(match[1], 10);
        if (percentage > acompteBeforeTravaux) {
          acompteBeforeTravaux = percentage;
        }
      }
    }

    const acompteMatch = point.match(/acompte[^\d]*(\d+)\s*%/i);
    if (acompteMatch) {
      info.paiement.acomptePourcentage = parseInt(acompteMatch[1], 10);
    }

    if ((lowerPoint.includes("paiement intégral") || lowerPoint.includes("paiement total") || lowerPoint.includes("100%"))
        && (lowerPoint.includes("avant") || lowerPoint.includes("préalable"))
        && !hasEcheancier) {
      info.paiement.paiementIntegralAvantTravaux = true;
    }

    if (lowerPoint.includes("iban") || lowerPoint.includes("rib")) {
      if (info.paiement.especes && !explicitCash) {
        info.paiement.especes = false;
        info.paiement.modes = info.paiement.modes.filter(m => m !== "Espèces");
        info.vigilanceReasons = info.vigilanceReasons.filter(r => !r.includes("espèces"));
        if (alertCount > 0) alertCount--;
      }

      if (lowerPoint.includes("valide") && lowerPoint.includes("france")) {
        info.paiement.ibanValid = true;
        info.paiement.ibanFrance = true;
        info.paiement.ibanCountry = "France";
      } else if (lowerPoint.includes("valide")) {
        info.paiement.ibanValid = true;
        info.paiement.ibanFrance = false;
        const countryMatch = point.match(/\(([^)]+)\)/);
        info.paiement.ibanCountry = countryMatch ? countryMatch[1] : "Étranger";
        info.vigilanceReasons.push(`IBAN étranger (${info.paiement.ibanCountry})`);
      } else if (lowerPoint.includes("non valide") || lowerPoint.includes("invalide")) {
        info.paiement.ibanValid = false;
        alertCount++;
        info.vigilanceReasons.push("IBAN non valide");
      } else {
        if (!info.paiement.modes.includes("Virement")) {
          info.paiement.modes.push("Virement");
        }
      }
    }
  }

  const effectiveAcompte = info.paiement.acomptePourcentage || acompteBeforeTravaux;
  if (effectiveAcompte > 0) {
    info.paiement.acomptePourcentage = effectiveAcompte;

    if (hasEcheancier && acompteBeforeTravaux <= 50) {
      if (acompteBeforeTravaux > 30 && acompteBeforeTravaux <= 50) {
        info.vigilanceReasons.push(`Acompte modéré (${acompteBeforeTravaux}%)`);
      }
      info.paiement.paiementIntegralAvantTravaux = false;
    } else if (effectiveAcompte > 50) {
      alertCount++;
      info.vigilanceReasons.push(`Acompte élevé (${effectiveAcompte}%)`);
    } else if (effectiveAcompte > 30) {
      info.vigilanceReasons.push(`Acompte modéré (${effectiveAcompte}%)`);
    }
  }

  if (info.paiement.paiementIntegralAvantTravaux && !hasEcheancier) {
    alertCount++;
    info.vigilanceReasons.push("Paiement intégral avant travaux");
  }

  // ====== LEVEL 2: Handle attestation comparison (can trigger ROUGE) ======
  if (attestationComparison?.decennale) {
    const comp = attestationComparison.decennale;
    if (comp.coherence_globale === "OK") {
      info.decennale.attestationStatus = "verified";
      info.decennale.score = "VERT";
    } else if (comp.coherence_globale === "INCOHERENT") {
      info.decennale.attestationStatus = "incoherent";
      info.decennale.score = "ROUGE";
      alertCount++;
    } else {
      info.decennale.attestationStatus = "incomplete";
      info.decennale.score = "ORANGE";
    }
  } else {
    if (info.decennale.mentionnee) {
      info.decennale.score = "VERT";
    } else {
      info.decennale.score = "ORANGE";
    }
  }

  if (attestationComparison?.rc_pro) {
    const comp = attestationComparison.rc_pro;
    if (comp.coherence_globale === "OK") {
      info.rcpro.attestationStatus = "verified";
      info.rcpro.score = "VERT";
    } else if (comp.coherence_globale === "INCOHERENT") {
      info.rcpro.attestationStatus = "incoherent";
      info.rcpro.score = "ROUGE";
    } else {
      info.rcpro.attestationStatus = "incomplete";
      info.rcpro.score = "ORANGE";
    }
  } else {
    if (info.rcpro.mentionnee) {
      info.rcpro.score = "VERT";
    } else {
      info.rcpro.score = "ORANGE";
    }
  }

  info.paiement.modes = [...new Set(info.paiement.modes)];

  const hasCriticalPaymentIssue =
    info.paiement.especes ||
    info.paiement.ibanValid === false ||
    (info.paiement.paiementIntegralAvantTravaux && !hasEcheancier);

  const explicitVigilanceCount = info.vigilanceReasons.filter(r =>
    r.includes("espèces") ||
    r.includes("IBAN non valide") ||
    r.includes("intégral") ||
    r.includes("élevé")
  ).length;

  if (hasCriticalPaymentIssue || explicitVigilanceCount >= 2) {
    info.paiement.score = "ROUGE";
  } else if (info.vigilanceReasons.length > 0) {
    info.paiement.score = "ORANGE";
  } else if (info.paiement.ibanValid && info.paiement.ibanFrance) {
    info.paiement.score = "VERT";
  } else if (info.paiement.modes.length > 0) {
    info.paiement.score = "VERT";
  }

  const scores = [info.decennale.score, info.rcpro.score, info.paiement.score];

  const hasExplicitRouge =
    (attestationComparison?.decennale?.coherence_globale === "INCOHERENT") ||
    (attestationComparison?.rc_pro?.coherence_globale === "INCOHERENT") ||
    hasCriticalPaymentIssue;

  if (hasExplicitRouge) {
    info.globalScore = "ROUGE";
  } else if (scores.includes("ROUGE")) {
    info.globalScore = "ROUGE";
  } else if (scores.filter(s => s === "ORANGE").length >= 2) {
    info.globalScore = "ORANGE";
  } else if (scores.every(s => s === "VERT")) {
    info.globalScore = "VERT";
  } else {
    info.globalScore = "ORANGE";
  }

  if (assuranceLevel2Score) {
    info.globalScore = assuranceLevel2Score as "VERT" | "ORANGE" | "ROUGE";
  }

  if (info.paiement.score !== "VERT" && !info.paiement.modes.some(m => ["Virement", "Chèque", "Carte bancaire"].includes(m))) {
    info.recommendations.push("Privilégiez un mode de paiement traçable (virement, chèque).");
  }
  if (info.paiement.acomptePourcentage && info.paiement.acomptePourcentage > 30) {
    info.recommendations.push("Limitez l'acompte à 30% maximum du montant total.");
  }
  if (!info.decennale.attestationStatus && !info.decennale.mentionnee) {
    info.recommendations.push("Demandez l'attestation d'assurance décennale pour confirmer la couverture.");
  }

  return info;
};

// ============================================================
// FILTER FUNCTION
// ============================================================

export const filterOutSecuriteItems = (items: string[]): string[] => {
  return items.filter(item => {
    const lower = item.toLowerCase();
    return !lower.includes("assurance") &&
           !lower.includes("décennale") &&
           !lower.includes("decennale") &&
           !lower.includes("rc pro") &&
           !lower.includes("attestation") &&
           !lower.includes("conditions de paiement") &&
           !lower.includes("mode de paiement") &&
           !lower.includes("mode de règlement") &&
           !lower.includes("échéancier") &&
           !lower.includes("echeancier") &&
           !lower.includes("iban") &&
           !lower.includes("virement") &&
           !lower.includes("espèces") &&
           !lower.includes("bancaires") &&
           !lower.includes("paiement intégral") &&
           !(lower.includes("acompte") && (lower.includes("paiement") || lower.includes("%")));
  });
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export const getComparisonStatusText = (status: string) => {
  switch (status) {
    case "OK": return "✓ Conforme";
    case "INCOMPLET": return "Info manquante";
    case "INCOHERENT": return "Incohérence détectée";
    case "NON_DISPONIBLE": return "Non vérifié";
    default: return status;
  }
};

export const getComparisonStatusClass = (status: string) => {
  switch (status) {
    case "OK": return "text-score-green";
    case "INCOMPLET": return "text-score-orange";
    case "INCOHERENT": return "text-score-red";
    default: return "text-muted-foreground";
  }
};
