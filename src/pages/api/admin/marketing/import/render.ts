export const prerender = false;
export const config = { maxDuration: 300 };

import type { APIRoute } from 'astro';
import { jsonError, parseJsonBody, optionsResponse } from '@/lib/api/apiHelpers';
import { requireAdmin } from '@/lib/auth/adminAuth';

/**
 * POST /api/admin/marketing/import/render?product=&title=&mode=&platform=
 * Body : { b2Key } (le HTML a déjà été uploadé sur B2 via une URL pré-signée).
 *
 * Déclenche le rendu sur le VPS (server-to-server) : le VPS télécharge le HTML
 * depuis B2, rend chaque slide en mp4/PNG, upload B2, crée la ligne, et renvoie
 * { id, kind, slideCount }. L'appel VPS est long (~30-60 s) → maxDuration 300.
 *
 * Le navigateur ne parle qu'à verifiermondevis.fr (cette route) + B2 (l'upload),
 * jamais à messagingme.app → immunisé aux blocages navigateur.
 */
const RENDER_URL =
  process.env.MARKETING_RENDER_URL ??
  import.meta.env.MARKETING_RENDER_URL ??
  'https://marketing-render.messagingme.app';
const RENDER_TOKEN =
  process.env.MARKETING_RENDER_TOKEN ?? import.meta.env.MARKETING_RENDER_TOKEN;

const RENDER_TIMEOUT_MS = 5 * 60 * 1000;
const B2_KEY_RE = /^imports\/[a-z0-9]+\.html$/i;

export const POST: APIRoute = async ({ request, url }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  if (!RENDER_TOKEN) {
    return jsonError('Service de rendu non configuré (MARKETING_RENDER_TOKEN)', 503);
  }

  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;
  const b2Key = (body as { b2Key?: string }).b2Key;
  if (!b2Key || !B2_KEY_RE.test(b2Key)) return jsonError('b2Key invalide', 400);

  // Reprend product/title/mode/platform de la query + ajoute b2Key.
  const qs = new URLSearchParams(url.search);
  qs.set('b2Key', b2Key);
  const target = `${RENDER_URL.replace(/\/$/, '')}/import-carousel?${qs.toString()}`;

  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: { Authorization: `Bearer ${RENDER_TOKEN}` },
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erreur inconnue';
    return jsonError(`Service de rendu injoignable depuis Vercel : ${msg}`, 502);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
