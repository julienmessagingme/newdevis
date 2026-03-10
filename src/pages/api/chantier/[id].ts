export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import type { UpdateChantierPayload } from '@/types/chantier-dashboard';
import type { ChantierIAResult, TacheIA } from '@/types/chantier-ia';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const VALID_PHASES = ['preparation', 'gros_oeuvre', 'second_oeuvre', 'finitions', 'reception'];

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Helpers ────────────────────────────────────────────────────────────────────

function safeNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

/** Résultat minimal si metadonnees est absent ou invalide */
function buildFallbackResult(
  chantier: Record<string, unknown>,
  taches: TacheIA[],
): ChantierIAResult {
  const budget = safeNumber(chantier.budget);
  return {
    nom: String(chantier.nom ?? 'Mon chantier'),
    emoji: String(chantier.emoji ?? '🏗️'),
    description: '',
    typeProjet: (chantier.type_projet as ChantierIAResult['typeProjet']) ?? 'autre',
    budgetTotal: budget,
    dureeEstimeeMois: 0,
    nbArtisans: 0,
    nbFormalites: 0,
    financement: chantier.mensualite ? 'credit' : 'apport',
    mensualite: chantier.mensualite ? safeNumber(chantier.mensualite) : undefined,
    dureeCredit: chantier.duree_credit ? safeNumber(chantier.duree_credit) : undefined,
    lignesBudget: budget > 0
      ? [{ label: 'Budget total', montant: budget, couleur: '#3b82f6' }]
      : [],
    roadmap: [],
    artisans: [],
    formalites: [],
    taches,
    aides: [],
    prochaineAction: {
      titre: 'Consultez votre plan',
      detail: 'Votre plan de chantier est disponible ci-dessous.',
    },
    generatedAt: String(chantier.created_at ?? ''),
    promptOriginal: '',
  };
}

// ── GET /api/chantier/[id] ─────────────────────────────────────────────────────

