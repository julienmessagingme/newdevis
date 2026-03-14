import { createClient } from '@supabase/supabase-js';
export { renderers } from '../../../../../../renderers.mjs';

const prerender = false;
const supabaseUrl = "https://vhrhgsqxwvouswjaiczn.supabase.co";
const supabaseService = undefined                                         ;
const BUCKET_CHANTIER = "chantier-documents";
const BUCKET_DEVIS = "devis";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json"
};
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
const POST = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: CORS });
  const { id: chantierId, docId } = params;
  const { data: chantier } = await ctx.supabase.from("chantiers").select("id").eq("id", chantierId).eq("user_id", ctx.user.id).single();
  if (!chantier) return new Response(JSON.stringify({ error: "Chantier introuvable" }), { status: 404, headers: CORS });
  const { data: doc } = await ctx.supabase.from("documents_chantier").select("*").eq("id", docId).eq("chantier_id", chantierId).single();
  if (!doc) return new Response(JSON.stringify({ error: "Document introuvable" }), { status: 404, headers: CORS });
  if (doc.document_type !== "devis") {
    return new Response(
      JSON.stringify({ error: "Ce document n'est pas un devis" }),
      { status: 400, headers: CORS }
    );
  }
  if (doc.analyse_id) {
    return new Response(
      JSON.stringify({ analysisId: doc.analyse_id }),
      { status: 409, headers: CORS }
    );
  }
  const { data: fileData, error: downloadErr } = await ctx.supabase.storage.from(BUCKET_CHANTIER).download(doc.bucket_path);
  if (downloadErr || !fileData) {
    console.error("[api/analyser] download error:", downloadErr?.message);
    return new Response(
      JSON.stringify({ error: "Impossible de lire le fichier source" }),
      { status: 500, headers: CORS }
    );
  }
  const ext = doc.nom_fichier.includes(".") ? `.${doc.nom_fichier.split(".").pop().toLowerCase()}` : "";
  const devisPath = `${ctx.user.id}/${Date.now()}-chantier${ext}`;
  const { error: uploadErr } = await ctx.supabase.storage.from(BUCKET_DEVIS).upload(devisPath, fileData, {
    contentType: doc.mime_type ?? "application/octet-stream",
    upsert: false
  });
  if (uploadErr) {
    console.error("[api/analyser] upload to devis error:", uploadErr.message);
    return new Response(
      JSON.stringify({ error: "Erreur lors de la copie du fichier" }),
      { status: 500, headers: CORS }
    );
  }
  const { data: analysis, error: insertErr } = await ctx.supabase.from("analyses").insert({
    user_id: ctx.user.id,
    file_name: doc.nom_fichier,
    file_path: devisPath,
    status: "pending",
    domain: "travaux"
  }).select("id").single();
  if (insertErr || !analysis) {
    console.error("[api/analyser] insert analyses error:", insertErr?.message);
    await ctx.supabase.storage.from(BUCKET_DEVIS).remove([devisPath]);
    return new Response(
      JSON.stringify({ error: "Erreur lors de la création de l'analyse" }),
      { status: 500, headers: CORS }
    );
  }
  const analysisId = analysis.id;
  const { error: patchErr } = await ctx.supabase.from("documents_chantier").update({ analyse_id: analysisId }).eq("id", docId).eq("chantier_id", chantierId);
  if (patchErr) {
    console.error("[api/analyser] PATCH analyse_id error:", patchErr.message);
    await ctx.supabase.from("analyses").delete().eq("id", analysisId);
    await ctx.supabase.storage.from(BUCKET_DEVIS).remove([devisPath]);
    return new Response(
      JSON.stringify({ error: "Erreur lors de la liaison du document" }),
      { status: 500, headers: CORS }
    );
  }
  ctx.supabase.functions.invoke("analyze-quote", {
    body: { analysisId, skipN8N: false }
  }).catch((e) => {
    console.error("[api/analyser] invoke error:", e instanceof Error ? e.message : String(e));
  });
  return new Response(JSON.stringify({ analysisId }), { status: 200, headers: CORS });
};
const OPTIONS = () => new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Allow-Methods": "POST,OPTIONS" } });

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  OPTIONS,
  POST,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
