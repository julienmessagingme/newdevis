import { createClient } from '@supabase/supabase-js';
export { renderers } from '../../../renderers.mjs';

const prerender = false;
const supabaseUrl = "https://vhrhgsqxwvouswjaiczn.supabase.co";
const supabaseServiceKey = undefined                                         ;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json"
};
const POST = async ({ request }) => {
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
  {
    return new Response(JSON.stringify({ error: "Clé API Google AI non configurée" }), { status: 500, headers: CORS });
  }
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
