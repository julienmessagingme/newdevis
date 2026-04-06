export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuthOrAgent } from '@/lib/apiHelpers';

// ── GET — liste des tâches ─────────────────────────────────────────────────────

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const id = params.id!;
  const { data } = await ctx.supabase
    .from('todo_chantier')
    .select('id, titre, priorite, done, ordre')
    .eq('chantier_id', id)
    .order('ordre', { ascending: true });

  return jsonOk({ taches: data ?? [] });
};

// ── POST — créer une tâche (ou bulk) ──────────────────────────────────────────

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const id = params.id!;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps invalide', 400); }

  // Bulk insert
  if (body.bulk === true && Array.isArray(body.taches)) {
    const { data: maxRow } = await ctx.supabase
      .from('todo_chantier').select('ordre').eq('chantier_id', id)
      .order('ordre', { ascending: false }).limit(1).single();
    let ordre = maxRow ? (maxRow.ordre + 1) : 0;

    const rows = (body.taches as Array<{ titre?: string; priorite?: string }>)
      .filter(t => typeof t.titre === 'string' && t.titre.trim())
      .map(t => ({
        chantier_id: id,
        titre: t.titre!.trim(),
        priorite: ['urgent', 'important', 'normal'].includes(t.priorite ?? '') ? t.priorite : 'normal',
        done: false,
        ordre: ordre++,
      }));

    if (rows.length === 0) {
      return jsonError('Aucune tâche valide', 400);
    }

    const { data, error } = await ctx.supabase.from('todo_chantier').insert(rows).select();
    if (error) return jsonError(error.message, 500);
    return jsonOk({ taches: data }, 201);
  }

  // Single insert
  const titre = typeof body.titre === 'string' ? body.titre.trim() : '';
  if (!titre) return jsonError('Titre requis', 400);

  const priorite = ['urgent', 'important', 'normal'].includes(body.priorite as string)
    ? (body.priorite as string) : 'normal';

  const { data: maxRow } = await ctx.supabase
    .from('todo_chantier').select('ordre').eq('chantier_id', id)
    .order('ordre', { ascending: false }).limit(1).single();
  const ordre = maxRow ? (maxRow.ordre + 1) : 0;

  const { data, error } = await ctx.supabase
    .from('todo_chantier')
    .insert({ chantier_id: id, titre, priorite, done: false, ordre })
    .select().single();

  if (error) return jsonError(error.message, 500);
  return jsonOk({ tache: data }, 201);
};

// ── PATCH — modifier une tâche ─────────────────────────────────────────────────

export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const id = params.id!;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps invalide', 400); }

  let todoId = typeof body.id === 'string' ? body.id : '';

  // Title-based lookup fallback (agent IA sends { titre, done } without knowing the ID)
  if (!todoId && typeof body.titre === 'string' && body.titre.trim()) {
    const { data: found } = await ctx.supabase
      .from('todo_chantier')
      .select('id')
      .eq('chantier_id', id)
      .ilike('titre', body.titre.trim())
      .eq('done', false)
      .limit(1)
      .single();
    if (found) todoId = found.id;
  }

  if (!todoId) return jsonError('ID ou titre de tâche requis', 400);

  const patch: Record<string, unknown> = {};
  if (typeof body.done === 'boolean') patch.done = body.done;
  if (typeof body.titre === 'string' && body.titre.trim()) patch.titre = body.titre.trim();
  if (['urgent', 'important', 'normal'].includes(body.priorite as string)) patch.priorite = body.priorite;

  const { data, error } = await ctx.supabase
    .from('todo_chantier')
    .update(patch)
    .eq('id', todoId)
    .eq('chantier_id', id)
    .select().single();

  if (error) return jsonError(error.message, 500);
  return jsonOk({ tache: data });
};

// ── DELETE — supprimer une tâche ───────────────────────────────────────────────

export const DELETE: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const id = params.id!;
  const todoId = new URL(request.url).searchParams.get('todoId');
  if (!todoId) return jsonError('todoId manquant', 400);

  const { error } = await ctx.supabase
    .from('todo_chantier')
    .delete()
    .eq('id', todoId)
    .eq('chantier_id', id);

  if (error) return jsonError(error.message, 500);
  return jsonOk({ ok: true });
};

export const OPTIONS: APIRoute = () => optionsResponse();
