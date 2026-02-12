// ============================================================
// TYPES
// ============================================================

export interface SiteContextResult {
  postal_code: string | null;
  insee_code: string | null;
  address?: string | null;
  risks: Array<{
    risk_type: string;
    level: string;
    description: string;
  }>;
  seismic_zone: {
    zone: string;
    level: string;
  } | null;
  urbanisme: {
    has_constraints: boolean;
    documents: string[];
  } | null;
  patrimoine?: {
    status: "possible" | "non_detecte" | "inconnu";
    types: string[];
  } | null;
  error: string | null;
  status?: "data_found" | "no_data" | "address_incomplete" | "not_searched";
}

// ============================================================
// EXTRACTION FUNCTIONS
// ============================================================

// Extract address from AI analysis JSON
export const extractAddressFromRawText = (rawText: string | null): string | null => {
  if (!rawText) return null;

  try {
    const parsed = JSON.parse(rawText);

    // Priority: adresse_chantier > code_postal_chantier > adresse_client
    if (parsed.adresse_chantier && typeof parsed.adresse_chantier === "string") {
      return parsed.adresse_chantier;
    }
    if (parsed.code_postal_chantier) {
      return `Code postal: ${parsed.code_postal_chantier}`;
    }
    if (parsed.adresse_client && typeof parsed.adresse_client === "string") {
      return parsed.adresse_client;
    }
  } catch {
    // Try regex extraction as fallback
    const addressMatch = rawText.match(/adresse_chantier[:\s]*["']([^"']+)["']/i);
    if (addressMatch) {
      return addressMatch[1];
    }

    const postalMatch = rawText.match(/code_postal_chantier[:\s]*["']?(\d{5})["']?/i);
    if (postalMatch) {
      return `Code postal: ${postalMatch[1]}`;
    }
  }

  return null;
};

// Extract site context from points_ok (from backend analysis)
export const extractSiteContextFromPoints = (pointsOk: string[], alertes: string[]): Partial<SiteContextResult> | null => {
  const allPoints = [...pointsOk, ...alertes];

  const risks: Array<{ risk_type: string; level: string; description: string }> = [];
  let postalCode: string | null = null;
  let address: string | null = null;
  let commune: string | null = null;
  let seismicZone: string | null = null;
  let hasDataFromBackend = false;
  let patrimoine: { status: "possible" | "non_detecte" | "inconnu"; types: string[] } | null = null;

  for (const point of allPoints) {
    const lowerPoint = point.toLowerCase();

    // Check for backend site context markers (📍 prefix)
    if (point.startsWith("📍")) {
      hasDataFromBackend = true;

      // Extract commune from "Contexte chantier (Commune)"
      const communeMatch = point.match(/contexte chantier \(([^)]+)\)/i);
      if (communeMatch) {
        commune = communeMatch[1];
      }

      // Extract risks count and types
      const risksMatch = point.match(/(\d+) risque\(s\) naturel\(s\).*?:\s*(.+)/i);
      if (risksMatch) {
        const riskTypes = risksMatch[2].split(",").map(r => r.trim());
        for (const riskType of riskTypes) {
          risks.push({
            risk_type: riskType,
            level: "Identifié",
            description: point
          });
        }
      }

      // Extract seismic zone
      if (lowerPoint.includes("zone sismique")) {
        const seismicMatch = point.match(/zone sismique\s*:\s*(.+)/i);
        if (seismicMatch) {
          seismicZone = seismicMatch[1].trim();
        }
      }

      // Extract patrimoine / ABF status
      if (lowerPoint.includes("patrimoine") || lowerPoint.includes("abf")) {
        if (lowerPoint.includes("possible")) {
          const typesMatch = point.match(/\(([^)]+)\)/);
          const types = typesMatch ? typesMatch[1].split(",").map(t => t.trim()) : [];
          patrimoine = { status: "possible", types };
        } else if (lowerPoint.includes("non détecté") || lowerPoint.includes("non detecte")) {
          patrimoine = { status: "non_detecte", types: [] };
        } else if (lowerPoint.includes("inconnu")) {
          patrimoine = { status: "inconnu", types: [] };
        }
      }
    }

    // Legacy: Check for postal code
    const postalMatch = point.match(/(\d{5})/);
    if (postalMatch && !postalCode) {
      postalCode = postalMatch[1];
    }

    // Legacy: Check for address mentions
    if (lowerPoint.includes("adresse") || lowerPoint.includes("chantier")) {
      const addressMatch = point.match(/(?:adresse|chantier)[^:]*:\s*(.+)/i);
      if (addressMatch) {
        address = addressMatch[1].trim();
      }
    }

    // Legacy: Check for risk mentions
    if (lowerPoint.includes("inondation") || lowerPoint.includes("flood")) {
      const levelMatch = point.match(/niveau\s*:?\s*(\w+)/i) || point.match(/(faible|moyen|élevé|fort)/i);
      risks.push({
        risk_type: "Inondation",
        level: levelMatch ? levelMatch[1] : "À vérifier",
        description: point
      });
    }

    if ((lowerPoint.includes("sism") || lowerPoint.includes("séism")) && !point.startsWith("📍")) {
      const levelMatch = point.match(/zone\s*(\d)/i) || point.match(/(faible|moyen|modéré)/i);
      risks.push({
        risk_type: "Sismicité",
        level: levelMatch ? `Zone ${levelMatch[1]}` : "À vérifier",
        description: point
      });
    }

    if (lowerPoint.includes("mouvement") && lowerPoint.includes("terrain")) {
      risks.push({
        risk_type: "Mouvements de terrain",
        level: "À vérifier",
        description: point
      });
    }

    if (lowerPoint.includes("argile") || lowerPoint.includes("retrait-gonflement")) {
      risks.push({
        risk_type: "Retrait-gonflement des argiles",
        level: "À vérifier",
        description: point
      });
    }
  }

  // Build seismic zone object
  let seismicZoneObj: { zone: string; level: string } | null = null;
  if (seismicZone) {
    seismicZoneObj = {
      zone: seismicZone,
      level: seismicZone.includes("1") ? "Très faible" :
             seismicZone.includes("2") ? "Faible" :
             seismicZone.includes("3") ? "Modéré" :
             seismicZone.includes("4") ? "Moyen" :
             seismicZone.includes("5") ? "Fort" : "Non déterminé"
    };
  }

  // Determine status
  let status: "data_found" | "no_data" | "address_incomplete" | "not_searched" = "not_searched";
  if (hasDataFromBackend) {
    if (risks.length > 0 || seismicZoneObj) {
      status = "data_found";
    } else if (commune) {
      status = "no_data";
    }
  } else if (postalCode || address) {
    status = risks.length > 0 ? "data_found" : "no_data";
  }

  return {
    postal_code: postalCode,
    address: address || (commune ? `${commune}` : null),
    risks,
    seismic_zone: seismicZoneObj,
    patrimoine,
    error: null,
    status
  };
};

