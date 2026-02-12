import { supabase } from "@/integrations/supabase/client";

export interface ZoneResult {
  zone: "petite_ville" | "ville_moyenne" | "grande_ville";
  coefficient: number;
  isDefault: boolean;
}

// Coefficients par défaut si la zone n'est pas trouvée en base
const DEFAULT_COEFFICIENTS: Record<string, number> = {
  petite_ville: 0.90,
  ville_moyenne: 1.00,
  grande_ville: 1.20,
};

/**
 * Détermine la zone géographique et le coefficient de pondération
 * basé sur le préfixe du code postal (2 premiers chiffres)
 */
export async function getZoneCoefficient(zip: string): Promise<ZoneResult> {
  // Extraire le préfixe postal (2 premiers caractères)
  const prefix = zip.slice(0, 2);

  try {
    const { data, error } = await supabase
      .from("zones_geographiques")
      .select("type_zone, coefficient")
      .eq("prefixe_postal", prefix)
      .single();

    if (error || !data) {
      return {
        zone: "ville_moyenne",
        coefficient: DEFAULT_COEFFICIENTS.ville_moyenne,
        isDefault: true,
      };
    }

    const zone = data.type_zone as ZoneResult["zone"];
    const coefficient = data.coefficient ?? DEFAULT_COEFFICIENTS[zone] ?? 1.0;

    return {
      zone,
      coefficient,
      isDefault: false,
    };
  } catch (err) {
    console.error("[Zone] Erreur lors de la récupération:", err);
    return {
      zone: "ville_moyenne",
      coefficient: DEFAULT_COEFFICIENTS.ville_moyenne,
      isDefault: true,
    };
  }
}

/**
 * Applique le coefficient de zone aux prix retournés par l'API
 * Garantit que min <= avg <= max après pondération
 */
export function applyZoneCoefficient(
  prices: { min: number; avg: number; max: number },
  coefficient: number
): { min: number; avg: number; max: number } {
  const adjustedMin = Math.round(prices.min * coefficient);
  const adjustedAvg = Math.round(prices.avg * coefficient);
  const adjustedMax = Math.round(prices.max * coefficient);

  // Garantir la cohérence : min <= avg <= max
  return {
    min: Math.min(adjustedMin, adjustedAvg, adjustedMax),
    avg: adjustedAvg,
    max: Math.max(adjustedMin, adjustedAvg, adjustedMax),
  };
}

/**
 * Retourne le libellé français de la zone
 */
export function getZoneLabel(zone: ZoneResult["zone"]): string {
  const labels: Record<ZoneResult["zone"], string> = {
    petite_ville: "Petite ville / rural",
    ville_moyenne: "Ville moyenne",
    grande_ville: "Grande ville / métropole",
  };
  return labels[zone] || "Zone inconnue";
}
