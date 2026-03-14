import { f as createComponent, k as renderComponent, r as renderTemplate } from '../chunks/astro/server_B_0KBrgj.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../chunks/BaseLayout_CYLo5fQs.mjs';
export { renderers } from '../renderers.mjs';

const prerender = false;
const $$MonChantierOld = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Mon Chantier (ancien) | VerifierMonDevis.fr", "description": "G\xE9rez votre chantier de A \xE0 Z : devis, budget, aides, formalit\xE9s, relances et journal.", "noindex": true }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "MonChantierApp", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/app/MonChantierApp", "client:component-export": "default" })} ` })}`;
}, "C:/Users/bride/projets/newdevis/src/pages/mon-chantier-old.astro", void 0);

const $$file = "C:/Users/bride/projets/newdevis/src/pages/mon-chantier-old.astro";
const $$url = "/mon-chantier-old";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$MonChantierOld,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
