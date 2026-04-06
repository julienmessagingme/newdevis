/**
 * Semantic emoji for lot names created manually via the UI.
 * AI-generated lots (chantier-generer) already have meaningful emojis.
 * This only applies to lots created inline (UploadDocumentModal, DocumentsView, AddDocumentModal).
 */
const EMOJI_MAP: Record<string, string> = {
  toiture: '🏠', charpente: '🏠', couvreur: '🏠', toit: '🏠',
  plomberie: '🚿', plombier: '🚿', chauffage: '🚿', chaudiere: '🚿',
  electricite: '⚡', electri: '⚡', tableau: '⚡',
  maconnerie: '🧱', macon: '🧱', beton: '🧱',
  peinture: '🎨', peintre: '🎨', ravalement: '🎨',
  carrelage: '🔲', carreleur: '🔲', parquet: '🔲',
  menuiserie: '🪟', fenetre: '🪟', vitr: '🪟', baie: '🪟', volet: '🪟',
  cuisine: '🍳',
  salle: '🛁', sanitaire: '🛁',
  terrasse: '🌿', deck: '🌿',
  piscine: '🏊', bassin: '🏊',
  isolation: '🧊', isolant: '🧊',
  pergola: '🌞', veranda: '🌞',
  portail: '🚪', portillon: '🚪',
  cloture: '🏗️', grillage: '🏗️',
  jardin: '🌳', paysag: '🌳', arrosage: '🌳',
  demolition: '🔨', terrassement: '🔨',
  amenagement: '📐',
};

export function getSemanticEmoji(lotName: string): string {
  const lower = lotName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [keyword, emoji] of Object.entries(EMOJI_MAP)) {
    if (lower.includes(keyword)) return emoji;
  }
  return '📦';
}
