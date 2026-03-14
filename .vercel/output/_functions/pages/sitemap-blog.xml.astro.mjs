import { s as supabase } from '../chunks/client_C1qcMGLx.mjs';
export { renderers } from '../renderers.mjs';

const prerender = false;
const GET = async () => {
  const { data: posts } = await supabase.from("blog_posts").select("slug, published_at, updated_at").eq("status", "published").order("published_at", { ascending: false });
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
      "Cache-Control": "public, max-age=3600"
    }
  });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
