export const prerender = false;

import type { APIRoute } from 'astro';
import { CORS, optionsResponse, jsonOk, jsonError, requireAuth, parseJsonBody } from '@/lib/apiHelpers';
import type { CreateChantierPayload } from '@/types/chantier-dashboard';

/** GET /api/chantier — Retourne tous les chantiers de l'utilisateur avec leurs devis */
export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  // Récupère les chantiers
  const { data: chantiers, error: chantiersError } = await supabase
    .from('chantiers')
    .select('id, nom, emoji, budget, phase, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (chantiersError) {
    console.error('[api/chantier GET] chantiers error:', chantiersError.message);
    return jsonError('Erreur lors du chargement des chantiers', 500);
  }

  if (!chantiers || chantiers.length === 0) {
    return jsonOk({ chantiers: [] });
  }

  // Récupère tous les devis pour ces chantiers en une seule requête
  const chantierIds = chantiers.map((c) => c.id);
  const { data: devisRows, error: devisError } = await supabase
    .from('devis_chantier')
    .select('id, chantier_id, artisan_nom, type_travaux, montant_ttc, statut, score_analyse, analyse_id')
    .in('chantier_id', chantierIds);

  if (devisError) {
    console.error('[api/chantier GET] devis error:', devisError.message);
    return jsonError('Erreur lors du chargement des devis', 500);
  }

  // Récupère les 5 dernières activités (devis récents)
  const { data: activiteRows } = await supabase
    .from('devis_chantier')
    .select('id, artisan_nom, type_travaux, montant_ttc, statut, created_at, chantier_id')
    .in('chantier_id', chantierIds)
    .order('created_at', { ascending: false })
    .limit(5);

  // Construit le résultat
  const chantiersAvecDevis = chantiers.map((c) => ({
    ...c,
    devis: (devisRows ?? [])
      .filter((d) => d.chantier_id === c.id)
      .map((d) => ({
        id: d.id,
        nom: d.artisan_nom,
        description: d.type_travaux,
        montant: d.montant_ttc,
        statut: d.statut,
        analyseId: d.analyse_id,
        scoreAnalyse: d.score_analyse,
      })),
  }));

  const activiteRecente = (activiteRows ?? []).map((row) => {
    const chantier = chantiers.find((c) => c.id === row.chantier_id);
    return {
      id: row.id,
      type: 'devis_ajoute' as const,
      label: row.artisan_nom,
      souslabel: chantier?.nom ?? 'Chantier',
      montant: row.montant_ttc,
      createdAt: row.created_at,
    };
  });

  return jsonOk({ chantiers: chantiersAvecDevis, activiteRecente });
};

/** POST /api/chantier — Crée un nouveau chantier */
export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  const body = await parseJsonBody<CreateChantierPayload>(request);
  if (body instanceof Response) return body;

  const { nom, emoji, enveloppePrevue } = body;

  if (!nom?.trim()) {
    return jsonError('Le nom du chantier est requis', 400);
  }
  if (typeof enveloppePrevue !== 'number' || enveloppePrevue < 0) {
    return jsonError("L'enveloppe budgétaire doit être un nombre positif", 400);
  }

  const { data, error } = await supabase
    .from('chantiers')
    .insert({
      user_id: user.id,
      nom: nom.trim(),
      emoji: emoji || '🏠',
      budget: enveloppePrevue,
      phase: 'preparation',
    })
    .select('id, nom, emoji, budget, phase, created_at, updated_at')
    .single();

  if (error) {
    console.error('[api/chantier POST] insert error:', error.message);
    return jsonError('Erreur lors de la création du chantier', 500);
  }

  return jsonOk({ chantier: { ...data, devis: [] } }, 201);
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,POST,OPTIONS');
