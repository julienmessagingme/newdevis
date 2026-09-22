/**
 * src/components/analysis/AvisSurLeDevis.tsx
 *
 * Hero de l'analyse — Bible Produit VMD, bloc 1.
 * Répond en 5 secondes à la question : « Que retenir de ce devis ? »
 *
 * Trois variations principales (cohérent / négociable / à risque),
 * plus les cas de bypass (devis étranger, estimation courtier, incomplet,
 * hors-scope, prestation intellectuelle) et le hard block company_status.
 *
 * Aucun emoji couleur, aucun badge, aucun chiffre isolé en grande typo.
 * Le fond de carte porte le signal chromatique (menthe / ambre / rose pâle).
 */

import type { ConclusionData } from "@/lib/analyse/conclusionTypes";
import type { Portee } from "@/lib/analyse/porteeAnalyse";
import { porteeValorisable } from "@/lib/analyse/porteeAnalyse";
import { decisionAffichee, titreDecision, motifsBloquants } from "@/lib/analyse/decisionAffichee";
import { pointsVerifiesDetail, type PointVerifie } from "@/lib/analyse/preparationBuilder";
import { objetDeLigne } from "@/lib/analyse/materielReference";

/**
 * Une parenthèse qui rouvre le montant de l'écart : « (environ 12 300 € d'écart
 * sur ces lignes) », « (1 412–2 622 € d'écart estimé) ».
 *
 * ⚠️ Les DEUX formes d'apostrophe sont couvertes — le stock porte la droite et
 * la typographique. N'en reconnaître qu'une laisserait la moitié des cas.
 */
