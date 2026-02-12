import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find scheduled posts that are due for publication
    const now = new Date().toISOString();
    const { data: postsToPublish, error: fetchError } = await supabase
      .from("blog_posts")
      .select("id, title, slug, scheduled_at")
      .eq("workflow_status", "scheduled")
      .lte("scheduled_at", now);

    if (fetchError) {
      console.error("Error fetching scheduled posts:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch scheduled posts", details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!postsToPublish || postsToPublish.length === 0) {
      console.log("No scheduled posts to publish");
      return new Response(
        JSON.stringify({ success: true, published: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${postsToPublish.length} post(s) to publish`);

    const publishedIds: string[] = [];
    const errors: { id: string; error: string }[] = [];

    for (const post of postsToPublish) {
      const { error: updateError } = await supabase
        .from("blog_posts")
        .update({
          status: "published",
          workflow_status: "published",
          published_at: new Date().toISOString(),
        })
        .eq("id", post.id);

      if (updateError) {
        console.error(`Failed to publish post ${post.id} (${post.title}):`, updateError);
        errors.push({ id: post.id, error: updateError.message });
      } else {
        console.log(`Published: ${post.id} - ${post.title} (slug: ${post.slug})`);
        publishedIds.push(post.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        published: publishedIds.length,
        publishedIds,
        errors: errors.length > 0 ? errors : undefined,
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
