export const prerender = false;

import type { APIRoute } from 'astro';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

type Fiabilite = 'bonne' | 'moyenne' | 'faible';

function fiabilite(nb: number | null | undefined): Fiabilite {
  if (!nb || nb < 20) return 'faible';
  if (nb >= 50)       return 'bonne';
  return 'moyenne';
}

interface DvfYearlyRow {
  code_insee:  string;
  commune:     string;
  code_postal: string;
  type_bien:   string;
  year:        number;
  prix_m2_p25: number | null;
  prix_m2_p50: number | null;
  prix_m2_p75: number | null;
  nb_ventes:   number | null;
  source:      string | null;
  created_at:  string | null; // colonne réelle de la table (pas updated_at)
}

// ── GET /api/market-prices ────────────────────────────────────
// Paramètres principaux  : code_insee + type_bien
// Fallback               : code_postal + commune + type_bien
// Retourne la dernière année disponible (order=year.desc&limit=1)
//
// Exemples :
//   /api/market-prices?code_insee=31555&type_bien=appartement
//   /api/market-prices?code_postal=31000&commune=Toulouse&type_bien=maison
export const GET: APIRoute = async ({ url }) => {
  const codeInsee  = url.searchParams.get('code_insee')?.trim()  ?? '';
  const typeBien   = url.searchParams.get('type_bien')?.trim().toLowerCase() ?? '';
  const codePostal = url.searchParams.get('code_postal')?.trim() ?? '';
  const communeQ   = url.searchParams.get('commune')?.trim()     ?? '';

  // ── Validation ─────────────────────────────────────────────
  if (!typeBien || !['maison', 'appartement'].includes(typeBien)) {
    return json(
      { error: "type_bien invalide — valeurs acceptées : 'maison' | 'appartement'" },
      400,
    );
  }
  if (!codeInsee && !codePostal) {
    return json(
      { error: 'code_insee requis (ou code_postal + commune en fallback)' },
      400,
    );
  }

  // ── Env vars ───────────────────────────────────────────────
  // Le projet peut utiliser VITE_ (dev local Astro) ou PUBLIC_ (Vercel)
  const SUPA_URL = (
    import.meta.env.VITE_SUPABASE_URL ??
    import.meta.env.PUBLIC_SUPABASE_URL ?? ''
  ) as string;
  const SUPA_KEY = (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  ) as string;

  if (!SUPA_URL || !SUPA_KEY) {
    return json(
      { error: 'Config Supabase manquante — vérifiez PUBLIC_SUPABASE_URL et PUBLIC_SUPABASE_PUBLISHABLE_KEY sur Vercel.' },
      500,
    );
  }

  // ── Build URL REST ─────────────────────────────────────────
  // Colonnes réelles de dvf_prices_yearly (created_at, pas updated_at)
  const SELECT = 'code_insee,commune,code_postal,type_bien,year,prix_m2_p25,prix_m2_p50,prix_m2_p75,nb_ventes,source,created_at';
  let restUrl: string;

  if (codeInsee) {
    restUrl =
      `${SUPA_URL}/rest/v1/dvf_prices_yearly` +
      `?code_insee=eq.${encodeURIComponent(codeInsee)}` +
      `&type_bien=eq.${encodeURIComponent(typeBien)}` +
      `&order=year.desc&limit=1` +
      `&select=${SELECT}`;
  } else {
    // Fallback code_postal + commune (ilike pour tolérer les accents)
    const communeFilter = communeQ
      ? `&commune=ilike.${encodeURIComponent(communeQ + '*')}`
      : '';
    restUrl =
      `${SUPA_URL}/rest/v1/dvf_prices_yearly` +
      `?code_postal=eq.${encodeURIComponent(codePostal)}` +
      communeFilter +
      `&type_bien=eq.${encodeURIComponent(typeBien)}` +
      `&order=year.desc&limit=1` +
      `&select=${SELECT}`;
  }

  // ── Fetch Supabase REST ─────────────────────────────────────
  // Accept-Profile: public → force PostgREST à chercher dans le schéma public
  // (évite l'erreur "Could not find table in schema cache")
  let rows: DvfYearlyRow[];
  try {
    const resp = await fetch(restUrl, {
      headers: {
        'apikey':           SUPA_KEY,
        'Authorization':    `Bearer ${SUPA_KEY}`,
        'Accept':           'application/json',
        'Accept-Profile':   'public',    // ← critique pour le cache de schéma
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      // Aide au diagnostic : inclure l'URL sans credentials
      const safeUrl = restUrl.replace(SUPA_KEY, '***');
      return json(
        { error: `Erreur Supabase ${resp.status}: ${errText}`, url_used: safeUrl },
        resp.status >= 500 ? 500 : 404,
      );
    }

    rows = await resp.json() as DvfYearlyRow[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: `Erreur réseau: ${msg}` }, 500);
  }

  const row = rows[0] ?? null;

  if (!row) {
    return json({
      dvf_available: false,
      note: `Aucune donnée DVF ${typeBien} pour ${codeInsee || codePostal} (pas encore couvert).`,
    }, 404);
  }

  if (!row.prix_m2_p50) {
    return json({
      dvf_available: false,
      note: `Prix médian manquant pour ${row.commune} (${typeBien}).`,
    }, 404);
  }

  // ── Réponse ────────────────────────────────────────────────
  return json({
    dvf_available: true,
    code_insee:  row.code_insee,
    commune:     row.commune,
    code_postal: row.code_postal,
    type_bien:   row.type_bien,
    year:        row.year,
    prix_m2_p25: row.prix_m2_p25 !== null ? Math.round(row.prix_m2_p25) : null,
    prix_m2_p50: Math.round(row.prix_m2_p50),
    prix_m2_p75: row.prix_m2_p75 !== null ? Math.round(row.prix_m2_p75) : null,
    nb_ventes:   row.nb_ventes,
    source:      row.source ?? 'DVF (données publiques)',
    created_at:  row.created_at,
    fiabilite:   fiabilite(row.nb_ventes),
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
