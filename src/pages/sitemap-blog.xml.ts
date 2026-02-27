import type { APIRoute } from "astro";
import { supabase } from "@/integrations/supabase/client";

export const prerender = false;

export const GET: APIRoute = async () => {
  const { data: posts } = await supabase
    .from("blog_posts")
    .select("slug, published_at, updated_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  const urls = (posts || []).map((post) => {
    const lastmod = (post.updated_at || post.published_at || "2026-02-15").split("T")[0];
    return `  <url>
    <loc>https://www.verifiermondevis.fr/blog/${post.slug}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
