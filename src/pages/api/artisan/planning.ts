export const prerender = false;

import type { APIRoute } from 'astro';
import { requireArtisanToken, jsonOk, jsonError, optionsResponse } from '@/lib/api/apiHelpers';
import { shapeArtisanPlanningLots } from '@/lib/api/artisanScope';

// Colonnes du planning visibles par l'artisan — JAMAIS de budget/montant (le SELECT les exclut
// déjà, et shapeArtisanPlanningLots re-filtre en défense en profondeur).
const ARTISAN_LOT_SELECT =
  'id, nom, emoji, role, statut, ordre, duree_jours, date_debut, date_fin, ordre_planning, parallel_group, delai_avant_jours, lane_index';

// GET /api/artisan/planning — planning COMPLET du chantier en LECTURE seule (pas de PATCH en V1).
export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireArtisanToken(request);
  if (ctx instanceof Response) return ctx;
  const { supabase, chantierId } = ctx;

  const [chantierRes, lotsRes] = await Promise.all([
    supabase.from('chantiers').select('date_debut_chantier, date_fin_souhaitee').eq('id', chantierId).maybeSingle(),
    supabase.from('lots_chantier').select(ARTISAN_LOT_SELECT).eq('chantier_id', chantierId).order('ordre', { ascending: true }),
  ]);

  if (lotsRes.error) {
    console.error('[api/artisan/planning] error:', lotsRes.error.message);
    return jsonError('Erreur lors de la récupération du planning', 500);
  }

  const lots = shapeArtisanPlanningLots((lotsRes.data ?? []) as Array<Record<string, unknown>>);

  // Dépendances pour afficher l'enchaînement des lots (lecture seule).
  const lotIds = lots.map((l) => (l as { id?: string }).id).filter((x): x is string => typeof x === 'string');
  const dependencies: Record<string, string[]> = {};
  if (lotIds.length > 0) {
    const { data: deps } = await supabase
      .from('lot_dependencies')
      .select('lot_id, depends_on_id')
      .in('lot_id', lotIds);
    for (const row of (deps ?? []) as Array<{ lot_id: string; depends_on_id: string }>) {
      (dependencies[row.lot_id] ??= []).push(row.depends_on_id);
    }
  }

  return jsonOk({
    dateDebutChantier: chantierRes.data?.date_debut_chantier ?? null,
    dateFinSouhaitee: chantierRes.data?.date_fin_souhaitee ?? null,
    lots,
    dependencies,
  });
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
