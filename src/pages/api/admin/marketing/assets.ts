export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError } from '@/lib/api/apiHelpers';
import { requireAdmin } from '@/lib/auth/adminAuth';

// Les manifestes B2 (photos de fond + assets décor) sont servis ici côté
// serveur : B2 ne renvoie pas d'en-tête CORS, donc un fetch() direct depuis
// le navigateur échoue. Ce proxy même-origine règle le problème.
const B2_BASE = 'https://f003.backblazeb2.com/file/verifiermondevismarketing';

async function fetchManifest(path: string, key: string): Promise<unknown[]> {
  try {
    const res = await fetch(`${B2_BASE}/${path}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.[key]) ? data[key] : [];
  } catch {
    return [];
  }
}

/**
 * GET /api/admin/marketing/assets
 * Renvoie { photos: [...], decor: [...] } pour les galeries de l'éditeur.
 */
export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const [photos, decor] = await Promise.all([
    fetchManifest('photos/manifest.json', 'photos'),
    fetchManifest('decor/manifest.json', 'decor'),
  ]);
  return jsonOk({ photos, decor });
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
