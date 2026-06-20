export const prerender = false;

import type { APIRoute } from 'astro';
import { requireArtisanToken, jsonOk, optionsResponse } from '@/lib/api/apiHelpers';

// GET /api/artisan/validate — identité de l'artisan + contexte chantier (header X-Artisan-Token).
// Sert d'écran d'entrée du portail : si le token est invalide/expiré, requireArtisanToken
// renvoie un 403 générique. Ne renvoie JAMAIS user_id, notes, budget.
export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireArtisanToken(request);
  if (ctx instanceof Response) return ctx;
  const { supabase, contactId, chantierId } = ctx;

  const [contactRes, chantierRes] = await Promise.all([
    supabase.from('contacts_chantier').select('nom, role, lot_id').eq('id', contactId).maybeSingle(),
    supabase.from('chantiers').select('nom, adresse').eq('id', chantierId).maybeSingle(),
  ]);

  const contact = contactRes.data;
  let lotNom: string | null = null;
  if (contact?.lot_id) {
    const { data: lot } = await supabase.from('lots_chantier').select('nom').eq('id', contact.lot_id).maybeSingle();
    lotNom = lot?.nom ?? null;
  }

  return jsonOk({
    contact: { nom: contact?.nom ?? null, role: contact?.role ?? null, lotNom },
    chantier: { nom: chantierRes.data?.nom ?? null, adresse: chantierRes.data?.adresse ?? null },
  });
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
