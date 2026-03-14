import { createClient } from '@supabase/supabase-js';
export { renderers } from '../../../renderers.mjs';

const prerender = false;
const POST = async ({ request }) => {
  const supabaseUrl = "https://vhrhgsqxwvouswjaiczn.supabase.co";
  const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZocmhnc3F4d3ZvdXN3amFpY3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MjQzMjEsImV4cCI6MjA4NjMwMDMyMX0.s1LvwmlSSGaCjiPRI8j4op-7xke7h53Ng8nqIkNAAzI";
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "") ?? "";
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Non authentifié" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const { data: existing } = await supabase.from("subscriptions").select("status").eq("user_id", user.id).maybeSingle();
  if (existing?.status === "active") {
    return new Response(JSON.stringify({ success: true, alreadyActive: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  const trialEnd = /* @__PURE__ */ new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);
  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: user.id,
      status: "trial",
      plan: "premium_monthly",
      trial_ends_at: trialEnd.toISOString()
    },
    { onConflict: "user_id" }
  );
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
