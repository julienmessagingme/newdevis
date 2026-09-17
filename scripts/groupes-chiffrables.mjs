/**
 * scripts/groupes-chiffrables.mjs
 *
 * 🔴 2026-09-17 — LE FILTRE DE CONFIANCE QUE TOUS MES BANCS OUBLIAIENT.
 *
 * `computeServerSurcout` n'est JAMAIS appelée sur les groupes bruts en
 * production. `conclusion.ts` (V3.5.13, ~l.1284) retire d'abord tout groupe
 * dont `vectorial.confidence` n'est pas `high` :
 *
 *     if (!vect || typeof vect !== "object") return true;   // V3.6 legacy → permissif
 *     if (vect.confidence === "high") return true;
 *     return false;                                          // medium / low / no_match
 *
 * Or les bancs écrits les 16 et 17/09 passaient les groupes STOCKÉS directement
 * à la fonction. Ils mesuraient donc **un moteur plus sévère que celui qui
 * tourne** : des postes en confiance `medium` y étaient comptés comme accusés
 * alors que la production ne les chiffre pas.
 *
 * Trouvé en regardant POURQUOI les deux faux rapprochements les plus lourds
 * (« Plancher poutrelles hourdis » opposé à *Isolation plancher haut*,
 * « Fenêtre + BVR électrique intégré » opposée à *Fenêtre PVC* sans volet)
 * étaient tous deux en `medium` — un hasard trop régulier pour en être un.
 *
 * ⚠️ RÈGLE IMPORTÉE ET PARTAGÉE, jamais recopiée dans chaque banc : c'est
 * précisément la duplication qui a produit la divergence (même leçon que
 * `motifNonChiffrable` le 15/09 et `memes-postes` le 17/09).
 *
 * ⚠️ « PAS DE MÉTA VECTORIELLE → ON GARDE » : les analyses V3.6 legacy n'ont
 * pas de champ `vectorial`. Les écarter ici retirerait de la mesure une part
 * entière du stock — la production les garde, le banc doit faire pareil.
 */

/** Les groupes que la production soumet réellement au chiffrage. */
export function groupesChiffrables(groupes) {
  if (!Array.isArray(groupes)) return [];
  return groupes.filter((g) => {
    if (!g || typeof g !== "object") return true;
    const vect = g.vectorial;
    if (!vect || typeof vect !== "object") return true; // V3.6 legacy → permissif
    return vect.confidence === "high";
  });
}

/** Combien de groupes le filtre retire — utile pour un témoin de banc. */
export function compterRetiresParConfiance(groupes) {
  const avant = Array.isArray(groupes) ? groupes.length : 0;
  return avant - groupesChiffrables(groupes).length;
}
