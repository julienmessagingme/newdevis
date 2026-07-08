/**
 * extractImplicitSurface — détecte une surface implicite dans la description
 * d'une ligne de devis (Option A du plan produit 2026-07-04).
 *
 * Contexte : sur un pattern classique "Peinture pièce ~12 m² (murs+plafond) :
 * 2 500 € forfait", le pipeline actuel n'exploite pas les 12 m² mentionnés
 * dans la description. Résultat : on compare 2 500 € à un forfait catalogue
 * générique alors qu'on pourrait recalculer prix unitaire = 2 500 € / 42 m²
 * effectifs = ~60 €/m² et le comparer au marché peinture au m² (~25-45 €/m²).
 *
 * C'est la valeur ajoutée principale VMD sur les devis "forfait par métier"
 * — le plus fréquent des patterns problématiques.
 *
 * Module PUR (aucun import), rétro-compatible Deno pour la edge function
 * analyze-quote (copie miroir dans supabase/functions/analyze-quote/).
 *
 * Approche V1 :
 *   - Extraction surface au sol par regex sur toutes occurrences "N m²"
 *   - Détection du type (murs+plafond / murs / plafond / sol / unknown)
 *   - Multiplicateur BTP standard : × 2.5 (murs), × 1 (plafond, sol), × 3.5 (murs+plafond)
 *   - Confidence graduée : high (type explicite), medium (peinture inféré),
 *     low (surface seule sans contexte)
 *
 * Limites reconnues :
 *   - Multiplicateurs standard (pièce H=2.5m carrée). Erreur possible ±20% sur
 *     pièces atypiques (couloir long, plafond bas).
 *   - Ne gère pas les pièces multiples ("cuisine 12m² + salle 20m²") — sommées.
 *   - Ne détecte pas les surfaces implicites sans "m²" (ex: "T2 45m²" OK,
 *     "petite pièce" KO).
 *
 * Anti-régression Option B (Gemini estimation) : quand livrée, cette fonction
 * reste comme fallback rapide et déterministe. La sortie Gemini priorise.
 */

export type SurfaceType = "murs_plafond" | "murs" | "plafond" | "sol" | "unknown";

export interface ImplicitSurfaceEstimate {
  /** Surface au sol détectée (somme si plusieurs occurrences dans la description). */
  base_m2: number;
  /** Surface effective pour la comparaison au marché (avec multiplicateur type). */
  effective_m2: number;
  /** Type de surface détecté (murs / plafond / sol / murs+plafond / unknown). */
  surface_type: SurfaceType;
  /** Multiplicateur appliqué (1 à 3.5 selon le type). */
  multiplier: number;
  /** Confiance dans l'estimation. */
  confidence: "high" | "medium" | "low";
  /** Fragment(s) de description qui ont matché (pour debug + UI). */
  detected_from: string;
}

/**
 * Multiplicateurs standard pour une pièce H≈2.5m carrée :
 *   - murs : périmètre × hauteur ≈ 4√SU × 2.5 = ~2.5-3× SU (moyenne 2.5)
 *   - plafond : ≈ 1× SU
 *   - sol : ≈ 1× SU
 *   - murs+plafond : ≈ 3.5× SU
 *
 * unknown = 1 (conservateur : on garde la surface au sol brute, à la
 * responsabilité du downstream de savoir quoi en faire).
 */
const MULTIPLIERS: Record<SurfaceType, number> = {
  murs_plafond: 3.5,
  murs: 2.5,
  plafond: 1,
  sol: 1,
  unknown: 1,
};

/**
 * Extrait une estimation de surface depuis une description de ligne de devis.
 * Retourne null si aucun signal exploitable (pas de "N m²" trouvé, ou surface
 * hors plage réaliste [0.5, 5000] m²).
 */
export function extractImplicitSurface(description: string | null | undefined): ImplicitSurfaceEstimate | null {
  if (!description || description.trim().length < 3) return null;
  const text = description.toLowerCase();

  // 1. Extract toutes les occurrences "N m²" (ou variantes)
  //    Accepte : 12m², 12 m2, 12,5m², ~12m², 12 mètres carrés, 12 m. carrés
  //    NB : pas de `\b` de fin — ² n'est pas dans \w donc \b matcherait mal.
  //    On utilise un lookahead (?![0-9]) pour éviter de matcher "m2" au milieu
  //    d'un mot alpha (ex: "harm2onie" ne matche pas, "12m2" oui car ² ou fin).
  const pattern = /(\d+(?:[.,]\d+)?)\s*(?:m[²2]|m\.?\s*carr[éeè]?[eé]?s?|m[eè]tres?\s*carr[éeè]?[eé]?s?)(?![a-z])/gi;
  const matches: Array<{ val: number; raw: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const val = parseFloat(m[1].replace(",", "."));
    if (isFinite(val) && val >= 0.5 && val <= 5000) {
      matches.push({ val, raw: m[0] });
    }
  }
  if (matches.length === 0) return null;

  // Somme des surfaces (couvre "12 m² + 20 m²" = 32 m²)
  const base_m2 = matches.reduce((sum, x) => sum + x.val, 0);
  if (base_m2 <= 0) return null;

  const detected_from = matches.map((x) => x.raw.trim()).join(" + ");

  // 2. Type de surface : cherche mots-clés murs / plafond / sol
  const surface_type = detectSurfaceType(text);

  // 3. Confidence : type explicite → high, contexte peinture inféré → medium,
  //    surface seule → low
  const confidence = deriveConfidence(text, surface_type);

  const multiplier = MULTIPLIERS[surface_type];
  const effective_m2 = Math.round(base_m2 * multiplier * 100) / 100;

  return {
    base_m2,
    effective_m2,
    surface_type,
    multiplier,
    confidence,
    detected_from,
  };
}

function detectSurfaceType(text: string): SurfaceType {
  const hasMurs = /\bmur(?:s)?\b/i.test(text);
  const hasPlafond = /\bplafond(?:s)?\b/i.test(text);
  const hasSol = /\b(?:sol|parquet|carrelage\s+sol|rev[eê]tement\s+sol|dallage)\b/i.test(text);
  const hasPiece = /\b(?:pi[eè]ce\s+compl[eè]te|4\s*murs\s+et\s+plafond|totalit[eé])/i.test(text);

  if (hasPiece) return "murs_plafond";
  if (hasMurs && hasPlafond) return "murs_plafond";
  if (hasSol && hasMurs && hasPlafond) return "murs_plafond"; // pièce entière avec sol = approx murs+plafond
  if (hasMurs) return "murs";
  if (hasPlafond) return "plafond";
  if (hasSol) return "sol";
  return "unknown";
}

function deriveConfidence(text: string, surface_type: SurfaceType): "high" | "medium" | "low" {
  // Type explicite → high
  if (surface_type !== "unknown") return "high";

  // Type inconnu MAIS contexte peinture / revêtement clair → medium
  // (on peut supposer surface au sol pour peinture ⇒ défaut × 3.5 downstream)
  if (/peinture|carrelage|placo|plaqu[eè]?[eè]?[re]|rev[eê]tement|papier\s*peint/i.test(text)) {
    return "medium";
  }

  // Surface seule sans contexte métier → low (à ne pas utiliser pour verdict)
  return "low";
}
