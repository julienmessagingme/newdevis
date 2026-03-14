import { f as createComponent, k as renderComponent, r as renderTemplate } from '../../chunks/astro/server_B_0KBrgj.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../../chunks/BaseLayout_CYLo5fQs.mjs';
export { renderers } from '../../renderers.mjs';

const prerender = false;
const $$Blog = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Administration Blog | VerifierMonDevis.fr", "description": "Gestion des articles du blog VerifierMonDevis.fr", "noindex": true }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "AdminBlogApp", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/app/AdminBlogApp", "client:component-export": "default" })} ` })}`;
}, "C:/Users/bride/projets/newdevis/src/pages/admin/blog.astro", void 0);

const $$file = "C:/Users/bride/projets/newdevis/src/pages/admin/blog.astro";
const $$url = "/admin/blog";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Blog,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
