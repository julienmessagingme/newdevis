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

type DvfV2Row = {
  code_insee:           string;
  commune:              string;
  prix_m2_maison:       number | null;
  prix_m2_appartement:  number | null;
  nb_ventes_maison:     number | null;
  nb_ventes_appartement: number | null;
  source:               string | null;
  updated_at:           string | null;
};

type FiabiliteNiveau =
  | "tres_faible"
  | "faible"
  | "moyenne"
  | "bonne"
  | "tres_bonne";

// ── Fiabilité ────────────────────────────────────────────────────────────────

function computeFiabilite(
  nb: number | null
): { niveau: FiabiliteNiveau; nb_ventes: number | null } {
  if (nb === null || nb < 0) return { niveau: "tres_faible", nb_ventes: null };
  if (nb < 10)  return { niveau: "tres_faible", nb_ventes: nb };
  if (nb < 30)  return { niveau: "faible",      nb_ventes: nb };
  if (nb < 100) return { niveau: "moyenne",      nb_ventes: nb };
  if (nb < 300) return { niveau: "bonne",        nb_ventes: nb };
  return               { niveau: "tres_bonne",   nb_ventes: nb };
}

// ── Route ────────────────────────────────────────────────────────────────────
// GET /api/market-prices?code_insee=XXXXX[&type_bien=maison|appartement]
// Source unique : dvf_prices_v2
// type_bien absent → défaut "maison"

export const GET: APIRoute = async ({ url }) => {
  // ── Validation paramètres ──────────────────────────────────────────────────
  const codeInsee = url.searchParams.get("code_insee")?.trim() ?? "";
  if (!/^\d{5}$/.test(codeInsee)) {
    return json({ source: "none", data: null, error: "INVALID_CODE_INSEE" }, 400);
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
    return json({ source: "none", data: null, error: "CONFIG_ERROR" }, 500);
  }

  // ── Requête dvf_prices_v2 ──────────────────────────────────────────────────
  const SELECT = [
    "code_insee",
    "commune",
    "prix_m2_maison",
    "prix_m2_appartement",
    "nb_ventes_maison",
    "nb_ventes_appartement",
    "source",
    "updated_at",
  ].join(",");

  const reqUrl =
    `${SUPA_URL}/rest/v1/dvf_prices_v2` +
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
        `[market-prices] dvf_prices_v2 HTTP ${res.status} code_insee=${codeInsee}`
      );
      return json({ source: "none", data: null, error: "NO_DATA" });
    }

    const rows = (await res.json().catch(() => null)) as DvfV2Row[] | null;
    const row  = Array.isArray(rows) && rows.length > 0 ? rows[0]! : null;

    if (!row) {
      console.warn(`[market-prices] NO_DATA code_insee=${codeInsee}`);
      return json({ source: "none", data: null, error: "NO_DATA" });
    }

    // ── Sélection du prix selon type_bien ──────────────────────────────────
    const rawPrix: number | null =
      typeBien === "appartement"
        ? row.prix_m2_appartement
        : row.prix_m2_maison;

    if (!rawPrix || rawPrix <= 0) {
      console.warn(
        `[market-prices] prix null/0 code_insee=${codeInsee} type=${typeBien}`
      );
      return json({ source: "none", data: null, error: "NO_DATA" });
    }

    const prixM2 = Math.round(rawPrix);

    // ── Fiabilité ──────────────────────────────────────────────────────────
    const nbVentes: number | null =
      typeBien === "appartement"
        ? row.nb_ventes_appartement
        : row.nb_ventes_maison;

    const fiabilite = computeFiabilite(nbVentes);

    console.log(
      `[market-prices] ok code_insee=${codeInsee} type=${typeBien}` +
      ` prix=${prixM2} nb_ventes=${nbVentes}`
    );

    return json({
      source: "dvf_prices_v2",
      data: {
        prix_m2:    prixM2,
        commune:    row.commune,
        code_insee: row.code_insee,
        fiabilite,
        updated_at: row.updated_at ?? null,
      },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[market-prices] error code_insee=${codeInsee}: ${msg}`);
    return json({ source: "none", data: null, error: "NO_DATA" });
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
