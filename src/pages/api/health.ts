export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/health — basic liveness + readiness check.
 *
 * Returns 200 when all critical dependencies répondent, 503 sinon.
 * Probe DB Supabase via une requête triviale + valide la présence des
 * variables d'env. Pas de check externe (Gemini, whapi, SendGrid, Stripe)
 * — ces APIs ont leurs propres SLA et un check synchrone gonflerait la
 * latence du health endpoint à chaque tick.
 *
 * Usage : monitoring externe (UptimeRobot, Vercel Cron, BetterStack…) ou
 * /admin pour un coup d'œil rapide.
 */
export const GET: APIRoute = async () => {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceKey  = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  const checks: Record<string, { ok: boolean; detail?: string }> = {
    env_supabase_url:           { ok: !!supabaseUrl },
    env_supabase_service_key:   { ok: !!serviceKey },
    env_google_api_key:         { ok: !!import.meta.env.GOOGLE_API_KEY },
    env_stripe_secret:          { ok: !!import.meta.env.STRIPE_SECRET_KEY },
    env_stripe_webhook_secret:  { ok: !!import.meta.env.STRIPE_WEBHOOK_SECRET },
  };

  // Probe DB — query légère sur une table existante (chantiers).
  if (supabaseUrl && serviceKey) {
    try {
      const supabase = createClient(supabaseUrl, serviceKey);
      const { error } = await supabase.from('chantiers').select('id', { count: 'exact', head: true });
      checks.db_ping = error ? { ok: false, detail: error.message } : { ok: true };
    } catch (err) {
      checks.db_ping = { ok: false, detail: err instanceof Error ? err.message : 'unknown' };
    }
  } else {
    checks.db_ping = { ok: false, detail: 'env missing' };
  }

  const allOk = Object.values(checks).every(c => c.ok);
  const status = allOk ? 'ok' : 'degraded';
  const httpStatus = allOk ? 200 : 503;

  return new Response(
    JSON.stringify({
      status,
      timestamp: new Date().toISOString(),
      checks,
    }, null, 2),
    {
      status: httpStatus,
      headers: {
        'Content-Type':  'application/json',
        'Cache-Control': 'no-store',
      },
    },
  );
};
