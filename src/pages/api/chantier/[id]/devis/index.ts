export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * POST /api/chantier/[id]/devis
 * Rattache un devis existant (devis_chantier) à ce chantier,
 * OU crée un nouveau devis vide rattaché à ce chantier.
 *
 * Body (rattachement) : { devisId: string }
 * Body (création)     : { nom: string, description?: string, montant?: number, statut?: string, analyseId?: string }
 */
export const POST: APIRoute = async ({ request, params }) => {
  const chantierId = params.id;
  if (!chantierId) {
    return new Response(JSON.stringify({ error: 'ID chantier manquant' }), { status: 400, headers: CORS });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });
  }

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 401, headers: CORS });
  }

  // Vérifie que le chantier appartient à l'utilisateur
  const { data: chantier, error: chantierError } = await supabase
    .from('chantiers')
    .select('id')
    .eq('id', chantierId)
    .eq('user_id', user.id)
    .single();

  if (chantierError || !chantier) {
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide' }), { status: 400, headers: CORS });
  }

  // Cas 1 : rattachement d'un devis existant (change son chantier_id)
  if (body.devisId && typeof body.devisId === 'string') {
    const { data, error } = await supabase
      .from('devis_chantier')
      .update({ chantier_id: chantierId })
      .eq('id', body.devisId)
      .select('id, artisan_nom, type_travaux, montant_ttc, statut, score_analyse, analyse_id')
      .single();

    if (error) {
      console.error('[api/chantier/devis POST] rattachement error:', error.message);
      return new Response(JSON.stringify({ error: 'Erreur lors du rattachement du devis' }), { status: 500, headers: CORS });
    }

    return new Response(JSON.stringify({
      devis: {
        id: data.id,
        nom: data.artisan_nom,
        description: data.type_travaux,
        montant: data.montant_ttc,
        statut: data.statut,
        analyseId: data.analyse_id,
        scoreAnalyse: data.score_analyse,
      },
    }), { status: 200, headers: CORS });
  }

  // Cas 2 : création d'un nouveau devis rattaché au chantier
  const nom = typeof body.nom === 'string' ? body.nom.trim() : '';
  if (!nom) {
    return new Response(JSON.stringify({ error: 'Le nom de l\'artisan est requis' }), { status: 400, headers: CORS });
  }

  const { data, error } = await supabase
    .from('devis_chantier')
    .insert({
      chantier_id: chantierId,
      artisan_nom: nom,
      type_travaux: typeof body.description === 'string' ? body.description : 'Travaux',
      montant_ttc: typeof body.montant === 'number' ? body.montant : null,
      statut: typeof body.statut === 'string' ? body.statut : 'recu',
      analyse_id: typeof body.analyseId === 'string' ? body.analyseId : null,
    })
    .select('id, artisan_nom, type_travaux, montant_ttc, statut, score_analyse, analyse_id')
    .single();

  if (error) {
    console.error('[api/chantier/devis POST] création error:', error.message);
    return new Response(JSON.stringify({ error: 'Erreur lors de la création du devis' }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({
    devis: {
      id: data.id,
      nom: data.artisan_nom,
      description: data.type_travaux,
      montant: data.montant_ttc,
      statut: data.statut,
      analyseId: data.analyse_id,
      scoreAnalyse: data.score_analyse,
    },
  }), { status: 201, headers: CORS });
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS' } });
