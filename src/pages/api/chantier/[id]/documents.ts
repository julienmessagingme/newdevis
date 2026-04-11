export const prerender = false;

import type { APIRoute } from 'astro';
import type { DocumentType } from '@/types/chantier-ia';
import { generatePaymentEventsFromAnalyse } from '@/lib/paymentEvents';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth, createServiceClient } from '@/lib/apiHelpers';

const BUCKET          = 'chantier-documents';
const MAX_BYTES       = 10 * 1024 * 1024; // 10 Mo — cohérent avec bucket file_size_limit
const SIGNED_TTL      = 3_600;            // 1h

const VALID_TYPES = new Set<DocumentType>([
  'devis', 'facture', 'photo', 'plan', 'autorisation', 'assurance', 'autre', 'preuve_paiement',
]);

// ── GET /api/chantier/[id]/documents ────────────────────────────────────────
// Liste les documents du chantier avec URL signées (TTL 1h).

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  const { data: docs, error } = await ctx.supabase
    .from('documents_chantier')
    .select('*')
    .eq('chantier_id', chantierId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[api/documents] GET error:', error.message);
    return jsonError('Erreur chargement documents', 500);
  }

  // Génération des URLs signées en batch (skip pour les imports VerifierMonDevis)
  const enriched = await Promise.all(
    (docs ?? []).map(async (doc) => {
      if (!doc.bucket_path || doc.bucket_path.startsWith('analyse/') || doc.source === 'verifier_mon_devis')
        return { ...doc, signedUrl: null };
      const { data: s } = await ctx.supabase.storage
        .from(BUCKET).createSignedUrl(doc.bucket_path, SIGNED_TTL);
      return { ...doc, signedUrl: s?.signedUrl ?? null };
    }),
  );

  return jsonOk({ documents: enriched });
};

