/**
 * relectureVerdict.ts — LE DERNIER CONTRÔLE AVANT QUE L'UTILISATEUR LISE.
 *
 * 2026-09-15, demande Johan : « il faut mettre une relecture du verdict avant
 * de l'afficher ».
 *
 * Déclencheur : 19 analyses du stock annonçaient un écart supérieur à 40 % du
 * montant du devis, 8 un écart supérieur au devis entier — toutes en
 * `auto_approved`, donc lues par leurs utilisateurs sans qu'un humain les ait
 * vues. Le moteur savait calculer, il ne savait pas se relire.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 🔴 CE QUE CETTE PASSE EST, ET CE QU'ELLE N'EST PAS.
 *
 * Elle ne REJUGE pas le devis : elle vérifie que ce qu'on s'apprête à
 * afficher tient debout tout seul. Chaque règle porte sur une contradiction
 * qu'un lecteur attentif verrait — et que nous avons laissée passer au moins
 * une fois en production.
 *
 * Elle ne peut que RETIRER un chiffre ou baisser le ton, jamais accuser
 * davantage. Une relecture qui escalade fabriquerait des accusations que rien
 * n'a instruites ; et l'escalade légitime (garde de cohérence, critères
 * rouges, hard blocks) a déjà eu lieu en amont.
 *
 * ⚠️ ELLE N'EST PAS UN SEUIL DE POURCENTAGE, ET C'EST UNE MESURE QUI L'A
 * DÉCIDÉ. L'idée de départ — « au-delà de X % du devis, on se tait » — a été
 * mesurée sur le stock et **abandonnée** : une fois la garde de ratio par
 * poste en place (`RATIO_RAPPROCHEMENT_INVRAISEMBLABLE`), la queue de
 * distribution disparaît (part maximale 52 %, 9ᵉ décile 24 %), et un seuil à
 * 50 % n'effacerait plus qu'un seul devis — le seul écart RÉEL du haut du
 * classement (1 400 € pour 28 m² d'écran de sous-toiture, marché 6–16 €/m²).
 * Le seuil aurait protégé contre rien et fait taire une vraie surfacturation.
 * **Ne pas le réintroduire sans une nouvelle mesure.**
 * ──────────────────────────────────────────────────────────────────────────
 */

import type { PosteEcart } from "./surcoutServeur";

export interface EntreeRelecture {
  /** Identifiant stable de la règle — sert aux journaux et aux mesures. */
  regle: string;
  /** Ce qui a été constaté, en clair. */
  constat: string;
  /** Ce que la relecture a fait en conséquence. */
  action: string;
}

export interface EntreeVerdict {
  surcoutMin: number;
  surcoutMax: number;
  /** Les postes qui composent l'écart, tels qu'ils seront affichés. */
  postes: PosteEcart[];
  /** Noms des postes cités à l'utilisateur (`anomalies_postes`). */
  postesNommes: string[];
  /**
   * Somme des écarts que les anomalies NOMMÉES portent (`surcout_nomme`).
   * C'est ce montant, et non `surcoutMax`, que le verdict en une ligne cite.
   */
  surcoutNomme: number | null;
  /** Total HT du devis, quand on le connaît. */
  totalHT: number | null;
}

export interface SortieRelecture {
  surcoutMin: number;
  surcoutMax: number;
  /** Jamais supérieur à `surcoutMax` — voir R6. */
  surcoutNomme: number | null;
  postes: PosteEcart[];
  /**
   * La relecture EXIGE que la comparaison soit déclarée indicative. Ne dit
   * jamais l'inverse : elle ne peut pas lever un drapeau posé en amont.
   */
  exigeComparaisonIndicative: boolean;
  journal: EntreeRelecture[];
}

/**
 * Relit le verdict chiffré avant affichage. Déterministe, sans effet de bord.
 */
