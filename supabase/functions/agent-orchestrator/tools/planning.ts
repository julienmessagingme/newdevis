// Tools planning : modification durée/délai/dépendances/dates de lots.
// update_planning = batch-safe. Les autres = action (interactive only).
import { Handler, Tool, API_BASE, AGENT_SECRET_KEY } from "./shared.ts";

export const BATCH_SCHEMAS: Tool[] = [
  {
    type: "function",
    function: {
      name: "update_planning",
      description: "Modifie le planning d'un lot : durée, délai, OU dépendances. Déclenche le recalcul cascade via CPM.\n\n- duree_jours : nouvelle durée (ex: '+5j car surprise démolition').\n- delai_avant_jours : décale le lot de N jours ouvrés sans toucher aux prédécesseurs (ex: 'bouge plomberie d'1 semaine' → 5).\n- depends_on_ids : liste des prédécesseurs du lot (REMPLACE la liste complète). Utiliser pour structurer le graph : ex. 'Plaquiste démarre quand Plombier ET Électricien ont fini' → depends_on_ids=[plombier_id, elec_id]. Vide [] = lot démarre à startDate.\n\nTu peux combiner plusieurs champs dans le même appel.",
      parameters: {
        type: "object",
        properties: {
          lot_id:             { type: "string", description: "ID UUID du lot à modifier" },
          duree_jours:        { type: "number", description: "Nouvelle durée en jours ouvrés (optionnel)" },
          delai_avant_jours:  { type: "number", description: "Délai en jours ouvrés avant ce lot (optionnel, 0 = aucun)" },
          depends_on_ids:     { type: "array", items: { type: "string" }, description: "Liste des prédécesseurs du lot (UUIDs). Remplace la liste courante. Optionnel." },
          raison:             { type: "string", description: "Raison de la modification (pour le journal)" },
        },
        required: ["lot_id", "raison"],
      },
    },
  },
];

