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
    return context.rewrite('/gmc-home');
  }

  return next();
});
