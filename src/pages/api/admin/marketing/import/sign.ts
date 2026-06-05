export const prerender = false;

import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { optionsResponse, jsonError, jsonOk } from '@/lib/api/apiHelpers';
import { requireAdmin } from '@/lib/auth/adminAuth';

// Service de rendu VPS (derrière NPM). URL non secrète → défaut en dur ; token secret → env.
const RENDER_URL =
  process.env.MARKETING_RENDER_URL ??
  import.meta.env.MARKETING_RENDER_URL ??
  'https://marketing-render.messagingme.app';
const RENDER_TOKEN =
  process.env.MARKETING_RENDER_TOKEN ?? import.meta.env.MARKETING_RENDER_TOKEN;

const TTL_MS = 10 * 60 * 1000; // 10 min

/**
 * POST /api/admin/marketing/import/sign
 * Forge un token HMAC court (signé avec MARKETING_RENDER_TOKEN) pour autoriser
 * l'upload direct navigateur → service VPS /import-carousel, sans exposer le
 * token permanent. Le HTML (~15-25 Mo) dépasse la limite de body Vercel (4,5 Mo)
 * et ne peut donc pas transiter par cette route ; on délègue l'upload au VPS.
 * Auth admin obligatoire.
 */
export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  if (!RENDER_TOKEN) {
    return jsonError('Service de rendu non configuré (MARKETING_RENDER_TOKEN)', 503);
  }

  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', RENDER_TOKEN).update(payload).digest('hex');

  return jsonOk({
    uploadUrl: `${RENDER_URL.replace(/\/$/, '')}/import-carousel`,
    token: `${payload}.${sig}`,
    expiresIn: TTL_MS,
  });
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
