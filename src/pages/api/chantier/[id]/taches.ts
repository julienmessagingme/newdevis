export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Auth helper ────────────────────────────────────────────────────────────────

async function authCtx(request: Request, chantierId: string) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const supabase = createClient(supabaseUrl, supabaseService);
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data: chantier } = await supabase
    .from('chantiers').select('id').eq('id', chantierId).eq('user_id', user.id).single();
  if (!chantier) return null;
  return supabase;
}

// ── GET — liste des tâches ─────────────────────────────────────────────────────

export const GET: APIRoute = async ({ params, request }) => {
  const id = params.id ?? '';
  const sb = await authCtx(request, id);
  if (!sb) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const { data } = await sb
    .from('todo_chantier')
    .select('id, titre, priorite, done, ordre')
    .eq('chantier_id', id)
    .order('ordre', { ascending: true });

  return new Response(JSON.stringify({ taches: data ?? [] }), { status: 200, headers: CORS });
};

// ── POST — créer une tâche (ou bulk) ──────────────────────────────────────────

export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id ?? '';
  const sb = await authCtx(request, id);
  if (!sb) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers: CORS }); }

  // Bulk insert
  if (body.bulk === true && Array.isArray(body.taches)) {
    const { data: maxRow } = await sb
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
      return new Response(JSON.stringify({ error: 'Aucune tâche valide' }), { status: 400, headers: CORS });
    }

    const { data, error } = await sb.from('todo_chantier').insert(rows).select();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
    return new Response(JSON.stringify({ taches: data }), { status: 201, headers: CORS });
  }

  // Single insert
  const titre = typeof body.titre === 'string' ? body.titre.trim() : '';
  if (!titre) return new Response(JSON.stringify({ error: 'Titre requis' }), { status: 400, headers: CORS });

  const priorite = ['urgent', 'important', 'normal'].includes(body.priorite as string)
    ? (body.priorite as string) : 'normal';

  const { data: maxRow } = await sb
    .from('todo_chantier').select('ordre').eq('chantier_id', id)
    .order('ordre', { ascending: false }).limit(1).single();
  const ordre = maxRow ? (maxRow.ordre + 1) : 0;

  const { data, error } = await sb
    .from('todo_chantier')
    .insert({ chantier_id: id, titre, priorite, done: false, ordre })
    .select().single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
  return new Response(JSON.stringify({ tache: data }), { status: 201, headers: CORS });
};

// ── PATCH — modifier une tâche ─────────────────────────────────────────────────

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = params.id ?? '';
  const sb = await authCtx(request, id);
  if (!sb) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers: CORS }); }

  const todoId = typeof body.id === 'string' ? body.id : '';
  if (!todoId) return new Response(JSON.stringify({ error: 'ID tâche requis' }), { status: 400, headers: CORS });

  const patch: Record<string, unknown> = {};
  if (typeof body.done === 'boolean') patch.done = body.done;
  if (typeof body.titre === 'string' && body.titre.trim()) patch.titre = body.titre.trim();
  if (['urgent', 'important', 'normal'].includes(body.priorite as string)) patch.priorite = body.priorite;

  const { data, error } = await sb
    .from('todo_chantier')
    .update(patch)
    .eq('id', todoId)
    .eq('chantier_id', id)
    .select().single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
  return new Response(JSON.stringify({ tache: data }), { status: 200, headers: CORS });
};

// ── DELETE — supprimer une tâche ───────────────────────────────────────────────

export const DELETE: APIRoute = async ({ params, request }) => {
  const id = params.id ?? '';
  const sb = await authCtx(request, id);
  if (!sb) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const todoId = new URL(request.url).searchParams.get('todoId');
  if (!todoId) return new Response(JSON.stringify({ error: 'todoId manquant' }), { status: 400, headers: CORS });

  const { error } = await sb
    .from('todo_chantier')
    .delete()
    .eq('id', todoId)
    .eq('chantier_id', id);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
};
