export const prerender = false;

import type { APIRoute } from "astro";
import { optionsResponse, jsonOk, jsonError, requireAuth } from "@/lib/api/apiHelpers";
import { deriveMotifHero } from "@/lib/analyse/motifHero";
import { verdictContreditLeMessage } from "@/lib/analyse/refusExplicite";
import { invaliderRapprochements } from "@/lib/analyse/invalidationRapprochement";
import {
  sendReviewNotificationEmail,
  journaliserNotificationRevue,
  type ReviewAction,
} from "@/lib/integrations/reviewNotificationEmail";

const ENGINE_VERSION_FALLBACK = "1.0.0-refonte";

/**
 * Réaligne le hero (`verdict_ligne`) sur ce que l'expert vient de décider.
 *
 * `verdict_ligne` est construit AVANT la revue à partir du surcoût automatique.
 * Sans ce rattrapage, la page continue d'afficher le motif et la marge
 * d'origine sous un verdict corrigé — contradiction visible par l'utilisateur.
 *
 * Le motif vient du `expert_message` quand il existe : c'est l'expert qui vient
 * de trancher, le levier n'est qu'un reste du calcul automatique qu'il corrige.
 * La marge n'est reconduite que si un montant la porte encore.
 */
function resyncVerdictLigne(vl: any, conclusion: any): void {
  const surcoutMax = Number(conclusion?.surcout_global?.max ?? 0) || 0;
  const surcoutMin = Number(conclusion?.surcout_global?.min ?? 0) || 0;

  const topLevier = Array.isArray(conclusion?.leviers) ? conclusion.leviers[0] : null;
  vl.motif = deriveMotifHero(
    conclusion?.expert_message,
    typeof topLevier?.titre === "string" ? topLevier.titre : null,
  );

  // Une marge n'est annoncée que si l'expert a laissé un montant. À zéro, on ne
  // promet pas une économie qu'il vient de retirer ; sinon on reprend SES
  // chiffres, jamais ceux d'avant la correction.
  // 2026-09-15 — depuis le retrait du coefficient ×1,3, l'écart est un nombre
  // unique ; et l'expert saisit souvent le même montant dans les deux champs.
  // « environ 800 à 800 € » se lirait comme une fourchette inexistante.
  vl.marge = surcoutMax > 0
    ? (surcoutMin === surcoutMax
        ? `environ ${surcoutMax.toLocaleString("fr-FR")} €`
        : `environ ${surcoutMin.toLocaleString("fr-FR")} à ${surcoutMax.toLocaleString("fr-FR")} €`)
    : null;

  // Conserve le montant en tête du résumé (« 3 489 € HT — … »), qui reste vrai,
  // et ne remplace que la partie devenue fausse.
  const montant = typeof vl.resume === "string" && vl.resume.includes(" — ")
    ? vl.resume.split(" — ")[0]
    : null;
  vl.resume = montant ? `${montant} — ${vl.motif}.` : `${vl.motif}.`;
}

/**
 * POST /api/admin/reviews/[id]/decide
 *
 * Action de l'expert sur une analyse en pending_review.
 *
 * Body :
 *   {
 *     action: "validated" | "corrected" | "rejected",
 *     // Si action='corrected', les champs corrigés (sinon ignorés) :
 *     corrected_verdict_global?: "dans_la_norme" | "eleve_justifie" | "a_negocier" | "a_risque",
 *     corrected_verdict_decisionnel?: "signer" | "signer_avec_negociation" | "ne_pas_signer",
 *     corrected_surcout_min?: number,
 *     corrected_surcout_max?: number,
 *     corrected_anomalies?: any[],
 *     expert_notes?: string
 *   }
 *
 * Effets :
 *   1. UPDATE analyses SET review_status = 'validated' | 'corrected' | 'auto_approved' (si rejected),
 *      review_notes, reviewed_at, reviewed_by
 *   2. INSERT analysis_corrections avec snapshot du conclusion_ia original
 *   3. Si action='corrected', mise à jour de conclusion_ia avec les valeurs expertisées
 *      (verdict, surcout, anomalies) pour que le user voie le verdict corrigé.
 *
 * NB : pas de modification serveur du verdict_decisionnel automatique — c'est l'expert qui décide.
 */
