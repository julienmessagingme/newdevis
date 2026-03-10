import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
11. Ne pas poser de questions sur le budget ou le financement (déjà gérés ailleurs)
`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const googleApiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!googleApiKey) {
    return new Response(
      JSON.stringify({ questions: [] }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  let body: { description?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Corps de requête invalide" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const description = body.description?.trim();
  if (!description) {
    return new Response(
      JSON.stringify({ error: "Description requise" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  let apiResponse: Response;
  try {
    apiResponse = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${googleApiKey}`,
      },
      body: JSON.stringify({
        model: "gemini-2.0-flash",
        temperature: 0.3,
        max_tokens: 1500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_QUALIFIER },
          { role: "user", content: `Description du projet : ${description}` },
        ],
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[chantier-qualifier] fetch to Gemini failed:", msg);
    return new Response(
      JSON.stringify({ questions: [] }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  if (!apiResponse.ok) {
    const errText = await apiResponse.text();
    console.error("[chantier-qualifier] Gemini error:", errText.slice(0, 200));
    return new Response(
      JSON.stringify({ questions: [] }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const data = await apiResponse.json();
  const rawText: string = data?.choices?.[0]?.message?.content ?? "";
  const clean = rawText.replace(/```json|```/g, "").trim();

  // deno-lint-ignore no-explicit-any
  let parsed: { followUpQuestions?: any[] };
  try {
    parsed = JSON.parse(clean);
  } catch {
    console.error("[chantier-qualifier] JSON parse error:", clean.slice(0, 200));
    return new Response(
      JSON.stringify({ questions: [] }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const questions = (parsed.followUpQuestions ?? []).slice(0, 5);
  return new Response(
    JSON.stringify({ questions }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
});
