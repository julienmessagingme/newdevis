import { f as createComponent, k as renderComponent, r as renderTemplate } from '../../chunks/astro/server_B_0KBrgj.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../../chunks/BaseLayout_CYLo5fQs.mjs';
export { renderers } from '../../renderers.mjs';

const prerender = false;
const $$id = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Mon chantier \u2014 VerifierMonDevis", "description": "Consultez et g\xE9rez votre plan de chantier IA.", "noindex": true }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "ChantierDetailApp", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/app/ChantierDetailApp", "client:component-export": "default" })} ` })}`;
}, "C:/Users/bride/projets/newdevis/src/pages/mon-chantier/[id].astro", void 0);

const $$file = "C:/Users/bride/projets/newdevis/src/pages/mon-chantier/[id].astro";
const $$url = "/mon-chantier/[id]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$id,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
