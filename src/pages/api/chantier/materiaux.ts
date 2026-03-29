export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireAuth, parseJsonBody } from '@/lib/apiHelpers';

const googleApiKey    = import.meta.env.GOOGLE_API_KEY ?? import.meta.env.GOOGLE_AI_API_KEY;

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
  // Auth required
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;

  if (!googleApiKey) {
    return jsonError('Clé API non configurée', 500);
  }

  // ── Body ─────────────────────────────────────────────────────────────────
  const body = await parseJsonBody<MateriauxRequestBody>(request);
  if (body instanceof Response) return body;

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

    return jsonOk(data);
  } catch (e) {
    console.error('[api/chantier/materiaux] error:', (e as Error).message);
    return jsonError('Service temporairement indisponible', 503);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
