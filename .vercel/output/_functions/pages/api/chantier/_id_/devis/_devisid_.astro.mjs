import { createClient } from '@supabase/supabase-js';
export { renderers } from '../../../../../renderers.mjs';

const prerender = false;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json"
};
const supabaseUrl = "https://vhrhgsqxwvouswjaiczn.supabase.co";
const supabaseServiceKey = undefined                                         ;
const DELETE = async ({ request, params }) => {
  const { id: chantierId, devisId } = params;
  if (!chantierId || !devisId) {
    return new Response(JSON.stringify({ error: "Paramètres manquants" }), { status: 400, headers: CORS });
  }
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: CORS });
  }
  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Token invalide" }), { status: 401, headers: CORS });
  }
  const { data: chantier } = await supabase.from("chantiers").select("id").eq("id", chantierId).eq("user_id", user.id).single();
  if (!chantier) {
    return new Response(JSON.stringify({ error: "Chantier introuvable" }), { status: 404, headers: CORS });
  }
  const { error } = await supabase.from("devis_chantier").delete().eq("id", devisId).eq("chantier_id", chantierId);
  if (error) {
    console.error("[api/chantier/devis DELETE] error:", error.message);
    return new Response(JSON.stringify({ error: "Erreur lors du détachement du devis" }), { status: 500, headers: CORS });
  }
  return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
};
const OPTIONS = () => new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Allow-Methods": "DELETE,OPTIONS" } });

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  DELETE,
  OPTIONS,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
