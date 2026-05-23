// Réécrit une URL d'image B2 vers le proxy CDN-caché `/api/admin/marketing/img`.
//
// À utiliser pour tout <img src> qui pointe vers le bucket B2 marketing : sinon
// le navigateur tape B2 directement à chaque affichage et le quota de download
// gratuit explose (toutes les previews tombent en 403). Voir `img.ts`.
//
// Les URLs non-B2 (live previews du render-server, data:, blob:) passent
// inchangées.

const B2_BASE = 'https://f005.backblazeb2.com/file/gerermonchantier/';

export function proxyImg(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith(B2_BASE)) {
    return `/api/admin/marketing/img?u=${encodeURIComponent(url)}`;
  }
  return url;
}
