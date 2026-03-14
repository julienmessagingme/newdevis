import { f as createComponent, k as renderComponent, r as renderTemplate } from '../chunks/astro/server_B_0KBrgj.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../chunks/BaseLayout_CYLo5fQs.mjs';
export { renderers } from '../renderers.mjs';

const prerender = false;
const $$Inscription = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Cr\xE9er un compte | VerifierMonDevis.fr", "description": "Cr\xE9ez votre compte gratuit sur VerifierMonDevis.fr pour analyser vos devis d'artisans.", "canonical": "https://www.verifiermondevis.fr/inscription", "noindex": true }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "RegisterApp", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/app/RegisterApp", "client:component-export": "default" })} ` })}`;
}, "C:/Users/bride/projets/newdevis/src/pages/inscription.astro", void 0);

const $$file = "C:/Users/bride/projets/newdevis/src/pages/inscription.astro";
const $$url = "/inscription";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Inscription,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
