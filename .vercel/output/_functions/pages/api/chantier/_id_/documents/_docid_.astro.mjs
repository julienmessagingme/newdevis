import { createClient } from '@supabase/supabase-js';
export { renderers } from '../../../../../renderers.mjs';

const prerender = false;
const supabaseUrl = "https://vhrhgsqxwvouswjaiczn.supabase.co";
const supabaseService = undefined                                         ;
const BUCKET = "chantier-documents";
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
async function loadDocWithOwnership(supabase, docId, chantierId, userId) {
  const { data: chantier } = await supabase.from("chantiers").select("id").eq("id", chantierId).eq("user_id", userId).single();
  if (!chantier) return null;
  const { data: doc } = await supabase.from("documents_chantier").select("*").eq("id", docId).eq("chantier_id", chantierId).single();
  return doc ?? null;
}
const GET = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: CORS });
  const doc = await loadDocWithOwnership(ctx.supabase, params.docId, params.id, ctx.user.id);
  if (!doc) return new Response(JSON.stringify({ error: "Document introuvable" }), { status: 404, headers: CORS });
  const { data: s } = await ctx.supabase.storage.from(BUCKET).createSignedUrl(doc.bucket_path, SIGNED_TTL);
  return new Response(JSON.stringify({ signedUrl: s?.signedUrl ?? null }), { status: 200, headers: CORS });
};
const DELETE = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: CORS });
  const doc = await loadDocWithOwnership(ctx.supabase, params.docId, params.id, ctx.user.id);
  if (!doc) return new Response(JSON.stringify({ error: "Document introuvable" }), { status: 404, headers: CORS });
  const { error: storageErr } = await ctx.supabase.storage.from(BUCKET).remove([doc.bucket_path]);
  if (storageErr) {
    console.error("[api/documents] DELETE storage error:", storageErr.message);
  }
  const { error: dbErr } = await ctx.supabase.from("documents_chantier").delete().eq("id", params.docId).eq("chantier_id", params.id);
  if (dbErr) {
    console.error("[api/documents] DELETE db error:", dbErr.message);
    return new Response(JSON.stringify({ error: "Erreur lors de la suppression" }), { status: 500, headers: CORS });
  }
  return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
};
const PATCH = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: CORS });
  const doc = await loadDocWithOwnership(ctx.supabase, params.docId, params.id, ctx.user.id);
  if (!doc) return new Response(JSON.stringify({ error: "Document introuvable" }), { status: 404, headers: CORS });
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400, headers: CORS });
  }
  const updates = {};
  if (body.nom !== void 0)
    updates.nom = body.nom.trim();
  if (body.documentType !== void 0) {
    if (!VALID_TYPES.has(body.documentType))
      return new Response(JSON.stringify({ error: "Type invalide" }), { status: 400, headers: CORS });
    updates.document_type = body.documentType;
  }
  if ("lotId" in body) {
    if (body.lotId !== null && body.lotId !== void 0) {
      const { data: lot } = await ctx.supabase.from("lots_chantier").select("id").eq("id", body.lotId).eq("chantier_id", params.id).single();
      if (!lot)
        return new Response(JSON.stringify({ error: "Lot invalide" }), { status: 400, headers: CORS });
    }
    updates.lot_id = body.lotId ?? null;
  }
  if (!Object.keys(updates).length)
    return new Response(JSON.stringify({ error: "Aucune modification fournie" }), { status: 400, headers: CORS });
  const { data: updated, error } = await ctx.supabase.from("documents_chantier").update(updates).eq("id", params.docId).eq("chantier_id", params.id).select().single();
  if (error) {
    console.error("[api/documents] PATCH error:", error.message);
    return new Response(JSON.stringify({ error: "Erreur mise à jour" }), { status: 500, headers: CORS });
  }
  return new Response(JSON.stringify({ document: updated }), { status: 200, headers: CORS });
};
const OPTIONS = () => new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Allow-Methods": "GET,DELETE,PATCH,OPTIONS" } });

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  DELETE,
  GET,
  OPTIONS,
  PATCH,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
