import { f as createComponent, k as renderComponent, r as renderTemplate } from '../chunks/astro/server_B_0KBrgj.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../chunks/BaseLayout_CYLo5fQs.mjs';
export { renderers } from '../renderers.mjs';

const prerender = false;
const $$ResetPassword = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Nouveau mot de passe | VerifierMonDevis.fr", "description": "Choisissez un nouveau mot de passe pour votre compte VerifierMonDevis.fr.", "noindex": true }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "ResetPasswordApp", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/app/ResetPasswordApp", "client:component-export": "default" })} ` })}`;
}, "C:/Users/bride/projets/newdevis/src/pages/reset-password.astro", void 0);

const $$file = "C:/Users/bride/projets/newdevis/src/pages/reset-password.astro";
const $$url = "/reset-password";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$ResetPassword,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
