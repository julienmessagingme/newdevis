export const prerender = false;

import type { APIRoute } from 'astro';
import { jsonError, optionsResponse } from '@/lib/api/apiHelpers';
import { requireAdmin } from '@/lib/auth/adminAuth';

/**
 * POST /api/admin/marketing/import/proxy?product=&title=&mode=&platform=
 * Body : HTML brut (text/html), max ~4 Mo (limite Vercel 4,5 Mo).
 *
 * Proxy server-side vers le VPS marketing-render. Contourne les blocages
 * navigateur (ad-blocker, DNS sécurisé, antivirus) qui empêchent l'upload
 * direct vers `marketing-render.messagingme.app` — le navigateur ne parle
 * plus qu'à verifiermondevis.fr/gerermonchantier.fr.
 *
 * Pour les gros fichiers (>4 Mo) on conserve le flow direct via /import/sign
 * (signed upload URL → XHR direct) car Vercel coupe au-dessus de 4,5 Mo.
 *
 * Auth admin obligatoire — utilise le RENDER_TOKEN permanent côté serveur,
 * jamais exposé au navigateur.
 */

const RENDER_URL =
  process.env.MARKETING_RENDER_URL ??
  import.meta.env.MARKETING_RENDER_URL ??
  'https://marketing-render.messagingme.app';
const RENDER_TOKEN =
  process.env.MARKETING_RENDER_TOKEN ?? import.meta.env.MARKETING_RENDER_TOKEN;

const MAX_BYTES = 4_000_000; // marge sous 4,5 Mo Vercel
const RENDER_TIMEOUT_MS = 5 * 60 * 1000;

export const POST: APIRoute = async ({ request, url }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  if (!RENDER_TOKEN) {
    return jsonError('Service de rendu non configuré (MARKETING_RENDER_TOKEN)', 503);
  }

  const lenHeader = request.headers.get('content-length');
  const declared = lenHeader ? parseInt(lenHeader, 10) : 0;
  if (declared > MAX_BYTES) {
    return jsonError(
      `Fichier trop volumineux pour le proxy (${(declared / 1_048_576).toFixed(1)} Mo > 4 Mo). Bascule sur l'upload direct.`,
      413,
    );
  }

  let body: ArrayBuffer;
  try {
    body = await request.arrayBuffer();
  } catch (err) {
    return jsonError(`Lecture du body échouée : ${err instanceof Error ? err.message : 'inconnue'}`, 400);
  }
  if (body.byteLength === 0) return jsonError('Body vide', 400);
  if (body.byteLength > MAX_BYTES) return jsonError('Fichier trop volumineux après lecture.', 413);

  // Préserve la query string (product, title, mode, platform) qu'attend le VPS.
  const target = `${RENDER_URL.replace(/\/$/, '')}/import-carousel${url.search}`;

  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RENDER_TOKEN}`,
        'Content-Type': request.headers.get('content-type') ?? 'text/html',
      },
      body,
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erreur inconnue';
    // Le VPS est injoignable depuis Vercel — vrai problème serveur, pas user.
    return jsonError(`Service de rendu injoignable depuis Vercel : ${msg}`, 502);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
