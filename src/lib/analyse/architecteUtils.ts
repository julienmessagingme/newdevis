// ============================================================
// TYPES
// ============================================================

export interface ArchitecteInfo {
  detecte: boolean;
  type: "architecte" | "maitre_oeuvre" | null;
  nom: string | null;
  pourcentage_honoraires: number | null;
  missions: string[];
  score: "VERT" | "ORANGE" | "ROUGE";
  specificPoints: string[];
  specificAlertes: string[];
  specificRecommandations: string[];
}

// ============================================================
// EXTRACTION FUNCTION
// ============================================================

export const extractArchitecteInfo = (pointsOk: string[], alertes: string[], recommandations: string[]): ArchitecteInfo => {
  const info: ArchitecteInfo = {
    detecte: false,
    type: null,
    nom: null,
    pourcentage_honoraires: null,
    missions: [],
    score: "VERT",
    specificPoints: [],
    specificAlertes: [],
    specificRecommandations: []
  };

  // Check for architect indicators
  for (const point of pointsOk) {
    const lower = point.toLowerCase();

    if (lower.includes("architecte") || lower.includes("maître d'œuvre") || lower.includes("maitre d'oeuvre")) {
      info.detecte = true;

      if (lower.includes("architecte") && !lower.includes("maître d'œuvre") && !lower.includes("maitre d'oeuvre")) {
        info.type = "architecte";
      } else if (lower.includes("maître d'œuvre") || lower.includes("maitre d'oeuvre") || lower.includes("moe")) {
        info.type = "maitre_oeuvre";
      }

      // Extract name if present
      const nameMatch = point.match(/\(([^)]+)\)/);
      if (nameMatch) {
        info.nom = nameMatch[1];
      }

      // Check for honoraires percentage
      const honorairesMatch = point.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (honorairesMatch) {
        info.pourcentage_honoraires = parseFloat(honorairesMatch[1].replace(",", "."));
      }

      info.specificPoints.push(point);
    }

    // Check for mission indicators
    if (lower.includes("mission complète") || lower.includes("conception") || lower.includes("suivi")) {
      if (lower.includes("conception")) info.missions.push("conception");
      if (lower.includes("suivi")) info.missions.push("suivi_chantier");
      if (lower.includes("coordination")) info.missions.push("coordination");

      if (!info.specificPoints.includes(point)) {
        info.specificPoints.push(point);
      }
    }

    // Check for code of ethics
    if (lower.includes("déontologie") || lower.includes("assurance professionnelle")) {
      if (!info.specificPoints.includes(point)) {
        info.specificPoints.push(point);
      }
    }

    // Check for honoraires in norms
    if (lower.includes("honoraires") && lower.includes("normes")) {
      info.specificPoints.push(point);
    }
  }

  // Check alertes for architect-related issues
  for (const alerte of alertes) {
    const lower = alerte.toLowerCase();

    if (lower.includes("honoraires") && (lower.includes("architecte") || lower.includes("maître d'œuvre") || lower.includes("maitre d'oeuvre"))) {
      info.detecte = true;
      info.specificAlertes.push(alerte);
      info.score = "ORANGE";

      // Extract percentage
      const honorairesMatch = alerte.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (honorairesMatch) {
        info.pourcentage_honoraires = parseFloat(honorairesMatch[1].replace(",", "."));
      }
    }
  }

  // Check recommandations
  for (const rec of recommandations) {
    const lower = rec.toLowerCase();

    if (lower.includes("architecte") || lower.includes("maître d'œuvre") || lower.includes("maitre d'oeuvre") || lower.includes("ordre des architectes")) {
      info.specificRecommandations.push(rec);
    }
  }

  return info;
};

// ============================================================
// FILTER FUNCTION
// ============================================================

export const filterOutArchitecteItems = (items: string[]): string[] => {
  return items.filter(item => {
    const lower = item.toLowerCase();
    return !lower.includes("architecte") &&
           !lower.includes("maître d'œuvre") &&
           !lower.includes("maitre d'oeuvre") &&
           !lower.includes("moe") &&
           !(lower.includes("honoraires") && (lower.includes("%") || lower.includes("mission")));
  });
};
