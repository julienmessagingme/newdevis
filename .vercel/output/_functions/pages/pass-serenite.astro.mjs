import { f as createComponent, k as renderComponent, r as renderTemplate } from '../chunks/astro/server_B_0KBrgj.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../chunks/BaseLayout_CYLo5fQs.mjs';
export { renderers } from '../renderers.mjs';

const prerender = false;
const $$PassSerenite = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Pass S\xE9r\xE9nit\xE9 \u2014 Analyses illimit\xE9es | VerifierMonDevis.fr", "description": "Passez au Pass S\xE9r\xE9nit\xE9 pour analyser tous vos devis en illimit\xE9, t\xE9l\xE9charger vos rapports PDF et trier par type de travaux. 4,99\u20AC/mois, sans engagement.", "canonical": "https://www.verifiermondevis.fr/pass-serenite" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "PassSereniteApp", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "C:/Users/bride/projets/newdevis/src/components/app/PassSereniteApp", "client:component-export": "default" })} ` })}`;
}, "C:/Users/bride/projets/newdevis/src/pages/pass-serenite.astro", void 0);

const $$file = "C:/Users/bride/projets/newdevis/src/pages/pass-serenite.astro";
const $$url = "/pass-serenite";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$PassSerenite,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
