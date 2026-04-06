export const prerender = false;

/**
 * POST /api/chantier/[id]/documents/[docId]/extract-invoice
 *
 * Extrait via Gemini Vision :
 *   - montant TTC, entreprise, date, objet
 *   - type de facture (acompte / solde / totale)
 *   - pourcentage demandé (ex: 30 pour un acompte de 30%)
 *   - délai de paiement en jours (0 = à réception, 30 = net 30...)
 *   - numéro de facture
 *
 * Met à jour documents_chantier.montant + .nom + .payment_terms
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

  // Appel Gemini Vision — extraction enrichie
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
                text: `Analyse cette facture de travaux et extrais les informations suivantes.

CHAMPS À EXTRAIRE :
1. entreprise : nom de l'entreprise émettrice (string)
2. montant_ttc : montant total TTC en nombre décimal (si seulement HT, ajouter 20%)
3. date : date de la facture au format JJ/MM/AAAA
4. objet : objet des travaux en 8 mots max (string)
5. numero_facture : numéro ou référence de la facture (string, null si absent)
6. type_facture : type parmi EXACTEMENT "acompte" (premier versement partiel), "solde" (dernier versement ou paiement du reste), "totale" (paiement intégral en une fois)
7. pct_facture : pourcentage correspondant au type_facture (nombre entier entre 0 et 100). Exemple : si "acompte de 30%", retourner 30. Si facture totale, retourner 100. Si solde après acompte de 30%, retourner 70.
8. delai_paiement_jours : délai de paiement en nombre de jours à compter de la date de facture (0 si "à réception" ou immédiat, 30 si "30 jours", 45 si "45 jours", etc.)

RÈGLES :
- Si aucune mention de paiement partiel → type_facture = "totale", pct_facture = 100
- Si "acompte" sans pourcentage explicite → pct_facture = 30 (valeur par défaut)
- Si "solde" sans pourcentage explicite → pct_facture = 70
- Délai à réception = 0 jours

Réponds UNIQUEMENT avec ce JSON valide, sans texte avant ni après :
{"entreprise":"string","montant_ttc":number,"date":"string","objet":"string","numero_facture":null,"type_facture":"totale","pct_facture":100,"delai_paiement_jours":0}`,
              },
              {
                inline_data: { mime_type: mimeType, data: base64 },
              },
            ],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 800,
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

    // Construire les termes de paiement
    const payment_terms = {
      type_facture:      donnees.type_facture       ?? 'totale',
      pct:               donnees.pct_facture         ?? 100,
      delai_jours:       donnees.delai_paiement_jours ?? 0,
      numero_facture:    donnees.numero_facture       ?? null,
    };

    // Mettre à jour le document en base
    const update: Record<string, unknown> = {
      facture_statut: 'recue',
      payment_terms,
    };
    if (montant != null) update.montant = Math.round(montant * 100) / 100;
    if (nom)            update.nom = nom.slice(0, 100);

    await ctx.supabase
      .from('documents_chantier')
      .update(update)
      .eq('id', docId!);

    // Fire-and-forget: trigger deterministic agent checks ($0)
    fetch(`${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1/agent-checks`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${import.meta.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chantier_id: params.id }),
    }).catch(() => {});

    return jsonOk({
      montant:         montant ?? null,
      entreprise:      donnees.entreprise ?? null,
      date:            donnees.date ?? null,
      objet:           donnees.objet ?? null,
      nom,
      payment_terms,
    });
  } catch (err) {
    console.error('[extract-invoice] error:', err instanceof Error ? err.message : err);
    return jsonError('Erreur extraction facture', 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse();
