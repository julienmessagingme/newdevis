// ============================================================
// Détection « fourniture seule » (bon de commande de matériel) — 2026-08-18
//
// Cas d'origine : analyse NECHAB (b85ec00a) — photo d'un bon de commande de
// matériel d'éclairage (rails TRACK UNO, spots GU10, ampoules LED) classée
// `devis_travaux` puis scorée « dans la norme / signer, marge 3-5% ». Tout
// était faux : aucune pose, aucun artisan prestataire (le « client » est
// l'artisan qui commande chez son grossiste), rien à comparer au marché de
// la pose.
//
// Règle DÉTERMINISTE : un document dont les lignes sont massivement des
// références produit SANS AUCUN vocabulaire de mise en œuvre est un achat de
// biens → reclassement `hors_scope` / `achat_biens` (bannière dédiée déjà
// câblée dans conclusion.ts V3.4.28).
//
// Garde-fous anti faux positifs (validés sur les cas réels) :
//   - FCE clim : références produit MAIS ligne « MAIN D'OEUVRE POSE GAINABLE »
//     → vocabulaire de pose présent → reste devis_travaux ✓
//   - ATEX / BATIBASE : « Fourniture et pose », « Forfait pose » → idem ✓
//   - Seuil produit 70% ET minimum 3 lignes : un devis mixte majoritairement
//     descriptif n'est pas requalifié.
// ============================================================

/** Token mêlant lettres et chiffres (≥4 chars) = référence produit. */
const PRODUCT_CODE_RE = /\b(?=[A-Za-z0-9-]{4,}\b)(?:[A-Za-z]+\d|\d+[A-Za-z])[A-Za-z0-9-]*\b/;

/** Vocabulaire de mise en œuvre : sa présence = prestation, pas un simple achat. */
const POSE_VOCAB_RE = new RegExp(
  [
    "\\bpose\\b", "\\bposer\\b", "\\bpos[ée]e?s?\\b",
    "installation", "installer",
    "main[ -]d[’']?oeuvre", "main[ -]d[’']?œuvre",
    "\\bd[ée]pose\\b", "d[ée]molition",
    "raccordement", "raccorder",
    "mise en service", "mise en oeuvre", "mise en œuvre",
    "\\bchantier\\b", "intervention", "d[ée]placement",
    "fa[çc]onnage", "saign[ée]e", "\\btirage\\b", "\\bc[âa]blage\\b",
    "\\bforfait\\b", "\\bmontage\\b",
  ].join("|"),
  "i",
);

export interface SupplyOnlyLine {
  libelle?: string | null;
  texte_brut?: string | null;
}

/**
 * true si le document ressemble à un bon de commande de fournitures :
 * ≥3 lignes, ≥70% avec référence produit, zéro vocabulaire de mise en œuvre.
 */
export function detectSupplyOnlyQuote(lignes: SupplyOnlyLine[]): boolean {
  const withText = (Array.isArray(lignes) ? lignes : []).filter(
    (l) => typeof l?.libelle === "string" && l.libelle.trim().length > 0,
  );
  if (withText.length < 3) return false;

  // Le moindre indice de prestation disqualifie la requalification.
  for (const l of withText) {
    const full = `${l.libelle ?? ""}\n${l.texte_brut ?? ""}`;
    if (POSE_VOCAB_RE.test(full)) return false;
  }

  const productLines = withText.filter((l) =>
    PRODUCT_CODE_RE.test((l.libelle ?? "").split("\n")[0]),
  ).length;

  return productLines / withText.length >= 0.7;
}
