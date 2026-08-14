// ============================================================
// Remontée des surfaces inline — itération extract_v2 (2026-08-14)
//
// Cas d'origine : HEXA BAT (BUGS-A-CORRIGER.md
// INCOMPLETE-QUOTE-FAUX-POSITIF-SURFACES-INLINE). Beaucoup de devis BTP
// écrivent « 1 ens » dans la colonne Qté et mettent la surface dans le TEXTE :
//   « Création salle d'eau - 13,23m2 »
//   « Coffrage murs extérieurs avec isolation - 60,61m2 »
// Résultat : quantite=1, unite="ens" → bypass « devis trop synthétique » +
// aucune comparaison marché au m² possible.
//
// Ce module remonte DÉTERMINISTIQUEMENT (regex + gardes, jamais le LLM) la
// surface écrite dans la description vers (quantite, unite="m²"), UNIQUEMENT
// quand c'est sans ambiguïté :
//   - la ligne est un forfait trivial (qty ∈ {null, 0, 1}, unité non surfacique)
//   - le texte contient EXACTEMENT UNE valeur de surface distincte
//     (ou plusieurs mentions de la MÊME valeur, ou un total explicite « = X m² »)
//   - la valeur est plausible (0.5 à 2000 m²)
//
// Gardes anti-pièges (tous vus dans de vrais devis) :
//   - « R = 7,5 m².K/W » : résistance thermique d'isolant, PAS une surface
//   - « 80 €/m² » : prix unitaire, PAS une surface
//   - « 600x600 mm », « ép. 45 mm », « 1X1m » : dimensions, non matchées
//   - « 5à7 m2 » (rendement d'un seau de colle) : plage, ambiguë → non remontée
//
// V1 de l'itération : m² UNIQUEMENT. Le « ml » est volontairement exclu
// (collision avec les millilitres des pots de peinture/colle — « 750ml »).
//
// Trade-off assumé (même philosophie que V3.2.3) : faux négatifs (rater une
// surface réelle) > faux positifs (inventer une surface fausse qui fabrique
// une comparaison marché mensongère).
// ============================================================

export interface LiftableLigne {
  type?: string;
  quantite: number | null;
  unite: string | null;
  prix_unitaire?: number | null;
  montant_total?: number | null;
  libelle?: string | null;
  texte_brut?: string | null;
  quantite_source?: "tableau" | "description_inline";
}

/** Unités « triviales » : la colonne Qté ne portait pas une vraie mesure. */
const TRIVIAL_UNITS = new Set([
  "", "ens", "ens.", "ensemble", "forfait", "fft", "ff", "f", "lot",
  "u", "u.", "unite", "unité", "pce", "pcs",
]);

const SURFACE_RE = /(\d{1,4}(?:[.,]\d{1,2})?)\s*m(?:²|2)(?![\w²])/gi;

/**
 * Extrait LA surface non ambiguë d'un texte, ou null.
 * Exporté pour les tests.
 */
export function extractInlineSurface(text: string): number | null {
  if (!text) return null;

  const candidates: Array<{ value: number; index: number; raw: string }> = [];
  let m: RegExpExecArray | null;
  SURFACE_RE.lastIndex = 0;
  while ((m = SURFACE_RE.exec(text)) !== null) {
    const start = m.index;
    const end = SURFACE_RE.lastIndex;
    const before = text.slice(Math.max(0, start - 8), start);
    const after = text.slice(end, end + 6);

    // Garde 1 — résistance thermique : « R = 7,5 m².K/W » (suffixe .K / K/W)
    if (/^\s*[.,]?\s*k\b|^\s*[.,]?\s*k\//i.test(after)) continue;
    // Garde 2 — « R = 7,5 m² » même sans suffixe : préfixe « R = » / « R: »
    if (/\br\s*[=:]\s*$/i.test(before)) continue;
    // Garde 3 — prix au m² : « 80 €/m² », « 39€ / m² », « par m² »
    if (/[€$]\s*\/?\s*$|\/\s*$|\bpar\s+$/i.test(before)) continue;
    // Garde 4 — plage « 5à7 m2 » ou « 5 à 7 m² » : rendement, ambigu
    if (/\d\s*à\s*$/i.test(before)) continue;

    const value = parseFloat(m[1].replace(",", "."));
    if (!Number.isFinite(value) || value < 0.5 || value > 2000) continue;
    candidates.push({ value, index: start, raw: m[0] });
  }

  if (candidates.length === 0) return null;

  const distinct = [...new Set(candidates.map((c) => c.value))];
  if (distinct.length === 1) return distinct[0];

  // Plusieurs valeurs distinctes : on n'accepte QU'UN total explicite
  // précédé d'un « = » (pattern « Salle d'eau : murs + sol = 16,03m2 »).
  const totals = candidates.filter((c) =>
    /=\s*$/.test(text.slice(Math.max(0, c.index - 4), c.index))
  );
  const totalValues = [...new Set(totals.map((t) => t.value))];
  if (totalValues.length === 1) return totalValues[0];

  return null;
}

/**
 * Applique la remontée sur des lignes V2 (mutation in-place).
 * Retourne le nombre de lignes modifiées.
 */
export function liftInlineQuantities(lignes: LiftableLigne[]): number {
  let lifted = 0;
  for (const l of lignes) {
    if (l.type !== undefined && l.type !== "ligne_travaux") continue;
    const qty = l.quantite;
    if (!(qty === null || qty === undefined || qty === 0 || qty === 1)) continue;
    const unit = String(l.unite ?? "").trim().toLowerCase();
    if (!TRIVIAL_UNITS.has(unit)) continue;

    const text = `${l.libelle ?? ""}\n${l.texte_brut ?? ""}`;
    const surface = extractInlineSurface(text);
    if (surface === null) continue;

    l.quantite = surface;
    l.unite = "m²";
    l.quantite_source = "description_inline";
    // Le prix unitaire « 1 × montant » n'a plus de sens : on le laisse se
    // recalculer (montant / quantite) par la réconciliation.
    if (typeof l.prix_unitaire === "number" && l.prix_unitaire === l.montant_total) {
      l.prix_unitaire = null;
    }
    lifted++;
  }
  return lifted;
}
