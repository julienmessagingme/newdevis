export const prerender = false;

import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { generatePaymentEventsFromAnalyse } from '@/lib/paymentEvents';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth, requireChantierAuthOrAgent } from '@/lib/apiHelpers';

// ── GET /api/chantier/[id]/payment-events ─────────────────────────────────────
// Retourne tous les payment_events_v du chantier, triés par due_date ASC.
// Lit la VIEW (UNION cashflow_terms + cashflow_extras + frais auto-paid).

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  // Récupérer les IDs des devis validés pour filtrer les payment_events
  // On n'inclut que les events issus de devis validés (ou d'attente_facture) et de factures.
  // Les devis en cours / non retenus ne doivent pas apparaître dans l'échéancier.
  const { data: validatedDocs } = await ctx.supabase
    .from('documents_chantier')
    .select('id')
    .eq('chantier_id', chantierId)
    .in('devis_statut', ['valide', 'attente_facture']);

  const validatedDevisIds = (validatedDocs ?? []).map(d => d.id);

  const { data: allEvents, error } = await ctx.supabase
    .from('payment_events_v')
    .select('*')
    .eq('project_id', chantierId)
    .order('due_date', { ascending: true, nullsFirst: false });

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
          .select('id, nom, nom_fichier, analyse_id, montant, lots_chantier(nom)')
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

  let docMap: Record<string, { nom: string | null; nom_fichier: string | null; lot_nom: string | null; analyse_id: string | null; montant: number | null }> = {};
  for (const d of docsRes.data ?? []) {
    docMap[d.id] = {
      nom:        d.nom ?? null,
      nom_fichier: d.nom_fichier ?? null,
      lot_nom:    (d.lots_chantier as any)?.nom ?? null,
      analyse_id: d.analyse_id ?? null,
      montant:    typeof d.montant === 'number' ? d.montant : null,
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

  // Pré-calcul du solde estimé pour les events sans montant :
  // Pour chaque source_id, on calcule la somme des montants déjà alloués
  // aux autres échéances (non annulées). Le solde = doc.montant - somme_acomptes.
  const allocatedBySource: Record<string, number> = {};
  for (const e of data ?? []) {
    if (e.source_id && e.amount != null && e.status !== 'cancelled') {
      allocatedBySource[e.source_id] = (allocatedBySource[e.source_id] ?? 0) + Number(e.amount);
    }
  }

  const enriched = (data ?? []).map(e => {
    const doc = docMap[e.source_id];
    const analyseId = doc?.analyse_id ?? null;
    const proof = proofMap[e.id];

    // Solde estimé : uniquement si amount est null ET le doc a un montant total
    let amount_estimate: number | null = null;
    if (e.amount == null && e.source_id && doc?.montant != null) {
      const allocated = allocatedBySource[e.source_id] ?? 0;
      const remaining = doc.montant - allocated;
      if (remaining > 0) amount_estimate = Math.round(remaining * 100) / 100;
    }

    return {
      ...e,
      source_name:      doc?.nom ?? doc?.nom_fichier ?? null,
      lot_nom:          doc?.lot_nom ?? null,
      artisan_nom:      analyseId ? artisanMap[analyseId] ?? null : null,
      proof_doc_id:     proof?.id ?? null,
      proof_doc_name:   proof?.nom ?? null,
      proof_signed_url: proof ? (proofUrlMap[e.id] ?? null) : null,
      amount_estimate,
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
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
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
    if (amount === null) return jsonError('Le montant est requis (> 0)', 400);

    const paid = body.paid === true;
    const status = paid ? 'paid' : 'pending';
    const finalDueDate = dueDate ?? (paid ? new Date().toISOString().slice(0, 10) : null);

    if (!finalDueDate) return jsonError('La date d\'échéance est requise', 400);

    // PR4 : écriture cashflow_extras uniquement (legacy retirée)
    const newId = randomUUID();
    const { data: extra, error } = await ctx.supabase
      .from('cashflow_extras')
      .insert({
        id:         newId,
        project_id: chantierId,
        label,
        amount,
        due_date:   finalDueDate,
        status,
      })
      .select()
      .single();

    if (error || !extra) {
      console.error('[payment-events] manuel insert error:', error?.message);
      return jsonError('Erreur lors de la création', 500);
    }

    // Re-fetch depuis la VIEW pour cohérence avec GET (même shape)
    const { data: viewRow } = await ctx.supabase
      .from('payment_events_v')
      .select('*')
      .eq('id', newId)
      .maybeSingle();

    return jsonOk({ payment_events: viewRow ? [viewRow] : [], message: 'Dépense créée' }, 201);
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

  // Retourne les events fraîchement insérés (depuis la VIEW pour cohérence avec GET)
  const { data } = await ctx.supabase
    .from('payment_events_v')
    .select('*')
    .eq('project_id', chantierId)
    .eq('source_id', sourceId)
    .order('due_date', { ascending: true });

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

  const id                = typeof body.id === 'string' ? body.id : null;
  const status            = body.status === 'paid' ? 'paid' : body.status === 'pending' ? 'pending' : null;
  const amount            = typeof body.amount === 'number' && body.amount > 0 ? body.amount : undefined;
  const due_date          = typeof body.due_date === 'string' && body.due_date ? body.due_date : undefined;
  const label             = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : undefined;
  const funding_source_id = body.funding_source_id === null
    ? null
    : typeof body.funding_source_id === 'string' ? body.funding_source_id : undefined;

  if (!id || (!status && due_date === undefined && label === undefined && amount === undefined && funding_source_id === undefined)) {
    return jsonError('id requis + au moins un champ à modifier', 400);
  }

  // Étape 1 : ownership + récupérer données depuis la VIEW (single source of truth
  // pour origin='document'|'extra' qui détermine où propager la mise à jour).
  const { data: viewEvent, error: vErr } = await ctx.supabase
    .from('payment_events_v')
    .select('id, project_id, amount, label, source_id, source_type, due_date, term_index, origin')
    .eq('id', id)
    .maybeSingle();

  if (vErr) {
    console.error('[api/payment-events] PATCH select error:', vErr.message);
    return jsonError(vErr.message, 500);
  }
  if (!viewEvent) {
    return jsonError('Événement introuvable', 404);
  }
  if (viewEvent.project_id !== chantierId) {
    return jsonError('Non autorisé', 403);
  }

  // Frais auto-paid : pas de modification possible (dérivés de documents_chantier).
  // Le user doit modifier le doc parent (montant, depense_type) pour changer l'event.
  if (viewEvent.source_type === 'frais') {
    return jsonError(
      'Cet événement est dérivé d\'un frais/ticket — modifier le document source pour changer le montant ou la date',
      422,
    );
  }

  // UPDATE sur le nouveau chemin (cashflow_extras OU cashflow_terms).
  const newPathPatch: Record<string, unknown> = {};
  if (status) newPathPatch.status = status;
  if (amount !== undefined) newPathPatch.amount = amount;
  if (due_date !== undefined) newPathPatch.due_date = due_date;
  if (label !== undefined) newPathPatch.label = label;
  if (funding_source_id !== undefined) newPathPatch.funding_source_id = funding_source_id;

  if (viewEvent.origin === 'extra') {
    const { error: extraErr } = await ctx.supabase
      .from('cashflow_extras')
      .update(newPathPatch)
      .eq('id', id);
    if (extraErr) {
      console.error('[api/payment-events] PATCH cashflow_extras error:', extraErr.message);
      return jsonError(extraErr.message, 500);
    }
  } else if (viewEvent.origin === 'document' && viewEvent.source_id != null) {
    const { data: doc } = await ctx.supabase
      .from('documents_chantier')
      .select('cashflow_terms')
      .eq('id', viewEvent.source_id)
      .maybeSingle();

    if (!doc?.cashflow_terms || !Array.isArray(doc.cashflow_terms)) {
      return jsonError('Document source introuvable ou cashflow_terms invalide', 500);
    }

    const updatedTerms = (doc.cashflow_terms as Array<Record<string, unknown>>).map(t =>
      t.event_id === id ? { ...t, ...newPathPatch } : t
    );
    const { error: termErr } = await ctx.supabase
      .from('documents_chantier')
      .update({ cashflow_terms: updatedTerms })
      .eq('id', viewEvent.source_id);
    if (termErr) {
      console.error('[api/payment-events] PATCH cashflow_terms error:', termErr.message);
      return jsonError(termErr.message, 500);
    }
  }

  // Étape 3 : paiement partiel → créer/mettre à jour l'event "Solde restant"
  // (cohérence Budget ↔ Échéancier). Propagation simultanée dans cashflow_terms.
  const plannedAmount = viewEvent.amount != null ? Number(viewEvent.amount) : null;
  const isPartialPayment =
    status === 'paid' &&
    amount !== undefined &&
    plannedAmount !== null &&
    amount < plannedAmount * 0.99 &&
    viewEvent.source_id &&
    viewEvent.source_type === 'devis';

  if (isPartialPayment) {
    const remaining = Math.round((plannedAmount! - amount!) * 100) / 100;

    // PR4 : "Solde restant" géré uniquement via cashflow_terms (legacy retirée).
    const { data: doc } = await ctx.supabase
      .from('documents_chantier')
      .select('cashflow_terms')
      .eq('id', viewEvent.source_id!)
      .maybeSingle();

    if (doc?.cashflow_terms && Array.isArray(doc.cashflow_terms)) {
      const terms = doc.cashflow_terms as Array<Record<string, unknown>>;
      const remainderLabelPrefix = 'Solde restant';
      const existingRemainderIdx = terms.findIndex(t =>
        typeof t.label === 'string' && t.label.includes(remainderLabelPrefix)
      );

      if (existingRemainderIdx === -1) {
        // Créer un nouveau term Solde restant
        const newTerm = {
          event_id: randomUUID(),
          amount:   remaining,
          due_date: null,
          status:   'pending',
          label:    `${remainderLabelPrefix} — ${viewEvent.label ?? 'paiement'}`,
        };
        await ctx.supabase
          .from('documents_chantier')
          .update({ cashflow_terms: [...terms, newTerm] })
          .eq('id', viewEvent.source_id!);
      } else {
        // Mettre à jour le montant du term Solde restant existant
        const updated = terms.map((t, i) =>
          i === existingRemainderIdx ? { ...t, amount: remaining } : t
        );
        await ctx.supabase
          .from('documents_chantier')
          .update({ cashflow_terms: updated })
          .eq('id', viewEvent.source_id!);
      }
    }
  }

  // Étape 4 : si on remet en pending, supprimer le term "Solde restant" associé
  if (status === 'pending' && viewEvent.origin === 'document' && viewEvent.source_id) {
    const { data: doc } = await ctx.supabase
      .from('documents_chantier')
      .select('cashflow_terms')
      .eq('id', viewEvent.source_id)
      .maybeSingle();
    if (doc?.cashflow_terms && Array.isArray(doc.cashflow_terms)) {
      const filtered = (doc.cashflow_terms as Array<Record<string, unknown>>).filter(t =>
        !(typeof t.label === 'string' && t.label.includes('Solde restant'))
      );
      if (filtered.length !== (doc.cashflow_terms as unknown[]).length) {
        await ctx.supabase
          .from('documents_chantier')
          .update({ cashflow_terms: filtered })
          .eq('id', viewEvent.source_id);
      }
    }
  }

  return jsonOk({ ok: true, status, remaining_created: isPartialPayment });
};

// ── DELETE /api/chantier/[id]/payment-events ──────────────────────────────────
// Supprime un payment_event manuel.
// Body: { id: string }

export const DELETE: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps invalide', 400); }

  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return jsonError('id requis', 400);

  // Lookup VIEW pour déterminer où propager la suppression
  const { data: viewEvent } = await ctx.supabase
    .from('payment_events_v')
    .select('id, project_id, source_id, source_type, origin')
    .eq('id', id)
    .maybeSingle();

  if (!viewEvent) return jsonError('Événement introuvable', 404);
  if (viewEvent.project_id !== chantierId) return jsonError('Non autorisé', 403);

  // Frais : non supprimable directement (dérivé du document)
  if (viewEvent.source_type === 'frais') {
    return jsonError(
      'Cet événement est dérivé d\'un frais — supprimer le document source pour le retirer',
      422,
    );
  }

  // PR4 : suppression uniquement sur le nouveau chemin (legacy retirée)
  if (viewEvent.origin === 'extra') {
    const { error: extraErr } = await ctx.supabase
      .from('cashflow_extras')
      .delete()
      .eq('id', id);
    if (extraErr) {
      console.error('[api/payment-events] DELETE cashflow_extras error:', extraErr.message);
      return jsonError(extraErr.message, 500);
    }
  } else if (viewEvent.origin === 'document' && viewEvent.source_id != null) {
    const { data: doc } = await ctx.supabase
      .from('documents_chantier')
      .select('cashflow_terms')
      .eq('id', viewEvent.source_id)
      .maybeSingle();
    if (doc?.cashflow_terms && Array.isArray(doc.cashflow_terms)) {
      const filtered = (doc.cashflow_terms as Array<Record<string, unknown>>).filter(t =>
        t.event_id !== id
      );
      const { error: termErr } = await ctx.supabase
        .from('documents_chantier')
        .update({ cashflow_terms: filtered })
        .eq('id', viewEvent.source_id);
      if (termErr) {
        console.error('[api/payment-events] DELETE cashflow_terms error:', termErr.message);
        return jsonError(termErr.message, 500);
      }
    }
  }

  return jsonOk({ ok: true });
};

export const OPTIONS: APIRoute = () => optionsResponse();
