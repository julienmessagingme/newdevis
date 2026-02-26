export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@/integrations/supabase/client';

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

// ── GET /api/market-prices?code_insee=...&type_bien=... ──────
export const GET: APIRoute = async ({ url }) => {
  const codeInsee = url.searchParams.get('code_insee')?.trim() ?? '';
  const typeBien  = url.searchParams.get('type_bien')?.trim().toLowerCase() ?? '';

  if (!codeInsee) {
    return json({
      dvf_available: false,
      prix_m2:       null,
      source:        'DVF (données publiques)',
      zone_label:    '',
      note:          'Paramètre code_insee manquant.',
    }, 400);
  }

  const { data, error } = await supabase
    .from('dvf_prices')
    .select('commune, prix_m2_maison, prix_m2_appartement, nb_ventes_maison, nb_ventes_appartement, period')
    .eq('code_insee', codeInsee)
    .maybeSingle();

  if (error) {
    return json({
      dvf_available: false,
      prix_m2:       null,
      source:        'DVF (données publiques)',
      zone_label:    codeInsee,
      note:          'Erreur de base de données.',
    });
  }

  if (!data) {
    return json({
      dvf_available: false,
      prix_m2:       null,
      source:        'DVF (données publiques)',
      zone_label:    codeInsee,
      note:          'Données DVF non disponibles pour cette commune (bientôt couvert).',
    });
  }

  // Choix maison ou appartement selon type_bien
  const isMaison  = typeBien !== 'appartement';   // défaut → maison
  const prix_m2   = isMaison ? data.prix_m2_maison       : data.prix_m2_appartement;
  const nb_ventes = isMaison ? data.nb_ventes_maison      : data.nb_ventes_appartement;
  const typeLabel = isMaison ? 'maison' : 'appartement';

  if (!prix_m2) {
    return json({
      dvf_available: false,
      prix_m2:       null,
      source:        'DVF (données publiques)',
      zone_label:    data.commune,
      note:          `Pas de données DVF ${typeLabel} pour ${data.commune}.`,
    });
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
