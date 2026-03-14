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
  const cp = url.searchParams.get("code_postal")?.trim() ?? "";
  if (!/^\d{5}$/.test(cp)) {
    return json({ data: [], error: "INVALID_POSTAL" }, 400);
  }
  const SUPA_URL = "https://vhrhgsqxwvouswjaiczn.supabase.co";
  const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZocmhnc3F4d3ZvdXN3amFpY3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MjQzMjEsImV4cCI6MjA4NjMwMDMyMX0.s1LvwmlSSGaCjiPRI8j4op-7xke7h53Ng8nqIkNAAzI";
  try {
    const reqUrl = `${SUPA_URL}/rest/v1/postal_insee?code_postal=eq.${encodeURIComponent(cp)}&select=code_insee,commune&order=commune.asc`;
    const res = await fetch(reqUrl, {
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(4e3)
    });
    if (!res.ok) {
      console.warn(`[postal-lookup] Supabase ${res.status} cp=${cp}`);
      return json({ data: [], error: "SUPABASE_ERROR" });
    }
    const rows = await res.json();
    const data = (rows ?? []).map((r) => ({
      commune: r.commune,
      code_insee: r.code_insee
    }));
    if (data.length === 0) return json({ data: [], error: "NO_MATCH" });
    return json({ data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[postal-lookup] Exception cp=${cp}:`, msg);
    return json({ data: [], error: "NETWORK_ERROR" }, 500);
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
