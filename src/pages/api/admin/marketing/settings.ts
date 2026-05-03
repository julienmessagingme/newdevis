export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, parseJsonBody } from '@/lib/apiHelpers';
import { requireAdmin } from '@/lib/adminAuth';
import { marketingFetch, marketingErrorResponse } from '@/lib/marketingApi';
import type {
  MarketingSettings,
  MarketingSettingsClientPayload,
  MarketingSettingsUpdate,
  MarketingSettingsUpdateResponse,
} from '@/types/marketing';

/**
 * GET /api/admin/marketing/settings — proxy server-side de GET /api/settings (FastAPI).
 *
 * Auth : requireAdmin (JWT user + role admin via adminAuth helper).
 * Retourne la row singleton marketing.settings.
 */
export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  try {
    const data = await marketingFetch<MarketingSettings>('/api/settings', {
      method: 'GET',
      timeoutMs: 10_000,
    });
    return jsonOk(data);
  } catch (err) {
    return marketingErrorResponse(err);
  }
};

/**
 * POST /api/admin/marketing/settings — partial update (PATCH semantic).
 *
 * - Validation server-side des ranges (defense en profondeur — FastAPI valide aussi).
 * - `updated_by` : on injecte l'email admin authentifié pour audit (jamais celui du body
 *   pour empêcher un admin d'usurper l'identité d'un autre dans les logs).
 * - Cap longueur sur tous les strings.
 * - On rejette unknown keys côté FastAPI (extra="forbid" Pydantic).
 */
export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const body = await parseJsonBody<MarketingSettingsClientPayload>(request);
  if (body instanceof Response) return body;

  // Validation des ranges côté serveur (avant l'aller-retour FastAPI)
  const errors: string[] = [];
  if (body.gmc_ratio_pct !== undefined) {
    if (!Number.isInteger(body.gmc_ratio_pct) || body.gmc_ratio_pct < 0 || body.gmc_ratio_pct > 100) {
      errors.push('gmc_ratio_pct doit être un entier entre 0 et 100');
    }
  }
  if (body.quality_threshold !== undefined) {
    if (!Number.isInteger(body.quality_threshold) || body.quality_threshold < 1 || body.quality_threshold > 12) {
      errors.push('quality_threshold doit être un entier entre 1 et 12');
    }
  }
  if (body.max_flow_cost_usd !== undefined) {
    if (typeof body.max_flow_cost_usd !== 'number' || body.max_flow_cost_usd <= 0 || body.max_flow_cost_usd > 50) {
      errors.push('max_flow_cost_usd doit être un nombre > 0 et <= 50');
    }
  }
  if (body.scheduler_hour !== undefined) {
    if (!Number.isInteger(body.scheduler_hour) || body.scheduler_hour < 0 || body.scheduler_hour > 23) {
      errors.push('scheduler_hour doit être un entier entre 0 et 23');
    }
  }
  if (body.scheduler_minute !== undefined) {
    if (!Number.isInteger(body.scheduler_minute) || body.scheduler_minute < 0 || body.scheduler_minute > 59) {
      errors.push('scheduler_minute doit être un entier entre 0 et 59');
    }
  }
  if (body.dry_run !== undefined && typeof body.dry_run !== 'boolean') {
    errors.push('dry_run doit être un boolean');
  }
  if (errors.length > 0) {
    return jsonError(errors.join(' ; '), 400);
  }

  // S'assurer qu'au moins un champ utile est fourni (sinon on logue un update inutile)
  const hasAtLeastOneField = (
    'gmc_ratio_pct' in body ||
    'quality_threshold' in body ||
    'max_flow_cost_usd' in body ||
    'scheduler_hour' in body ||
    'scheduler_minute' in body ||
    'dry_run' in body
  );
  if (!hasAtLeastOneField) {
    return jsonError('Aucun champ à mettre à jour', 400);
  }

  // On force `updated_by` à l'identité de l'admin authentifié (jamais celle du body).
  const adminEmail = (ctx.user.email ?? 'admin').slice(0, 100);

  // Construit le payload propre pour FastAPI (drop l'éventuel updated_by reçu du client)
  const payload: MarketingSettingsUpdate = {
    updated_by: adminEmail,
  };
  if (body.gmc_ratio_pct !== undefined) payload.gmc_ratio_pct = body.gmc_ratio_pct;
  if (body.quality_threshold !== undefined) payload.quality_threshold = body.quality_threshold;
  if (body.max_flow_cost_usd !== undefined) payload.max_flow_cost_usd = body.max_flow_cost_usd;
  if (body.scheduler_hour !== undefined) payload.scheduler_hour = body.scheduler_hour;
  if (body.scheduler_minute !== undefined) payload.scheduler_minute = body.scheduler_minute;
  if (body.dry_run !== undefined) payload.dry_run = body.dry_run;

  try {
    const data = await marketingFetch<MarketingSettingsUpdateResponse>('/api/settings', {
      method: 'POST',
      body: payload,
      timeoutMs: 15_000,
    });
    return jsonOk(data);
  } catch (err) {
    return marketingErrorResponse(err);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,POST,OPTIONS');
