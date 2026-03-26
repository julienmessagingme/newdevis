import type { DocumentChantier, DocumentType } from '@/types/chantier-ia';

export function filterByType(docs: DocumentChantier[], ...types: DocumentType[]): DocumentChantier[] {
  return docs.filter(d => types.includes(d.document_type));
}

export const getDevis          = (docs: DocumentChantier[]) => filterByType(docs, 'devis');
export const getFactures       = (docs: DocumentChantier[]) => filterByType(docs, 'facture');
export const getDevisEtFactures = (docs: DocumentChantier[]) => filterByType(docs, 'devis', 'facture');
export const getPhotos         = (docs: DocumentChantier[]) => filterByType(docs, 'photo');
export const getOtherDocs      = (docs: DocumentChantier[]) =>
  docs.filter(d => !['devis', 'facture', 'photo'].includes(d.document_type));
