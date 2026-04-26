// Tools documents : opérations sur les documents (réaffectation lot, etc.).
// Le rename, suppression, autres opérations restent côté UI ou tools dédiés futurs.
import { Handler, Tool, API_BASE, supabaseAdmin } from "./shared.ts";

export const BATCH_SCHEMAS: Tool[] = [];

export const ACTION_SCHEMAS: Tool[] = [
  {
    type: "function",
    function: {
      name: "move_document_to_lot",
      description:
        "Réaffecte un document (devis / facture / photo / plan) à un autre lot du chantier.\n\n" +
        "Cas d'usage typique :\n" +
        "  • Suite à une question request_clarification (\"Je pense que cette photo est pour Carreleur, pas Maçon. Confirme ?\"), l'utilisateur valide → tu appelles move_document_to_lot pour le déplacer.\n" +
        "  • L'utilisateur dit en chat \"la facture XYZ est en fait pour le plombier, pas pour le maçon\" → tu appelles directement.\n\n" +
        "Pour détacher un doc de tout lot (le rendre 'sans lot'), passe lot_id = chaîne vide \"\".",
      parameters: {
        type: "object",
        properties: {
          doc_id: { type: "string", description: "UUID du document à réaffecter" },
          lot_id: { type: "string", description: "UUID du lot cible (ou chaîne vide \"\" pour détacher)" },
          raison: { type: "string", description: "Raison du déplacement (pour le journal)" },
        },
        required: ["doc_id", "lot_id"],
      },
    },
  },
];

export const handlers: Record<string, Handler> = {
  move_document_to_lot: async ({ chantierId, headers, args }) => {
    const docId = String(args.doc_id ?? "").trim();
    const lotIdRaw = typeof args.lot_id === "string" ? args.lot_id.trim() : "";
    if (!docId) {
      return JSON.stringify({ ok: false, error: "doc_id requis" });
    }

    const sb = supabaseAdmin();

    // Vérifie que le document appartient à ce chantier (défense en profondeur).
    const { data: doc, error: fetchErr } = await sb
      .from("documents_chantier")
      .select("id, nom, lot_id, chantier_id")
      .eq("id", docId)
      .single();
    if (fetchErr || !doc) {
      return JSON.stringify({ ok: false, error: "Document introuvable" });
    }
    if (doc.chantier_id !== chantierId) {
      return JSON.stringify({ ok: false, error: "Document d'un autre chantier" });
    }

    // Si lot_id vide → détacher (lotId: null côté API). Sinon valider que le lot existe.
    let targetLotName: string | null = null;
    if (lotIdRaw) {
      const { data: lot } = await sb
        .from("lots_chantier")
        .select("id, nom")
        .eq("id", lotIdRaw)
        .eq("chantier_id", chantierId)
        .maybeSingle();
      if (!lot) {
        return JSON.stringify({ ok: false, error: "Lot cible introuvable sur ce chantier" });
      }
      targetLotName = lot.nom;
    }

    // Pas-op : si déjà sur le bon lot, on évite l'appel API.
    if ((doc.lot_id ?? "") === lotIdRaw) {
      return JSON.stringify({ ok: true, no_change: true, doc_id: docId, lot_id: lotIdRaw, message: "Document déjà sur ce lot" });
    }

    // PATCH via l'API (qui valide aussi l'ownership et déclenche les triggers downstream).
    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/documents/${docId}`, {
      method: "PATCH", headers, body: JSON.stringify({ lotId: lotIdRaw || null }),
    });
    if (!res.ok) {
      const errTxt = await res.text();
      return JSON.stringify({ ok: false, error: `move_document_to_lot ${res.status}: ${errTxt.slice(0, 200)}` });
    }
    const data = await res.json();
    return JSON.stringify({
      ok: true,
      doc_id: docId,
      doc_nom: doc.nom,
      previous_lot_id: doc.lot_id,
      new_lot_id: lotIdRaw || null,
      new_lot_nom: targetLotName,
      raison: args.raison ?? null,
      data,
    });
  },
};
