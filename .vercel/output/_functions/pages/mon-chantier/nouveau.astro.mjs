import { f as createComponent, k as renderComponent, r as renderTemplate } from '../../chunks/astro/server_B_0KBrgj.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../../chunks/BaseLayout_CYLo5fQs.mjs';
export { renderers } from '../../renderers.mjs';

const prerender = false;
const $$Nouveau = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Cr\xE9er mon chantier IA \u2014 VerifierMonDevis", "description": "D\xE9crivez votre projet en quelques mots et obtenez un plan de chantier complet g\xE9n\xE9r\xE9 par l'IA en 10 secondes.", "noindex": true }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "NouveauChantierApp", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/app/NouveauChantierApp", "client:component-export": "default" })} ` })}`;
}, "C:/Users/bride/projets/newdevis/src/pages/mon-chantier/nouveau.astro", void 0);

const $$file = "C:/Users/bride/projets/newdevis/src/pages/mon-chantier/nouveau.astro";
const $$url = "/mon-chantier/nouveau";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Nouveau,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
