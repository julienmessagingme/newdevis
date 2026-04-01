export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import type { UpdateChantierPayload } from '@/types/chantier-dashboard';
import type { ArtisanIA, ChantierIAResult, LotChantier, TacheIA } from '@/types/chantier-ia';

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
    estimationSignaux: null,
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
    .select('id, nom, emoji, budget, phase, type_projet, mensualite, duree_credit, metadonnees, created_at, project_mode, whatsapp_group_id, whatsapp_invite_link')
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

  // Lots depuis lots_chantier — chargés avant le fallback check pour couvrir tous les cas
  const { data: lotsRaw, error: lotsError } = await supabase
    .from('lots_chantier')
    .select(
      'id, nom, statut, ordre, emoji, role,' +
      'job_type, quantite, unite,' +
      'budget_min_ht, budget_avg_ht, budget_max_ht,' +
      'materiaux_ht, main_oeuvre_ht, divers_ht',
    )
    .eq('chantier_id', chantierId)
    .order('ordre', { ascending: true });

  if (lotsError) {
    console.error(`[api/chantier/${chantierId} GET] lots error:`, lotsError.message);
  }

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

  // Lots : source prioritaire = lots_chantier (nouveaux chantiers)
  // Fallback lecture seule = meta.artisans avec id 'fallback-{i}' (anciens chantiers)
  const lots: LotChantier[] = lotsRaw && lotsRaw.length > 0
    ? lotsRaw.map((l) => ({
        id: l.id,
        nom: l.nom,
        statut: l.statut as LotChantier['statut'],
        ordre: l.ordre,
        emoji: l.emoji ?? undefined,
        role: l.role ?? undefined,
        // Prix de référence calculés (null si lot sans match market_prices)
        job_type:       l.job_type       ?? null,
        quantite:       l.quantite       ?? null,
        unite:          l.unite          ?? null,
        budget_min_ht:  l.budget_min_ht  ?? null,
        budget_avg_ht:  l.budget_avg_ht  ?? null,
        budget_max_ht:  l.budget_max_ht  ?? null,
        materiaux_ht:   l.materiaux_ht   ?? null,
        main_oeuvre_ht: l.main_oeuvre_ht ?? null,
        divers_ht:      l.divers_ht      ?? null,
      }))
    : (artisans as ArtisanIA[]).map((a, i) => ({
        id: `fallback-${i}`,
        nom: a.metier,
        statut: a.statut as LotChantier['statut'],
        ordre: i,
        emoji: a.emoji,
        role: a.role,
      }));

  // Fallback si metadonnees vide ou corrompu — isPlanComplet:false signale au frontend
  if (!hasRichData) {
    const result = buildFallbackResult(chantier as Record<string, unknown>, taches);
    return new Response(
      JSON.stringify({ result: { ...result, lots }, phase: chantier.phase, isPlanComplet: false, budgetAffine: meta.budget_affine ?? null, financing: meta.financing ?? null, whatsapp_group_id: (chantier as any).whatsapp_group_id ?? null, whatsapp_invite_link: (chantier as any).whatsapp_invite_link ?? null }),
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
    // Signaux de fiabilité — lot 8A (null pour les anciens chantiers)
    estimationSignaux: meta.estimationSignaux ?? null,
    // Calculés
    nbArtisans: artisans.length,
    nbFormalites: formalites.length,
    // todo_chantier — source de vérité pour done
    taches,
    // lots_chantier — source de vérité pour les lots (ou fallback meta.artisans)
    lots,
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
    JSON.stringify({
      result,
      phase: chantier.phase,
      isPlanComplet,
      projectMode: chantier.project_mode ?? null,
      budgetAffine: meta.budget_affine ?? null,
      financing: meta.financing ?? null,
      whatsapp_group_id: (chantier as any).whatsapp_group_id ?? null,
      whatsapp_invite_link: (chantier as any).whatsapp_invite_link ?? null,
    }),
    { status: 200, headers: CORS },
  );
};

