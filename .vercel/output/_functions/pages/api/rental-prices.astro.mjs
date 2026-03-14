export { renderers } from '../../renderers.mjs';

const prerender = false;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
const GET = async ({ url }) => {
  const codeInsee = url.searchParams.get("code_insee")?.trim() ?? "";
  if (!codeInsee) {
    return json({ source: "rental_prices_v1", data: null, error: "MISSING_CODE_INSEE" }, 400);
  }
  if (!/^\d{5}$/.test(codeInsee)) {
    return json({ source: "rental_prices_v1", data: null, error: "INVALID_CODE_INSEE" }, 400);
  }
  const typeBienRaw = url.searchParams.get("type_bien")?.toLowerCase().trim() ?? "";
  const typeBien = typeBienRaw === "appartement" ? "appartement" : "maison";
  const SUPA_URL = "https://vhrhgsqxwvouswjaiczn.supabase.co";
  const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZocmhnc3F4d3ZvdXN3amFpY3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MjQzMjEsImV4cCI6MjA4NjMwMDMyMX0.s1LvwmlSSGaCjiPRI8j4op-7xke7h53Ng8nqIkNAAzI";
  const SELECT = [
    "code_insee",
    "loyer_m2_maison",
    "loyer_m2_appartement",
    "nb_obs_maison",
    "nb_obs_appartement",
    "source"
  ].join(",");
  const reqUrl = `${SUPA_URL}/rest/v1/rental_prices_v1?code_insee=eq.${encodeURIComponent(codeInsee)}&select=${encodeURIComponent(SELECT)}&limit=1`;
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
        `[rental-prices] rental_prices_v1 HTTP ${res.status} code_insee=${codeInsee}`
      );
      return json({ source: "rental_prices_v1", data: null });
    }
    const rows = await res.json().catch(() => null);
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!row) {
      console.warn(`[rental-prices] NO_DATA code_insee=${codeInsee}`);
      return json({ source: "rental_prices_v1", data: null });
    }
    const rawLoyer = typeBien === "appartement" ? row.loyer_m2_appartement : row.loyer_m2_maison;
    const rawNbObs = typeBien === "appartement" ? row.nb_obs_appartement : row.nb_obs_maison;
    if (!rawLoyer || rawLoyer <= 0) {
      console.warn(
        `[rental-prices] loyer null/0 code_insee=${codeInsee} type=${typeBien}`
      );
      return json({ source: "rental_prices_v1", data: null });
    }
    const loyerM2 = Math.round(rawLoyer * 100) / 100;
    const nbObs = rawNbObs ?? 0;
    console.log(
      `[rental-prices] ok code_insee=${codeInsee} type=${typeBien} loyer=${loyerM2} nb_obs=${nbObs}`
    );
    return json({
      source: "rental_prices_v1",
      data: {
        loyer_m2: loyerM2,
        nb_obs: nbObs
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[rental-prices] error code_insee=${codeInsee}: ${msg}`);
    return json({ source: "rental_prices_v1", data: null });
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
