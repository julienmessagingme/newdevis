import { f as createComponent, k as renderComponent, r as renderTemplate } from '../chunks/astro/server_B_0KBrgj.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../chunks/BaseLayout_CYLo5fQs.mjs';
export { renderers } from '../renderers.mjs';

const prerender = false;
const $$Connexion = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Connexion | VerifierMonDevis.fr", "description": "Connectez-vous \xE0 votre compte VerifierMonDevis.fr pour analyser vos devis d'artisans.", "canonical": "https://www.verifiermondevis.fr/connexion", "noindex": true }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "LoginApp", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/app/LoginApp", "client:component-export": "default" })} ` })}`;
}, "C:/Users/bride/projets/newdevis/src/pages/connexion.astro", void 0);

const $$file = "C:/Users/bride/projets/newdevis/src/pages/connexion.astro";
const $$url = "/connexion";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Connexion,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
