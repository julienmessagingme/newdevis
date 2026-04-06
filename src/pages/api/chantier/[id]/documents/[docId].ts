export const prerender = false;

import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentType } from '@/types/chantier-ia';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth, createServiceClient } from '@/lib/apiHelpers';
import { detectDevisType } from '@/utils/extractProjectElements';

const BUCKET          = 'chantier-documents';
const SIGNED_TTL      = 3_600;

const VALID_TYPES = new Set<DocumentType>([
  'devis', 'facture', 'photo', 'plan', 'autorisation', 'assurance', 'autre',
]);

/** Vérifie ownership du chantier puis charge le document. Double vérification explicite. */
async function loadDocWithOwnership(
  supabase: SupabaseClient,
  docId: string,
  chantierId: string,
  userId: string,
) {
  // 1. Ownership chantier
  const { data: chantier } = await supabase
    .from('chantiers').select('id')
    .eq('id', chantierId).eq('user_id', userId).single();
  if (!chantier) return null;

  // 2. Document appartenant à ce chantier
  const { data: doc } = await supabase
    .from('documents_chantier').select('*')
    .eq('id', docId).eq('chantier_id', chantierId).single();
  return doc ?? null;
}

// ── GET /api/chantier/[id]/documents/[docId] ────────────────────────────────
// Retourne une URL signée fraîche (utile si celle en cache est expirée).

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const doc = await loadDocWithOwnership(ctx.supabase, params.docId!, params.id!, ctx.user.id);
  if (!doc) return jsonError('Document introuvable', 404);

  const { data: s } = await ctx.supabase.storage.from(BUCKET).createSignedUrl(doc.bucket_path, SIGNED_TTL);
  return jsonOk({ signedUrl: s?.signedUrl ?? null });
};

// ── DELETE /api/chantier/[id]/documents/[docId] ─────────────────────────────
// Suppression robuste : ownership → storage → DB.
// Si storage échoue : log + continue (évite record DB orphelin).

export const DELETE: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const doc = await loadDocWithOwnership(ctx.supabase, params.docId!, params.id!, ctx.user.id);
  if (!doc) return jsonError('Document introuvable', 404);

  // Étape 1 : Suppression Storage
  const { error: storageErr } = await ctx.supabase.storage.from(BUCKET).remove([doc.bucket_path]);
  if (storageErr) {
    // Non bloquant : le fichier a peut-être déjà été supprimé ou est inaccessible.
    // On continue pour ne pas laisser le record DB dangling.
    console.error('[api/documents] DELETE storage error:', storageErr.message);
  }

  // Étape 2 : Suppression DB
  const { error: dbErr } = await ctx.supabase
    .from('documents_chantier')
    .delete()
    .eq('id', params.docId!)
    .eq('chantier_id', params.id!);

  if (dbErr) {
    console.error('[api/documents] DELETE db error:', dbErr.message);
    return jsonError('Erreur lors de la suppression', 500);
  }

  return jsonOk({ success: true });
};

// ── PATCH /api/chantier/[id]/documents/[docId] ──────────────────────────────
// Mise à jour partielle : nom, document_type, lot_id.

