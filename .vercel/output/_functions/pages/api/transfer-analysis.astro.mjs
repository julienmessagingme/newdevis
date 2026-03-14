export { renderers } from '../../renderers.mjs';

const prerender = false;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
const POST = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (!body?.analysisId || !body?.fromUserId) {
    return json({ error: "Missing analysisId or fromUserId" }, 400);
  }
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return json({ error: "Unauthorized" }, 401);
  }
  {
    return json(
      { error: "Server configuration missing (SUPABASE_SERVICE_ROLE_KEY)" },
      500
    );
  }
};
const OPTIONS = async () => new Response(null, {
  status: 204,
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  }
});

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  OPTIONS,
  POST,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
