export const prerender = false;

import type { APIRoute } from 'astro';
import type { DocumentType } from '@/types/chantier-ia';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth, createServiceClient } from '@/lib/apiHelpers';
import { detectDevisType } from '@/utils/extractProjectElements';

const BUCKET          = 'chantier-documents';
const SIGNED_TTL      = 3_600;

const VALID_TYPES = new Set<DocumentType>([
  'devis', 'facture', 'photo', 'plan', 'autorisation', 'assurance', 'autre',
]);

// ── POST /api/chantier/[id]/documents/register ───────────────────────────────
// Enregistre en base les métadonnées d'un fichier déjà uploadé directement dans
// Supabase Storage via URL signée (bypass Vercel 4.5 Mo).
//
// Body JSON :
//   nom          string
//   documentType DocumentType
//   lotId        string | null
//   bucketPath   string   ← chemin dans le bucket chantier-documents
//   nomFichier   string
//   mimeType     string | null
//   tailleOctets number | null
//   montant      number | null
//   factureStatut string | null   ← 'recue' par défaut pour les factures
//   paymentTerms  { type_facture, pct, delai_jours, numero_facture } | null

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  let body: {
    nom?: string; documentType?: DocumentType; lotId?: string | null;
    bucketPath?: string; nomFichier?: string; mimeType?: string | null; tailleOctets?: number | null;
    montant?: number | null;
    factureStatut?: string | null;
    paymentTerms?: { type_facture: string; pct: number; delai_jours: number; numero_facture: string | null } | null;
  };
  try { body = await request.json(); }
  catch { return jsonError('Corps invalide', 400); }

  const nom          = body.nom?.trim() ?? '';
  const documentType = body.documentType ?? 'autre';
  const bucketPath   = body.bucketPath ?? '';

  if (!nom)                           return jsonError('Nom requis', 400);
  if (!VALID_TYPES.has(documentType)) return jsonError('Type invalide', 400);
  if (!bucketPath)                    return jsonError('bucketPath requis', 400);

  // Validation lot — '' → null pour éviter "invalid input syntax for type uuid"
  let lotId: string | null = body.lotId || null;
  let lotNom: string | null = null;
  if (lotId) {
    const { data: lot } = await ctx.supabase
      .from('lots_chantier').select('id, nom')
      .eq('id', lotId).eq('chantier_id', chantierId).single();
    if (!lot) lotId = null;
    else lotNom = lot.nom;
  }

  // Calcul montant_paye si l'IA a détecté un acompte avec pourcentage
  const montant      = typeof body.montant === 'number' ? body.montant : null;
  const paymentTerms = body.paymentTerms ?? null;
  const isAcompte    = paymentTerms?.type_facture === 'acompte' && (paymentTerms?.pct ?? 0) > 0;
  const montantPaye  = isAcompte && montant ? Math.round(montant * paymentTerms!.pct / 100 * 100) / 100 : null;

  // Si acompte détecté par l'IA → statut 'payee_partiellement', sinon utiliser ce qui est fourni
  const VALID_STATUTS = new Set(['recue', 'payee', 'payee_partiellement', 'en_litige']);
  const factureStatut = isAcompte
    ? 'payee_partiellement'
    : (body.factureStatut && VALID_STATUTS.has(body.factureStatut) ? body.factureStatut : null);

  const { data: doc, error: insertErr } = await ctx.supabase
    .from('documents_chantier')
    .insert({
      chantier_id:   chantierId,
      lot_id:        lotId,
      type:          documentType,
      document_type: documentType,
      source:        'manual_upload',
      nom,
      nom_fichier:   body.nomFichier ?? '',
      bucket_path:   bucketPath,
      taille_octets: body.tailleOctets ?? null,
      mime_type:     body.mimeType ?? null,
      montant,
      facture_statut: factureStatut,
      montant_paye:  montantPaye,
      payment_terms: paymentTerms,
    })
    .select()
    .single();

  if (insertErr || !doc) {
    console.error('[register] insert error:', insertErr?.message);
    return jsonError(insertErr?.message ?? 'Erreur DB', 500);
  }

  const { data: s } = await ctx.supabase.storage
    .from(BUCKET).createSignedUrl(bucketPath, SIGNED_TTL);

  // ── Lot mismatch detection on registration ─────────────────────────────────
  if (lotId && lotNom && nom) {
    const docType = detectDevisType(nom);
    const lotType = detectDevisType(lotNom);
    if (docType !== 'autre' && lotType !== 'autre' && docType !== lotType) {
      const serviceClient = createServiceClient();
      serviceClient.from('agent_insights').insert({
        chantier_id: chantierId,
        user_id: ctx.user.id,
        type: 'risk_detected',
        severity: 'warning',
        title: `Affectation douteuse : "${nom.slice(0, 40)}" dans lot "${lotNom}"`,
        body: `Ce document semble concerner "${docType}" mais est affecté au lot "${lotNom}" (type "${lotType}"). Vérifiez l'affectation.`,
        source_event: { check: 'lot_mismatch', document_id: doc.id, detected_type: docType, lot_type: lotType },
      }).then(() => {}).catch(() => {});
    }
  }

  // Fire-and-forget: deterministic checks ($0) + real-time LLM analysis
  const _sbUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const _sbKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  fetch(`${_sbUrl}/functions/v1/agent-checks`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${_sbKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ chantier_id: chantierId }),
  }).catch(() => {});
  fetch(`${_sbUrl}/functions/v1/agent-orchestrator`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${_sbKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ chantier_id: chantierId, run_type: 'morning' }),
  }).catch(() => {});

  return jsonOk({ document: { ...doc, signedUrl: s?.signedUrl ?? null } }, 201);
};

export const OPTIONS: APIRoute = () => optionsResponse();
