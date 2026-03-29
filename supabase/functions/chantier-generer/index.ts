import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    {"metier": "Charpentier / Menuisier", "role": "Structure pergola + assemblage", "emoji": "🪚", "statut": "a_trouver", "couleurBg": "rgba(96,165,250,0.1)", "duree_jours_estime": 5, "ordre_planning": 1, "parallel_group": null},
    {"metier": "Poseur terrasse bois", "role": "Pose lambourdes + lames ipé", "emoji": "🪵", "statut": "a_trouver", "couleurBg": "rgba(6,214,199,0.1)", "duree_jours_estime": 4, "ordre_planning": 2, "parallel_group": null},
    {"metier": "Électricien", "role": "Éclairage LED extérieur", "emoji": "⚡", "statut": "a_trouver", "couleurBg": "rgba(245,158,11,0.1)", "duree_jours_estime": 2, "ordre_planning": 3, "parallel_group": null}
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
- Pour chaque artisan, estime aussi la durée d'intervention en jours ouvrés ("duree_jours_estime", 5j = 1 semaine), l'ordre d'intervention ("ordre_planning", 1 = premier) et le groupe parallèle ("parallel_group", même numéro = même créneau, null si séquentiel). Respecte la logique métier du bâtiment : démolition → gros œuvre → charpente → couverture → menuiseries extérieures → plomberie/électricité (parallèle) → plaquiste → carreleur → peintre → menuisier intérieur → nettoyage.
- Roadmap : 4 à 7 phases selon complexité, la 1ère toujours isCurrent:true
- Tâches : 5 à 8 tâches concrètes, toujours AU MOINS 1 "done":true (budget défini)
- Lignes budget : 3 à 5 postes avec des couleurs distinctes
- mensualite : calculer si financement=credit ou mixte (taux 4.5% sur dureeCredit mois)
- Pour financement=apport : omettre mensualite et dureeCredit
- Si des précisions client sont fournies (surfaces, matériaux, dimensions), les utiliser directement
- Si un coefficient de zone géographique est fourni : grande_ville +15-25%, petite_ville -10-15%, ville_moyenne = base
- Ne jamais inventer la localisation — utiliser uniquement les données fournies
- Si budget_tranche est fourni (fourchette indicative), l'utiliser comme référence centrale pour calibrer budgetTotal et lignesBudget, mais rester réaliste : si la fourchette est sous-estimée pour le projet décrit, ajuster légèrement vers le haut et le signaler dans la description
- date_debut fournie = point de départ de la roadmap (calculer les mois en conséquence)
`;

// deno-lint-ignore no-explicit-any
type BodyType = {
  description?: string;
  mode?: string;
  // deno-lint-ignore no-explicit-any
  guidedForm?: Record<string, any>;
  qualificationAnswers?: Record<string, string>;
};

/** Extrait un code postal 5 chiffres depuis les réponses de qualification */
function findPostalCode(answers: Record<string, string>): string | undefined {
  const direct = answers["code_postal"]?.trim();
  if (direct && /^\d{5}$/.test(direct)) return direct;
  for (const val of Object.values(answers)) {
    const match = val?.match(/\b\d{5}\b/);
    if (match) return match[0];
  }
  return undefined;
}

/** Extrait un nom de ville depuis les réponses (quand pas de code postal 5 chiffres) */
function findCityName(answers: Record<string, string>): string | undefined {
  const candidateKeys = ["code_postal", "localisation", "ville"];
  for (const key of candidateKeys) {
    const val = answers[key]?.trim();
    // Nom de ville : texte sans chiffres, au moins 3 caractères
    if (val && val.length >= 3 && !/\d/.test(val)) return val;
  }
  return undefined;
}

/** Résout un nom de ville en code postal via geo.api.gouv.fr */
async function resolvePostalCodeFromCity(cityName: string): Promise<string | undefined> {
  try {
    const encoded = encodeURIComponent(cityName);
    const resp = await fetch(
      `https://geo.api.gouv.fr/communes?nom=${encoded}&fields=codesPostaux,population&limit=5`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!resp.ok) return undefined;
    // deno-lint-ignore no-explicit-any
    const communes: any[] = await resp.json();
    const sorted = (communes ?? []).sort(
      // deno-lint-ignore no-explicit-any
      (a: any, b: any) => (b.population ?? 0) - (a.population ?? 0),
    );
    const cp = sorted[0]?.codesPostaux?.[0];
    return cp ?? undefined;
  } catch {
    return undefined;
  }
}

