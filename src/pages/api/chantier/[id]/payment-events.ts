export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { generatePaymentEventsFromAnalyse } from '@/lib/paymentEvents';

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
): Promise<boolean> {
  const { data } = await supabase
    .from('chantiers').select('id')
    .eq('id', chantierId).eq('user_id', userId).single();
  return !!data;
}

// ── GET /api/chantier/[id]/payment-events ─────────────────────────────────────
// Retourne tous les payment_events du chantier, triés par due_date ASC.
// Les événements annulés (is_override=true) sont exclus par défaut.

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const chantierId = params.id!;
  if (!await verifyOwnership(ctx.supabase, chantierId, ctx.user.id))
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });

  const url            = new URL(request.url);
  const includeOverride = url.searchParams.get('include_override') === 'true';

  let query = ctx.supabase
    .from('payment_events')
    .select('*')
    .eq('project_id', chantierId)
    .order('due_date', { ascending: true, nullsFirst: false });

  if (!includeOverride) {
    query = query.eq('is_override', false);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[api/payment-events] GET error:', error.message);
    return new Response(JSON.stringify({ error: 'Erreur chargement events' }), { status: 500, headers: CORS });
  }

  // Enrichir avec nom du document source + nom du lot
  const sourceIds = (data ?? []).map(e => e.source_id).filter(Boolean);
  let docMap: Record<string, { file_name: string | null; lot_nom: string | null }> = {};
  if (sourceIds.length > 0) {
    const { data: docs } = await ctx.supabase
      .from('documents_chantier')
      .select('id, file_name, lots_chantier(nom)')
      .in('id', sourceIds);
    for (const d of docs ?? []) {
      docMap[d.id] = {
        file_name: d.file_name ?? null,
        lot_nom: (d.lots_chantier as any)?.nom ?? null,
      };
    }
  }

  const enriched = (data ?? []).map(e => ({
    ...e,
    source_name: docMap[e.source_id]?.file_name ?? null,
    lot_nom:     docMap[e.source_id]?.lot_nom ?? null,
  }));

  return new Response(JSON.stringify({ payment_events: enriched }), { status: 200, headers: CORS });
};

// ── POST /api/chantier/[id]/payment-events ────────────────────────────────────
// Déclenche manuellement la génération de payment_events depuis une analyse.
//
// Body: {
//   analyseId:        string   — ID de l'analyse complète
//   sourceType:       'devis' | 'facture'
//   sourceId:         string   — ID du document/devis source
//   originalDevisId?: string   — fourni si sourceType = 'facture' (override)
// }

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const chantierId = params.id!;
  if (!await verifyOwnership(ctx.supabase, chantierId, ctx.user.id))
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide' }), { status: 400, headers: CORS });
  }

  const analyseId       = typeof body.analyseId === 'string'       ? body.analyseId       : null;
  const sourceType      = body.sourceType === 'facture'            ? 'facture' : 'devis';
  const sourceId        = typeof body.sourceId === 'string'        ? body.sourceId        : null;
  const originalDevisId = typeof body.originalDevisId === 'string' ? body.originalDevisId : undefined;

  if (!analyseId || !sourceId) {
    return new Response(
      JSON.stringify({ error: 'analyseId et sourceId sont requis' }),
      { status: 400, headers: CORS },
    );
  }

  // Génération (non bloquante en interne, mais on attend la fin pour retourner le résultat)
  await generatePaymentEventsFromAnalyse(
    ctx.supabase,
    analyseId,
    chantierId,
    sourceType,
    sourceId,
    originalDevisId,
  );

  // Retourne les events fraîchement insérés
  const { data } = await ctx.supabase
    .from('payment_events')
    .select('*')
    .eq('project_id', chantierId)
    .eq('source_id', sourceId)
    .order('due_date', { ascending: true });

  return new Response(
    JSON.stringify({ payment_events: data ?? [], message: 'Timeline générée' }),
    { status: 201, headers: CORS },
  );
};

// ── PATCH /api/chantier/[id]/payment-events ───────────────────────────────────
// Modifie le statut d'un payment_event (paid ↔ pending).
// Body: { id: string; status: 'paid' | 'pending' }

export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const chantierId = params.id!;
  if (!await verifyOwnership(ctx.supabase, chantierId, ctx.user.id))
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers: CORS }); }

  const id     = typeof body.id === 'string' ? body.id : null;
  const status = body.status === 'paid' ? 'paid' : body.status === 'pending' ? 'pending' : null;

  if (!id || !status) {
    return new Response(JSON.stringify({ error: 'id et status (paid|pending) requis' }), { status: 400, headers: CORS });
  }

  const { error } = await ctx.supabase
    .from('payment_events')
    .update({ status })
    .eq('id', id)
    .eq('project_id', chantierId);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
};

export const OPTIONS: APIRoute = () =>
  new Response(null, {
    status: 204,
    headers: {
      ...CORS,
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
