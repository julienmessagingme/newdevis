export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import type { FollowUpQuestion } from '@/types/chantier-ia';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const googleApiKey = import.meta.env.GOOGLE_AI_API_KEY ?? import.meta.env.GOOGLE_API_KEY;

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

const CORS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const SYSTEM_PROMPT_QUALIFIER = `
Tu es un expert en travaux de construction et rénovation en France.
À partir de la description d'un projet de travaux, génère exactement 4 ou 5 questions contextuelles
pour collecter les informations essentielles manquantes avant de créer un plan personnalisé.
RÈGLE ABSOLUE : Retourner UNIQUEMENT du JSON valide. Commence directement par { et termine par }.

Format JSON strict :
{
  "followUpQuestions": [
    {
      "id": "identifiant_snake_case",
      "label": "Question claire et courte ?",
      "type": "single_choice",
      "placeholder": null,
      "choices": ["Option A", "Option B", "Option C", "Je ne sais pas encore"],
      "required": true,
      "reason": "Impact sur le plan"
    }
  ]
}

Règles de génération :
1. EXACTEMENT 4 ou 5 questions — ni plus, ni moins
2. Si le code postal ou la ville N'EST PAS mentionné dans la description : ajouter une question id="code_postal", type="text", label="Dans quelle ville ou quel code postal se situe le chantier ?", placeholder="Ex: Paris, 33000, 69001..."
3. Prioriser par impact : surface/dimensions > type exact de travaux > matériaux/gamme > localisation
4. Chaque type "single_choice" ou "text_or_choice" : toujours inclure "Je ne sais pas encore" comme DERNIÈRE option
5. type "text" : pour code postal, dimensions libres (sans liste de choix, placeholder obligatoire)
6. type "single_choice" : choix exclusifs (2-4 options + "Je ne sais pas encore")
7. type "text_or_choice" : options prédéfinies ET possibilité de texte libre (2-3 options + "Je ne sais pas encore")
8. Langage simple, rassurant, non-technique — pour des particuliers non-experts
9. Maximum 4 options dans choices avant "Je ne sais pas encore"
10. ids uniques en snake_case descriptif (ex: piscine_surface, terrasse_materiau, code_postal)
11. INTERDIT ABSOLU — Ne jamais poser de question sur le budget, le prix, le coût, le financement ou l'enveloppe financière. L'outil estime lui-même le budget : demander à l'utilisateur son budget est inutile et contre-productif. Si tu manques une question contextuelle, pose plutôt une question sur la gamme/qualité souhaitée (Économique / Standard / Haut de gamme) ou sur les contraintes techniques.
`;

/** POST /api/chantier/qualifier — génère des questions contextuelles via Gemini */
export const POST: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });
  }
  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 401, headers: CORS });
  }

  if (!googleApiKey) {
    return new Response(JSON.stringify({ questions: [] }), { headers: CORS });
  }

  let body: { description?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide' }), { status: 400, headers: CORS });
  }

  const description = body.description?.trim();
  if (!description) {
    return new Response(JSON.stringify({ error: 'Description requise' }), { status: 400, headers: CORS });
  }

  try {
    const apiResponse = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${googleApiKey}`,
      },
      body: JSON.stringify({
        model: 'gemini-2.0-flash',
        temperature: 0.3,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_QUALIFIER },
          { role: 'user', content: `Description du projet : ${description}` },
        ],
      }),
    });

    if (!apiResponse.ok) {
      console.error('[qualifier] Gemini error:', apiResponse.status);
      return new Response(JSON.stringify({ questions: [] }), { headers: CORS });
    }

    const data = await apiResponse.json();
    const rawText: string = data?.choices?.[0]?.message?.content ?? '';
    const clean = rawText.replace(/```json|```/g, '').trim();

    let parsed: { followUpQuestions?: FollowUpQuestion[] };
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error('[qualifier] JSON parse error:', clean.slice(0, 200));
      return new Response(JSON.stringify({ questions: [] }), { headers: CORS });
    }

    // Filtre côté serveur : supprimer toute question liée au budget/coût
    // (règle de prompt parfois ignorée par le modèle)
    const BUDGET_KEYWORDS = /budget|prix|coût|cout|financement|enveloppe|tarif|montant|combien/i;
    const filtered = (parsed.followUpQuestions ?? [])
      .filter((q) => !BUDGET_KEYWORDS.test(q.label) && !BUDGET_KEYWORDS.test(q.id))
      .slice(0, 5);

    return new Response(JSON.stringify({ questions: filtered }), { headers: CORS });
  } catch (err) {
    console.error('[qualifier] Error:', err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ questions: [] }), { headers: CORS });
  }
};

export const OPTIONS: APIRoute = () =>
  new Response(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS' },
  });
