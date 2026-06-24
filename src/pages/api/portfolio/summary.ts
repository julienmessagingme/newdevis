export const prerender = false;

import type { APIRoute } from 'astro';
import { jsonOk, jsonError, optionsResponse, internalFanoutBase, requireAuth } from '@/lib/api/apiHelpers';
import { getPortfolioAccess } from '@/lib/auth/portfolioAccess';
import {
  buildChantierSummary,
  buildPortfolioTotals,
  type ChantierSummary,
  type RawBudgetResponse,
  type RawChantierRow,
  type RawPlanningResponse,
} from '@/lib/chantier/portfolioSummary';

// Nb de chantiers traites en parallele. 1 chantier = 2 sous-appels (budget +
// planning) -> ~6 requetes concurrentes max, pour ne pas saturer le runtime.
const BATCH_SIZE = 3;

/** GET d'une route chantier en forwardant le Bearer. null si echec (jamais throw). */
async function fetchJson<T>(url: string, bearer: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: bearer } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Poste de pilotage portefeuille : resume leger par chantier (planning + finances)
 * pour le compte courant. Reserve au palier Multi (gating serveur). LECTURE SEULE.
 *
 * Archi : fan-out HTTP interne plafonne vers les routes budget/planning existantes
 * (jamais de recalcul des KPI a la main = source unique de verite, cf. garde-fou
 * n1 du plan). Un chantier injoignable degrade sa ligne (fetchError) sans 500 global.
 */
export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  // Gating serveur (jamais seulement masque cote UI).
  const access = await getPortfolioAccess(supabase, user.id, user.email);
  if (!access.allowed) {
    return jsonError('Poste de pilotage reserve a l\'offre Multi', 403);
  }

  // Tous les chantiers du compte (query directe, SANS le .limit(10) du hub).
  const { data: rows, error } = await supabase
    .from('chantiers')
    .select('id, nom, emoji, budget, phase')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return jsonError('Erreur lors du chargement des chantiers', 500);
  }

  const chantiers = (rows ?? []) as RawChantierRow[];
  const bearer = request.headers.get('Authorization') ?? '';
  const origin = internalFanoutBase(request);
  const nowMs = Date.now();

  const summaries: ChantierSummary[] = [];

  // Fan-out par lots pour borner la concurrence.
  for (let i = 0; i < chantiers.length; i += BATCH_SIZE) {
    const batch = chantiers.slice(i, i + BATCH_SIZE);
    const batchSummaries = await Promise.all(
      batch.map(async (c) => {
        const [budget, planning] = await Promise.all([
          fetchJson<RawBudgetResponse>(`${origin}/api/chantier/${c.id}/budget?fields=totaux`, bearer),
          fetchJson<RawPlanningResponse>(`${origin}/api/chantier/${c.id}/planning`, bearer),
        ]);
        return buildChantierSummary(c, budget, planning, nowMs);
      }),
    );
    summaries.push(...batchSummaries);
  }

  const totals = buildPortfolioTotals(summaries);

  return jsonOk({ summaries, totals });
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
