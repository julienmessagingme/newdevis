// Tools contacts : modification du carnet d'intervenants.
// Pas d'add_contact volontaire — les contacts viennent du flux VerifierMonDevis
// ou de l'ajout manuel UI. L'agent ne crée pas de contacts spontanément.
import { Handler, Tool, API_BASE, supabaseAdmin } from "./shared.ts";

export const BATCH_SCHEMAS: Tool[] = [];

export const ACTION_SCHEMAS: Tool[] = [
  {
    type: "function",
    function: {
      name: "update_contact",
      description:
        "Met à jour un contact existant du carnet (téléphone, email, rôle, notes, lot rattaché, SIRET).\n\n" +
        "Cas d'usage typique :\n" +
        "  • L'utilisateur dit \"Jean a changé de numéro, c'est 0612345678\" → update telephone\n" +
        "  • Un mail entrant révèle l'email d'un contact existant → update email\n" +
        "  • L'utilisateur précise le rôle d'un contact → update role\n\n" +
        "Si tu n'es pas sûr de quel contact mettre à jour (ex: 2 \"Jean\" dans le carnet), demande à l'utilisateur en TEXTE avant d'appeler. Tu peux récupérer la liste via get_contacts_chantier.",
      parameters: {
        type: "object",
        properties: {
          contact_id:       { type: "string", description: "UUID du contact à modifier (récupéré via get_contacts_chantier)" },
          nom:              { type: "string", description: "Nouveau nom (optionnel)" },
          telephone:        { type: "string", description: "Nouveau téléphone (format international ou national, le serveur normalise)" },
          email:            { type: "string", description: "Nouvel email" },
          siret:            { type: "string", description: "Nouveau SIRET (14 chiffres)" },
          role:             { type: "string", description: "Métier : 'Plombier', 'Électricien', 'Architecte', etc." },
          contact_category: { type: "string", enum: ["artisan", "architecte", "maitre_oeuvre", "bureau_etudes", "client", "autre"] },
          lot_id:           { type: "string", description: "UUID du lot à rattacher (ou chaîne vide pour détacher)" },
          notes:            { type: "string", description: "Notes libres (remplace les notes existantes)" },
        },
        required: ["contact_id"],
      },
    },
  },
];

export const handlers: Record<string, Handler> = {
  update_contact: async ({ chantierId, headers, args }) => {
    const contactId = String(args.contact_id ?? "").trim();
    if (!contactId) {
      return JSON.stringify({ ok: false, error: "contact_id requis" });
    }

    // Vérifier que le contact appartient bien à ce chantier (défense en profondeur).
    const sb = supabaseAdmin();
    const { data: contact, error: fetchErr } = await sb
      .from("contacts_chantier")
      .select("id, nom, chantier_id")
      .eq("id", contactId)
      .single();
    if (fetchErr || !contact) {
      return JSON.stringify({ ok: false, error: "Contact introuvable" });
    }
    if (contact.chantier_id !== chantierId) {
      return JSON.stringify({ ok: false, error: "Contact d'un autre chantier" });
    }

    // Construit le body PATCH avec uniquement les champs fournis (préserve l'existant).
    const body: Record<string, unknown> = { contactId };
    if (typeof args.nom === "string") body.nom = args.nom;
    // Téléphone : normalise au format attendu par le matching whapi (33XXXXXXXXX sans + ni espace).
    // Sinon les WhatsApp inbound depuis ce numéro ne seraient plus reconnus comme ce contact.
    if (typeof args.telephone === "string") {
      let tel = args.telephone.replace(/\s+/g, "");
      if (tel.startsWith("00")) tel = "+" + tel.slice(2);
      // 0612345678 (FR) → +33612345678 (heuristique : commence par 0, 10 chiffres FR par défaut)
      if (/^0\d{9}$/.test(tel)) tel = "+33" + tel.slice(1);
      body.telephone = tel;
    }
    if (typeof args.email === "string") body.email = args.email;
    if (typeof args.siret === "string") body.siret = args.siret;
    if (typeof args.role === "string") body.role = args.role;
    if (typeof args.contact_category === "string") body.contact_category = args.contact_category;
    if (typeof args.lot_id === "string") body.lot_id = args.lot_id;
    if (typeof args.notes === "string") body.notes = args.notes;

    if (Object.keys(body).length <= 1) {
      return JSON.stringify({ ok: false, error: "Aucun champ à modifier (passe au moins 1 champ)" });
    }

    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/contacts`, {
      method: "PATCH", headers, body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errTxt = await res.text();
      return JSON.stringify({ ok: false, error: `update_contact ${res.status}: ${errTxt.slice(0, 200)}` });
    }
    const data = await res.json();
    return JSON.stringify({ ok: true, contact: data?.contact, previous_nom: contact.nom });
  },
};
