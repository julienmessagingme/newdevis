export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonError, parseJsonBody } from '@/lib/api/apiHelpers';
import { requireAdmin } from '@/lib/auth/adminAuth';

// Service de rendu (VPS, derrière NPM). URL publique non secrète → défaut en
// dur ; le token est secret → uniquement via env.
const RENDER_URL =
  process.env.MARKETING_RENDER_URL ??
  import.meta.env.MARKETING_RENDER_URL ??
  'https://marketing-render.messagingme.app';
const RENDER_TOKEN =
  process.env.MARKETING_RENDER_TOKEN ?? import.meta.env.MARKETING_RENDER_TOKEN;

/**
 * POST /api/admin/marketing/templates/:id/preview
 * Proxy serveur vers le service de rendu : renvoie le PNG d'1 slide rendue
 * avec le contenu fourni (édition en cours, non sauvegardée). Garde le token
 * côté serveur. Auth admin obligatoire.
 */
export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const id = params.id;
  if (!id) return jsonError('Missing template id', 400);
  if (!RENDER_TOKEN) {
    return jsonError('Service de rendu non configuré (MARKETING_RENDER_TOKEN)', 503);
  }

  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;
  const { slideKey, platform, slide } = body as Record<string, unknown>;
  if (!slideKey || !slide) return jsonError('slideKey et slide requis', 400);

  try {
    const res = await fetch(`${RENDER_URL.replace(/\/$/, '')}/preview`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RENDER_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id, slideKey, platform: platform ?? 'instagram', slide }),
      signal: AbortSignal.timeout(35000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return jsonError(`Rendu échoué (${res.status}): ${txt.slice(0, 200)}`, 502);
    }
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erreur inconnue';
    return jsonError(`Service de rendu injoignable: ${msg}`, 502);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
