import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT_CHANTIER = `
Tu es un expert en gestion de chantier pour particuliers en France (2026).
À partir d'une description de projet de travaux, tu génères un plan complet.
RÈGLE ABSOLUE : Retourner UNIQUEMENT du JSON valide, sans markdown, sans backticks,
sans texte avant ou après. Commence directement par { et termine par }.

Structure JSON exacte à retourner :
{
  "nom": "Nom court du projet (4-6 mots max)",
  "emoji": "1 emoji représentatif",
  "description": "Résumé en 1 phrase courte",
  "typeProjet": "pergola|terrasse|salle_de_bain|cuisine|extension|isolation|toiture|piscine|electricite|plomberie|renovation_maison|autre",
  "budgetTotal": 20000,
  "dureeEstimeeMois": 2,
  "nbArtisans": 3,
  "nbFormalites": 2,
  "financement": "apport|credit|mixte",
  "mensualite": 583,
  "dureeCredit": 36,
  "lignesBudget": [
    {"label": "Structure pergola", "montant": 8000, "couleur": "#60a5fa"},
    {"label": "Terrasse bois", "montant": 7000, "couleur": "#06d6c7"},
    {"label": "Éclairage LED", "montant": 2000, "couleur": "#f59e0b"},
    {"label": "Divers / imprévus", "montant": 3000, "couleur": "#6b7280"}
  ],
  "roadmap": [
    {"numero": 1, "nom": "Conception & devis", "detail": "3 artisans à contacter", "mois": "Mai 2026", "phase": "preparation", "isCurrent": true},
    {"numero": 2, "nom": "Autorisations mairie", "detail": "Déclaration préalable", "mois": "Juin 2026", "phase": "autorisations", "isCurrent": false},
    {"numero": 3, "nom": "Travaux structure", "detail": "Charpentier + menuisier", "mois": "Juillet 2026", "phase": "travaux", "isCurrent": false},
    {"numero": 4, "nom": "Finitions & éclairage", "detail": "Électricien + peintre", "mois": "Août 2026", "phase": "finitions", "isCurrent": false},
    {"numero": 5, "nom": "Réception chantier", "detail": "Visite de conformité", "mois": "Septembre 2026", "phase": "reception", "isCurrent": false}
  ],
  "artisans": [
    {"metier": "Charpentier / Menuisier", "role": "Structure pergola + assemblage", "emoji": "🪚", "statut": "a_trouver", "couleurBg": "rgba(96,165,250,0.1)"},
    {"metier": "Poseur terrasse bois", "role": "Pose lambourdes + lames ipé", "emoji": "🪵", "statut": "a_trouver", "couleurBg": "rgba(6,214,199,0.1)"},
    {"metier": "Électricien", "role": "Éclairage LED extérieur", "emoji": "⚡", "statut": "a_trouver", "couleurBg": "rgba(245,158,11,0.1)"}
  ],
  "formalites": [
    {"nom": "Déclaration préalable de travaux", "detail": "Mairie · Pergola > 5m² · Délai 1 mois", "emoji": "📄", "obligatoire": true},
    {"nom": "Assurance dommages-ouvrage", "detail": "Recommandée pour travaux > 15 000 €", "emoji": "🛡️", "obligatoire": false}
  ],
  "taches": [
    {"titre": "Vérifier règles d'urbanisme (PLU)", "priorite": "urgent", "done": false},
    {"titre": "Déposer déclaration préalable en mairie", "priorite": "urgent", "done": false},
    {"titre": "Demander 3 devis comparatifs", "priorite": "important", "done": false},
    {"titre": "Vérifier assurances artisans (RC Pro + décennale)", "priorite": "important", "done": false},
    {"titre": "Définir le budget et le financement", "priorite": "normal", "done": true},
    {"titre": "Choisir les matériaux (essence bois, coloris)", "priorite": "normal", "done": false}
  ],
  "aides": [
    {"nom": "TVA à 10%", "detail": "Sur main d'œuvre · Logement > 2 ans · Economie estimée", "montant": 1800, "eligible": true, "emoji": "🌿", "couleur": "#10d98a"},
    {"nom": "Eco-prêt à taux zéro", "detail": "Si travaux isolation inclus · Montant jusqu'à 30 000 €", "montant": null, "eligible": false, "emoji": "🏦", "couleur": "#6b7280"}
  ],
  "prochaineAction": {
    "titre": "Déposer la déclaration préalable de travaux",
    "detail": "En mairie · Délai d'instruction : 1 mois · À faire avant le 15 avril",
    "deadline": "15 avril 2026"
  },
  "generatedAt": "",
  "promptOriginal": ""
}

Règles métier France 2026 :
- Budget : estimations réalistes (main d'œuvre + matériaux + TVA 20% ou 10%)
- Pergola > 5m² → déclaration préalable obligatoire
- Extension > 20m² → permis de construire obligatoire
- Piscine > 10m² → déclaration préalable
- Électricité → Consuel obligatoire (formalité)
- TVA 10% si logement > 2 ans et montant < 300k€ (eligible par défaut)
- MaPrimeRénov' si isolation/chauffage (vérifier éligibilité selon revenus)
- Durée réaliste selon complexité du projet
- Artisans : TOUS les corps de métier nécessaires (jamais oublier électricien si éclairage)
- Roadmap : 4 à 7 phases selon complexité, la 1ère toujours isCurrent:true
- Tâches : 5 à 8 tâches concrètes, toujours AU MOINS 1 "done":true (budget défini)
- Lignes budget : 3 à 5 postes avec des couleurs distinctes
- mensualite : calculer si financement=credit ou mixte (taux 4.5% sur dureeCredit mois)
- Pour financement=apport : omettre mensualite et dureeCredit
`;

