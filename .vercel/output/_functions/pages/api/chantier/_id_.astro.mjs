import { createClient } from '@supabase/supabase-js';
export { renderers } from '../../../renderers.mjs';

const prerender = false;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json"
};
const VALID_PHASES = ["preparation", "gros_oeuvre", "second_oeuvre", "finitions", "reception"];
const supabaseUrl = "https://vhrhgsqxwvouswjaiczn.supabase.co";
const supabaseServiceKey = undefined                                         ;
function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}
function buildFallbackResult(chantier, taches) {
  const budget = safeNumber(chantier.budget);
  return {
    nom: String(chantier.nom ?? "Mon chantier"),
    emoji: String(chantier.emoji ?? "🏗️"),
    description: "",
    typeProjet: chantier.type_projet ?? "autre",
    budgetTotal: budget,
    dureeEstimeeMois: 0,
    nbArtisans: 0,
    nbFormalites: 0,
    financement: chantier.mensualite ? "credit" : "apport",
    mensualite: chantier.mensualite ? safeNumber(chantier.mensualite) : void 0,
    dureeCredit: chantier.duree_credit ? safeNumber(chantier.duree_credit) : void 0,
    lignesBudget: budget > 0 ? [{ label: "Budget total", montant: budget, couleur: "#3b82f6" }] : [],
    roadmap: [],
    artisans: [],
    formalites: [],
    taches,
    aides: [],
    prochaineAction: {
      titre: "Consultez votre plan",
      detail: "Votre plan de chantier est disponible ci-dessous."
    },
    generatedAt: String(chantier.created_at ?? ""),
    promptOriginal: "",
    estimationSignaux: null
  };
}
const GET = async ({ params, request }) => {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: CORS });
  }
  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Token invalide" }), { status: 401, headers: CORS });
  }
  const chantierId = params.id;
  if (!chantierId) {
    return new Response(JSON.stringify({ error: "ID manquant" }), { status: 400, headers: CORS });
  }
  const { data: chantier, error: chantierError } = await supabase.from("chantiers").select("id, nom, emoji, budget, phase, type_projet, mensualite, duree_credit, metadonnees, created_at").eq("id", chantierId).eq("user_id", user.id).single();
  if (chantierError || !chantier) {
    return new Response(
      JSON.stringify({ error: "Chantier introuvable" }),
      { status: 404, headers: CORS }
    );
  }
  const { data: todosRaw, error: todosError } = await supabase.from("todo_chantier").select("id, titre, priorite, done").eq("chantier_id", chantierId).order("ordre", { ascending: true });
  if (todosError) {
    console.error(`[api/chantier/${chantierId} GET] todos error:`, todosError.message);
  }
  const taches = (todosRaw ?? []).map((t) => ({
    id: t.id,
    titre: t.titre,
    priorite: t.priorite,
    done: Boolean(t.done)
  }));
  const { data: lotsRaw, error: lotsError } = await supabase.from("lots_chantier").select(
    "id, nom, statut, ordre, emoji, role,job_type, quantite, unite,budget_min_ht, budget_avg_ht, budget_max_ht,materiaux_ht, main_oeuvre_ht, divers_ht"
  ).eq("chantier_id", chantierId).order("ordre", { ascending: true });
  if (lotsError) {
    console.error(`[api/chantier/${chantierId} GET] lots error:`, lotsError.message);
  }
  let meta = {};
  if (chantier.metadonnees) {
    try {
      const parsed = JSON.parse(chantier.metadonnees);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        meta = parsed;
      } else {
        console.warn(`[api/chantier/${chantierId} GET] metadonnees not an object, using fallback`);
      }
    } catch (e) {
      console.error(
        `[api/chantier/${chantierId} GET] metadonnees parse error:`,
        e instanceof Error ? e.message : String(e)
      );
    }
  }
  const artisans = Array.isArray(meta.artisans) ? meta.artisans : [];
  const roadmap = Array.isArray(meta.roadmap) ? meta.roadmap : [];
  const formalites = Array.isArray(meta.formalites) ? meta.formalites : [];
  const aides = Array.isArray(meta.aides) ? meta.aides : [];
  const hasRichData = artisans.length > 0 || roadmap.length > 0 || formalites.length > 0;
  const lots = lotsRaw && lotsRaw.length > 0 ? lotsRaw.map((l) => ({
    id: l.id,
    nom: l.nom,
    statut: l.statut,
    ordre: l.ordre,
    emoji: l.emoji ?? void 0,
    role: l.role ?? void 0,
    // Prix de référence calculés (null si lot sans match market_prices)
    job_type: l.job_type ?? null,
    quantite: l.quantite ?? null,
    unite: l.unite ?? null,
    budget_min_ht: l.budget_min_ht ?? null,
    budget_avg_ht: l.budget_avg_ht ?? null,
    budget_max_ht: l.budget_max_ht ?? null,
    materiaux_ht: l.materiaux_ht ?? null,
    main_oeuvre_ht: l.main_oeuvre_ht ?? null,
    divers_ht: l.divers_ht ?? null
  })) : artisans.map((a, i) => ({
    id: `fallback-${i}`,
    nom: a.metier,
    statut: a.statut,
    ordre: i,
    emoji: a.emoji,
    role: a.role
  }));
  if (!hasRichData) {
    const result2 = buildFallbackResult(chantier, taches);
    return new Response(
      JSON.stringify({ result: { ...result2, lots }, phase: chantier.phase, isPlanComplet: false }),
      { status: 200, headers: CORS }
    );
  }
  const budget = safeNumber(chantier.budget);
  const lignesBudget = Array.isArray(meta.lignesBudget) && meta.lignesBudget.length > 0 ? meta.lignesBudget : [{ label: "Budget total", montant: budget, couleur: "#3b82f6" }];
  const prochaineAction = meta.prochaineAction && typeof meta.prochaineAction === "object" && typeof meta.prochaineAction.titre === "string" ? meta.prochaineAction : { titre: "Consultez votre plan", detail: "Votre plan de chantier est disponible ci-dessous." };
  const result = {
    // Colonnes DB — source de vérité
    nom: String(chantier.nom ?? ""),
    emoji: String(chantier.emoji ?? "🏗️"),
    typeProjet: chantier.type_projet ?? "autre",
    budgetTotal: budget,
    mensualite: chantier.mensualite ? safeNumber(chantier.mensualite) : void 0,
    dureeCredit: chantier.duree_credit ? safeNumber(chantier.duree_credit) : void 0,
    // Metadonnees avec fallbacks
    description: typeof meta.description === "string" ? meta.description : "",
    dureeEstimeeMois: typeof meta.dureeEstimeeMois === "number" ? meta.dureeEstimeeMois : 0,
    financement: meta.financement ?? (chantier.mensualite ? "credit" : "apport"),
    lignesBudget,
    roadmap,
    artisans,
    formalites,
    aides,
    prochaineAction,
    generatedAt: String(chantier.created_at ?? ""),
    promptOriginal: "",
    // Signaux de fiabilité — lot 8A (null pour les anciens chantiers)
    estimationSignaux: meta.estimationSignaux ?? null,
    // Calculés
    nbArtisans: artisans.length,
    nbFormalites: formalites.length,
    // todo_chantier — source de vérité pour done
    taches,
    // lots_chantier — source de vérité pour les lots (ou fallback meta.artisans)
    lots
  };
  const isPlanComplet = roadmap.length > 0 && (artisans.length > 0 || formalites.length > 0 || Array.isArray(meta.lignesBudget) && meta.lignesBudget.length > 0 || meta.prochaineAction != null && typeof meta.prochaineAction === "object" && typeof meta.prochaineAction.titre === "string" && meta.prochaineAction.titre.length > 0);
  return new Response(
    JSON.stringify({ result, phase: chantier.phase, isPlanComplet }),
    { status: 200, headers: CORS }
  );
};
const PATCH = async ({ request, params }) => {
  const chantierId = params.id;
  if (!chantierId) {
    return new Response(JSON.stringify({ error: "ID chantier manquant" }), { status: 400, headers: CORS });
  }
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: CORS });
  }
  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Token invalide" }), { status: 401, headers: CORS });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requête invalide" }), { status: 400, headers: CORS });
  }
  if ("todoId" in body) {
    if (typeof body.todoId !== "string" || !body.todoId || typeof body.done !== "boolean") {
      return new Response(
        JSON.stringify({ error: "todoId (string) et done (boolean) sont requis" }),
        { status: 400, headers: CORS }
      );
    }
    const { data: ownerCheck } = await supabase.from("chantiers").select("id").eq("id", chantierId).eq("user_id", user.id).single();
    if (!ownerCheck) {
      return new Response(JSON.stringify({ error: "Chantier introuvable" }), { status: 404, headers: CORS });
    }
    const { error: updateError } = await supabase.from("todo_chantier").update({ done: body.done }).eq("id", body.todoId).eq("chantier_id", chantierId);
    if (updateError) {
      console.error(`[api/chantier/${chantierId} PATCH todo] error:`, updateError.message);
      return new Response(
        JSON.stringify({ error: "Erreur lors de la mise à jour du todo" }),
        { status: 500, headers: CORS }
      );
    }
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }
  if ("lotId" in body) {
    const { lotId, statut } = body;
    const VALID_STATUTS = ["a_trouver", "a_contacter", "ok"];
    if (typeof lotId !== "string" || !lotId || !VALID_STATUTS.includes(statut)) {
      return new Response(
        JSON.stringify({ error: "lotId (string) et statut valide sont requis" }),
        { status: 400, headers: CORS }
      );
    }
    const { data: ownerCheck } = await supabase.from("chantiers").select("id").eq("id", chantierId).eq("user_id", user.id).single();
    if (!ownerCheck) {
      return new Response(JSON.stringify({ error: "Chantier introuvable" }), { status: 404, headers: CORS });
    }
    const { error: updateError } = await supabase.from("lots_chantier").update({ statut, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", lotId).eq("chantier_id", chantierId);
    if (updateError) {
      console.error(`[api/chantier/${chantierId} PATCH lot] error:`, updateError.message);
      return new Response(
        JSON.stringify({ error: "Erreur lors de la mise à jour du lot" }),
        { status: 500, headers: CORS }
      );
    }
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }
  const updatePayload = body;
  const updates = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  if (updatePayload.nom !== void 0) updates.nom = updatePayload.nom.trim();
  if (updatePayload.emoji !== void 0) updates.emoji = updatePayload.emoji;
  if (updatePayload.phase !== void 0) {
    if (!VALID_PHASES.includes(updatePayload.phase)) {
      return new Response(JSON.stringify({ error: "Phase invalide" }), { status: 400, headers: CORS });
    }
    updates.phase = updatePayload.phase;
  }
  if (updatePayload.enveloppePrevue !== void 0) {
    if (typeof updatePayload.enveloppePrevue !== "number" || updatePayload.enveloppePrevue < 0) {
      return new Response(
        JSON.stringify({ error: "Enveloppe budgétaire invalide" }),
        { status: 400, headers: CORS }
      );
    }
    updates.budget = updatePayload.enveloppePrevue;
  }
  const { data, error } = await supabase.from("chantiers").update(updates).eq("id", chantierId).eq("user_id", user.id).select("id, nom, emoji, budget, phase, updated_at").single();
  if (error) {
    console.error("[api/chantier PATCH] update error:", error.message);
    return new Response(
      JSON.stringify({ error: "Erreur lors de la mise à jour" }),
      { status: 500, headers: CORS }
    );
  }
  if (!data) {
    return new Response(JSON.stringify({ error: "Chantier introuvable" }), { status: 404, headers: CORS });
  }
  return new Response(JSON.stringify({ chantier: data }), { status: 200, headers: CORS });
};
const DELETE = async ({ params, request }) => {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer "))
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: CORS });
  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user)
    return new Response(JSON.stringify({ error: "Token invalide" }), { status: 401, headers: CORS });
  const chantierId = params.id;
  if (!chantierId)
    return new Response(JSON.stringify({ error: "ID manquant" }), { status: 400, headers: CORS });
  const { data: ownerCheck } = await supabase.from("chantiers").select("id").eq("id", chantierId).eq("user_id", user.id).single();
  if (!ownerCheck)
    return new Response(JSON.stringify({ error: "Chantier introuvable" }), { status: 404, headers: CORS });
  const { data: docs } = await supabase.from("documents_chantier").select("bucket_path").eq("chantier_id", chantierId);
  const paths = (docs ?? []).map((d) => d.bucket_path).filter(Boolean);
  if (paths.length > 0) {
    const { error: storageErr } = await supabase.storage.from("chantier-documents").remove(paths);
    if (storageErr) {
      console.error(`[DELETE /api/chantier/${chantierId}] storage:`, storageErr.message);
    }
  }
  const { error: deleteErr } = await supabase.from("chantiers").delete().eq("id", chantierId).eq("user_id", user.id);
  if (deleteErr) {
    console.error(`[DELETE /api/chantier/${chantierId}] db:`, deleteErr.message);
    return new Response(
      JSON.stringify({ error: "Erreur lors de la suppression" }),
      { status: 500, headers: CORS }
    );
  }
  return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
};
const OPTIONS = () => new Response(null, {
  status: 204,
  headers: { ...CORS, "Access-Control-Allow-Methods": "GET,PATCH,DELETE,OPTIONS" }
});

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  DELETE,
  GET,
  OPTIONS,
  PATCH,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