const ECART_ENTRE_PARENTHESES = /\s*\([^)]*€\s*d['’][ée]cart[^)]*\)/gi;

type Tone = "calm" | "amber" | "alert";

interface ToneStyle {
  container: string;
  title: string;
}

const TONE_STYLES: Record<Tone, ToneStyle> = {
  calm: {
    container: "bg-emerald-50/70 border-emerald-200/70",
    title: "text-emerald-950",
  },
  amber: {
    container: "bg-amber-50/70 border-amber-200/70",
    title: "text-amber-950",
  },
  alert: {
    container: "bg-rose-50/70 border-rose-200/70",
    title: "text-rose-950",
  },
};

/**
 * 🔴 2026-09-22 — LA DÉCISION VIT DANS `decisionAffichee`, PAS ICI.
 *
 * Elle est partagée avec la pastille du header (`AnalysisResult`) : le 13/05,
 * deux mappings indépendants avaient fait diverger la pastille et le bandeau
 * sur le même devis. Une seule règle, deux lecteurs.
 */

interface AvisSurLeDevisProps {
  conclusion: ConclusionData;
  /** Nombre de prestations effectivement comparées (issue du moteur, optionnel). */
  comparableCount?: number | null;
  /** Nombre total de prestations du devis (optionnel). */
  totalCount?: number | null;
  /**
   * 🔴 2026-09-22 — SUR QUOI NOUS SOMMES-NOUS PRONONCÉS.
   *
   * Calculée par `porteeAnalyse`, la MÊME règle que le détail poste par poste :
   * le « 6 des 9 » annoncé ici doit se retrouver ligne à ligne plus bas, sinon
   * on reconstruit la divergence qu'on corrige. Elle décide aussi du ton
   * `neutral` quand nous n'avons rien pu comparer.
   *
   * ⚠️ `comparableCount` / `totalCount` ci-dessus n'ont JAMAIS été renseignées
   * par `AnalysisResult` : l'ancienne ligne de couverture ne s'affichait donc
   * que par la branche `comparison_indicative`. Elles restent pour le stock
   * d'appelants éventuels, la portée les remplace.
   */
  portee?: Portee | null;
  /**
   * 🔴 2026-09-22 — CE QUE NOUS AVONS VÉRIFIÉ, remonté dans le hero.
   * Ces faits vivaient uniquement dans la fiche de préparation, plusieurs
   * écrans plus bas. Le lecteur recevait donc ce que nous ne savions pas avant
   * ce que nous avions établi.
   */
  pointsOk?: string[];
  /**
   * 2026-09-22 — l'identité du devis, en sous-titre. Depuis que le corps peut
   * être vide (rien constaté → le titre suffit), le montant du devis n'était
   * plus visible nulle part dans le bloc principal.
   */
  entrepriseName?: string | null;
  totalHt?: number | null;
  /** Motifs critiques (criteres_rouges) issus du scoring, pour le hard block. */
  criticalReasons?: string[];
  /**
   * 2026-08-30 — analyse en attente de validation experte : on n'affiche AUCUN
   * montant d'écart. Le bandeau bleu annonçait « verdict provisoire » pendant
   * que cette carte affirmait « 7 405–13 751 € » ; un client pouvait aller
   * négocier sur un chiffre que nous savions déjà faux.
   */
  provisoire?: boolean;
  /**
   * 🟡 2026-09-22 (structure en cours de validation Johan) — CE QUI APPELLE
   * UNE VÉRIFICATION, remonté À CÔTÉ de ce qui rassure.
   *
   * Sur le devis JeanBERNARD, ce bloc affichait deux points verts pendant que
   * la note Google de 3,6/5 vivait trois écrans plus bas, dans « ce qu'il ne
   * faut pas oublier ». On remontait ce qui rassure et on enterrait ce qui
   * inquiète : l'asymétrie corrigée le 10/09 sur les prix, reconstruite sur
   * l'entreprise.
   *
   * ⚠️ Optionnelle et vide par défaut — aucun appelant existant ne change.
   */
  pointsAttention?: string[];
  /**
   * 🔴 2026-09-23 — L'ANCIENNETÉ, QUE LE PRODUIT SAVAIT ET NE DISAIT PAS.
   *
   * `raw_text.verified.anciennete_annees` est renseigné, mais il n'existe
   * AUCUN `points_ok` qui en parle : mesuré, **23 des 44 analyses vertes
   * concernent une entreprise de 5 ans ou plus et aucune ne l'affichait**.
   * Sur le devis JeanBERNARD, « 25 ans d'ancienneté » est l'argument le plus
   * rassurant de la page — il était invisible.
   */
  ancienneteAnnees?: number | null;
  /** Les alertes du scoring : les spécifiques comptent dans la décision. */
  alertes?: string[];
  /**
   * 🟡 2026-09-22 — UN SEUL ESPACE POUR UNE SEULE DÉCISION.
   *
   * Rendu DANS la carte, sous le bloc vérifié : leviers, puis préparation du
   * rendez-vous en dépli. Trois cartes successives (verdict, « avant de
   * signer », « préparez votre rendez-vous ») obligeaient le lecteur à
   * arbitrer entre trois listes qui se répondent — le défaut de structure du
   * 15/09 sur le matériel, reconstruit à l'échelle de la page.
   */
  children?: React.ReactNode;
}

export default function AvisSurLeDevis({
  conclusion,
  provisoire = false,
  comparableCount,
  totalCount,
  portee = null,
  pointsOk = [],
  entrepriseName = null,
  totalHt = null,
  criticalReasons = [],
  pointsAttention = [],
  ancienneteAnnees = null,
  alertes = [],
  children,
}: AvisSurLeDevisProps) {
  // ── Cas de bypass : le devis n'est pas comparable ──────────────────────
  if (conclusion.foreign_quote) {
    return (
      <HeroCard tone="amber">
        <Title>Ce document est un devis étranger.</Title>
        <Body>
          Notre lecture s'appuie sur les tarifs et la réglementation français ;
          elle n'est donc pas transposable à un devis émis en {conclusion.foreign_quote.country_label}.
          Nous vous recommandons de demander une deuxième proposition à un professionnel local pour comparer.
        </Body>
      </HeroCard>
    );
  }

  if (conclusion.estimation_courtier) {
    const nom = conclusion.estimation_courtier.courtier_nom;
    return (
      <HeroCard tone="amber">
        <Title>Ce document n'est pas un devis d'artisan.</Title>
        <Body>
          Il s'agit d'une estimation {nom ? `émise par ${nom}` : "de courtier travaux"}, pas d'un devis signé par un professionnel.
          Le vrai devis sera établi plus tard par l'artisan retenu.
          Une fois ce devis reçu, revenez ici pour une lecture complète.
        </Body>
      </HeroCard>
    );
  }

  if (conclusion.incomplete_quote) {
    return (
      <HeroCard tone="amber">
        <Title>Ce devis est trop synthétique pour être relu poste par poste.</Title>
        <Body>
          Il indique les sous-totaux par corps de métier mais pas les quantités ni les prix unitaires.
          Demandez à votre artisan un devis détaillé, avec les surfaces (m², ml) et le prix par unité pour chaque prestation. Vous pourrez alors nous le soumettre à nouveau.
        </Body>
      </HeroCard>
    );
  }

  if (conclusion.hors_scope) {
    return (
      <HeroCard tone="amber">
        <Title>Ce document n'est pas un devis de travaux du bâtiment.</Title>
        <Body>
          Nous sommes spécialisés dans la relecture de devis de chantier (maçonnerie, électricité, plomberie, rénovation…). Pour ce type de document, mieux vaut nous en soumettre un autre.
        </Body>
      </HeroCard>
    );
  }

  if (conclusion.prestation_intellectuelle) {
    const metier = conclusion.prestation_intellectuelle.metier;
    return (
      <HeroCard tone="calm">
        <Title>Il s'agit d'une prestation intellectuelle réglementée.</Title>
        <Body>
          Les honoraires d'un(e) {metier} suivent des règles propres à sa profession (barème, ordre, statut).
          Les conditions de paiement inhabituelles pour un chantier classique (acompte élevé, par exemple) sont ici la norme du métier.
        </Body>
      </HeroCard>
    );
  }

  // ── Hard block prioritaire (entreprise radiée, IBAN suspect, etc.) ─────
  // 🔴 2026-09-23 — SAUF SI UN EXPERT A RELU ET TRANCHÉ AUTREMENT. La règle
  // vit dans `decisionAffichee`, elle est IMPORTÉE et jamais recopiée : une
  // condition locale ferait re-diverger le bandeau et la décision au premier
  // ajustement (l'incident du 13/05).
  const motifsRetenus = motifsBloquants(conclusion, criticalReasons);
  if (motifsRetenus.length > 0) {
    return (
      <HeroCard tone="alert">
        <Title>Nous vous invitons à ne pas signer sans clarification.</Title>
        <Body>
          <ul className="mt-1 space-y-1.5 list-none pl-0">
            {motifsRetenus.slice(0, 3).map((r, i) => (
              <li key={i} className="flex gap-2 text-[15px] leading-relaxed">
                <span aria-hidden="true" className="text-rose-900/60">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Body>
        {/* 🟢 2026-09-22 — TOUT SURVIT AU HARD BLOCK : LEVIERS **ET** POINTS
            D'ATTENTION.
            Le retour anticipé avalait tout ce qui suit — le lecteur le plus
            exposé était le seul à ne rien recevoir.
            🔴 J'avais d'abord gardé les leviers et écarté les points
            d'attention, au motif que le fait bloquant devait occuper seul
            l'attention. **La mesure a réfuté cet argument, qui était
            esthétique** : sur les 26 analyses du stock qui passent ici,
            **25 perdaient au moins un point d'attention** — et ce sont les
            plus actionnables de la page (« Refusez catégoriquement de verser
            un acompte de 84 % à la signature », « Exigez une révision des
            conditions de paiement »). Sur un devis d'entreprise radiée à 84 %
            d'acompte, c'est L'information utile. */}
        {pointsAttention.length > 0 && (
          <div className="mt-6 border-t border-foreground/10 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/45">
              À vérifier avant de signer
            </p>
            <ul className="mt-1.5 space-y-1">
              {pointsAttention.map((p, i) => (
                <li key={i} className="flex items-baseline gap-1.5 text-[14px] leading-relaxed text-foreground/75">
                  <span aria-hidden="true" className="text-amber-600">▸</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {children}
      </HeroCard>
    );
  }

  // ── Cas standards ──────────────────────────────────────────────────────
  const decision = decisionAffichee(conclusion, portee, criticalReasons, alertes, ancienneteAnnees);
  const tone: Tone = decision.ton;
  const isSigner = decision.decision === "signer";
  const isNegocier = decision.decision === "negocier";
  const isRefuser = decision.decision === "ne_pas_signer";

  /**
   * 🔴 2026-09-23 (retour Johan) — ON NE PROPOSE PAS DE NÉGOCIER CE QU'ON
   * REFUSE.
   *
   * « Marge de négociation estimée : environ 390 € » sous « Ne signez pas en
   * l'état » suppose qu'on va contracter, alors que la carte vient de dire
   * l'inverse. Mesuré sur le rendu des 200 cartes : **9 des 48 refus**
   * affichaient ce libellé, toutes avec un montant en euros.
   *
   * ⚠️ ON REFORMULE, ON NE MASQUE PAS. Sur ces 9 cartes le titre ne porte
   * aucun chiffre (c'est un refus) : masquer ferait disparaître le montant de
   * la page. C'est la perte que le banc du 23/09 a déjà attrapée une fois —
   * un correctif de wording qui supprime une information est pire que le
   * défaut qu'il corrige. Le fait reste dit, le mot cesse de présumer l'action.
   *
   * ⚠️ UN SEUL LIBELLÉ POUR LES DEUX SITES D'APPEL. Ils se sont dédoublés le
   * 23/09 (le dédoublonnage du message d'expert a créé le second) : les
   * laisser composer chacun leur phrase les ferait diverger au premier
   * ajustement.
   */
  const libelleMontant = (marge: string) =>
    isRefuser
      ? `Écart estimé sur les prix : ${marge}.`
      : `Marge de négociation estimée : ${marge}.`;
  const title = titreDecision(decision, provisoire);
  const titreChiffre = !provisoire && decision.montantANegocier !== null && isNegocier;

  /**
   * Identité du devis — qui, combien. Une ligne discrète sous le titre.
   *
   * ⚠️ DÉCLARÉ AVANT `bodyText`, ET CE N'EST PAS UN DÉTAIL DE STYLE. `bodyText`
   * le lit pour couper le montant en doublon ; placé après, il produisait un
   * `ReferenceError: Cannot access 'sousTitre' before initialization` — le
   * piège de zone morte temporelle, quatrième occurrence dans ce projet.
   * ⚠️ Les 601 tests unitaires ne l'ont PAS vu : c'est l'aperçu qui rend
   * réellement le composant (`scripts/preview-hero-analyse.mts`) qui l'a
   * attrapé. Seule la page montre ce genre de défaut.
   */
  const sousTitre =
    [
      entrepriseName?.trim() || null,
      typeof totalHt === "number" && totalHt > 0
        ? `${Math.round(totalHt).toLocaleString("fr-FR")} € HT`
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;

  // Phrase explicative (une, courte)
  // 🟢 2026-08-29 (retour Johan, devis 25030) — quand un expert corrige une
  // analyse, il RETIRE ce qui était faux ; sans ce bloc, la page ne gagnait
  // rien en échange et affichait « négociable » sans le moindre argument. Le
  // message de l'expert porte désormais la substance : ce qu'il a vu, et
  // pourquoi son verdict tient. Texte écrit par un humain (jamais du LLM
  // brut), distinct des notes internes de l'écran de revue.
  //
  // ⚠️ REMONTÉ AVANT `bodyText` LE 2026-09-23, ET C'EST UNE NÉCESSITÉ, PAS UN
  // RANGEMENT : le corps doit savoir si l'expert parle pour ne pas le répéter.
  // Le laisser plus bas donnerait une zone morte temporelle — le piège que ce
  // projet a déjà payé quatre fois, et que Vite rend illisible en production.
  const expertMessage =
    typeof (conclusion as { expert_message?: unknown }).expert_message === "string"
      ? ((conclusion as { expert_message?: string }).expert_message ?? "").trim()
      : "";

  /** Normalise pour comparer deux textes sans buter sur les espaces et la casse. */
  const aplati = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

  const bodyText = (() => {
    // 2026-08-30 — en attente de validation experte, on ne CHIFFRE pas. La
    // structure du verdict (montant du devis + motif) est conservée, mais la
    // partie chiffrée de l'écart est remplacée par une phrase d'attente : le
    // client doit pouvoir lire son analyse sans partir négocier sur un montant
    // que l'expert n'a pas encore confirmé.
    const vl = conclusion.verdict_ligne;
    if (provisoire) {
      const montant = typeof vl?.resume === "string" && vl.resume.includes(" — ")
        ? vl.resume.split(" — ")[0]
        : null;
      const attente = "l'écart de prix est en cours de vérification par notre expert : nous préférons ne pas avancer de montant tant qu'il n'est pas confirmé.";
      return montant ? `${montant} — ${attente}` : attente.charAt(0).toUpperCase() + attente.slice(1);
    }
    // 🔴 2026-09-22 — QUAND RIEN N'EST CONSTATÉ, ON NE REPREND PAS `vl.resume`.
    // `leviersBuilder` y écrit « quelques prestations méritent une
    // clarification avec l'artisan avant signature » (branche « décision
    // non-signer sans signal dominant identifié ») : c'est ce texte qui
    // laissait croire qu'il y avait quelque chose à demander, alors que le bloc
    // suivant annonçait « rien de significatif à négocier ». Quand nous n'avons
    // rien trouvé, le titre suffit : le corps dit ce que nous AVONS vérifié.
    if (isSigner) return null;
    if (vl?.resume) {
      // ⚠️ DEUX DOUBLONS À COUPER ICI, et les deux se voyaient à l'écran.
      //
      // 1. `vl.resume` commence par « 10 746 € HT — … ». Depuis que le
      //    sous-titre porte ce montant, le laisser le fait lire deux fois à
      //    trois centimètres d'intervalle.
      // 2. Si le TITRE porte le montant à négocier, « Marge de négociation
      //    estimée : environ 1 062 € » le répète une troisième fois — et deux
      //    occurrences du même chiffre se lisent comme deux faits distincts.
      // 3. 🔴 2026-09-23 — LA PARENTHÈSE D'ÉCART, TROISIÈME PORTE DU MÊME
      //    DÉFAUT. Mesuré sur le HTML RENDU de 200 cartes : **9 des 23 dont le
      //    titre chiffre (39 %)** rouvraient un montant juste en dessous —
      //    « Environ 12 300 € à discuter » puis « (environ 12 300 € d'écart sur
      //    ces lignes) », ou pire « Environ 2 017 € » suivi de « (1 412–2 622 €
      //    d'écart estimé) » : trois nombres pour un seul fait.
      //    ⚠️ Le dédoublonnage du 22/09 coupait la MARGE, jamais cette
      //    parenthèse ; et le script de réparation du même jour visait le
      //    `motif`, avec un motif ancré sur « environ … € d'écart » qui ne
      //    reconnaît pas la forme fourchette du stock ancien. On corrige donc à
      //    l'AFFICHAGE : le correctif vaut pour toutes les analyses d'un coup,
      //    y compris les conclusions `corrected` qu'on n'écrase jamais.
      const sansEcart = titreChiffre
        ? vl.resume.replace(ECART_ENTRE_PARENTHESES, "")
        : vl.resume;
      const resume = sousTitre
        ? sansEcart.replace(/^\s*[\d\s  .,]+€\s*(?:HT|TTC)?\s*—\s*/i, "")
        : sansEcart;
      const phrase = resume.charAt(0).toUpperCase() + resume.slice(1);
      // 🔴 2026-09-23 — ET SI CE RÉSUMÉ EST DÉJÀ LE DÉBUT DU MESSAGE DE
      // L'EXPERT, ON SE TAIT : l'encadré le porte en entier trois lignes plus
      // bas. `resyncVerdictLigne` (05/09) reprend la première phrase de
      // l'expert comme motif — c'est légitime — mais depuis la fusion du 22/09
      // les deux blocs cohabitent sur la même carte. Mesuré sur le HTML rendu :
      // **15 cartes affichaient le message de l'expert DEUX FOIS**, la première
      // occurrence tronquée au milieu d'une phrase.
      // 🔴 MAIS ON NE JETTE PAS LA MARGE AVEC LE DOUBLON, ET C'EST LE BANC DE
      // PERTE QUI L'A VU, PAS LA RELECTURE. Ma première version retournait
      // `null` sec : sur ATARAXIA (« Ne signez pas en l'état », titre sans
      // montant) la carte perdait « Marge de négociation estimée : environ
      // 390 € », et sur SAS E.P.H. « environ 3 549 à 6 591 € ». Le montant
      // disparaissait de la page — exactement ce qu'un correctif de doublon ne
      // doit pas faire. On garde donc la marge seule quand le titre ne la
      // porte pas déjà.
      if (expertMessage && aplati(expertMessage).startsWith(aplati(phrase).replace(/\.$/, ""))) {
        return vl.marge && !titreChiffre ? libelleMontant(vl.marge) : null;
      }
      return vl.marge && !titreChiffre ? `${phrase} ${libelleMontant(vl.marge)}` : phrase;
    }
    const base = (conclusion.phrase_intro || "").trim();
    if (isNegocier) {
      return base || "Le détail des points à discuter est juste en dessous.";
    }
    if (isRefuser) {
      return base || "Plusieurs points nous interpellent et méritent une clarification avant tout engagement.";
    }
    return base;
  })();

  // 🔴 2026-09-22 (retour Johan) — « LES AUTRES RECHERCHES DOIVENT ÊTRE
  // VALORISÉES ». Mesuré sur 30 jours : les devis dont nous ne savons pas
  // comparer les prix portent **14 points vérifiés en médiane** — parfois 45 —
  // et l'ancienne page n'en montrait aucun en tête. Elle titrait sur ce que
  // nous ne savions pas, en taisant tout ce que nous avions établi.
  //
  // ⚠️ `pointsVerifies` est IMPORTÉE, jamais recopiée : elle porte des gardes
  // chèrement acquises (pas d'assurance seulement mentionnée — 20/08 ; pas de
  // réputation sous dix avis — 06/09 ; pas d'entreprise de moins de trois ans
  // présentée comme établie).
  // 🔴 2026-09-23 — L'ANCIENNETÉ EN TÊTE DES POINTS VÉRIFIÉS.
  // Elle n'existe dans AUCUN `points_ok` (vérifié sur le stock) : elle vient
  // de `verified.anciennete_annees` et doit être composée ici. Placée en
  // premier parce que c'est le fait le plus rassurant qu'on puisse établir
  // sur une entreprise — et celui qu'un particulier cherche en premier.
  // 🟢 2026-09-23 (validé Johan) — CHAQUE FAIT PORTE SON POIDS.
  // L'ancienneté est toujours VERTE ici : `decisionAffichee` ne la renseigne
  // qu'à partir de cinq ans (seuil du 23/09 — présenter « 2 ans » comme un
  // argument serait de la réassurance fabriquée).
  const verifies: PointVerifie[] = [
    ...(decision.ancienneteAnnees !== null
      ? [{ libelle: `Établie depuis ${decision.ancienneteAnnees} ans`, ton: "vert" as const }]
      : []),
    ...pointsVerifiesDetail(pointsOk, 3),
  ].slice(0, 4);

  // 🔴 2026-09-22 (retour Johan) — LE « X SUR Y » NE S'AFFICHE PLUS.
  //
  // *« Si le devis comporte 50 lignes et que nous en avons comparé 37,
  // l'utilisateur n'a pas besoin de le savoir. »* C'est notre mécanique, pas sa
  // décision — exactement le défaut du 13/09, où le message décrivait notre
  // fonctionnement en prétendant décrire le devis.
  //
  // Reste le FAIT qui le concerne : nous ne nous prononçons pas sur ses prix.
  // Une ligne, avec le renvoi vers l'endroit où il peut le vérifier.
  //
  // ⚠️ Jamais en rouge : sur un devis où l'entreprise pose problème, le prix
  // n'est pas la question.
  const reservePrix = !decision.prixVerifies && !isRefuser;

  /**
   * 🔴 2026-09-22 (retour Johan, devis SMPAC) — UNE RÉSERVE NE PEUT PAS NIER
   * LE CHIFFRE QU'ON VIENT D'AFFICHER.
   *
   * La carte annonçait « Marge de négociation estimée : environ 2 223 € » puis,
   * quatre lignes plus bas, « nous ne nous prononçons pas sur les prix ». Si on
   * chiffre un écart sur des postes nommés, on SE PRONONCE — sur ces postes-là.
   * La réserve ne vaut que pour LE RESTE.
   *
   * 🔴 ET C'EST MOI QUI AI CRÉÉ CE DÉFAUT LA VEILLE. La réserve existait depuis
   * le 10/09 mais ne s'affichait qu'en dessous de 5 % de portée — jamais sur un
   * devis chiffré. En la branchant sur `prixVerifies` (seuil 50 %), je l'ai
   * fait apparaître sur des cartes qui annoncent un montant : **24 des 43
   * analyses chiffrées du stock, soit 56 %**, se contredisaient ainsi.
   *
   * ⚠️ On ne SUPPRIME pas la réserve : elle reste vraie et utile. On la
   * restreint à ce qu'elle décrit — et sans citer de ratio, le « X sur Y »
   * ayant été retiré le 22/09 pour de bonnes raisons.
   */
  /**
   * ⚠️ ON TESTE LE TEXTE RÉELLEMENT AFFICHÉ, PAS UNE DONNÉE DÉRIVÉE.
   *
   * Ma première version lisait `decision.montantANegocier`, qui exige un poste
   * nommé ET un écart ≥ 300 €. Mesuré : elle ratait 10 cartes sur 43 — les
   * marges du stock ancien (« environ 420 € »), et surtout les POURCENTAGES
   * (« 3 à 5 % (révision tarifaire) »), qui s'affichaient à côté de « nous ne
   * nous prononçons pas sur les prix » sur un devis à 0 % de portée.
   *
   * ⚠️ ET LE MONTANT EST DANS LE TITRE, PAS DANS LE CORPS. Depuis la refonte
   * du 22/09, `titreDecision` porte le chiffre (« Environ 2 223 € à discuter
   * avec l'artisan ») et le corps ne fait plus que nommer le motif. Tester le
   * seul `bodyText` ne voyait donc rien — trouvé en regardant le HTML rendu,
   * pas en relisant le code.
   */
  const chiffreAffiche = /\d[\d\s  ]*\s*(€|%)/.test(`${title} ${bodyText ?? ""}`);

  /**
   * 🟢 2026-09-23 (validé Johan) — LA RUBRIQUE SE RETOURNE QUAND NOUS AVONS
   * VRAIMENT COMPARÉ QUELQUE CHOSE.
   *
   * *« Comment gérer quand on vérifie partiellement les prix ? Il faut donner
   * le maximum de ce qu'on peut donner, et transformer positivement cette
   * rubrique pour valoriser notre travail de vérification. »*
   *
   * Au-dessus du socle mesuré (3 postes nommables ET 20 % du montant, cf.
   * `porteeValorisable`), on dit d'abord ce qu'on a ÉTABLI — puis la réserve,
   * qui reste vraie et n'est jamais supprimée.
   *
   * ⚠️ LA RÈGLE ET LES POSTES VIENNENT DE `portee`, jamais recalculés ici : la
   * maquette du 23/09 les dérivait de son côté, et deux calculs pour une seule
   * question finissent toujours par diverger.
   */
  const valorisable = reservePrix && porteeValorisable(portee);

  return (
    <HeroCard tone={tone}>
      <Title>{title}</Title>
      {sousTitre && (
        <p className="mt-2 text-[14px] text-foreground/55">{sousTitre}</p>
      )}
      {/* 2026-09-22 — quand rien n'est constaté, le titre suffit : on ne
          meuble pas. Le bloc « Vérifié » dit ce que nous avons établi. */}
      {bodyText && <Body>{bodyText}</Body>}
      {expertMessage && (
        <div className="mt-5 rounded-lg border border-foreground/15 bg-background/60 p-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-foreground/60">
            Vérifié par un expert VerifierMonDevis
          </p>
          <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-foreground/80">
            {expertMessage}
          </p>
        </div>
      )}
      {(verifies.length > 0 || reservePrix || pointsAttention.length > 0) && (
        <div className="mt-6 border-t border-foreground/10 pt-4 space-y-3">
          {verifies.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/45">
                Ce que nous avons vérifié
              </p>
              {/* ⚠️ Le préfixe « L'entreprise est » n'est PAS répété à chaque
                  puce : sur trois points il occupait la moitié de la ligne et
                  noyait le fait. Les fragments de `simplifyPointOk` sont conçus
                  pour suivre ce préfixe — on le supprime en capitalisant.

                  🟢 2026-09-23 — UNE LISTE VERTICALE, PLUS UNE GRILLE. Johan :
                  *« actuellement tout est englobé dans un cadre de couleur, je
                  verrais plutôt des bullet points avec une séparation entre le
                  positif et le négatif »*. En ligne, les faits se lisaient comme
                  une étiquette continue et la distinction vert/gris ne se voyait
                  pas — c'est précisément elle qui porte l'information ici. */}
              <ul className="mt-1.5 space-y-1">
                {verifies.map((v, i) => (
                  <li
                    key={i}
                    className={`flex items-baseline gap-2 text-[14px] leading-relaxed ${
                      v.ton === "vert" ? "text-foreground/80" : "text-foreground/60"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={v.ton === "vert" ? "font-bold text-emerald-600" : "text-foreground/35"}
                    >
                      {v.ton === "vert" ? "✓" : "•"}
                    </span>
                    <span>
                      {v.libelle.charAt(0).toUpperCase() + v.libelle.slice(1)}
                      {/* Le chiffre qui étaye, quand il existe. C'est la
                          doctrine du 06/09 : on donne la note et le nombre
                          d'avis, le lecteur juge — nous ne faisons que refuser
                          d'en tirer un argument quand elle est moyenne. */}
                      {v.detail && (
                        <span className="text-foreground/50"> — {v.detail}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* 🟡 2026-09-22 — CE QUI APPELLE UNE VÉRIFICATION, au même niveau
              que ce qui rassure. Jamais en rouge : ce ne sont pas des motifs
              de refus, ce sont des choses à demander avant de signer. */}
          {pointsAttention.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/45">
                À vérifier avant de signer
              </p>
              <ul className="mt-1.5 space-y-1">
                {pointsAttention.map((p, i) => (
                  <li key={i} className="flex items-baseline gap-1.5 text-[14px] leading-relaxed text-foreground/75">
                    <span aria-hidden="true" className="text-amber-600">▸</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* ⚪ 2026-09-23 (retour Johan) — TROISIÈME REGISTRE : CE QU'ON IGNORE.
              *« il faudrait que le verdict reprenne clairement les points forts
              en vert, et les points oranges à vérifier et en gris par exemple
              les éléments inconnus (les prix pour ce devis). »* La phrase
              existait depuis le 10/09 mais flottait sans étiquette, sous les
              deux listes : elle se lisait comme une note de bas de page. Elle
              prend le même gabarit que les deux autres — et reste GRISE, jamais
              ambre : ne pas savoir n'est pas une alerte sur le devis. C'est
              l'invariant du 22/09 (« la couleur ne porte que ce qu'on a
              TROUVÉ »), rendu lisible d'un coup d'œil. */}
          {valorisable && portee && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700/80">
                Ce que nous avons pu comparer
              </p>
              <ul className="mt-1.5 space-y-1">
                {/* ⚠️ `objetDeLigne` EST OBLIGATOIRE ICI, et c'est le rendu qui
                    l'a montré : les lignes de climatisation portent la fiche
                    produit entière (« MURAL DAIKIN PERFERA BLUEVOLUTION R32
                    FTXM20 Très haute performance énergétique A++ Unité… »).
                    Affichées brutes, elles transforment une phrase qui valorise
                    notre travail en mur de spécifications — le défaut exact
                    corrigé le 15/09, à un autre endroit de la page. */}
                {portee.postesCompares.slice(0, 3).map((p, i) => (
                  <li
                    key={i}
                    className="flex items-baseline gap-2 text-[14px] leading-relaxed text-foreground/80"
                  >
                    <span aria-hidden="true" className="font-bold text-emerald-600">✓</span>
                    <span>{objetDeLigne(p)}</span>
                  </li>
                ))}
                {portee.postesCompares.length > 3 && (
                  <li className="flex items-baseline gap-2 text-[14px] leading-relaxed text-foreground/60">
                    <span aria-hidden="true" className="font-bold text-emerald-600">✓</span>
                    <span>
                      et {portee.postesCompares.length - 3} autre
                      {portee.postesCompares.length - 3 > 1 ? "s" : ""} poste
                      {portee.postesCompares.length - 3 > 1 ? "s" : ""}
                    </span>
                  </li>
                )}
              </ul>
              {/* ⚠️ AUCUN RATIO — ni « 4 sur 9 », ni « 48 % ». Le 29/08 a mesuré
                  que le taux de couverture se lit comme un aveu de faiblesse ;
                  le 22/09 a retiré le « X sur Y » parce qu'il décrit notre
                  mécanique et non le devis. On donne les postes, et le MONTANT
                  COMPARÉ — un fait que le lecteur peut opposer.

                  🔴 MAIS JAMAIS QUAND LA CARTE CHIFFRE DÉJÀ UN ÉCART, et c'est
                  le filet du 23/09 qui l'a vu, pas la relecture : sur SMPAC la
                  carte affichait « Environ 2 223 € à discuter » puis « Soit
                  7 200 € confrontés à nos références » — deux nombres en euros
                  à quelques centimètres, le second PLUS GRAND que le premier.
                  Ils décrivent des choses différentes (un écart, une assiette),
                  mais c'est au lecteur qu'il reviendrait de le démêler.
                  ⚠️ La maquette validée le 23/09 les affichait tous les deux :
                  c'est une divergence assumée, pas un oubli. Sur une carte qui
                  chiffre, le montant actionnable est déjà là ; l'assiette
                  comparée parle de NOTRE travail, et le 22/09 a tranché que
                  notre mécanique ne prend pas cette place. Les postes nommés
                  restent — c'est eux, la valorisation. */}
              <p className="mt-2 text-[14px] leading-relaxed text-foreground/65">
                {portee.montantCompare !== null && !chiffreAffiche && (
                  <>
                    Soit{" "}
                    <strong className="font-semibold text-foreground/80">
                      {Math.round(portee.montantCompare).toLocaleString("fr-FR")} €
                    </strong>{" "}
                    de votre devis confrontés à nos références.{" "}
                  </>
                )}
                Sur les autres postes, nous n'avons pas de tarif à opposer — nous ne
                nous prononçons pas.{" "}
                <a
                  href="#detail-postes"
                  className="whitespace-nowrap font-medium text-foreground/75 underline decoration-foreground/25 underline-offset-2 hover:text-foreground hover:decoration-foreground/50"
                >
                  Voir le détail ↓
                </a>
              </p>
            </div>
          )}
          {reservePrix && !valorisable && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/45">
                Ce que nous ne savons pas
              </p>
              <p className="mt-1.5 flex items-baseline gap-2 text-[14px] leading-relaxed text-foreground/60">
                <span aria-hidden="true" className="text-foreground/35">○</span>
                <span>
                  {chiffreAffiche
                    ? "Ce montant porte sur les postes que nous avons pu comparer. Pour les autres, nous n'avons pas de tarif de référence à opposer."
                    : "Nos références ne couvrent pas vos prestations : nous ne nous prononçons pas sur les prix."}{" "}
                  <a
                    href="#detail-postes"
                    className="whitespace-nowrap font-medium text-foreground/75 underline decoration-foreground/25 underline-offset-2 hover:text-foreground hover:decoration-foreground/50"
                  >
                    Voir le détail ↓
                  </a>
                </span>
              </p>
            </div>
          )}
        </div>
      )}
      {children}
    </HeroCard>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SOUS-COMPOSANTS DE PRÉSENTATION
// ═══════════════════════════════════════════════════════════════════

function HeroCard({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const style = TONE_STYLES[tone];
  return (
    <section
      aria-label="Notre lecture du devis"
      className={`rounded-2xl border ${style.container} px-6 py-7 md:px-8 md:py-9`}
    >
      {children}
    </section>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-2xl md:text-[28px] font-semibold tracking-tight text-foreground leading-tight">
      {children}
    </h2>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 text-[16px] md:text-[17px] leading-relaxed text-foreground/80">
      {children}
    </div>
  );
}
