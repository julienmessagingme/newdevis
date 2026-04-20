export const prerender = false;

/**
 * POST /api/chantier/[id]/documents/[docId]/describe
 *
 * Génère automatiquement un titre court via Gemini Vision pour une photo
 * ou un document non-devis. Met à jour documents_chantier.nom en base.
 *
 * Retourne : { nom: string }
 */

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth, createServiceClient } from '@/lib/apiHelpers';
import { detectDevisType } from '@/utils/extractProjectElements';

const GOOGLE_API_KEY  = import.meta.env.GOOGLE_API_KEY;
const BUCKET          = 'chantier-documents';

/** Prompt Gemini selon le type de document (et sous-catégorie pour preuve_paiement) */
function buildPrompt(documentType: string, proofCategory?: string | null): string {
  const base = 'Réponds UNIQUEMENT avec le titre demandé, sans ponctuation finale, sans guillemets, sans explication.';
  switch (documentType) {
    case 'photo':
      return `Tu vois une photo de chantier ou de travaux. Génère un titre court et descriptif en français (5 à 8 mots maximum) qui résume ce que l'on voit : type de travaux, pièce ou espace concerné, état. Exemples : "Fissure mur porteur salon", "Carrelage salle de bain en cours", "Façade avant ravalement". ${base}`;
    case 'plan':
      return `Tu vois un plan de construction ou d'architecture. Génère un titre court en français (5 à 8 mots) décrivant le type de plan et l'espace représenté. ${base}`;
    case 'autorisation':
      return `Tu vois un document administratif ou une autorisation de travaux. Génère un titre court en français (5 à 8 mots) décrivant son contenu. ${base}`;
    case 'assurance':
      return `Tu vois une attestation d'assurance. Génère un titre court en français (5 à 8 mots) : type d'assurance et assureur si visible. ${base}`;
    case 'preuve_paiement': {
      const categoryPrompts: Record<string, string> = {
        virement: `Tu vois un extrait bancaire, un avis de virement ou une confirmation de paiement électronique. Génère un titre court en français (6 à 10 mots) qui précise : banque ou établissement émetteur si visible, date du virement, montant, et nom du bénéficiaire ou de l'entreprise si lisible. Exemples : "Virement BNP 15 jan — 1 250 € — Dupont Électricité", "Avis virement Crédit Agricole — 850 € — Martin Plomberie". ${base}`,
        cheque:   `Tu vois une copie de chèque. Génère un titre court en français (6 à 10 mots) : banque émettrice, ordre du chèque (bénéficiaire), montant et date si visibles. Exemple : "Chèque Société Générale — Martin Plomberie — 850 €". ${base}`,
        especes:  `Tu vois un reçu de paiement, une quittance ou un bon de caisse. Génère un titre court en français (5 à 8 mots) : type de document, montant, date et émetteur si visibles. Exemple : "Reçu de paiement — 400 € — 20 fév". ${base}`,
        autre:    `Tu vois un justificatif de paiement ou un document financier. Génère un titre court et descriptif en français (5 à 8 mots) qui résume son contenu. ${base}`,
      };
      return categoryPrompts[proofCategory ?? 'autre'] ?? categoryPrompts.autre;
    }
    default:
      return `Tu vois un document. Génère un titre court et descriptif en français (5 à 8 mots) qui résume son contenu principal. ${base}`;
  }
}

