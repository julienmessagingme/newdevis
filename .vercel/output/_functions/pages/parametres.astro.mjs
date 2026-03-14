import { f as createComponent, k as renderComponent, r as renderTemplate } from '../chunks/astro/server_B_0KBrgj.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../chunks/BaseLayout_CYLo5fQs.mjs';
export { renderers } from '../renderers.mjs';

const prerender = false;
const $$Parametres = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Param\xE8tres du compte | VerifierMonDevis.fr", "description": "G\xE9rez vos informations personnelles et modifiez votre mot de passe.", "noindex": true }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "SettingsApp", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/app/SettingsApp", "client:component-export": "default" })} ` })}`;
}, "C:/Users/bride/projets/newdevis/src/pages/parametres.astro", void 0);

const $$file = "C:/Users/bride/projets/newdevis/src/pages/parametres.astro";
const $$url = "/parametres";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Parametres,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
