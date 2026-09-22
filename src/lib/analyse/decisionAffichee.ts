/**
 * src/lib/analyse/decisionAffichee.ts
 *
 * LA DÉCISION QU'ON MONTRE À L'UTILISATEUR — une seule règle, tous les écrans.
 *
 * 🔴 2026-09-22 (retour Johan) — *« l'utilisateur veut juste se dire : ok je
 * signe, ou ok je dois négocier et voici les postes qui peuvent faire l'objet
 * de discussion avec l'artisan. »*
 *
 * Ce module ne touche PAS au moteur. `verdict_global` et `verdict_decisionnel`
 * restent ce que `conclusion.ts` a calculé, et restent tels quels en base :
 * l'écran de revue, les KPI admin et les bancs continuent de lire le verdict du
 * moteur. Ici on répond à une autre question — **que doit faire le lecteur ?**
 *
 * ── CE QUE LA MESURE A IMPOSÉ ───────────────────────────────────────────────
 *
 * Sur 30 jours (66 documents dédupliqués), l'ancien mapping donnait :
 * **1 seul vert**, 34 oranges, 15 gris, 15 rouges. Le produit disait
 * « attention » sur 97 % des devis — un outil qui alerte toujours n'aide plus
 * à décider.
 *
 * Deux causes, mesurées :
 *
 *  1. **LE PRIX PILOTAIT TOUT.** La couleur dépendait de la couverture prix ;
 *     comme elle est rarement suffisante, presque rien ne pouvait être vert —
 *     alors que ces mêmes devis portaient **14 points vérifiés en médiane**
 *     (entreprise, clauses, conditions de paiement), parfois 45.
 *
 *  2. **DES CONSEILS UNIVERSELS COLORAIENT EN ALERTE.** `retenue_garantie`
 *     déclenchait 21 des 34 oranges et `dommages_ouvrage` 5 — or ce sont des
 *     bonnes pratiques de TOUT chantier, pas des constats sur CE devis. Un
 *     devis avec 45 points vérifiés et zéro anomalie sortait en orange parce
 *     qu'on lui recommandait une retenue de garantie.
 *
 * ⚠️ CES CONSEILS NE DISPARAISSENT PAS : ils restent affichés par
 * `LeviersNegociation`. Ils cessent seulement de colorer la page en alerte.
 */

import type { ConclusionData } from "@/lib/analyse/conclusionTypes";
import { porteeSuffisantePourAffirmer, type Portee } from "@/lib/analyse/porteeAnalyse";

/** Ce que le lecteur doit faire. Trois réponses, pas quatre. */
export type Decision = "signer" | "negocier" | "ne_pas_signer";

export type TonDecision = "calm" | "amber" | "alert";

export interface DecisionAffichee {
  decision: Decision;
  ton: TonDecision;
  /**
   * Avons-nous pu nous prononcer sur les PRIX ?
   *
   * ⚠️ Ne change JAMAIS la décision ni la couleur — seulement le titre. Un
   * devis où nous n'avons rien trouvé reste « rien ne s'oppose à la
   * signature » ; nous disons simplement que le prix n'en fait pas partie.
   * Faire varier la couleur là-dessus, c'est transformer un doute sur NOUS en
   * doute sur LE DEVIS : c'est le gris qu'on a essayé le 22/09 au matin, et
   * qui aurait affiché une couleur sans décision sur 23 devis sur 66.
   */
  prixVerifies: boolean;
  /** Nombre de constats nommables — sert au titre « N points à sécuriser ». */
  constats: number;
  /** Un montant chiffré et rattaché à des postes nommés. */
  montantANegocier: number | null;
  /**
   * Ancienneté de l'entreprise si elle dépasse 5 ans, pour nommer le point
   * fort dans le titre. `null` sinon — une entreprise de deux ans n'est pas
   * un argument, et la présenter comme tel serait le contraire de la garde
   * du 06/09 sur les réputations trop minces.
   */
  ancienneteAnnees: number | null;
}

