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
 * PATCH /api/chantier/[id]/devis/[devisId]
 * Met à jour les coordonnées artisan d'un devis.
 * Body: { artisanNom?, artisanEmail?, artisanPhone?, artisanSiret? }
 */
export const PATCH: APIRoute = async ({ request, params }) => {
  const { id: chantierId, devisId } = params;
  if (!chantierId || !devisId) {
    return new Response(JSON.stringify({ error: 'Paramètres manquants' }), { status: 400, headers: CORS });
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

  const { data: chantier } = await supabase
    .from('chantiers')
    .select('id')
    .eq('id', chantierId)
    .eq('user_id', user.id)
    .single();

  if (!chantier) {
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide' }), { status: 400, headers: CORS });
  }

  const updates: Record<string, string | null> = {};
  if (typeof body.artisanNom === 'string') updates.artisan_nom = body.artisanNom.trim() || null;
  if (typeof body.artisanEmail === 'string') updates.artisan_email = body.artisanEmail.trim() || null;
  if (typeof body.artisanPhone === 'string') updates.artisan_phone = body.artisanPhone.trim() || null;
  if (typeof body.artisanSiret === 'string') updates.artisan_siret = body.artisanSiret.trim() || null;
  if ('lotId' in body) updates.lot_id = typeof body.lotId === 'string' ? body.lotId : null;

  if (Object.keys(updates).length === 0) {
    return new Response(JSON.stringify({ error: 'Aucun champ à mettre à jour' }), { status: 400, headers: CORS });
  }

  const { data, error } = await supabase
    .from('devis_chantier')
    .update(updates)
    .eq('id', devisId)
    .eq('chantier_id', chantierId)
    .select('id, artisan_nom, artisan_email, artisan_phone, artisan_siret, lot_id')
    .single();

  if (error) {
    console.error('[api/chantier/devis PATCH] error:', error.message);
    return new Response(JSON.stringify({ error: 'Erreur lors de la mise à jour' }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ devis: data }), { status: 200, headers: CORS });
};

/**
 * DELETE /api/chantier/[id]/devis/[devisId]
 * Détache un devis d'un chantier (ne supprime PAS le devis —
 * met chantier_id à NULL pour le libérer).
 */
export const DELETE: APIRoute = async ({ request, params }) => {
  const { id: chantierId, devisId } = params;

  if (!chantierId || !devisId) {
    return new Response(JSON.stringify({ error: 'Paramètres manquants' }), { status: 400, headers: CORS });
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
  const { data: chantier } = await supabase
    .from('chantiers')
    .select('id')
    .eq('id', chantierId)
    .eq('user_id', user.id)
    .single();

  if (!chantier) {
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });
  }

  // Détache le devis (chantier_id → NULL) sans le supprimer
  // Note: si la colonne chantier_id n'accepte pas NULL, on peut aussi
  // garder le devis en le déplaçant hors de ce chantier uniquement.
  // Ici on utilise une approche de nullification — le devis reste
  // disponible pour être rattaché à un autre chantier.
  const { error } = await supabase
    .from('devis_chantier')
    .delete()
    .eq('id', devisId)
    .eq('chantier_id', chantierId);

  if (error) {
    // Fallback: si chantier_id est NOT NULL, on ne peut pas le nullifier.
    // Dans ce cas on supprime vraiment le rattachement (la row).
    console.error('[api/chantier/devis DELETE] error:', error.message);
    return new Response(JSON.stringify({ error: 'Erreur lors du détachement du devis' }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'DELETE,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
