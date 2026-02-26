export const prerender = false;

import type { APIRoute } from 'astro';

// ── GET /api/debug-supabase ────────────────────────────────────
// Diagnostic pour vérifier que Vercel pointe vers le bon projet Supabase
// et que la table dvf_prices_yearly est accessible.
//
// Retourne :
//   supabaseUrlPrefix  — premiers caractères de l'URL (safe à partager)
//   keyPrefix          — premiers caractères de la clé anon (safe à partager)
//   tableOk            — true si dvf_prices_yearly répond correctement
//   errorMessage       — null si tableOk, sinon le message d'erreur brut
//   hint               — conseil de résolution si erreur
//
// Usage : GET /api/debug-supabase
//         (aucun paramètre requis)
export const GET: APIRoute = async () => {
  const SUPA_URL = (
    import.meta.env.VITE_SUPABASE_URL ??
    import.meta.env.PUBLIC_SUPABASE_URL ?? ''
  ) as string;
  const SUPA_KEY = (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  ) as string;

  // Masquage partiel des valeurs sensibles
  const mask = (s: string, keep = 28) =>
    s.length > keep ? s.slice(0, keep) + '...' : s || '(non définie)';

  const supabaseUrlPrefix = mask(SUPA_URL);
  const keyPrefix         = mask(SUPA_KEY, 20);

  const respond = (payload: object) =>
    new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  // ── Env vars absentes ──────────────────────────────────────
  if (!SUPA_URL || !SUPA_KEY) {
    return respond({
      supabaseUrlPrefix,
      keyPrefix,
      tableOk:      false,
      errorMessage: 'Variables env absentes sur ce déploiement.',
      hint: 'Dans Vercel → Project Settings → Environment Variables, vérifiez PUBLIC_SUPABASE_URL et PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    });
  }

  // ── Test table dvf_prices_yearly ──────────────────────────
  const testUrl = `${SUPA_URL}/rest/v1/dvf_prices_yearly?select=year&limit=1`;
  let tableOk      = false;
  let errorMessage: string | null = null;
  let hint: string | null = null;
  let rowsSample: unknown = null;

  try {
    const resp = await fetch(testUrl, {
      headers: {
        'apikey':         SUPA_KEY,
        'Authorization':  `Bearer ${SUPA_KEY}`,
        'Accept':         'application/json',
        'Accept-Profile': 'public',
      },
      signal: AbortSignal.timeout(8_000),
    });

    const body = await resp.text().catch(() => '');

    if (resp.ok) {
      tableOk    = true;
      // Retourner un aperçu des données (ne contient que "year", pas de données sensibles)
      try { rowsSample = JSON.parse(body); } catch { rowsSample = body; }
    } else {
      errorMessage = `HTTP ${resp.status}: ${body}`;

      if (resp.status === 404 || body.includes('schema cache')) {
        hint =
          'La table est introuvable dans le cache de schéma PostgREST. ' +
          'Exécutez dans le SQL Editor Supabase : NOTIFY pgrst, \'reload schema\'; ' +
          'OU allez dans Project Settings → API → Reload schema cache.';
      } else if (resp.status === 401 || body.includes('JWT')) {
        hint = 'Clé anon invalide ou expirée. Vérifiez PUBLIC_SUPABASE_PUBLISHABLE_KEY.';
      } else if (resp.status === 403 || body.includes('RLS') || body.includes('policy')) {
        hint =
          'Policy RLS manquante. Exécutez : ' +
          'CREATE POLICY "public read dvf_prices_yearly" ON public.dvf_prices_yearly ' +
          'FOR SELECT TO anon, authenticated USING (true);';
      } else {
        hint = 'Vérifiez que PUBLIC_SUPABASE_URL correspond bien au bon projet Supabase.';
      }
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
    hint         = 'Erreur réseau — vérifiez que SUPA_URL est correcte et accessible depuis Vercel.';
  }

  return respond({
    supabaseUrlPrefix,
    keyPrefix,
    tableOk,
    errorMessage,
    hint,
    ...(tableOk && rowsSample !== null ? { rowsSample } : {}),
  });
};
