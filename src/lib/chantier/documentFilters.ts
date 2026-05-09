import type { DocumentChantier, DocumentType } from '@/types/chantier-ia';

export function filterByType(docs: DocumentChantier[], ...types: DocumentType[]): DocumentChantier[] {
  return docs.filter(d => types.includes(d.document_type));
}

export const getDevis          = (docs: DocumentChantier[]) => filterByType(docs, 'devis');
export const getFactures       = (docs: DocumentChantier[]) => filterByType(docs, 'facture');
/** Devis + factures, hors "frais" (déclarations sans pièce jointe). */
export const getDevisEtFactures = (docs: DocumentChantier[]) =>
  docs.filter(d => (d.document_type === 'devis' || d.document_type === 'facture') && (d as any).depense_type !== 'frais');
export const getPhotos         = (docs: DocumentChantier[]) => filterByType(docs, 'photo');
/** Frais déclarés oralement (sans fichier joint). Stockés comme document_type='facture' + depense_type='frais'. */
export const getFraisDeclares  = (docs: DocumentChantier[]) =>
  docs.filter(d => (d as any).depense_type === 'frais');
export const getOtherDocs      = (docs: DocumentChantier[]) =>
  docs.filter(d => !['devis', 'facture', 'photo'].includes(d.document_type));
