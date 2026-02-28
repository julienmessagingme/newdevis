import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://www.verifiermondevis.fr",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

    console.log("Step 1: Checking API key...", !!anthropicApiKey);

    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({ error: "Anthropic API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin access
    const authHeader = req.headers.get("Authorization");
    console.log("Step 2: Auth header present?", !!authHeader);
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    console.log("Step 3: User?", !!user, "Error?", authError?.message);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication", details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check admin role
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    console.log("Step 4: Admin role?", !!roleData, "Error?", roleError?.message);

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Admin access required", details: roleError?.message }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { topic, keywords = [], targetLength = 1200, sourceUrls = [] } = await req.json();

    if (!topic) {
      return new Response(
        JSON.stringify({ error: "topic is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Step 5: Generating blog article:", topic, "length:", targetLength);

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

FORMAT DE SORTIE (JSON strict, pas de texte avant ou après):
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

    let userPrompt = `Rédige un article de blog d'environ ${targetLength} mots sur le sujet suivant:

SUJET: ${topic}

${keywords.length > 0 ? `MOTS-CLÉS SEO À INTÉGRER NATURELLEMENT: ${keywords.join(", ")}` : ""}`;

    if (sourceUrls.length > 0) {
      userPrompt += `

URLS SOURCES À UTILISER COMME RÉFÉRENCE (inspire-toi du contenu de ces pages pour enrichir l'article):
${sourceUrls.map((url: string, i: number) => `${i + 1}. ${url}`).join("\n")}`;
    }

    userPrompt += `

L'article doit être utile pour un particulier qui fait des travaux chez lui.
Réponds UNIQUEMENT avec le JSON demandé, sans texte avant ou après.`;

    const aiResponse = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        messages: [
          { role: "user", content: userPrompt },
        ],
        system: systemPrompt,
      }),
    });

    console.log("Step 6: Anthropic response status:", aiResponse.status);

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Anthropic API error:", aiResponse.status);
      return new Response(
        JSON.stringify({ error: "AI generation failed", details: aiResponse.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.content?.[0]?.text;
    console.log("Step 7: Got AI content, length:", content?.length);

    if (!content) {
      return new Response(
        JSON.stringify({ error: "Empty AI response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let article;
    try {
      // Extract JSON from response (handle possible markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      article = JSON.parse(jsonMatch[0]);
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
        ai_model: "claude-sonnet-4-20250514",
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
    console.error("Unexpected error:", error instanceof Error ? error.message : "Unknown error");
    return new Response(
      JSON.stringify({ error: "Erreur interne du serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