/** Récupère le contexte géographique depuis Supabase + geo.api.gouv.fr */
async function getLocationContext(postalCode: string, supabaseUrl: string, serviceKey: string) {
  let urbanZoneType = "ville_moyenne";
  let pricingCoefficient = 1.0;
  let cityName: string | undefined;

  try {
    const client = createClient(supabaseUrl, serviceKey);
    const prefix = postalCode.slice(0, 2);
    const { data } = await client
      .from("zones_geographiques")
      .select("type_zone, coefficient")
      .eq("prefixe_postal", prefix)
      .single();
    if (data) {
      urbanZoneType = data.type_zone ?? "ville_moyenne";
      pricingCoefficient = data.coefficient ?? 1.0;
    }
  } catch { /* ignore */ }

  try {
    const geoResp = await fetch(
      `https://geo.api.gouv.fr/communes?codePostal=${postalCode}&fields=nom,population&format=json`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (geoResp.ok) {
      // deno-lint-ignore no-explicit-any
      const communes: any[] = await geoResp.json();
      const sorted = (communes ?? []).sort(
        // deno-lint-ignore no-explicit-any
        (a: any, b: any) => (b.population ?? 0) - (a.population ?? 0),
      );
      cityName = sorted[0]?.nom;
    }
  } catch { /* ignore */ }

  return { postalCode, cityName, urbanZoneType, pricingCoefficient };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const googleApiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

  const { description, mode, guidedForm, qualificationAnswers } = body;

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

  // Flag : devient true si une zone géo a été réellement injectée dans le prompt
  let locationEnriched = false;

  // Enrichir le prompt avec les réponses de qualification
  if (qualificationAnswers && Object.keys(qualificationAnswers).length > 0) {
    const relevantAnswers = Object.entries(qualificationAnswers).filter(
      ([, v]) => v && v.trim() && v !== "Je ne sais pas encore",
    );
    if (relevantAnswers.length > 0) {
      prompt += "\n\nPrécisions apportées par le client :\n";
      prompt += relevantAnswers
        .map(([k, v]) => {
          // Labels lisibles pour les questions fixes connues
          if (k === "budget_tranche") {
            return `- Budget indicatif (fourchette, à affiner avec les devis) : ${v}`;
          }
          if (k === "date_debut") {
            return `- Date de démarrage souhaitée : ${v}`;
          }
          if (k === "code_postal") {
            return `- Localisation du chantier : ${v}`;
          }
          return `- ${k.replace(/_/g, " ")} : ${v}`;
        })
        .join("\n");
    }

    // Enrichissement géographique : code postal direct ou résolution depuis nom de ville
    let postalCode = findPostalCode(qualificationAnswers);
    if (!postalCode) {
      const cityName = findCityName(qualificationAnswers);
      if (cityName) {
        postalCode = await resolvePostalCodeFromCity(cityName).catch(() => undefined);
      }
    }
    if (postalCode && supabaseUrl && supabaseServiceKey) {
      try {
        const locationCtx = await getLocationContext(postalCode, supabaseUrl, supabaseServiceKey);
        const cityLabel = locationCtx.cityName
          ? `${locationCtx.cityName} (${postalCode})`
          : postalCode;
        prompt += `\n\nLocalisation du chantier : ${cityLabel}`;
        prompt += `\nZone géographique : ${locationCtx.urbanZoneType} (coefficient de prix : ${locationCtx.pricingCoefficient})`;
        locationEnriched = true; // ← zone réellement utilisée dans le prompt
      } catch { /* enrichissement non bloquant */ }
    }
  }

  // ── Dates chantier — déduites des réponses de qualification ─────────────────
  // 3 cas : "Je connais ma date de début", "Je connais ma date de fin souhaitée", "Je ne sais pas encore"
  let dateDebutChantier: string | undefined;
  let dateFinSouhaitee: string | undefined;
  {
    const dateAnswer = qualificationAnswers?.date_chantier ?? qualificationAnswers?.date_debut_chantier ?? qualificationAnswers?.date_debut;
    if (dateAnswer && dateAnswer !== "Je ne sais pas encore") {
      if (dateAnswer === "Je connais ma date de début" || dateAnswer === "Je connais ma date de fin souhaitée") {
        // L'utilisateur a choisi une option mais doit ensuite saisir la date concrète
        // La date réelle sera renseignée plus tard dans l'interface Planning
      } else {
        // L'utilisateur a saisi une date en texte libre
        const parsed = new Date(dateAnswer);
        if (!isNaN(parsed.getTime())) {
          // Heuristique : si le texte contient "fin" ou "avant", c'est une date de fin
          const lowerAnswer = dateAnswer.toLowerCase();
          if (lowerAnswer.includes('fin') || lowerAnswer.includes('avant') || lowerAnswer.includes('terminé') || lowerAnswer.includes('livr')) {
            dateFinSouhaitee = parsed.toISOString().slice(0, 10);
          } else {
            dateDebutChantier = parsed.toISOString().slice(0, 10);
          }
        } else {
          // Essayer d'extraire un mois/année (ex: "juin 2026", "septembre prochain")
          const monthMatch = dateAnswer.match(/(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s*(\d{4})?/i);
          if (monthMatch) {
            const monthNames = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
            const monthIdx = monthNames.indexOf(monthMatch[1].toLowerCase());
            const year = monthMatch[2] ? parseInt(monthMatch[2]) : new Date().getFullYear();
            const d = new Date(year, monthIdx, 1);
            if (!isNaN(d.getTime())) {
              const lowerAnswer = dateAnswer.toLowerCase();
              if (lowerAnswer.includes('fin') || lowerAnswer.includes('avant')) {
                dateFinSouhaitee = d.toISOString().slice(0, 10);
              } else {
                dateDebutChantier = d.toISOString().slice(0, 10);
              }
            }
          }
        }
      }
    }
  }

  // ── Signaux factuels — calculés AVANT l'appel Gemini, aucune IA ──────────────
  // hasLocalisation : zone enrichie par DB (mode libre) OU code postal dans description (mode guidé)
  const hasLocalisation =
    locationEnriched ||
    (mode === "guide" && /\b\d{5}\b/.test(description ?? ""));

  // hasBudget : fourchette répondue (mode libre) OU budget saisi dans le formulaire (mode guidé)
  const hasBudget =
    !!(
      qualificationAnswers?.budget_tranche &&
      qualificationAnswers.budget_tranche !== "Je ne sais pas encore"
    ) ||
    (mode === "guide" && Number(guidedForm?.budget ?? 0) > 0);

  // hasDate : date répondue (mode libre) OU date choisie dans le formulaire (mode guidé)
  const hasDate =
    !!(
      qualificationAnswers?.date_debut &&
      qualificationAnswers.date_debut !== "Je ne sais pas encore"
    ) ||
    (mode === "guide" && !!(guidedForm?.dateLabelFr));

  // hasSurface : dimensions détectées dans le prompt enrichi (covers toutes les sources)
  // Formats : 10x4 | 10 x 4 | 8m x 4m | 25 m² | 30m2 | 15 ml
  const hasSurface =
    /\d+\s*[xX×]\s*\d+/i.test(prompt) ||
    /\d+\s*(m²|m2)/i.test(prompt) ||
    /\d+\s*m\s*[xX×]\s*\d+\s*m/i.test(prompt) ||
    /\d+\s*ml\b/i.test(prompt);

  // Objet partiel — typeProjetPrecis et nbLignesBudget complétés après parsing Gemini
  // deno-lint-ignore no-explicit-any
  const estimationSignaux: Record<string, any> = {
    hasLocalisation,
    hasBudget,
    hasDate,
    hasSurface,
    typeProjetPrecis: false,   // complété après parsing
    nbLignesBudget: 0,         // complété après parsing
  };

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

  // Compléter les signaux avec les données issues du JSON Gemini
  estimationSignaux.typeProjetPrecis = parsed.typeProjet !== "autre";
  estimationSignaux.nbLignesBudget = Array.isArray(parsed.lignesBudget)
    ? parsed.lignesBudget.length
    : 0;

  const result = {
    ...parsed,
    promptOriginal: prompt,
    generatedAt: new Date().toISOString(),
    estimationSignaux,
    ...(dateDebutChantier ? { dateDebutChantier } : {}),
    ...(dateFinSouhaitee ? { dateFinSouhaitee } : {}),
  };

  return new Response(
    JSON.stringify({ result }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
});
