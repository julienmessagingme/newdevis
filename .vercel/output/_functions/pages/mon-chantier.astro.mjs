import { f as createComponent, k as renderComponent, r as renderTemplate } from '../chunks/astro/server_B_0KBrgj.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../chunks/BaseLayout_CYLo5fQs.mjs';
export { renderers } from '../renderers.mjs';

const prerender = false;
const $$MonChantier = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Mes chantiers \u2014 VerifierMonDevis", "description": "G\xE9rez vos chantiers g\xE9n\xE9r\xE9s par l'IA : plans, budgets, devis et suivi de travaux.", "noindex": true }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "MonChantierHubApp", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/app/MonChantierHubApp", "client:component-export": "default" })} ` })}`;
}, "C:/Users/bride/projets/newdevis/src/pages/mon-chantier.astro", void 0);

const $$file = "C:/Users/bride/projets/newdevis/src/pages/mon-chantier.astro";
const $$url = "/mon-chantier";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$MonChantier,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
