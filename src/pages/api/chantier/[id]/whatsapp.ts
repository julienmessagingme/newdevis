export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth, parseJsonBody } from '@/lib/apiHelpers';
import { formatPhone, createWhatsAppGroup, addGroupParticipants } from '@/lib/whapiUtils';

const GMC_PHONE = '33633921577';

// ── Private helpers ──────────────────────────────────────────────────────────

async function getContactPhones(supabase: any, chantierId: string): Promise<{ phone: string; name: string }[] | null> {
  const { data, error } = await supabase
    .from('contacts_chantier')
    .select('telephone, nom')
    .eq('chantier_id', chantierId)
    .not('telephone', 'is', null);
  if (error) return null;
  return (data ?? [])
    .map((c: any) => ({ phone: formatPhone(c.telephone), name: c.nom as string }))
    .filter((c: { phone: string; name: string }) => c.phone.length >= 10);
}

async function getClientPhone(supabase: any, token: string): Promise<string | null> {
  const { data } = await supabase.auth.getUser(token);
  const phone =
    data?.user?.user_metadata?.phone ??
    data?.user?.phone ??
    null;
  return phone ? formatPhone(phone) : null;
}

// ── Routes ───────────────────────────────────────────────────────────────────

export const OPTIONS: APIRoute = () => optionsResponse('POST,PATCH,OPTIONS');

export const POST: APIRoute = async ({ params, request }) => {
  const token = request.headers.get('Authorization')?.slice(7) ?? '';
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  const body = await parseJsonBody<{ name?: string; selectedPhones?: string[] }>(request);
  if (body instanceof Response) return body;

  const groupName = body.name?.trim() || 'Groupe principal';

  // Fetch client phone once — used both for participant list and role assignment
  const clientPhone = await getClientPhone(ctx.supabase, token);

  // Determine participants
  let participantPhones: string[];
  let phoneToName: Map<string, string>;

  if (body.selectedPhones && body.selectedPhones.length > 0) {
    participantPhones = body.selectedPhones.map((p) => formatPhone(p)).filter((p) => p.length >= 10);
    // Always include the client phone even if not in selectedPhones (UI guarantee)
    if (clientPhone && !participantPhones.includes(clientPhone)) {
      participantPhones.push(clientPhone);
    }
    // Resolve contact names server-side so members get real names, not raw phone strings
    const contacts = await getContactPhones(ctx.supabase, chantierId);
    const contactNameMap = new Map((contacts ?? []).map((c) => [c.phone, c.name]));
    phoneToName = new Map(participantPhones.map((p) => [p, contactNameMap.get(p) ?? p]));
    if (clientPhone) phoneToName.set(clientPhone, phoneToName.get(clientPhone) ?? clientPhone);
  } else {
    const contacts = await getContactPhones(ctx.supabase, chantierId);
    if (contacts === null) return jsonError('Erreur DB (contacts)', 500);
    phoneToName = new Map(contacts.map((c) => [c.phone, c.name]));
    if (clientPhone) phoneToName.set(clientPhone, clientPhone);
    participantPhones = Array.from(phoneToName.keys());
  }

  // Deduplicate
  participantPhones = [...new Set(participantPhones)];

  try {
    const { groupId, inviteLink } = await createWhatsAppGroup(groupName, participantPhones);

    // INSERT group record
    const { data: newGroup, error: groupErr } = await ctx.supabase
      .from('chantier_whatsapp_groups')
      .insert({ chantier_id: chantierId, name: groupName, group_jid: groupId, invite_link: inviteLink })
      .select('id, name, group_jid, invite_link')
      .single();

    if (groupErr || !newGroup) {
      return jsonError(`Erreur DB (groupe): ${groupErr?.message ?? 'unknown'}`, 500);
    }

    // Build member rows
    const memberRows = participantPhones.map((phone) => ({
      group_id: newGroup.id,
      phone,
      name: phoneToName.get(phone) ?? phone,
      role: phone === clientPhone ? 'client' : 'artisan',
      status: 'active',
    }));

    // Always add GMC as admin member
    memberRows.push({
      group_id: newGroup.id,
      phone: GMC_PHONE,
      name: 'GérerMonChantier',
      role: 'gmc',
      status: 'active',
    });

    const { error: membersErr } = await ctx.supabase
      .from('chantier_whatsapp_members')
      .insert(memberRows);

    if (membersErr) {
      return jsonError(`Erreur DB (membres): ${membersErr.message}`, 500);
    }

    return jsonOk({ group: { id: newGroup.id, name: newGroup.name, group_jid: newGroup.group_jid, invite_link: newGroup.invite_link } }, 201);
  } catch (err: any) {
    return jsonError(`Erreur whapi: ${err.message}`, 502);
  }
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  const body = await parseJsonBody<{ groupId: string; phones: string[] }>(request);
  if (body instanceof Response) return body;

  if (!body.groupId) return jsonError('groupId requis', 400);
  if (!Array.isArray(body.phones) || body.phones.length === 0) return jsonError('phones requis', 400);

  // Verify group belongs to this chantier
  const { data: group } = await ctx.supabase
    .from('chantier_whatsapp_groups')
    .select('id, group_jid')
    .eq('id', body.groupId)
    .eq('chantier_id', chantierId)
    .single();

  if (!group) return jsonError('Groupe introuvable pour ce chantier', 404);

  const phones = body.phones.map((p: string) => formatPhone(p)).filter((p: string) => p.length >= 10);
  if (phones.length === 0) return jsonOk({ added: 0 });

  try {
    await addGroupParticipants(group.group_jid, phones);

    const upsertRows = phones.map((phone: string) => ({
      group_id: group.id,
      phone,
      name: phone,
      role: 'artisan',
      status: 'active',
      left_at: null,
    }));

    const { error: upsertErr } = await ctx.supabase
      .from('chantier_whatsapp_members')
      .upsert(upsertRows, { onConflict: 'group_id,phone' });

    if (upsertErr) {
      return jsonError(`Erreur DB (membres): ${upsertErr.message}`, 500);
    }

    return jsonOk({ added: phones.length });
  } catch (err: any) {
    return jsonError(`Erreur whapi: ${err.message}`, 502);
  }
};
