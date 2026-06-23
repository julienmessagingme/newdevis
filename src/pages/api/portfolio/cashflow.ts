export const prerender = false;

import type { APIRoute } from 'astro';
import { jsonOk, jsonError, optionsResponse, originFromRequest, requireAuth } from '@/lib/api/apiHelpers';
import { getPortfolioAccess } from '@/lib/auth/portfolioAccess';
import { bucketCashflowByMonth, type CashflowEvent } from '@/lib/chantier/portfolioCashflow';

const BATCH_SIZE = 4;

interface RawPaymentEvent {
  due_date?: string | null;
  amount?: number | null;
  amount_estimate?: number | null;
  status?: string | null;
}

async function fetchEvents(url: string, bearer: string): Promise<RawPaymentEvent[]> {
  try {
    const res = await fetch(url, { headers: { Authorization: bearer } });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.payment_events) ? (json.payment_events as RawPaymentEvent[]) : [];
  } catch {
    return [];
  }
}

/**
 * Projection de tresorerie consolidee du portefeuille (phase 4) : sorties
 * attendues mois par mois, tous chantiers. Reserve au palier Multi, LECTURE
 * SEULE. Reutilise l'echeancier par chantier (payment_events_v + amount_estimate
 * deja calcule) via fan-out interne plafonne : aucun montant recalcule a la main.
 */
export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  const access = await getPortfolioAccess(supabase, user.id, user.email);
  if (!access.allowed) {
    return jsonError('Poste de pilotage reserve a l\'offre Multi', 403);
  }

  const { data: rows, error } = await supabase
    .from('chantiers')
    .select('id')
    .eq('user_id', user.id);
  if (error) return jsonError('Erreur lors du chargement des chantiers', 500);

  const ids = (rows ?? []).map((r) => r.id as string);
  const bearer = request.headers.get('Authorization') ?? '';
  const origin = originFromRequest(request);

  const events: CashflowEvent[] = [];

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((id) => fetchEvents(`${origin}/api/chantier/${id}/payment-events`, bearer)),
    );
    for (const evs of results) {
      for (const e of evs) {
        if (e.status === 'cancelled') continue;
        const amount = typeof e.amount === 'number' ? e.amount
          : typeof e.amount_estimate === 'number' ? e.amount_estimate
          : 0;
        if (!(amount > 0)) continue;
        events.push({ dueDate: e.due_date ?? null, amount, paid: e.status === 'paid' });
      }
    }
  }

  const cashflow = bucketCashflowByMonth(events);
  return jsonOk(cashflow);
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
