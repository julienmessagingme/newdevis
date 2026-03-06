import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Extract Bearer token from Authorization header
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

  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, trial_ends_at, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let isPremium = false;
  let trialDaysLeft: number | null = null;

  if (data?.status === "active") {
    isPremium = true;
  } else if (data?.status === "trial" && data.trial_ends_at) {
    const trialEnd = new Date(data.trial_ends_at);
    if (trialEnd > new Date()) {
      isPremium = true;
      trialDaysLeft = Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }
  }

  return new Response(
    JSON.stringify({
      isPremium,
      status: data?.status ?? "inactive",
      trialDaysLeft,
      trialEndsAt: data?.trial_ends_at ?? null,
      currentPeriodEnd: data?.current_period_end ?? null,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
