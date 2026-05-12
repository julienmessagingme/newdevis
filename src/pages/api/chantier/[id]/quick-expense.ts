export const prerender = false;

import { randomUUID } from 'node:crypto';

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
import { requireChantierAuth, jsonOk, jsonError, optionsResponse } from '@/lib/api/apiHelpers';

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
  // Filtre les ids non-UUID (ex: pseudo-buckets côté Budget: 'sans_lot', 'fallback-X')
  // pour éviter "invalid input syntax for type uuid" silencieux côté Postgres.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const lotId       = typeof body.lot_id === 'string' && body.lot_id && UUID_RE.test(body.lot_id)
    ? body.lot_id
    : null;
  const note        = typeof body.note   === 'string' && body.note.trim()    ? body.note.trim()    : null;
  const date        = typeof body.date   === 'string' && body.date           ? body.date           : new Date().toISOString().slice(0, 10);
  // Source de financement (chantier_entrees.id) — optionnel
  const fundingSourceId = typeof body.funding_source_id === 'string' && body.funding_source_id
    ? body.funding_source_id
    : null;
  // Allocations multi-source (Fix #6) — prime sur funding_source_id si présent
  const rawAllocations = Array.isArray(body.allocations) ? body.allocations : null;
  const allocations: Array<{ entree_id: string; amount: number }> | null =
    rawAllocations
      ? rawAllocations
          .map((a: any) => ({
            entree_id: typeof a?.entree_id === 'string' ? a.entree_id : '',
            amount:    typeof a?.amount    === 'number' ? a.amount    : 0,
          }))
          .filter((a: any) => a.entree_id && a.amount > 0)
      : null;

  if (!label)  return jsonError('Le libellé est requis', 400);
  if (!amount) return jsonError('Le montant est requis (> 0)', 400);

  // Vérifier que le lot appartient bien au chantier si fourni
  if (lotId) {
    const { data: lot, error: lotErr } = await ctx.supabase
      .from('lots_chantier')
      .select('id')
      .eq('id', lotId)
      .eq('chantier_id', chantierId)
      .maybeSingle();
    if (lotErr) {
      console.error('[quick-expense] lot lookup error:', lotErr.message);
      return jsonError(`Lot introuvable : ${lotErr.message}`, 400);
    }
    if (!lot) return jsonError('Lot introuvable ou non autorisé pour ce chantier', 404);
  }

  // Créer le document dépense (sans fichier)
  // document_type = 'facture' pour passer dans la branche facture du Budget
  // facture_statut = 'payee' (dépense déjà réglée)
  // VIEW branche 1 auto-génère un event paid via depense_type IN ('frais','ticket_caisse','achat_materiaux')
  // ⚠️ MAIS: branche 1 ne couvre que 'frais' | 'ticket_caisse'. Pour 'achat_materiaux' → cashflow_terms
  // Donc on injecte un cashflow_term paid pour garantir la visibilité dans le Budget quelle que soit la branche.
  const cashflow_terms = [{
    event_id: randomUUID(),
    amount,
    due_date: date,
    status:   'paid',
    label,
    // allocations[] prime sur funding_source_id (Fix #6 > Fix #5)
    ...(allocations && allocations.length > 0
      ? { allocations }
      : fundingSourceId
      ? { funding_source_id: fundingSourceId }
      : {}),
  }];

  // bucket_path est NOT NULL UNIQUE → on génère un chemin fictif unique
  // (cohérent avec /documents/depense-rapide qui fait pareil pour les
  // dépenses sans fichier physique).
  const bucketPath = `manual/${chantierId}/${randomUUID()}`;

  const { data: inserted, error } = await ctx.supabase
    .from('documents_chantier')
    .insert({
      chantier_id:    chantierId,
      nom:            label,
      nom_fichier:    note ?? label,
      bucket_path:    bucketPath,
      document_type:  'facture',
      type:           'facture',
      source:         'manual_entry',
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
    // Log complet côté serveur (Vercel logs) + message exact côté client pour debug.
    console.error('[quick-expense] insert error:', {
      message: error?.message,
      details: (error as any)?.details,
      hint:    (error as any)?.hint,
      code:    (error as any)?.code,
      payload: { chantierId, label, amount, depenseType, lotId, hasCashflowTerms: cashflow_terms.length > 0 },
    });
    return jsonError(
      error?.message ?? 'Erreur lors de la création de la dépense (insert null)',
      500,
    );
  }

  return jsonOk({ document: inserted, message: 'Dépense enregistrée' }, 201);
};

export const OPTIONS: APIRoute = () => optionsResponse();
