import { createClient } from '@supabase/supabase-js';
export { renderers } from '../../../renderers.mjs';

const prerender = false;
const GET = async ({ request }) => {
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
  const { data, error } = await supabase.from("subscriptions").select("status, trial_ends_at, current_period_end").eq("user_id", user.id).maybeSingle();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  let isPremium = false;
  let trialDaysLeft = null;
  if (data?.status === "active") {
    isPremium = true;
  } else if (data?.status === "trial" && data.trial_ends_at) {
    const trialEnd = new Date(data.trial_ends_at);
    if (trialEnd > /* @__PURE__ */ new Date()) {
      isPremium = true;
      trialDaysLeft = Math.ceil((trialEnd.getTime() - Date.now()) / (1e3 * 60 * 60 * 24));
    }
  }
  return new Response(
    JSON.stringify({
      isPremium,
      status: data?.status ?? "inactive",
      trialDaysLeft,
      trialEndsAt: data?.trial_ends_at ?? null,
      currentPeriodEnd: data?.current_period_end ?? null
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
