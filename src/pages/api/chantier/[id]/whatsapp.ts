export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';
import { formatPhone, createWhatsAppGroup, addGroupParticipants } from '@/lib/whapiUtils'; // addGroupParticipants utilisé dans PATCH


async function getContactPhones(supabase: any, chantierId: string): Promise<string[]> {
  const { data } = await supabase
    .from('contacts_chantier')
    .select('telephone')
    .eq('chantier_id', chantierId)
    .not('telephone', 'is', null);
  return (data ?? [])
    .map((c: any) => formatPhone(c.telephone))
    .filter((p: string) => p.length >= 10);
}

async function getClientPhone(supabase: any, token: string): Promise<string | null> {
  // getUser(token) retourne les user_metadata complets — plus fiable que auth.admin
  const { data } = await supabase.auth.getUser(token);
  const phone =
    data?.user?.user_metadata?.phone ??
    data?.user?.phone ??
    null;
  return phone ? formatPhone(phone) : null;
}

export const OPTIONS: APIRoute = () => optionsResponse('POST,PATCH,OPTIONS');

export const POST: APIRoute = async ({ params, request }) => {
  const token = request.headers.get('Authorization')?.slice(7) ?? '';
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  const { data: chantier } = await ctx.supabase
    .from('chantiers')
    .select('nom, whatsapp_group_id')
    .eq('id', chantierId)
    .single();

  if (!chantier) return jsonError('Chantier introuvable', 404);
  if (chantier.whatsapp_group_id) return jsonError('Un groupe WhatsApp existe déjà', 409);

  const artisanPhones = await getContactPhones(ctx.supabase, chantierId);
  const clientPhone = await getClientPhone(ctx.supabase, token);

  const participants = [
    ...artisanPhones,
    ...(clientPhone ? [clientPhone] : []),
  ].filter((p, i, arr) => arr.indexOf(p) === i);

  const subject = `Chantier - ${chantier.nom}`;

  try {
    const { groupId, inviteLink } = await createWhatsAppGroup(subject, participants);
    // +33633921577 (GérerMonChantier) est le compte whapi — déjà admin du groupe automatiquement

    await ctx.supabase
      .from('chantiers')
      .update({ whatsapp_group_id: groupId, whatsapp_invite_link: inviteLink })
      .eq('id', chantierId);

    return jsonOk({ groupId, inviteLink }, 201);
  } catch (err: any) {
    return jsonError(`Erreur whapi: ${err.message}`, 502);
  }
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  const { data: chantier } = await ctx.supabase
    .from('chantiers')
    .select('whatsapp_group_id')
    .eq('id', chantierId)
    .single();

  if (!chantier?.whatsapp_group_id)
    return jsonError('Aucun groupe WhatsApp pour ce chantier', 400);

  const phones = await getContactPhones(ctx.supabase, chantierId);
  if (phones.length === 0) return jsonOk({ added: 0 });

  try {
    await addGroupParticipants(chantier.whatsapp_group_id, phones);
    return jsonOk({ added: phones.length });
  } catch (err: any) {
    return jsonError(`Erreur whapi: ${err.message}`, 502);
  }
};
