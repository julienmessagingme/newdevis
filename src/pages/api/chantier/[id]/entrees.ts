export const prerender = false;

/**
 * GET    /api/chantier/[id]/entrees       — liste des entrées de fonds
 * POST   /api/chantier/[id]/entrees       — créer une entrée
 * PATCH  /api/chantier/[id]/entrees       — modifier statut ou montant
 * DELETE /api/chantier/[id]/entrees?id=   — supprimer une entrée
 */

import type { APIRoute } from 'astro';
import {
  optionsResponse, jsonOk, jsonError,
  requireChantierAuth,
} from '@/lib/apiHelpers';

// ── GET ───────────────────────────────────────────────────────────────────────

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const { data, error } = await ctx.supabase
    .from('chantier_entrees')
    .select('*')
    .eq('chantier_id', params.id!)
    .order('date_entree', { ascending: true });

  if (error) return jsonError(error.message, 500);
  return jsonOk({ entrees: data ?? [] });
};

// ── POST ──────────────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps JSON invalide', 400); }

  const { label, montant, source_type, date_entree, statut, notes } = body as {
    label: string;
    montant: number;
    source_type: string;
    date_entree: string;
    statut: string;
    notes?: string;
  };

  if (!label || !montant || !date_entree) return jsonError('label, montant, date_entree requis', 400);
  if (typeof montant !== 'number' || montant <= 0) return jsonError('montant doit être > 0', 400);

  const { data, error } = await ctx.supabase
    .from('chantier_entrees')
    .insert({
      chantier_id: params.id!,
      user_id:     ctx.user.id,
      label:       String(label).slice(0, 200),
      montant,
      source_type: source_type ?? 'autre',
      date_entree,
      statut:      statut ?? 'attendu',
      notes:       notes ? String(notes).slice(0, 500) : null,
    })
    .select()
    .single();

  if (error) return jsonError(error.message, 500);
  return jsonOk({ entree: data }, 201);
};

// ── PATCH ─────────────────────────────────────────────────────────────────────

export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps JSON invalide', 400); }

  const { id, statut, montant, label, date_entree, notes } = body as {
    id: string;
    statut?: string;
    montant?: number;
    label?: string;
    date_entree?: string;
    notes?: string;
  };

  if (!id) return jsonError('id requis', 400);

  // Vérifier ownership via RLS (user_id dans la policy)
  const update: Record<string, unknown> = {};
  if (statut !== undefined)      update.statut      = statut;
  if (montant !== undefined)     update.montant     = montant;
  if (label !== undefined)       update.label       = String(label).slice(0, 200);
  if (date_entree !== undefined) update.date_entree = date_entree;
  if (notes !== undefined)       update.notes       = notes ? String(notes).slice(0, 500) : null;

  if (Object.keys(update).length === 0) return jsonError('Aucun champ à modifier', 400);

  const { data, error } = await ctx.supabase
    .from('chantier_entrees')
    .update(update)
    .eq('id', id)
    .eq('chantier_id', params.id!)
    .select()
    .single();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError('Entrée introuvable', 404);
  return jsonOk({ entree: data });
};

// ── DELETE ────────────────────────────────────────────────────────────────────

export const DELETE: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const url    = new URL(request.url);
  const entreeId = url.searchParams.get('id');
  if (!entreeId) return jsonError('id requis (query param)', 400);

  const { error } = await ctx.supabase
    .from('chantier_entrees')
    .delete()
    .eq('id', entreeId)
    .eq('chantier_id', params.id!);

  if (error) return jsonError(error.message, 500);
  return jsonOk({ deleted: true });
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,POST,PATCH,DELETE,OPTIONS');
