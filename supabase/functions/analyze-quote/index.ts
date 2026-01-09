import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const openai = new OpenAI({ apiKey: openaiApiKey });

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

    // Extract text from PDF using OpenAI Vision
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to base64 in chunks to avoid stack overflow
    let binaryString = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binaryString += String.fromCharCode.apply(null, [...chunk]);
    }
    const base64 = btoa(binaryString);
    const mimeType = fileData.type || "application/pdf";

    let extractedText = "";

    try {
      // Use GPT-4o vision to extract text from the PDF/image
      const visionResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extrais tout le texte de ce document. Retourne uniquement le texte brut, sans formatage ni commentaire.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 4000,
      });

      extractedText = visionResponse.choices[0]?.message?.content || "";
    } catch (visionError) {
      console.error("Vision extraction error:", visionError);
      await supabase
        .from("analyses")
        .update({ 
          status: "error", 
          error_message: "Impossible de lire le contenu du fichier. Vérifiez que le fichier est lisible." 
        })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: "Failed to extract text from file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!extractedText || extractedText.trim().length < 50) {
      await supabase
        .from("analyses")
        .update({ 
          status: "error", 
          error_message: "Le document semble vide ou illisible. Veuillez téléverser un devis plus lisible." 
        })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: "Document appears to be empty or unreadable" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Analyze the quote with OpenAI
    const systemPrompt = `Tu es un expert en analyse de devis travaux pour particuliers en France. Tu analyses des devis d'artisans et tu identifies les risques, incohérences et points de vigilance. Tu réponds uniquement avec un JSON valide, sans texte libre.`;

    const userPrompt = `Analyse le texte suivant issu d'un devis d'artisan. Retourne un JSON STRICTEMENT STRUCTURÉ avec exactement les champs suivants :

- score (VERT, ORANGE ou ROUGE)
- resume (résumé clair pour un particulier)
- points_ok (liste des éléments conformes)
- alertes (liste des risques ou éléments manquants)
- recommandations (actions concrètes à conseiller au particulier)

TEXTE DU DEVIS :
${extractedText}

FORMAT DE RÉPONSE ATTENDU (OBLIGATOIRE) :
{
  "score": "",
  "resume": "",
  "points_ok": [],
  "alertes": [],
  "recommandations": []
}

CONTRAINTES :
- Le score doit être justifié implicitement par les alertes
- Ne jamais employer de termes juridiques complexes
- Rester pédagogique et neutre
- Ne jamais affirmer qu'il s'agit d'une arnaque
- L'analyse est informative et non contractuelle`;

    const analysisResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
    });

    const analysisContent = analysisResponse.choices[0]?.message?.content;

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
      await supabase
        .from("analyses")
        .update({ status: "error", error_message: "Erreur lors du traitement de l'analyse" })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: "Failed to parse AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate the score
    const validScores = ["VERT", "ORANGE", "ROUGE"];
    const score = validScores.includes(parsedAnalysis.score?.toUpperCase()) 
      ? parsedAnalysis.score.toUpperCase() 
      : "ORANGE";

    // Update the analysis with results
    const { error: updateError } = await supabase
      .from("analyses")
      .update({
        status: "completed",
        score: score,
        resume: parsedAnalysis.resume || "Analyse terminée",
        points_ok: Array.isArray(parsedAnalysis.points_ok) ? parsedAnalysis.points_ok : [],
        alertes: Array.isArray(parsedAnalysis.alertes) ? parsedAnalysis.alertes : [],
        recommandations: Array.isArray(parsedAnalysis.recommandations) ? parsedAnalysis.recommandations : [],
        raw_text: extractedText,
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