// deno-lint-ignore no-explicit-any
type BodyType = { description?: string; mode?: string; guidedForm?: Record<string, any> };

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const googleApiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!googleApiKey) {
    return new Response(
      JSON.stringify({ error: "Clé API Google AI non configurée" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  let body: BodyType;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Corps de requête invalide" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const { description, mode, guidedForm } = body;

  // Build prompt
  let prompt = description ?? "";
  if (mode === "guide" && guidedForm) {
    const parts: string[] = [];
    if (guidedForm.typeProjet) parts.push(`Type de projet : ${guidedForm.typeProjet}`);
    if (guidedForm.budget) parts.push(`Budget estimé : ${Number(guidedForm.budget).toLocaleString("fr-FR")} €`);
    if (guidedForm.financement) {
      const fin = guidedForm.financement as string;
      const duree = guidedForm.dureeCredit ? ` sur ${guidedForm.dureeCredit}` : "";
      parts.push(`Financement : ${fin}${fin !== "apport" ? duree : ""}`);
    }
    if (guidedForm.dateLabelFr) parts.push(`Date de début souhaitée : ${guidedForm.dateLabelFr}`);
    prompt = parts.join("\n");
  }

  if (!prompt.trim()) {
    return new Response(
      JSON.stringify({ error: "Description du projet requise" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  // Call Gemini 2.0 flash
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
        temperature: 0.2,
        max_tokens: 4096,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_CHANTIER },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[chantier-generer] fetch to Gemini failed:", msg);
    return new Response(
      JSON.stringify({ error: "Impossible de contacter l'IA" }),
      { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  if (!apiResponse.ok) {
    const errText = await apiResponse.text();
    console.error("[chantier-generer] Gemini error:", errText.slice(0, 300));
    return new Response(
      JSON.stringify({ error: "Génération IA échouée" }),
      { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const apiData = await apiResponse.json();
  const rawText: string = apiData?.choices?.[0]?.message?.content ?? "";
  const clean = rawText.replace(/```json|```/g, "").trim();

  // deno-lint-ignore no-explicit-any
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(clean);
  } catch {
    console.error("[chantier-generer] JSON parse error. Raw:", clean.slice(0, 300));
    return new Response(
      JSON.stringify({ error: "Erreur de parsing de la réponse IA" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const result = {
    ...parsed,
    promptOriginal: prompt,
    generatedAt: new Date().toISOString(),
  };

  return new Response(
    JSON.stringify({ result }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
});
