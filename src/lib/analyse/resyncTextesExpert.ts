/**
 * src/lib/analyse/resyncTextesExpert.ts
 *
 * 2026-09-26 — Après une correction d'expert, les TEXTES de la page doivent
 * cesser de contredire le verdict qu'il vient de poser.
 *
 * 🔴 CE QUE LE FORMULAIRE NE COUVRAIT PAS. `decide.ts` écrit le verdict, le
 * surcoût, les anomalies, le message d'expert et (depuis le 05/09)
 * `verdict_ligne`. Les quatre textes restants gardaient ceux de la machine.
 * Mesuré sur le devis « noreco peinture2 », corrigé en `signer` / surcoût 0 /
 * zéro anomalie — la page affichait encore :
 *
 *   phrase_intro            « ce devis est À NÉGOCIER en raison de certains
 *                             postes SURÉVALUÉS »
 *   justifications          cite « l'aménagement de la cuisine, la pose de
 *                             douche et le miroir de salon » — sur un devis
 *                             de PEINTURE (les faux rapprochements)
 *   actions_avant_signature « demandez une RÉVISION DU PRIX pour le poste
 *                             Peinture » — celui que l'expert venait de valider
 *   verdict_reasons         « surcoût 13 % (~1,2 k€) », « 1 poste anormalement
 *                             élevé »
 *
 * Chaque correction laissait donc la page se contredire, et il fallait une
 * chirurgie manuelle en base à chaque fois (note de mémoire du 03/08, cas ATEX).
 *
 * 🔴 ON RECOMPOSE, ON NE FILTRE PAS — et c'est la leçon du 16/09. Retirer les
 * phrases fautives par liste noire ne peut pas être complet : `sanitizeLLMText`
 * bloquait « globalement cohérent » pendant que Gemini écrivait « présente un
 * prix cohérent ». Quand l'expert a retiré tout écart de prix, ces textes sont
 * REMPLACÉS par une composition déterministe, comme `phraseIntroSansReference`
 * le fait déjà sur le chemin normal.
 *
 * ⚠️ PORTÉE VOLONTAIREMENT ÉTROITE. On ne recompose QUE lorsque l'expert a
 * ramené l'écart à zéro ET ne garde aucune anomalie : là, tout texte qui parle
 * de surcoût est faux, sans ambiguïté. Quand il laisse un écart, les textes de
 * la machine restent globalement justes — les réécrire demanderait de deviner
 * ce qu'il pense, et ce produit s'interdit d'affirmer sur une incertitude.
 */

export interface ConclusionCorrigee {
  verdict_decisionnel?: string | null;
  surcout_global?: { min?: number; max?: number } | null;
  anomalies?: unknown[] | null;
  expert_message?: string | null;
  phrase_intro?: string | null;
  justifications?: string | null;
  actions_avant_signature?: unknown;
  verdict_reasons?: { summary?: string; reasons?: string[]; context?: string[] } | null;
  market_context_note?: string | null;
  [k: string]: unknown;
}

/** Ce qui a été réécrit — pour que l'écran de revue puisse le DIRE. */
export interface ResultatResync {
  recompose: boolean;
  champsReecrits: string[];
  /** Pourquoi on n'a rien fait, quand c'est le cas. */
  motif: string | null;
}

/**
 * Une action qui réclame une révision de PRIX.
 *
 * ⚠️ CETTE LISTE NE SERT QU'À RETIRER, JAMAIS À DÉCIDER. Elle ne peut pas être
 * complète (règle du 16/09), donc elle n'est employée que dans le cas déjà
 * tranché « l'expert a retiré tout écart » — où le pire qu'elle risque est de
 * laisser passer une action de prix, pas d'en supprimer une légitime.
 */
