export const prerender = false;

import type { APIRoute } from 'astro';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

interface GeoCommune {
  code: string;
  nom: string;
  population?: number;
}

export const GET: APIRoute = async ({ url }) => {
  const cp = url.searchParams.get('code_postal')?.trim() ?? '';

  if (!/^\d{5}$/.test(cp)) {
    return new Response(
      JSON.stringify({ communes: [], error: 'Code postal invalide (5 chiffres requis)' }),
      { status: 400, headers: CORS },
    );
  }

  try {
    const geoResp = await fetch(
      `https://geo.api.gouv.fr/communes?codePostal=${cp}&fields=code,nom,population&format=json`,
      { signal: AbortSignal.timeout(4000) },
    );

    if (!geoResp.ok) {
      return new Response(
        JSON.stringify({ communes: [], error: 'Service géographique indisponible' }),
        { status: 502, headers: CORS },
      );
    }

    const data = (await geoResp.json()) as GeoCommune[];

    const communes = (data ?? [])
      .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
      .map(c => ({ nom: c.nom, codeInsee: c.code }));

    return new Response(JSON.stringify({ communes }), { headers: CORS });

  } catch {
    return new Response(
      JSON.stringify({ communes: [], error: 'Erreur réseau lors de la résolution du code postal' }),
      { status: 500, headers: CORS },
    );
  }
};

export const OPTIONS: APIRoute = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
