export const prerender = false;

/**
 * POST /api/chantier/[id]/documents/[docId]/extract-invoice
 *
 * Extrait le montant TTC d'une facture via Gemini Vision.
 * Met à jour documents_chantier.montant et .nom.
 * Retourne : { montant: number | null, entreprise: string, date: string, objet: string }
 */

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

const GOOGLE_API_KEY = import.meta.env.GOOGLE_API_KEY;
const BUCKET = 'chantier-documents';

export const POST: APIRoute = async ({ params, request }) => {
  if (!GOOGLE_API_KEY) return jsonError('GOOGLE_API_KEY non configurée', 500);

  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const { id: chantierId, docId } = params;

  // Récupérer le document
  const { data: doc, error: docErr } = await ctx.supabase
    .from('documents_chantier')
    .select('id, nom, nom_fichier, document_type, bucket_path, mime_type')
    .eq('id', docId!)
    .eq('chantier_id', chantierId!)
    .single();

  if (docErr || !doc) return jsonError('Document introuvable', 404);
  if (doc.document_type !== 'facture') return jsonError('Ce document n\'est pas une facture', 400);
  if (!doc.bucket_path) return jsonError('Fichier non disponible', 400);

  // Télécharger le fichier
  const { data: fileData, error: dlErr } = await ctx.supabase.storage
    .from(BUCKET)
    .download(doc.bucket_path);

  if (dlErr || !fileData) return jsonError('Impossible de télécharger le fichier', 500);

  // Convertir en base64
  const arrayBuffer = await fileData.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  const mimeType = doc.mime_type
    ?? (doc.nom_fichier?.match(/\.(jpg|jpeg)$/i) ? 'image/jpeg'
      : doc.nom_fichier?.match(/\.png$/i) ? 'image/png'
      : doc.nom_fichier?.match(/\.pdf$/i) ? 'application/pdf'
      : 'image/jpeg');

  // Appel Gemini Vision
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `Analyse cette facture de travaux.
Extrait uniquement ces informations :
- Nom de l'entreprise émettrice
- Montant total TTC (nombre seul, sans € ni espace. Si HT seulement, ajoute 20% de TVA)
- Date de la facture (format JJ/MM/AAAA)
- Objet des travaux (8 mots maximum)

Réponds UNIQUEMENT avec ce JSON valide, sans texte avant ni après :
{"entreprise":"string","montant_ttc":number,"date":"string","objet":"string"}`,
              },
              {
                inline_data: { mime_type: mimeType, data: base64 },
              },
            ],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 500,
            temperature: 0,
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      console.error('[extract-invoice] Gemini error:', geminiRes.status);
      return jsonError('Lecture IA échouée', 502);
    }

    const geminiData = await geminiRes.json();
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    if (!text) return jsonError('Réponse IA vide', 502);

    const donnees = JSON.parse(text);
    const montant = typeof donnees.montant_ttc === 'number' ? donnees.montant_ttc : null;
    const nom = donnees.objet
      ? `${donnees.entreprise ? donnees.entreprise + ' — ' : ''}${donnees.objet}`
      : doc.nom;

    // Mettre à jour le document en base
    const update: Record<string, unknown> = {};
    if (montant != null) update.montant = Math.round(montant * 100) / 100;
    if (nom) update.nom = nom.slice(0, 100);
    // Statut par défaut : reçue
    update.facture_statut = 'recue';

    if (Object.keys(update).length > 0) {
      await ctx.supabase
        .from('documents_chantier')
        .update(update)
        .eq('id', docId!);
    }

    return jsonOk({
      montant: montant ?? null,
      entreprise: donnees.entreprise ?? null,
      date: donnees.date ?? null,
      objet: donnees.objet ?? null,
      nom,
    });
  } catch (err) {
    console.error('[extract-invoice] error:', err instanceof Error ? err.message : err);
    return jsonError('Erreur extraction facture', 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse();
