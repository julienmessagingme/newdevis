export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const googleApiKey    = import.meta.env.GOOGLE_API_KEY ?? import.meta.env.GOOGLE_AI_API_KEY;

function getSupabase() {
  return createClient(supabaseUrl, supabaseService);
}

interface MateriauxRequestBody {
  description: string;
  lots?: string[];
  currentStep: string;
}

const SYSTEM_PROMPT = `Tu es un expert en rénovation et construction.
À partir de la description du projet fournie, identifie le ou les types de matériaux principaux à choisir.
Pour chaque type, propose exactement 3 options avec :
- name: nom commercial du matériau (en français)
- description: 1 phrase courte (avantage principal)
- priceMin: prix min en €/m² ou €/unité (nombre entier)
- priceMax: prix max en €/m² ou €/unité (nombre entier)
- unit: "m²" ou "ml" ou "unité"
- imageQuery: un mot-clé précis en anglais pour trouver une photo (ex: "grey composite decking wood", "white ceramic tile bathroom floor")
- tier: "économique" | "intermédiaire" | "premium"
- tags: tableau de max 2 mots clés caractéristiques courts

Exemples de logique :
- "terrasse en bois" → options: composite, pin traité, bois exotique
- "mur mitoyen" → options: brique rouge, parpaing, brique monomur
- "carrelage salle de bain" → options: céramique, grès cérame, marbre
- "isolation combles" → options: laine de verre, ouate cellulose, laine roche
- "enduit façade" → options: enduit monocouche, enduit à la chaux, ITE

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte avant ou après.
Format exact :
{
  "travaux_type": "string descriptif en français",
  "materiaux": [
    {
      "id": "mat_1",
      "name": "...",
      "description": "...",
      "priceMin": 0,
      "priceMax": 0,
      "unit": "m²",
      "imageQuery": "...",
      "tier": "économique",
      "tags": ["...", "..."]
    },
    { "id": "mat_2", "name": "...", "description": "...", "priceMin": 0, "priceMax": 0, "unit": "m²", "imageQuery": "...", "tier": "intermédiaire", "tags": [] },
    { "id": "mat_3", "name": "...", "description": "...", "priceMin": 0, "priceMax": 0, "unit": "m²", "imageQuery": "...", "tier": "premium", "tags": [] }
  ]
}`;

/** POST /api/chantier/materiaux — Génère 3 options matériaux via Gemini 2.0-flash */
export const POST: APIRoute = async ({ request }) => {
  // ── Auth optionnelle (données dans le body, pas en DB) ────────────────────
  // On vérifie le token si présent mais on ne bloque pas si absent
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ') && supabaseService) {
    const token    = authHeader.slice(7);
    const supabase = getSupabase();
    const { error: authError } = await supabase.auth.getUser(token);
    if (authError) {
      console.warn('[api/chantier/materiaux] Token non valide, accès toléré:', authError.message);
    }
  }

  if (!googleApiKey) {
    return new Response(JSON.stringify({ error: 'Clé API non configurée' }), { status: 500, headers: CORS });
  }

  // ── Body ─────────────────────────────────────────────────────────────────
  let body: MateriauxRequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers: CORS });
  }

  const { description = '', lots = [], currentStep = '' } = body;

  const userMessage = [
    `Projet : ${description}`,
    lots.length > 0 ? `Lots de travaux : ${lots.join(', ')}` : '',
    `Étape actuelle nécessitant un choix de matériau : ${currentStep}`,
  ].filter(Boolean).join('\n');

  // ── Appel Gemini ──────────────────────────────────────────────────────────
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
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: userMessage   },
          ],
          max_tokens: 1024,
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[api/chantier/materiaux] Gemini ${res.status}:`, errText.slice(0, 200));
      throw new Error(`Gemini ${res.status}`);
    }

    const gemini = await res.json();
    const raw    = gemini.choices?.[0]?.message?.content ?? '';

    // Nettoyage markdown éventuel + parse JSON
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const data    = JSON.parse(cleaned);

    if (!Array.isArray(data.materiaux) || data.materiaux.length === 0) {
      throw new Error('Réponse Gemini invalide : pas de matériaux');
    }

    return new Response(JSON.stringify(data), { status: 200, headers: CORS });
  } catch (e) {
    console.error('[api/chantier/materiaux] error:', (e as Error).message);
    return new Response(
      JSON.stringify({ error: 'Service temporairement indisponible' }),
      { status: 503, headers: CORS },
    );
  }
};

export const OPTIONS: APIRoute = () =>
  new Response(null, {
    status: 204,
    headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS' },
  });
