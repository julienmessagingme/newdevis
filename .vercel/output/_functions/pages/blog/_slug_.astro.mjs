import { e as createAstro, f as createComponent, k as renderComponent, p as renderScript, r as renderTemplate, m as maybeRenderHead, h as addAttribute, w as Fragment, u as unescapeHTML } from '../../chunks/astro/server_B_0KBrgj.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../../chunks/BaseLayout_CYLo5fQs.mjs';
import { $ as $$Header, a as $$Footer } from '../../chunks/Footer_DfOhGtxS.mjs';
import { s as supabase } from '../../chunks/client_C1qcMGLx.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://www.verifiermondevis.fr");
const prerender = false;
const $$slug = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$slug;
  const { slug } = Astro2.params;
  let title = "Article | VerifierMonDevis.fr";
  let description = "Article du blog VerifierMonDevis.fr";
  let ogImage;
  let jsonLd;
  let postTitle = "Article";
  let post = null;
  let notFound = false;
  if (slug) {
    const { data, error } = await supabase.from("blog_posts").select("title, excerpt, content_html, category, tags, cover_image_url, mid_image_url, seo_title, seo_description, published_at, updated_at").eq("slug", slug).eq("status", "published").single();
    if (error || !data) {
      notFound = true;
    } else {
      post = data;
      postTitle = data.title;
      title = `${data.seo_title || data.title} | VerifierMonDevis.fr`;
      description = data.seo_description || data.excerpt || description;
      ogImage = data.cover_image_url || void 0;
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": data.title,
        "description": data.seo_description || data.excerpt || "",
        "datePublished": data.published_at,
        "dateModified": data.updated_at || data.published_at,
        "author": { "@type": "Person", "name": "Julien Dumas" },
        "publisher": {
          "@type": "Organization",
          "name": "VerifierMonDevis.fr",
          "logo": { "@type": "ImageObject", "url": "https://www.verifiermondevis.fr/images/logo-header.png" }
        },
        "mainEntityOfPage": { "@type": "WebPage", "@id": `https://www.verifiermondevis.fr/blog/${slug}` },
        ...data.cover_image_url ? { "image": data.cover_image_url } : {}
      };
    }
  } else {
    notFound = true;
  }
  function calculateReadingTime(html) {
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const words = text.split(" ").filter((w) => w.length > 0).length;
    return Math.max(1, Math.ceil(words / 200));
  }
  function formatDate(date) {
    if (!date) return "";
    return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }
  function sanitizeHtml(html) {
    if (!html) return "";
    let s = html;
    s = s.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    s = s.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");
    s = s.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, "");
    s = s.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
    s = s.replace(/<a\s+([^>]*href="https?:\/\/[^"]*"[^>]*)>/gi, (match, attrs) => {
      if (!attrs.includes("target=")) {
        return `<a ${attrs} target="_blank" rel="noopener noreferrer">`;
      }
      return match;
    });
    return s;
  }
  function splitHtmlForMidImage(html) {
    const blockRegex = /(<(?:h[1-6]|p|ul|ol|div|blockquote|table|section|figure)\b[^>]*>[\s\S]*?<\/(?:h[1-6]|p|ul|ol|div|blockquote|table|section|figure)>)/gi;
    const blocks = [];
    let match;
    while ((match = blockRegex.exec(html)) !== null) {
      blocks.push(match[0]);
    }
    if (blocks.length < 4) {
      return { before: html, beside: "", after: "" };
    }
    const midStart = Math.ceil(blocks.length / 2);
    const midEnd = Math.min(midStart + 3, blocks.length);
    return {
      before: blocks.slice(0, midStart).join("\n"),
      beside: blocks.slice(midStart, midEnd).join("\n"),
      after: blocks.slice(midEnd).join("\n")
    };
  }
  const readingTime = post ? calculateReadingTime(post.content_html) : 0;
  const sanitizedContent = post ? sanitizeHtml(post.content_html) : "";
  const hasMidImage = post?.mid_image_url && sanitizedContent;
  const splitContent = hasMidImage ? splitHtmlForMidImage(sanitizedContent) : null;
  const proseClasses = "prose prose-lg max-w-none prose-headings:text-foreground prose-headings:font-bold prose-h1:text-3xl prose-h1:mb-6 prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3 prose-p:text-foreground/90 prose-p:leading-relaxed prose-p:mb-4 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground prose-strong:font-semibold prose-ul:my-4 prose-ul:pl-6 prose-ol:my-4 prose-ol:pl-6 prose-li:text-foreground/90 prose-li:mb-2 prose-img:rounded-xl prose-img:shadow-md prose-img:my-8 prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground [&_.hero]:mb-8 [&_.hero]:text-center [&_.step]:bg-muted/30 [&_.step]:p-6 [&_.step]:rounded-xl [&_.step]:mb-6 [&_.checklist]:bg-primary/5 [&_.checklist]:p-6 [&_.checklist]:rounded-xl [&_.warning]:bg-amber-500/10 [&_.warning]:border-amber-500/20 [&_.warning]:border [&_.warning]:p-4 [&_.warning]:rounded-xl [&_.tip]:bg-emerald-500/10 [&_.tip]:border-emerald-500/20 [&_.tip]:border [&_.tip]:p-4 [&_.tip]:rounded-xl [&_.cta-button]:inline-flex [&_.cta-button]:items-center [&_.cta-button]:gap-2 [&_.cta-button]:bg-primary [&_.cta-button]:text-primary-foreground [&_.cta-button]:px-6 [&_.cta-button]:py-3 [&_.cta-button]:rounded-full [&_.cta-button]:font-medium [&_.cta-button]:no-underline [&_.cta-button]:hover:bg-primary/90 [&_.cta-button]:transition-colors";
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": title, "description": description, "canonical": `https://www.verifiermondevis.fr/blog/${slug}`, "ogType": "article", "ogImage": ogImage, "jsonLd": jsonLd, "breadcrumbs": [
    { name: "Accueil", url: "https://www.verifiermondevis.fr/" },
    { name: "Blog", url: "https://www.verifiermondevis.fr/blog" },
    { name: postTitle, url: `https://www.verifiermondevis.fr/blog/${slug}` }
  ] }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="min-h-screen flex flex-col bg-background"> ${renderComponent($$result2, "Header", $$Header, {})} ${notFound || !post ? renderTemplate`<main class="flex-1 flex items-center justify-center"> <div class="text-center"> <h1 class="text-2xl font-bold text-foreground mb-4">Article non trouvé</h1> <p class="text-muted-foreground mb-6">
L'article que vous recherchez n'existe pas ou a été supprimé.
</p> <a href="/blog" class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"> <svg class="mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path></svg>
Retour au blog
</a> </div> </main>` : renderTemplate`<main class="flex-1"> <!-- Article Header --> <section class="py-12 md:py-16 bg-gradient-to-b from-primary/5 to-background"> <div class="container px-4 md:px-6"> <div class="max-w-3xl mx-auto"> <a href="/blog" class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"> <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path></svg>
Retour au blog
</a> <div class="flex flex-wrap items-center gap-3 mb-4"> ${post.category && renderTemplate`<span class="inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground"> <svg class="h-3 w-3 mr-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"></path><path d="M7 7h.01"></path></svg> ${post.category} </span>`} <div class="flex items-center gap-1 text-sm text-muted-foreground"> <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${readingTime} min de lecture
</div> ${post.published_at && renderTemplate`<div class="flex items-center gap-1 text-sm text-muted-foreground"> <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect><line x1="16" x2="16" y1="2" y2="6"></line><line x1="8" x2="8" y1="2" y2="6"></line><line x1="3" x2="21" y1="10" y2="10"></line></svg> ${formatDate(post.published_at)} </div>`} </div> <h1 class="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4"> ${post.title} </h1> ${post.excerpt && renderTemplate`<p class="text-lg text-muted-foreground"> ${post.excerpt} </p>`} <div class="flex items-center gap-3 mt-6"> <button id="share-btn" class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"> <svg class="h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"></line><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"></line></svg>
Partager
</button> </div> </div> </div> </section> <!-- Cover Image --> ${post.cover_image_url && renderTemplate`<section class="pb-8"> <div class="container px-4 md:px-6"> <div class="max-w-4xl mx-auto"> <img${addAttribute(post.cover_image_url, "src")}${addAttribute(post.title, "alt")} class="w-full h-auto rounded-2xl shadow-lg"> </div> </div> </section>`} <!-- Article Content --> <section class="py-8 md:py-12"> <div class="container px-4 md:px-6"> <div class="max-w-3xl mx-auto"> <!-- Top CTA --> <div class="mb-8 p-6 bg-primary/10 rounded-2xl border border-primary/20"> <div class="flex flex-col sm:flex-row items-center gap-4"> <div class="p-3 bg-primary/20 rounded-xl"> <svg class="h-6 w-6 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="m9 15 2 2 4-4"></path></svg> </div> <div class="flex-1 text-center sm:text-left"> <p class="font-semibold text-foreground">
Vous avez un devis à analyser ?
</p> <p class="text-sm text-muted-foreground">
Notre outil gratuit vérifie les mentions obligatoires et compare les prix.
</p> </div> <a href="/nouvelle-analyse" class="shrink-0 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
Analyser mon devis
<svg class="ml-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg> </a> </div> </div> <!-- Article Body --> ${splitContent && post.mid_image_url ? renderTemplate`${renderComponent($$result2, "Fragment", Fragment, {}, { "default": async ($$result3) => renderTemplate` <div${addAttribute(proseClasses, "class")}>${unescapeHTML(splitContent.before)}</div> ${splitContent.beside && renderTemplate`<div class="my-10"> <div class="grid md:grid-cols-2 gap-8 items-start"> <img${addAttribute(post.mid_image_url, "src")}${addAttribute(`Illustration - ${post.title}`, "alt")} class="w-full h-auto rounded-xl shadow-md" loading="lazy"> <div${addAttribute(proseClasses, "class")}>${unescapeHTML(splitContent.beside)}</div> </div> </div>`}${splitContent.after && renderTemplate`<div${addAttribute(proseClasses, "class")}>${unescapeHTML(splitContent.after)}</div>`}` })}` : renderTemplate`<div${addAttribute(proseClasses, "class")}>${unescapeHTML(sanitizedContent)}</div>`} <!-- Tags --> ${post.tags && post.tags.length > 0 && renderTemplate`<div class="mt-8 pt-6 border-t border-border"> <div class="flex flex-wrap items-center gap-2"> <span class="text-sm text-muted-foreground">Tags :</span> ${post.tags.map((tag) => renderTemplate`<span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-input text-foreground"> ${tag} </span>`)} </div> </div>`} <!-- Bottom CTA --> <div class="mt-12 p-5 sm:p-8 bg-gradient-to-br from-primary/10 to-primary/5 rounded-3xl border border-primary/20 overflow-hidden"> <div class="text-center max-w-xl mx-auto"> <div class="inline-flex p-4 bg-primary/20 rounded-2xl mb-4"> <svg class="h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="m9 15 2 2 4-4"></path></svg> </div> <h3 class="text-2xl font-bold text-foreground mb-3">
Prêt à analyser votre devis ?
</h3> <p class="text-muted-foreground mb-6">
Utilisez notre outil gratuit pour vérifier les mentions obligatoires,
                    comparer les prix du marché et vous assurer de la fiabilité de l'artisan.
</p> <a href="/nouvelle-analyse" class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8 w-full sm:w-auto">
Analyser mon devis gratuitement
<svg class="ml-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg> </a> </div> </div> </div> </div> </section> </main>`} ${renderComponent($$result2, "Footer", $$Footer, {})} </div> ` })} ${renderScript($$result, "C:/Users/bride/projets/newdevis/src/pages/blog/[slug].astro?astro&type=script&index=0&lang.ts")}`;
}, "C:/Users/bride/projets/newdevis/src/pages/blog/[slug].astro", void 0);

const $$file = "C:/Users/bride/projets/newdevis/src/pages/blog/[slug].astro";
const $$url = "/blog/[slug]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$slug,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
