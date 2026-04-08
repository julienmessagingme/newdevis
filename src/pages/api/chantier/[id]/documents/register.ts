export const prerender = false;

import type { APIRoute } from 'astro';
import type { DocumentType } from '@/types/chantier-ia';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

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

  // Mismatch detection removed from register.ts — the document name is not yet
  // enriched at this stage (raw filename like "xy.pdf"). Detection fires AFTER
  // content extraction: analyze-quote (devis), extract-invoice (facture),
  // describe (photo/plan), or [docId].ts PATCH (lot reassignment).

  // Fire-and-forget: deterministic SQL checks only ($0).
  // Agent-orchestrator is NOT called here — it fires AFTER content extraction
  // (analyze-quote for devis, extract-invoice for factures, describe for photos)
  // to avoid triple-triggering on the same upload event.
  const _sbUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const _sbKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  fetch(`${_sbUrl}/functions/v1/agent-checks`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${_sbKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ chantier_id: chantierId }),
  }).catch(() => {});

  // ── Auto-analyse : déclenche immédiatement l'analyse pour chaque devis uploadé ──
  // L'utilisateur n'a pas à cliquer "Analyser" manuellement.
  // analyser.ts est idempotent : si une analyse existe déjà (doc.analyse_id) → 409 + ID existant.
  // Rollback géré dans analyser.ts. Bucket_path ne doit pas être un ancien path d'analyse.
  if (documentType === 'devis' && bucketPath && !bucketPath.startsWith('analyse/')) {
    const reqUrl = new URL(request.url);
    const analyserUrl = `${reqUrl.origin}/api/chantier/${chantierId}/documents/${(doc as any).id}/analyser`;
    const authHeader = request.headers.get('Authorization') ?? '';
    fetch(analyserUrl, {
      method: 'POST',
      headers: { Authorization: authHeader },
    }).catch((e) => {
      console.error('[register] auto-analyse fire-and-forget error:', e instanceof Error ? e.message : String(e));
    });
  }

  return jsonOk({ document: { ...doc, signedUrl: s?.signedUrl ?? null } }, 201);
};

export const OPTIONS: APIRoute = () => optionsResponse();
