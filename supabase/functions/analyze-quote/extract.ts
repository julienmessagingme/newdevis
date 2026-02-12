import type { ExtractedData } from "./types.ts";
import { PipelineError, isPipelineError, repairTruncatedJson, GEMINI_AI_URL } from "./utils.ts";

// ============================================================
// PHASE 1: EXTRACTION WITH EXTRACT-DOCUMENT CALL
// ============================================================

export async function callExtractDocument(
  supabase: any,
  analysisId: string,
  filePath: string,
  extractionId: string
): Promise<{ success: boolean; data?: any; error?: string; errorCode?: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  // Update status to extracting
  await supabase
    .from("document_extractions")
    .update({ status: "extracting", started_at: new Date().toISOString() })
    .eq("id", extractionId);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/extract-document`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        analysis_id: analysisId,
        file_path: filePath,
        extraction_id: extractionId,
        freemium_mode: true,
      }),
    });

    const result = await response.json();

    if (!response.ok || result.error) {
      // Update extraction status to failed
      await supabase
        .from("document_extractions")
        .update({
          status: result.error_code === "OCR_TIMEOUT" ? "timeout" : "failed",
          error_code: result.error_code || "EXTRACTION_FAILED",
          error_details: { message: result.error || result.message, provider_calls: result.provider_calls },
        })
        .eq("id", extractionId);

      return {
        success: false,
        error: result.error || result.message || "Extraction failed",
        errorCode: result.error_code || "EXTRACTION_FAILED",
      };
    }

    // Update status to extracted
    await supabase
      .from("document_extractions")
      .update({ status: "extracted" })
      .eq("id", extractionId);

    return { success: true, data: result.data };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown extraction error";

    await supabase
      .from("document_extractions")
      .update({
        status: "failed",
        error_code: "EXTRACTION_CALL_FAILED",
        error_details: { message: errorMsg },
      })
      .eq("id", extractionId);

    return { success: false, error: errorMsg, errorCode: "EXTRACTION_CALL_FAILED" };
  }
}

// ============================================================
// PHASE 1: EXTRACTION VIA AI (fallback if extract-document unavailable)
// ============================================================

export async function extractDataFromDocument(
  base64Content: string,
  mimeType: string,
  googleApiKey: string,
  retryCount: number = 0
): Promise<ExtractedData> {

  const MAX_RETRIES = 2;

  const systemPrompt = `Tu es VerifierMonDevis.fr, un outil d'aide à la décision à destination des particuliers.

Tu n'évalues PAS les artisans.
Tu ne portes AUCUN jugement de valeur.
Tu fournis des indicateurs factuels, pédagogiques et vérifiables.

RÈGLES D'EXTRACTION:
1. N'invente AUCUNE information. Si une donnée n'est pas visible, retourne null.
2. Pour le mode de paiement:
   - "espèces" SEULEMENT si les mots "espèces", "cash", "comptant en espèces" sont explicitement présents.
   - Si "chèque", "virement", "carte bancaire", "CB", "à réception", "à la livraison" sont mentionnés, les inclure.
   - Si un IBAN ou RIB est présent, le mode de paiement INCLUT "virement".
   - Ne jamais déduire "espèces" par défaut.
3. Pour les assurances: true si clairement mentionnée, false si absente, null si doute.
4. Pour les travaux: identifier la CATÉGORIE MÉTIER principale même si un produit spécifique/marque est mentionné.
5. LIMITE les travaux aux 5 PRINCIPAUX postes (par montant décroissant).
6. Réponds UNIQUEMENT avec un JSON valide et COMPLET. Ne tronque pas la réponse.

Tu dois effectuer UNE SEULE extraction complète et structurée.`;

  const userPrompt = `Analyse ce document et extrait TOUTES les données factuelles.

IDENTIFICATION DU DOCUMENT:
1. DEVIS DE TRAVAUX : "Devis", montants HT/TTC, descriptions de travaux, assurance décennale
2. DIAGNOSTIC IMMOBILIER : DPE, amiante, plomb, gaz, électricité, ERP, Carrez
3. FACTURE : "Facture", numéro de facture, "Net à payer", travaux passés
4. AUTRE : Document non conforme

EXTRACTION STRICTE - Réponds UNIQUEMENT avec ce JSON COMPLET (max 5 travaux):

{
  "type_document": "devis_travaux | facture | diagnostic_immobilier | autre",
  "entreprise": {
    "nom": "nom exact ou null",
    "siret": "numéro SIRET 14 chiffres sans espaces ou null",
    "adresse": "adresse complète ou null",
    "iban": "IBAN complet ou null",
    "assurance_decennale_mentionnee": true | false | null,
    "assurance_rc_pro_mentionnee": true | false | null,
    "certifications_mentionnees": []
  },
  "client": {
    "adresse_chantier": "adresse complète du chantier ou null",
    "code_postal": "code postal 5 chiffres ou null",
    "ville": "ville ou null"
  },
  "travaux": [
    {
      "libelle": "description courte",
      "categorie": "categorie",
      "montant": 5000,
      "quantite": 50,
      "unite": "m2"
    }
  ],
  "paiement": {
    "acompte_pct": 30,
    "acompte_avant_travaux_pct": null,
    "modes": ["virement"],
    "echeancier_detecte": false
  },
  "dates": {
    "date_devis": "YYYY-MM-DD",
    "date_execution_max": null
  },
  "totaux": {
    "ht": 10000,
    "tva": 2000,
    "ttc": 12000,
    "taux_tva": 20
  },
  "anomalies_detectees": [],
  "resume_factuel": "description factuelle courte"
}`;

  try {
    console.log(`Extraction attempt ${retryCount + 1}/${MAX_RETRIES + 1}`);

    const aiResponse = await fetch(GEMINI_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${googleApiKey}`,
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Content}` } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
      }),
    });

    if (!aiResponse.ok) {
      const details = await aiResponse.text().catch(() => "");
      console.error("Extract AI error:", aiResponse.status, details);

      if (aiResponse.status === 402) {
        throw new PipelineError({
          status: 402,
          code: "AI_PAYMENT_REQUIRED",
          publicMessage: "Le service d'analyse est temporairement indisponible (crédits IA insuffisants). Veuillez réessayer plus tard.",
        });
      }

      if (aiResponse.status === 429) {
        throw new PipelineError({
          status: 429,
          code: "AI_RATE_LIMIT",
          publicMessage: "Le service d'analyse est temporairement surchargé. Veuillez réessayer dans quelques minutes.",
        });
      }

      throw new PipelineError({
        status: 502,
        code: "AI_GATEWAY_ERROR",
        publicMessage: "Le service d'analyse est temporairement indisponible. Veuillez réessayer plus tard.",
      });
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.log("Direct JSON parse failed, attempting cleanup...");

      let cleanedContent = content;

      const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonBlockMatch) {
        cleanedContent = jsonBlockMatch[1].trim();
      }

      const jsonStart = cleanedContent.indexOf('{');
      const jsonEnd = cleanedContent.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanedContent = cleanedContent.substring(jsonStart, jsonEnd + 1);
      }

      cleanedContent = cleanedContent.replace(/,(\s*[}\]])/g, '$1');
      cleanedContent = repairTruncatedJson(cleanedContent);

      try {
        parsed = JSON.parse(cleanedContent);
        console.log("JSON cleanup successful");
      } catch (secondError) {
        console.error("JSON cleanup failed, content sample:", cleanedContent.substring(0, 500));

        if (retryCount < MAX_RETRIES) {
          console.log(`Retrying extraction (attempt ${retryCount + 2})...`);
          return extractDataFromDocument(base64Content, mimeType, googleApiKey, retryCount + 1);
        }

        throw new Error(`Failed to parse AI response as JSON after ${MAX_RETRIES + 1} attempts`);
      }
    }

    const typeDocument = ["devis_travaux", "facture", "diagnostic_immobilier", "autre"].includes(parsed.type_document)
      ? parsed.type_document
      : "autre";

    console.log("PHASE 1 COMPLETE - Extracted:", {
      type: typeDocument,
      entreprise: parsed.entreprise?.nom || "unknown",
      siret: parsed.entreprise?.siret || "unknown",
      travaux_count: parsed.travaux?.length || 0,
      total_ttc: parsed.totaux?.ttc || 0,
      modes_paiement: parsed.paiement?.modes || [],
    });

    return {
      type_document: typeDocument,
      entreprise: {
        nom: parsed.entreprise?.nom || null,
        siret: parsed.entreprise?.siret?.replace(/\s/g, "") || null,
        adresse: parsed.entreprise?.adresse || null,
        iban: parsed.entreprise?.iban || null,
        assurance_decennale_mentionnee: parsed.entreprise?.assurance_decennale_mentionnee ?? null,
        assurance_rc_pro_mentionnee: parsed.entreprise?.assurance_rc_pro_mentionnee ?? null,
        certifications_mentionnees: Array.isArray(parsed.entreprise?.certifications_mentionnees)
          ? parsed.entreprise.certifications_mentionnees
          : [],
      },
      client: {
        adresse_chantier: parsed.client?.adresse_chantier || null,
        code_postal: parsed.client?.code_postal || null,
        ville: parsed.client?.ville || null,
      },
      travaux: Array.isArray(parsed.travaux)
        ? parsed.travaux.slice(0, 5).map((t: any) => ({
            libelle: t.libelle || "",
            categorie: t.categorie || "autre",
            montant: typeof t.montant === "number" ? t.montant : null,
            quantite: typeof t.quantite === "number" ? t.quantite : null,
            unite: t.unite || null,
          }))
        : [],
      paiement: {
        acompte_pct: typeof parsed.paiement?.acompte_pct === "number" ? parsed.paiement.acompte_pct : null,
        acompte_avant_travaux_pct: typeof parsed.paiement?.acompte_avant_travaux_pct === "number"
          ? parsed.paiement.acompte_avant_travaux_pct
          : null,
        modes: Array.isArray(parsed.paiement?.modes) ? parsed.paiement.modes : [],
        echeancier_detecte: parsed.paiement?.echeancier_detecte === true,
      },
      dates: {
        date_devis: parsed.dates?.date_devis || null,
        date_execution_max: parsed.dates?.date_execution_max || null,
      },
      totaux: {
        ht: typeof parsed.totaux?.ht === "number" ? parsed.totaux.ht : null,
        tva: typeof parsed.totaux?.tva === "number" ? parsed.totaux.tva : null,
        ttc: typeof parsed.totaux?.ttc === "number" ? parsed.totaux.ttc : null,
        taux_tva: typeof parsed.totaux?.taux_tva === "number" ? parsed.totaux.taux_tva : null,
      },
      anomalies_detectees: Array.isArray(parsed.anomalies_detectees) ? parsed.anomalies_detectees : [],
      resume_factuel: parsed.resume_factuel || "Devis analysé",
    };

  } catch (error) {
    if (isPipelineError(error)) throw error;

    if (retryCount < MAX_RETRIES) {
      console.log(`Error occurred, retrying (attempt ${retryCount + 2})...`);
      return extractDataFromDocument(base64Content, mimeType, googleApiKey, retryCount + 1);
    }

    throw error;
  }
}
