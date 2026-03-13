import type { DocumentChantier } from '@/types/chantier-ia';

// ── Types publics ──────────────────────────────────────────────────────────────

export interface Quote {
  /** Identifiant unique du document */
  id: string;
  /** Nom du fichier (affiché dans le tableau) */
  nom: string;
  /**
   * Montant TTC extrait heuristiquement depuis le nom du fichier.
   * null si le nom ne contient pas de montant lisible.
   */
  montant: number | null;
  /** Date d'ajout au dossier (ISO string) */
  date: string;
  /** Lien vers l'analyse VerifierMonDevis si le devis a été analysé */
  analyse_id: string | null;
  /** URL signée Supabase pour ouvrir le fichier (TTL 1h) */
  signedUrl?: string | null;
}

export interface CompareResult {
  /** Liste des devis triés par montant croissant (montants null en fin) */
  devis: Quote[];
}

// ── Heuristique extraction du montant ─────────────────────────────────────────

/**
 * Tente d'extraire un montant numérique depuis le nom d'un fichier.
 *
 * Reconnaît les formats courants :
 *  - "devis-plomberie-3200€.pdf"
 *  - "devis_peinture_4 500,00 euros.pdf"
 *  - "2 800.50€ cuisine.pdf"
 *  - "facture 1234.56 eur.pdf"
 */
function extractMontant(nom: string): number | null {
  // Cherche un nombre (avec séparateurs de milliers et décimales) suivi de €/euros
  const match = nom.match(
    /(\d[\d\s.]*)(?:[.,](\d{1,2}))?\s*(?:€|eur(?:os?)?)\b/i,
  );
  if (!match) return null;

  // Reconstruit la partie entière : supprime espaces et points (séparateurs de milliers)
  const entiere = match[1].replace(/[\s.]/g, '');
  const decimale = match[2] ?? '00';
  const n = parseFloat(`${entiere}.${decimale}`);

  return isNaN(n) || n <= 0 ? null : n;
}

// ── Tri ────────────────────────────────────────────────────────────────────────

/**
 * Trie les devis par montant croissant.
 * Les devis sans montant extrait sont placés en fin de liste.
 */
function sortByMontant(a: Quote, b: Quote): number {
  if (a.montant === null && b.montant === null) return 0;
  if (a.montant === null) return 1;
  if (b.montant === null) return -1;
  return a.montant - b.montant;
}

// ── Fonction principale ────────────────────────────────────────────────────────

/**
 * Extrait les documents de type "devis" d'une liste de documents
 * et les transforme en objets `Quote` prêts pour l'affichage comparatif.
 *
 * @param documents - Documents du lot (tous types confondus)
 * @returns `{ devis }` — liste triée par montant croissant
 */
export function compareQuotes(documents: DocumentChantier[]): CompareResult {
  const devis: Quote[] = documents
    .filter((d) => d.document_type === 'devis')
    .map((d): Quote => ({
      id:         d.id,
      nom:        d.nom,
      montant:    extractMontant(d.nom),
      date:       d.created_at,
      analyse_id: d.analyse_id,
      signedUrl:  d.signedUrl,
    }))
    .sort(sortByMontant);

  return { devis };
}