// ── PATCH /api/chantier/[id] ───────────────────────────────────────────────────
// Trois branches selon le body :
//   { todoId, done }     → toggle persistance d'un todo (todo_chantier)
//   { lotId, statut }    → mise à jour statut d'un lot (lots_chantier)
//   { nom?, phase?, … }  → mise à jour des métadonnées du chantier

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

  // ── Branche 2 : mise à jour statut d'un lot ─────────────────────────────────
  if ('lotId' in body) {
    const { lotId, statut } = body;
    const VALID_STATUTS = ['a_trouver', 'a_contacter', 'ok'];

    if (typeof lotId !== 'string' || !lotId || !VALID_STATUTS.includes(statut)) {
      return new Response(
        JSON.stringify({ error: 'lotId (string) et statut valide sont requis' }),
        { status: 400, headers: CORS },
      );
    }

    // Vérifie ownership du chantier (même pattern que le toggle todo)
    const { data: ownerCheck } = await supabase
      .from('chantiers')
      .select('id')
      .eq('id', chantierId)
      .eq('user_id', user.id)
      .single();

    if (!ownerCheck) {
      return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });
    }

    // eq(chantier_id) garantit que le lot appartient bien à ce chantier
    const { error: updateError } = await supabase
      .from('lots_chantier')
      .update({ statut, updated_at: new Date().toISOString() })
      .eq('id', lotId)
      .eq('chantier_id', chantierId);

    if (updateError) {
      console.error(`[api/chantier/${chantierId} PATCH lot] error:`, updateError.message);
      return new Response(
        JSON.stringify({ error: 'Erreur lors de la mise à jour du lot' }),
        { status: 500, headers: CORS },
      );
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  // ── Branche 3 : sauvegarde affinage budget ───────────────────────────────────
  if ('budgetAffine' in body) {
    const ba = body.budgetAffine as { min?: unknown; max?: unknown; breakdown?: unknown };
    if (!ba || typeof ba.min !== 'number' || typeof ba.max !== 'number') {
      return new Response(JSON.stringify({ error: 'budgetAffine invalide (min et max requis)' }), { status: 400, headers: CORS });
    }
    const { data: ch } = await supabase
      .from('chantiers')
      .select('metadonnees')
      .eq('id', chantierId)
      .eq('user_id', user.id)
      .single();
    if (!ch) return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let metaB: Record<string, any> = {};
    try { metaB = JSON.parse((ch as Record<string, any>).metadonnees ?? '{}'); } catch { /* ignore */ }
    metaB.budget_affine = { min: ba.min, max: ba.max, breakdown: ba.breakdown ?? [], saved_at: new Date().toISOString() };
    const { error: saveError } = await supabase
      .from('chantiers')
      .update({ metadonnees: JSON.stringify(metaB) })
      .eq('id', chantierId)
      .eq('user_id', user.id);
    if (saveError) {
      console.error(`[api/chantier/${chantierId} PATCH budgetAffine] error:`, saveError.message);
      return new Response(JSON.stringify({ error: saveError.message }), { status: 500, headers: CORS });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
  }

  // ── Branche 4 : sauvegarde sources de financement + simulation aides ─────────
  if ('financing' in body) {
    const fin = body.financing as Record<string, unknown>;
    const { data: chF } = await supabase
      .from('chantiers')
      .select('metadonnees')
      .eq('id', chantierId)
      .eq('user_id', user.id)
      .single();
    if (!chF) return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let metaF: Record<string, any> = {};
    try { metaF = JSON.parse((chF as Record<string, any>).metadonnees ?? '{}'); } catch { /* ignore */ }
    metaF.financing = fin;
    const { error: saveErrF } = await supabase
      .from('chantiers')
      .update({ metadonnees: JSON.stringify(metaF) })
      .eq('id', chantierId)
      .eq('user_id', user.id);
    if (saveErrF) {
      console.error(`[api/chantier/${chantierId} PATCH financing] error:`, saveErrF.message);
      return new Response(JSON.stringify({ error: saveErrF.message }), { status: 500, headers: CORS });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
  }

  // ── Branche 5 : mise à jour chantier (nom, emoji, phase, enveloppePrevue) ────
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
  if (updatePayload.projectMode !== undefined) {
    const VALID_MODES = ['guided', 'flexible', 'investor'];
    if (!VALID_MODES.includes(updatePayload.projectMode)) {
      return new Response(JSON.stringify({ error: 'Mode de projet invalide' }), { status: 400, headers: CORS });
    }
    updates.project_mode = updatePayload.projectMode;
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

// ── DELETE /api/chantier/[id] ──────────────────────────────────────────────────
// Suppression complète d'un chantier : fichiers storage + ligne DB (cascade).
//
// Stratégie double-client :
//  • supabaseUser  : créé avec le JWT utilisateur → opérations DB user-scoped (RLS)
//  • supabaseAdmin : créé avec service_role_key  → storage privé (non-bloquant si absent)

export const DELETE: APIRoute = async ({ params, request }) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer '))
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const token = authHeader.slice(7);

  // Client avec le JWT utilisateur — fonctionne même sans service_role_key (RLS via auth.uid())
  const supabaseUser = createClient(supabaseUrl, supabaseServiceKey || import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Valide le JWT et récupère l'utilisateur
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token);
  if (authError || !user) {
    console.error('[DELETE /api/chantier] auth error:', authError?.message);
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 401, headers: CORS });
  }

  const chantierId = params.id;
  if (!chantierId)
    return new Response(JSON.stringify({ error: 'ID manquant' }), { status: 400, headers: CORS });

  // Vérifie ownership via RLS (auth.uid() = user_id dans la policy chantiers)
  const { data: ownerCheck, error: ownerErr } = await supabaseUser
    .from('chantiers')
    .select('id')
    .eq('id', chantierId)
    .eq('user_id', user.id)
    .single();

  if (ownerErr || !ownerCheck) {
    console.error(`[DELETE /api/chantier/${chantierId}] ownership check:`, ownerErr?.message ?? 'not found');
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });
  }

  // Récupère les chemins storage (non-bloquant si la table est vide)
  const { data: docs } = await supabaseUser
    .from('documents_chantier')
    .select('bucket_path')
    .eq('chantier_id', chantierId);

  // Suppression des fichiers storage via service_role (non-bloquant si absent en local)
  const paths = (docs ?? []).map((d: { bucket_path: string }) => d.bucket_path).filter(Boolean);
  if (paths.length > 0 && supabaseServiceKey) {
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { error: storageErr } = await supabaseAdmin.storage
      .from('chantier-documents')
      .remove(paths);
    if (storageErr) {
      console.error(`[DELETE /api/chantier/${chantierId}] storage:`, storageErr.message);
    }
  }

  // Suppression du chantier — CASCADE supprime todos, lots, documents, devis, contacts
  const { error: deleteErr } = await supabaseUser
    .from('chantiers')
    .delete()
    .eq('id', chantierId)
    .eq('user_id', user.id);

  if (deleteErr) {
    console.error(`[DELETE /api/chantier/${chantierId}] db delete:`, deleteErr.message, deleteErr.code);
    return new Response(
      JSON.stringify({ error: `Erreur lors de la suppression : ${deleteErr.message}` }),
      { status: 500, headers: CORS },
    );
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
};

export const OPTIONS: APIRoute = () =>
  new Response(null, {
    status: 204,
    headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,PATCH,DELETE,OPTIONS' },
  });