const ACTION_DE_PRIX = new RegExp(
  [
    // Les mots qui NE PEUVENT désigner qu'un écart de prix.
    "surco[uû]t",
    "sur[ée]valu",
    "trop cher",
    "anormalement [ée]lev",
    // « prix » suivi, dans la même phrase, d'un jugement sur son niveau.
    "prix[^.]{0,40}([ée]lev|sup[ée]rieur|au-dessus|excessif|abusif)",
    // et la forme inverse : « révision / renégociation … du prix ».
    // ⚠️ LA FENÊTRE DE 40 CARACTÈRES EST LA GARDE, et elle est mesurée sur des
    // cas réels. « Exigez une révision SIGNIFICATIVE du prix unitaire » doit
    // être retirée — un mot intercalé cassait l'ancien motif « révision du
    // prix ». Mais « RENÉGOCIEZ L'ÉCHÉANCIER : 80 % du montant sont exigés
    // avant la fin des travaux » doit être GARDÉE : elle porte sur le calendrier
    // de paiement, qui reste vrai quel que soit le prix. Élargir la fenêtre la
    // ferait disparaître — la re-mesurer avant d'y toucher.
    "(r[ée]vision|r[ée]n[ée]goci)[^.]{0,40}prix",
  ].join("|"),
  "i",
);

/**
 * Un texte qui AFFIRME un écart de prix — le déclencheur de la recomposition.
 *
 * ⚠️ IL DOIT RESTER SPÉCIFIQUE. Un faux positif détruirait un texte juste (voir
 * la seconde garde). « risque contractuel élevé », « devis trop synthétique »,
 * « comparaison aux prix du marché peu fiable » ne doivent PAS matcher : ce
 * sont des constats vrais qui n'affirment aucun écart.
 */
const AFFIRME_UN_ECART = new RegExp(
  [
    "surco[uû]t",
    "sur[ée]valu",
    "trop cher",
    "anormalement [ée]lev",
    "[àa] n[ée]gocier",
    // ⚠️ PAS de « renégoci » nu : « Renégociez l'échéancier » est un conseil de
    // CALENDRIER DE PAIEMENT, vrai quel que soit le prix. Le mettre ici
    // déclencherait la recomposition sur des conclusions parfaitement justes —
    // c'est le faux positif que la seconde garde existe pour éviter.
    // ⚠️ « poste » et « tarif » AUTANT QUE « prix » : la phrase réelle de
    // `noreco peinture2` dit « Malgré un POSTE de peinture ÉLEVÉ ». S'en tenir
    // à « prix » laissait passer la contradiction la plus visible du cas qui a
    // motivé cette règle.
    // ⚠️ MAIS PAS « montant » : « 80 % du MONTANT sont exigés avant la fin des
    // travaux » parle du calendrier de paiement, et « risque contractuel ÉLEVÉ »
    // ne doit rien déclencher non plus — deux textes justes du stock.
    "(prix|tarifs?|postes?)[^.]{0,40}([ée]lev|sup[ée]rieur|au-dessus|excessif|abusif)",
    "(r[ée]vision|r[ée]n[ée]goci)[^.]{0,40}prix",
    // 🔴 CE QU'ON RENÉGOCIE FAIT TOUTE LA DIFFÉRENCE, et c'est ce qui manquait.
    // « Ce devis présente des POSTES À RENÉGOCIER avant signature » est le
    // résumé de verdict le plus fréquent du stock (5 conclusions sur 6 qui
    // résistaient) : c'est une affirmation de prix. « RENÉGOCIEZ L'ÉCHÉANCIER »
    // porte sur le calendrier de paiement et doit être épargné. D'où l'objet
    // exigé juste avant le verbe, plutôt que le verbe seul.
    "(postes?|prix|tarifs?)[^.]{0,20}r[ée]n[ée]goci",
  ].join("|"),
  "i",
);

/**
 * Le montant du devis tel que le résumé le porte déjà (« 11 345 € HT — … »).
 * On le reprend plutôt que de le recalculer : c'est le chiffre que le lecteur
 * voit ailleurs sur la page, et deux calculs pour un seul fait finissent
 * toujours par diverger.
 */
function montantDepuisResume(conclusion: ConclusionCorrigee): string | null {
  const vl = conclusion.verdict_ligne as { resume?: string } | undefined;
  const resume = typeof vl?.resume === "string" ? vl.resume : null;
  if (!resume || !resume.includes(" — ")) return null;
  const tete = resume.split(" — ")[0].trim();
  // On n'accepte que ce qui ressemble à un montant, jamais une phrase.
  return /\d/.test(tete) && tete.length <= 24 ? tete : null;
}