export const POST: APIRoute = async ({ params, request }) => {
  if (!GOOGLE_API_KEY) {
    return jsonError('GOOGLE_API_KEY non configurée', 500);
  }

  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const { id: chantierId, docId } = params;

  // Catégorie de justificatif (virement / cheque / especes / autre) — optionnel
  let proofCategory: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    proofCategory = (body as any)?.proofCategory ?? null;
  } catch { /* pas de body JSON — normal pour les appels sans corps */ }

  // ── Récupérer le document ────────────────────────────────────────────────────
  const { data: doc, error: docErr } = await ctx.supabase
    .from('documents_chantier')
    .select('id, nom, nom_fichier, document_type, bucket_path, mime_type, lot_id')
    .eq('id', docId!)
    .eq('chantier_id', chantierId!)
    .single();

  if (docErr || !doc) {
    return jsonError('Document introuvable', 404);
  }

  if (!doc.bucket_path) {
    return jsonError('Fichier non disponible', 400);
  }

  // ── Télécharger le fichier depuis Supabase Storage ───────────────────────────
  const { data: fileData, error: dlErr } = await ctx.supabase.storage
    .from(BUCKET)
    .download(doc.bucket_path);

  if (dlErr || !fileData) {
    return jsonError('Impossible de télécharger le fichier', 500);
  }

  // ── Convertir en base64 ──────────────────────────────────────────────────────
  const arrayBuffer = await fileData.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  // Détecter le mimeType
  const mimeType = doc.mime_type
    ?? (doc.nom_fichier?.match(/\.(jpg|jpeg)$/i) ? 'image/jpeg'
      : doc.nom_fichier?.match(/\.png$/i) ? 'image/png'
      : doc.nom_fichier?.match(/\.webp$/i) ? 'image/webp'
      : doc.nom_fichier?.match(/\.pdf$/i) ? 'application/pdf'
      : 'image/jpeg');

  // ── Appel Gemini Vision ──────────────────────────────────────────────────────
  const prompt = buildPrompt(doc.document_type, proofCategory);

  const geminiBody = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: mimeType,
            data: base64,
          },
        },
      ],
    }],
    generationConfig: {
      maxOutputTokens: 64,
      temperature: 0.3,
    },
  };

  let generatedNom: string | null = null;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      },
    );

    if (geminiRes.ok) {
      const geminiData = await geminiRes.json();
      const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
      // Nettoyer la réponse (supprimer ponctuation finale, guillemets)
      generatedNom = text
        .replace(/^["'«»]+|["'«»]+$/g, '')
        .replace(/[.!?]+$/, '')
        .trim();
      if (generatedNom.length > 80) generatedNom = generatedNom.slice(0, 80);
    }
  } catch (err) {
    console.error('[describe] Gemini error:', err instanceof Error ? err.message : err);
  }

  if (!generatedNom) {
    return jsonOk({ error: 'IA indisponible', nom: doc.nom });
  }

  // ── Mettre à jour le nom en base ─────────────────────────────────────────────
  await ctx.supabase
    .from('documents_chantier')
    .update({ nom: generatedNom })
    .eq('id', docId!);

  // ── Lot mismatch check (reuses detectDevisType, zero extra AI cost) ─────────
  if (doc.lot_id) {
    const detectedType = detectDevisType(generatedNom);
    if (detectedType !== 'autre') {
      const { data: lot } = await ctx.supabase
        .from('lots_chantier').select('nom').eq('id', doc.lot_id).single();
      if (lot) {
        const lotType = detectDevisType(lot.nom);
        if (lotType !== 'autre' && lotType !== detectedType) {
          const serviceClient = createServiceClient();
          serviceClient.from('agent_insights').insert({
            chantier_id: chantierId,
            user_id: ctx.user.id,
            type: 'risk_detected',
            severity: 'warning',
            title: `Affectation douteuse : "${generatedNom.slice(0, 40)}" dans lot "${lot.nom}"`,
            body: `La photo/document semble concerner "${detectedType}" mais est affecté au lot "${lot.nom}" (${lotType}). Vérifiez l'affectation.`,
            source_event: { check: 'lot_mismatch_describe', document_id: docId, detected_type: detectedType, lot_type: lotType },
          }).then(() => {}).catch(() => {});
        }
      }
    }
  }

  // Fire-and-forget: agent-checks ($0) + agent-orchestrator (Gemini)
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

  return jsonOk({ nom: generatedNom });
};

export const OPTIONS: APIRoute = () => optionsResponse();
