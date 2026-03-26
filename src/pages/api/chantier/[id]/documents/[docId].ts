export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import type { DocumentType } from '@/types/chantier-ia';

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET          = 'chantier-documents';
const SIGNED_TTL      = 3_600;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const VALID_TYPES = new Set<DocumentType>([
  'devis', 'facture', 'photo', 'plan', 'autorisation', 'assurance', 'autre',
]);

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

/** Vérifie ownership du chantier puis charge le document. Double vérification explicite. */
async function loadDocWithOwnership(
  supabase: ReturnType<typeof makeClient>,
  docId: string,
  chantierId: string,
  userId: string,
) {
  // 1. Ownership chantier
  const { data: chantier } = await supabase
    .from('chantiers').select('id')
    .eq('id', chantierId).eq('user_id', userId).single();
  if (!chantier) return null;

  // 2. Document appartenant à ce chantier
  const { data: doc } = await supabase
    .from('documents_chantier').select('*')
    .eq('id', docId).eq('chantier_id', chantierId).single();
  return doc ?? null;
}

// ── GET /api/chantier/[id]/documents/[docId] ────────────────────────────────
// Retourne une URL signée fraîche (utile si celle en cache est expirée).

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const doc = await loadDocWithOwnership(ctx.supabase, params.docId!, params.id!, ctx.user.id);
  if (!doc) return new Response(JSON.stringify({ error: 'Document introuvable' }), { status: 404, headers: CORS });

  const { data: s } = await ctx.supabase.storage.from(BUCKET).createSignedUrl(doc.bucket_path, SIGNED_TTL);
  return new Response(JSON.stringify({ signedUrl: s?.signedUrl ?? null }), { status: 200, headers: CORS });
};

// ── DELETE /api/chantier/[id]/documents/[docId] ─────────────────────────────
// Suppression robuste : ownership → storage → DB.
// Si storage échoue : log + continue (évite record DB orphelin).

export const DELETE: APIRoute = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const doc = await loadDocWithOwnership(ctx.supabase, params.docId!, params.id!, ctx.user.id);
  if (!doc) return new Response(JSON.stringify({ error: 'Document introuvable' }), { status: 404, headers: CORS });

  // Étape 1 : Suppression Storage
  const { error: storageErr } = await ctx.supabase.storage.from(BUCKET).remove([doc.bucket_path]);
  if (storageErr) {
    // Non bloquant : le fichier a peut-être déjà été supprimé ou est inaccessible.
    // On continue pour ne pas laisser le record DB dangling.
    console.error('[api/documents] DELETE storage error:', storageErr.message);
  }

  // Étape 2 : Suppression DB
  const { error: dbErr } = await ctx.supabase
    .from('documents_chantier')
    .delete()
    .eq('id', params.docId!)
    .eq('chantier_id', params.id!);

  if (dbErr) {
    console.error('[api/documents] DELETE db error:', dbErr.message);
    return new Response(JSON.stringify({ error: 'Erreur lors de la suppression' }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
};

// ── PATCH /api/chantier/[id]/documents/[docId] ──────────────────────────────
// Mise à jour partielle : nom, document_type, lot_id.

export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const doc = await loadDocWithOwnership(ctx.supabase, params.docId!, params.id!, ctx.user.id);
  if (!doc) return new Response(JSON.stringify({ error: 'Document introuvable' }), { status: 404, headers: CORS });

  const VALID_DEVIS_STATUTS = new Set(['en_cours', 'a_relancer', 'valide', 'attente_facture']);
  const VALID_FACTURE_STATUTS = new Set(['recue', 'payee', 'payee_partiellement']);

  let body: {
    nom?: string;
    documentType?: DocumentType;
    lotId?: string | null;
    devisStatut?: string;
    factureStatut?: string;
    montantPaye?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers: CORS });
  }

  const updates: Record<string, unknown> = {};

  if (body.nom !== undefined)
    updates.nom = body.nom.trim();

  if (body.documentType !== undefined) {
    if (!VALID_TYPES.has(body.documentType))
      return new Response(JSON.stringify({ error: 'Type invalide' }), { status: 400, headers: CORS });
    updates.document_type = body.documentType;
    updates.type = body.documentType; // sync colonne legacy NOT NULL
  }

  if ('lotId' in body) {
    if (body.lotId !== null && body.lotId !== undefined) {
      const { data: lot } = await ctx.supabase
        .from('lots_chantier').select('id')
        .eq('id', body.lotId).eq('chantier_id', params.id!).single();
      if (!lot)
        return new Response(JSON.stringify({ error: 'Lot invalide' }), { status: 400, headers: CORS });
    }
    updates.lot_id = body.lotId ?? null;
  }

  if (body.devisStatut !== undefined) {
    if (!VALID_DEVIS_STATUTS.has(body.devisStatut))
      return new Response(JSON.stringify({ error: 'Statut invalide' }), { status: 400, headers: CORS });
    updates.devis_statut = body.devisStatut;
  }

  if (body.factureStatut !== undefined) {
    if (!VALID_FACTURE_STATUTS.has(body.factureStatut))
      return new Response(JSON.stringify({ error: 'Statut facture invalide' }), { status: 400, headers: CORS });
    updates.facture_statut = body.factureStatut;
    // Si payée ou reçue, reset montant_paye (seul payee_partiellement l'utilise)
    if (body.factureStatut !== 'payee_partiellement') {
      updates.montant_paye = null;
    }
  }

  if (body.montantPaye !== undefined) {
    if (body.montantPaye !== null && (typeof body.montantPaye !== 'number' || body.montantPaye < 0))
      return new Response(JSON.stringify({ error: 'Montant payé invalide' }), { status: 400, headers: CORS });
    updates.montant_paye = body.montantPaye;
  }

  if (!Object.keys(updates).length)
    return new Response(JSON.stringify({ error: 'Aucune modification fournie' }), { status: 400, headers: CORS });

  // Séparer update et fetch pour éviter PGRST116 (single() échoue si 0 lignes)
  const { error: updateErr } = await ctx.supabase
    .from('documents_chantier')
    .update(updates)
    .eq('id', params.docId!)
    .eq('chantier_id', params.id!);

  if (updateErr) {
    console.error('[api/documents] PATCH error:', updateErr.message);
    return new Response(JSON.stringify({ error: updateErr.message }), { status: 500, headers: CORS });
  }

  const { data: updated, error: fetchErr } = await ctx.supabase
    .from('documents_chantier')
    .select('*')
    .eq('id', params.docId!)
    .single();

  if (fetchErr || !updated) {
    return new Response(JSON.stringify({ error: 'Document introuvable après mise à jour' }), { status: 404, headers: CORS });
  }

  return new Response(JSON.stringify({ document: updated }), { status: 200, headers: CORS });
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,DELETE,PATCH,OPTIONS' } });
