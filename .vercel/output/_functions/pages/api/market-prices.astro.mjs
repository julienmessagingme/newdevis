export { renderers } from '../../renderers.mjs';

const prerender = false;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
function computeFiabilite(nb) {
  if (nb === null || nb < 0) return { niveau: "tres_faible", nb_ventes: null };
  if (nb < 10) return { niveau: "tres_faible", nb_ventes: nb };
  if (nb < 30) return { niveau: "faible", nb_ventes: nb };
  if (nb < 100) return { niveau: "moyenne", nb_ventes: nb };
  if (nb < 300) return { niveau: "bonne", nb_ventes: nb };
  return { niveau: "tres_bonne", nb_ventes: nb };
}
const GET = async ({ url }) => {
  const codeInsee = url.searchParams.get("code_insee")?.trim() ?? "";
  if (!/^\d{5}$/.test(codeInsee)) {
    return json({ source: "none", data: null, error: "INVALID_CODE_INSEE" }, 400);
  }
  const typeBienRaw = url.searchParams.get("type_bien")?.toLowerCase().trim() ?? "";
  const typeBien = typeBienRaw === "appartement" ? "appartement" : "maison";
  const SUPA_URL = "https://vhrhgsqxwvouswjaiczn.supabase.co";
  const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZocmhnc3F4d3ZvdXN3amFpY3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MjQzMjEsImV4cCI6MjA4NjMwMDMyMX0.s1LvwmlSSGaCjiPRI8j4op-7xke7h53Ng8nqIkNAAzI";
  const SELECT = [
    "code_insee",
    "commune",
    "prix_m2_maison",
    "prix_m2_appartement",
    "nb_ventes_maison",
    "nb_ventes_appartement",
    "source",
    "updated_at"
  ].join(",");
  const reqUrl = `${SUPA_URL}/rest/v1/dvf_prices_v2?code_insee=eq.${encodeURIComponent(codeInsee)}&select=${encodeURIComponent(SELECT)}&limit=1`;
  try {
    const res = await fetch(reqUrl, {
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(5e3)
    });
    if (!res.ok) {
      console.warn(
        `[market-prices] dvf_prices_v2 HTTP ${res.status} code_insee=${codeInsee}`
      );
      return json({ source: "none", data: null, error: "NO_DATA" });
    }
    const rows = await res.json().catch(() => null);
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!row) {
      console.warn(`[market-prices] NO_DATA code_insee=${codeInsee}`);
      return json({ source: "none", data: null, error: "NO_DATA" });
    }
    const rawPrix = typeBien === "appartement" ? row.prix_m2_appartement : row.prix_m2_maison;
    if (!rawPrix || rawPrix <= 0) {
      console.warn(
        `[market-prices] prix null/0 code_insee=${codeInsee} type=${typeBien}`
      );
      return json({ source: "none", data: null, error: "NO_DATA" });
    }
    const prixM2 = Math.round(rawPrix);
    const nbVentes = typeBien === "appartement" ? row.nb_ventes_appartement : row.nb_ventes_maison;
    const fiabilite = computeFiabilite(nbVentes);
    console.log(
      `[market-prices] ok code_insee=${codeInsee} type=${typeBien} prix=${prixM2} nb_ventes=${nbVentes}`
    );
    return json({
      source: "dvf_prices_v2",
      data: {
        prix_m2: prixM2,
        commune: row.commune,
        code_insee: row.code_insee,
        fiabilite,
        updated_at: row.updated_at ?? null
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[market-prices] error code_insee=${codeInsee}: ${msg}`);
    return json({ source: "none", data: null, error: "NO_DATA" });
  }
};
const OPTIONS = async () => new Response(null, {
  status: 204,
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  }
});

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  OPTIONS,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