/**
 * Leviers qui ne constatent RIEN sur ce devis précis.
 *
 * `references` et `second_avis` sont des replis (« jamais de fiche vide »,
 * « nous n'avons pas su comparer »). `retenue_garantie` et `dommages_ouvrage`
 * sont des bonnes pratiques universelles : la première vaut pour tout chantier,
 * la seconde est une obligation du MAÎTRE D'OUVRAGE (art. L242-1) — ni l'une ni
 * l'autre ne dit quoi que ce soit sur la qualité du devis qu'on lit.
 *
 * ⚠️ `dommages_ouvrage_verification` N'EST PAS dans cette liste, et c'est
 * délibéré : là, une DO est FACTURÉE au devis et il faut en réclamer
 * l'attestation. C'est un fait du document, donc un constat.
 */
export const LEVIERS_SANS_CONSTAT = new Set([
  "references",
  "second_avis",
  "retenue_garantie",
  "dommages_ouvrage",
]);

/** Les leviers qui constatent quelque chose sur CE devis. */
export function leviersDeConstat(conclusion: ConclusionData) {
  return (conclusion.leviers ?? []).filter(
    (l) => !LEVIERS_SANS_CONSTAT.has(String((l as { type?: string }).type ?? "")),
  );
}

/**
 * 🔴 2026-09-23 (retour Johan, devis JeanBERNARD) — UNE ALERTE QUI DIT QUELQUE
 * CHOSE SUR L'ENTREPRISE EST UN CONSTAT.
 *
 * La carte titrait « Rien ne s'oppose à la signature » et listait, quatre
 * lignes plus bas, « À VÉRIFIER AVANT DE SIGNER : note Google 3,6/5 sur
 * 140 avis ». Si rien ne s'oppose, pourquoi deux points à vérifier ? La
 * décision ne regardait que les LEVIERS ; une note mesurée sur 140 avis ne
 * pesait rien.
 *
 * ⚠️ SEULES LES ALERTES **SPÉCIFIQUES** COMPTENT. « Demandez l'attestation
 * d'assurance » est un rappel qu'on adresse à tout le monde : le faire peser
 * rendrait chaque devis orange, et une couleur qui s'allume toujours ne dit
 * plus rien. Même distinction que `LEVIERS_SANS_CONSTAT`.
 *
 * Mesuré sur 138 analyses : **5 des 44 vertes** basculent, toutes légitimes
 * (3,6/5 sur 140 avis, 3,3/5 sur 642 avis, entreprise de 0 an).
 */
export const ALERTE_SPECIFIQUE =
  /note\s+google[^.]*?\d[.,]\d\s*\/\s*5|comptes?\s+non\s+(accessibles?|publi|d[ée]pos)|radi[ée]|liquidation|cessation|redressement|d[ée]cennale\s+(partielle|incertaine)|acompte\s+cumul|SIRET\s+(invalide|introuvable)|entreprise\s+(r[ée]cente|de moins de)/i;

/** Les alertes qui disent quelque chose sur CETTE entreprise. */
export function alertesDeConstat(alertes: string[]): string[] {
  return alertes.filter((a) => ALERTE_SPECIFIQUE.test(a));
}