export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const doc = await loadDocWithOwnership(ctx.supabase, params.docId!, params.id!, ctx.user.id);
  if (!doc) return jsonError('Document introuvable', 404);

  const VALID_DEVIS_STATUTS = new Set(['en_cours', 'a_relancer', 'valide', 'attente_facture']);
  const VALID_FACTURE_STATUTS = new Set(['recue', 'payee', 'payee_partiellement', 'en_litige']);

  let body: {
    nom?: string;
    documentType?: DocumentType;
    lotId?: string | null;
    devisStatut?: string;
    factureStatut?: string;
    montantPaye?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError('Corps invalide', 400);
  }

  const updates: Record<string, unknown> = {};

  if (body.nom !== undefined)
    updates.nom = body.nom.trim();

  if (body.documentType !== undefined) {
    if (!VALID_TYPES.has(body.documentType))
      return jsonError('Type invalide', 400);
    updates.document_type = body.documentType;
    updates.type = body.documentType; // sync colonne legacy NOT NULL
  }

  if ('lotId' in body) {
    if (body.lotId !== null && body.lotId !== undefined) {
      const { data: lot } = await ctx.supabase
        .from('lots_chantier').select('id')
        .eq('id', body.lotId).eq('chantier_id', params.id!).single();
      if (!lot)
        return jsonError('Lot invalide', 400);
    }
    updates.lot_id = body.lotId ?? null;
  }

  if (body.devisStatut !== undefined) {
    if (!VALID_DEVIS_STATUTS.has(body.devisStatut))
      return jsonError('Statut invalide', 400);
    updates.devis_statut = body.devisStatut;
  }

  if (body.factureStatut !== undefined) {
    if (!VALID_FACTURE_STATUTS.has(body.factureStatut))
      return jsonError('Statut facture invalide', 400);
    updates.facture_statut = body.factureStatut;
    // Reset montant_paye sauf pour les statuts où un montant partiel est pertinent
    if (body.factureStatut !== 'payee_partiellement' && body.factureStatut !== 'en_litige') {
      updates.montant_paye = null;
    }
    // Auto-calcul montant_paye depuis payment_terms quand passage à acompte sans montant explicite
    if (body.factureStatut === 'payee_partiellement' && body.montantPaye === undefined) {
      const pt = (doc as any).payment_terms;
      const docMontant = (doc as any).montant;
      if (pt?.type_facture === 'acompte' && pt?.pct > 0 && docMontant) {
        updates.montant_paye = Math.round(docMontant * pt.pct / 100 * 100) / 100;
      }
    }
  }

  if (body.montantPaye !== undefined) {
    if (body.montantPaye !== null && (typeof body.montantPaye !== 'number' || body.montantPaye < 0))
      return jsonError('Montant payé invalide', 400);
    updates.montant_paye = body.montantPaye;
  }

  if (!Object.keys(updates).length)
    return jsonError('Aucune modification fournie', 400);

  // Séparer update et fetch pour éviter PGRST116 (single() échoue si 0 lignes)
  const { error: updateErr } = await ctx.supabase
    .from('documents_chantier')
    .update(updates)
    .eq('id', params.docId!)
    .eq('chantier_id', params.id!);

  if (updateErr) {
    console.error('[api/documents] PATCH error:', updateErr.message);
    return jsonError(updateErr.message, 500);
  }

  const { data: updated, error: fetchErr } = await ctx.supabase
    .from('documents_chantier')
    .select('*')
    .eq('id', params.docId!)
    .single();

  if (fetchErr || !updated) {
    return jsonError('Document introuvable après mise à jour', 404);
  }

  // ── Lot assignment coherence check (uses document name enriched by extraction) ──
  if ('lot_id' in updates && updates.lot_id) {
    const docName = updated.nom ?? '';
    const detectedType = detectDevisType(docName);
    if (detectedType !== 'autre') {
      const { data: lot } = await ctx.supabase
        .from('lots_chantier').select('nom').eq('id', updates.lot_id as string).single();
      if (lot) {
        const lotType = detectDevisType(lot.nom);
        if (lotType !== 'autre' && lotType !== detectedType) {
          const serviceClient = createServiceClient();
          serviceClient.from('agent_insights').insert({
            chantier_id: params.id,
            user_id: ctx.user.id,
            type: 'risk_detected',
            severity: 'warning',
            title: `Affectation douteuse : "${docName.slice(0, 40)}" dans lot "${lot.nom}"`,
            body: `Ce document semble concerner "${detectedType}" mais est affecté au lot "${lot.nom}" (type "${lotType}"). Vérifiez l'affectation.`,
            source_event: { check: 'lot_mismatch', document_id: params.docId, detected_type: detectedType, lot_type: lotType },
          }).then(() => {}).catch(() => {});
        }
      }
    }
  }

  // Fire-and-forget: re-trigger agent when lot assignment or statut changes
  if ('lot_id' in updates || 'devis_statut' in updates || 'facture_statut' in updates) {
    const _sbUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const _sbKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
    fetch(`${_sbUrl}/functions/v1/agent-checks`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${_sbKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chantier_id: params.id }),
    }).catch(() => {});
    fetch(`${_sbUrl}/functions/v1/agent-orchestrator`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${_sbKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chantier_id: params.id, run_type: 'morning' }),
    }).catch(() => {});
  }

  return jsonOk({ document: updated });
};

export const OPTIONS: APIRoute = () => optionsResponse();
