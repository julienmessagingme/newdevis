export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

/**
 * POST /api/chantier/[id]/devis
 * Rattache un devis existant (devis_chantier) à ce chantier,
 * OU crée un nouveau devis vide rattaché à ce chantier.
 *
 * Body (rattachement) : { devisId: string }
 * Body (création)     : { nom: string, description?: string, montant?: number, statut?: string, analyseId?: string }
 */
export const POST: APIRoute = async ({ request, params }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError('Corps de requête invalide', 400);
  }

  // Cas 1 : rattachement d'un devis existant (change son chantier_id)
  if (body.devisId && typeof body.devisId === 'string') {
    const { data, error } = await ctx.supabase
      .from('devis_chantier')
      .update({ chantier_id: chantierId })
      .eq('id', body.devisId)
      .select('id, artisan_nom, type_travaux, montant_ttc, statut, score_analyse, analyse_id, lot_id')
      .single();

    if (error) {
      console.error('[api/chantier/devis POST] rattachement error:', error.message);
      return jsonError('Erreur lors du rattachement du devis', 500);
    }

    // Also update lot_id if provided
    if (typeof body.lotId === 'string' && body.lotId) {
      await ctx.supabase
        .from('devis_chantier')
        .update({ lot_id: body.lotId })
        .eq('id', data.id);
    }

    return jsonOk({
      devis: {
        id: data.id,
        nom: data.artisan_nom,
        description: data.type_travaux,
        montant: data.montant_ttc,
        statut: data.statut,
        analyseId: data.analyse_id,
        scoreAnalyse: data.score_analyse,
        lotId: typeof body.lotId === 'string' ? body.lotId : data.lot_id,
      },
    });
  }

  // Cas 2 : création d'un nouveau devis rattaché au chantier
  const nom = typeof body.nom === 'string' ? body.nom.trim() : '';
  if (!nom) {
    return jsonError('Le nom de l\'artisan est requis', 400);
  }

  // Try to auto-populate artisan contact from linked analysis
  let artisanEmail = typeof body.artisanEmail === 'string' ? body.artisanEmail : null;
  let artisanPhone = typeof body.artisanPhone === 'string' ? body.artisanPhone : null;
  let artisanSiret = typeof body.artisanSiret === 'string' ? body.artisanSiret : null;
  const analyseId = typeof body.analyseId === 'string' ? body.analyseId : null;

  if (analyseId && (!artisanEmail || !artisanPhone)) {
    const { data: analyse } = await ctx.supabase
      .from('analyses')
      .select('raw_text')
      .eq('id', analyseId)
      .single();

    if (analyse?.raw_text) {
      try {
        const rawData = typeof analyse.raw_text === 'string' ? JSON.parse(analyse.raw_text) : analyse.raw_text;
        const entreprise = rawData?.extracted?.entreprise;
        if (entreprise) {
          if (!artisanEmail && entreprise.email) artisanEmail = entreprise.email;
          if (!artisanPhone && entreprise.telephone) artisanPhone = entreprise.telephone;
          if (!artisanSiret && entreprise.siret) artisanSiret = entreprise.siret;
        }
      } catch { /* ignore parse errors */ }
    }
  }

  const { data, error } = await ctx.supabase
    .from('devis_chantier')
    .insert({
      chantier_id: chantierId,
      lot_id: typeof body.lotId === 'string' ? body.lotId : null,
      artisan_nom: nom,
      artisan_email: artisanEmail,
      artisan_phone: artisanPhone,
      artisan_siret: artisanSiret,
      type_travaux: typeof body.description === 'string' ? body.description : 'Travaux',
      montant_ttc: typeof body.montant === 'number' ? body.montant : null,
      statut: typeof body.statut === 'string' ? body.statut : 'recu',
      analyse_id: analyseId,
    })
    .select('id, artisan_nom, artisan_email, artisan_phone, artisan_siret, type_travaux, montant_ttc, statut, score_analyse, analyse_id, lot_id')
    .single();

  if (error) {
    console.error('[api/chantier/devis POST] création error:', error.message);
    return jsonError('Erreur lors de la création du devis', 500);
  }

  return jsonOk({
    devis: {
      id: data.id,
      nom: data.artisan_nom,
      description: data.type_travaux,
      montant: data.montant_ttc,
      statut: data.statut,
      analyseId: data.analyse_id,
      scoreAnalyse: data.score_analyse,
    },
  }, 201);
};

export const OPTIONS: APIRoute = () => optionsResponse();
