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
/**
 * 2026-09-07 — MESURÉ, plus supposé.
 *
 * Le plafond de 8 pages reposait sur UN échec observé le 2026-09-03 (un
 * `ilovepdf_merged_compressed.pdf` de 11 pages, `AI_TIMEOUT` à 93 s) — un
 * fichier qu'on n'a plus. Mesure refaite sur des documents réels, avec la
 * configuration exacte de production (gemini-2.5-flash, `thinkingBudget: 0`,
 * 32 768 tokens de sortie, plafond edge à 80 s) :
 *
 *   3 pages,   6 lignes de travaux →  8,1 s
 *  15 pages,  84 lignes            → 28,8 s
 *  18 pages,  91 lignes            → 32,8 s   ← JSON complet, `finishReason: STOP`
 *
 * Le plafond réel n'est donc pas atteint à 18 pages : il reste plus de 45 s de
 * marge. Ce qui pilote le temps n'est d'ailleurs pas le nombre de PAGES mais le
 * nombre de LIGNES à écrire en sortie — 91 lignes ne consomment que 7 975 des
 * 32 768 tokens disponibles.
 *
 * On monte donc à 15, borne mesurée deux fois et confortable, sans aller
 * jusqu'à 18 : au-delà, on n'a pas de mesure et le vrai filet est le découpage.
 */
export const PAGES_MAX_EXTRACTION = 15;

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
