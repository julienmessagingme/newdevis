export const prerender = false;

/**
 * POST /api/chantier/[id]/documents/depense-rapide
 *
 * Enregistre une dépense rapide sans fichier attaché.
 * Types : facture | ticket_caisse | achat_materiaux
 * Body JSON : { nom, documentType, depenseType, montant, factureStatut, lotId?, montantPaye? }
 */

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuthOrAgent } from '@/lib/api/apiHelpers';

const VALID_DEPENSE_TYPES = new Set(['facture', 'ticket_caisse', 'achat_materiaux', 'frais']);
const VALID_FACTURE_STATUTS = new Set(['recue', 'payee', 'payee_partiellement', 'en_litige']);

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
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
  // Source de financement choisie côté UI (chantier_entrees.id) — optionnel
  const fundingSourceId = typeof body.fundingSourceId === 'string' && body.fundingSourceId
    ? body.fundingSourceId
    : null;
  // Allocations multi-source (Fix #6) — array [{entree_id, amount}, ...]
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

  // Si le statut implique un versement réel (payee ou payee_partiellement),
  // on injecte un cashflow_term paid avec funding_source_id pour permettre
  // le suivi par enveloppe (apport / crédit / aides). Sans ça, le paiement
  // n'est pas attribué dans le KPI "Consommation par source".
  const cashflowTerms: Array<Record<string, unknown>> = [];
  const versement =
    factureStatut === 'payee'                ? montant ?? 0 :
    factureStatut === 'payee_partiellement'  ? montantPaye ?? 0 :
    0;
  if (versement > 0) {
    cashflowTerms.push({
      event_id: crypto.randomUUID(),
      amount:   versement,
      due_date: new Date().toISOString().slice(0, 10),
      status:   'paid',
      label:    nom,
      // allocations[] prime sur funding_source_id (Fix #6 > Fix #5)
      ...(allocations && allocations.length > 0
        ? { allocations }
        : fundingSourceId
        ? { funding_source_id: fundingSourceId }
        : {}),
    });
  }

  // Helper : tente l'INSERT avec un depense_type donné. Retourne {doc, error}.
  // Permet le fallback automatique 'frais' → 'achat_materiaux' si la
  // migration 20260423150000_add_frais_depense_type.sql n'est pas en prod.
  const tryInsert = async (effectiveDepenseType: string) =>
    ctx.supabase
      .from('documents_chantier')
      .insert({
        chantier_id:    chantierId,
        lot_id:         lotId,
        type:           'facture',
        document_type:  'facture',
        depense_type:   effectiveDepenseType,
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
        cashflow_terms: cashflowTerms,
      })
      .select()
      .single();

  // V3.5.15 (2026-06-15) — Robustesse INSERT depense_type :
  // 1. Premier essai avec depenseType demandé
  // 2. Si CHECK constraint violation sur 'frais' (= migration non appliquée en
  //    prod), fallback automatique vers 'achat_materiaux' (équivalent fonctionnel
  //    le plus proche). Le user n'est pas bloqué la veille de sa démo.
  // 3. Le détail de l'erreur Supabase est désormais remonté au client (au lieu
  //    du générique "Erreur lors de l'enregistrement") pour diagnostic instantané.
  let { data: doc, error } = await tryInsert(depenseType);

  if (error && depenseType === 'frais' && /depense_type_check|invalid input value|violates check/i.test(error.message ?? '')) {
    console.warn(
      `[depense-rapide] V3.5.15 fallback 'frais' → 'achat_materiaux' ` +
      `(migration 20260423150000 manquante en prod ?). Détail: ${error.message}`,
    );
    const retry = await tryInsert('achat_materiaux');
    doc = retry.data;
    error = retry.error;
  }

  if (error || !doc) {
    const detail = error?.message ?? 'INSERT échoué sans message Supabase';
    console.error('[depense-rapide] insert error:', detail, '— payload:', {
      chantierId, lotId, depenseType, factureStatut, montant,
    });
    // V3.5.15 — remontée du détail au client pour diagnostic instantané.
    // En cas de demo demain : tu vois directement ce qui bloque côté DB.
    return jsonError(`Enregistrement impossible : ${detail}`, 500);
  }

  // Fire-and-forget: deterministic SQL checks only ($0)
  const _sbUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const _sbKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  fetch(`${_sbUrl}/functions/v1/agent-checks`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${_sbKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ chantier_id: chantierId }),
  }).catch(() => {});

  return jsonOk({ document: doc }, 201);
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
