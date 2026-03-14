export { renderers } from '../../renderers.mjs';

const prerender = false;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json"
};
const GET = async ({ url }) => {
  const cp = url.searchParams.get("code_postal")?.trim() ?? "";
  if (!/^\d{5}$/.test(cp)) {
    return new Response(
      JSON.stringify({ communes: [], error: "Code postal invalide (5 chiffres requis)" }),
      { status: 400, headers: CORS }
    );
  }
  try {
    const geoResp = await fetch(
      `https://geo.api.gouv.fr/communes?codePostal=${cp}&fields=code,nom,population&format=json`,
      { signal: AbortSignal.timeout(4e3) }
    );
    if (!geoResp.ok) {
      return new Response(
        JSON.stringify({ communes: [], error: "Service géographique indisponible" }),
        { status: 502, headers: CORS }
      );
    }
    const data = await geoResp.json();
    const communes = (data ?? []).sort((a, b) => (b.population ?? 0) - (a.population ?? 0)).map((c) => ({ nom: c.nom, codeInsee: c.code }));
    return new Response(JSON.stringify({ communes }), { headers: CORS });
  } catch {
    return new Response(
      JSON.stringify({ communes: [], error: "Erreur réseau lors de la résolution du code postal" }),
      { status: 500, headers: CORS }
    );
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
