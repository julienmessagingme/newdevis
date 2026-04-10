/**
 * Sitemap unifié SSR — remplace public/sitemap.xml + sitemap-blog.xml
 * Une seule URL à soumettre dans Google Search Console.
 */
import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

export const prerender = false;

const STATIC_PAGES = [
  { loc: "https://www.verifiermondevis.fr/",                              lastmod: "2026-04-10", priority: "1.0", changefreq: "weekly"  },
  { loc: "https://www.verifiermondevis.fr/blog",                          lastmod: "2026-04-10", priority: "0.9", changefreq: "daily"   },
  { loc: "https://www.verifiermondevis.fr/faq",                           lastmod: "2026-04-10", priority: "0.8", changefreq: "monthly" },
  { loc: "https://www.verifiermondevis.fr/comprendre-score",              lastmod: "2026-04-10", priority: "0.8", changefreq: "monthly" },
  { loc: "https://www.verifiermondevis.fr/calculette-travaux",            lastmod: "2026-04-10", priority: "0.8", changefreq: "monthly" },
  { loc: "https://www.verifiermondevis.fr/simulateur-valorisation-travaux",lastmod: "2026-02-25",priority: "0.7", changefreq: "monthly" },
  { loc: "https://www.verifiermondevis.fr/valorisation-travaux-immobiliers",lastmod: "2026-02-25",priority: "0.7", changefreq: "monthly" },
  { loc: "https://www.verifiermondevis.fr/qui-sommes-nous",               lastmod: "2026-03-30", priority: "0.6", changefreq: "monthly" },
  { loc: "https://www.verifiermondevis.fr/contact",                       lastmod: "2026-02-15", priority: "0.5", changefreq: "yearly"  },
  { loc: "https://www.verifiermondevis.fr/pass-serenite",                 lastmod: "2026-03-30", priority: "0.6", changefreq: "monthly" },
  { loc: "https://www.verifiermondevis.fr/premium",                       lastmod: "2026-04-10", priority: "0.6", changefreq: "monthly" },
  { loc: "https://www.verifiermondevis.fr/cgu",                           lastmod: "2026-04-08", priority: "0.3", changefreq: "yearly"  },
  { loc: "https://www.verifiermondevis.fr/cgv",                           lastmod: "2026-04-08", priority: "0.3", changefreq: "yearly"  },
  { loc: "https://www.verifiermondevis.fr/mentions-legales",              lastmod: "2026-02-15", priority: "0.3", changefreq: "yearly"  },
  { loc: "https://www.verifiermondevis.fr/confidentialite",               lastmod: "2026-02-15", priority: "0.3", changefreq: "yearly"  },
];

function urlEntry(loc: string, lastmod: string, priority: string, changefreq: string) {
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export const GET: APIRoute = async () => {
  // Récupérer les articles de blog publiés
  let blogUrls: string[] = [];
  try {
    const supabase = createClient(
      import.meta.env.PUBLIC_SUPABASE_URL ?? "",
      import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""
    );
    const { data: posts } = await supabase
      .from("blog_posts")
      .select("slug, published_at, updated_at")
      .eq("status", "published")
      .order("published_at", { ascending: false });

    blogUrls = (posts ?? [])
      .filter((p) => p.slug)
      .map((p) => {
        const lastmod = (p.updated_at || p.published_at || "2026-04-10").split("T")[0];
        return urlEntry(
          `https://www.verifiermondevis.fr/blog/${encodeURIComponent(p.slug)}`,
          lastmod,
          "0.7",
          "monthly"
        );
      });
  } catch (err) {
    console.error("[sitemap] blog fetch error:", err);
  }

  const staticUrls = STATIC_PAGES.map((p) =>
    urlEntry(p.loc, p.lastmod, p.priority, p.changefreq)
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls.join("\n")}
${blogUrls.join("\n")}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
};