/** La première phrase du message de l'expert — c'est lui qui vient de trancher. */
function premierePhraseExpert(message: string | null | undefined): string | null {
  if (typeof message !== "string") return null;
  // On saute la salutation, qui n'explique rien.
  const corps = message.replace(/^\s*bonjour\s*,?\s*/i, "").trim();
  if (!corps) return null;
  const fin = corps.search(/[.!?](\s|$)/);
  const phrase = (fin === -1 ? corps : corps.slice(0, fin + 1)).trim();
  // Trop court = une abréviation coupée ; trop long = pas une accroche.
  // Mêmes bornes que `deriveMotifHero` (04/09), pour la même raison.
  if (phrase.length < 30 || phrase.length > 240) return null;
  return phrase;
}

/**
 * Recompose les textes d'une conclusion corrigée. **Mute** l'objet, comme
 * `resyncVerdictLigne`, pour rester cohérent avec l'appelant.
 */
export function resyncTextesExpert(conclusion: ConclusionCorrigee | null | undefined): ResultatResync {
  if (!conclusion) return { recompose: false, champsReecrits: [], motif: "conclusion absente" };

  const surcoutMax = Number(conclusion.surcout_global?.max ?? 0) || 0;
  const anomalies = Array.isArray(conclusion.anomalies) ? conclusion.anomalies : [];

  // 🔴 PREMIÈRE GARDE. Hors de ce cas, on ne touche à rien : les textes de la
  // machine restent globalement justes, et les réécrire reviendrait à deviner.
  if (surcoutMax > 0 || anomalies.length > 0) {
    return {
      recompose: false,
      champsReecrits: [],
      motif: "l'expert a laissé un écart ou une anomalie — les textes restent ceux du moteur",
    };
  }

  // 🔴 SECONDE GARDE, ET ELLE M'A ÉVITÉ UNE RÉGRESSION SÉRIEUSE (26/09).
  //
  // « L'expert a retiré tout écart » n'est PAS équivalent à « les textes
  // contredisent le verdict ». Un passage à blanc sur les conclusions corrigées
  // a rendu **37 candidats** là où seuls 19 portaient une contradiction : les
  // 18 autres ont un écart nul parce qu'ils NE PARLENT PAS DE PRIX —
  //
  //   « installation audio automobile — le devis présente un risque
  //     contractuel élevé »            (hors périmètre, avertissement JUSTE)
  //   « Ce devis est trop synthétique pour être analysé en l'état. Il manque
  //     les quantités précises (m², ml) »   (information UTILE)
  //
  // Les recomposer aurait remplacé des textes exacts et informatifs par une
  // phrase creuse. C'est la règle du 10/09 : **un correctif ne doit pas défaire
  // ce qu'il ne visait pas.**
  //
  // ⚠️ CE MOTIF EST UN DÉCLENCHEUR, PAS LA CORRECTION — et l'asymétrie est
  // voulue. S'il rate un cas, rien ne change (le texte reste tel quel, statu
  // quo). S'il se déclenche, on recompose entièrement. C'est ce qui permet
  // d'employer une liste de mots sans enfreindre la règle du 16/09 : elle ne
  // sert jamais à *fabriquer* une affirmation, seulement à repérer une
  // contradiction déjà écrite.
  const textes = [
    conclusion.phrase_intro,
    conclusion.justifications,
    ...(Array.isArray(conclusion.actions_avant_signature)
      ? (conclusion.actions_avant_signature as unknown[])
      : []),
    conclusion.verdict_reasons?.summary,
    ...(conclusion.verdict_reasons?.reasons ?? []),
  ]
    .filter(Boolean)
    .join(" ");

  if (!AFFIRME_UN_ECART.test(textes)) {
    return {
      recompose: false,
      champsReecrits: [],
      motif: "aucun texte n'affirme d'écart de prix — rien à corriger",
    };
  }

  const champsReecrits: string[] = [];
  const montant = montantDepuisResume(conclusion);
  const phraseExpert = premierePhraseExpert(conclusion.expert_message);

  // 🔴 ON RÉÉCRIT CHAMP PAR CHAMP, PAS EN BLOC — et c'est un acquis à protéger.
  // Sur `2026-09-17_093752`, `phrase_intro` dit « 7 112 € HT pour un chantier à
  // BARD. Aucune des prestations de ce devis ne correspond à un tarif de
  // référence que nous puissions opposer » : c'est EXACTEMENT la formulation
  // honnête gagnée le 16/09, et c'est une AUTRE ligne qui contredisait le
  // verdict. La remplacer aurait défait le correctif de l'invariant
  // d'affirmation pour réparer un défaut voisin.
  const contredit = (v: unknown) => AFFIRME_UN_ECART.test(String(v ?? ""));

  // ── phrase_intro ───────────────────────────────────────────────────────────
  // ⚠️ LA PHRASE COMPOSÉE N'AFFIRME RIEN SUR LE PRIX, dans aucun des deux cas.
  // C'est l'invariant du 16/09 : quand le moteur ne chiffre rien, aucun texte
  // de la page ne peut dire que le prix est correct. Si l'expert l'a écrit,
  // lui, ça vit dans SON encadré, attribué à lui.
  if (contredit(conclusion.phrase_intro)) {
    conclusion.phrase_intro = montant
      ? `${montant} — ce devis a été relu par un expert VerifierMonDevis.`
      : "Ce devis a été relu par un expert VerifierMonDevis.";
    champsReecrits.push("phrase_intro");
  }

  // ── justifications ─────────────────────────────────────────────────────────
  // On reprend la phrase de l'expert quand il en a écrit une : c'est lui qui a
  // tranché, et le lecteur a droit à SA raison plutôt qu'à une formule.
  if (contredit(conclusion.justifications)) {
    conclusion.justifications = phraseExpert
      ? `${phraseExpert} Après cette relecture, aucun écart de prix n'est retenu sur ce devis.`
      : "Après relecture par un expert, aucun écart de prix n'est retenu sur ce devis.";
    champsReecrits.push("justifications");
  }

  // ── actions_avant_signature ────────────────────────────────────────────────
  // ⚠️ ON RETIRE, ON NE RÉÉCRIT PAS : les autres actions (assurance,
  // références, retenue de garantie) restent vraies quel que soit le prix.
  const actions = Array.isArray(conclusion.actions_avant_signature)
    ? (conclusion.actions_avant_signature as unknown[])
    : [];
  const actionsGardees = actions.filter((a) => !ACTION_DE_PRIX.test(String(a)));
  if (actionsGardees.length !== actions.length) {
    conclusion.actions_avant_signature = actionsGardees;
    champsReecrits.push("actions_avant_signature");
  }

  // ── verdict_reasons ────────────────────────────────────────────────────────
  const vr = conclusion.verdict_reasons;
  const vrContredit =
    contredit(vr?.summary) || (vr?.reasons ?? []).some((r) => contredit(r));
  if (vrContredit) {
    const raisons: string[] = [];
    if (phraseExpert) raisons.push(`✅ ${phraseExpert}`);
    raisons.push("ℹ️ Aucun écart de prix n'est retenu après la relecture.");
    conclusion.verdict_reasons = {
      summary: "Ce devis a été relu par un expert, qui n'y retient aucun écart de prix.",
      reasons: raisons,
      // ⚠️ VIDÉ : le contexte de la machine parle du marché (« marché très
      // variable »), ce qui n'a plus de sens quand aucun écart n'est retenu.
      context: [],
    };
    champsReecrits.push("verdict_reasons");
  }

  // ── market_context_note ────────────────────────────────────────────────────
  // « Marché avec forte variation de prix — tolérance ajustée » décrit NOTRE
  // mécanique et n'apprend rien au lecteur ; sous un verdict sans écart, elle
  // laisse penser qu'une comparaison a pesé dans la décision.
  if (conclusion.market_context_note) {
    conclusion.market_context_note = null;
    champsReecrits.push("market_context_note");
  }

  return { recompose: true, champsReecrits, motif: null };
}
