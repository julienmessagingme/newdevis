export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_CHANTIER = 'chantier-documents';
const BUCKET_DEVIS    = 'devis';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function makeClient() {
  return createClient(supabaseUrl, supabaseService);
}

async function authenticate(request: Request) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const supabase = makeClient();
  const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
  return user ? { user, supabase } : null;
}

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
  // ── [1] Authentification ────────────────────────────────────────────────────
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const { id: chantierId, docId } = params;

  // ── [2] Ownership chantier ──────────────────────────────────────────────────
  const { data: chantier } = await ctx.supabase
    .from('chantiers').select('id')
    .eq('id', chantierId!).eq('user_id', ctx.user.id).single();
  if (!chantier) return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });

  // ── [3] Ownership + chargement document ─────────────────────────────────────
  const { data: doc } = await ctx.supabase
    .from('documents_chantier').select('*')
    .eq('id', docId!).eq('chantier_id', chantierId!).single();
  if (!doc) return new Response(JSON.stringify({ error: 'Document introuvable' }), { status: 404, headers: CORS });

  // ── [4] Type devis obligatoire ──────────────────────────────────────────────
  if (doc.document_type !== 'devis') {
    return new Response(
      JSON.stringify({ error: 'Ce document n\'est pas un devis' }),
      { status: 400, headers: CORS },
    );
  }

  // ── [5] Idempotence — analyse déjà lancée ───────────────────────────────────
  if (doc.analyse_id) {
    return new Response(
      JSON.stringify({ analysisId: doc.analyse_id }),
      { status: 409, headers: CORS },
    );
  }

  // ── [6] Téléchargement depuis chantier-documents ────────────────────────────
  const { data: fileData, error: downloadErr } = await ctx.supabase.storage
    .from(BUCKET_CHANTIER).download(doc.bucket_path);
  if (downloadErr || !fileData) {
    console.error('[api/analyser] download error:', downloadErr?.message);
    return new Response(
      JSON.stringify({ error: 'Impossible de lire le fichier source' }),
      { status: 500, headers: CORS },
    );
  }

  // ── [7] Copie vers bucket devis ─────────────────────────────────────────────
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
    return new Response(
      JSON.stringify({ error: 'Erreur lors de la copie du fichier' }),
      { status: 500, headers: CORS },
    );
  }

  // ── [8] INSERT analyses ─────────────────────────────────────────────────────
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
    return new Response(
      JSON.stringify({ error: 'Erreur lors de la création de l\'analyse' }),
      { status: 500, headers: CORS },
    );
  }

  const analysisId = analysis.id as string;

  // ── [9] Liaison documents_chantier.analyse_id ───────────────────────────────
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
    return new Response(
      JSON.stringify({ error: 'Erreur lors de la liaison du document' }),
      { status: 500, headers: CORS },
    );
  }

  // ── [10] Déclenchement pipeline (fire-and-forget) ───────────────────────────
  // Pas d'await intentionnel — même pattern que NewAnalysis.tsx.
  // Si invoke throw : log uniquement, l'analyse reste "pending",
  // AnalysisResult.tsx gère le timeout et affiche un état d'erreur.
  ctx.supabase.functions.invoke('analyze-quote', {
    body: { analysisId, skipN8N: false },
  }).catch((e: unknown) => {
    console.error('[api/analyser] invoke error:', e instanceof Error ? e.message : String(e));
  });

  return new Response(JSON.stringify({ analysisId }), { status: 200, headers: CORS });
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS' } });
