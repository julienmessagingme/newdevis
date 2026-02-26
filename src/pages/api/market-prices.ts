export const prerender = false;

import type { APIRoute } from 'astro';

// ── Types ──
interface GeoCommune {
  code: string;
  nom: string;
  population?: number;
}

interface DvfMutation {
  valeur_fonciere: string | number;
  surface_reelle_bati: string | number;
}

interface DvfResponse {
  count: number;
  results: DvfMutation[];
}

// ── CORS headers ──
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

// ── Main handler ──
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as { code_postal?: string; type_bien?: string };
    const { code_postal, type_bien } = body;

    if (!code_postal || !type_bien || !/^\d{5}$/.test(code_postal)) {
      return json({ available: false, error: 'Paramètres invalides (code_postal 5 chiffres + type_bien requis)' }, 400);
    }

    // ── Étape 1 : code postal → code INSEE commune ──
    const geoUrl = `https://geo.api.gouv.fr/communes?codePostal=${code_postal}&fields=code,nom,population&format=json`;
    let communes: GeoCommune[];
    try {
      const geoResp = await fetch(geoUrl, { signal: AbortSignal.timeout(4000) });
      if (!geoResp.ok) return json({ available: false, error: 'Service géographique indisponible' });
      communes = await geoResp.json() as GeoCommune[];
    } catch {
      return json({ available: false, error: 'Timeout geo.api.gouv.fr' });
    }

    if (!communes || communes.length === 0) {
      return json({ available: false, error: `Aucune commune pour le code postal ${code_postal}` });
    }

    // Commune la plus peuplée en priorité
    const commune = communes.sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];

    // ── Étape 2 : DVF ETALAB ──
    const typeLocal = type_bien === 'maison' ? 'Maison' : 'Appartement';
    const dateMin   = '2021-01-01'; // ~4 ans de données

    const dvfUrl = `https://api.dvf.etalab.gouv.fr/geoapi/mutations/?code_commune=${commune.code}&type_local=${encodeURIComponent(typeLocal)}&date_mutation_min=${dateMin}&fields=valeur_fonciere,surface_reelle_bati&page_size=200`;

    let dvfData: DvfResponse;
    try {
      const dvfResp = await fetch(dvfUrl, { signal: AbortSignal.timeout(6000) });
      if (!dvfResp.ok) return json({ available: false, error: 'API DVF indisponible', commune: commune.nom });
      dvfData = await dvfResp.json() as DvfResponse;
    } catch {
      return json({ available: false, error: 'Timeout API DVF', commune: commune.nom });
    }

    const results = dvfData.results ?? [];

    // Filtrage : surface plausible, prix total cohérent, prix/m² dans [500 – 30 000]
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
        available: false,
        error: `Transactions insuffisantes pour ${commune.nom} (${valid.length} valide(s) sur ${results.length} brutes)`,
        commune: commune.nom,
      });
    }

    // Médiane des prix/m²
    const pricesPerM2 = valid.map(r => r.price / r.surface).sort((a, b) => a - b);
    const mid    = Math.floor(pricesPerM2.length / 2);
    const median = pricesPerM2.length % 2 !== 0
      ? pricesPerM2[mid]
      : (pricesPerM2[mid - 1] + pricesPerM2[mid]) / 2;

    const niveau_fiabilite = valid.length >= 30 ? 'bon' : valid.length >= 10 ? 'moyen' : 'faible';

    return json({
      available:        true,
      prix_m2_estime:   Math.round(median),
      source:           'ETALAB DVF',
      niveau_fiabilite,
      nb_transactions:  valid.length,
      commune:          commune.nom,
      type_bien:        typeLocal,
    });

  } catch (err) {
    return json({ available: false, error: 'Erreur interne — réessayez' }, 500);
  }
};

export const OPTIONS: APIRoute = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