export const POST: APIRoute = async ({ request, params }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  const id = params.id;
  if (!id) return jsonError("ID manquant", 400);

  // Vérifier admin
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleData) return jsonError("Accès refusé", 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("Body JSON invalide", 400);
  }

  const action = body.action;
  if (!["validated", "corrected", "rejected"].includes(action)) {
    return jsonError("action invalide (validated | corrected | rejected)", 400);
  }

  // Fetch l'analyse actuelle (snapshot)
  const { data: analysis, error: fetchErr } = await supabase
    .from("analyses")
    // ⚠️ `raw_text` est nécessaire pour invalider un rapprochement : les
    // fourchettes affichées poste par poste vivent dans `n8n_price_data`, pas
    // dans `conclusion_ia`. Sans lui, l'expert peut annuler un MONTANT mais pas
    // la CARTE qui le porte — c'est exactement le trou constaté sur le devis
    // « noreco peinture2 » le 2026-09-26.
    .select("id, conclusion_ia, raw_text, review_status, file_name, user_id")
    .eq("id", id)
    .single();
  if (fetchErr || !analysis) return jsonError("Analyse introuvable", 404);

  if (analysis.review_status !== "pending_review") {
    return jsonError(
      `Cette analyse n'est pas en attente (status=${analysis.review_status})`,
      409,
    );
  }

  // Parse conclusion actuelle
  let conclusionOriginal: any = null;
  try {
    conclusionOriginal =
      typeof analysis.conclusion_ia === "string" ? JSON.parse(analysis.conclusion_ia) : null;
  } catch {
    conclusionOriginal = null;
  }
  if (!conclusionOriginal) {
    return jsonError("conclusion_ia illisible pour cette analyse", 500);
  }

  const engineVersion =
    typeof conclusionOriginal.engine_version === "string"
      ? conclusionOriginal.engine_version
      : ENGINE_VERSION_FALLBACK;

  // Détermine le nouveau review_status
  const newReviewStatus =
    action === "rejected" ? "auto_approved" : action; // rejected = remet en auto, faux positif

  // Si correction, on construit la nouvelle conclusion (override des champs)
  let conclusionToPersist: any = conclusionOriginal;
  let correctedVerdictGlobal: string | null = null;
  let correctedVerdictDecisionnel: string | null = null;
  let correctedSurcoutMin: number | null = null;
  let correctedSurcoutMax: number | null = null;
  let correctedAnomalies: any[] | null = null;
  // `null` tant qu'aucun rapprochement n'est invalidé : on ne réécrit jamais
  // `raw_text` sans raison — c'est la donnée d'extraction d'origine.
  let rawTextToPersist: string | null = null;
  let rapprochementsDemandes = 0;
  let rapprochementsInvalides = 0;

  // ⚠️ INVALIDER UN RAPPROCHEMENT N'EST POSSIBLE QUE SOUS « corrected », ET CE
  // N'EST PAS UNE COQUETTERIE DE VOCABULAIRE. Seul ce statut protège l'écriture
  // (filet du 04/09 : une conclusion `corrected` n'est jamais régénérée). Sous
  // « rejected », l'analyse repasse en `auto_approved` et le prochain bump
  // d'`ENGINE_VERSION` effacerait l'invalidation en silence.
  if (
    Array.isArray(body.rapprochements_invalides) &&
    body.rapprochements_invalides.length > 0 &&
    action !== "corrected"
  ) {
    return jsonError(
      "Invalider un rapprochement est une correction de contenu : utilisez l'action « corrected ». " +
        "Sous « validated » ou « rejected », l'invalidation serait perdue à la prochaine régénération.",
      400,
    );
  }

  if (action === "corrected") {
    correctedVerdictGlobal =
      typeof body.corrected_verdict_global === "string" ? body.corrected_verdict_global : null;
    correctedVerdictDecisionnel =
      typeof body.corrected_verdict_decisionnel === "string"
        ? body.corrected_verdict_decisionnel
        : null;
    correctedSurcoutMin =
      typeof body.corrected_surcout_min === "number" ? body.corrected_surcout_min : null;
    correctedSurcoutMax =
      typeof body.corrected_surcout_max === "number" ? body.corrected_surcout_max : null;
    correctedAnomalies = Array.isArray(body.corrected_anomalies) ? body.corrected_anomalies : null;

    // Construit la conclusion corrigée à persister dans analyses.conclusion_ia
    conclusionToPersist = { ...conclusionOriginal };
    if (correctedVerdictGlobal) conclusionToPersist.verdict_global = correctedVerdictGlobal;
    if (correctedVerdictDecisionnel)
      conclusionToPersist.verdict_decisionnel = correctedVerdictDecisionnel;
    if (correctedSurcoutMin !== null || correctedSurcoutMax !== null) {
      conclusionToPersist.surcout_global = {
        min: correctedSurcoutMin ?? conclusionOriginal.surcout_global?.min ?? 0,
        max: correctedSurcoutMax ?? conclusionOriginal.surcout_global?.max ?? 0,
      };
    }
    if (correctedAnomalies) {
      conclusionToPersist.anomalies = correctedAnomalies;
      conclusionToPersist.has_anomalies = correctedAnomalies.length > 0;
    }
    // Marque la conclusion comme expert-reviewed
    conclusionToPersist.expert_reviewed = true;
    conclusionToPersist.expert_reviewed_at = new Date().toISOString();

    // Message AFFICHÉ à l'utilisateur, distinct des `expert_notes` internes
    // (celles-ci parlent de « faux rouge » ou de « bug d'extraction Gemini » —
    // jargon interne, jamais montrable). Sans ce champ, une correction ne
    // faisait que RETIRER de l'information : la page annonçait « négociable »
    // sans plus aucun argument à l'appui (retour Johan sur le devis 25030).
    if (typeof body.expert_message === "string" && body.expert_message.trim()) {
      conclusionToPersist.expert_message = body.expert_message.trim();
    }

    // ── 🔴 L'EXPERT PEUT INVALIDER UN RAPPROCHEMENT (2026-09-26) ────────────
    //
    // Jusqu'ici cette route n'écrivait QUE `conclusion_ia`. Un expert pouvait
    // donc ramener un surcoût à zéro sans que la CARTE qui le portait change :
    // la fourchette catalogue restait affichée, avec son badge.
    //
    // 🔴 ET LE DÉFAUT NE VA PAS QUE DANS LE SENS DE L'ACCUSATION. Mesuré sur
    // le devis « noreco peinture2 » (peinture, 9 pièces) : quatre noms de
    // pièces avaient été rapprochés d'un miroir, d'une cuisine, d'une douche et
    // d'un WC — tarifs À L'UNITÉ multipliés par une quantité en m². La page
    // affichait « salon 2 800 € · marché 10 500–42 000 € » en VERT. Un
    // rapprochement faux ne produit pas seulement de fausses accusations : il
    // fabrique de la réassurance.
    //
    // ⚠️ ON IDENTIFIE PAR INDICE, JAMAIS PAR LIBELLÉ. Plusieurs groupes d'un
    // même devis portent le même intitulé (règle du 17/09) — un rapprochement
    // par libellé y désignerait le mauvais poste, en silence.
    if (Array.isArray(body.rapprochements_invalides) && body.rapprochements_invalides.length) {
      let raw: any = null;
      try {
        raw = typeof analysis.raw_text === "string" ? JSON.parse(analysis.raw_text) : null;
      } catch {
        raw = null;
      }
      if (!raw || !Array.isArray(raw.n8n_price_data)) {
        return jsonError("raw_text illisible : impossible d'invalider un rapprochement", 500);
      }

      // ⚠️ LA RÈGLE VIT DANS `invalidationRapprochement.ts`, ET ELLE Y EST
      // TESTÉE. La recopier ici ferait diverger le comportement du premier
      // ajustement — c'est ce que ce dépôt a déjà payé plusieurs fois.
      const resultat = invaliderRapprochements(raw.n8n_price_data, body.rapprochements_invalides);

      if (resultat.indicesInvalides.length > 0) {
        return jsonError(
          `rapprochements_invalides : indice hors des groupes de ce devis (${resultat.indicesInvalides.join(", ")})`,
          400,
        );
      }

      if (resultat.invalides.length) {
        raw.n8n_price_data = resultat.groupes;
        rawTextToPersist = JSON.stringify(raw);
        // Trace durable, dans la conclusion que la machine ne réécrira plus
        // (filet du 04/09 : une conclusion `corrected` n'est jamais régénérée).
        conclusionToPersist.rapprochements_invalides_par_expert = resultat.invalides;
      }
      rapprochementsDemandes = resultat.demandes;
      rapprochementsInvalides = resultat.invalides.length;
    }

    // ── 🔴 LE MESSAGE ET LE VERDICT NE PEUVENT PAS SE CONTREDIRE ───────────
    // (2026-09-23, cause 2 du défaut ALES)
    //
    // `corrected_verdict_*` sont OPTIONNELS : un expert qui rédige un refus
    // sans toucher les deux sélecteurs laisse le verdict automatique en place.
    // Mesuré sur les 24 conclusions portant un message : **2** affichaient
    // « Environ 1 332 € à discuter avec l'artisan » (ALES) ou « Un point à
    // sécuriser avant de signer » (J.P. ROUX) au-dessus d'un encadré concluant
    // « En résumé, ne signez pas ce devis en l'état ».
    //
    // ⚠️ ON NE DEVINE PAS LAQUELLE DES DEUX SOURCES A RAISON. Dériver un
    // verdict d'un texte libre ferait basculer un devis en « ne pas signer »
    // sur une mauvaise lecture — ce produit s'interdit d'accuser sur une
    // incertitude. On REFUSE la décision et l'expert tranche.
    // ⚠️ La règle vit dans `refusExplicite.ts`, avec un témoin double bâti sur
    // les phrases RÉELLES du stock : 5 refus reconnus, 6 conditionnels écartés
    // (« ne signer aucun document AVANT d'avoir obtenu… » n'est pas un refus).
    const verdictRetenu =
      correctedVerdictDecisionnel ?? conclusionToPersist.verdict_decisionnel ?? null;
    if (verdictContreditLeMessage(conclusionToPersist.expert_message, verdictRetenu)) {
      return jsonError(
        "Votre message recommande de ne pas signer, mais le verdict retenu reste « " +
          `${verdictRetenu ?? "inchangé"} ». La page afficherait donc un titre qui vous contredit. ` +
          "Passez le verdict décisionnel à « ne pas signer », ou reformulez le message.",
        400,
      );
    }

    // ── Cohérence Phase 4 après correction (2026-08-29) ────────────────────
    // `verdict_ligne` (hero) et `leviers` sont construits AVANT la revue à
    // partir du surcoût automatique. Si l'expert annule ce surcoût — cas
    // typique du faux positif de matching — sans ce rattrapage la page
    // continuait d'afficher « X–Y € d'écart estimé » et un levier « surcoût »
    // que l'expert vient précisément d'invalider. Contradiction visible par
    // l'utilisateur, juste sous un verdict corrigé.
    if (correctedVerdictDecisionnel && conclusionToPersist.verdict_ligne) {
      conclusionToPersist.verdict_ligne.decision = correctedVerdictDecisionnel;
    }
    const surcoutMaxAfter = Number(conclusionToPersist.surcout_global?.max ?? 0) || 0;
    const anomaliesAfter = Array.isArray(conclusionToPersist.anomalies)
      ? conclusionToPersist.anomalies.length
      : 0;
    if (surcoutMaxAfter === 0 || anomaliesAfter === 0) {
      // Filet si l'expert n'a rien décoché : un surcoût ramené à 0 avec des
      // anomalies CHIFFRÉES encore listées est une contradiction visible
      // (« 0 € » au-dessus d'un « Détail des 2 anomalies »).
      // ⚠️ On ne retire QUE les anomalies de prix (`surcout_estime > 0`). Les
      // anomalies QUALITATIVES — « devis daté dans le futur », quantité
      // incohérente, prix anormalement BAS — ont légitimement un surcoût nul
      // et doivent survivre : les supprimer ferait disparaître de vraies
      // alertes. Discriminant vérifié sur le stock le 2026-08-29.
      if (surcoutMaxAfter === 0 && anomaliesAfter > 0 && !correctedAnomalies) {
        const restantes = conclusionToPersist.anomalies.filter(
          (an: any) => !(Number(an?.surcout_estime ?? 0) > 0),
        );
        conclusionToPersist.anomalies = restantes;
        conclusionToPersist.has_anomalies = restantes.length > 0;
      }
      if (Array.isArray(conclusionToPersist.leviers)) {
        conclusionToPersist.leviers = conclusionToPersist.leviers.filter(
          (l: any) => l?.type !== "surcout_postes",
        );
      }
      const vl = conclusionToPersist.verdict_ligne;
      if (vl && typeof vl === "object") {
        resyncVerdictLigne(vl, conclusionToPersist);
      }
    } else if (conclusionToPersist.verdict_ligne && typeof conclusionToPersist.verdict_ligne === "object") {
      // 🔴 2026-09-17 — LE DÉTAIL DOIT SOMMER AU MONTANT ANNONCÉ, SINON LA PAGE
      // PORTE DEUX CHIFFRES QUI SE CONTREDISENT.
      //
      // Cas réel (devis Vilette) : l'expert ramène le surcoût à 4 000 €, garde
      // l'anomalie cochée — et celle-ci conserve ses **4 520 €** d'origine. Le
      // lecteur qui additionne le détail ne retombe jamais sur le montant du
      // hero. C'est exactement la règle R « montant ≠ somme du détail » de la
      // relecture du verdict (15/09), qui ne tourne qu'à la GÉNÉRATION et ne
      // voyait donc pas une correction manuelle.
      //
      // On réaligne les anomalies de PRIX au prorata. Avec une seule — le cas
      // courant — elle prend simplement le montant de l'expert.
      // ⚠️ Les anomalies QUALITATIVES (surcoût nul) ne sont pas touchées : même
      // discriminant que le filet ci-dessus.
      const cible = Number(conclusionToPersist.surcout_global?.max ?? 0) || 0;
      const chiffrees = (conclusionToPersist.anomalies ?? []).filter(
        (an: any) => Number(an?.surcout_estime ?? 0) > 0,
      );
      const somme = chiffrees.reduce((n: number, an: any) => n + Number(an.surcout_estime), 0);
      if (cible > 0 && somme > 0 && Math.abs(somme - cible) > 1) {
        const facteur = cible / somme;
        for (const an of chiffrees) {
          an.surcout_estime = Math.round(Number(an.surcout_estime) * facteur);
        }
        console.log(
          `[decide] détail réaligné sur le montant de l'expert : ${Math.round(somme)} € → ${cible} €`,
        );
      }

      // 2026-09-05 (cas devis cuisine) — L'EXPERT A CORRIGÉ LE MONTANT SANS
      // L'ANNULER : le rattrapage ci-dessus ne se déclenchait pas.
      //
      // L'expert avait ramené le surcoût de 579–1 075 € à 600–800 € et écrit
      // un message ; la page continuait d'afficher « un poste dépasse les
      // fourchettes du marché (environ 827 € d'écart) » et « marge : 579 à
      // 1 075 € ». Le hero contredisait la correction qui venait d'être faite.
      //
      // Le rattrapage doit tourner dès qu'un montant OU un verdict est
      // corrigé, pas seulement quand le montant tombe à zéro.
      const montantCorrige = correctedSurcoutMin !== null || correctedSurcoutMax !== null;
      if (montantCorrige || correctedVerdictGlobal || correctedVerdictDecisionnel) {
        resyncVerdictLigne(conclusionToPersist.verdict_ligne, conclusionToPersist);
      }
    }
  }

  const expertNotes = typeof body.expert_notes === "string" ? body.expert_notes : null;

  /**
   * 🔴 2026-09-17 — STATUER SANS PRÉVENIR L'UTILISATEUR (demande Johan).
   *
   * La file de revue contient **65 devis déposés entre avril et juillet**, qui
   * n'y sont pas parce qu'un utilisateur attend : c'est notre propre passe de
   * régénération du 15/09 qui les y a remis (Piste C by design). Écrire à ces
   * gens « votre analyse a été relue » des mois après leur dépôt n'a aucun sens
   * pour eux — c'est même le contraire du rattrapage du 10/09, qui s'adressait
   * à des utilisateurs qu'on avait vraiment laissés sans réponse.
   *
   * ⚠️ RÉSERVÉ AUX ADMINS, comme le `silencieux` de la route de conclusion
   * (15/09) : le rôle est déjà vérifié plus haut dans cette route, et la
   * décision elle-même n'est ouverte qu'à eux. Ce drapeau ne peut donc pas
   * servir à quelqu'un pour étouffer une alerte sur son propre devis.
   *
   * ⚠️ LE DÉFAUT PAR DÉFAUT RESTE D'ÉCRIRE. Un expert qui tranche un devis
   * récent doit prévenir son utilisateur — c'est la promesse « réponse sous
   * 24 h ». Il faut demander explicitement le silence, jamais l'obtenir par
   * omission.
   */
  const silencieux = body.silencieux === true;

  // INSERT analysis_corrections (audit trail)
  const reviewTriggers = Array.isArray(body.review_triggers) ? body.review_triggers : [];

  const { error: insertErr } = await supabase.from("analysis_corrections").insert({
    analysis_id: id,
    reviewed_by_user_id: user.id,
    reviewed_by_email: user.email ?? "(inconnu)",
    action,
    corrected_verdict_global: correctedVerdictGlobal,
    corrected_verdict_decisionnel: correctedVerdictDecisionnel,
    corrected_surcout_min: correctedSurcoutMin,
    corrected_surcout_max: correctedSurcoutMax,
    corrected_anomalies: correctedAnomalies,
    original_conclusion: conclusionOriginal,
    review_triggers: reviewTriggers,
    expert_notes: expertNotes,
    engine_version: engineVersion,
  });

  if (insertErr) {
    return jsonError(`Insert correction failed: ${insertErr.message}`, 500);
  }

  // UPDATE analyses
  const updatePayload: any = {
    review_status: newReviewStatus,
    review_notes: expertNotes,
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.id,
  };
  if (action === "corrected") {
    updatePayload.conclusion_ia = JSON.stringify(conclusionToPersist);
  }
  // Écrit UNIQUEMENT si au moins un rapprochement a réellement été invalidé.
  if (rawTextToPersist) {
    updatePayload.raw_text = rawTextToPersist;
  }

  const { error: updateErr } = await supabase
    .from("analyses")
    .update(updatePayload)
    .eq("id", id);

  if (updateErr) {
    return jsonError(`Update analysis failed: ${updateErr.message}`, 500);
  }

  // Notification email user — fire-and-forget. Vercel coupe la lambda dès le
  // return → on AWAIT volontairement (fire-and-forget pur perdrait l'email).
  // Le pattern await ici reste fiable car Resend répond généralement en < 300ms.
  // L'envoi ne peut JAMAIS faire échouer la décision admin (try/catch + best-effort).
  // 2026-09-08 — La raison remonte jusqu'à l'écran de revue. Julien n'a rien
  // reçu le 06/09 et rien ne permettait de dire pourquoi : clé absente ? refus
  // de Resend ? indésirables ? Un envoi silencieux qui échoue est pire qu'une
  // absence d'envoi — on croit l'utilisateur prévenu.
  let notification: { ok: boolean; raison: string } = {
    ok: false,
    raison: "aucun destinataire (analyse sans utilisateur)",
  };

  // Le silence est DEMANDÉ, jamais subi : on le dit dans la réponse pour que
  // l'écran puisse l'afficher. Un envoi qu'on croit parti alors qu'il ne l'est
  // pas est le défaut du 08/09 ; un envoi tu sans le dire en serait le miroir.
  // ⚠️ Le helper d'envoi journalise LUI-MÊME dès qu'il est appelé (succès comme
  // échec). Les chemins où il n'est JAMAIS atteint — analyse sans utilisateur,
  // compte sans adresse, exception en amont — n'écriraient donc rien : c'est
  // précisément le silence indiscernable que ce journal existe pour lever.
  let journalise = false;

  if (silencieux) {
    notification = { ok: false, raison: "silencieux demandé — l'utilisateur n'a PAS été prévenu" };
    // 🔴 LE SILENCE SE JOURNALISE AUSSI (17/09). Sans cette ligne, une analyse
    // sans notification serait indiscernable d'une analyse dont l'envoi a
    // échoué — soit exactement la confusion que le journal existe pour lever.
    await journaliserNotificationRevue({
      analysisId: id,
      toEmail: "(non envoyé)",
      action,
      envoye: false,
      raison: notification.raison,
    });
    journalise = true;
  }

  try {
    if (analysis.user_id && !silencieux) {
      const { data: userData } = await supabase.auth.admin.getUserById(analysis.user_id);
      const recipient = userData?.user;
      const meta = (recipient?.user_metadata ?? {}) as Record<string, string>;
      const prenom =
        (meta.first_name || (meta.full_name || meta.name || "").split(" ")[0] || "").trim() || null;
      if (recipient?.email) {
        notification = await sendReviewNotificationEmail({
          toEmail: recipient.email,
          prenom,
          fileName: analysis.file_name ?? null,
          analysisId: id,
          action: action as ReviewAction,
          verdictDecisionnel:
            (conclusionToPersist as any)?.verdict_decisionnel ?? correctedVerdictDecisionnel,
          verdictGlobal: (conclusionToPersist as any)?.verdict_global ?? correctedVerdictGlobal,
        });
        journalise = true; // le helper a écrit le journal lui-même
      } else {
        notification = {
          ok: false,
          raison: "le compte de cet utilisateur n'a pas d'adresse email",
        };
      }
    }
  } catch (e) {
    notification = {
      ok: false,
      raison: e instanceof Error ? e.message : String(e),
    };
    console.error("[decide.ts] notification email failed:", notification.raison);
    // pas de propagation : la décision admin reste OK même si l'email a échoué
  }

  if (!journalise) {
    await journaliserNotificationRevue({
      analysisId: id,
      toEmail: "(aucun destinataire)",
      action,
      envoye: false,
      raison: notification.raison,
    });
  }

  return jsonOk({
    success: true,
    action,
    review_status: newReviewStatus,
    // L'écran de revue l'affiche : sans cette information, on ne sait pas si
    // l'utilisateur a réellement été prévenu.
    notification,
    // ⚠️ DEUX COMPTES, PAS UN. Un groupe déjà sans tarif est ignoré : si l'on
    // ne renvoyait que le nombre invalidé, une demande partiellement sans effet
    // passerait pour un succès complet.
    rapprochements: {
      demandes: rapprochementsDemandes,
      invalides: rapprochementsInvalides,
    },
  });
};

export const OPTIONS: APIRoute = () => optionsResponse("POST,OPTIONS");