export const ACTION_SCHEMAS: Tool[] = [
  {
    type: "function",
    function: {
      name: "arrange_lot",
      description: "Réorganise un lot dans le planning : soit le chaîner APRÈS un autre lot (démarre quand l'autre finit, même ligne visuelle), soit le mettre en PARALLÈLE d'un autre lot (démarre en même temps, ligne distincte). Recalcule les dates en cascade.",
      parameters: {
        type: "object",
        properties: {
          lot_id:           { type: "string", description: "ID UUID du lot à déplacer" },
          mode:             { type: "string", enum: ["chain_after", "parallel_with"], description: "chain_after = enchaîner séquentiellement après le lot de référence / parallel_with = faire tourner en même temps que le lot de référence" },
          reference_lot_id: { type: "string", description: "ID UUID du lot de référence (celui avec qui on chaîne ou parallélise)" },
          raison:           { type: "string", description: "Raison de la réorganisation (pour le journal)" },
        },
        required: ["lot_id", "mode", "reference_lot_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lot_dates",
      description: "Décale un lot à une nouvelle date de début et recalcule la cascade. REQUIERT confirmation explicite.",
      parameters: {
        type: "object",
        properties: {
          lot_id:          { type: "string", description: "ID UUID du lot" },
          new_start_date:  { type: "string", description: "Nouvelle date de début (YYYY-MM-DD)" },
          new_end_date:    { type: "string", description: "Nouvelle date de fin (optionnel — calculée depuis duree_jours si absent)" },
          raison:          { type: "string", description: "Raison du décalage" },
        },
        required: ["lot_id", "new_start_date", "raison"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shift_lot",
      description:
        "Décale un lot dans le temps de N jours ouvrés. Deux modes :\n" +
        "- cascade=true : applique le décalage, les successeurs DAG suivent automatiquement (ex: si plombier décalé, l'élec qui dépend de plombier se décale aussi).\n" +
        "- cascade=false : DÉTACHE le lot de sa chaîne. Les successeurs perdent ce lot comme prédécesseur ET héritent de ses anciens prédécesseurs (ils restent à leur position visuelle). Le lot est mis sur une nouvelle side lane indépendante avec le délai appliqué.\n" +
        "AVANT D'APPELER ce tool : vérifie si le lot a des successeurs DANS LE CONTEXTE. Si oui, demande à l'utilisateur 'cascade ou détache ?' sans appeler le tool. N'appelle le tool QU'APRÈS la réponse explicite de l'utilisateur.",
      parameters: {
        type: "object",
        properties: {
          lot_id:  { type: "string", description: "ID UUID du lot à décaler" },
          jours:   { type: "number", description: "Nombre de jours ouvrés de décalage (positif)" },
          cascade: { type: "boolean", description: "true = successeurs suivent ; false = lot détaché de la chaîne" },
          raison:  { type: "string", description: "Raison du décalage (journal)" },
        },
        required: ["lot_id", "jours", "cascade", "raison"],
      },
    },
  },
];

export const handlers: Record<string, Handler> = {
  update_planning: async ({ chantierId, headers, args }) => {
    const body: Record<string, unknown> = {};
    const lotUpdate: Record<string, unknown> = { id: args.lot_id };
    if (typeof args.duree_jours === "number") lotUpdate.duree_jours = args.duree_jours;
    if (typeof args.delai_avant_jours === "number") lotUpdate.delai_avant_jours = args.delai_avant_jours;
    if (Object.keys(lotUpdate).length > 1) body.lots = [lotUpdate];
    if (Array.isArray(args.depends_on_ids)) {
      body.dependencies = { [args.lot_id as string]: args.depends_on_ids };
    }
    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/planning`, {
      method: "PATCH", headers, body: JSON.stringify(body),
    });
    return JSON.stringify({ ok: res.ok, data: await res.json() });
  },

  arrange_lot: async ({ chantierId, headers, args }) => {
    // Modèle CPM DAG : on écrit dans lot_dependencies via l'API planning.
    // chain_after    : lot.deps = [refId] + même lane visuelle que ref
    // parallel_with  : lot.deps = deps(refId) + lane différente (first-fit)
    const mode = String(args.mode ?? "");
    if (mode !== "chain_after" && mode !== "parallel_with") {
      return JSON.stringify({ ok: false, error: "mode doit être 'chain_after' ou 'parallel_with'" });
    }
    const lotId = String(args.lot_id ?? "");
    const refId = String(args.reference_lot_id ?? "");
    if (!lotId || !refId || lotId === refId) {
      return JSON.stringify({ ok: false, error: "lot_id et reference_lot_id requis et distincts" });
    }

    const planRes = await fetch(`${API_BASE}/api/chantier/${chantierId}/planning`, { headers });
    const planData = planRes.ok ? await planRes.json() : {};
    const refLotData = (planData?.lots ?? []).find((l: any) => l.id === refId);

    let depsForLot: string[];
    let laneForLot: number | null;
    if (mode === "chain_after") {
      depsForLot = [refId];
      laneForLot = refLotData?.lane_index ?? null;
    } else {
      const refDeps = (planData?.dependencies ?? {})[refId] ?? [];
      depsForLot = Array.isArray(refDeps) ? refDeps : [];
      laneForLot = null;
    }

    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/planning`, {
      method: "PATCH", headers,
      body: JSON.stringify({
        lots: [{ id: lotId, delai_avant_jours: 0, lane_index: laneForLot }],
        dependencies: { [lotId]: depsForLot },
      }),
    });
    if (!res.ok) {
      const errTxt = await res.text();
      return JSON.stringify({ ok: false, error: `PATCH planning failed: ${errTxt.slice(0, 200)}` });
    }
    const data = await res.json();
    const lotFinal = (data?.lots ?? []).find((l: any) => l.id === lotId);
    const refFinal = (data?.lots ?? []).find((l: any) => l.id === refId);
    return JSON.stringify({
      ok: true, mode,
      lot_nom: lotFinal?.nom ?? "?", ref_nom: refFinal?.nom ?? "?",
      lot_date_debut: lotFinal?.date_debut, lot_date_fin: lotFinal?.date_fin,
      raison: args.raison,
    });
  },

  update_lot_dates: async ({ chantierId, headers, args }) => {
    const lotUpdate: Record<string, unknown> = { id: args.lot_id, date_debut: args.new_start_date };
    if (args.new_end_date) lotUpdate.date_fin = args.new_end_date;
    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/planning`, {
      method: "PATCH", headers, body: JSON.stringify({ lots: [lotUpdate] }),
    });
    const body = await res.json();
    if (!res.ok) {
      // Diagnostic minimal sans fuite de secret. Ne JAMAIS retourner de prefix/suffix de la clé
      // (réduit l'entropie pour un brute-force si le tool_result fuite dans des logs).
      return JSON.stringify({
        ok: false, data: body,
        _debug_key_present: AGENT_SECRET_KEY.length > 0,
        _debug_api_base: API_BASE,
      });
    }
    return JSON.stringify({ ok: true, data: body });
  },

  shift_lot: async ({ chantierId, headers, args }) => {
    const lotId = String(args.lot_id ?? "");
    const jours = Number(args.jours ?? 0);
    const cascade = Boolean(args.cascade);
    if (!lotId || !Number.isFinite(jours) || jours <= 0) {
      return JSON.stringify({ ok: false, error: "lot_id et jours (>0) requis" });
    }
    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/planning/shift-lot`, {
      method: "POST", headers,
      body: JSON.stringify({ lot_id: lotId, jours, cascade, raison: args.raison }),
    });
    return JSON.stringify({ ok: res.ok, data: await res.json() });
  },
};
