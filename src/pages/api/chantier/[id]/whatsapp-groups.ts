// src/pages/api/chantier/[id]/whatsapp-groups.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

export const OPTIONS: APIRoute = () => optionsResponse('GET,DELETE,OPTIONS');

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  // Groupes du chantier
  const { data: groups, error: groupsErr } = await ctx.supabase
    .from('chantier_whatsapp_groups')
    .select('id, name, group_jid, invite_link, created_at')
    .eq('chantier_id', params.id!)
    .order('created_at', { ascending: true });

  if (groupsErr) return jsonError(groupsErr.message, 500);
  if (!groups || groups.length === 0) return jsonOk({ groups: [] });

  // Membres pour tous les groupes en une seule requête
  const groupIds = groups.map((g) => g.id);
  const { data: members, error: membersErr } = await ctx.supabase
    .from('chantier_whatsapp_members')
    .select('id, group_id, phone, name, role, status, joined_at, left_at')
    .in('group_id', groupIds)
    .order('joined_at', { ascending: true });

  if (membersErr) return jsonError(membersErr.message, 500);

  // Rattacher les membres à leur groupe
  const result = groups.map((g) => ({
    ...g,
    members: (members ?? []).filter((m) => m.group_id === g.id),
  }));

  return jsonOk({ groups: result });
};

// DELETE /api/chantier/:id/whatsapp-groups?groupId=<uuid>
export const DELETE: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const groupId = url.searchParams.get('groupId');
  if (!groupId) return jsonError('groupId requis', 400);

  // Vérifier que le groupe appartient bien à ce chantier
  const { data: group, error: checkErr } = await ctx.supabase
    .from('chantier_whatsapp_groups')
    .select('id')
    .eq('id', groupId)
    .eq('chantier_id', params.id!)
    .single();

  if (checkErr || !group) return jsonError('Groupe introuvable', 404);

  const { error } = await ctx.supabase
    .from('chantier_whatsapp_groups')
    .delete()
    .eq('id', groupId);

  if (error) return jsonError(error.message, 500);
  return jsonOk({ ok: true });
};
