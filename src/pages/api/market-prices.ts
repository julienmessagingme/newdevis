export const prerender = false;

import type { APIRoute } from "astro";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

type DvfV1Row = {
  code_insee: string;
  commune: string;
  code_postal: string | null;
  prix_m2: number | null;
  source: string | null;
  updated_at?: string | null;
};

type DvfV2Row = {
  code_insee: string;
  commune: string;
  prix_m2_maison: number | null;
  prix_m2_appartement: number | null;
  nb_ventes_maison: number | null;
  nb_ventes_appartement: number | null;
  source: string | null;
  updated_at?: string | null;
};

// GET /api/market-prices
// Paramètres : code_insee (principal) | code_postal + commune (fallback)
// Tables : public.dvf_prices_v2 (priorité), sinon public.dvf_prices (fallback)
export const GET: APIRoute = async ({ url }) => {
  const codeInsee = url.searchParams.get("code_insee")?.trim() ?? "";
  const codePostal = url.searchParams.get("code_postal")?.trim() ?? "";
  const communeQ = url.searchParams.get("commune")?.trim() ?? "";

  if (!codeInsee && !codePostal) {
    return json(
      { error: "code_insee requis (ou code_postal + commune en fallback)" },
      400
    );
  }

  const SUPA_URL =
    (import.meta.env.PUBLIC_SUPABASE_URL ??
      import.meta.env.VITE_SUPABASE_URL ??
      "") as string;

  const SUPA_KEY =
    (import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
      "") as string;

  if (!SUPA_URL || !SUPA_KEY) {
    return json(
      {
        error:
          "Config Supabase manquante — vérifiez PUBLIC_SUPABASE_URL et PUBLIC_SUPABASE_PUBLISHABLE_KEY sur Vercel.",
      },
      500
    );
  }

  const headers = {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
    "Content-Type": "application/json",
  };

  // helper fetch JSON
  async function fetchJson<T>(reqUrl: string): Promise<{
    ok: boolean;
    status: number;
    data: T | null;
    errorText?: string;
  }> {
    try {
      const res = await fetch(reqUrl, { headers });
      const status = res.status;

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        return { ok: false, status, data: null, errorText };
      }
      const data = (await res.json().catch(() => null)) as T | null;
      return { ok: true, status, data };
    } catch (e: any) {
      return { ok: false, status: 0, data: null, errorText: String(e) };
    }
  }

  // ----------- Build URLs -----------
  // V2
  const SELECT_V2 =
    "code_insee,commune,prix_m2_maison,prix_m2_appartement,nb_ventes_maison,nb_ventes_appartement,source,updated_at";

  // V1
  const SELECT_V1 = "code_insee,commune,code_postal,prix_m2,source,updated_at";

  // Query by code_insee (best)
  const v2UrlByInsee = `${SUPA_URL}/rest/v1/dvf_prices_v2?code_insee=eq.${encodeURIComponent(
    codeInsee
  )}&select=${encodeURIComponent(SELECT_V2)}&limit=1`;

  const v1UrlByInsee = `${SUPA_URL}/rest/v1/dvf_prices?code_insee=eq.${encodeURIComponent(
    codeInsee
  )}&select=${encodeURIComponent(SELECT_V1)}&limit=1`;

  // Fallback query by CP + commune (only if no code_insee)
  const v2UrlByCpCommune = `${SUPA_URL}/rest/v1/dvf_prices_v2?commune=ilike.${encodeURIComponent(
    communeQ ? communeQ : "%"
  )}&select=${encodeURIComponent(SELECT_V2)}&limit=1`;

  const v1UrlByCpCommune = `${SUPA_URL}/rest/v1/dvf_prices?code_postal=eq.${encodeURIComponent(
    codePostal
  )}&commune=ilike.${encodeURIComponent(
    communeQ ? communeQ : "%"
  )}&select=${encodeURIComponent(SELECT_V1)}&limit=1`;

  // ----------- 1) Try V2 first -----------
  let used = "dvf_prices_v2" as const;

  let v2Res =
    codeInsee !== ""
      ? await fetchJson<DvfV2Row[]>(v2UrlByInsee)
      : await fetchJson<DvfV2Row[]>(v2UrlByCpCommune);

  const v2Row = v2Res.ok && Array.isArray(v2Res.data) ? v2Res.data[0] : null;

  if (v2Row) {
    // legacy prix_m2 (pour compat): moyenne simple des 2 si les deux existent, sinon celui dispo
    const legacyPrixM2 =
      v2Row.prix_m2_appartement && v2Row.prix_m2_maison
        ? Math.round((v2Row.prix_m2_appartement + v2Row.prix_m2_maison) / 2)
        : v2Row.prix_m2_appartement ?? v2Row.prix_m2_maison ?? null;

    return json({
      dvf_available: true,
      used_table: used,
      code_insee: v2Row.code_insee,
      commune: v2Row.commune,
      // v2 fields
      prix_m2_maison: v2Row.prix_m2_maison,
      prix_m2_appartement: v2Row.prix_m2_appartement,
      nb_ventes_maison: v2Row.nb_ventes_maison,
      nb_ventes_appartement: v2Row.nb_ventes_appartement,
      // legacy (v1 compat)
      prix_m2: legacyPrixM2,
      source: v2Row.source ?? "DVF (données publiques)",
      updated_at: v2Row.updated_at ?? null,
    });
  }

  // ----------- 2) Fallback to V1 -----------
  used = "dvf_prices";

  let v1Res =
    codeInsee !== ""
      ? await fetchJson<DvfV1Row[]>(v1UrlByInsee)
      : await fetchJson<DvfV1Row[]>(v1UrlByCpCommune);

  const v1Row = v1Res.ok && Array.isArray(v1Res.data) ? v1Res.data[0] : null;

  if (v1Row) {
    // On mappe v1 => v2-like (temp)
    return json({
      dvf_available: true,
      used_table: used,
      code_insee: v1Row.code_insee,
      commune: v1Row.commune,
      prix_m2_maison: v1Row.prix_m2 ?? null,
      prix_m2_appartement: v1Row.prix_m2 ?? null,
      nb_ventes_maison: null,
      nb_ventes_appartement: null,
      // legacy
      prix_m2: v1Row.prix_m2 ?? null,
      source: v1Row.source ?? "DVF (données publiques)",
      updated_at: v1Row.updated_at ?? null,
      note:
        "Fallback v1 utilisé (prix unique). Remplir dvf_prices_v2 pour maison/appartement séparés.",
    });
  }

  // ----------- 3) Not found -----------
  return json(
    {
      dvf_available: false,
      code_insee: codeInsee || null,
      commune: communeQ || null,
      message:
        "Données DVF non disponibles pour cette commune (couverture en cours).",
      used_table_tried: ["dvf_prices_v2", "dvf_prices"],
    },
    200
  );
};