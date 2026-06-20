export const prerender = false;

import type { APIRoute } from 'astro';
import { requireChantierAuth, jsonOk, jsonError, optionsResponse, originFromRequest } from '@/lib/api/apiHelpers';

// POST /api/chantier/[id]/artisan-space/token — le CLIENT (cockpit) génère/réactive le lien
// Espace Artisan d'un de ses contacts et récupère l'URL (dialog "copier le lien").
// requireChantierAuth garantit l'ownership + le gate abo (écriture).
export const POST: APIRoute = async ({ request, params }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;
  const chantierId = params.id!;

  let body: { contactId?: string };
  try { body = await request.json(); }
  catch { return jsonError('Corps invalide', 400); }

  const contactId = body.contactId ?? '';
  if (!contactId) return jsonError('contactId requis', 400);

  // Le contact doit appartenir à CE chantier.
  const { data: contact } = await ctx.supabase
    .from('contacts_chantier')
    .select('id, has_whatsapp')
    .eq('id', contactId)
    .eq('chantier_id', chantierId)
    .maybeSingle();
  if (!contact) return jsonError('Contact introuvable', 404);

  // Upsert : crée le token (DEFAULT gen_random_bytes) ou réactive l'existant (revoked_at = null).
  // Persistant : la même URL est conservée d'un envoi à l'autre.
  const { data: tok, error } = await ctx.supabase
    .from('artisan_space_tokens')
    .upsert(
      { chantier_id: chantierId, contact_id: contactId, revoked_at: null },
      { onConflict: 'chantier_id,contact_id' },
    )
    .select('token')
    .single();

  if (error || !tok) {
    console.error('[artisan-space/token] upsert error:', error?.message);
    return jsonError('Impossible de générer le lien', 500);
  }

  const url = `${originFromRequest(request)}/espace-artisan/${tok.token}`;
  return jsonOk({ url, token: tok.token, hasWhatsapp: contact.has_whatsapp !== false });
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