/**
 * 🔴 2026-09-23 — QUAND UN EXPERT A RELU ET TRANCHÉ, SA DÉCISION PRIME SUR LES
 * CRITÈRES DU MOTEUR.
 *
 * `decide.ts` n'écrit QUE `review_status`, `review_notes`, `reviewed_at`,
 * `reviewed_by` et `conclusion_ia` — **jamais `score` ni `raw_text.scoring`**
 * (vérifié dans le code). Les `criteres_rouges` survivent donc intacts à toute
 * correction, et comme ils déclenchent un hard block prioritaire, ils écrasent
 * le verdict que l'expert vient de poser.
 *
 * Cas mesuré : sur le **devis SOLTANI**, l'expert a mis `verdict_decisionnel =
 * "signer"` et écrit « prix cohérents… particulièrement compétitif » — et la
 * page titrait **« Nous vous invitons à ne pas signer sans clarification »**.
 * Son critère rouge « acompte cumulé 80 % » est un artefact PÉRIMÉ, contredit
 * par les alertes du même scoring (« Acompte modéré (40 %) ») et par la règle
 * du 03/09 : 40 % à la livraison du matériel est une contrepartie réelle.
 *
 * ⚠️ RIEN N'EST PERDU EN SE TAISANT : sur ce devis l'acompte reste porté par
 * le levier `acompte_livraison` (« Exigez la preuve de livraison avant de
 * verser les 40 % ») et les comptes opaques par les alertes. Vérifié avant
 * livraison, pas supposé.
 *
 * ⚠️ ET LA GARDE EST ÉTROITE, DÉLIBÉRÉMENT. Il faut **un message d'expert**
 * (écrit uniquement par l'écran de revue, donc preuve d'une relecture humaine)
 * ET **un verdict qui n'est pas un refus**. Un expert qui maintient
 * « ne pas signer » garde son hard block, et les **32 analyses à critère rouge
 * sans correction experte** ne sont pas touchées. Sur le stock : 1 seule carte
 * change.
 */
export function expertAValideMalgreLesCriteres(conclusion: ConclusionData): boolean {
  const message = typeof (conclusion as { expert_message?: unknown }).expert_message === "string"
    ? ((conclusion as { expert_message?: string }).expert_message ?? "").trim()
    : "";
  return message.length > 0 && conclusion.verdict_decisionnel !== "ne_pas_signer";
}

/**
 * Les motifs qui bloquent RÉELLEMENT la signature, une fois la décision de
 * l'expert prise en compte.
 *
 * ⚠️ IMPORTÉE PAR `AvisSurLeDevis` POUR SON HARD BLOCK D'AFFICHAGE, jamais
 * recopiée : si le composant gardait sa propre condition, le bandeau et la
 * décision re-divergeraient au premier ajustement — l'incident du 13/05.
 */
export function motifsBloquants(
  conclusion: ConclusionData,
  criticalReasons: string[],
): string[] {
  return expertAValideMalgreLesCriteres(conclusion) ? [] : criticalReasons;
}

/**
 * @param criticalReasons Les `criteres_rouges` du scoring. Ils priment sur
 *        tout : une entreprise en liquidation ne devient pas verte parce que
 *        ses prix sont corrects. **Sauf si un expert a relu et tranché
 *        autrement** — cf. `motifsBloquants`.
 * @param alertes Les alertes du scoring. Seules les spécifiques comptent.
 * @param ancienneteAnnees Âge de l'entreprise, pour nommer le point fort dans
 *        le titre. Le produit le SAIT et ne le disait nulle part : mesuré,
 *        23 des 44 analyses vertes concernent une entreprise de 5 ans ou plus
 *        et **aucune** ne l'affichait.
 */
