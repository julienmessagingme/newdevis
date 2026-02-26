export const prerender = false;

import type { APIRoute } from 'astro';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

type NiveauFiabilite = 'bon' | 'moyen' | 'faible';

function fiabilite(nb: number | null | undefined): NiveauFiabilite {
  if (!nb || nb < 3)  return 'faible';
  if (nb >= 30)       return 'bon';
  if (nb >= 10)       return 'moyen';
  return 'faible';
}

interface DvfRow {
  commune:               string;
  prix_m2_maison:        number | null;
  prix_m2_appartement:   number | null;
  nb_ventes_maison:      number | null;
  nb_ventes_appartement: number | null;
  period:                string;
}

// ── GET /api/market-prices?code_insee=...&type_bien=... ──────
export const GET: APIRoute = async ({ url }) => {
  const codeInsee = url.searchParams.get('code_insee')?.trim() ?? '';
  const typeBien  = url.searchParams.get('type_bien')?.trim().toLowerCase() ?? '';

  if (!codeInsee) {
    return json({ dvf_available: false, prix_m2: null, source: 'DVF (données publiques)', zone_label: '', note: 'Paramètre code_insee manquant.' }, 400);
  }

  // ── Résolution des variables d'env (VITE_ ou PUBLIC_) ──
  const SUPA_URL = (
    import.meta.env.VITE_SUPABASE_URL ??
    import.meta.env.PUBLIC_SUPABASE_URL ??
    ''
  ) as string;
  const SUPA_KEY = (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    ''
  ) as string;

  if (!SUPA_URL || !SUPA_KEY) {
    return json({ dvf_available: false, prix_m2: null, source: 'DVF (données publiques)', zone_label: codeInsee, note: 'Config Supabase manquante (env vars).' });
  }

  // ── Requête REST Supabase directe (pas de lib client) ──
  const restUrl =
    `${SUPA_URL}/rest/v1/dvf_prices` +
    `?code_insee=eq.${encodeURIComponent(codeInsee)}` +
    `&select=commune,prix_m2_maison,prix_m2_appartement,nb_ventes_maison,nb_ventes_appartement,period` +
    `&limit=1`;

  let rows: DvfRow[];
  try {
    const resp = await fetch(restUrl, {
      headers: {
        'apikey':        SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Accept':        'application/json',
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      return json({ dvf_available: false, prix_m2: null, source: 'DVF (données publiques)', zone_label: codeInsee, note: `Erreur Supabase ${resp.status}: ${errText}` });
    }

    rows = await resp.json() as DvfRow[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ dvf_available: false, prix_m2: null, source: 'DVF (données publiques)', zone_label: codeInsee, note: `Erreur réseau: ${msg}` });
  }

  const data = rows[0] ?? null;

  if (!data) {
    return json({ dvf_available: false, prix_m2: null, source: 'DVF (données publiques)', zone_label: codeInsee, note: 'Données DVF non disponibles pour cette commune (bientôt couvert).' });
  }

  const isMaison  = typeBien !== 'appartement';
  const prix_m2   = isMaison ? data.prix_m2_maison     : data.prix_m2_appartement;
  const nb_ventes = isMaison ? data.nb_ventes_maison   : data.nb_ventes_appartement;
  const typeLabel = isMaison ? 'maison' : 'appartement';

  if (!prix_m2) {
    return json({ dvf_available: false, prix_m2: null, source: 'DVF (données publiques)', zone_label: data.commune, note: `Pas de données DVF ${typeLabel} pour ${data.commune}.` });
  }

  return json({
    dvf_available:    true,
    prix_m2:          Math.round(prix_m2),
    source:           'DVF (données publiques)',
    zone_label:       data.commune,
    niveau_fiabilite: fiabilite(nb_ventes),
    nb_transactions:  nb_ventes ?? 0,
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
