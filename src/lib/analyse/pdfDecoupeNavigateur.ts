/**
 * src/lib/analyse/pdfDecoupeNavigateur.ts
 *
 * 2026-09-07 — lecture et découpage d'un PDF DANS LE NAVIGATEUR.
 *
 * Complément de `decoupeDevis.ts` : celui-ci contient la règle (où coupe-t-on),
 * celui-là les entrées/sorties (lire le texte, écrire les fichiers). Les deux
 * bibliothèques sont chargées en `import()` dynamique pour ne pas alourdir le
 * bundle de tous les visiteurs — seul celui qui dépose un gros PDF les paie.
 *
 * Aucune donnée ne sort du navigateur à cette étape : le découpage est fait sur
 * la machine de l'utilisateur, avant tout envoi.
 */

import { detecterDevis, type SegmentDevis } from "./decoupeDevis";
// 2026-09-07 — le worker doit être résolu par Vite, PAS par `new URL()`.
//
// Première version : `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)`.
// Vite ne résout pas les specifiers de PAQUET dans `new URL()` — seulement les
// chemins relatifs. L'URL produite pointait donc vers `/pdfjs-dist/...` sur
// notre domaine, qui n'existe pas : 404, worker mort, lecture du PDF en échec,
// et l'utilisateur retombait sur le message de refus « 18 pages, trop long »
// sans jamais voir le découpage. Le suffixe `?url` fait émettre l'asset par le
// bundler et rend son adresse réelle. Servi depuis notre origine, donc couvert
// par `default-src 'self'` — aucune règle CSP à ajouter.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/** Au-delà, on renonce : le temps de traitement navigateur cesse d'être tenable. */
const PAGES_MAX_LECTURE = 60;

/**
 * Texte de chaque page, dans l'ordre. Tableau vide si la lecture échoue —
 * l'appelant retombe alors sur le comportement de refus, jamais sur un
 * découpage à l'aveugle.
 */
export async function lireTextePages(fichier: Blob): Promise<string[]> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

    const donnees = new Uint8Array(await fichier.arrayBuffer());
    const doc = await pdfjs.getDocument({ data: donnees }).promise;
    if (doc.numPages > PAGES_MAX_LECTURE) {
      doc.destroy();
      return [];
    }

    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const contenu = await page.getTextContent();
      const texte = contenu.items
        .map((it) => (typeof (it as { str?: unknown }).str === "string" ? (it as { str: string }).str : ""))
        .join(" ");
      pages.push(texte);
      page.cleanup();
    }
    doc.destroy();
    return pages;
  } catch (e) {
    console.warn("[decoupe] lecture du texte impossible :", e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * Écrit un fichier PDF par segment. Le nom reprend celui d'origine suffixé du
 * rang et, quand on le connaît, du numéro de devis — l'utilisateur doit
 * pouvoir relier chaque analyse à son document.
 */
export async function ecrireSegments(
  fichier: File,
  segments: SegmentDevis[],
): Promise<File[]> {
  const { PDFDocument } = await import("pdf-lib");
  const source = await PDFDocument.load(await fichier.arrayBuffer());
  const base = fichier.name.replace(/\.pdf$/i, "");

  const sorties: File[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const cible = await PDFDocument.create();
    const indices = [];
    for (let p = seg.debut; p <= seg.fin; p++) indices.push(p);
    const copiees = await cible.copyPages(source, indices);
    for (const page of copiees) cible.addPage(page);
    const octets = await cible.save();
    const suffixe = seg.numero ? `devis-${seg.numero}` : `devis-${i + 1}`;
    sorties.push(
      new File([octets as BlobPart], `${base} — ${suffixe}.pdf`, { type: "application/pdf" }),
    );
  }
  return sorties;
}

export interface ResultatDecoupe {
  /** Les fichiers à analyser, un par devis. Vide si le découpage n'a rien donné. */
  fichiers: File[];
  segments: SegmentDevis[];
  /** Segments encore trop longs après découpage : ils ne seront pas analysables. */
  tropLongs: SegmentDevis[];
}

/**
 * Tente de découper un PDF multi-devis. Retourne `null` quand il n'y a rien à
 * découper (un seul devis détecté, ou lecture impossible) : l'appelant garde
 * alors son comportement habituel.
 */
export async function tenterDecoupe(
  fichier: File,
  pagesMax: number,
): Promise<ResultatDecoupe | null> {
  const pages = await lireTextePages(fichier);
  // On distingue les trois « rien à découper » dans le journal : sans ça, un
  // worker cassé et un document mono-devis produisent le même silence côté
  // utilisateur — c'est ce qui a masqué le bug du worker le 07/09.
  if (pages.length === 0) {
    console.warn("[decoupe] texte illisible — aucun découpage possible");
    return null;
  }

  const segments = detecterDevis(pages);
  if (segments.length < 2) {
    console.info(`[decoupe] un seul devis détecté sur ${pages.length} pages`);
    return null;
  }

  const analysables = segments.filter((s) => s.pages <= pagesMax);
  if (analysables.length === 0) {
    console.info(`[decoupe] ${segments.length} devis détectés, tous au-delà de ${pagesMax} pages`);
    return null;
  }
  console.info(`[decoupe] ${segments.length} devis détectés, ${analysables.length} analysable(s)`);

  const fichiers = await ecrireSegments(fichier, analysables);
  return {
    fichiers,
    segments,
    tropLongs: segments.filter((s) => s.pages > pagesMax),
  };
}
