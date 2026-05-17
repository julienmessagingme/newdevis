export const prerender = false;

import type { APIRoute } from 'astro';

// Proxy d'images B2 mis en cache par le CDN Vercel.
//
// Pourquoi : le bucket B2 `verifiermondevismarketing` est public mais B2 a un
// quota de download (bande passante + transactions classe B). Charger les ~2600
// PNG de previews directement depuis le navigateur via <img src="…b2…"> tape B2
// à CHAQUE affichage → le quota gratuit explose et toutes les images tombent en
// 403 « download_cap_exceeded ».
//
// Ce proxy règle ça : l'image transite par une fonction Vercel qui renvoie un
// Cache-Control immutable 1 an. Le CDN Vercel met alors l'image en cache et ne
// retape plus jamais B2 pour cette URL. B2 n'est sollicité qu'UNE fois par image
// (jusqu'à régénération — les URLs portent un `?v=<timestamp>` qui change à
// chaque regen, donc une nouvelle clé de cache).
//
// SSRF : seules les URLs du bucket marketing sont relayées.

const B2_BASE = 'https://f003.backblazeb2.com/file/verifiermondevismarketing/';

export const GET: APIRoute = async ({ url }) => {
  const target = url.searchParams.get('u');
  if (!target || !target.startsWith(B2_BASE)) {
    return new Response('bad url', { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { signal: AbortSignal.timeout(20000) });
  } catch {
    return new Response('upstream error', { status: 502 });
  }

  if (!upstream.ok) {
    // B2 quota dépassé (403) ou fichier absent (404) — on relaie le statut sans
    // le mettre en cache, pour que l'image réapparaisse dès que B2 redevient OK.
    return new Response(`upstream ${upstream.status}`, {
      status: upstream.status === 404 ? 404 : 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'image/png',
      // Cache CDN Vercel 1 an : l'URL change à chaque regen (?v=…), donc safe.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'CDN-Cache-Control': 'public, max-age=31536000, immutable',
      'Vercel-CDN-Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
