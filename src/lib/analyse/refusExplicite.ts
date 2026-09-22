/**
 * src/lib/analyse/refusExplicite.ts
 *
 * 🔴 UN MESSAGE D'EXPERT QUI DIT « NE SIGNEZ PAS » NE PEUT PAS COHABITER AVEC
 * UN TITRE QUI PROPOSE DE NÉGOCIER (2026-09-23, cause 2 du défaut ALES).
 *
 * Mesuré sur les 24 conclusions portant un message d'expert : **2 d'entre
 * elles** affichent « Environ 1 332 € à discuter avec l'artisan » (devis ALES)
 * ou « Un point à sécuriser avant de signer » (J.P. ROUX) au-dessus d'un
 * encadré qui conclut *« En résumé, ne signez pas ce devis en l'état. »*
 *
 * ── POURQUOI UNE GARDE À LA SAISIE, ET NON UNE DÉDUCTION APRÈS COUP ─────────
 *
 * `corrected_verdict_global` et `corrected_verdict_decisionnel` sont
 * OPTIONNELS dans `decide.ts` : un expert qui rédige un refus sans toucher les
 * deux sélecteurs laisse le verdict automatique en place. C'est une
 * incohérence de SAISIE, pas un défaut d'affichage.
 *
 * On ne devine donc pas laquelle des deux sources a raison — **on refuse la
 * décision et on demande à l'expert de trancher**. Dériver un verdict d'un
 * texte libre ferait basculer un devis en « ne pas signer » sur une mauvaise
 * lecture, et ce produit s'interdit d'accuser sur une incertitude.
 *
 * ── LE PIÈGE EST LE CONDITIONNEL, ET IL EST PARTOUT ────────────────────────
 *
 * Ces deux phrases se ressemblent et disent l'inverse :
 *   « ne signer aucun document AVANT d'avoir obtenu les mentions » → une pièce
 *     à réclamer ; le devis reste signable une fois obtenue.
 *   « ne pas signer ce devis EN L'ÉTAT »                          → un refus.
 *
 * Un motif qui les confond fabriquerait des refus qui n'existent pas, et
 * bloquerait des corrections parfaitement cohérentes. Les formes retenues
 * ci-dessous viennent de la LECTURE des 24 messages réels, pas de mémoire.
 */

/** Les tournures de refus effectivement écrites par les experts. */
const REFUS =
  /(ne pas signer|ne signez pas|il ne faut (absolument )?pas signer|ne pas donner suite|ne pas y donner suite|d[ée]conseillons (fortement )?de signer|renoncer à ce devis)/g;

/**
 * Ce qui SUIT la tournure décide de son sens : une condition (« avant… »,
 * « sans… », « tant que… ») n'est pas un refus, c'est une pièce à obtenir.
 *
 * ⚠️ Les mots intercalés sont tolérés (« ne signer AUCUN DOCUMENT avant… »)
 * sinon la garde ne verrait pas la condition et compterait un faux refus.
 */
const CONDITION_SUIVANTE =
  /^\s*(aucun|ce|cet|cette|votre|le|la)?\s*(document|devis|contrat)?\s*(avant|sans|tant que)\b/;

/**
 * L'expert refuse-t-il le devis, sans condition ?
 *
 * @param message Le texte écrit par l'expert (`expert_message`).
 */
export function messageRefuseExplicitement(message: string): boolean {
  const texte = (message ?? "").replace(/\s+/g, " ").toLowerCase();
  for (const m of texte.matchAll(REFUS)) {
    const suite = texte.slice(m.index! + m[0].length, m.index! + m[0].length + 80);
    if (CONDITION_SUIVANTE.test(suite)) continue;
    return true;
  }
  return false;
}

/**
 * Le verdict retenu contredit-il le message de l'expert ?
 *
 * ⚠️ ASYMÉTRIQUE, ET C'EST VOULU : on ne signale que le cas « l'expert refuse
 * mais le verdict ne refuse pas ». L'inverse (un verdict « ne pas signer »
 * sous un message rassurant) relève de la cause 1, corrigée séparément — et
 * surtout, un expert qui POSE « ne pas signer » a explicitement tranché, quel
 * que soit le ton de son texte. **Une contradiction de ton n'est pas une
 * contradiction de décision.**
 */
export function verdictContreditLeMessage(
  message: string | null | undefined,
  verdictDecisionnel: string | null | undefined,
): boolean {
  if (!message) return false;
  return messageRefuseExplicitement(message) && verdictDecisionnel !== "ne_pas_signer";
}
