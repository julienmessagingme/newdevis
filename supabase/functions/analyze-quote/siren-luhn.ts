// ============================================================
// Validité formelle d'un SIREN / SIRET — clé de Luhn.
//
// 2026-09-13 (devis « Entreprise Fk ») — POURQUOI CE MODULE EXISTE.
// Le numéro imprimé sur ce devis, 806 713 759 00019, ne renvoie rien : ni par
// SIRET, ni par SIREN, ni par nom + code postal. La tentation est d'en faire un
// critère ROUGE — « entreprise inexistante ». La mesure l'interdit.
//
// Rejeu des 311 devis du stock portant un numéro (`scripts/mesure-siret-introuvable.mjs`) :
//   298 entreprises retrouvées par leur numéro
//    11 numéros MAL FORMÉS (clé de Luhn KO)  ← AMENATECH, Kbane, ANDRE GRIFFATON,
//                                              THEBAUD, Ferrer… des entreprises
//                                              parfaitement réelles, dont les
//                                              chiffres ont été mal lus
//     1 numéro valide mais entreprise retrouvée par son nom
//     1 « aucune trace » — et c'est `00000000000000`, un artefact d'extraction
//
// **Un numéro qui ne se retrouve pas est presque toujours un défaut de LECTURE,
// pas une entreprise fantôme.** D'où ce module : il sépare « je n'ai pas su lire
// le numéro » de « ce numéro est bien formé et ne désigne personne ». Les deux
// méritent d'être dits à l'utilisateur ; aucun des deux n'est une accusation.
//
// ⚠️ La clé de Luhn ne PROUVE rien : un numéro valide peut être inventé, et un
// numéro invalide peut être une simple coquille. Elle ne sert qu'à choisir le
// bon mot, jamais à trancher.
// ============================================================

/** Seule exception connue à Luhn dans le répertoire SIRENE. */
const SIREN_LA_POSTE = "356000000";

/**
 * Clé de Luhn, calculée en doublant un rang sur deux EN PARTANT DE LA DROITE.
 * ⚠️ C'est bien la même mécanique pour le SIREN (9 chiffres) et le SIRET (14) :
 * la règle officielle parle de rangs pairs pour l'un et impairs pour l'autre
 * parce que les longueurs sont de parités opposées — compter depuis la droite
 * réconcilie les deux sans cas particulier.
 */
function luhn(chiffres: string): boolean {
  let somme = 0;
  for (let i = 0; i < chiffres.length; i++) {
    let d = Number(chiffres[chiffres.length - 1 - i]);
    if (Number.isNaN(d)) return false;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    somme += d;
  }
  return somme % 10 === 0;
}

/**
 * true si le numéro a la forme d'un SIREN (9) ou d'un SIRET (14) valide.
 * Tout le reste — longueur inattendue, que des zéros, clé fausse — est un
 * numéro qu'on n'a pas su lire.
 */
export function estNumeroSirenValide(numero: string | null | undefined): boolean {
  const n = String(numero ?? "").replace(/\D/g, "");
  if (n.length !== 9 && n.length !== 14) return false;
  // `00000000000000` satisfait Luhn (somme nulle) : à écarter explicitement,
  // c'est le placeholder que produisent certains PDF mal océrisés.
  if (/^0+$/.test(n)) return false;
  const siren = n.slice(0, 9);
  if (siren === SIREN_LA_POSTE) return true;
  if (!luhn(siren)) return false;
  return n.length === 9 ? true : luhn(n);
}

/**
 * Récupère un SIREN dans un numéro de longueur INATTENDUE — 10, 11, 12, 13
 * chiffres, ou plus de 14 — en retenant les 9 premiers.
 *
 * 🔴 LA CLÉ DE LUHN EST LA CONDITION, PAS UN ORNEMENT. Tronquer un numéro au
 * hasard jusqu'à tomber sur une entreprise est le meilleur moyen d'en désigner
 * une au hasard. La clé rend la troncature vérifiable : sur 9 chiffres elle ne
 * laisse passer qu'un numéro sur dix.
 *
 * ⚠️ ELLE NE S'APPLIQUE QU'À LA TRONCATURE, jamais à un numéro pris tel quel.
 * Un SIREN de 9 chiffres imprimé sur le devis continue d'être cherché sans
 * contrôle de clé : l'utiliser n'est pas une inférence, le tronquer si.
 * Passer les 9 chiffres au crible reviendrait à changer, sans l'avoir mesuré,
 * le sort des 18 devis du stock qui en portent un.
 *
 * Mesuré le 2026-09-13 sur 365 documents (`scripts/mesure-siren-longueurs.mjs`) :
 * 4 numéros de longueur inattendue, dont **1 récupéré** — `851828566014` (12
 * chiffres) → SIREN 851 828 566 = ABDELKARIM BOUCHEIKH (HDH BATIMENT), active.
 * Les 2 numéros à clé fausse sont écartés, et le dernier est bien formé mais
 * absent du registre. Les 5 numéros de 13 chiffres, jusqu'ici tronqués SANS
 * contrôle, passent tous la clé : le durcissement ne retire rien.
 */
export function sirenParTroncature(numero: string | null | undefined): string | null {
  const n = String(numero ?? "").replace(/\D/g, "");
  if (n.length < 10) return null;
  const s9 = n.slice(0, 9);
  return estNumeroSirenValide(s9) ? s9 : null;
}
