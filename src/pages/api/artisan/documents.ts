export const prerender = false;

import type { APIRoute } from 'astro';
import { requireArtisanToken, jsonOk, jsonError, optionsResponse } from '@/lib/api/apiHelpers';
import { scopeArtisanDocuments } from '@/lib/api/artisanScope';

const BUCKET = 'chantier-documents';
const SIGNED_TTL = 3_600;
const VALID_TYPES = new Set(['facture', 'photo', 'plan', 'autorisation', 'assurance', 'autre', 'devis']);

type DocRow = {
  id: string;
  nom: string | null;
  document_type: string | null;
  created_at: string;
  bucket_path: string | null;
  mime_type: string | null;
  taille_octets: number | null;
  contact_id: string | null;
};

// GET /api/artisan/documents — UNIQUEMENT les documents de CET artisan (contact_id).
// JAMAIS de filtre par lot_id : un lot peut avoir des concurrents → fuite.
export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireArtisanToken(request);
  if (ctx instanceof Response) return ctx;
  const { supabase, contactId, chantierId } = ctx;

  const { data, error } = await supabase
    .from('documents_chantier')
    .select('id, nom, document_type, created_at, bucket_path, mime_type, taille_octets, contact_id')
    .eq('chantier_id', chantierId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[artisan/documents] GET error:', error.message);
    return jsonError('Erreur chargement documents', 500);
  }

  // Double barrière : la fonction pure testée re-filtre sur contact_id.
  const scoped = scopeArtisanDocuments((data ?? []) as DocRow[], contactId);
  const enriched = await Promise.all(scoped.map(async (d) => {
    let signedUrl: string | null = null;
    if (d.bucket_path) {
      const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(d.bucket_path, SIGNED_TTL);
      signedUrl = s?.signedUrl ?? null;
    }
    // N'expose ni bucket_path ni contact_id au client artisan.
    return {
      id: d.id,
      nom: d.nom,
      document_type: d.document_type,
      created_at: d.created_at,
      mime_type: d.mime_type,
      taille_octets: d.taille_octets,
      signedUrl,
    };
  }));

  return jsonOk({ documents: enriched });
};

// POST /api/artisan/documents — enregistre un fichier déjà uploadé via /api/artisan/upload-url.
export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireArtisanToken(request);
  if (ctx instanceof Response) return ctx;
  const { supabase, contactId, chantierId } = ctx;

  let body: { nom?: string; documentType?: string; bucketPath?: string; nomFichier?: string; mimeType?: string | null; tailleOctets?: number | null };
  try { body = await request.json(); }
  catch { return jsonError('Corps invalide', 400); }

  const nom = body.nom?.trim() ?? '';
  const documentType = body.documentType ?? 'autre';
  const bucketPath = body.bucketPath ?? '';

  if (!nom) return jsonError('Nom requis', 400);
  if (!VALID_TYPES.has(documentType)) return jsonError('Type invalide', 400);
  // ISOLATION anti-forge : le bucketPath DOIT être dans le dossier de cet artisan.
  if (!bucketPath.startsWith(`artisan/${chantierId}/${contactId}/`)) {
    return jsonError('Chemin de fichier invalide', 400);
  }

  // lot_id déduit du contact (son lot).
  const { data: contact } = await supabase.from('contacts_chantier').select('lot_id').eq('id', contactId).maybeSingle();
  const lotId = contact?.lot_id ?? null;

  const { data: doc, error: insertErr } = await supabase
    .from('documents_chantier')
    .insert({
      chantier_id: chantierId,
      contact_id: contactId,
      lot_id: lotId,
      type: documentType,          // colonne NOT NULL d'origine
      document_type: documentType, // colonne ajoutée par migration
      source: 'artisan_upload',
      nom,
      nom_fichier: body.nomFichier ?? '',
      bucket_path: bucketPath,
      taille_octets: body.tailleOctets ?? null,
      mime_type: body.mimeType ?? null,
    })
    .select('id, nom, document_type, created_at')
    .single();

  if (insertErr || !doc) {
    console.error('[artisan/documents] insert error:', insertErr?.message);
    return jsonError(insertErr?.message ?? 'Erreur DB', 500);
  }

  // Entrée dans le pipeline (checks déterministes + notif client), fire-and-forget.
  const sbUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const sbKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  fetch(`${sbUrl}/functions/v1/agent-checks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ chantier_id: chantierId }),
  }).catch(() => {});

  return jsonOk({ document: doc }, 201);
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,POST,OPTIONS');
