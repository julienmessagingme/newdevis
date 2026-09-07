/**
 * src/lib/analyse/decoupeDevis.ts
 *
 * 2026-09-06/07 (demande Johan) — DÉCOUPER UN PDF QUI CONTIENT PLUSIEURS DEVIS.
 *
 * Constat à l'origine : un utilisateur dépose « Devis complets.pdf », 18 pages,
 * plusieurs artisans. Seul le premier devis était analysé, **en silence**. Et
 * la garde des 8 pages, une fois réparée, ne fait que refuser le fichier — or
 * « les utilisateurs ne vont pas forcément avoir le temps de redécouper leur
 * devis, et ils vont préférer abandonner ».
 *
 * Ce module contient la partie DÉTERMINISTE et testable : à partir du texte de
 * chaque page, où commencent les devis ? Le découpage physique du PDF et la
 * lecture du texte vivent dans `pdfDecoupeNavigateur.ts`, qui dépend du
 * navigateur et ne se teste pas ici.
 *
 * Principe : on ne devine pas, on suit des IDENTIFIANTS. Un devis change quand
 * son NUMÉRO change, ou quand le SIRET de l'émetteur change. Ce sont les deux
 * seules marques stables d'un document à l'autre — l'en-tête graphique, la
 * mise en page et le vocabulaire varient trop d'un artisan à l'autre.
 */

/** Un devis détecté dans le document : pages `[debut, fin]` incluses, base 0. */
export interface SegmentDevis {
  debut: number;
  fin: number;
  /** Numéro de devis relevé sur la première page, s'il y en a un. */
  numero: string | null;
  /** SIRET de l'émetteur relevé sur le segment, s'il y en a un. */
  siret: string | null;
  /** Nombre de pages du segment. */
  pages: number;
}

/**
 * Numéro de devis : « DEVIS N° 2026-0417 », « Devis n°D2025000567 », « DEV-202608-1 ».
 * On exige le mot « devis » à proximité pour ne pas confondre avec un numéro de
 * commande, de TVA ou de client.
 */
const NUMERO_DEVIS_RE = /devis\s*(?:n\s*[°ºo]?|num[ée]ro|ref\.?|r[ée]f\.?)?\s*[:\-]?\s*([A-Z]{0,4}[-_/]?\d[\dA-Z\-_/.]{2,20})/i;

/** SIRET : 14 chiffres, éventuellement espacés par groupes. */
const SIRET_RE = /\b(\d{3}[\s.]?\d{3}[\s.]?\d{3}[\s.]?\d{5})\b/;

/**
 * Marques d'une PREMIÈRE page de devis. Utilisées seulement en secours, quand
 * ni numéro ni SIRET ne permettent de trancher.
 */
const ENTETE_RE = /\b(devis|proposition commerciale|offre de prix)\b/i;

function normaliseNumero(brut: string): string {
  return brut.toUpperCase().replace(/[\s._/-]/g, "");
}

function normaliseSiret(brut: string): string {
  return brut.replace(/[\s.]/g, "");
}

/** Premier numéro de devis d'une page, normalisé. */
export function numeroDevisDePage(texte: string): string | null {
  const m = texte.match(NUMERO_DEVIS_RE);
  if (!m) return null;
  const n = normaliseNumero(m[1]);
  // Un numéro purement « 2026 » ou « 2025 » est une année, pas une référence.
  if (/^(19|20)\d{2}$/.test(n)) return null;
  return n.length >= 3 ? n : null;
}

/** Premier SIRET d'une page, normalisé. */
export function siretDePage(texte: string): string | null {
  const m = texte.match(SIRET_RE);
  return m ? normaliseSiret(m[1]) : null;
}

/**
 * Découpe le document en devis à partir du texte de chaque page.
 *
 * La règle est volontairement conservatrice : on ouvre un nouveau devis
 * uniquement sur un CHANGEMENT d'identifiant observé, jamais sur une simple
 * ressemblance de mise en page. Rater une frontière produit un devis un peu
 * trop gros — désagréable ; en inventer une coupe un devis en deux et fausse
 * les deux analyses — inacceptable.
 */
export function detecterDevis(pagesTexte: string[]): SegmentDevis[] {
  if (pagesTexte.length === 0) return [];

  const segments: SegmentDevis[] = [];
  let debut = 0;
  let numeroCourant: string | null = null;
  let siretCourant: string | null = null;

  const cloturer = (fin: number) => {
    segments.push({
      debut,
      fin,
      numero: numeroCourant,
      siret: siretCourant,
      pages: fin - debut + 1,
    });
  };

  for (let i = 0; i < pagesTexte.length; i++) {
    const texte = pagesTexte[i] ?? "";
    const numero = numeroDevisDePage(texte);
    const siret = siretDePage(texte);

    if (i === 0) {
      numeroCourant = numero;
      siretCourant = siret;
      continue;
    }

    // Un identifiant DIFFÉRENT de celui en cours ouvre un nouveau devis. Une
    // page sans identifiant (page de conditions générales, suite de tableau)
    // ne rompt jamais : elle appartient au devis courant.
    const numeroRompt = numero !== null && numeroCourant !== null && numero !== numeroCourant;
    const siretRompt = siret !== null && siretCourant !== null && siret !== siretCourant;

    // Cas particulier : le premier devis n'avait pas d'identifiant lisible et
    // une page ultérieure en présente un AVEC un en-tête de devis. C'est une
    // rupture probable — mais on ne l'accepte qu'avec l'en-tête, pour ne pas
    // couper sur un numéro cité en pied de page.
    const premierIdentifiant =
      numeroCourant === null && siretCourant === null &&
      (numero !== null || siret !== null) && ENTETE_RE.test(texte);

    if (numeroRompt || siretRompt || premierIdentifiant) {
      cloturer(i - 1);
      debut = i;
      numeroCourant = numero;
      siretCourant = siret;
      continue;
    }

    // On complète les identifiants manquants du devis en cours sans rompre :
    // beaucoup de devis ne portent le SIRET qu'en pied de dernière page.
    if (numeroCourant === null) numeroCourant = numero;
    if (siretCourant === null) siretCourant = siret;
  }

  cloturer(pagesTexte.length - 1);
  return segments;
}

/**
 * Le découpage vaut-il la peine d'être proposé ?
 *
 * Un seul segment = rien à découper, on garde le comportement actuel (refus si
 * trop long). Proposer un « découpage » en un seul morceau ne ferait qu'ajouter
 * une étape sans rien résoudre.
 */
export function decoupageUtile(segments: SegmentDevis[], pagesMax: number): boolean {
  if (segments.length < 2) return false;
  // Au moins un segment doit devenir analysable, sinon on aura juste remplacé
  // un refus par plusieurs.
  return segments.some((s) => s.pages <= pagesMax);
}
