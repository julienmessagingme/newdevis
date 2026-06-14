export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, requireAuth } from '@/lib/api/apiHelpers';
import { computeGmcInfo } from '@/lib/integrations/gmc-status-compute';

// Source de verite serveur du statut d'abonnement GMC (lecture service-role,
// pas de dependance a l'hydratation du client navigateur). Consomme par le hub
// (gate 2e chantier), le tunnel, le bloc Abonnement, le bandeau d'essai.
export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  const { data } = await supabase
    .from('gmc_subscriptions')
    .select('status, plan, trial_ends_at, current_period_end')
    .eq('user_id', user.id)
    .maybeSingle();

  return jsonOk(computeGmcInfo(data, Date.now()));
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
