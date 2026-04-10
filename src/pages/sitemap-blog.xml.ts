import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    // Utilise le client SSR avec la clé publique (blog_posts est en lecture publique)
    const supabase = createClient(
      import.meta.env.PUBLIC_SUPABASE_URL ?? "",
      import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""
    );

    const { data: posts, error } = await supabase
      .from("blog_posts")
      .select("slug, published_at, updated_at")
      .eq("status", "published")
      .order("published_at", { ascending: false });

    if (error) {
      console.error("[sitemap-blog] Supabase error:", error.message);
    }

    const urls = (posts ?? [])
      .filter((post) => post.slug)
      .map((post) => {
        const lastmod = (post.updated_at || post.published_at || "2026-04-10")
          .split("T")[0];
        return `  <url>\n    <loc>https://www.verifiermondevis.fr/blog/${encodeURIComponent(post.slug)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    console.error("[sitemap-blog] Unexpected error:", err);
    // Retourne un sitemap vide valide plutôt qu'une erreur 500
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
      {
        status: 200,
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      }
    );
  }
};
