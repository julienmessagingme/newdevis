export const prerender = false;

import type { APIRoute } from "astro";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

// ── Types ────────────────────────────────────────────────────────────────────

type TypeBien = "maison" | "appartement";

type RentalRow = {
  code_insee:          string;
  loyer_m2_maison:     number | null;
  loyer_m2_appartement: number | null;
  nb_obs_maison:       number | null;
  nb_obs_appartement:  number | null;
  source:              string | null;
};

// ── Route ────────────────────────────────────────────────────────────────────
// GET /api/rental-prices?code_insee=XXXXX[&type_bien=maison|appartement]
// Source unique : rental_prices_v1
// type_bien absent → défaut "maison"

export const GET: APIRoute = async ({ url }) => {
  // ── Validation paramètres ──────────────────────────────────────────────────
  const codeInsee = url.searchParams.get("code_insee")?.trim() ?? "";
  if (!codeInsee) {
    return json({ source: "rental_prices_v1", data: null, error: "MISSING_CODE_INSEE" }, 400);
  }
  if (!/^\d{5}$/.test(codeInsee)) {
    return json({ source: "rental_prices_v1", data: null, error: "INVALID_CODE_INSEE" }, 400);
  }

  const typeBienRaw = url.searchParams.get("type_bien")?.toLowerCase().trim() ?? "";
  const typeBien: TypeBien =
    typeBienRaw === "appartement" ? "appartement" : "maison"; // défaut = maison

  // ── Config Supabase ────────────────────────────────────────────────────────
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
    return json({ source: "rental_prices_v1", data: null, error: "CONFIG_ERROR" }, 500);
  }

  // ── Requête rental_prices_v1 ───────────────────────────────────────────────
  const SELECT = [
    "code_insee",
    "loyer_m2_maison",
    "loyer_m2_appartement",
    "nb_obs_maison",
    "nb_obs_appartement",
    "source",
  ].join(",");

  const reqUrl =
    `${SUPA_URL}/rest/v1/rental_prices_v1` +
    `?code_insee=eq.${encodeURIComponent(codeInsee)}` +
    `&select=${encodeURIComponent(SELECT)}` +
    `&limit=1`;

  try {
    const res = await fetch(reqUrl, {
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.warn(
        `[rental-prices] rental_prices_v1 HTTP ${res.status} code_insee=${codeInsee}`
      );
      return json({ source: "rental_prices_v1", data: null });
    }

    const rows = (await res.json().catch(() => null)) as RentalRow[] | null;
    const row  = Array.isArray(rows) && rows.length > 0 ? rows[0]! : null;

    if (!row) {
      console.warn(`[rental-prices] NO_DATA code_insee=${codeInsee}`);
      return json({ source: "rental_prices_v1", data: null });
    }

    // ── Sélection selon type_bien ──────────────────────────────────────────
    const rawLoyer: number | null =
      typeBien === "appartement"
        ? row.loyer_m2_appartement
        : row.loyer_m2_maison;

    const rawNbObs: number | null =
      typeBien === "appartement"
        ? row.nb_obs_appartement
        : row.nb_obs_maison;

    if (!rawLoyer || rawLoyer <= 0) {
      console.warn(
        `[rental-prices] loyer null/0 code_insee=${codeInsee} type=${typeBien}`
      );
      return json({ source: "rental_prices_v1", data: null });
    }

    const loyerM2 = Math.round(rawLoyer * 100) / 100; // 2 décimales
    const nbObs   = rawNbObs ?? 0;

    console.log(
      `[rental-prices] ok code_insee=${codeInsee} type=${typeBien}` +
      ` loyer=${loyerM2} nb_obs=${nbObs}`
    );

    return json({
      source: "rental_prices_v1",
      data: {
        loyer_m2: loyerM2,
        nb_obs:   nbObs,
      },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[rental-prices] error code_insee=${codeInsee}: ${msg}`);
    return json({ source: "rental_prices_v1", data: null });
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
