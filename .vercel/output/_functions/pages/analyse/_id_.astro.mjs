import { f as createComponent, k as renderComponent, r as renderTemplate } from '../../chunks/astro/server_B_0KBrgj.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../../chunks/BaseLayout_CYLo5fQs.mjs';
export { renderers } from '../../renderers.mjs';

const prerender = false;
const $$id = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "R\xE9sultat d'analyse | VerifierMonDevis.fr", "description": "R\xE9sultat d\xE9taill\xE9 de l'analyse de votre devis artisan.", "noindex": true }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "AnalysisResultApp", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/app/AnalysisResultApp", "client:component-export": "default" })} ` })}`;
}, "C:/Users/bride/projets/newdevis/src/pages/analyse/[id].astro", void 0);

const $$file = "C:/Users/bride/projets/newdevis/src/pages/analyse/[id].astro";
const $$url = "/analyse/[id]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$id,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
