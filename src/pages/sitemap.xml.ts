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
  { loc: "https://www.verifiermondevis.fr/analyser-devis-travaux",         lastmod: "2026-04-14", priority: "0.9", changefreq: "monthly" },
  { loc: "https://www.verifiermondevis.fr/comparer-devis-travaux",         lastmod: "2026-06-08", priority: "0.9", changefreq: "weekly"  },
  { loc: "https://www.verifiermondevis.fr/devis-piscine-prix",             lastmod: "2026-04-14", priority: "0.8", changefreq: "monthly" },
  { loc: "https://www.verifiermondevis.fr/qui-sommes-nous",               lastmod: "2026-03-30", priority: "0.6", changefreq: "monthly" },
  { loc: "https://www.verifiermondevis.fr/contact",                       lastmod: "2026-02-15", priority: "0.5", changefreq: "yearly"  },
  { loc: "https://www.verifiermondevis.fr/pass-serenite",                 lastmod: "2026-03-30", priority: "0.6", changefreq: "monthly" },
  { loc: "https://www.verifiermondevis.fr/premium",                       lastmod: "2026-04-10", priority: "0.6", changefreq: "monthly" },
  { loc: "https://www.verifiermondevis.fr/cgu",                           lastmod: "2026-04-08", priority: "0.3", changefreq: "yearly"  },
  { loc: "https://www.verifiermondevis.fr/cgv",                           lastmod: "2026-04-08", priority: "0.3", changefreq: "yearly"  },
  { loc: "https://www.verifiermondevis.fr/mentions-legales",              lastmod: "2026-02-15", priority: "0.3", changefreq: "yearly"  },
  { loc: "https://www.verifiermondevis.fr/confidentialite",               lastmod: "2026-02-15", priority: "0.3", changefreq: "yearly"  },
  // ── GérerMonChantier (même build Vercel, multi-domaine) ──
  { loc: "https://gerermonchantier.fr/",                                  lastmod: "2026-06-08", priority: "1.0", changefreq: "weekly"  },
  { loc: "https://gerermonchantier.fr/application-suivi-travaux",         lastmod: "2026-06-08", priority: "0.9", changefreq: "weekly"  },
  { loc: "https://gerermonchantier.fr/securite",                          lastmod: "2026-06-05", priority: "0.6", changefreq: "monthly" },
  { loc: "https://gerermonchantier.fr/guide-renovation",                  lastmod: "2026-06-05", priority: "0.7", changefreq: "monthly" },
  { loc: "https://gerermonchantier.fr/aides-energetiques",                lastmod: "2026-06-05", priority: "0.7", changefreq: "monthly" },
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
  // V3.5.x — utilise SERVICE_ROLE_KEY car PUBLIC_SUPABASE_URL/_PUBLISHABLE_KEY
  // ne sont pas toujours dispo en SSR Vercel (injection au build pour code
  // client, runtime serveur reçoit les vars non-PUBLIC). Le service_role
  // bypass RLS donc on est sûr de récupérer tous les posts published.
  let blogUrls: string[] = [];
  let blogCount = 0;
  let blogError: string | null = null;

  try {
    const supabaseUrl =
      import.meta.env.SUPABASE_URL ||
      import.meta.env.PUBLIC_SUPABASE_URL ||
      "";
    const supabaseKey =
      import.meta.env.SUPABASE_SERVICE_ROLE_KEY ||
      import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      "";

    if (!supabaseUrl || !supabaseKey) {
      blogError = `env_missing url=${!!supabaseUrl} key=${!!supabaseKey}`;
      console.error("[sitemap]", blogError);
    } else {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: posts, error } = await supabase
        .from("blog_posts")
        .select("slug, published_at, updated_at")
        .eq("status", "published")
        .order("published_at", { ascending: false });

      if (error) {
        blogError = `supabase_error: ${error.message}`;
        console.error("[sitemap]", blogError);
      } else {
        const validPosts = (posts ?? []).filter((p) => p.slug);
        blogCount = validPosts.length;
        blogUrls = validPosts.map((p) => {
          const lastmod = (p.updated_at || p.published_at || "2026-04-10").split("T")[0];
          return urlEntry(
            `https://www.verifiermondevis.fr/blog/${encodeURIComponent(p.slug)}`,
            lastmod,
            "0.7",
            "weekly"
          );
        });
        console.log(`[sitemap] ${blogCount} blog articles included`);
      }
    }
  } catch (err) {
    blogError = err instanceof Error ? err.message : String(err);
    console.error("[sitemap] catch:", blogError);
  }

  const staticUrls = STATIC_PAGES.map((p) =>
    urlEntry(p.loc, p.lastmod, p.priority, p.changefreq)
  );

  const allUrls = [...staticUrls, ...blogUrls].join("\n");
  // Commentaire XML inline pour debug en prod (visible via curl) sans casser
  // le parsing Sitemap protocol (les commentaires XML sont autorisés).
  const debugComment = blogError
    ? `<!-- sitemap-debug: blog_articles=${blogCount} error="${blogError}" -->`
    : `<!-- sitemap-debug: blog_articles=${blogCount} -->`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
${debugComment}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
};