export function relireVerdict(e: EntreeVerdict): SortieRelecture {
  const journal: EntreeRelecture[] = [];
  let postes = [...e.postes];
  let min = e.surcoutMin;
  let max = e.surcoutMax;

  const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

  // ── R1 — UN ÉCART NE PEUT PAS ATTEINDRE LE DEVIS ENTIER ──────────────────
  // Si tout le devis, ou davantage, était du surcoût, la prestation serait
  // gratuite. Un tel montant ne décrit pas un artisan qui surfacture mais un
  // rapprochement faux. La garde par poste rend ce cas très rare : c'est un
  // filet de dernier recours, et il doit se déclencher sur zéro cas aujourd'hui.
  if (e.totalHT !== null && e.totalHT > 0 && max >= e.totalHT) {
    journal.push({
      regle: "ecart_superieur_au_devis",
      constat: `écart annoncé ${euros(max)} pour un devis de ${euros(e.totalHT)}`,
      action: "montant retiré et comparaison déclarée indicative",
    });
    return { surcoutMin: 0, surcoutMax: 0, surcoutNomme: null, postes: [], exigeComparaisonIndicative: true, journal };
  }

  // ── R2 — AUCUN MONTANT SANS POSTE NOMMÉ ──────────────────────────────────
  // Règle du 2026-08-30, reprise le 2026-09-05 après avoir mesuré que 22
  // analyses sur 69 annonçaient un montant qu'aucune ligne ne portait. Elle
  // était énoncée en quatre endroits du code ; elle est désormais vérifiée une
  // fois, sur le chiffre final.
  if (max > 0 && postes.length === 0 && e.postesNommes.length === 0) {
    journal.push({
      regle: "montant_sans_poste_nomme",
      constat: `${euros(max)} annoncés sans qu'aucun poste ne les porte`,
      action: "montant retiré",
    });
    return { surcoutMin: 0, surcoutMax: 0, surcoutNomme: null, postes: [], exigeComparaisonIndicative: false, journal };
  }

  // ── R3 — UN MONTANT NUL NE LAISSE PAS DE DÉTAIL DERRIÈRE LUI ─────────────
  // Sans cette règle, une analyse neutralisée en amont (bypass, rien de
  // comparable, attente de relecture experte) gardait une liste de postes
  // chiffrés sous un verdict qui n'annonce plus rien.
  //
  // ⚠️ ELLE PASSE AVANT R4, ET CE N'EST PAS UN DÉTAIL D'ORDRE. Placée après,
  // R4 voyait « total 0 € contre 800 € de détail » et recalait le total à
  // 800 € — la relecture RESSUSCITAIT un montant que le moteur avait
  // délibérément neutralisé. C'est l'inverse exact de sa raison d'être. Le
  // test « la relecture ne peut que retirer » verrouille ce sens.
  if (max <= 0 && postes.length > 0) {
    journal.push({
      regle: "detail_orphelin",
      constat: `${postes.length} poste(s) chiffré(s) sous un montant nul`,
      action: "détail retiré",
    });
    postes = [];
  }

  // ── R4 — LE MONTANT AFFICHÉ EST LA SOMME DU DÉTAIL ───────────────────────
  // C'est par cette règle que le coefficient ×1,3 se voyait : les postes
  // sommaient à la valeur brute, le montant affiché la dépassait de 30 %, et
  // le lecteur qui additionnait le détail ne retombait jamais sur le total.
  // ⚠️ Tolérance à l'euro : les postes sont arrondis un par un, le total sur
  // la somme — un écart de quelques centimes n'est pas une incohérence.
  if (postes.length > 0) {
    const sommeDetail = postes.reduce((s, p) => s + p.ecart, 0);
    const tolerance = Math.max(1, postes.length);
    if (max - sommeDetail > tolerance) {
      journal.push({
        regle: "montant_different_du_detail",
        constat: `montant affiché ${euros(max)} contre ${euros(sommeDetail)} de détail`,
        action: `montant recalé sur la somme des postes (${euros(sommeDetail)})`,
      });
      min = sommeDetail;
      max = sommeDetail;
    } else if (sommeDetail - max > tolerance) {
      // Le détail pèse plus lourd que le total annoncé : on ne peut afficher
      // ni l'un ni l'autre sans mentir, et on ne RELÈVE jamais le total.
      journal.push({
        regle: "detail_plus_lourd_que_le_total",
        constat: `${euros(sommeDetail)} de détail sous un total de ${euros(max)}`,
        action: "détail retiré, total conservé",
      });
      postes = [];
    }
  }

  // ── R5 — UNE FOURCHETTE DOIT ÊTRE ORDONNÉE ───────────────────────────────
  if (min > max) {
    journal.push({
      regle: "fourchette_inversee",
      constat: `borne basse ${euros(min)} au-dessus de la borne haute ${euros(max)}`,
      action: "bornes alignées sur la borne haute",
    });
    min = max;
  }

  // ── R6 — LE MONTANT CITÉ DANS LA PHRASE NE DÉPASSE PAS CELUI QU'ON AFFICHE ─
  // 🔴 Trouvée en vérifiant le rendu réel, pas à la relecture du code : sur le
  // devis ALES (22 150 € HT), la même conclusion portait « environ 8 682 €
  // d'écart sur ces lignes » dans son résumé et « environ 340 € » dans sa marge.
  // Les deux nombres ont deux sources : `surcout_nomme` vient des anomalies
  // écrites par Gemini, `surcout_global` du calcul serveur. Quand une garde
  // retire un poste (ici le forfait WC à 8 342 €, rapproché ×14,7), elle
  // n'atteignait que la seconde — et Gemini continuait de citer la première,
  // car son anomalie repose sur la MÊME référence fausse.
  // ⚠️ On plafonne, on ne redistribue pas : personne ne sait dire laquelle des
  // anomalies de Gemini portait l'écart retiré.
  let nomme = e.surcoutNomme;
  if (nomme !== null && nomme > max) {
    journal.push({
      regle: "montant_nomme_superieur_au_total",
      constat: `phrase du verdict à ${euros(nomme)} pour un écart retenu de ${euros(max)}`,
      action: max > 0 ? `montant cité ramené à ${euros(max)}` : "montant cité retiré",
    });
    nomme = max > 0 ? max : null;
  }

  return {
    surcoutMin: Math.max(0, min),
    surcoutMax: Math.max(0, max),
    surcoutNomme: nomme,
    postes,
    exigeComparaisonIndicative: false,
    journal,
  };
}
