import { f as createComponent, k as renderComponent, r as renderTemplate } from '../chunks/astro/server_B_0KBrgj.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../chunks/BaseLayout_CYLo5fQs.mjs';
export { renderers } from '../renderers.mjs';

const prerender = false;
const $$NouvelleAnalyse = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Nouvelle analyse | VerifierMonDevis.fr", "description": "Analysez un nouveau devis d'artisan en quelques minutes.", "noindex": true }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "NewAnalysisApp", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/app/NewAnalysisApp", "client:component-export": "default" })} ` })}`;
}, "C:/Users/bride/projets/newdevis/src/pages/nouvelle-analyse.astro", void 0);

const $$file = "C:/Users/bride/projets/newdevis/src/pages/nouvelle-analyse.astro";
const $$url = "/nouvelle-analyse";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$NouvelleAnalyse,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
