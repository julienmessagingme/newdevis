export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

const BUCKET_CHANTIER = 'chantier-documents';
const BUCKET_DEVIS    = 'devis';

// ── POST /api/chantier/[id]/documents/[docId]/analyser ───────────────────────
//
// Copie le fichier devis depuis chantier-documents vers le bucket devis,
// crée un enregistrement analyses standard, lie documents_chantier.analyse_id,
// puis déclenche la pipeline analyze-quote (fire-and-forget).
//
// Rollback séquentiel :
//   - copie échoue               → 500 (rien créé)
//   - INSERT analyses échoue     → supprime copie + 500
//   - PATCH analyse_id échoue    → supprime copie + supprime analyse + 500
//   - invoke échoue              → log seulement (analyse créée + liée, AnalysisResult gère le timeout)
//
// Idempotence :
//   - doc.analyse_id déjà défini → 409 + analysisId existant (anti-double clic)

export const POST: APIRoute = async ({ params, request }) => {
  // ── [1] Authentification + ownership ────────────────────────────────────────
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const { id: chantierId, docId } = params;

  // ── [2] Ownership + chargement document ─────────────────────────────────────
  const { data: doc } = await ctx.supabase
    .from('documents_chantier').select('*')
    .eq('id', docId!).eq('chantier_id', chantierId!).single();
  if (!doc) return jsonError('Document introuvable', 404);

  // ── [3] Type devis obligatoire ──────────────────────────────────────────────
  if (doc.document_type !== 'devis') {
    return jsonError('Ce document n\'est pas un devis', 400);
  }

  // ── [4] Idempotence — analyse déjà lancée ───────────────────────────────────
  if (doc.analyse_id) {
    return jsonOk({ analysisId: doc.analyse_id }, 409);
  }

  // ── [5.5] Vérification bucket_path utilisable ────────────────────────────────
  if (!doc.bucket_path || doc.bucket_path.startsWith('analyse/')) {
    return jsonError('Ce document n\'a pas de fichier source uploadé — impossible de lancer l\'analyse', 400);
  }

  // ── [6] Téléchargement depuis chantier-documents ────────────────────────────
  const { data: fileData, error: downloadErr } = await ctx.supabase.storage
    .from(BUCKET_CHANTIER).download(doc.bucket_path);
  if (downloadErr || !fileData) {
    console.error('[api/analyser] download error:', downloadErr?.message, '| bucket_path:', doc.bucket_path);
    return jsonError(`Fichier source inaccessible : ${downloadErr?.message ?? 'introuvable'}`, 500);
  }

  // ── [6] Copie vers bucket devis ─────────────────────────────────────────────
  // Chemin : {userId}/{timestamp}-chantier.{ext}  — cohérent avec NewAnalysis.tsx
  const ext       = doc.nom_fichier.includes('.')
    ? `.${doc.nom_fichier.split('.').pop()!.toLowerCase()}`
    : '';
  const devisPath = `${ctx.user.id}/${Date.now()}-chantier${ext}`;

  const { error: uploadErr } = await ctx.supabase.storage
    .from(BUCKET_DEVIS).upload(devisPath, fileData, {
      contentType: doc.mime_type ?? 'application/octet-stream',
      upsert: false,
    });
  if (uploadErr) {
    console.error('[api/analyser] upload to devis error:', uploadErr.message);
    return jsonError('Erreur lors de la copie du fichier', 500);
  }

  // ── [7] INSERT analyses ─────────────────────────────────────────────────────
  const { data: analysis, error: insertErr } = await ctx.supabase
    .from('analyses')
    .insert({
      user_id:   ctx.user.id,
      file_name: doc.nom_fichier,
      file_path: devisPath,
      status:    'pending',
      domain:    'travaux',
    })
    .select('id')
    .single();

  if (insertErr || !analysis) {
    console.error('[api/analyser] insert analyses error:', insertErr?.message);
    // Rollback : supprimer le fichier copié
    await ctx.supabase.storage.from(BUCKET_DEVIS).remove([devisPath]);
    return jsonError('Erreur lors de la création de l\'analyse', 500);
  }

  const analysisId = analysis.id as string;

  // ── [8] Liaison documents_chantier.analyse_id ───────────────────────────────
  // Rollback complet si échoue — on doit invoquer l'edge function APRÈS ce PATCH
  // pour garantir que l'état est cohérent avant tout traitement pipeline.
  const { error: patchErr } = await ctx.supabase
    .from('documents_chantier')
    .update({ analyse_id: analysisId })
    .eq('id', docId!)
    .eq('chantier_id', chantierId!);

  if (patchErr) {
    console.error('[api/analyser] PATCH analyse_id error:', patchErr.message);
    // Rollback complet
    await ctx.supabase.from('analyses').delete().eq('id', analysisId);
    await ctx.supabase.storage.from(BUCKET_DEVIS).remove([devisPath]);
    return jsonError('Erreur lors de la liaison du document', 500);
  }

  // ── [9] Déclenchement pipeline (fire-and-forget) ───────────────────────────
  // Pas d'await intentionnel — même pattern que NewAnalysis.tsx.
  // Si invoke throw : log uniquement, l'analyse reste "pending",
  // AnalysisResult.tsx gère le timeout et affiche un état d'erreur.
  ctx.supabase.functions.invoke('analyze-quote', {
    body: { analysisId, skipN8N: false },
  }).catch((e: unknown) => {
    console.error('[api/analyser] invoke error:', e instanceof Error ? e.message : String(e));
  });

  return jsonOk({ analysisId });
};

export const OPTIONS: APIRoute = () => optionsResponse();
