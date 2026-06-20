// Tool : génère le lien Espace Artisan pour un contact (magic-link token).
// L'ENVOI WhatsApp se fait via send_whatsapp_to_contact (DRY : on réutilise le canal/groupe
// + les garde-fous existants au lieu de dupliquer la logique d'envoi ici).
import { Handler, Tool, supabaseAdmin } from "./shared.ts";

// Domaine du portail artisan (GMC). Overridable par env, défaut = prod GMC.
const GMC_BASE_URL = Deno.env.get("GMC_BASE_URL") ?? "https://gerermonchantier.fr";

export const BATCH_SCHEMAS: Tool[] = [];

export const ACTION_SCHEMAS: Tool[] = [
  {
    type: "function",
    function: {
      name: "envoyer_espace_artisan",
      description:
        "Génère le lien d'accès unique à l'Espace Artisan d'un contact du chantier — un espace web mobile où l'artisan voit SES documents, le planning du chantier et les coordonnées des autres artisans, et peut déposer ses pièces/photos.\n\n" +
        "Retourne l'URL (magic-link persistant + révocable). Ce tool NE l'envoie PAS : pour le transmettre, enchaîne avec send_whatsapp_to_contact (mets l'URL dans le body). Le contact doit avoir WhatsApp (has_whatsapp).\n\n" +
        "À utiliser quand un artisan demande son accès, ou quand l'utilisateur demande de lui envoyer son espace.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "UUID du contact artisan (récupéré via get_contacts_chantier)." },
        },
        required: ["contact_id"],
      },
    },
  },
];

export const handlers: Record<string, Handler> = {
  envoyer_espace_artisan: async ({ chantierId, args }) => {
    const contactId = String(args.contact_id ?? "").trim();
    if (!contactId) return JSON.stringify({ ok: false, error: "contact_id requis" });

    const sb = supabaseAdmin();
    const { data: contact } = await sb
      .from("contacts_chantier")
      .select("id, nom, has_whatsapp, chantier_id")
      .eq("id", contactId)
      .single();
    if (!contact || contact.chantier_id !== chantierId) {
      return JSON.stringify({ ok: false, error: "Contact introuvable sur ce chantier" });
    }

    // Upsert : crée ou réactive le token (persistant + révocable).
    const { data: tok, error } = await sb
      .from("artisan_space_tokens")
      .upsert(
        { chantier_id: chantierId, contact_id: contactId, revoked_at: null },
        { onConflict: "chantier_id,contact_id" },
      )
      .select("token")
      .single();
    if (error || !tok) {
      return JSON.stringify({ ok: false, error: `Génération du lien échouée: ${error?.message ?? "inconnue"}` });
    }

    return JSON.stringify({
      ok: true,
      url: `${GMC_BASE_URL}/espace-artisan/${tok.token}`,
      contact_nom: contact.nom,
      has_whatsapp: contact.has_whatsapp !== false,
      next_step: "Pour transmettre ce lien à l'artisan, appelle send_whatsapp_to_contact avec ce contact_id et l'URL dans le body.",
    });
  },
};
