import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "") ?? "";

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Non authentifié" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check if already subscribed
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.status === "active") {
    return new Response(JSON.stringify({ success: true, alreadyActive: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  const { error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: user.id,
        status: "trial",
        plan: "premium_monthly",
        trial_ends_at: trialEnd.toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
