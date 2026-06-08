export const prerender = false;

import type { APIRoute } from 'astro';
import { jsonError, optionsResponse } from '@/lib/api/apiHelpers';
import { requireAdmin } from '@/lib/auth/adminAuth';

/**
 * POST /api/admin/marketing/import/presign
 * → { putUrl, b2Key } : URL B2 pré-signée pour que le navigateur uploade le HTML
 *   directement vers Backblaze (joignable même si messagingme.app est bloqué par
 *   un ad-blocker / DNS sécurisé / antivirus). Le rendu est ensuite déclenché via
 *   /import/render (qui passe le b2Key au VPS, en server-to-server).
 *
 * Proxy server-side vers le VPS marketing-render (les creds B2 restent sur le VPS).
 */
const RENDER_URL =
  process.env.MARKETING_RENDER_URL ??
  import.meta.env.MARKETING_RENDER_URL ??
  'https://marketing-render.messagingme.app';
const RENDER_TOKEN =
  process.env.MARKETING_RENDER_TOKEN ?? import.meta.env.MARKETING_RENDER_TOKEN;

export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  if (!RENDER_TOKEN) {
    return jsonError('Service de rendu non configuré (MARKETING_RENDER_TOKEN)', 503);
  }

  try {
    const upstream = await fetch(`${RENDER_URL.replace(/\/$/, '')}/import-presign`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${RENDER_TOKEN}` },
      signal: AbortSignal.timeout(15000),
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
