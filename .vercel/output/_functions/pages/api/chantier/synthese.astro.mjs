export { renderers } from '../../../renderers.mjs';

const prerender = false;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json"
};
const POST = async ({ request }) => {
  {
    return new Response(JSON.stringify({ error: "Clé API Google AI non configurée" }), { status: 500, headers: CORS });
  }
};
const OPTIONS = () => new Response(null, {
  status: 204,
  headers: { ...CORS, "Access-Control-Allow-Methods": "POST,OPTIONS" }
});

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  OPTIONS,
  POST,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
