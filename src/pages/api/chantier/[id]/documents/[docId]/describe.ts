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
import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_API_KEY  = import.meta.env.GOOGLE_API_KEY;
const BUCKET          = 'chantier-documents';

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

/** Prompt Gemini selon le type de document */
function buildPrompt(documentType: string): string {
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
    default:
      return `Tu vois un document. Génère un titre court et descriptif en français (5 à 8 mots) qui résume son contenu principal. ${base}`;
  }
}

export const POST: APIRoute = async ({ params, request }) => {
  if (!GOOGLE_API_KEY) {
    return new Response(JSON.stringify({ error: 'GOOGLE_API_KEY non configurée' }), { status: 500, headers: CORS });
  }

  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const { id: chantierId, docId } = params;

  // ── Ownership ────────────────────────────────────────────────────────────────
  const { data: chantier } = await ctx.supabase
    .from('chantiers').select('id')
    .eq('id', chantierId!).eq('user_id', ctx.user.id).single();
  if (!chantier) return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });

  // ── Récupérer le document ────────────────────────────────────────────────────
  const { data: doc, error: docErr } = await ctx.supabase
    .from('documents_chantier')
    .select('id, nom, nom_fichier, document_type, bucket_path, mime_type')
    .eq('id', docId!)
    .eq('chantier_id', chantierId!)
    .single();

  if (docErr || !doc) {
    return new Response(JSON.stringify({ error: 'Document introuvable' }), { status: 404, headers: CORS });
  }

  if (!doc.bucket_path) {
    return new Response(JSON.stringify({ error: 'Fichier non disponible' }), { status: 400, headers: CORS });
  }

  // ── Télécharger le fichier depuis Supabase Storage ───────────────────────────
  const { data: fileData, error: dlErr } = await ctx.supabase.storage
    .from(BUCKET)
    .download(doc.bucket_path);

  if (dlErr || !fileData) {
    return new Response(JSON.stringify({ error: 'Impossible de télécharger le fichier' }), { status: 500, headers: CORS });
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
  const prompt = buildPrompt(doc.document_type);

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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
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
    return new Response(JSON.stringify({ error: 'IA indisponible', nom: doc.nom }), { status: 200, headers: CORS });
  }

  // ── Mettre à jour le nom en base ─────────────────────────────────────────────
  await ctx.supabase
    .from('documents_chantier')
    .update({ nom: generatedNom })
    .eq('id', docId!);

  return new Response(JSON.stringify({ nom: generatedNom }), { status: 200, headers: CORS });
};

export const OPTIONS: APIRoute = () =>
  new Response(null, {
    status: 204,
    headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' },
  });