export function decisionAffichee(
  conclusion: ConclusionData,
  portee: Portee | null,
  criticalReasons: string[] = [],
  alertes: string[] = [],
  ancienneteAnnees: number | null = null,
): DecisionAffichee {
  const constats = leviersDeConstat(conclusion);
  const alertesConstat = alertesDeConstat(alertes);
  const surcout = conclusion.surcout_global;
  const aUnPosteNomme = (conclusion.anomalies?.length ?? 0) > 0;
  const montant =
    aUnPosteNomme && surcout && surcout.max >= 300 ? Math.round((surcout.min + surcout.max) / 2) : null;

  const base = {
    prixVerifies: porteeSuffisantePourAffirmer(portee),
    constats: constats.length + alertesConstat.length,
    montantANegocier: montant,
    // Un point fort NOMMÉ vaut mieux qu'une couleur : « Entreprise établie
    // depuis 25 ans » se vérifie, « rien ne s'oppose » ne se vérifie pas.
    ancienneteAnnees: typeof ancienneteAnnees === "number" && ancienneteAnnees >= 5 ? ancienneteAnnees : null,
  };

  // 1. Un fait bloquant prime sur tout le reste — sauf si un expert l'a levé.
  if (motifsBloquants(conclusion, criticalReasons).length > 0 || conclusion.verdict_decisionnel === "ne_pas_signer") {
    return { decision: "ne_pas_signer", ton: "alert", ...base };
  }

  // 2. Avons-nous CONSTATÉ quelque chose sur ce devis ?
  const aConstate =
    aUnPosteNomme ||
    Boolean(conclusion.verdict_ligne?.marge) ||
    constats.length > 0 ||
    alertesConstat.length > 0;
  if (aConstate) return { decision: "negocier", ton: "amber", ...base };

  // 3. Rien trouvé → rien ne s'oppose. La portée nuance le TITRE, pas la couleur.
  return { decision: "signer", ton: "calm", ...base };
}

/**
 * Le titre — la seule phrase que beaucoup de lecteurs liront.
 *
 * ⚠️ AUCUN ARRONDI SUR LE MONTANT. Une première version affichait « Environ
 * 1 100 € » quand le détail sommait 726 + 336 = 1 062 € : deux chiffres pour un
 * seul fait. Depuis le retrait du coefficient ×1,3 (15/09), le montant EST la
 * somme des postes nommés — l'arrondir le décroche du détail, et le lecteur qui
 * additionne ne retombe plus sur le chiffre annoncé.
 *
 * @param provisoire Analyse en attente de validation experte : on ne chiffre
 *        pas (règle du 30/08).
 */
export function titreDecision(d: DecisionAffichee, provisoire = false): string {
  if (d.decision === "ne_pas_signer") return "Ne signez pas en l'état.";

  if (d.decision === "negocier") {
    if (!provisoire && d.montantANegocier !== null) {
      const euros = d.montantANegocier.toLocaleString("fr-FR");
      return `Environ ${euros} € à discuter avec l'artisan.`;
    }
    if (d.constats === 0) return "Un point à vérifier avant de signer.";
    /**
     * 🔴 2026-09-23 (retour Johan) — LE TITRE PORTE LE POINT FORT QUAND IL Y
     * EN A UN, ET IL EST NOMMÉ.
     *
     * « Deux points à sécuriser » ne dit que la réserve : le lecteur ignore
     * que l'artisan tient depuis 25 ans, alors que nous le savons. Et le
     * piège inverse est connu — « ce devis demande quelques clarifications »
     * est le titre creux retiré le 22/09 parce qu'il ne nomme rien.
     *
     * ⚠️ Un seuil à 5 ans, jamais moins : présenter « 2 ans » comme un
     * argument serait de la réassurance fabriquée.
     */
    const reserve = d.constats === 1 ? "un point à vérifier" : `${d.constats} points à vérifier`;
    if (d.ancienneteAnnees !== null) {
      return `Entreprise établie depuis ${d.ancienneteAnnees} ans, ${reserve}.`;
    }
    return d.constats === 1
      ? "Un point à sécuriser avant de signer."
      : `${d.constats} points à sécuriser avant de signer.`;
  }

  // 🔴 DEUX TITRES VERTS, ET LA NUANCE EST TOUT.
  // « Ce devis nous paraît cohérent » affirme sur le prix : réservé aux devis
  // dont nous avons comparé plus de la moitié du montant. Sinon « rien ne
  // s'oppose » — vrai, vérifiable, et qui n'affirme rien sur un prix que nous
  // n'avons pas su comparer. C'est l'invariant du 16/09 tenu par le titre.
  return d.prixVerifies
    ? "Ce devis nous paraît cohérent."
    : "Rien ne s'oppose à la signature.";
}
