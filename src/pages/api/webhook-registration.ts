export const prerender = false;

import type { APIRoute } from 'astro';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export const POST: APIRoute = async ({ request }) => {
  let body: {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    accept_commercial?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Corps de requête invalide' }),
      { status: 400, headers: CORS },
    );
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return new Response(
      JSON.stringify({ error: 'Email requis' }),
      { status: 400, headers: CORS },
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
        registered_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      console.error('[webhook-registration] MessagingMe responded:', res.status);
    }
  } catch (e) {
    console.error('[webhook-registration] Webhook error:', (e as Error).message);
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: CORS },
  );
};
