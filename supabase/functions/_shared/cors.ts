// ============================================================
// CORS partagé — edge functions appelées depuis le navigateur.
//
// 2026-08-03 — Incident /admin sur gerermonchantier.fr : chaque fonction
// dupliquait un `corsHeaders` hardcodé VMD-only, alors que le build Vercel
// sert les MÊMES pages (dont /admin) sur les 2 domaines. Résultat : preflight
// refusé depuis www.gerermonchantier.fr → « Erreur de chargement » silencieuse.
//
// Ce helper reflète l'Origin de la requête s'il appartient à l'allowlist,
// sinon retombe sur VMD (les crons/appels serveur n'ont pas d'Origin — le
// fallback est sans effet pour eux). `Vary: Origin` évite qu'un cache CDN
// serve l'en-tête d'un domaine à l'autre.
//
// Usage dans une edge function :
//   import { corsHeadersFor } from "../_shared/cors.ts";
//   serve(async (req) => {
//     const corsHeaders = corsHeadersFor(req);
//     if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
//     ...
//   });
//
// Si on ajoute un 3e domaine un jour : UNIQUEMENT ici.
// ============================================================

const ALLOWED_ORIGINS = new Set([
  "https://www.verifiermondevis.fr",
  "https://verifiermondevis.fr",
  "https://www.gerermonchantier.fr",
  "https://gerermonchantier.fr",
  "http://localhost:4321",
]);

export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://www.verifiermondevis.fr",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}
