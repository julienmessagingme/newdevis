/**
 * V3.4.15 (2026-05-18) — Détection partagée du mismatch unité/surface.
 *
 * Ce helper est partagé entre :
 *   - Le serveur (src/pages/api/analyse/[id]/conclusion.ts) — pour exclure les
 *     postes "incomparables" du calcul de surcoût et générer les actions
 *     "Demandez la surface".
 *   - Le client (src/lib/analyse/quoteGlobalAnalysis.ts + BlockPrixMarche.tsx) —
 *     pour afficher un badge "Surface à vérifier" au lieu de "Anomalie marché"
 *     quand le mismatch est confirmé. Garantit la cohérence visuelle ↔ verdict.
 *
 * AVANT le V3.4.15, ces fonctions vivaient uniquement dans conclusion.ts. Le
 * front classait certains postes en "Anomalie marché" (badge rouge), tandis que
 * le back les excluait du calcul de surcoût → verdict VERT malgré 4 badges rouges
 * visibles. Bug structurel.
 *
 * RÈGLE : un poste avec surface mismatch n'est PAS une anomalie comparable. C'est
 * un poste à clarifier. Le wording UI doit refléter ça (pas accuser).
 */

// ── Référentiels (synchronisés avec conclusion.ts pré-V3.4.15) ──────────────

/** Postes dont la comparaison marché se fait en m² mais que l'artisan peut facturer en U/forfait. */
export const SURFACE_WORK_KEYWORDS = [
  "cloison", "doublage", "contre-cloison", "peinture", "enduit", "lasure",
  "carrelage", "faïence", "parquet", "plancher", "ragréage", "chape",
  "isolation", "isol", "plafond", "toile de verre", "papier peint",
  "revêtement sol", "revêtement mur", "sol stratifié", "moquette",
];

/** Équipements/appareils vendus naturellement à l'unité → jamais en m². */
export const EQUIPMENT_KEYWORDS = [
  "chauffe-eau", "chauffe eau", "cumulus", "ballon",
  "climatisation", "climatiseur", "clim", "split",
  "pompe à chaleur", "pompe a chaleur", "pac",
  "radiateur", "convecteur", "sèche-serviette", "seche serviette",
  "chaudière", "chaudiere", "poêle", "poele",
  "ventilation", "vmc", "extracteur",
  "robinet", "mitigeur", "sanitaire", "wc", "toilette",
  "porte", "fenêtre", "fenetre", "baie", "volet",
  "tableau électrique", "tableau electrique", "disjoncteur",
];

export const M2_UNITS = ["m²", "m2", "m ²", "mètre carré", "metre carre", "m2 ht", "m² ht"];

export const UNIT_LIKE = [
  "u", "unité", "unite", "forfait", "ens", "ensemble",
  "prestation", "pce", "pièce", "piece", "lot", "global", "art", "article",
];

/**
 * Input normalisé — accepte les deux formats (server "snake_case" et client "camelCase").
 * Chaque appelant convertit son format vers cette interface neutre.
 */
export interface SurfaceGroup {
  /** Label du poste (job_type_label / jobTypeLabel). */
  label: string;
  /** Unité principale (main_unit / mainUnit). */
  unit: string;
  /** Lignes du devis dans ce groupe. */
  lines: Array<{
    description?: string;
    unit?: string | null;
    quantity?: number | null;
  }>;
  /** Quantité principale (main_quantity / mainQuantity). */
  mainQuantity?: number | null;
}

// ── Helpers internes ────────────────────────────────────────────────────────

function extractKnownSurface(lines: SurfaceGroup["lines"]): number | null {
  let total = 0;
  for (const l of lines) {
    const u = (l.unit ?? "").toLowerCase().trim();
    const qty = typeof l.quantity === "number" ? l.quantity : 0;
    if (qty > 0 && M2_UNITS.some(m => u.includes(m))) {
      total += qty;
    }
  }
  return total > 0 ? total : null;
}

// ── API publique ────────────────────────────────────────────────────────────

/**
 * Retourne `true` si le poste devrait normalement être facturé en m² mais a été
 * facturé en unité/forfait sans surface précisée dans les lignes.
 *
 * Logique :
 *   - Le label OU une description doit contenir un mot-clé surface (carrelage,
 *     doublage, peinture…)
 *   - L'unité doit être "u"/"forfait"/"ensemble"/… (pas m²)
 *   - Aucune ligne ne doit avoir une unité m² avec qty > 0
 *   - Et le label/description ne doit PAS être un équipement (chauffe-eau, fenêtre…)
 */
