import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_AI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const googleApiKey = Deno.env.get("GOOGLE_AI_API_KEY");

    if (!googleApiKey) {
      return new Response(
        JSON.stringify({ error: "Google AI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin access
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check admin role
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { topic, keywords = [], targetLength = 1200 } = await req.json();

    if (!topic) {
      return new Response(
        JSON.stringify({ error: "topic is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Generating blog article: topic="${topic}", keywords=${keywords.join(",")}, length=${targetLength}`);

    const systemPrompt = `Tu es un rédacteur SEO expert pour VerifierMonDevis.fr, un service gratuit d'analyse de devis d'artisans pour les particuliers.

Tu rédiges des articles de blog informatifs, pédagogiques et bien structurés en français.

RÈGLES DE RÉDACTION:
1. Ton professionnel mais accessible aux particuliers
2. Structure avec des titres H2 et H3 bien hiérarchisés
3. Paragraphes courts (3-4 phrases max)
4. Listes à puces pour les conseils pratiques
5. Inclure des exemples concrets quand possible
6. Terminer par un appel à l'action vers VerifierMonDevis.fr
7. Ne pas inventer de chiffres ou statistiques sans source
8. Utiliser un vocabulaire simple et compréhensible

FORMAT DE SORTIE (JSON):
{
  "title": "Titre accrocheur et optimisé SEO (60-70 caractères)",
  "slug": "slug-url-en-minuscules-sans-accents",
  "excerpt": "Résumé de 2 phrases pour la carte article (150-160 caractères)",
  "content_html": "<h2>...</h2><p>...</p>... (contenu HTML complet de l'article)",
  "seo_title": "Titre SEO avec mots-clés (max 60 caractères)",
  "seo_description": "Meta description SEO (max 155 caractères)",
  "category": "catégorie principale (Conseils, Guides, Arnaques, Réglementation, Prix)",
  "tags": ["tag1", "tag2", "tag3"]
}`;

    const userPrompt = `Rédige un article de blog d'environ ${targetLength} mots sur le sujet suivant:

SUJET: ${topic}

${keywords.length > 0 ? `MOTS-CLÉS SEO À INTÉGRER NATURELLEMENT: ${keywords.join(", ")}` : ""}

L'article doit être utile pour un particulier qui fait des travaux chez lui.
Réponds UNIQUEMENT avec le JSON demandé, sans texte avant ou après.`;

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
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 8000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Gemini AI error:", aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI generation failed", details: aiResponse.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "Empty AI response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let article;
    try {
      article = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content.substring(0, 500));
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert blog post as draft
    const { data: post, error: insertError } = await supabase
      .from("blog_posts")
      .insert({
        title: article.title || topic,
        slug: article.slug || topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 80),
        excerpt: article.excerpt || null,
        content_html: article.content_html || "",
        seo_title: article.seo_title || article.title,
        seo_description: article.seo_description || article.excerpt,
        category: article.category || "Conseils",
        tags: article.tags || [],
        status: "draft",
        workflow_status: "ai_draft",
        ai_generated: true,
        ai_prompt: topic,
        ai_model: "gemini-2.5-flash",
        author_id: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save article", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Article generated successfully: ${post.id} - ${post.title}`);

    return new Response(
      JSON.stringify({
        success: true,
        post: {
          id: post.id,
          title: post.title,
          slug: post.slug,
          workflow_status: post.workflow_status,
        },
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
