export const prerender = false;

import type { APIRoute } from 'astro';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

/** Extrait le code département depuis un code INSEE (gère Corse + DOM) */
function getDeptCode(insee: string): string {
  if (insee.startsWith('2A') || insee.startsWith('2B')) return insee.slice(0, 2);
  if (insee.startsWith('97')) return insee.slice(0, 3);
  return insee.slice(0, 2);
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : ((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** Parse le CSV DVF et retourne la liste des prix/m² filtrés (1 par mutation) */
function parseDvfCsv(text: string, targetTypeLocal: string): number[] {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const headers = (lines[0] ?? '').split(',');
  const idxId      = headers.indexOf('id_mutation');
  const idxNature  = headers.indexOf('nature_mutation');
  const idxValeur  = headers.indexOf('valeur_fonciere');
  const idxSurface = headers.indexOf('surface_reelle_bati');
  const idxType    = headers.indexOf('type_local');

  if (idxValeur < 0 || idxSurface < 0 || idxType < 0) return [];

  const seen = new Set<string>();
  const prices: number[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (!line) continue;

    const cols = line.split(',');

    // Déduplique par id_mutation pour éviter de compter 2× une même vente
    const mutId = idxId >= 0 ? (cols[idxId] ?? '') : `${i}`;
    if (mutId && seen.has(mutId)) continue;

    if (cols[idxNature] !== 'Vente') continue;
    if (cols[idxType] !== targetTypeLocal) continue;

    const valeur  = parseFloat(cols[idxValeur]  ?? '');
    const surface = parseFloat(cols[idxSurface] ?? '');

    if (!valeur || !surface || surface < 9 || valeur < 15_000) continue;

    const prixM2 = valeur / surface;
    if (prixM2 < 500 || prixM2 > 30_000) continue;

    if (mutId) seen.add(mutId);
    prices.push(prixM2);
  }

  return prices;
}

/** Tente de télécharger le CSV pour une année donnée, renvoie le texte ou null */
async function fetchCsv(dept: string, insee: string, year: number): Promise<string | null> {
  const url = `https://files.data.gouv.fr/geo-dvf/latest/csv/${year}/communes/${dept}/${insee}.csv`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

// ── GET /api/market-prices?code_insee=...&type_bien=... ──────────────────────
export const GET: APIRoute = async ({ url }) => {
  const codeInsee = url.searchParams.get('code_insee')?.trim() ?? '';
  const typeBien  = url.searchParams.get('type_bien')?.trim()  ?? '';

  if (!codeInsee || !typeBien) {
    return json({
      dvf_available: false,
      prix_m2:       null,
      source:        'DVF data.gouv.fr',
      zone_label:    '',
      note:          'Paramètres manquants (code_insee + type_bien requis)',
    }, 400);
  }

  // Mapping type_bien → type_local DVF
  const typeLocalMap: Record<string, string> = {
    maison:        'Maison',
    appartement:   'Appartement',
    villa:         'Maison',
    pavillon:      'Maison',
    studio:        'Appartement',
    loft:          'Appartement',
  };
  const targetTypeLocal = typeLocalMap[typeBien.toLowerCase()] ?? 'Maison';
  const dept = getDeptCode(codeInsee);

  // Résolution commune + téléchargement CSV en parallèle
  const [communeResult, csv2024] = await Promise.all([
    fetch(`https://geo.api.gouv.fr/communes/${codeInsee}?fields=nom`, {
      signal: AbortSignal.timeout(4_000),
    }).then(r => r.ok ? r.json() as Promise<{ nom?: string }> : null).catch(() => null),
    fetchCsv(dept, codeInsee, 2024),
  ]);

  const communeName: string =
    (communeResult as { nom?: string } | null)?.nom ?? codeInsee;

  // Si 2024 absent ou trop court, essai 2023
  let csvText = csv2024;
  let annee   = 2024;
  if (!csvText || csvText.split('\n').length < 5) {
    csvText = await fetchCsv(dept, codeInsee, 2023);
    annee   = 2023;
  }

  if (!csvText) {
    return json({
      dvf_available: false,
      prix_m2:       null,
      source:        'DVF data.gouv.fr',
      zone_label:    communeName,
      note:          `Aucune donnée DVF disponible pour ${communeName}`,
    });
  }

  const prices = parseDvfCsv(csvText, targetTypeLocal);

  if (prices.length < 3) {
    return json({
      dvf_available: false,
      prix_m2:       null,
      source:        'DVF data.gouv.fr',
      zone_label:    communeName,
      note:          `Pas assez de transactions ${targetTypeLocal.toLowerCase()} à ${communeName} (${prices.length} trouvée${prices.length > 1 ? 's' : ''})`,
    });
  }

  const prixM2          = Math.round(median(prices));
  const niveau_fiabilite =
    prices.length >= 30 ? 'bon' :
    prices.length >= 10 ? 'moyen' :
    'faible';

  return json({
    dvf_available:    true,
    prix_m2:          prixM2,
    source:           `DVF data.gouv.fr (${annee})`,
    zone_label:       communeName,
    niveau_fiabilite,
    nb_transactions:  prices.length,
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
