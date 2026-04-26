// Tools finance : register_expense (action — déclaration ticket/frais).
// À enrichir bientôt avec register_payment et add_payment_event (cf. WIP § 12).
import { Handler, Tool, API_BASE, supabaseAdmin } from "./shared.ts";

export const BATCH_SCHEMAS: Tool[] = [];

export const ACTION_SCHEMAS: Tool[] = [
  {
    type: "function",
    function: {
      name: "register_expense",
      description: "Enregistre une dépense (ticket de caisse / achat matériaux / frais déclaré) sans upload de fichier. L'entrée est créée comme si un ticket avait été scanné.\n\n⚠️ RÈGLE STRICTE : si l'utilisateur dit \"j'ai dépensé X€\" sans préciser le lot, tu DOIS lui demander en TEXTE (sans appeler ce tool) : \"Pour quel lot cette dépense ?\". Si le user répond \"aucun / divers / pas de lot particulier\", passe `lot_name: \"Divers\"` et le tool créera ou réutilisera automatiquement le lot Divers.\n\nNe pas appeler sans `lot_id` OU `lot_name`.",
      parameters: {
        type: "object",
        properties: {
          amount:       { type: "number", description: "Montant TTC en euros (ex: 200.50)" },
          label:        { type: "string", description: "Court libellé de la dépense (ex: 'Matériaux électricité Leroy Merlin')" },
          lot_id:       { type: "string", description: "ID UUID du lot rattaché (prioritaire sur lot_name)" },
          lot_name:     { type: "string", description: "Nom du lot si lot_id inconnu — ex: 'Électricien' ou 'Divers'. Le tool cherche par nom puis crée si absent." },
          vendor:       { type: "string", description: "Vendeur/magasin (ex: 'Leroy Merlin'). Optionnel." },
          depense_type: { type: "string", enum: ["frais", "ticket_caisse", "achat_materiaux", "facture"], description: "Type de dépense. Défaut 'frais' = déclaration orale sans justificatif. 'ticket_caisse' / 'achat_materiaux' = dépense avec pièce attendue. 'facture' = facture fournisseur." },
        },
        required: ["amount", "label"],
      },
    },
  },
];

export const handlers: Record<string, Handler> = {
  register_expense: async ({ chantierId, headers, args }) => {
    const amount = typeof args.amount === "number" ? args.amount : Number(args.amount);
    const label = String(args.label ?? "").trim();
    if (!amount || amount <= 0 || !label) {
      return JSON.stringify({ ok: false, error: "amount (>0) et label requis" });
    }
    const vendor = typeof args.vendor === "string" ? args.vendor.trim() : "";
    const depenseType = ["frais", "ticket_caisse", "achat_materiaux", "facture"].includes(String(args.depense_type ?? ""))
      ? String(args.depense_type)
      : "frais";

    let lotId: string | null = typeof args.lot_id === "string" && args.lot_id ? args.lot_id : null;
    const lotName = typeof args.lot_name === "string" ? args.lot_name.trim() : "";

    if (!lotId && lotName) {
      const sb = supabaseAdmin();
      const { data: existing } = await sb.from("lots_chantier")
        .select("id, nom").eq("chantier_id", chantierId).ilike("nom", lotName).limit(1);
      if (existing && existing.length > 0) {
        lotId = existing[0].id;
      } else {
        const createRes = await fetch(`${API_BASE}/api/chantier/${chantierId}/lots`, {
          method: "POST", headers, body: JSON.stringify({ nom: lotName }),
        });
        if (createRes.ok) {
          const createData = await createRes.json();
          lotId = createData?.lot?.id ?? createData?.data?.id ?? null;
        }
      }
    }

    if (!lotId) {
      return JSON.stringify({ ok: false, error: "lot_id ou lot_name requis (demande au user le lot, ou propose Divers)" });
    }

    const nom = vendor ? `${vendor} — ${label}` : label;

    const depRes = await fetch(`${API_BASE}/api/chantier/${chantierId}/documents/depense-rapide`, {
      method: "POST", headers,
      body: JSON.stringify({
        nom, documentType: "facture", depenseType, montant: amount,
        factureStatut: "payee", lotId,
      }),
    });
    if (!depRes.ok) {
      const errTxt = await depRes.text();
      return JSON.stringify({ ok: false, error: `depense-rapide ${depRes.status}: ${errTxt.slice(0, 150)}` });
    }
    const depData = await depRes.json();
    return JSON.stringify({
      ok: true, montant: amount, lot_id: lotId, label: nom,
      document_id: depData?.document?.id ?? null,
    });
  },
};
