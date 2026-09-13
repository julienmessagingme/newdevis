// ============================================================
// Repli « par personne » — dernier recours d'identification.
//
// 2026-09-13 (devis « Entreprise Fk »). Le devis porte « Entreprise Fk », un
// nom commercial qui ne désigne AUCUNE entreprise au registre. Son en-tête
// porte aussi `kurtis.forgeas@icloud.com` — et `q=Forgeas Kurtis` rend un seul
// résultat : KURTIS FORGEAS, SIREN 809 748 759, APE 43.91B (couverture),
// active. Le métier colle au devis, et le numéro imprimé est ce SIREN avec
// trois chiffres mal lus.
//
// 🔴 CHEZ UN ARTISAN EN ENTREPRISE INDIVIDUELLE, LA RAISON SOCIALE EST LE NOM
// DE LA PERSONNE. Le nom commercial la cache, et c'est lui qu'on imprime en
// gros sur le devis. D'où ce repli, tenté APRÈS le repli par nom et seulement
// quand rien n'a permis d'identifier l'entreprise.
//
// ⚠️ L'ORDRE N'EST PAS UN DÉTAIL, C'EST LA GARDE PRINCIPALE. Mesuré sur les 17
// cas du stock où le repli par nom joue : lancé sur TOUS, le repli par personne
// contredit la production une fois — sur un devis PORCELANOSA, où le contact
// imprimé est une COMMERCIALE et où son homonyme au registre est une
// auto-entrepreneuse en « création artistique », cessée. Le contact d'un devis
// de grande enseigne n'est pas le chef d'entreprise. Lancé en DERNIER, sur les
// seuls cas non identifiés, ce repli résout 2 des 7 ambiguïtés sans en
// contredire aucune.
// ============================================================

/**
 * Mots de FONCTION : ils désignent une boîte aux lettres, jamais quelqu'un.
 * Les chercher au registre reviendrait à chercher « contact » comme raison
 * sociale — et le registre, plein de mots courants, rendrait n'importe quoi.
 *
 * ⚠️ N'Y METTRE QUE DES FONCTIONS, JAMAIS DES MOTS DE MÉTIER. Mon premier jet
 * y avait rangé « batiment », « travaux », « renovation », « entreprise »,
 * « sarl » — et il cassait le cas réel `hdh.batiment@gmail.com`, dont
 * « batiment » est un morceau de la raison sociale (ABDELKARIM BOUCHEIKH —
 * HDH BATIMENT). Un mot de métier appartient au nom ; un mot de fonction non.
 */
const MOTS_DE_FONCTION = new Set([
  "contact", "info", "infos", "devis", "commercial", "commerciale", "secretariat",
  "accueil", "admin", "administration", "direction", "service", "services", "sav",
  "compta", "comptabilite", "facturation", "bonjour", "hello", "mail", "courrier",
  "client", "clients", "support", "noreply",
]);

/** Un fragment n'est un morceau de nom que s'il est alphabétique et assez long. */
const estFragmentDeNom = (m: string) => /^[a-zà-öø-ÿ'’-]{3,}$/i.test(m);

const normaliser = (s: string | null | undefined) =>
  String(s ?? "").trim().replace(/\s+/g, " ");

/**
 * Candidats de recherche « personne », du plus fiable au moins fiable.
 *
 * @param email    e-mail de l'entreprise tel qu'imprimé sur le devis
 * @param contact  nom de la personne de contact, si le devis en porte un
 *
 * ⚠️ Un PRÉNOM SEUL ne sort jamais : « Kurtis » chercherait tous les Kurtis de
 * France. Il n'est utilisé que collé à un fragment tiré de l'e-mail.
 */
export function candidatsPersonne(
  email: string | null | undefined,
  contact?: string | null,
): string[] {
  const out: string[] = [];

  // 1. Un nom de contact en DEUX mots au moins est le meilleur candidat :
  //    c'est un nom complet écrit par l'entreprise elle-même.
  const c = normaliser(contact);
  const motsContact = c.split(" ").filter(estFragmentDeNom);
  if (motsContact.length >= 2) out.push(c);

  // 2. La partie locale de l'e-mail, si elle a la forme d'un nom.
  // ⚠️ On exige une vraie adresse : sans arobase, « pas-un-email » se
  // découperait en fragments et produirait une recherche absurde.
  const brut = String(email ?? "").trim().toLowerCase();
  const local = /^[^@\s]+@[^@\s]+$/.test(brut) ? brut.split("@")[0] : "";
  const fragments = local.split(/[._\-+0-9]+/).filter(estFragmentDeNom);
  const utiles = fragments.filter((f) => !MOTS_DE_FONCTION.has(f));
  if (utiles.length >= 2) {
    out.push(utiles.join(" "));
  } else if (utiles.length === 1 && motsContact.length === 1) {
    // Un fragment + un prénom de contact : « kurtis » + « forgeas ».
    // ⚠️ On ne sait pas lequel est le prénom — l'ordre importe peu, le registre
    // cherche en texte libre.
    out.push(`${motsContact[0]} ${utiles[0]}`);
  }

  return [...new Set(out.map(normaliser).filter((s) => s.length >= 6))];
}

/**
 * Un résultat de repli par personne n'est retenu que s'il est ACTIF.
 *
 * 🔴 Retenir un homonyme CESSÉ produirait un « entreprise radiée » faux — la
 * pire erreur que ce produit puisse commettre, et exactement ce que la V3.4.19
 * avait déjà interdit sur le repli par nom (cas AEB Rénovation : 2 homonymes
 * radiés sur 6, le vrai artisan étant actif depuis 1993). Sur un nom de
 * personne l'homonymie est encore plus fréquente que sur une raison sociale :
 * dans le doute, on reste sans identification, ce qui est honnête.
 */
export function resultatPersonneAcceptable(etatAdministratif: string | null | undefined): boolean {
  return etatAdministratif === "A";
}