// ── POST /api/chantier/[id]/documents ───────────────────────────────────────
// Upload serveur : reçoit le fichier via FormData, le pousse dans Supabase Storage
// avec la service_role_key (bypass RLS), puis enregistre les métadonnées en DB.
// Plus de dépendance à la RLS storage côté client.

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const { supabase, user } = ctx;
  const chantierId = params.id!;

  // ── Parse multipart/form-data ─────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError('Corps de requête invalide', 400);
  }

  const file           = formData.get('file') as File | null;
  const nom            = (formData.get('nom') as string | null)?.trim() ?? '';
  const documentType   = (formData.get('documentType') as DocumentType | null) ?? 'autre';
  const lotIdRaw       = (formData.get('lotId') as string | null) || null;
  const source         = (formData.get('source') as string | null) ?? 'manual_upload';
  const analyseId      = (formData.get('analyseId') as string | null) || null;
  // Pour les justificatifs : l'ID du payment_event est stocké dans analyse_id
  const paymentEventId = (formData.get('paymentEventId') as string | null) || null;

  // ── Import depuis VerifierMonDevis (pas de fichier) ───────────────────────
  if (source === 'verifier_mon_devis' && analyseId) {
    // Vérifier que l'analyse appartient à l'utilisateur
    const { data: analyse } = await supabase
      .from('analyses').select('id')
      .eq('id', analyseId).eq('user_id', user.id).single();
    if (!analyse)
      return jsonError('Analyse introuvable', 404);

    // Idempotence : si ce document VMD a déjà été importé dans ce chantier, retourner l'existant
    const { data: existing } = await supabase
      .from('documents_chantier')
      .select('*')
      .eq('chantier_id', chantierId)
      .eq('analyse_id', analyseId)
      .eq('source', 'verifier_mon_devis')
      .maybeSingle();
    if (existing) {
      return jsonOk({ document: { ...existing, signedUrl: null } });
    }

    // Validation lot
    let lotIdImport: string | null = lotIdRaw;
    if (lotIdImport) {
      const { data: lot } = await supabase
        .from('lots_chantier').select('id')
        .eq('id', lotIdImport).eq('chantier_id', chantierId).single();
      if (!lot) lotIdImport = null;
    }

    const { data: doc, error: insertError } = await supabase
      .from('documents_chantier')
      .insert({
        chantier_id:   chantierId,
        lot_id:        lotIdImport,
        type:          'devis',
        document_type: 'devis',
        source:        'verifier_mon_devis',
        nom:           nom || `Analyse importée`,
        nom_fichier:   '',
        bucket_path:   `analyse/${chantierId}/${analyseId}`,   // placeholder non-storage (chantier-scoped pour éviter duplicate key)
        taille_octets: null,
        mime_type:     null,
        analyse_id:    analyseId,
      })
      .select()
      .single();

    if (insertError || !doc) {
      console.error('[api/documents] import insert error:', insertError?.message);
      return jsonError(`Erreur DB : ${insertError?.message ?? 'insert failed'}`, 500);
    }

    // ── Génération payment_events (fire-and-forget) ───────────────────────
    const sourceType = documentType === 'facture' ? 'facture' : 'devis';
    generatePaymentEventsFromAnalyse(supabase, analyseId, chantierId, sourceType, doc.id)
      .catch((e: unknown) => {
        console.error('[api/documents] paymentEvents error:', e instanceof Error ? e.message : e);
      });

    // ── Auto-création / mise à jour du contact avec téléphone + email ────────
    // On récupère les données extraites de l'analyse pour peupler le contact
    supabase
      .from('analyses')
      .select('raw_text')
      .eq('id', analyseId)
      .single()
      .then(({ data: analyseRow }) => {
        if (!analyseRow?.raw_text) return;
        const raw   = analyseRow.raw_text as Record<string, unknown>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ent   = (raw as any)?.extracted?.entreprise as Record<string, unknown> | undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nomOfficiel = (raw as any)?.verified?.nom_officiel as string | undefined;
        if (!ent?.nom && !nomOfficiel) return;
        const contactNom  = nomOfficiel || (ent?.nom as string);
        const siret       = (ent?.siret as string | undefined) || null;
        const email       = (ent?.email as string | undefined) || null;
        const telephone   = (ent?.telephone as string | undefined) || null;
        // Upsert sur SIRET si dispo, sinon insert
        // On inclut analyse_id pour permettre l'enrichissement ultérieur côté frontend
        const baseData = {
          chantier_id: chantierId,
          user_id:     user.id,
          nom:         contactNom,
          siret,
          role:        'artisan',
          source:      'devis',
          analyse_id:  analyseId,
          notes:       `Importé depuis VerifierMonDevis (analyse ${analyseId})`,
        };
        if (siret) {
          // Chercher si un contact existe déjà pour ce SIRET sur ce chantier
          supabase.from('contacts_chantier')
            .select('id, email, telephone')
            .eq('chantier_id', chantierId).eq('siret', siret).maybeSingle()
            .then(({ data: existing }) => {
              if (existing) {
                // Ne mettre à jour email/téléphone que s'ils sont vides sur le contact existant
                const patch: Record<string, unknown> = { nom: contactNom, analyse_id: analyseId };
                if (!existing.email && email)         patch.email     = email;
                if (!existing.telephone && telephone) patch.telephone = telephone;
                supabase.from('contacts_chantier').update(patch).eq('id', existing.id)
                  .then(({ error: e }) => { if (e) console.error('[api/documents] contact update:', e.message); });
              } else {
                supabase.from('contacts_chantier')
                  .insert({ ...baseData, email, telephone })
                  .then(({ error: e }) => { if (e) console.error('[api/documents] contact insert (siret):', e.message); });
              }
            })
            .catch(() => {});
        } else {
          // Sans SIRET : insert si pas déjà un contact avec ce nom sur ce chantier
          supabase.from('contacts_chantier')
            .select('id, email, telephone')
            .eq('chantier_id', chantierId).ilike('nom', contactNom).maybeSingle()
            .then(({ data: existing }) => {
              if (existing) {
                const patch: Record<string, unknown> = { analyse_id: analyseId };
                if (!existing.email && email)         patch.email     = email;
                if (!existing.telephone && telephone) patch.telephone = telephone;
                if (Object.keys(patch).length > 1) {
                  supabase.from('contacts_chantier').update(patch).eq('id', existing.id)
                    .then(({ error: e }) => { if (e) console.error('[api/documents] contact update (name):', e.message); });
                }
              } else {
                supabase.from('contacts_chantier')
                  .insert({ ...baseData, email, telephone })
                  .then(({ error: e }) => { if (e) console.error('[api/documents] contact insert (nosiret):', e.message); });
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {/* non-bloquant */});

    return jsonOk({ document: { ...doc, signedUrl: null } }, 201);
  }

  if (!file || !(file instanceof File))
    return jsonError('Fichier manquant', 400);
  if (!nom)
    return jsonError('Nom du document requis', 400);
  if (!VALID_TYPES.has(documentType))
    return jsonError('Type de document invalide', 400);
  if (file.size > MAX_BYTES)
    return jsonError('Fichier trop volumineux (max 10 Mo)', 400);

  // ── Construire le chemin storage (user-scoped) ────────────────────────────
  const ext        = file.name.includes('.') ? `.${file.name.split('.').pop()!.toLowerCase()}` : '';
  const uuid       = crypto.randomUUID();
  const bucketPath = `${user.id}/${chantierId}/${uuid}${ext}`;

  // ── Upload vers Supabase Storage via service_role (bypass RLS) ───────────
  const fileBuffer = await file.arrayBuffer();
  // Utiliser byteLength du buffer comme source de vérité (file.size peut valoir 0 côté serveur Node.js)
  const actualSize = fileBuffer.byteLength > 0 ? fileBuffer.byteLength : (file.size > 0 ? file.size : null);

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(bucketPath, fileBuffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (uploadErr) {
    console.error('[api/documents] Storage upload error:', uploadErr.message);
    return jsonError(`Erreur storage : ${uploadErr.message}`, 500);
  }

  // ── Validation lot si fourni ──────────────────────────────────────────────
  let lotId: string | null = lotIdRaw;
  if (lotId) {
    const { data: lot } = await supabase
      .from('lots_chantier').select('id')
      .eq('id', lotId).eq('chantier_id', chantierId).single();
    if (!lot) {
      console.warn('[api/documents] Lot invalide ignoré:', lotId);
      lotId = null;
    }
  }

  // ── Enregistrement métadonnées en DB ──────────────────────────────────────
  // Pour preuve_paiement : type = 'autre' (safe pour contrainte DB), document_type = 'preuve_paiement'
  // analyse_id contient le payment_event_id (convention interne pour le lien justificatif ↔ événement)
  const dbType     = documentType === 'preuve_paiement' ? 'autre' : documentType;
  const dbAnalyseId = documentType === 'preuve_paiement' ? paymentEventId : analyseId;

  const { data: doc, error: insertError } = await supabase
    .from('documents_chantier')
    .insert({
      chantier_id:   chantierId,
      lot_id:        lotId,
      type:          dbType,         // colonne originale NOT NULL
      document_type: documentType,   // colonne ajoutée par migration
      source:        'manual_upload',
      nom,
      nom_fichier:   file.name,
      bucket_path:   bucketPath,
      taille_octets: actualSize,   // null si taille inconnue (évite CHECK taille > 0)
      mime_type:     file.type || null,
      analyse_id:    dbAnalyseId,
    })
    .select()
    .single();

  if (insertError || !doc) {
    // Rollback storage
    await supabase.storage.from(BUCKET).remove([bucketPath]);
    const errMsg = insertError?.message ?? 'insert failed';
    console.error('[api/documents] POST insert error:', errMsg);
    // Retourner le message exact pour faciliter le diagnostic
    return jsonError(`Erreur DB : ${errMsg}`, 500);
  }

  const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(bucketPath, SIGNED_TTL);

  return jsonOk({ document: { ...doc, signedUrl: s?.signedUrl ?? null } }, 201);
};

export const OPTIONS: APIRoute = () => optionsResponse();
