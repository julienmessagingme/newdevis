export const prerender = false;

/**
 * POST /api/chantier/[id]/quick-expense
 *
 * Crée une dépense libre (sans fichier) directement dans documents_chantier.
 * Exemples : achat matériaux en liquide, paiement direct, frais annexes.
 *
 * Body: {
 *   label:       string            — libellé de la dépense (obligatoire)
 *   amount:      number            — montant en € (obligatoire, > 0)
 *   depense_type: 'achat_materiaux' | 'frais' | 'ticket_caisse'  (défaut: 'achat_materiaux')
 *   lot_id?:     string            — lot auquel rattacher la dépense (optionnel)
 *   note?:       string            — commentaire libre (optionnel)
 *   date?:       string            — date YYYY-MM-DD (défaut: aujourd'hui)
 * }
 *
 * La dépense crée automatiquement un event "paid" dans payment_events_v (branche 1).
 * → Visible dans la colonne "Payé" du Budget et dans l'Échéancier.
 */

import type { APIRoute } from 'astro';
import { requireChantierAuth, jsonOk, jsonError, optionsResponse } from '@/lib/apiHelpers';

const ALLOWED_TYPES = ['achat_materiaux', 'frais', 'ticket_caisse'] as const;
type DepenseType = typeof ALLOWED_TYPES[number];

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps invalide', 400); }

  const label       = typeof body.label  === 'string' && body.label.trim()   ? body.label.trim()   : null;
  const amount      = typeof body.amount === 'number' && body.amount > 0     ? body.amount         : null;
  const rawType     = typeof body.depense_type === 'string'                  ? body.depense_type   : 'achat_materiaux';
  const depenseType: DepenseType = ALLOWED_TYPES.includes(rawType as DepenseType) ? rawType as DepenseType : 'achat_materiaux';
  const lotId       = typeof body.lot_id === 'string' && body.lot_id         ? body.lot_id         : null;
  const note        = typeof body.note   === 'string' && body.note.trim()    ? body.note.trim()    : null;
  const date        = typeof body.date   === 'string' && body.date           ? body.date           : new Date().toISOString().slice(0, 10);

  if (!label)  return jsonError('Le libellé est requis', 400);
  if (!amount) return jsonError('Le montant est requis (> 0)', 400);

  // Vérifier que le lot appartient bien au chantier si fourni
  if (lotId) {
    const { data: lot } = await ctx.supabase
      .from('lots_chantier')
      .select('id')
      .eq('id', lotId)
      .eq('chantier_id', chantierId)
      .maybeSingle();
    if (!lot) return jsonError('Lot introuvable ou non autorisé', 404);
  }

  // Créer le document dépense (sans fichier)
  // document_type = 'facture' pour passer dans la branche facture du Budget
  // facture_statut = 'payee' (dépense déjà réglée)
  // VIEW branche 1 auto-génère un event paid via depense_type IN ('frais','ticket_caisse','achat_materiaux')
  // ⚠️ MAIS: branche 1 ne couvre que 'frais' | 'ticket_caisse'. Pour 'achat_materiaux' → cashflow_terms
  // Donc on injecte un cashflow_term paid pour garantir la visibilité dans le Budget quelle que soit la branche.
  const cashflow_terms = [{
    event_id: crypto.randomUUID(),
    amount,
    due_date: date,
    status:   'paid',
    label,
  }];

  const { data: inserted, error } = await ctx.supabase
    .from('documents_chantier')
    .insert({
      chantier_id:    chantierId,
      nom:            label,
      nom_fichier:    note ?? label,
      document_type:  'facture',
      depense_type,
      facture_statut: 'payee',
      montant:        amount,
      montant_paye:   amount,
      lot_id:         lotId,
      cashflow_terms,
    })
    .select('id, nom, montant, depense_type, lot_id, created_at')
    .single();

  if (error || !inserted) {
    console.error('[quick-expense] insert error:', error?.message);
    return jsonError('Erreur lors de la création de la dépense', 500);
  }

  return jsonOk({ document: inserted, message: 'Dépense enregistrée' }, 201);
};

export const OPTIONS: APIRoute = () => optionsResponse();
