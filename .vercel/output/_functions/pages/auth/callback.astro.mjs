import { f as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead, p as renderScript } from '../../chunks/astro/server_B_0KBrgj.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../../chunks/BaseLayout_CYLo5fQs.mjs';
export { renderers } from '../../renderers.mjs';

const prerender = false;
const $$Callback = createComponent(async ($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Connexion en cours... | VerifierMonDevis.fr", "description": "Redirection apr\xE8s authentification Google", "noindex": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="min-h-screen flex items-center justify-center"> <div class="text-center space-y-4"> <div class="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div> <p class="text-muted-foreground">Connexion en cours...</p> </div> </div> ${renderScript($$result2, "C:/Users/bride/projets/newdevis/src/pages/auth/callback.astro?astro&type=script&index=0&lang.ts")} ` })}`;
}, "C:/Users/bride/projets/newdevis/src/pages/auth/callback.astro", void 0);

const $$file = "C:/Users/bride/projets/newdevis/src/pages/auth/callback.astro";
const $$url = "/auth/callback";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Callback,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
