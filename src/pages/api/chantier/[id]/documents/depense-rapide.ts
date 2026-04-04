export const prerender = false;

/**
 * POST /api/chantier/[id]/documents/depense-rapide
 *
 * Enregistre une dépense rapide sans fichier attaché.
 * Types : facture | ticket_caisse | achat_materiaux
 * Body JSON : { nom, documentType, depenseType, montant, factureStatut, lotId?, montantPaye? }
 */

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

const VALID_DEPENSE_TYPES = new Set(['facture', 'ticket_caisse', 'achat_materiaux']);
const VALID_FACTURE_STATUTS = new Set(['recue', 'payee', 'payee_partiellement', 'en_litige']);

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError('Corps de requête invalide', 400);
  }

  const nom = typeof body.nom === 'string' ? body.nom.trim() : '';
  if (!nom) return jsonError('Nom requis', 400);

  const depenseType   = typeof body.depenseType   === 'string' ? body.depenseType   : 'facture';
  const factureStatut = typeof body.factureStatut === 'string' ? body.factureStatut : 'recue';
  const montant       = typeof body.montant       === 'number' ? body.montant       : null;
  const montantPaye   = typeof body.montantPaye   === 'number' ? body.montantPaye   : null;
  const lotIdRaw      = typeof body.lotId         === 'string' ? body.lotId         : null;

  if (!VALID_DEPENSE_TYPES.has(depenseType))
    return jsonError('Type de dépense invalide', 400);
  if (!VALID_FACTURE_STATUTS.has(factureStatut))
    return jsonError('Statut invalide', 400);
  if (montant !== null && montant < 0)
    return jsonError('Montant invalide', 400);

  // Validation lot
  let lotId: string | null = lotIdRaw;
  if (lotId) {
    const { data: lot } = await ctx.supabase
      .from('lots_chantier').select('id')
      .eq('id', lotId).eq('chantier_id', chantierId).single();
    if (!lot) lotId = null;
  }

  const { data: doc, error } = await ctx.supabase
    .from('documents_chantier')
    .insert({
      chantier_id:    chantierId,
      lot_id:         lotId,
      type:           'facture',
      document_type:  'facture',
      depense_type:   depenseType,
      source:         'manual_entry',
      nom,
      nom_fichier:    '',
      bucket_path:    `manual/${chantierId}/${crypto.randomUUID()}`,
      taille_octets:  null,
      mime_type:      null,
      montant:        montant,
      montant_paye:   factureStatut === 'payee_partiellement' || factureStatut === 'en_litige'
                        ? montantPaye
                        : null,
      facture_statut: factureStatut,
    })
    .select()
    .single();

  if (error || !doc) {
    console.error('[depense-rapide] insert error:', error?.message);
    return jsonError('Erreur lors de l\'enregistrement', 500);
  }

  return jsonOk({ document: doc }, 201);
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
