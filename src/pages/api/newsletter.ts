export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

export const POST: APIRoute = async ({ request }) => {
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Configuration serveur manquante' }),
      { status: 500, headers: CORS },
    );
  }

  let body: { email?: string; source?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Corps de requête invalide' }),
      { status: 400, headers: CORS },
    );
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(
      JSON.stringify({ error: 'Adresse email invalide' }),
      { status: 400, headers: CORS },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { error } = await supabase
    .from('newsletter_subscriptions')
    .upsert({ email, source: body.source || 'popup' }, { onConflict: 'email' });

  if (error) {
    console.error('[newsletter] Insert error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Erreur lors de l\'inscription' }),
      { status: 500, headers: CORS },
    );
  }

  // Send webhook for newsletter subscription
  try {
    await fetch("https://ai.messagingme.app/api/iwh/fa98aca201609862553a50cbdda5b8db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "newsletter_subscription",
        email,
        source: body.source || "popup",
        subscribed_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error('[newsletter] Webhook error:', (e as Error).message);
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: CORS },
  );
};
