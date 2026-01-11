import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const PAPPERS_API_URL = "https://api.pappers.fr/v2";
const BODACC_API_URL = "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records";

// ============ PRICE COMPARISON LOGIC ============

interface PriceComparisonResult {
  score: "VERT" | "ORANGE" | "ROUGE";
  prixUnitaireDevis: number;
  fourchetteBasse: number;
  fourchetteHaute: number;
  coefficient: number;
  zoneType: string;
  explication: string;
  alerte?: string;
  point_ok?: string;
}

interface TravauxReferencePrix {
  categorie_travaux: string;
  unite: string;
  prix_min_national: number;
  prix_max_national: number;
  description: string | null;
}

interface ZoneGeographique {
  prefixe_postal: string;
  type_zone: string;
  coefficient: number;
}

// Get zone coefficient from postal code
function getZoneCoefficient(codePostal: string, zones: ZoneGeographique[]): { coefficient: number; zoneType: string } {
  const prefix = codePostal.substring(0, 2);
  const zone = zones.find(z => z.prefixe_postal === prefix);
  
  if (zone) {
    return { coefficient: zone.coefficient, zoneType: zone.type_zone };
  }
  
  // Default: province (coefficient 0.90) if not found
  return { coefficient: 0.90, zoneType: "province" };
}

// Compare quote price with reference
function comparePrix(
  categorieTravaux: string,
  quantite: number,
  montantHT: number,
  codePostal: string,
  referencePrix: TravauxReferencePrix[],
  zones: ZoneGeographique[]
): PriceComparisonResult | null {
  // Find reference price for the category
  const reference = referencePrix.find(r => 
    r.categorie_travaux.toLowerCase() === categorieTravaux.toLowerCase()
  );
  
  if (!reference) {
    return null; // Category not found in reference
  }
  
  // Calculate unit price from quote
  const prixUnitaireDevis = montantHT / quantite;
  
  // Get zone coefficient
  const { coefficient, zoneType } = getZoneCoefficient(codePostal, zones);
  
  // Adjust price range with coefficient
  const fourchetteBasse = reference.prix_min_national * coefficient;
  const fourchetteHaute = reference.prix_max_national * coefficient;
  
  // Compare and determine score
  let score: "VERT" | "ORANGE" | "ROUGE";
  let explication: string;
  let alerte: string | undefined;
  let point_ok: string | undefined;
  
  const zoneLabel = zoneType === "grande_ville" ? "grande ville" : 
                    zoneType === "ville_moyenne" ? "ville moyenne" : "province";
  
  if (prixUnitaireDevis < fourchetteBasse * 0.7) {
    // More than 30% below minimum = RED (suspiciously low)
    score = "ROUGE";
    explication = `Le prix unitaire de ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} est anormalement bas. ` +
      `Pour cette zone (${zoneLabel}), les prix de marché sont entre ${fourchetteBasse.toFixed(2)}€ et ${fourchetteHaute.toFixed(2)}€/${reference.unite}. ` +
      `Un prix aussi bas peut indiquer des matériaux de qualité inférieure, du travail non déclaré, ou une mauvaise estimation qui pourrait entraîner des suppléments.`;
    alerte = `🚨 Prix anormalement bas: ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} (fourchette marché: ${fourchetteBasse.toFixed(2)}€-${fourchetteHaute.toFixed(2)}€)`;
  } else if (prixUnitaireDevis < fourchetteBasse) {
    // Between 70% and 100% of minimum = ORANGE (low)
    score = "ORANGE";
    explication = `Le prix unitaire de ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} est en dessous de la fourchette de marché. ` +
      `Pour cette zone (${zoneLabel}), les prix sont généralement entre ${fourchetteBasse.toFixed(2)}€ et ${fourchetteHaute.toFixed(2)}€/${reference.unite}. ` +
      `Vérifiez les prestations incluses et la qualité des matériaux proposés.`;
    alerte = `⚠️ Prix bas: ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} (fourchette marché: ${fourchetteBasse.toFixed(2)}€-${fourchetteHaute.toFixed(2)}€)`;
  } else if (prixUnitaireDevis <= fourchetteHaute) {
    // Within range = GREEN
    score = "VERT";
    explication = `Le prix unitaire de ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} est dans la fourchette de marché. ` +
      `Pour cette zone (${zoneLabel}), les prix sont entre ${fourchetteBasse.toFixed(2)}€ et ${fourchetteHaute.toFixed(2)}€/${reference.unite}. Le prix est cohérent.`;
    point_ok = `✓ Prix cohérent: ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} (fourchette marché: ${fourchetteBasse.toFixed(2)}€-${fourchetteHaute.toFixed(2)}€)`;
  } else if (prixUnitaireDevis <= fourchetteHaute * 1.3) {
    // Up to 30% above maximum = ORANGE (high)
    score = "ORANGE";
    explication = `Le prix unitaire de ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} est au-dessus de la fourchette de marché. ` +
      `Pour cette zone (${zoneLabel}), les prix sont généralement entre ${fourchetteBasse.toFixed(2)}€ et ${fourchetteHaute.toFixed(2)}€/${reference.unite}. ` +
      `Ce n'est pas anormal si des prestations premium ou des matériaux haut de gamme sont inclus. Demandez des précisions.`;
    alerte = `⚠️ Prix élevé: ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} (fourchette marché: ${fourchetteBasse.toFixed(2)}€-${fourchetteHaute.toFixed(2)}€)`;
  } else {
    // More than 30% above maximum = RED (excessively high)
    score = "ROUGE";
    explication = `Le prix unitaire de ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} est très au-dessus du marché. ` +
      `Pour cette zone (${zoneLabel}), les prix sont entre ${fourchetteBasse.toFixed(2)}€ et ${fourchetteHaute.toFixed(2)}€/${reference.unite}. ` +
      `Sans justification claire (matériaux exceptionnels, conditions d'accès difficiles), ce prix semble excessif. Demandez un second devis.`;
    alerte = `🚨 Prix excessif: ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} (fourchette marché: ${fourchetteBasse.toFixed(2)}€-${fourchetteHaute.toFixed(2)}€)`;
  }
  
  return {
    score,
    prixUnitaireDevis,
    fourchetteBasse,
    fourchetteHaute,
    coefficient,
    zoneType,
    explication,
    alerte,
    point_ok
  };
}

