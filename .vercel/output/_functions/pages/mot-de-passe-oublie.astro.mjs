import { f as createComponent, k as renderComponent, r as renderTemplate } from '../chunks/astro/server_B_0KBrgj.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../chunks/BaseLayout_CYLo5fQs.mjs';
export { renderers } from '../renderers.mjs';

const prerender = false;
const $$MotDePasseOublie = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Mot de passe oubli\xE9 | VerifierMonDevis.fr", "description": "R\xE9initialisez votre mot de passe VerifierMonDevis.fr pour retrouver l'acc\xE8s \xE0 vos analyses de devis.", "canonical": "https://www.verifiermondevis.fr/mot-de-passe-oublie", "noindex": true }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "ForgotPasswordApp", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/app/ForgotPasswordApp", "client:component-export": "default" })} ` })}`;
}, "C:/Users/bride/projets/newdevis/src/pages/mot-de-passe-oublie.astro", void 0);

const $$file = "C:/Users/bride/projets/newdevis/src/pages/mot-de-passe-oublie.astro";
const $$url = "/mot-de-passe-oublie";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$MotDePasseOublie,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
