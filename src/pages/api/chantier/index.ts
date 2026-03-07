export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import type { CreateChantierPayload } from '@/types/chantier-dashboard';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/** GET /api/chantier — Retourne tous les chantiers de l'utilisateur avec leurs devis */
export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });
  }

  const token = authHeader.slice(7);
  const supabase = getSupabase();

  // Vérifie le token et récupère l'utilisateur
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 401, headers: CORS });
  }

  // Récupère les chantiers
  const { data: chantiers, error: chantiersError } = await supabase
    .from('chantiers')
    .select('id, nom, emoji, budget, phase, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (chantiersError) {
    console.error('[api/chantier GET] chantiers error:', chantiersError.message);
    return new Response(JSON.stringify({ error: 'Erreur lors du chargement des chantiers' }), { status: 500, headers: CORS });
  }

  if (!chantiers || chantiers.length === 0) {
    return new Response(JSON.stringify({ chantiers: [] }), { status: 200, headers: CORS });
  }

  // Récupère tous les devis pour ces chantiers en une seule requête
  const chantierIds = chantiers.map((c) => c.id);
  const { data: devisRows, error: devisError } = await supabase
    .from('devis_chantier')
    .select('id, chantier_id, artisan_nom, type_travaux, montant_ttc, statut, score_analyse, analyse_id')
    .in('chantier_id', chantierIds);

  if (devisError) {
    console.error('[api/chantier GET] devis error:', devisError.message);
    return new Response(JSON.stringify({ error: 'Erreur lors du chargement des devis' }), { status: 500, headers: CORS });
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

  return new Response(
    JSON.stringify({ chantiers: chantiersAvecDevis, activiteRecente }),
    { status: 200, headers: CORS },
  );
};

/** POST /api/chantier — Crée un nouveau chantier */
export const POST: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });
  }

  const token = authHeader.slice(7);
  const supabase = getSupabase();

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 401, headers: CORS });
  }

  let body: CreateChantierPayload;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide' }), { status: 400, headers: CORS });
  }

  const { nom, emoji, enveloppePrevue } = body;

  if (!nom?.trim()) {
    return new Response(JSON.stringify({ error: 'Le nom du chantier est requis' }), { status: 400, headers: CORS });
  }
  if (typeof enveloppePrevue !== 'number' || enveloppePrevue < 0) {
    return new Response(JSON.stringify({ error: 'L\'enveloppe budgétaire doit être un nombre positif' }), { status: 400, headers: CORS });
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
    return new Response(JSON.stringify({ error: 'Erreur lors de la création du chantier' }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ chantier: { ...data, devis: [] } }), { status: 201, headers: CORS });
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } });
