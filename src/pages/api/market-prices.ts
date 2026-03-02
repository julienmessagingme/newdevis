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

type DvfRow = {
  code_insee: string;
  commune: string;
  prix_m2_maison: number | null;
  prix_m2_appartement: number | null;
  nb_ventes_maison: number | null;
  nb_ventes_appartement: number | null;
  source: string | null;
  updated_at?: string | null;
};

type Fiabilite = { niveau: string; nb_ventes: number | null };

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeFiabilite(nbVentes: number | null): Fiabilite {
  if (nbVentes === null || nbVentes < 0) return { niveau: "inconnue", nb_ventes: null };
  if (nbVentes < 10)  return { niveau: "tres_faible", nb_ventes: nbVentes };
  if (nbVentes < 30)  return { niveau: "faible",      nb_ventes: nbVentes };
  if (nbVentes < 100) return { niveau: "moyenne",     nb_ventes: nbVentes };
  if (nbVentes < 300) return { niveau: "bonne",       nb_ventes: nbVentes };
  return               { niveau: "tres_bonne",         nb_ventes: nbVentes };
}

// ── Route ────────────────────────────────────────────────────────────────────
// GET /api/market-prices?code_insee=XXXXX[&type_bien=maison|appartement]
// Requête directe sur dvf_prices (colonnes prix_m2_maison / prix_m2_appartement)

export const GET: APIRoute = async ({ url }) => {
  const codeInsee   = url.searchParams.get("code_insee")?.trim()        ?? "";
  const typeBienRaw = url.searchParams.get("type_bien")?.toLowerCase().trim() ?? "";
  const typeBien    = typeBienRaw === "maison" || typeBienRaw === "appartement"
    ? typeBienRaw
    : "" as const;

  if (!/^\d{5}$/.test(codeInsee)) {
    return json({ source: "none", data: null, error: "INVALID_CODE_INSEE" }, 400);
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
    return json({ source: "none", data: null, error: "CONFIG_ERROR" }, 500);
  }

  const reqHeaders = {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
    "Content-Type": "application/json",
  };

  const enc    = encodeURIComponent;
  const SELECT = "code_insee,commune,prix_m2_maison,prix_m2_appartement,nb_ventes_maison,nb_ventes_appartement,source,updated_at";
  const dvfUrl = `${SUPA_URL}/rest/v1/dvf_prices?code_insee=eq.${enc(codeInsee)}&select=${enc(SELECT)}&limit=1`;

  try {
    const res = await fetch(dvfUrl, {
      headers: reqHeaders,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.warn(`[market-prices] dvf_prices HTTP ${res.status} code_insee=${codeInsee}`);
      return json({ source: "none", data: null, error: "NO_DATA" });
    }

    const rows = (await res.json().catch(() => null)) as DvfRow[] | null;
    const row  = Array.isArray(rows) ? (rows[0] ?? null) : null;

    if (!row) {
      console.warn(`[market-prices] NO_DATA code_insee=${codeInsee}`);
      return json({ source: "none", data: null, error: "NO_DATA" });
    }

    const rawPrix =
      typeBien === "maison"      ? row.prix_m2_maison :
      typeBien === "appartement" ? row.prix_m2_appartement :
      row.prix_m2_maison && row.prix_m2_appartement
        ? (row.prix_m2_maison + row.prix_m2_appartement) / 2
        : row.prix_m2_maison ?? row.prix_m2_appartement ?? null;

    const prixM2 = rawPrix && rawPrix > 0 ? Math.round(rawPrix) : null;

    if (!prixM2) {
      console.warn(`[market-prices] prix null/0 code_insee=${codeInsee} type=${typeBien || "avg"}`);
      return json({ source: "none", data: null, error: "NO_DATA" });
    }

    const nbVentes =
      typeBien === "maison"      ? row.nb_ventes_maison :
      typeBien === "appartement" ? row.nb_ventes_appartement :
      (row.nb_ventes_maison ?? 0) + (row.nb_ventes_appartement ?? 0) || null;

    console.log(
      `[market-prices] code_insee=${codeInsee} type=${typeBien || "avg"} prix=${prixM2} nb_ventes=${nbVentes}`
    );

    return json({
      source: "dvf_prices",
      data: {
        prix_m2:    prixM2,
        commune:    row.commune,
        code_insee: row.code_insee,
        fiabilite:  computeFiabilite(nbVentes),
        updated_at: row.updated_at ?? null,
      },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[market-prices] error code_insee=${codeInsee}: ${msg}`);
    return json({ source: "none", data: null, error: "NO_DATA" });
  }
};
