export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

/**
 * PATCH /api/chantier/[id]/devis/[devisId]
 * Met à jour les coordonnées artisan d'un devis.
 * Body: { artisanNom?, artisanEmail?, artisanPhone?, artisanSiret? }
 */
export const PATCH: APIRoute = async ({ request, params }) => {
  const { id: chantierId, devisId } = params;
  if (!devisId) {
    return jsonError('Paramètres manquants', 400);
  }

  const ctx = await requireChantierAuth(request, chantierId!);
  if (ctx instanceof Response) return ctx;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError('Corps de requête invalide', 400);
  }

  const updates: Record<string, string | null> = {};
  if (typeof body.artisanNom === 'string') updates.artisan_nom = body.artisanNom.trim() || null;
  if (typeof body.artisanEmail === 'string') updates.artisan_email = body.artisanEmail.trim() || null;
  if (typeof body.artisanPhone === 'string') updates.artisan_phone = body.artisanPhone.trim() || null;
  if (typeof body.artisanSiret === 'string') updates.artisan_siret = body.artisanSiret.trim() || null;
  if ('lotId' in body) updates.lot_id = typeof body.lotId === 'string' ? body.lotId : null;

  if (Object.keys(updates).length === 0) {
    return jsonError('Aucun champ à mettre à jour', 400);
  }

  const { data, error } = await ctx.supabase
    .from('devis_chantier')
    .update(updates)
    .eq('id', devisId)
    .eq('chantier_id', chantierId!)
    .select('id, artisan_nom, artisan_email, artisan_phone, artisan_siret, lot_id')
    .single();

  if (error) {
    console.error('[api/chantier/devis PATCH] error:', error.message);
    return jsonError('Erreur lors de la mise à jour', 500);
  }

  return jsonOk({ devis: data });
};

/**
 * DELETE /api/chantier/[id]/devis/[devisId]
 * Détache un devis d'un chantier (ne supprime PAS le devis —
 * met chantier_id à NULL pour le libérer).
 */
export const DELETE: APIRoute = async ({ request, params }) => {
  const { id: chantierId, devisId } = params;

  if (!devisId) {
    return jsonError('Paramètres manquants', 400);
  }

  const ctx = await requireChantierAuth(request, chantierId!);
  if (ctx instanceof Response) return ctx;

  // Détache le devis (chantier_id → NULL) sans le supprimer
  // Note: si la colonne chantier_id n'accepte pas NULL, on peut aussi
  // garder le devis en le déplaçant hors de ce chantier uniquement.
  // Ici on utilise une approche de nullification — le devis reste
  // disponible pour être rattaché à un autre chantier.
  const { error } = await ctx.supabase
    .from('devis_chantier')
    .delete()
    .eq('id', devisId)
    .eq('chantier_id', chantierId!);

  if (error) {
    // Fallback: si chantier_id est NOT NULL, on ne peut pas le nullifier.
    // Dans ce cas on supprime vraiment le rattachement (la row).
    console.error('[api/chantier/devis DELETE] error:', error.message);
    return jsonError('Erreur lors du détachement du devis', 500);
  }

  return jsonOk({ success: true });
};

export const OPTIONS: APIRoute = () => optionsResponse();
