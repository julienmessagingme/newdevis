export const prerender = false;

import type { APIRoute } from 'astro';
import { jsonOk, jsonError, optionsResponse, requireAuth } from '@/lib/api/apiHelpers';
import { getPortfolioAccess } from '@/lib/auth/portfolioAccess';
import {
  buildUnifiedArtisans,
  detectConflicts,
  type ChantierRef,
  type RawContact,
  type RawLotWindow,
} from '@/lib/chantier/portfolioConflicts';

/**
 * Annuaire unifie + conflits de ressources du portefeuille (phase 2).
 * Reserve au palier Multi, LECTURE SEULE. Agrege contacts_chantier + fenetres de
 * dates des lots (date_debut/date_fin deja calculees par le moteur planning et
 * persistees : lecture, pas de recalcul) pour TOUS les chantiers du compte.
 */
export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  const access = await getPortfolioAccess(supabase, user.id, user.email);
  if (!access.allowed) {
    return jsonError('Poste de pilotage reserve a l\'offre Multi', 403);
  }

  // Chantiers du compte (perimetre = les ids qui scoperont contacts + lots).
  const { data: chantierRows, error: chErr } = await supabase
    .from('chantiers')
    .select('id, nom')
    .eq('user_id', user.id);
  if (chErr) return jsonError('Erreur lors du chargement des chantiers', 500);

  const chantiers = (chantierRows ?? []) as ChantierRef[];
  if (chantiers.length === 0) {
    return jsonOk({ artisans: [], conflicts: [] });
  }
  const ids = chantiers.map((c) => c.id);

  // Contacts + lots de ces chantiers (2 queries plates, scopees aux ids du user).
  const [contactsRes, lotsRes] = await Promise.all([
    supabase
      .from('contacts_chantier')
      .select('id, chantier_id, nom, telephone, siret, role, lot_id')
      .in('chantier_id', ids),
    supabase
      .from('lots_chantier')
      .select('id, chantier_id, nom, date_debut, date_fin')
      .in('chantier_id', ids),
  ]);

  if (contactsRes.error || lotsRes.error) {
    return jsonError('Erreur lors du chargement de l\'annuaire', 500);
  }

  const contacts = (contactsRes.data ?? []) as RawContact[];
  const lots = (lotsRes.data ?? []) as RawLotWindow[];

  const artisans = buildUnifiedArtisans(contacts, lots, chantiers);
  const conflicts = detectConflicts(artisans);

  return jsonOk({ artisans, conflicts });
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
