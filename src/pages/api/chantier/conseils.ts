export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const googleApiKey    = import.meta.env.GOOGLE_API_KEY;

function getSupabase() {
  return createClient(supabaseUrl, supabaseService);
}

/** POST /api/chantier/conseils — Génère 3 conseils pour le projet via Gemini */
export const POST: APIRoute = async ({ request }) => {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });
  }

  const token    = authHeader.slice(7);
  const supabase = getSupabase();

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 401, headers: CORS });
  }

  // ── Body ────────────────────────────────────────────────────────────────────
  let body: { lignesBudget?: { label: string; montant: number }[]; roadmap?: { nom: string; detail: string; isCurrent?: boolean }[] };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers: CORS });
  }

  const { lignesBudget = [], roadmap = [] } = body;

  // ── Prompt ──────────────────────────────────────────────────────────────────
  const budgetLines = lignesBudget
    .map((l) => `${l.label}: ${l.montant.toLocaleString('fr-FR')} €`)
    .join(', ');

  const currentStep = roadmap.find((e) => e.isCurrent);
  const stepContext = currentStep
    ? `Étape en cours : ${currentStep.nom} — ${currentStep.detail}.`
    : '';

  const prompt = [
    'Analyse ce projet de travaux pour un particulier.',
    budgetLines ? `Postes budgétaires : ${budgetLines}.` : '',
    stepContext,
    'Donne exactement 3 conseils simples pour aider ce particulier à bien gérer son chantier.',
    'Les conseils doivent être courts (maximum 25 mots chacun), pratiques et rassurants.',
    'Réponds uniquement en JSON valide, sans markdown ni balises : {"conseils":["conseil 1","conseil 2","conseil 3"]}',
  ]
    .filter(Boolean)
    .join(' ');

  // ── Gemini ──────────────────────────────────────────────────────────────────
  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${googleApiKey}`,
        },
        body: JSON.stringify({
          model: 'gemini-2.0-flash',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 512,
          response_format: { type: 'json_object' },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[api/chantier/conseils] Gemini ${res.status}:`, errText.slice(0, 200));
      throw new Error(`Gemini ${res.status}`);
    }

    const gemini = await res.json();
    const raw    = gemini.choices?.[0]?.message?.content ?? '{}';

    let parsed: { conseils?: string[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('[api/chantier/conseils] JSON parse error, raw:', raw.slice(0, 200));
      throw new Error('JSON parse error');
    }

    const conseils = Array.isArray(parsed.conseils)
      ? parsed.conseils.filter((c): c is string => typeof c === 'string').slice(0, 3)
      : [];

    if (conseils.length === 0) throw new Error('No conseils returned');

    return new Response(JSON.stringify({ conseils }), { status: 200, headers: CORS });
  } catch (e) {
    console.error('[api/chantier/conseils] error:', (e as Error).message);
    return new Response(
      JSON.stringify({ error: 'Service temporairement indisponible' }),
      { status: 503, headers: CORS },
    );
  }
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS' } });