export function hasSurfaceUnitMismatch(group: SurfaceGroup): boolean {
  const label = (group.label || "").toLowerCase();
  const unit  = (group.unit || "").toLowerCase().trim();
  const lines = group.lines || [];

  // Exclure les équipements vendus à l'unité par nature
  if (EQUIPMENT_KEYWORDS.some(kw => label.includes(kw))) return false;
  const allDescriptions = lines.map(l => (l.description || "").toLowerCase()).join(" ");
  if (EQUIPMENT_KEYWORDS.some(kw => allDescriptions.includes(kw))) return false;

  // Le poste doit être de nature surfacique (label OU lignes)
  const isSurfaceWork = SURFACE_WORK_KEYWORDS.some(kw => label.includes(kw)) ||
    lines.some(l => SURFACE_WORK_KEYWORDS.some(kw =>
      (l.description || "").toLowerCase().includes(kw)
    ));
  if (!isSurfaceWork) return false;

  // L'unité ne doit PAS être m²
  const isM2 = M2_UNITS.some(u => unit.includes(u));
  const isUnitLike = UNIT_LIKE.some(u => unit === u || unit.startsWith(u + " "));
  if (!(!isM2 && isUnitLike)) return false;

  // Si la surface est explicitement connue via une ligne m² dans le groupe, pas de mismatch
  const knownSurface = extractKnownSurface(lines);
  if (knownSurface !== null) return false;

  return true;
}

/**
 * Score de confiance dans [0, 1] pour le mismatch surface/unité.
 *
 * Échelle :
 *   0.00–0.60 : signal faible — ne pas générer d'action ni de badge
 *   0.60–0.80 : signal moyen — déclenchement optionnel
 *   0.80–1.00 : signal fort — déclenchement recommandé
 *
 * Seuil par défaut pour générer une action : SURFACE_MISMATCH_THRESHOLD = 0.70.
 */
export function surfaceMismatchConfidence(group: SurfaceGroup): number {
  if (!hasSurfaceUnitMismatch(group)) return 0;

  const label = (group.label || "").toLowerCase();
  const unit  = (group.unit || "").toLowerCase().trim();
  const lines = group.lines || [];
  const descriptions = lines.map(l => (l.description || "").toLowerCase());

  let confidence = 0;

  // (1) Le label match un mot-clé surface → +0.30 (signal fort, label vient de Gemini groupement)
  if (SURFACE_WORK_KEYWORDS.some(kw => label.includes(kw))) {
    confidence += 0.30;
  }

  // (2) Une description match un mot-clé surface → +0.20
  //     Plusieurs descriptions matchent → +0.10 supplémentaire
  const matchingDescCount = descriptions.filter(d =>
    SURFACE_WORK_KEYWORDS.some(kw => d.includes(kw))
  ).length;
  if (matchingDescCount >= 1) confidence += 0.20;
  if (matchingDescCount >= 2) confidence += 0.10;

  // (3) L'unité est explicitement dans UNIT_LIKE → +0.20
  if (unit.length > 0 && UNIT_LIKE.some(u => unit === u || unit.startsWith(u + " "))) {
    confidence += 0.20;
  }

  // (4) Aucune ligne m² dans le groupe → +0.15 ; pénalité si une description mentionne m² en texte libre
  const knownSurface = extractKnownSurface(lines);
  if (knownSurface === null) {
    confidence += 0.15;
    const hasM2InDescription = descriptions.some(d => /\bm[²2]\b/.test(d));
    if (hasM2InDescription) confidence -= 0.15;
  }

  // (5) Quantité = 1 ou 2 → +0.05 (cohérent avec un forfait)
  const mainQty = typeof group.mainQuantity === "number" ? group.mainQuantity : 0;
  if (mainQty >= 1 && mainQty <= 2) confidence += 0.05;

  return Math.max(0, Math.min(1, confidence));
}

/** Seuil pour déclencher une action / un badge "Surface à vérifier". */
export const SURFACE_MISMATCH_THRESHOLD = 0.70;