export const GET: APIRoute = async ({ params, request }) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });
  }

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 401, headers: CORS });
  }

  const chantierId = params.id;
  if (!chantierId) {
    return new Response(JSON.stringify({ error: 'ID manquant' }), { status: 400, headers: CORS });
  }

  // Chargement avec vérification ownership
  const { data: chantier, error: chantierError } = await supabase
    .from('chantiers')
    .select('id, nom, emoji, budget, phase, type_projet, mensualite, duree_credit, metadonnees, created_at')
    .eq('id', chantierId)
    .eq('user_id', user.id)
    .single();

  if (chantierError || !chantier) {
    return new Response(
      JSON.stringify({ error: 'Chantier introuvable' }),
      { status: 404, headers: CORS },
    );
  }

  // Todos depuis todo_chantier (source de vérité pour done)
  const { data: todosRaw, error: todosError } = await supabase
    .from('todo_chantier')
    .select('id, titre, priorite, done')
    .eq('chantier_id', chantierId)
    .order('ordre', { ascending: true });

  if (todosError) {
    console.error(`[api/chantier/${chantierId} GET] todos error:`, todosError.message);
  }

  const taches: TacheIA[] = (todosRaw ?? []).map((t) => ({
    id: t.id,
    titre: t.titre,
    priorite: t.priorite as TacheIA['priorite'],
    done: Boolean(t.done),
  }));

  // Parsing sécurisé de metadonnees — ne plante jamais
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let meta: Record<string, any> = {};
  if (chantier.metadonnees) {
    try {
      const parsed = JSON.parse(chantier.metadonnees);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        meta = parsed;
      } else {
        console.warn(`[api/chantier/${chantierId} GET] metadonnees not an object, using fallback`);
      }
    } catch (e) {
      console.error(
        `[api/chantier/${chantierId} GET] metadonnees parse error:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  const artisans = Array.isArray(meta.artisans) ? meta.artisans : [];
  const roadmap = Array.isArray(meta.roadmap) ? meta.roadmap : [];
  const formalites = Array.isArray(meta.formalites) ? meta.formalites : [];
  const aides = Array.isArray(meta.aides) ? meta.aides : [];
  const hasRichData = artisans.length > 0 || roadmap.length > 0 || formalites.length > 0;

  // Fallback si metadonnees vide ou corrompu — isPlanComplet:false signale au frontend
  if (!hasRichData) {
    const result = buildFallbackResult(chantier as Record<string, unknown>, taches);
    return new Response(
      JSON.stringify({ result, phase: chantier.phase, isPlanComplet: false }),
      { status: 200, headers: CORS },
    );
  }

  // Reconstruction complète
  const budget = safeNumber(chantier.budget);

  const lignesBudget = Array.isArray(meta.lignesBudget) && meta.lignesBudget.length > 0
    ? meta.lignesBudget
    : [{ label: 'Budget total', montant: budget, couleur: '#3b82f6' }];

  const prochaineAction =
    meta.prochaineAction &&
    typeof meta.prochaineAction === 'object' &&
    typeof meta.prochaineAction.titre === 'string'
      ? meta.prochaineAction as ChantierIAResult['prochaineAction']
      : { titre: 'Consultez votre plan', detail: 'Votre plan de chantier est disponible ci-dessous.' };

  const result: ChantierIAResult = {
    // Colonnes DB — source de vérité
    nom: String(chantier.nom ?? ''),
    emoji: String(chantier.emoji ?? '🏗️'),
    typeProjet: (chantier.type_projet as ChantierIAResult['typeProjet']) ?? 'autre',
    budgetTotal: budget,
    mensualite: chantier.mensualite ? safeNumber(chantier.mensualite) : undefined,
    dureeCredit: chantier.duree_credit ? safeNumber(chantier.duree_credit) : undefined,
    // Metadonnees avec fallbacks
    description: typeof meta.description === 'string' ? meta.description : '',
    dureeEstimeeMois: typeof meta.dureeEstimeeMois === 'number' ? meta.dureeEstimeeMois : 0,
    financement: (meta.financement as ChantierIAResult['financement'])
      ?? (chantier.mensualite ? 'credit' : 'apport'),
    lignesBudget,
    roadmap,
    artisans,
    formalites,
    aides,
    prochaineAction,
    generatedAt: String(chantier.created_at ?? ''),
    promptOriginal: '',
    // Calculés
    nbArtisans: artisans.length,
    nbFormalites: formalites.length,
    // todo_chantier — source de vérité pour done
    taches,
  };

  // Règle explicite et stable :
  // • roadmap non vide (colonne vertébrale du plan IA)
  // • ET au moins un des suivants exploitable : artisans, formalites, lignesBudget, prochaineAction
  const isPlanComplet =
    roadmap.length > 0 &&
    (
      artisans.length > 0 ||
      formalites.length > 0 ||
      (Array.isArray(meta.lignesBudget) && meta.lignesBudget.length > 0) ||
      (
        meta.prochaineAction != null &&
        typeof meta.prochaineAction === 'object' &&
        typeof meta.prochaineAction.titre === 'string' &&
        meta.prochaineAction.titre.length > 0
      )
    );

  return new Response(
    JSON.stringify({ result, phase: chantier.phase, isPlanComplet }),
    { status: 200, headers: CORS },
  );
};

// ── PATCH /api/chantier/[id] ───────────────────────────────────────────────────
// Deux usages selon le body :
//   { todoId, done }     → toggle persistance d'un todo
//   { nom?, phase?, … }  → mise à jour des métadonnées du chantier (existant)

export const PATCH: APIRoute = async ({ request, params }) => {
  const chantierId = params.id;
  if (!chantierId) {
    return new Response(JSON.stringify({ error: 'ID chantier manquant' }), { status: 400, headers: CORS });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });
  }

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 401, headers: CORS });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide' }), { status: 400, headers: CORS });
  }

  // ── Branche 1 : toggle todo ──────────────────────────────────────────────────
  if ('todoId' in body) {
    if (typeof body.todoId !== 'string' || !body.todoId || typeof body.done !== 'boolean') {
      return new Response(
        JSON.stringify({ error: 'todoId (string) et done (boolean) sont requis' }),
        { status: 400, headers: CORS },
      );
    }

    // Vérifie ownership du chantier avant de toucher au todo
    const { data: ownerCheck } = await supabase
      .from('chantiers')
      .select('id')
      .eq('id', chantierId)
      .eq('user_id', user.id)
      .single();

    if (!ownerCheck) {
      return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });
    }

    // eq(chantier_id) garantit que le todo appartient bien à ce chantier
    const { error: updateError } = await supabase
      .from('todo_chantier')
      .update({ done: body.done })
      .eq('id', body.todoId)
      .eq('chantier_id', chantierId);

    if (updateError) {
      console.error(`[api/chantier/${chantierId} PATCH todo] error:`, updateError.message);
      return new Response(
        JSON.stringify({ error: 'Erreur lors de la mise à jour du todo' }),
        { status: 500, headers: CORS },
      );
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  // ── Branche 2 : mise à jour chantier (nom, emoji, phase, enveloppePrevue) ────
  const updatePayload = body as UpdateChantierPayload;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updatePayload.nom !== undefined) updates.nom = updatePayload.nom.trim();
  if (updatePayload.emoji !== undefined) updates.emoji = updatePayload.emoji;
  if (updatePayload.phase !== undefined) {
    if (!VALID_PHASES.includes(updatePayload.phase)) {
      return new Response(JSON.stringify({ error: 'Phase invalide' }), { status: 400, headers: CORS });
    }
    updates.phase = updatePayload.phase;
  }
  if (updatePayload.enveloppePrevue !== undefined) {
    if (typeof updatePayload.enveloppePrevue !== 'number' || updatePayload.enveloppePrevue < 0) {
      return new Response(
        JSON.stringify({ error: 'Enveloppe budgétaire invalide' }),
        { status: 400, headers: CORS },
      );
    }
    updates.budget = updatePayload.enveloppePrevue;
  }

  const { data, error } = await supabase
    .from('chantiers')
    .update(updates)
    .eq('id', chantierId)
    .eq('user_id', user.id)
    .select('id, nom, emoji, budget, phase, updated_at')
    .single();

  if (error) {
    console.error('[api/chantier PATCH] update error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Erreur lors de la mise à jour' }),
      { status: 500, headers: CORS },
    );
  }
  if (!data) {
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });
  }

  return new Response(JSON.stringify({ chantier: data }), { status: 200, headers: CORS });
};

export const OPTIONS: APIRoute = () =>
  new Response(null, {
    status: 204,
    headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,PATCH,OPTIONS' },
  });