// ============ END PRICE COMPARISON ============

interface BodaccResult {
  hasProcedure: boolean;
  procedures: string[];
  alertes: string[];
  points_ok: string[];
}

async function checkBodaccProcedures(siren: string): Promise<BodaccResult> {
  const result: BodaccResult = {
    hasProcedure: false,
    procedures: [],
    alertes: [],
    points_ok: [],
  };

  try {
    // Search BODACC for the company using SIREN
    const searchQuery = encodeURIComponent(`registre:${siren}`);
    const response = await fetch(
      `${BODACC_API_URL}?limit=20&where=${searchQuery}`,
      { method: "GET" }
    );

    if (!response.ok) {
      console.log("BODACC API error:", response.status);
      return result;
    }

    const data = await response.json();
    const records = data.results || [];

    if (records.length === 0) {
      result.points_ok.push("✓ Aucune annonce BODACC trouvée (pas de procédure collective publiée)");
      return result;
    }

    // Check for collective procedures in the announcements
    const procedureKeywords = [
      "liquidation judiciaire",
      "redressement judiciaire",
      "sauvegarde",
      "plan de cession",
      "jugement d'ouverture",
      "jugement de clôture pour insuffisance d'actif",
    ];

    for (const record of records) {
      const annonce = record.contenu || record.annonce || "";
      const nature = record.nature || record.familleavis || "";
      const datePublication = record.dateparution || record.date_publication || "";

      const annonceText = `${annonce} ${nature}`.toLowerCase();

      for (const keyword of procedureKeywords) {
        if (annonceText.includes(keyword)) {
          result.hasProcedure = true;
          const procedureInfo = `${keyword.charAt(0).toUpperCase() + keyword.slice(1)} (publié le ${datePublication})`;
          if (!result.procedures.includes(procedureInfo)) {
            result.procedures.push(procedureInfo);
          }
        }
      }
    }

    if (result.hasProcedure) {
      result.alertes.push(`🚨 ALERTE BODACC: Procédure(s) collective(s) détectée(s): ${result.procedures.join(", ")}`);
    } else {
      // Check if there are announcements but no procedures
      result.points_ok.push(`✓ ${records.length} annonce(s) BODACC trouvée(s) mais aucune procédure collective en cours`);
    }

    return result;
  } catch (error) {
    console.error("BODACC API error:", error);
    return result;
  }
}

