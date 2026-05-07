import { defineMiddleware } from 'astro:middleware';

// Hosts servis par le projet newdevis. Le rewrite ne s'applique qu'à `/`
// (la home GMC), toutes les autres routes restent partagées entre les deux
// domaines (mon-chantier, auth, api, etc.).
const GMC_HOST = /^(www\.)?gerermonchantier\.fr$/i;

export const onRequest = defineMiddleware(async (context, next) => {
  const path = new URL(context.request.url).pathname;

  // Court-circuit pour toutes les pages != "/" (évite de lire request.headers
  // au build time pour les pages prerendered, ce qui déclenche un warning).
  if (path !== '/') return next();

  const host = context.request.headers.get('host') ?? '';
  if (GMC_HOST.test(host)) {
    // 302 redirect avec Location RELATIF — sur Vercel SSR, context.request.url
    // peut résoudre vers https://localhost/... donc on évite Response.redirect()
    // (qui exige une URL absolue) et on laisse le navigateur composer avec l'origine.
    return new Response(null, { status: 302, headers: { Location: '/gmc-home' } });
  }

  return next();
});
