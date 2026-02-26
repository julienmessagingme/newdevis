export const prerender = false;

import type { APIRoute } from 'astro';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

interface DvfMutation {
  valeur_fonciere:     string | number;
  surface_reelle_bati: string | number;
}

interface DvfResponse {
  count:   number;
  results: DvfMutation[];
}

// ── GET /api/market-prices?code_insee=...&type_bien=... ──
export const GET: APIRoute = async ({ url }) => {
  const codeInsee = url.searchParams.get('code_insee')?.trim() ?? '';
  const typeBien  = url.searchParams.get('type_bien')?.trim()  ?? '';

  if (!codeInsee || !typeBien) {
    return json({
      dvf_available: false,
      prix_m2:       null,
      source:        'DVF Etalab',
      zone_label:    '',
      note:          'Paramètres manquants (code_insee + type_bien requis)',
    }, 400);
  }

  const typeLocal = typeBien === 'maison' ? 'Maison' : 'Appartement';

  // ── Résolution du nom de commune (non bloquant) ──
  let communeName = codeInsee;
  try {
    const nameResp = await fetch(
      `https://geo.api.gouv.fr/communes/${codeInsee}?fields=nom`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (nameResp.ok) {
      const d = await nameResp.json() as { nom?: string };
      if (d.nom) communeName = d.nom;
    }
  } catch { /* non critique */ }

  // ── DVF ──
  const dvfUrl =
    `https://api.dvf.etalab.gouv.fr/geoapi/mutations/` +
    `?code_commune=${codeInsee}` +
    `&type_local=${encodeURIComponent(typeLocal)}` +
    `&date_mutation_min=2021-01-01` +
    `&fields=valeur_fonciere,surface_reelle_bati` +
    `&page_size=200`;

  let dvfData: DvfResponse;
  try {
    const dvfResp = await fetch(dvfUrl, { signal: AbortSignal.timeout(6000) });
    if (!dvfResp.ok) {
      return json({
        dvf_available: false,
        prix_m2:       null,
        source:        'DVF Etalab',
        zone_label:    communeName,
        note:          `DVF indisponible pour ${communeName}`,
      });
    }
    dvfData = await dvfResp.json() as DvfResponse;
  } catch {
    return json({
      dvf_available: false,
      prix_m2:       null,
      source:        'DVF Etalab',
      zone_label:    communeName,
      note:          `DVF indisponible — timeout pour ${communeName}`,
    });
  }

  const results = dvfData.results ?? [];

  // Filtrage : surface plausible, prix/m² [500–30 000]
  const valid = results
    .map(r => ({
      price:   typeof r.valeur_fonciere    === 'string' ? parseFloat(r.valeur_fonciere)    : r.valeur_fonciere,
      surface: typeof r.surface_reelle_bati === 'string' ? parseFloat(r.surface_reelle_bati) : r.surface_reelle_bati,
    }))
    .filter(r =>
      r.surface > 9
      && r.price > 15_000
      && r.price / r.surface >= 500
      && r.price / r.surface <= 30_000
    );

  if (valid.length < 3) {
    return json({
      dvf_available: false,
      prix_m2:       null,
      source:        'DVF Etalab',
      zone_label:    communeName,
      note:          `DVF indisponible — transactions insuffisantes pour ${communeName} (${valid.length} valide(s) sur ${results.length} brutes)`,
    });
  }

  // Médiane prix/m²
  const pricesPerM2 = valid.map(r => r.price / r.surface).sort((a, b) => a - b);
  const mid         = Math.floor(pricesPerM2.length / 2);
  const median      = pricesPerM2.length % 2 !== 0
    ? pricesPerM2[mid]
    : (pricesPerM2[mid - 1] + pricesPerM2[mid]) / 2;

  const niveau_fiabilite =
    valid.length >= 30 ? 'bon' :
    valid.length >= 10 ? 'moyen' :
    'faible';

  return json({
    dvf_available:    true,
    prix_m2:          Math.round(median),
    source:           'DVF Etalab',
    zone_label:       communeName,
    niveau_fiabilite,
    nb_transactions:  valid.length,
  });
};

export const OPTIONS: APIRoute = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