interface PappersCompanyInfo {
  siren: string;
  nom_entreprise: string;
  date_creation: string;
  date_cessation?: string;
  forme_juridique?: string;
  capital?: number;
  effectif?: string;
  code_naf?: string;
  procedure_collective?: boolean;
  derniers_comptes?: {
    date_cloture: string;
    capitaux_propres?: number;
    resultat?: number;
    chiffre_affaires?: number;
  };
}

interface CompanyAnalysis {
  found: boolean;
  siren?: string;
  nom_entreprise?: string;
  anciennete_years?: number;
  anciennete_risk?: "faible" | "moyen" | "eleve";
  bilans_disponibles?: boolean;
  capitaux_propres?: number;
  capitaux_propres_positifs?: boolean;
  procedure_collective?: boolean;
  alertes: string[];
  points_ok: string[];
}

async function analyzeCompanyWithPappers(siret: string): Promise<CompanyAnalysis> {
  const pappersApiKey = Deno.env.get("PAPPERS_API_KEY");
  
  if (!pappersApiKey) {
    console.log("Pappers API key not configured");
    return { found: false, alertes: [], points_ok: [] };
  }

  // Extract SIREN from SIRET (first 9 digits)
  const siren = siret.replace(/\s/g, "").substring(0, 9);
  
  if (siren.length < 9 || !/^\d{9}$/.test(siren)) {
    console.log("Invalid SIREN format:", siren);
    return { found: false, alertes: ["Numéro SIREN/SIRET invalide ou non trouvé dans le devis"], points_ok: [] };
  }

  try {
    const response = await fetch(
      `${PAPPERS_API_URL}/entreprise?siren=${siren}&api_token=${pappersApiKey}`,
      { method: "GET" }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return { 
          found: false, 
          alertes: ["Entreprise non trouvée dans les registres officiels (SIREN: " + siren + ")"], 
          points_ok: [] 
        };
      }
      console.error("Pappers API error:", response.status, await response.text());
      return { found: false, alertes: [], points_ok: [] };
    }

    const data: PappersCompanyInfo = await response.json();
    const alertes: string[] = [];
    const points_ok: string[] = [];

    // Verify company exists and is active
    if (data.date_cessation) {
      alertes.push(`⚠️ ALERTE: L'entreprise a cessé son activité le ${data.date_cessation}`);
    } else {
      points_ok.push("✓ Entreprise en activité");
    }

    // Calculate company age
    let ancienneteYears = 0;
    let ancienneteRisk: "faible" | "moyen" | "eleve" = "eleve";
    
    if (data.date_creation) {
      const creationDate = new Date(data.date_creation);
      const now = new Date();
      ancienneteYears = Math.floor((now.getTime() - creationDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      
      if (ancienneteYears < 2) {
        ancienneteRisk = "eleve";
        alertes.push(`⚠️ Entreprise récente (créée le ${data.date_creation}, moins de 2 ans) - vigilance recommandée`);
      } else if (ancienneteYears < 5) {
        ancienneteRisk = "moyen";
        points_ok.push(`✓ Entreprise établie depuis ${ancienneteYears} ans (créée le ${data.date_creation})`);
      } else {
        ancienneteRisk = "faible";
        points_ok.push(`✓ Entreprise bien établie depuis ${ancienneteYears} ans (créée le ${data.date_creation})`);
      }
    }

    // Check for collective procedures (bankruptcy, etc.)
    if (data.procedure_collective) {
      alertes.push("🚨 ALERTE FORTE: Procédure collective en cours (redressement ou liquidation judiciaire)");
    } else {
      points_ok.push("✓ Aucune procédure collective en cours");
    }

    // Check financial statements
    let bilansDisponibles = false;
    let capitauxPropres: number | undefined;
    let capitauxPropresPositifs: boolean | undefined;

    if (data.derniers_comptes) {
      bilansDisponibles = true;
      points_ok.push(`✓ Bilans disponibles (dernier exercice: ${data.derniers_comptes.date_cloture})`);
      
      if (data.derniers_comptes.capitaux_propres !== undefined) {
        capitauxPropres = data.derniers_comptes.capitaux_propres;
        capitauxPropresPositifs = capitauxPropres > 0;
        
        if (capitauxPropresPositifs) {
          points_ok.push(`✓ Capitaux propres positifs (${capitauxPropres.toLocaleString('fr-FR')} €)`);
        } else {
          alertes.push(`⚠️ Capitaux propres négatifs (${capitauxPropres.toLocaleString('fr-FR')} €) - santé financière fragile`);
        }
      }

      if (data.derniers_comptes.chiffre_affaires) {
        points_ok.push(`✓ Chiffre d'affaires déclaré: ${data.derniers_comptes.chiffre_affaires.toLocaleString('fr-FR')} €`);
      }
    } else {
      alertes.push("⚠️ Aucun bilan publié - impossible de vérifier la santé financière");
    }

    return {
      found: true,
      siren: data.siren,
      nom_entreprise: data.nom_entreprise,
      anciennete_years: ancienneteYears,
      anciennete_risk: ancienneteRisk,
      bilans_disponibles: bilansDisponibles,
      capitaux_propres: capitauxPropres,
      capitaux_propres_positifs: capitauxPropresPositifs,
      procedure_collective: data.procedure_collective,
      alertes,
      points_ok,
    };
  } catch (error) {
    console.error("Pappers API error:", error);
    return { found: false, alertes: [], points_ok: [] };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { analysisId } = await req.json();

    if (!analysisId) {
      return new Response(
        JSON.stringify({ error: "analysisId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "Lovable API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the analysis record
    const { data: analysis, error: fetchError } = await supabase
      .from("analyses")
      .select("*")
      .eq("id", analysisId)
      .single();

    if (fetchError || !analysis) {
      return new Response(
        JSON.stringify({ error: "Analysis not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to processing
    await supabase
      .from("analyses")
      .update({ status: "processing" })
      .eq("id", analysisId);

    // Download the PDF file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("devis")
      .download(analysis.file_path);

    if (downloadError || !fileData) {
      await supabase
        .from("analyses")
        .update({ status: "error", error_message: "Impossible de télécharger le fichier" })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: "Failed to download file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert file to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    let binaryString = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binaryString += String.fromCharCode.apply(null, [...chunk]);
    }
    const base64 = btoa(binaryString);
    
    // Determine MIME type
    const fileName = analysis.file_name.toLowerCase();
    let mimeType = "application/pdf";
    if (fileName.endsWith(".png")) mimeType = "image/png";
    else if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) mimeType = "image/jpeg";
    else if (fileName.endsWith(".webp")) mimeType = "image/webp";

    const systemPrompt = `Tu es un expert en analyse de devis travaux pour particuliers en France. Tu analyses des devis d'artisans et tu identifies les risques, incohérences et points de vigilance. Tu réponds uniquement avec un JSON valide, sans texte libre.`;

    const userPrompt = `Analyse ce document de devis d'artisan. 

IMPORTANT: Extrait également:
- Le numéro SIRET ou SIREN de l'entreprise s'il est présent
- La catégorie principale de travaux (ex: peinture_interieure, carrelage_sol, electricite_renovation, plomberie_sdb, etc.)
- La quantité totale (en m², unités ou forfait selon la catégorie)
- Le montant HT total du devis
- Le code postal du chantier

Retourne un JSON STRICTEMENT STRUCTURÉ avec exactement les champs suivants :

- score (VERT, ORANGE ou ROUGE)
- resume (résumé clair pour un particulier)
- points_ok (liste des éléments conformes)
- alertes (liste des risques ou éléments manquants)
- recommandations (actions concrètes à conseiller au particulier)
- siret (numéro SIRET ou SIREN extrait du document, ou null si non trouvé)
- categorie_travaux (une des catégories: peinture_interieure, carrelage_sol, carrelage_mural, parquet_stratifie, parquet_massif, isolation_combles, isolation_murs, placo_cloison, electricite_renovation, plomberie_sdb, cuisine_pose, toiture_tuiles, facade_ravalement, menuiserie_fenetre, menuiserie_porte, chauffage_pac, chaudiere_gaz, ou null si non identifiable)
- quantite (nombre total, ex: 50 pour 50m², ou null)
- montant_ht (montant HT total en euros, ou null)
- code_postal_chantier (code postal du lieu des travaux, ou null)

FORMAT DE RÉPONSE ATTENDU (OBLIGATOIRE) :
{
  "score": "",
  "resume": "",
  "points_ok": [],
  "alertes": [],
  "recommandations": [],
  "siret": "",
  "categorie_travaux": "",
  "quantite": null,
  "montant_ht": null,
  "code_postal_chantier": ""
}

CONTRAINTES :
- Le score doit être justifié implicitement par les alertes
- Ne jamais employer de termes juridiques complexes
- Rester pédagogique et neutre
- Ne jamais affirmer qu'il s'agit d'une arnaque
- L'analyse est informative et non contractuelle`;

    // Use Lovable AI Gateway with Gemini (supports PDF natively)
    const aiResponse = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      await supabase
        .from("analyses")
        .update({ 
          status: "error", 
          error_message: "Impossible de lire le contenu du fichier. Vérifiez que le fichier est lisible." 
        })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: "Failed to analyze document" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await aiResponse.json();
    const analysisContent = aiResult.choices?.[0]?.message?.content;

    if (!analysisContent) {
      await supabase
        .from("analyses")
        .update({ status: "error", error_message: "L'IA n'a pas pu analyser le devis" })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsedAnalysis;
    try {
      parsedAnalysis = JSON.parse(analysisContent);
    } catch (parseError) {
      console.error("Parse error, raw content:", analysisContent);
      await supabase
        .from("analyses")
        .update({ status: "error", error_message: "Erreur lors du traitement de l'analyse" })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: "Failed to parse AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize arrays from AI analysis
    let allPointsOk = Array.isArray(parsedAnalysis.points_ok) ? [...parsedAnalysis.points_ok] : [];
    let allAlertes = Array.isArray(parsedAnalysis.alertes) ? [...parsedAnalysis.alertes] : [];
    let allRecommandations = Array.isArray(parsedAnalysis.recommandations) ? [...parsedAnalysis.recommandations] : [];

    // ============ PRICE COMPARISON ANALYSIS ============
    let priceComparisonResult: PriceComparisonResult | null = null;
    
    if (parsedAnalysis.categorie_travaux && parsedAnalysis.quantite && parsedAnalysis.montant_ht && parsedAnalysis.code_postal_chantier) {
      console.log("Price comparison data found:", {
        categorie: parsedAnalysis.categorie_travaux,
        quantite: parsedAnalysis.quantite,
        montant_ht: parsedAnalysis.montant_ht,
        code_postal: parsedAnalysis.code_postal_chantier
      });
      
      // Fetch reference prices and zones from database
      const [referencePrixResult, zonesResult] = await Promise.all([
        supabase.from("travaux_reference_prix").select("*"),
        supabase.from("zones_geographiques").select("*")
      ]);
      
      if (referencePrixResult.data && zonesResult.data) {
        priceComparisonResult = comparePrix(
          parsedAnalysis.categorie_travaux,
          parseFloat(parsedAnalysis.quantite),
          parseFloat(parsedAnalysis.montant_ht),
          parsedAnalysis.code_postal_chantier,
          referencePrixResult.data as TravauxReferencePrix[],
          zonesResult.data as ZoneGeographique[]
        );
        
        if (priceComparisonResult) {
          console.log("Price comparison result:", priceComparisonResult);
          
          // Add price analysis to results
          if (priceComparisonResult.point_ok) {
            allPointsOk.push(priceComparisonResult.point_ok);
          }
          if (priceComparisonResult.alerte) {
            allAlertes.push(priceComparisonResult.alerte);
          }
          
          // Add explanation to recommendations
          allRecommandations.push(`💰 Analyse des prix: ${priceComparisonResult.explication}`);
        } else {
          console.log("Category not found in reference prices:", parsedAnalysis.categorie_travaux);
        }
      }
    } else {
      console.log("Price comparison data incomplete, skipping price analysis");
    }
    // ============ END PRICE COMPARISON ============

    // If SIRET found, analyze company with Pappers and BODACC
    let companyAnalysis: CompanyAnalysis | null = null;
    let bodaccResult: BodaccResult | null = null;
    
    if (parsedAnalysis.siret) {
      console.log("SIRET found in document:", parsedAnalysis.siret);
      const siren = parsedAnalysis.siret.replace(/\s/g, "").substring(0, 9);
      
      // Run Pappers and BODACC checks in parallel
      const [pappersResult, bodaccCheck] = await Promise.all([
        analyzeCompanyWithPappers(parsedAnalysis.siret),
        checkBodaccProcedures(siren),
      ]);
      
      companyAnalysis = pappersResult;
      bodaccResult = bodaccCheck;
      
      if (companyAnalysis.found) {
        // Prepend company analysis results
        allPointsOk = [...companyAnalysis.points_ok, ...allPointsOk];
        allAlertes = [...companyAnalysis.alertes, ...allAlertes];
        
        // Add company-specific recommendation if there are alerts
        if (companyAnalysis.alertes.length > 0) {
          allRecommandations.unshift("Vérifiez la situation de l'entreprise sur societe.com ou infogreffe.fr");
        }
      } else if (companyAnalysis.alertes.length > 0) {
        allAlertes = [...companyAnalysis.alertes, ...allAlertes];
      }
      
      // Add BODACC results
      if (bodaccResult) {
        allPointsOk = [...bodaccResult.points_ok, ...allPointsOk];
        allAlertes = [...bodaccResult.alertes, ...allAlertes];
      }
    } else {
      allAlertes.unshift("⚠️ Aucun numéro SIRET/SIREN trouvé sur le devis - vérification de l'entreprise impossible");
      allRecommandations.unshift("Demandez à l'artisan son numéro SIRET pour vérifier son immatriculation");
    }

    // Recalculate score based on combined alerts
    let score = parsedAnalysis.score?.toUpperCase() || "ORANGE";
    const validScores = ["VERT", "ORANGE", "ROUGE"];
    
    // Adjust score based on Pappers findings
    if (companyAnalysis) {
      if (companyAnalysis.procedure_collective) {
        score = "ROUGE";
      } else if (companyAnalysis.anciennete_risk === "eleve" || companyAnalysis.capitaux_propres_positifs === false) {
        if (score === "VERT") score = "ORANGE";
      }
    }
    
    // BODACC procedure = automatic RED score
    if (bodaccResult?.hasProcedure) {
      score = "ROUGE";
    }
    
    // Price comparison impact on score
    if (priceComparisonResult) {
      if (priceComparisonResult.score === "ROUGE") {
        score = "ROUGE";
      } else if (priceComparisonResult.score === "ORANGE" && score === "VERT") {
        score = "ORANGE";
      }
    }
    
    if (!validScores.includes(score)) {
      score = "ORANGE";
    }

    // Update the analysis with results
    const { error: updateError } = await supabase
      .from("analyses")
      .update({
        status: "completed",
        score: score,
        resume: parsedAnalysis.resume || "Analyse terminée",
        points_ok: allPointsOk,
        alertes: allAlertes,
        recommandations: allRecommandations,
        raw_text: analysisContent,
      })
      .eq("id", analysisId);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save analysis results" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        analysisId,
        score,
        companyVerified: companyAnalysis?.found || false,
        message: "Analyse terminée avec succès" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
