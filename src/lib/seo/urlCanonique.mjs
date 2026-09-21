/**
 * LA FORME CANONIQUE D'UNE URL DU SITE — ÉCRITE UNE SEULE FOIS.
 *
 * 🔴 POURQUOI CE MODULE EXISTE (2026-09-21, mesuré en production)
 *
 * Deux endroits décidaient de la forme d'une URL, et ils ont divergé :
 *
 *   • `BaseLayout.astro` composait le canonical de chaque page  → `/faq`   (SANS slash)
 *   • `@astrojs/sitemap` écrivait la liste soumise à Google      → `/faq/`  (AVEC slash)
 *
 * Résultat mesuré sur les 98 URLs du sitemap servi : **97 pages sur 97**
 * répondaient 200 dans les DEUX formes, avec un contenu **identique à
 * l'octet près** et **aucune redirection** pour les réconcilier. Nos 325
 * liens internes pointaient tous vers la forme SANS slash, le canonical de
 * chaque page aussi — le sitemap était seul contre tout le reste, et
 * demandait à Google d'explorer 98 adresses que les pages désavouaient.
 *
 * ⚠️ NE PAS RECOPIER CETTE RÈGLE AILLEURS. C'est exactement la duplication
 * qui a produit le défaut : deux implémentations d'une même notion finissent
 * toujours par diverger. Tout nouveau code qui produit une URL du site
 * (sitemap, canonical, og:url, lien absolu dans un e-mail) importe d'ici.
 *
 * ⚠️ Fichier en `.mjs` DÉLIBÉRÉMENT : `astro.config.mjs` est chargé au build
 * et doit pouvoir l'importer sans passer par la résolution TypeScript.
 */

/**
 * Rend la forme canonique d'une URL absolue du site.
 *
 * Deux règles, et seulement deux :
 *   1. le protocole est `https`
 *   2. le chemin ne se termine pas par `/`, SAUF la racine d'un domaine
 *
 * @param {string | URL} href URL absolue (`https://www.verifiermondevis.fr/faq/`)
 * @returns {string} la même URL sous sa forme canonique
 */
export function urlCanonique(href) {
  const brut = String(href).replace(/^http:/, "https:");

  // La racine garde son slash : `https://exemple.fr/` EST sa forme canonique,
  // et `https://exemple.fr` (sans rien) n'est pas une URL de page.
  // ⚠️ La condition porte sur le CHEMIN, pas sur une comparaison au domaine
  // VMD codé en dur : le même build sert gerermonchantier.fr, dont la racine
  // doit être traitée comme celle de VMD.
  let chemin;
  try {
    chemin = new URL(brut).pathname;
  } catch {
    // Entrée non parsable : on ne devine pas, on rend l'entrée inchangée.
    return brut;
  }
  if (chemin === "/") return brut;

  return brut.endsWith("/") ? brut.slice(0, -1) : brut;
}
