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
      "reason": "Impact sur le budget"
    }
  ]
}

OBJECTIF UNIQUE : Identifier les variables qui ont un impact DIRECT ET FORT sur le coût des travaux.
Chaque question doit pouvoir faire varier le budget estimé d'au moins 15 %.

Questions AUTORISÉES (adapte selon le projet) :
- Surface ou dimensions (m², ml) — fort impact prix
- Matériaux ou gamme souhaitée (Économique / Standard / Haut de gamme) — fort impact prix
- Type de structure ou technique (ex : béton / bois / métal) — fort impact prix
- État actuel du bien / travaux de démolition nécessaires — fort impact prix
- Contraintes d'accès ou de chantier (cave, étage, terrain pentu...) — fort impact prix
- Si localisation non précisée : code postal / ville — impact coefficient géographique

Questions STRICTEMENT INTERDITES — ne jamais poser :
- Budget, prix, coût, financement, enveloppe, tarif, montant → L'outil calcule lui-même le budget, c'est son rôle
- Date de démarrage, délais, planning, quand commencer → Aucun impact sur le coût estimé
- Nombre de devis souhaités, recherche d'artisans → Hors-sujet pour l'estimation
- Durée des travaux → Conséquence du chantier, pas une entrée

Règles de format :
1. EXACTEMENT 4 ou 5 questions — ni plus, ni moins
2. Si localisation absente : forcer id="code_postal", type="text", label="Dans quelle ville ou quel code postal se situe le chantier ?", placeholder="Ex: Paris, 33000, 69001..."
3. Ordonner par impact décroissant : surface > matériaux/gamme > technique > contraintes > localisation
4. Chaque type "single_choice" ou "text_or_choice" : toujours inclure "Je ne sais pas encore" en DERNIÈRE position
5. type "text" : code postal ou dimensions libres (placeholder obligatoire, pas de choices)
6. type "single_choice" : 2-4 options + "Je ne sais pas encore"
7. type "text_or_choice" : 2-3 options prédéfinies + "Je ne sais pas encore" + texte libre
8. Langage simple, rassurant, non-technique — pour des particuliers
9. ids uniques en snake_case (ex: piscine_surface, facade_materiau, code_postal)
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

    // Filtre côté serveur : supprimer toute question hors-scope (budget, date, artisans)
    // Filet de sécurité au cas où le modèle ignore les interdictions du prompt
    const BANNED_KEYWORDS = /budget|prix|co[uû]t|financement|enveloppe|tarif|montant|combien|d[eé]marr|d[eé]lai|planning|quand|artisan|devis|dur[eé]e/i;
    const filtered = (parsed.followUpQuestions ?? [])
      .filter((q) => !BANNED_KEYWORDS.test(q.label) && !BANNED_KEYWORDS.test(q.id))
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
