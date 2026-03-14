import { createClient } from '@supabase/supabase-js';
export { renderers } from '../../../../renderers.mjs';

const prerender = false;
const supabaseUrl = "https://vhrhgsqxwvouswjaiczn.supabase.co";
const supabaseService = undefined                                         ;
const BUCKET = "chantier-documents";
const MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_TTL = 3600;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json"
};
const VALID_TYPES = /* @__PURE__ */ new Set([
  "devis",
  "facture",
  "photo",
  "plan",
  "autorisation",
  "assurance",
  "autre"
]);
function makeClient() {
  return createClient(supabaseUrl, supabaseService);
}
async function authenticate(request) {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const supabase = makeClient();
  const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
  return user ? { user, supabase } : null;
}
async function verifyChantierOwnership(supabase, chantierId, userId) {
  const { data } = await supabase.from("chantiers").select("id").eq("id", chantierId).eq("user_id", userId).single();
  return !!data;
}
const GET = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: CORS });
  const chantierId = params.id;
  if (!await verifyChantierOwnership(ctx.supabase, chantierId, ctx.user.id))
    return new Response(JSON.stringify({ error: "Chantier introuvable" }), { status: 404, headers: CORS });
  const { data: docs, error } = await ctx.supabase.from("documents_chantier").select("*").eq("chantier_id", chantierId).order("created_at", { ascending: false });
  if (error) {
    console.error("[api/documents] GET error:", error.message);
    return new Response(JSON.stringify({ error: "Erreur chargement documents" }), { status: 500, headers: CORS });
  }
  const enriched = await Promise.all(
    (docs ?? []).map(async (doc) => {
      const { data: s } = await ctx.supabase.storage.from(BUCKET).createSignedUrl(doc.bucket_path, SIGNED_TTL);
      return { ...doc, signedUrl: s?.signedUrl ?? null };
    })
  );
  return new Response(JSON.stringify({ documents: enriched }), { status: 200, headers: CORS });
};
const POST = async ({ params, request }) => {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer "))
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: CORS });
  const supabase = makeClient();
  const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
  if (!user)
    return new Response(JSON.stringify({ error: "Token invalide" }), { status: 401, headers: CORS });
  const chantierId = params.id;
  if (!await verifyChantierOwnership(supabase, chantierId, user.id))
    return new Response(JSON.stringify({ error: "Chantier introuvable" }), { status: 404, headers: CORS });
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requête invalide" }), { status: 400, headers: CORS });
  }
  const { bucketPath, nom, nomFichier, documentType, lotId: lotIdRaw = null, tailleOctets = null, mimeType = null } = body;
  if (!bucketPath?.trim() || !nom?.trim() || !nomFichier?.trim())
    return new Response(JSON.stringify({ error: "Champs obligatoires manquants" }), { status: 400, headers: CORS });
  if (!VALID_TYPES.has(documentType))
    return new Response(JSON.stringify({ error: "Type de document invalide" }), { status: 400, headers: CORS });
  if (tailleOctets !== null && tailleOctets > MAX_BYTES)
    return new Response(JSON.stringify({ error: "Fichier trop volumineux (max 10 Mo)" }), { status: 400, headers: CORS });
  if (!bucketPath.startsWith(`${user.id}/`))
    return new Response(JSON.stringify({ error: "Chemin storage invalide" }), { status: 400, headers: CORS });
  let lotId = lotIdRaw;
  if (lotId !== null && lotId !== void 0) {
    const { data: lot } = await supabase.from("lots_chantier").select("id").eq("id", lotId).eq("chantier_id", chantierId).single();
    if (!lot) {
      console.warn("[api/documents] Lot invalide ignoré — rattachement au chantier uniquement:", lotId);
      lotId = null;
    }
  }
  const { data: doc, error: insertError } = await supabase.from("documents_chantier").insert({
    chantier_id: chantierId,
    lot_id: lotId,
    document_type: documentType,
    source: "manual_upload",
    nom: nom.trim(),
    nom_fichier: nomFichier,
    bucket_path: bucketPath,
    taille_octets: tailleOctets,
    mime_type: mimeType
  }).select().single();
  if (insertError || !doc) {
    console.error("[api/documents] POST insert error:", insertError?.message);
    return new Response(JSON.stringify({ error: "Erreur lors de l'enregistrement" }), { status: 500, headers: CORS });
  }
  const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(bucketPath, SIGNED_TTL);
  return new Response(
    JSON.stringify({ document: { ...doc, signedUrl: s?.signedUrl ?? null } }),
    { status: 201, headers: CORS }
  );
};
const OPTIONS = () => new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } });

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  OPTIONS,
  POST,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