// ============================================================
// FILTER FUNCTION
// ============================================================

export const filterOutContexteItems = (items: string[]): string[] => {
  return items.filter(item => {
    const lower = item.toLowerCase();
    // Filter out items that start with 📍 (backend context markers)
    if (item.startsWith("📍")) return false;

    return !lower.includes("inondation") &&
           !lower.includes("sism") &&
           !lower.includes("séism") &&
           !lower.includes("mouvement de terrain") &&
           !lower.includes("argile") &&
           !lower.includes("retrait-gonflement") &&
           !lower.includes("urbanisme") &&
           !lower.includes("plu") &&
           !lower.includes("zone protégée") &&
           !lower.includes("géorisques");
  });
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export const getRiskLevelColor = (level: string) => {
  const lowerLevel = level.toLowerCase();
  if (lowerLevel.includes("faible") || lowerLevel.includes("zone 1") || lowerLevel.includes("très faible") || lowerLevel.includes("identifié")) {
    return "text-score-green";
  }
  if (lowerLevel.includes("moyen") || lowerLevel.includes("modéré") || lowerLevel.includes("zone 2") || lowerLevel.includes("zone 3")) {
    return "text-score-orange";
  }
  if (lowerLevel.includes("élevé") || lowerLevel.includes("fort") || lowerLevel.includes("zone 4") || lowerLevel.includes("zone 5")) {
    return "text-score-red";
  }
  return "text-muted-foreground";
};
