// Tools statuts lot + statut devis : update_lot_status / update_devis_statut (batch),
// mark_lot_completed (action). Tous des changements de statut, regroupés par cohérence.
import { Handler, Tool, API_BASE, supabaseAdmin } from "./shared.ts";

export const BATCH_SCHEMAS: Tool[] = [
  {
    type: "function",
    function: {
      name: "update_lot_status",
      description: "Change le statut d'un lot (a_faire → en_cours → termine).",
      parameters: {
        type: "object",
        properties: {
          lot_id: { type: "string", description: "ID UUID du lot" },
          statut: { type: "string", enum: ["a_faire", "en_cours", "termine"], description: "Nouveau statut" },
          raison: { type: "string", description: "Raison du changement" },
        },
        required: ["lot_id", "statut", "raison"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_devis_statut",
      description:
        "Change le statut d'un devis. Statuts possibles :\n" +
        "  • en_cours       : devis reçu, à analyser/comparer\n" +
        "  • a_relancer     : artisan n'a pas répondu, à relancer\n" +
        "  • valide         : devis accepté, on attend la facture\n" +
        "  • attente_facture: devis signé, prestation en cours, facture pas encore reçue\n\n" +
        "Cas d'usage : \"Je valide le devis du plombier\" → statut='valide'. \"L'électricien n'a pas répondu\" → statut='a_relancer'.\n\n" +
        "Si plusieurs devis correspondent au lot/artisan mentionné, demande à l'utilisateur lequel avant d'appeler.",
      parameters: {
        type: "object",
        properties: {
          devis_id: { type: "string", description: "UUID du document devis (récupérable via get_chantier_data?query_type=list_documents)" },
          statut:   { type: "string", enum: ["en_cours", "a_relancer", "valide", "attente_facture"] },
          raison:   { type: "string", description: "Raison du changement (pour le journal)" },
        },
        required: ["devis_id", "statut"],
      },
    },
  },
];

export const ACTION_SCHEMAS: Tool[] = [
  {
    type: "function",
    function: {
      name: "mark_lot_completed",
      description: "Marque un lot comme terminé et y associe un document preuve (optionnel). REQUIERT une confirmation explicite de l'utilisateur.",
      parameters: {
        type: "object",
        properties: {
          lot_id:          { type: "string", description: "ID UUID du lot" },
          evidence_doc_id: { type: "string", description: "ID UUID du document preuve (optionnel)" },
          raison:          { type: "string", description: "Confirmation ou raison du passage en terminé" },
        },
        required: ["lot_id", "raison"],
      },
    },
  },
];

export const handlers: Record<string, Handler> = {
  update_lot_status: async ({ chantierId, headers, args }) => {
    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/lots`, {
      method: "PATCH", headers,
      body: JSON.stringify({ lot_id: args.lot_id, statut: args.statut, raison: args.raison }),
    });
    return JSON.stringify({ ok: res.ok, data: await res.json() });
  },

  mark_lot_completed: async ({ chantierId, headers, args }) => {
    const body: Record<string, unknown> = {
      lot_id: args.lot_id, statut: "termine", raison: args.raison,
    };
    if (args.evidence_doc_id) body.evidence_doc_id = args.evidence_doc_id;
    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/lots`, {
      method: "PATCH", headers, body: JSON.stringify(body),
    });
    return JSON.stringify({ ok: res.ok, data: await res.json() });
  },

  update_devis_statut: async ({ chantierId, headers, args }) => {
    const devisId = String(args.devis_id ?? "").trim();
    const statut = String(args.statut ?? "").trim();
    if (!devisId || !statut) {
      return JSON.stringify({ ok: false, error: "devis_id et statut requis" });
    }

    // Vérifier que c'est bien un devis (pas une facture) et qu'il appartient à ce chantier.
    const sb = supabaseAdmin();
    const { data: doc, error: fetchErr } = await sb
      .from("documents_chantier")
      .select("id, nom, document_type, devis_statut, chantier_id")
      .eq("id", devisId)
      .single();
    if (fetchErr || !doc) {
      return JSON.stringify({ ok: false, error: "Devis introuvable" });
    }
    if (doc.chantier_id !== chantierId) {
      return JSON.stringify({ ok: false, error: "Devis d'un autre chantier" });
    }
    if (doc.document_type !== "devis") {
      return JSON.stringify({ ok: false, error: `Document n'est pas un devis (type=${doc.document_type})` });
    }
    if (doc.devis_statut === statut) {
      return JSON.stringify({ ok: true, no_change: true, devis_id: devisId, statut, message: "Statut déjà à jour" });
    }

    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/documents/${devisId}`, {
      method: "PATCH", headers, body: JSON.stringify({ devisStatut: statut }),
    });
    if (!res.ok) {
      const errTxt = await res.text();
      return JSON.stringify({ ok: false, error: `update_devis_statut ${res.status}: ${errTxt.slice(0, 200)}` });
    }
    const data = await res.json();
    return JSON.stringify({
      ok: true, devis_id: devisId, devis_nom: doc.nom,
      previous_statut: doc.devis_statut, new_statut: statut,
      raison: args.raison ?? null, data,
    });
  },
};
