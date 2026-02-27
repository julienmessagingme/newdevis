export const prerender = false;

import type { APIRoute } from 'astro';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

interface DvfRow {
  code_insee:  string;
  commune:     string;
  code_postal: string | null;
  prix_m2:     number;
  source:      string | null;
}

// ── GET /api/market-prices ────────────────────────────────────────────────────
// Paramètres : code_insee (principal) | code_postal + commune (fallback)
// Table cible : public.dvf_prices  (code_insee, commune, code_postal, prix_m2, source)
//
// Exemples :
//   /api/market-prices?code_insee=31555
//   /api/market-prices?code_postal=31000&commune=Toulouse
export const GET: APIRoute = async ({ url }) => {
  const codeInsee  = url.searchParams.get('code_insee')?.trim()  ?? '';
  const codePostal = url.searchParams.get('code_postal')?.trim() ?? '';
  const communeQ   = url.searchParams.get('commune')?.trim()     ?? '';

  if (!codeInsee && !codePostal) {
    return json(
      { error: 'code_insee requis (ou code_postal + commune en fallback)' },
      400,
    );
  }

  // ── Env vars ──────────────────────────────────────────────────────────────
  const SUPA_URL = (
    import.meta.env.PUBLIC_SUPABASE_URL ??
    import.meta.env.VITE_SUPABASE_URL   ?? ''
  ) as string;
  const SUPA_KEY = (
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY   ?? ''
  ) as string;

  if (!SUPA_URL || !SUPA_KEY) {
    return json(
      { error: 'Config Supabase manquante — vérifiez PUBLIC_SUPABASE_URL et PUBLIC_SUPABASE_PUBLISHABLE_KEY sur Vercel.' },
      500,
    );
  }

  // ── Build URL REST ────────────────────────────────────────────────────────
  const SELECT = 'code_insee,commune,code_postal,prix_m2,source';
  let restUrl: string;

  if (codeInsee) {
    restUrl =
      `${SUPA_URL}/rest/v1/dvf_prices` +
      `?code_insee=eq.${encodeURIComponent(codeInsee)}` +
      `&select=${SELECT}&limit=1`;
  } else {
    const communeFilter = communeQ
      ? `&commune=ilike.${encodeURIComponent(communeQ + '*')}`
      : '';
    restUrl =
      `${SUPA_URL}/rest/v1/dvf_prices` +
      `?code_postal=eq.${encodeURIComponent(codePostal)}` +
      communeFilter +
      `&select=${SELECT}&limit=1`;
  }

  // ── Fetch Supabase REST ───────────────────────────────────────────────────
  let rows: DvfRow[];
  try {
    const resp = await fetch(restUrl, {
      headers: {
        'apikey':          SUPA_KEY,
        'Authorization':   `Bearer ${SUPA_KEY}`,
        'Accept':          'application/json',
        'Accept-Profile':  'public',
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      const safeUrl = restUrl.replace(SUPA_KEY, '***');
      return json(
        { error: `Erreur Supabase ${resp.status}: ${errText}`, url_used: safeUrl },
        resp.status >= 500 ? 500 : 404,
      );
    }

    rows = await resp.json() as DvfRow[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: `Erreur réseau: ${msg}` }, 500);
  }

  const row = rows[0] ?? null;

  if (!row || !row.prix_m2) {
    return json({
      dvf_available: false,
      note: `Aucune donnée DVF pour ${codeInsee || codePostal} (commune non couverte).`,
    }, 404);
  }

  // ── Réponse ───────────────────────────────────────────────────────────────
  return json({
    dvf_available: true,
    code_insee:    row.code_insee,
    commune:       row.commune,
    code_postal:   row.code_postal,
    prix_m2:       Math.round(row.prix_m2),
    source:        row.source ?? 'DVF (données publiques)',
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
