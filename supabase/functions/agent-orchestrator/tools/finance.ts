// Tools finance : register_expense (déclaration ticket/frais) + register_payment
// (paiement déclaré au chat, matching automatique sur les factures en attente).
import { Handler, Tool, API_BASE, supabaseAdmin } from "./shared.ts";

export const BATCH_SCHEMAS: Tool[] = [];

export const ACTION_SCHEMAS: Tool[] = [
  {
    type: "function",
    function: {
      name: "add_payment_event",
      description:
        "Ajoute une entrée future dans l'Échéancier — sortie planifiée (ex: 'le plombier veut 30% à la commande') OU entrée attendue (ex: 'le crédit débloque 30k le 15 mai').\n\n" +
        "Cas d'usage typique :\n" +
        "  • L'utilisateur dit \"le crédit débloque 30k le 15 mai\" → add_payment_event(label='Déblocage crédit', amount=30000, due_date='2026-05-15')\n" +
        "  • \"Le plombier demande 1500€ d'acompte à la commande la semaine prochaine\" → add_payment_event(label='Acompte plombier (commande)', amount=1500, due_date=...)\n" +
        "  • \"Aide MaPrimeRénov 4500€ attendue en juillet\" → add_payment_event(label='MaPrimeRénov', amount=4500, due_date='2026-07-15')\n\n" +
        "Limitation V1 : pas de distinction explicite entrée/sortie en DB. Le label doit être suffisamment clair (\"Déblocage X\", \"Acompte Y\", \"Aide Z\") pour que l'utilisateur comprenne dans l'Échéancier.\n\n" +
        "Pour un paiement DÉJÀ effectué sur une facture existante → utilise plutôt register_payment.",
      parameters: {
        type: "object",
        properties: {
          label:    { type: "string", description: "Court libellé visible dans l'échéancier (ex: 'Acompte plombier', 'Déblocage crédit Société Générale')." },
          amount:   { type: "number", description: "Montant TTC en euros (toujours positif). Le 'sens' (entrée vs sortie) doit être clair via le label." },
          due_date: { type: "string", description: "Date prévue YYYY-MM-DD (ex: '2026-05-15'). Calcule depuis le langage naturel ('semaine prochaine' = today+7j, etc.)." },
        },
        required: ["label", "amount", "due_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "register_payment",
      description:
        "Enregistre un paiement déclaré par l'utilisateur au chat (\"j'ai viré 1500€ au plombier\"). Le serveur cherche la facture qui matche puis applique le statut approprié.\n\n" +
        "Logique 100% côté serveur :\n" +
        "  • Match parfait (restant ≈ amount, tolérance ±5€) → marquée 'payee'. Note : un écart ≤ 5€ est absorbé sans trace (ex: payé 1495€ sur 1500€ → marqué payé intégralement).\n" +
        "  • Match partiel (restant > amount + 5€) → 'payee_partiellement' avec montant_paye cumulé.\n" +
        "  • Aucune facture en attente (reason='no_facture') → demande au user d'uploader la facture OU de basculer en frais via register_expense.\n" +
        "  • Match faible (reason='weak_match') ou ambigu (reason='ambiguous') → la liste des candidats est retournée, demande au user lequel.\n" +
        "  • Trop-perçu (montant > restant + max(10€, 1%)) → erreur, demande confirmation.\n\n" +
        "Tool MONO-DIRECTIONNEL : impossible d'annuler un paiement (modification manuelle UI requise).\n" +
        "⚠️ Ne JAMAIS appeler 2x en parallèle sur la même facture (race read-modify-write non protégée).\n\n" +
        "Le hint sert au matching : nom d'artisan (\"plombier\", \"Marc Dupont\"), nom de lot (\"lot Carreleur\"). Priorité : contact > lot > doc.nom.",
      parameters: {
        type: "object",
        properties: {
          artisan_or_lot_hint: { type: "string", description: "Indice pour identifier la facture : nom d'artisan, nom de lot, mot-clé. Ex: 'plombier', 'CBHabitat', 'lot Maçon'." },
          amount_paid:         { type: "number", description: "Montant payé en euros TTC (>0)." },
          date_paid:           { type: "string", description: "Date du paiement YYYY-MM-DD (optionnel, défaut today)." },
        },
        required: ["artisan_or_lot_hint", "amount_paid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "register_avenant",
      description:
        "Enregistre un AVENANT à un devis existant — un surcoût annoncé par l'artisan en cours de chantier (ex: 'finalement il faut +500€ pour la pompe de relevage'). " +
        "Crée un nouveau document_chantier de type 'devis' lié au devis original via parent_devis_id. " +
        "Le montant stocké est le SUPPLÉMENT seul (pas le total). Le devis original n'est pas muté.\n\n" +
        "Cas d'usage : l'artisan annonce un surcoût dans un groupe WhatsApp ou un email → tu DOIS d'abord appeler `notify_owner_for_decision` " +
        "avec expected_action={tool:'register_avenant', args:{...}} pour faire valider par le user. Quand le user répond OUI, le dispatcher exécutera ce tool automatiquement.\n\n" +
        "Si auto_validate=true, l'avenant est créé directement avec devis_statut='valide' (cas du flow notify_owner_for_decision où le user a déjà confirmé). " +
        "Sinon, l'avenant est créé en 'en_cours' et le user devra le valider manuellement (cas où tu l'appelles depuis un chat sans pré-validation).\n\n" +
        "L'analyse VMD du parent reste accrochée au parent — pas besoin de la dupliquer.",
      parameters: {
        type: "object",
        properties: {
          parent_devis_id:   { type: "string", description: "UUID du devis original que cet avenant amende. Récupérable via get_chantier_data?query_type=list_documents." },
          amount_supplement: { type: "number", description: "Montant TTC du supplément en euros (>0). Ex: 500 pour '+500€'. Toujours positif — c'est le delta, pas le total." },
          motif:             { type: "string", description: "Raison du surcoût (ex: 'pompe de relevage non prévue dans le devis initial'). Court mais explicite." },
          auto_validate:     { type: "boolean", description: "Si true, crée directement avec devis_statut='valide' et pose devis_validated_at=now(). Défaut false (en_cours)." },
        },
        required: ["parent_devis_id", "amount_supplement", "motif"],
      },
    },
  },
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

/** Tolérance de match exact en euros pour le matching montant. ±5€ couvre les écarts d'arrondi. */
const AMOUNT_MATCH_TOLERANCE = 5;

/** Calcule le montant restant à payer sur une facture. */
function montantRestant(facture: { montant: number | null; montant_paye: number | null; facture_statut: string | null }): number {
  const total = Number(facture.montant ?? 0);
  const paye = Number(facture.montant_paye ?? 0);
  return Math.max(0, total - paye);
}

/** Représentation compacte d'une facture pour les retours d'erreur ambigus. */
function compactFacture(f: any): Record<string, unknown> {
  return {
    id: f.id,
    nom: f.nom,
    montant: f.montant,
    montant_paye: f.montant_paye,
    restant: montantRestant(f),
    statut: f.facture_statut,
    date: f.created_at?.slice(0, 10),
    lot_nom: f.lots_chantier?.nom ?? null,
  };
}

export const handlers: Record<string, Handler> = {
  add_payment_event: async ({ chantierId, headers, args }) => {
    const label = String(args.label ?? "").trim();
    const amount = Number(args.amount ?? 0);
    const dueDate = String(args.due_date ?? "").trim();
    if (!label || !Number.isFinite(amount) || amount <= 0 || !dueDate) {
      return JSON.stringify({ ok: false, error: "label, amount (>0) et due_date YYYY-MM-DD requis" });
    }
    // Validation format date — strict YYYY-MM-DD pour éviter les déformations LLM (ex: '15/05/2026').
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return JSON.stringify({ ok: false, error: `due_date doit être au format YYYY-MM-DD (reçu '${dueDate}')` });
    }

    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/payment-events`, {
      method: "POST", headers,
      body: JSON.stringify({ manuel: true, label, amount, dueDate }),
    });
    if (!res.ok) {
      const errTxt = await res.text();
      return JSON.stringify({ ok: false, error: `add_payment_event ${res.status}: ${errTxt.slice(0, 200)}` });
    }
    const data = await res.json();
    return JSON.stringify({
      ok: true,
      event_id: data?.payment_events?.[0]?.id ?? null,
      label, amount, due_date: dueDate,
      message: data?.message ?? "Échéance ajoutée",
    });
  },

  register_payment: async ({ chantierId, headers, args }) => {
    const hint = String(args.artisan_or_lot_hint ?? "").trim();
    const amount = Number(args.amount_paid ?? 0);
    if (!hint || !Number.isFinite(amount) || amount <= 0) {
      return JSON.stringify({ ok: false, reason: "invalid_args", error: "artisan_or_lot_hint et amount_paid (>0) requis" });
    }

    const sb = supabaseAdmin();

    // 1. Récupère les factures éligibles du chantier (statut recue/partial, type facture,
    //    hors frais). Filtre depense_type côté SQL — `.or()` car NULL est une valeur valide
    //    (factures historiques sans depense_type). Le filtrage par hint est fait après en JS.
    //    FK documents_chantier.lot_id → lots_chantier.id (embedded select PostgREST).
    const { data: factures, error: fErr } = await sb
      .from("documents_chantier")
      .select("id, nom, montant, montant_paye, facture_statut, depense_type, lot_id, created_at, lots_chantier(id, nom)")
      .eq("chantier_id", chantierId)
      .eq("document_type", "facture")
      .in("facture_statut", ["recue", "payee_partiellement"])
      .or("depense_type.is.null,depense_type.neq.frais");

    if (fErr) {
      return JSON.stringify({ ok: false, reason: "db_error", error: fErr.message });
    }

    const eligible = factures ?? [];

    if (eligible.length === 0) {
      return JSON.stringify({
        ok: false, reason: "no_facture",
        message: `Aucune facture en attente sur ce chantier. Veux-tu que j'enregistre ce paiement comme un frais déclaré (register_expense), ou tu vas uploader la facture d'abord ?`,
      });
    }

    // 2. Récupère les contacts du chantier pour matcher par nom d'artisan.
    const { data: contacts } = await sb
      .from("contacts_chantier")
      .select("nom, lot_id")
      .eq("chantier_id", chantierId);
    const contactsByLotId = new Map<string, string[]>();
    for (const c of (contacts ?? [])) {
      if (!c.lot_id) continue;
      const arr = contactsByLotId.get(c.lot_id) ?? [];
      arr.push(c.nom);
      contactsByLotId.set(c.lot_id, arr);
    }

    // 3. Filtre par hint avec priorité de match (anti faux-positif) :
    //    1) Match fort : contact.nom OU lot.nom contient le hint → match probable
    //    2) Match faible : doc.nom contient le hint mais pas lot/contact → ambigu
    //    Si on a des matchs forts, on ignore les matchs faibles. Sinon on retourne
    //    les matchs faibles comme candidats avec un avertissement.
    const hintLower = hint.toLowerCase();
    const strongMatches: any[] = [];
    const weakMatches: any[] = [];
    for (const f of eligible) {
      const lotNom = String(f.lots_chantier?.nom ?? "").toLowerCase();
      const lotContacts = f.lot_id ? (contactsByLotId.get(f.lot_id) ?? []) : [];
      const lotMatch = lotNom.includes(hintLower);
      const contactMatch = lotContacts.some(n => n.toLowerCase().includes(hintLower));
      if (lotMatch || contactMatch) {
        strongMatches.push(f);
        continue;
      }
      const docNom = String(f.nom ?? "").toLowerCase();
      if (docNom.includes(hintLower)) weakMatches.push(f);
    }

    const candidates = strongMatches.length > 0 ? strongMatches : weakMatches;
    const matchType = strongMatches.length > 0 ? "strong" : (weakMatches.length > 0 ? "weak" : "none");

    if (candidates.length === 0) {
      return JSON.stringify({
        ok: false, reason: "no_match",
        message: `Aucune facture en attente ne correspond à "${hint}". Veux-tu vérifier le nom de l'artisan, ou enregistrer comme frais (register_expense) ?`,
        eligible_factures: eligible.map(compactFacture),
      });
    }

    if (candidates.length > 1) {
      return JSON.stringify({
        ok: false, reason: "ambiguous",
        message: `J'ai trouvé ${candidates.length} factures candidates. Laquelle ?`,
        match_type: matchType,
        candidates: candidates.map(compactFacture),
      });
    }

    // Match unique mais signal faible (basé uniquement sur le doc.nom, pas sur le lot/contact) :
    // on demande une confirmation explicite plutôt que d'exécuter directement.
    if (matchType === "weak" && candidates.length === 1) {
      return JSON.stringify({
        ok: false, reason: "weak_match",
        message: `J'ai trouvé une facture qui semble correspondre, mais le match est faible (basé sur le nom du document seulement). Confirme : c'est bien celle-ci ?`,
        candidates: candidates.map(compactFacture),
      });
    }

    // 4. Match unique : applique la règle selon le montant.
    const facture = candidates[0];
    const restant = montantRestant(facture);

    // Cas E — trop-perçu : on rejette seulement si vrai dépassement (>10€ OU >1% du restant,
    //   le plus généreux des deux). Sous ce seuil = arrondi en faveur de l'artisan, on tolère.
    const overpayTolerance = Math.max(10, restant * 0.01);
    if (amount > restant + overpayTolerance) {
      return JSON.stringify({
        ok: false, reason: "amount_exceeds",
        message: `Le paiement de ${amount}€ dépasse le restant à payer (${restant}€) sur la facture "${facture.nom}". Trop-perçu volontaire ? Si oui, marque la facture en 'payee' manuellement et enregistre l'excédent comme frais.`,
        facture: compactFacture(facture),
        overpay: amount - restant,
      });
    }

    // PATCH facture : si amount couvre quasi-totalement le restant → payee.
    // Sinon → payee_partiellement avec montant_paye cumulé.
    const isFullPayment = amount >= restant - AMOUNT_MATCH_TOLERANCE;
    const newStatut = isFullPayment ? "payee" : "payee_partiellement";
    const newMontantPaye = isFullPayment
      ? Number(facture.montant ?? amount)
      : Number(facture.montant_paye ?? 0) + amount;

    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/documents/${facture.id}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ factureStatut: newStatut, montantPaye: isFullPayment ? null : newMontantPaye }),
    });
    if (!res.ok) {
      const errTxt = await res.text();
      return JSON.stringify({ ok: false, reason: "patch_failed", error: `${res.status}: ${errTxt.slice(0, 200)}` });
    }

    return JSON.stringify({
      ok: true,
      action: newStatut,
      facture_id: facture.id,
      facture_nom: facture.nom,
      lot_nom: facture.lots_chantier?.nom ?? null,
      amount_paid: amount,
      total_paye_now: isFullPayment ? facture.montant : newMontantPaye,
      restant_apres: isFullPayment ? 0 : restant - amount,
      date_paid: typeof args.date_paid === "string" ? args.date_paid : new Date().toISOString().slice(0, 10),
    });
  },

  register_avenant: async ({ chantierId, args }) => {
    const parentId = String(args.parent_devis_id ?? "").trim();
    const supplement = Number(args.amount_supplement ?? 0);
    const motif = String(args.motif ?? "").trim();
    const autoValidate = args.auto_validate === true;

    if (!parentId || !Number.isFinite(supplement) || supplement <= 0 || !motif) {
      return JSON.stringify({
        ok: false,
        error: "parent_devis_id, amount_supplement (>0) et motif requis",
      });
    }

    const sb = supabaseAdmin();

    // 1. Vérifie que le parent existe, appartient au chantier, et est un devis.
    const { data: parent, error: pErr } = await sb
      .from("documents_chantier")
      .select("id, chantier_id, document_type, lot_id, nom, montant, parent_devis_id")
      .eq("id", parentId)
      .single();
    if (pErr || !parent) {
      return JSON.stringify({ ok: false, error: "Devis parent introuvable" });
    }
    if (parent.chantier_id !== chantierId) {
      return JSON.stringify({ ok: false, error: "Devis parent d'un autre chantier" });
    }
    if (parent.document_type !== "devis") {
      return JSON.stringify({ ok: false, error: `parent_devis_id n'est pas un devis (type=${parent.document_type})` });
    }
    // Anti-chaînage : un avenant ne peut pas avoir d'avenant. On rattache toujours à la racine.
    const rootId = parent.parent_devis_id ?? parent.id;

    // 2. Insertion avenant : montant = supplement seul, lot hérité, parent = root.
    //    bucket_path est requis NOT NULL — on génère un chemin virtuel unique
    //    car l'avenant n'a pas de fichier physique uploadé (déclaration agent).
    const virtualPath = `agent-virtual/${chantierId}/avenant-${crypto.randomUUID()}`;
    const labelParent = parent.nom ? String(parent.nom).slice(0, 60) : "devis";
    const avenantNom = `Avenant +${supplement}€ — ${labelParent}`;

    const insertPayload: Record<string, unknown> = {
      chantier_id:     chantierId,
      lot_id:          parent.lot_id ?? null,
      document_type:   "devis",
      source:          "agent_avenant",
      nom:             avenantNom,
      nom_fichier:     `${avenantNom}.virtual`,
      bucket_path:     virtualPath,
      montant:         supplement,
      parent_devis_id: rootId,
      avenant_motif:   motif,
      devis_statut:    autoValidate ? "valide" : "en_cours",
    };
    if (autoValidate) {
      insertPayload.devis_validated_at = new Date().toISOString();
    }

    const { data: inserted, error: insErr } = await sb
      .from("documents_chantier")
      .insert(insertPayload)
      .select("id, nom, montant, devis_statut, parent_devis_id, avenant_motif, devis_validated_at, lot_id, created_at")
      .single();

    if (insErr || !inserted) {
      return JSON.stringify({ ok: false, error: `insert avenant: ${insErr?.message ?? "unknown"}` });
    }

    return JSON.stringify({
      ok: true,
      avenant_id:        inserted.id,
      parent_devis_id:   rootId,
      parent_montant:    parent.montant,
      supplement,
      total_amende:      Number(parent.montant ?? 0) + supplement,
      motif,
      devis_statut:      inserted.devis_statut,
      validated_at:      inserted.devis_validated_at,
      message: autoValidate
        ? `Avenant +${supplement}€ créé et validé sur le devis "${labelParent}". Total amendé : ${Number(parent.montant ?? 0) + supplement}€.`
        : `Avenant +${supplement}€ créé en attente de validation sur le devis "${labelParent}".`,
    });
  },

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
