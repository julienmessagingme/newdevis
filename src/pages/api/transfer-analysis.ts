export const prerender = false;

import type { APIRoute } from "astro";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

/**
 * POST /api/transfer-analysis
 *
 * Transfers analysis ownership from an anonymous user to the authenticated caller.
 * Used when a user creates an analysis anonymously, then logs into an existing account.
 *
 * Body: { analysisId: string, fromUserId: string }
 * Auth: Bearer token of the logged-in user
 * Server: uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (!body?.analysisId || !body?.fromUserId) {
    return json({ error: "Missing analysisId or fromUserId" }, 400);
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return json({ error: "Unauthorized" }, 401);
  }

  const SUPA_URL = (
    import.meta.env.PUBLIC_SUPABASE_URL ??
    import.meta.env.VITE_SUPABASE_URL ??
    ""
  ) as string;

  const SERVICE_KEY = (
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  ) as string;

  if (!SUPA_URL || !SERVICE_KEY) {
    return json(
      { error: "Server configuration missing (SUPABASE_SERVICE_ROLE_KEY)" },
      500,
    );
  }

  const serviceHeaders = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };

  // 1. Verify the caller's JWT to get their user ID
  const userRes = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
  });

  if (!userRes.ok) {
    return json({ error: "Invalid token" }, 401);
  }

  const callerUser = await userRes.json();
  const newUserId = callerUser.id;

  if (!newUserId || newUserId === body.fromUserId) {
    return json({ error: "Invalid transfer (same user or missing ID)" }, 400);
  }

  // 2. Verify the analysis exists and belongs to fromUserId
  const checkUrl = `${SUPA_URL}/rest/v1/analyses?id=eq.${encodeURIComponent(body.analysisId)}&user_id=eq.${encodeURIComponent(body.fromUserId)}&select=id`;
  const checkRes = await fetch(checkUrl, { headers: serviceHeaders });
  const checkData = await checkRes.json();

  if (!Array.isArray(checkData) || checkData.length === 0) {
    return json(
      { error: "Analysis not found or does not belong to specified user" },
      404,
    );
  }

  // 3. Transfer ownership to the authenticated caller
  const updateUrl = `${SUPA_URL}/rest/v1/analyses?id=eq.${encodeURIComponent(body.analysisId)}&user_id=eq.${encodeURIComponent(body.fromUserId)}`;
  const updateRes = await fetch(updateUrl, {
    method: "PATCH",
    headers: { ...serviceHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: newUserId }),
  });

  if (!updateRes.ok) {
    return json({ error: "Transfer failed" }, 500);
  }

  return json({ success: true, analysisId: body.analysisId });
};

export const OPTIONS: APIRoute = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
