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
        // 🔴 2026-09-21 — `X-Robots-Tag: noindex` RETIRÉ.
        //
        // L'intention était juste (« ce XML n'a rien à faire dans les
        // résultats »), mais l'en-tête ne protégeait de rien : Google
        // n'indexe pas les sitemaps, il les LIT. En revanche il produisait
        // un échec rouge dans l'inspection d'URL — « Google n'a pas accès à
        // cette URL · noindex détecté dans l'en-tête HTTP X-Robots-Tag » —
        // sur le fichier même par lequel on demande l'exploration de 74
        // articles.
        //
        // ⚠️ AUCUN autre sitemap du site ne porte cet en-tête (`sitemap-0.xml`
        // d'@astrojs/sitemap, `sitemap.xml`) : c'était une incohérence isolée.
        // Ne pas le remettre « par prudence » — un signal contradictoire sur
        // un sitemap coûte plus qu'il ne protège.
      },
    });
  } catch (err) {
    console.error("[sitemap-blog] Unexpected error:", err);
    // 🔴 2026-09-21 — ON RÉPOND 500, PLUS UN SITEMAP VIDE EN 200.
    //
    // L'ancien comportement servait `<urlset></urlset>` avec un statut 200 :
    // pour Google, ce n'est pas « je n'ai pas pu répondre », c'est **« ces 74
    // articles n'existent plus »**. Une panne Supabase de quelques minutes
    // pouvait donc déclencher une désindexation du blog entier, en silence et
    // sans qu'aucune alerte ne se déclenche.
    //
    // Avec un 500, Google conserve la dernière version connue du sitemap et
    // réessaie — et l'erreur apparaît dans Search Console. C'est la règle du
    // projet : un échec silencieux coûte plus cher que la panne qu'il masque.
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>\n<!-- sitemap temporairement indisponible -->`,
      {
        status: 500,
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      }
    );
  }
};
