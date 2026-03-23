export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function makeClient() {
  return createClient(supabaseUrl, supabaseService);
}

async function authenticate(request: Request) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const supabase = makeClient();
  const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
  return user ? { user, supabase } : null;
}

async function verifyOwnership(
  supabase: ReturnType<typeof makeClient>,
  chantierId: string,
  userId: string,
) {
  const { data } = await supabase
    .from('chantiers').select('id')
    .eq('id', chantierId).eq('user_id', userId).single();
  return !!data;
}

// ── GET — liste contacts du chantier + artisans des devis ──────────────────

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const chantierId = params.id!;
  if (!await verifyOwnership(ctx.supabase, chantierId, ctx.user.id))
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });

  // Contacts manuels
  const { data: contacts } = await ctx.supabase
    .from('contacts_chantier')
    .select('*')
    .eq('chantier_id', chantierId)
    .order('created_at', { ascending: false });

  // Artisans des devis chantier
  const { data: devisArtisans } = await ctx.supabase
    .from('devis_chantier')
    .select('id, artisan_nom, artisan_email, artisan_phone, artisan_siret, lot_id, type_travaux, analyse_id')
    .eq('chantier_id', chantierId);

  // Analyses complétées du user — source principale des infos entreprise
  const { data: analyses } = await ctx.supabase
    .from('analyses')
    .select('id, raw_text, created_at')
    .eq('user_id', ctx.user.id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false });

  // Documents du chantier (devis/factures rattachés à des lots)
  const { data: docChantier } = await ctx.supabase
    .from('documents_chantier')
    .select('id, lot_id, analyse_id, nom, document_type')
    .eq('chantier_id', chantierId)
    .in('document_type', ['devis', 'facture']);

  // Index analyse_id → lot_id — croisement multi-sources
  const devisLotMap = new Map<string, string>();

  // Source 1 : devis_chantier (lot_id direct)
  for (const d of devisArtisans ?? []) {
    if (d.analyse_id && d.lot_id) devisLotMap.set(d.analyse_id, d.lot_id);
  }

  // Source 2 : documents_chantier (lot_id via document rattaché)
  // Croise par analyse_id direct OU par nom de fichier → devis_chantier.analyse_id
  const docLotByName = new Map<string, string>();
  for (const doc of docChantier ?? []) {
    if (doc.lot_id) {
      if (doc.analyse_id) devisLotMap.set(doc.analyse_id, doc.lot_id);
      if (doc.nom) docLotByName.set(doc.nom.toLowerCase().trim(), doc.lot_id);
    }
  }
  // Croise devis_chantier.artisan_nom → documents_chantier.nom pour récupérer le lot_id
  for (const d of devisArtisans ?? []) {
    if (d.analyse_id && !devisLotMap.has(d.analyse_id)) {
      const lotId = docLotByName.get(d.artisan_nom.toLowerCase().trim());
      if (lotId) devisLotMap.set(d.analyse_id, lotId);
    }
  }

  // Extraire les artisans des analyses (nom, siret, email, tel depuis raw_text)
  const analyseArtisans: {
    analyse_id: string; nom: string; nom_officiel: string | null;
    siret: string | null; email: string | null; telephone: string | null;
    lot_id: string | null;
  }[] = [];
  for (const a of analyses ?? []) {
    try {
      const raw = typeof a.raw_text === 'string' ? JSON.parse(a.raw_text) : a.raw_text;
      const ent = raw?.extracted?.entreprise;
      if (!ent?.nom) continue;
      analyseArtisans.push({
        analyse_id: a.id,
        nom: raw?.verified?.nom_officiel || ent.nom,
        nom_officiel: raw?.verified?.nom_officiel || null,
        siret: ent.siret || null,
        email: ent.email || null,
        telephone: ent.telephone || null,
        lot_id: devisLotMap.get(a.id) || null,
      });
    } catch { /* skip malformed */ }
  }

  // Lots pour les noms
  const { data: lots } = await ctx.supabase
    .from('lots_chantier')
    .select('id, nom')
    .eq('chantier_id', chantierId);

  return new Response(JSON.stringify({
    contacts: contacts ?? [],
    devisArtisans: devisArtisans ?? [],
    analyseArtisans,
    lots: lots ?? [],
  }), { headers: CORS });
};

// ── POST — créer un contact ────────────────────────────────────────────────

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const chantierId = params.id!;
  if (!await verifyOwnership(ctx.supabase, chantierId, ctx.user.id))
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });

  const body = await request.json();
  const nom = (body.nom ?? '').trim();
  if (!nom) return new Response(JSON.stringify({ error: 'Nom requis' }), { status: 400, headers: CORS });

  const { data, error } = await ctx.supabase
    .from('contacts_chantier')
    .insert({
      chantier_id: chantierId,
      user_id: ctx.user.id,
      nom,
      email: body.email?.trim() || null,
      telephone: body.telephone?.trim() || null,
      siret: body.siret?.trim() || null,
      role: body.role?.trim() || null,
      lot_id: body.lot_id || null,
      notes: body.notes?.trim() || null,
      source: body.source ?? 'manual',
      devis_id: body.devis_id || null,
      analyse_id: body.analyse_id || null,
    })
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
  return new Response(JSON.stringify({ contact: data }), { status: 201, headers: CORS });
};

// ── PATCH — modifier un contact ────────────────────────────────────────────

export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const chantierId = params.id!;
  if (!await verifyOwnership(ctx.supabase, chantierId, ctx.user.id))
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });

  const body = await request.json();
  if (!body.contactId) return new Response(JSON.stringify({ error: 'contactId requis' }), { status: 400, headers: CORS });

  const updates: Record<string, unknown> = {};
  if (body.nom !== undefined)       updates.nom       = body.nom.trim();
  if (body.email !== undefined)     updates.email     = body.email?.trim() || null;
  if (body.telephone !== undefined) updates.telephone = body.telephone?.trim() || null;
  if (body.siret !== undefined)     updates.siret     = body.siret?.trim() || null;
  if (body.role !== undefined)      updates.role      = body.role?.trim() || null;
  if (body.lot_id !== undefined)    updates.lot_id    = body.lot_id || null;
  if (body.notes !== undefined)     updates.notes     = body.notes?.trim() || null;

  const { data, error } = await ctx.supabase
    .from('contacts_chantier')
    .update(updates)
    .eq('id', body.contactId)
    .eq('chantier_id', chantierId)
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
  return new Response(JSON.stringify({ contact: data }), { headers: CORS });
};

// ── DELETE — supprimer un contact ──────────────────────────────────────────

export const DELETE: APIRoute = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const chantierId = params.id!;
  if (!await verifyOwnership(ctx.supabase, chantierId, ctx.user.id))
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });

  const body = await request.json();
  if (!body.contactId) return new Response(JSON.stringify({ error: 'contactId requis' }), { status: 400, headers: CORS });

  const { error } = await ctx.supabase
    .from('contacts_chantier')
    .delete()
    .eq('id', body.contactId)
    .eq('chantier_id', chantierId);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
  return new Response(JSON.stringify({ ok: true }), { headers: CORS });
};

// ── OPTIONS ────────────────────────────────────────────────────────────────

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type' },
  });
};
