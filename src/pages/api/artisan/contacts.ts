export const prerender = false;

import type { APIRoute } from 'astro';
import { requireArtisanToken, jsonOk, optionsResponse } from '@/lib/api/apiHelpers';
import { shapeArtisanContacts } from '@/lib/api/artisanScope';

// GET /api/artisan/contacts — coordonnées des AUTRES artisans du chantier pour coordination.
// shapeArtisanContacts (testé) garantit : self exclu + UNIQUEMENT {nom, role, telephone}
// (aucun email/notes/siret/has_whatsapp/lot_id).
export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireArtisanToken(request);
  if (ctx instanceof Response) return ctx;
  const { supabase, contactId, chantierId } = ctx;

  const { data } = await supabase
    .from('contacts_chantier')
    .select('id, nom, role, telephone')
    .eq('chantier_id', chantierId);

  return jsonOk({ contacts: shapeArtisanContacts(data ?? [], contactId) });
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
