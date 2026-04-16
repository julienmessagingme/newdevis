export const prerender = false;

import type { APIRoute } from 'astro';
import { generatePaymentEventsFromAnalyse } from '@/lib/paymentEvents';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth, requireChantierAuthOrAgent } from '@/lib/apiHelpers';

// ── GET /api/chantier/[id]/payment-events ─────────────────────────────────────
// Retourne tous les payment_events du chantier, triés par due_date ASC.
// Les événements annulés (is_override=true) sont exclus par défaut.

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;
  const url            = new URL(request.url);
  const includeOverride = url.searchParams.get('include_override') === 'true';

  // Récupérer les IDs des devis validés pour filtrer les payment_events
  // On n'inclut que les events issus de devis validés (ou d'attente_facture) et de factures.
  // Les devis en cours / non retenus ne doivent pas apparaître dans l'échéancier.
  const { data: validatedDocs } = await ctx.supabase
    .from('documents_chantier')
    .select('id')
    .eq('chantier_id', chantierId)
    .in('devis_statut', ['valide', 'attente_facture']);

  const validatedDevisIds = (validatedDocs ?? []).map(d => d.id);

  let query = ctx.supabase
    .from('payment_events')
    .select('*')
    .eq('project_id', chantierId)
    .order('due_date', { ascending: true, nullsFirst: false });

  if (!includeOverride) {
    query = query.eq('is_override', false);
  }

  const { data: allEvents, error } = await query;

  if (error) {
    console.error('[api/payment-events] GET error:', error.message);
    return jsonError('Erreur chargement events', 500);
  }

  // Filtrer : garder les factures (toujours) + les devis validés seulement
  const data = (allEvents ?? []).filter(e => {
    if (e.source_type === 'facture') return true;
    if (e.source_type === 'devis') return validatedDevisIds.includes(e.source_id);
    return true; // autres types (dépenses rapides, etc.)
  });

  // Enrichir avec nom du document source + nom du lot + nom de l'artisan
  const sourceIds = (data ?? []).map(e => e.source_id).filter(Boolean);
  const eventIds = (data ?? []).map(e => e.id);

  // Phase 2: docs + proofDocs in parallel (both depend only on events data)
  const [docsRes, proofDocsRes] = await Promise.all([
    sourceIds.length > 0
      ? ctx.supabase
          .from('documents_chantier')
          .select('id, nom, nom_fichier, analyse_id, lots_chantier(nom)')
          .in('id', sourceIds)
      : Promise.resolve({ data: [] as any[] }),
    eventIds.length > 0
      ? ctx.supabase
          .from('documents_chantier')
          .select('id, nom, nom_fichier, analyse_id, bucket_path')
          .eq('chantier_id', chantierId)
          .eq('document_type', 'preuve_paiement')
          .in('analyse_id', eventIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  let docMap: Record<string, { nom: string | null; nom_fichier: string | null; lot_nom: string | null; analyse_id: string | null }> = {};
  for (const d of docsRes.data ?? []) {
    docMap[d.id] = {
      nom:        d.nom ?? null,
      nom_fichier: d.nom_fichier ?? null,
      lot_nom:    (d.lots_chantier as any)?.nom ?? null,
      analyse_id: d.analyse_id ?? null,
    };
  }

  let proofMap: Record<string, { id: string; nom: string | null; bucket_path: string | null }> = {};
  for (const pd of proofDocsRes.data ?? []) {
    if (pd.analyse_id) {
      proofMap[pd.analyse_id] = {
        id:          pd.id,
        nom:         pd.nom ?? pd.nom_fichier ?? null,
        bucket_path: pd.bucket_path ?? null,
      };
    }
  }

  // Phase 3: devis (needs docMap) + signed URLs (need proofMap) in parallel
  const analyseIds = Object.values(docMap).map(d => d.analyse_id).filter(Boolean) as string[];
  const BUCKET   = 'chantier-documents';
  const SIGN_TTL = 3600;

  const proofEntries = Object.entries(proofMap).filter(
    ([, p]) => p.bucket_path && !p.bucket_path.startsWith('analyse/')
  );

  const [devisRes, signedEntries] = await Promise.all([
    analyseIds.length > 0
      ? ctx.supabase
          .from('devis_chantier')
          .select('analyse_id, artisan_nom')
          .in('analyse_id', analyseIds)
      : Promise.resolve({ data: [] as any[] }),
    Promise.all(
      proofEntries.map(async ([evId, proof]) => {
        const { data: s } = await ctx.supabase.storage
          .from(BUCKET).createSignedUrl(proof.bucket_path!, SIGN_TTL);
        return [evId, s?.signedUrl ?? null] as const;
      })
    ),
  ]);

  let artisanMap: Record<string, string> = {}; // analyse_id → artisan_nom
  for (const d of devisRes.data ?? []) {
    if (d.analyse_id) artisanMap[d.analyse_id] = d.artisan_nom;
  }

  // Build proofUrlMap: null by default, overwritten for entries with signed URLs
  const proofUrlMap: Record<string, string | null> = {};
  for (const evId of Object.keys(proofMap)) {
    proofUrlMap[evId] = null;
  }
  for (const [evId, url] of signedEntries) {
    proofUrlMap[evId] = url;
  }

  const enriched = (data ?? []).map(e => {
    const doc = docMap[e.source_id];
    const analyseId = doc?.analyse_id ?? null;
    const proof = proofMap[e.id];
    return {
      ...e,
      source_name:      doc?.nom ?? doc?.nom_fichier ?? null,
      lot_nom:          doc?.lot_nom ?? null,
      artisan_nom:      analyseId ? artisanMap[analyseId] ?? null : null,
      proof_doc_id:     proof?.id ?? null,
      proof_doc_name:   proof?.nom ?? null,
      proof_signed_url: proof ? (proofUrlMap[e.id] ?? null) : null,
    };
  });

  return jsonOk({ payment_events: enriched });
};

// ── POST /api/chantier/[id]/payment-events ────────────────────────────────────
// Déclenche manuellement la génération de payment_events depuis une analyse.
//
// Body: {
//   analyseId:        string   — ID de l'analyse complète
//   sourceType:       'devis' | 'facture'
//   sourceId:         string   — ID du document/devis source
//   originalDevisId?: string   — fourni si sourceType = 'facture' (override)
// }

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

  // ── Dépense manuelle (source_type = 'manuel') ──────────────────────────────
  if (body.manuel === true) {
    const label   = typeof body.label   === 'string' && body.label.trim()   ? body.label.trim()   : null;
    const amount  = typeof body.amount  === 'number' && body.amount  > 0    ? body.amount         : null;
    const dueDate = typeof body.dueDate === 'string' && body.dueDate        ? body.dueDate        : null;

    if (!label) return jsonError('Le motif est requis', 400);

    const { data: ev, error } = await ctx.supabase
      .from('payment_events')
      .insert({
        project_id:  chantierId,
        source_type: 'manuel',
        source_id:   null,
        label,
        amount,
        due_date:    dueDate,
        status:      'pending',
        is_override: false,
      })
      .select()
      .single();

    if (error || !ev) {
      console.error('[payment-events] manuel insert error:', error?.message);
      return jsonError('Erreur lors de la création', 500);
    }

    ctx.supabase.from('agent_context_cache')
      .update({ invalidated: true }).eq('chantier_id', chantierId)
      .then(() => {}).catch(() => {});

    return jsonOk({ payment_events: [ev], message: 'Dépense créée' }, 201);
  }

  // ── Génération depuis une analyse ───────────────────────────────────────────
  const analyseId       = typeof body.analyseId === 'string'       ? body.analyseId       : null;
  const sourceType      = body.sourceType === 'facture'            ? 'facture' : 'devis';
  const sourceId        = typeof body.sourceId === 'string'        ? body.sourceId        : null;
  const originalDevisId = typeof body.originalDevisId === 'string' ? body.originalDevisId : undefined;

  if (!analyseId || !sourceId) {
    return jsonError('analyseId et sourceId sont requis', 400);
  }

  // Génération (non bloquante en interne, mais on attend la fin pour retourner le résultat)
  await generatePaymentEventsFromAnalyse(
    ctx.supabase,
    analyseId,
    chantierId,
    sourceType,
    sourceId,
    originalDevisId,
  );

  // Retourne les events fraîchement insérés
  const { data } = await ctx.supabase
    .from('payment_events')
    .select('*')
    .eq('project_id', chantierId)
    .eq('source_id', sourceId)
    .order('due_date', { ascending: true });

  // Invalidate agent context cache (new payment events = stale context)
  ctx.supabase.from('agent_context_cache')
    .update({ invalidated: true }).eq('chantier_id', chantierId)
    .then(() => {}).catch(() => {});

  return jsonOk({ payment_events: data ?? [], message: 'Timeline générée' }, 201);
};

// ── PATCH /api/chantier/[id]/payment-events ───────────────────────────────────
// Modifie le statut d'un payment_event (paid ↔ pending).
// Body: { id: string; status: 'paid' | 'pending' }

export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps invalide', 400); }

  const id     = typeof body.id === 'string' ? body.id : null;
  const status = body.status === 'paid' ? 'paid' : body.status === 'pending' ? 'pending' : null;
  const amount = typeof body.amount === 'number' && body.amount > 0 ? body.amount : undefined;

  if (!id || !status) {
    return jsonError('id et status (paid|pending) requis', 400);
  }

  // Étape 1 : vérifier que l'event appartient bien à ce chantier (SELECT séparé)
  const { data: existing, error: selectErr } = await ctx.supabase
    .from('payment_events')
    .select('id, project_id')
    .eq('id', id)
    .maybeSingle();

  if (selectErr) {
    console.error('[api/payment-events] PATCH select error:', selectErr.message);
    return jsonError(selectErr.message, 500);
  }
  if (!existing) {
    console.error('[api/payment-events] PATCH event introuvable — id:', id);
    return jsonError('Événement introuvable', 404);
  }
  if (existing.project_id !== chantierId) {
    console.error('[api/payment-events] PATCH project_id mismatch — event.project_id:', existing.project_id, '| chantierId:', chantierId);
    return jsonError('Non autorisé', 403);
  }

  // Étape 2 : UPDATE par id uniquement — sans .select() (évite instabilité Supabase v2 service role)
  const updatePayload: Record<string, unknown> = { status };
  if (amount !== undefined) updatePayload.amount = amount;

  const { error } = await ctx.supabase
    .from('payment_events')
    .update(updatePayload)
    .eq('id', id);

  if (error) {
    console.error('[api/payment-events] PATCH update error:', error.message);
    return jsonError(error.message, 500);
  }

  return jsonOk({ ok: true, status });
};

export const OPTIONS: APIRoute = () => optionsResponse();
