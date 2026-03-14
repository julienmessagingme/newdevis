import { f as createComponent, k as renderComponent, p as renderScript, r as renderTemplate, m as maybeRenderHead, h as addAttribute } from '../chunks/astro/server_B_0KBrgj.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../chunks/BaseLayout_CYLo5fQs.mjs';
import { $ as $$Header, a as $$Footer } from '../chunks/Footer_DfOhGtxS.mjs';
import { s as supabase } from '../chunks/client_C1qcMGLx.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const prerender = false;
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const { data: posts } = await supabase.from("blog_posts").select("id, slug, title, excerpt, category, cover_image_url, published_at, reading_time, content_html").eq("status", "published").order("published_at", { ascending: false });
  const allPosts = posts || [];
  const CATEGORIES = [
    { id: "conseils", label: "Conseils pratiques", icon: "\u2705", desc: "Prot\xE9gez-vous, \xE9vitez les pi\xE8ges, agissez au bon moment" },
    { id: "prix", label: "Prix & budgets", icon: "\u{1F4B0}", desc: "Comparez les tarifs, anticipez votre budget, \xE9vitez les surprises" },
    { id: "guides", label: "Guides complets", icon: "\u{1F4D8}", desc: "De A \xE0 Z : choisir, financer, valoriser et g\xE9rer votre projet" },
    { id: "reglementation", label: "R\xE9glementation", icon: "\u{1F4DC}", desc: "Vos droits, les obligations l\xE9gales, ce que dit la loi" }
  ];
  const CAT_SUBCATEGORIES = {
    "conseils": [
      { id: "avant-signer", label: "Avant de signer" },
      { id: "anomalies", label: "D\xE9tecter les anomalies" },
      { id: "litige", label: "En cas de litige" }
    ],
    "prix": [
      { id: "renovation-interieure", label: "R\xE9novation int\xE9rieure", featured: true },
      { id: "travaux-specialises", label: "Travaux sp\xE9cialis\xE9s" }
    ],
    "guides": [
      { id: "choisir-artisan", label: "Choisir son artisan" },
      { id: "financer-valoriser", label: "Financer & valoriser" },
      { id: "faire-soi-meme", label: "Faire soi-m\xEAme" }
    ],
    "reglementation": []
  };
  const SUBCATEGORY_MAP = {
    // Conseils — Avant de signer
    "devis-travaux-le-guide-complet-pour-ne-plus-se-faire-avoir": "avant-signer",
    "questions-artisan-avant-signer-devis": "avant-signer",
    "comment-lire-devis-travaux": "avant-signer",
    // Conseils — Détecter les anomalies
    "devis-gonfle-signes-alerte": "anomalies",
    "analyser-devis-artisan": "anomalies",
    // Conseils — En cas de litige
    "artisan-travaux-inacheves-recours": "litige",
    "sinistre-travaux-demarches-arnaques-eviter": "litige",
    "reception-travaux-conseils-protection-litiges": "litige",
    // Prix — Rénovation intérieure
    "prix-renovation-salle-de-bain-2026": "renovation-interieure",
    "prix-renovation-cuisine-2026": "renovation-interieure",
    // Prix — Travaux spécialisés
    "prix-isolation-thermique-devis-combles-murs-plancher": "travaux-specialises",
    "prix-refaire-toiture-2026-tarifs-renovation": "travaux-specialises",
    "piscine-prix-conseils-demarches-projet": "travaux-specialises",
    "prix-amenagement-jardin-budget-allee-portail-terrasse": "travaux-specialises",
    // Guides — Choisir son artisan
    "architecte-maitre-oeuvre-conducteur-travaux-qui-choisir": "choisir-artisan",
    "qualifications-labels-artisans-batiment-france": "choisir-artisan",
    "comment-obtenir-devis-artisans-qualifies": "choisir-artisan",
    "auto-entrepreneur-societe-artisan-devis": "choisir-artisan",
    // Guides — Financer & valoriser
    "comment-financer-travaux-solutions-particuliers": "financer-valoriser",
    "valoriser-bien-immobilier-travaux-rentables": "financer-valoriser",
    "marchand-biens-optimiser-budget-travaux-plus-value": "financer-valoriser",
    // Guides — Faire soi-même
    "travaux-soi-meme-ce-quil-faut-savoir": "faire-soi-meme",
    "devis-copropriete-verifier-travaux-ag": "faire-soi-meme"
  };
  function getCatId(category) {
    if (!category) return "guides";
    const cat = category.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (cat.includes("conseil")) return "conseils";
    if (cat.includes("prix") || cat.includes("budget")) return "prix";
    if (cat.includes("reglementation") || cat.includes("regl")) return "reglementation";
    return "guides";
  }
  const postsByCategory = {};
  for (const cat of CATEGORIES) {
    postsByCategory[cat.id] = allPosts.filter((p) => getCatId(p.category) === cat.id);
  }
  function formatDate(date) {
    if (!date) return "";
    return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  }
  function getReadingTime(dbValue, contentHtml, excerpt) {
    if (dbValue != null && dbValue > 0) return dbValue;
    const text = contentHtml ? contentHtml.replace(/<[^>]+>/g, " ") : excerpt || "";
    const words = text.split(/\s+/).filter((w) => w.length > 0).length;
    return Math.max(1, Math.ceil(words / 200));
  }
  const avgRT = allPosts.length > 0 ? Math.round(allPosts.reduce((sum, p) => sum + getReadingTime(p.reading_time, p.content_html, p.excerpt), 0) / allPosts.length) : 5;
  const activeCatCount = CATEGORIES.filter((cat) => (postsByCategory[cat.id] || []).length > 0).length;
  const postsBySubcategory = {};
  for (const cat of CATEGORIES) {
    const pbs = {};
    for (const post of postsByCategory[cat.id] || []) {
      const sub = post.slug && SUBCATEGORY_MAP[post.slug] ? SUBCATEGORY_MAP[post.slug] : "_other";
      if (!pbs[sub]) pbs[sub] = [];
      pbs[sub].push(post);
    }
    postsBySubcategory[cat.id] = pbs;
  }
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Guides & Conseils Travaux \u2014 VerifierMonDevis.fr", "description": "Conseils pratiques pour analyser vos devis artisan, \xE9viter les arnaques et r\xE9ussir vos travaux. Guides, checklists et astuces d'experts.", "canonical": "https://www.verifiermondevis.fr/blog", "breadcrumbs": [
    { name: "Accueil", url: "https://www.verifiermondevis.fr/" },
    { name: "Blog", url: "https://www.verifiermondevis.fr/blog" }
  ], "jsonLd": {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Blog VerifierMonDevis.fr",
    "description": "Conseils pratiques pour analyser vos devis artisan, \xE9viter les arnaques et r\xE9ussir vos travaux.",
    "url": "https://www.verifiermondevis.fr/blog",
    "isPartOf": { "@type": "WebSite", "name": "VerifierMonDevis.fr", "url": "https://www.verifiermondevis.fr" }
  } }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-wrap"> ${renderComponent($$result2, "Header", $$Header, {})} <main> <!-- ═══ HERO ═══ --> <div class="b-hero"> <div class="b-eyebrow">📚 Base de connaissances</div> <h1>Guides & conseils pour <span>vos travaux</span></h1> <p>Tout ce qu'il faut savoir pour décrypter un devis, repérer les arnaques et faire les bons choix.</p> <div class="b-search"> <input type="text" id="blogSearch" placeholder="Rechercher un guide, un conseil, un prix…" autocomplete="off"> <span class="b-search-icon">🔍</span> </div> </div> <!-- ═══ STAT BAR ═══ --> <div class="b-stats"> <div class="b-stat"><strong>${allPosts.length}</strong> articles publiés</div> <div class="b-stat"><strong>${activeCatCount}</strong> catégories</div> <div class="b-stat"><strong>${avgRT} min</strong> de lecture en moyenne</div> <div class="b-stat"><strong>100%</strong> gratuit</div> </div> <!-- ═══ CATEGORY TABS ═══ --> <div class="b-cat-nav"> <p class="b-cat-nav-label">Filtrer par catégorie</p> <div class="b-tabs" role="tablist"> <button class="b-tab active" data-cat="all" role="tab">✦ Tout voir</button> ${CATEGORIES.map((cat) => (postsByCategory[cat.id] || []).length > 0 && renderTemplate`<button class="b-tab"${addAttribute(cat.id, "data-cat")} role="tab"> <span${addAttribute(`b-dot dot-${cat.id}`, "class")}></span>${cat.label} </button>`)} </div> </div> <!-- ═══ MAIN ═══ --> <div class="b-main"> <!-- CTA Banner --> <div class="b-banner"> <div class="b-banner-icon">🔍</div> <div class="b-banner-body"> <h3>Analysez votre devis en 5 minutes</h3> <p>Notre outil gratuit détecte les anomalies, vérifie la cohérence des prix et identifie les mentions légales manquantes.</p> </div> <a href="/nouvelle-analyse" class="b-banner-btn">Tester l'outil →</a> </div> <!-- No results --> <div id="noResults" class="b-no-results" style="display:none"> <p style="font-size:2rem;margin-bottom:12px">🔍</p> <p style="font-weight:700;font-size:1.1rem;margin-bottom:6px">Aucun article trouvé</p> <p style="color:#64748b;font-size:.9rem">Essayez avec d'autres mots-clés</p> </div> <!-- ═══ CATEGORY SECTIONS ═══ --> ${CATEGORIES.map((cat) => {
    const catPosts = postsByCategory[cat.id] || [];
    if (catPosts.length === 0) return null;
    const subcats = CAT_SUBCATEGORIES[cat.id] || [];
    const hasSubcats = subcats.length > 0;
    const pbs = postsBySubcategory[cat.id] || {};
    return renderTemplate`<section class="b-cat-section visible"${addAttribute(`cat-${cat.id}`, "id")}${addAttribute(cat.id, "data-cat")}> <div class="b-cat-header"> <div${addAttribute(`b-cat-icon icon-${cat.id}`, "class")}>${cat.icon}</div> <div class="b-cat-header-text"> <h2>${cat.label}</h2> <p>${cat.desc}</p> </div> <span class="b-cat-count">${catPosts.length} article${catPosts.length > 1 ? "s" : ""}</span> </div> ${hasSubcats ? subcats.filter((sub) => (pbs[sub.id] || []).length > 0).map((subcat) => {
      const subcatPosts = pbs[subcat.id] || [];
      const featured = subcat.featured === true && subcatPosts.length >= 2;
      return renderTemplate`<div class="b-subcat-section"> <div class="b-subcat-label">${subcat.label}</div> <div${addAttribute(`b-grid${featured ? " b-grid-featured" : ""}`, "class")}> ${subcatPosts.map((post, i) => {
        const rt = getReadingTime(post.reading_time, post.content_html, post.excerpt);
        return renderTemplate`<a class="b-card"${addAttribute(`/blog/${post.slug}`, "href")}${addAttribute(post.title.toLowerCase(), "data-title")}${addAttribute((post.excerpt || "").toLowerCase(), "data-excerpt")}${addAttribute(cat.id, "data-cat")}> <div class="b-card-img"> ${post.cover_image_url ? renderTemplate`<img${addAttribute(post.cover_image_url, "src")}${addAttribute(post.title, "alt")} loading="lazy" width="600" height="340">` : renderTemplate`<div class="b-card-placeholder">${cat.icon}</div>`} <span${addAttribute(`b-badge badge-${cat.id}`, "class")}>${cat.label}</span> ${i === 0 && renderTemplate`<span class="b-popular">⭐ Populaire</span>`} </div> <div class="b-card-body"> <div class="b-card-meta"> <span>🕐 ${rt} min</span> <span>${formatDate(post.published_at)}</span> </div> <div class="b-card-title">${post.title}</div> ${post.excerpt && renderTemplate`<p class="b-card-excerpt">${post.excerpt}</p>`} <span class="b-card-cta">Lire l'article →</span> </div> </a>`;
      })} </div> </div>`;
    }) : renderTemplate`<div class="b-grid"> ${catPosts.map((post, i) => {
      const rt = getReadingTime(post.reading_time, post.content_html, post.excerpt);
      return renderTemplate`<a class="b-card"${addAttribute(`/blog/${post.slug}`, "href")}${addAttribute(post.title.toLowerCase(), "data-title")}${addAttribute((post.excerpt || "").toLowerCase(), "data-excerpt")}${addAttribute(cat.id, "data-cat")}> <div class="b-card-img"> ${post.cover_image_url ? renderTemplate`<img${addAttribute(post.cover_image_url, "src")}${addAttribute(post.title, "alt")} loading="lazy" width="600" height="340">` : renderTemplate`<div class="b-card-placeholder">${cat.icon}</div>`} <span${addAttribute(`b-badge badge-${cat.id}`, "class")}>${cat.label}</span> ${i === 0 && renderTemplate`<span class="b-popular">⭐ Populaire</span>`} </div> <div class="b-card-body"> <div class="b-card-meta"> <span>🕐 ${rt} min</span> <span>${formatDate(post.published_at)}</span> </div> <div class="b-card-title">${post.title}</div> ${post.excerpt && renderTemplate`<p class="b-card-excerpt">${post.excerpt}</p>`} <span class="b-card-cta">Lire l'article →</span> </div> </a>`;
    })} </div>`}  ${hasSubcats && (pbs["_other"] || []).length > 0 && renderTemplate`<div class="b-subcat-section"> <div class="b-grid"> ${(pbs["_other"] || []).map((post, i) => {
      const rt = getReadingTime(post.reading_time, post.content_html, post.excerpt);
      return renderTemplate`<a class="b-card"${addAttribute(`/blog/${post.slug}`, "href")}${addAttribute(post.title.toLowerCase(), "data-title")}${addAttribute((post.excerpt || "").toLowerCase(), "data-excerpt")}${addAttribute(cat.id, "data-cat")}> <div class="b-card-img"> ${post.cover_image_url ? renderTemplate`<img${addAttribute(post.cover_image_url, "src")}${addAttribute(post.title, "alt")} loading="lazy" width="600" height="340">` : renderTemplate`<div class="b-card-placeholder">${cat.icon}</div>`} <span${addAttribute(`b-badge badge-${cat.id}`, "class")}>${cat.label}</span> ${i === 0 && renderTemplate`<span class="b-popular">⭐ Populaire</span>`} </div> <div class="b-card-body"> <div class="b-card-meta"> <span>🕐 ${rt} min</span> <span>${formatDate(post.published_at)}</span> </div> <div class="b-card-title">${post.title}</div> ${post.excerpt && renderTemplate`<p class="b-card-excerpt">${post.excerpt}</p>`} <span class="b-card-cta">Lire l'article →</span> </div> </a>`;
    })} </div> </div>`} </section>`;
  })} </div><!-- /b-main --> </main> ${renderComponent($$result2, "Footer", $$Footer, {})} </div> ` })}  ${renderScript($$result, "C:/Users/bride/projets/newdevis/src/pages/blog/index.astro?astro&type=script&index=0&lang.ts")}`;
}, "C:/Users/bride/projets/newdevis/src/pages/blog/index.astro", void 0);

const $$file = "C:/Users/bride/projets/newdevis/src/pages/blog/index.astro";
const $$url = "/blog";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
