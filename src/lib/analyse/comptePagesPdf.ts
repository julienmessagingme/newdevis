/**
 * src/lib/analyse/comptePagesPdf.ts
 *
 * Compte les pages d'un PDF sans bibliothèque, côté navigateur.
 *
 * Pourquoi (incident du 2026-09-03) : un utilisateur a envoyé un
 * `ilovepdf_merged_compressed.pdf` de 11 pages — plusieurs devis fusionnés.
 * Le fichier passait toutes nos validations (466 Ko, bien en dessous des
 * 10 Mo), puis l'extraction Gemini dépassait son budget : **AI_TIMEOUT après
 * 93 secondes**, reproduit deux fois. L'utilisateur voyait un spinner, puis
 * rien. Autant le lui dire à la seconde 0 : un document de cette taille ne
 * passera pas, et il n'y a aucune raison de brûler un appel Gemini pour le
 * découvrir.
 *
 * Méthode : on cherche les objets `/Type /Page` dans les octets du fichier.
 * C'est une heuristique — un PDF avec flux d'objets compressés
 * (`/ObjStm`) peut masquer ses pages — donc en cas de doute on renvoie `null`
 * et on laisse passer. **Ne jamais bloquer sur une incertitude** : rater un
 * gros PDF est bénin, refuser un devis d'une page qu'on aurait su lire est
 * inacceptable.
 */

/** Au-delà, l'extraction dépasse son budget de façon quasi certaine. */
export const PAGES_MAX_EXTRACTION = 8;

/**
 * @returns le nombre de pages, ou `null` si le comptage n'est pas fiable.
 */
export async function comptePagesPdf(fichier: Blob): Promise<number | null> {
  try {
    const octets = new Uint8Array(await fichier.arrayBuffer());
    // latin1 : un octet = un caractère, aucune réinterprétation UTF-8 qui
    // fausserait les positions.
    const texte = new TextDecoder("latin1").decode(octets);

    // `/Count N` de l'arbre des pages, quand il est présent : c'est la source
    // la plus fiable. On prend le plus grand (l'arbre racine).
    const counts = [...texte.matchAll(/\/Count\s+(\d{1,4})\b/g)]
      .map((m) => Number(m[1]))
      .filter((n) => Number.isFinite(n) && n > 0);
    const parCount = counts.length > 0 ? Math.max(...counts) : null;

    // Dénombrement des objets page. Le `[^s]` évite de compter « /Type /Pages »,
    // qui est le NŒUD de l'arbre, pas une page.
    const parObjets = (texte.match(/\/Type\s*\/Page[^s]/g) ?? []).length || null;

    // 2026-09-06 (cas « Devis complets.pdf », 18 pages, retour Johan) — LE
    // BAIL-OUT SUR /ObjStm AVALAIT EXACTEMENT LES PDF QU'IL VISE.
    //
    // La version du 2026-09-03 renvoyait `null` dès qu'un flux d'objets
    // compressés était détecté. Or les PDF fusionnés par les outils grand
    // public (iLovePDF ici) en contiennent SYSTÉMATIQUEMENT — donc les gros
    // documents multi-devis, ceux que la garde devait arrêter, passaient tous.
    // Mesuré sur ce fichier : `/ObjStm` présent, mais `/Count 18` ET 18 objets
    // page, parfaitement lisibles et concordants.
    //
    // La bonne règle n'est pas « ObjStm ⇒ je renonce » mais « je renonce si je
    // n'ai pas deux signaux qui concordent ». Quand les deux méthodes tombent
    // d'accord, le compte est sûr quelle que soit la compression.
    const compresse = /\/ObjStm\b/.test(texte);
    if (!compresse) return parCount ?? parObjets;

    if (parCount !== null && parObjets !== null && parCount === parObjets) return parCount;
    // Signaux absents ou divergents sur un PDF compressé : on ne sait pas, et
    // rater un gros PDF reste moins grave que refuser un devis d'une page.
    return null;
  } catch {
    return null;
  }
}

/**
 * Message à afficher quand le document est trop long, ou `null` s'il peut
 * partir en analyse.
 */
export async function verifierLongueurPdf(fichier: File): Promise<string | null> {
  if (!/\.pdf$/i.test(fichier.name) && fichier.type !== "application/pdf") return null;
  const pages = await comptePagesPdf(fichier);
  if (pages === null || pages <= PAGES_MAX_EXTRACTION) return null;
  return `Ce document fait ${pages} pages : c'est trop long pour être analysé d'un seul tenant. `
    + `S'il contient plusieurs devis, envoyez-les un par un — vous aurez une analyse par devis, `
    + `et vous pourrez ensuite les comparer entre eux.`;
}
