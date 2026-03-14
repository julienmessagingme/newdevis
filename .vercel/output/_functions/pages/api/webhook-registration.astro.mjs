export { renderers } from '../../renderers.mjs';

const prerender = false;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json"
};
const POST = async ({ request }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Corps de requête invalide" }),
      { status: 400, headers: CORS }
    );
  }
  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return new Response(
      JSON.stringify({ error: "Email requis" }),
      { status: 400, headers: CORS }
    );
  }
  try {
    const res = await fetch("https://ai.messagingme.app/api/iwh/25a2bb855e30cf49b1fc2aac9697478c", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "user_registered",
        email,
        phone: body.phone || "",
        first_name: body.first_name || "",
        last_name: body.last_name || "",
        accept_commercial: body.accept_commercial ?? false,
        source: "inscription",
        registered_at: (/* @__PURE__ */ new Date()).toISOString()
      })
    });
    if (!res.ok) {
      console.error("[webhook-registration] MessagingMe responded:", res.status);
    }
  } catch (e) {
    console.error("[webhook-registration] Webhook error:", e.message);
  }
  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: CORS }
  );
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
