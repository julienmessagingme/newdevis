import { f as createComponent, k as renderComponent, r as renderTemplate } from '../chunks/astro/server_B_0KBrgj.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../chunks/BaseLayout_CYLo5fQs.mjs';
export { renderers } from '../renderers.mjs';

const prerender = false;
const $$Premium = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Mon Chantier Premium | VerifierMonDevis.fr", "description": "G\xE9rez votre chantier de A \xE0 Z : devis, budget, aides, formalit\xE9s, relances et journal. Essai gratuit 14 jours.", "noindex": false }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "PremiumApp", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/app/PremiumApp", "client:component-export": "default" })} ` })}`;
}, "C:/Users/bride/projets/newdevis/src/pages/premium.astro", void 0);

const $$file = "C:/Users/bride/projets/newdevis/src/pages/premium.astro";
const $$url = "/premium";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Premium,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
