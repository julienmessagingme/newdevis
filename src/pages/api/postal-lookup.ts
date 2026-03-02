export const prerender = false;

import type { APIRoute } from "astro";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

type PostalRow = { code_insee: string; commune: string };

export const GET: APIRoute = async ({ url }) => {
  const cp = url.searchParams.get("code_postal")?.trim() ?? "";

  if (!/^\d{5}$/.test(cp)) {
    return json({ data: [], error: "INVALID_POSTAL" }, 400);
  }

  const SUPA_URL = (
    import.meta.env.PUBLIC_SUPABASE_URL ??
    import.meta.env.VITE_SUPABASE_URL ??
    ""
  ) as string;

  const SUPA_KEY = (
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    ""
  ) as string;

  if (!SUPA_URL || !SUPA_KEY) {
    return json({ data: [], error: "CONFIG_ERROR" }, 500);
  }

  try {
    const reqUrl =
      `${SUPA_URL}/rest/v1/postal_insee` +
      `?code_postal=eq.${encodeURIComponent(cp)}` +
      `&select=code_insee,commune` +
      `&order=commune.asc`;

    const res = await fetch(reqUrl, {
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      console.warn(`[postal-lookup] Supabase ${res.status} cp=${cp}`);
      return json({ data: [], error: "SUPABASE_ERROR" });
    }

    const rows = (await res.json()) as PostalRow[] | null;
    const data = (rows ?? []).map((r) => ({
      commune: r.commune,
      code_insee: r.code_insee,
    }));

    if (data.length === 0) return json({ data: [], error: "NO_MATCH" });
    return json({ data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[postal-lookup] Exception cp=${cp}:`, msg);
    return json({ data: [], error: "NETWORK_ERROR" }, 500);
  }
};

export const OPTIONS: APIRoute = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
