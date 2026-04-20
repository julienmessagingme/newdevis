export const prerender = false;

/**
 * POST /api/chantier/[id]/documents/extract-invoice
 *
 * Lit une facture uploadée et extrait via Gemini :
 *   artisan_nom, montant_total, type_facture (acompte/solde/facture), pct_acompte, date_facture
 *
 * Non-bloquant : répond toujours, même si l'extraction échoue (confidence: 'low').
 * Body JSON : { bucketPath: string }
 */

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

const BUCKET       = 'chantier-documents';
const GEMINI_MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS   = 8_000;

const MIME_MAP: Record<string, string> = {
  pdf:  'application/pdf',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps invalide', 400); }

  const bucketPath = typeof body.bucketPath === 'string' ? body.bucketPath.trim() : '';
  if (!bucketPath) return jsonError('bucketPath requis', 400);

  const geminiKey = import.meta.env.GOOGLE_API_KEY;
  if (!geminiKey) return jsonError('GOOGLE_API_KEY non configuré', 500);

  try {
    // ── 1. Télécharger depuis storage ──────────────────────────────────────────
    const supa = createClient(
      import.meta.env.PUBLIC_SUPABASE_URL!,
      import.meta.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: fileBlob, error: dlErr } = await supa.storage
      .from(BUCKET).download(bucketPath);
    if (dlErr || !fileBlob)
      return jsonOk({ confidence: 'low', error: 'Fichier introuvable' });

    // ── 2. Convertir en base64 ─────────────────────────────────────────────────
    const buffer = await fileBlob.arrayBuffer();
    const bytes  = new Uint8Array(buffer);
    let binary   = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    const ext = bucketPath.split('.').pop()?.toLowerCase() ?? '';
    const mimeType = MIME_MAP[ext] ?? fileBlob.type ?? 'application/pdf';

    // ── 3. Appel Gemini ────────────────────────────────────────────────────────
    const prompt = `Tu es un assistant comptable. Analyse ce document (facture, devis ou ticket).
Extrais UNIQUEMENT les informations suivantes en JSON strict, sans texte autour :
{
  "artisan_nom": "Nom complet de l'entreprise ou de l'artisan (null si introuvable)",
  "montant_total": 1234.56,
  "type_facture": "acompte" | "solde" | "facture",
  "pct_acompte": 30,
  "date_facture": "2026-03-15"
}

Règles :
- montant_total : montant TTC en euros, null si absent
- type_facture : "acompte" si c'est un acompte ou une avance, "solde" si c'est le solde final, "facture" sinon
- pct_acompte : pourcentage si acompte détecté (ex: 30 pour 30%), null sinon
- date_facture : format YYYY-MM-DD, null si absente
- Réponds UNIQUEMENT avec le JSON, rien d'autre`;

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let geminiResult: Record<string, unknown> = {};
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${geminiKey}`,
          },
          body: JSON.stringify({
            model: GEMINI_MODEL,
            max_tokens: 512,
            messages: [{
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
                { type: 'text', text: prompt },
              ],
            }],
          }),
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content ?? '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { geminiResult = JSON.parse(jsonMatch[0]); } catch { /* keep empty */ }
        }
      }
    } catch {
      clearTimeout(timeoutId);
      // Timeout ou erreur réseau — on retourne confidence low
      return jsonOk({ confidence: 'low' });
    }

    return jsonOk({
      confidence:    Object.keys(geminiResult).length > 0 ? 'high' : 'low',
      artisan_nom:   geminiResult.artisan_nom   ?? null,
      montant_total: typeof geminiResult.montant_total === 'number' ? geminiResult.montant_total : null,
      type_facture:  geminiResult.type_facture  ?? 'facture',
      pct_acompte:   typeof geminiResult.pct_acompte  === 'number' ? geminiResult.pct_acompte  : null,
      date_facture:  geminiResult.date_facture  ?? null,
    });

  } catch (err) {
    console.error('[extract-invoice]', err instanceof Error ? err.message : err);
    return jsonOk({ confidence: 'low' });
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
