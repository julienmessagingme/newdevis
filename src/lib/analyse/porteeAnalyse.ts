/**
 * src/lib/analyse/porteeAnalyse.ts
 *
 * SUR QUOI NOUS SOMMES-NOUS PRONONCÉS ? — une seule règle, deux affichages.
 *
 * 🔴 2026-09-22 (retour Johan, devis JeanBERNARD & Fils) — la page titrait
 * « Ce devis demande quelques clarifications avant signature », puis annonçait
 * trois lignes plus bas « rien de significatif à négocier », et le détail
 * montrait un poste vert sur dix. Trois messages, un seul fait. Mesuré sur le
 * stock : **28 analyses sur 149 (18,8 %)** affichaient ce titre, et **23
 * d'entre elles ne pouvaient rien nommer** — c'était le seau de l'ignorance
 * déguisé en alerte.
 *
 * La cause n'était pas la rédaction : la page confondait DEUX AXES.
 *
 *   · ce que nous SAVONS   → la portée (ce module)
 *   · ce que nous AVONS TROUVÉ → le verdict et sa couleur
 *
 * Un devis dont nous ne savons rien sortait en orange, comme un devis où nous
 * avions trouvé un écart. La règle posée : **la couleur ne porte que ce qu'on a
 * trouvé ; ce qu'on n'a pas pu vérifier s'écrit, il ne se colore pas.**
 *
 * ⚠️ CE MODULE EXISTE POUR QUE LE COMPTE DU HERO SOIT CELUI DU DÉTAIL. Le
 * « 6 sur 9 » annoncé en tête doit se retrouver ligne à ligne plus bas, sinon
 * on reconstruit la divergence qu'on corrige. `BlockPrixMarche` applique
 * exactement les mêmes deux filtres (`devis_lines` non vide, libellé ≠
 * « Autre ») puis `referenceOpposable` : ils sont reproduits ici, et un test
 * les verrouille.
 */

import { referenceOpposable, type MetaVectorielle } from "@/lib/analyse/referenceOpposable";

/** Un groupe tel qu'il est stocké dans `raw_text.n8n_price_data`. */
export interface GroupePortee {
  job_type_label?: string | null;
  devis_lines?: unknown[] | null;
  devis_total_ht?: number | null;
  vectorial?: MetaVectorielle | null;
}

export interface Portee {
  /** Postes dont nous pouvons opposer un prix — catalogue OU référence fabricant. */
  compares: number;
  /** Postes réellement affichés dans le détail poste par poste. */
  total: number;
  /** Part du montant HT couverte, arrondie. `null` si aucun montant exploitable. */
  pctMontant: number | null;
}

/**
 * Le libellé fourre-tout du groupeur : il ne porte jamais de prix de référence
 * et `BlockPrixMarche` l'écarte de l'affichage. Le compter au dénominateur
 * ferait annoncer « 6 sur 10 » là où le lecteur voit neuf lignes.
 */
const LIBELLE_FOURRE_TOUT = "Autre";

/**
 * @param groupes Les groupes rapprochés (`raw_text.n8n_price_data`).
 * @param materielCompares Nombre de postes vérifiés par référence fabricant
 *        (`conclusion.materiel_verifie`). Ils sont comparés ET affichés : ils
 *        comptent des deux côtés. Les omettre ferait annoncer une portée plus
 *        faible que ce que le détail montre — sur un devis de climatisation,
 *        c'est la majorité des lignes.
 * @param materielMontantHT Montant porté par ces postes, pour la part du montant.
 */
export function porteeAnalyse(
  groupes: GroupePortee[] | null | undefined,
  materielCompares = 0,
  materielMontantHT = 0,
): Portee | null {
  const liste = Array.isArray(groupes) ? groupes : [];

  // Mêmes deux filtres que `BlockPrixMarche` avant l'affichage du détail.
  const affiches = liste.filter(
    (g) =>
      Array.isArray(g?.devis_lines) &&
      g.devis_lines.length > 0 &&
      g?.job_type_label !== LIBELLE_FOURRE_TOUT,
  );

  const total = affiches.length + materielCompares;
  if (total === 0) return null;

  const opposables = affiches.filter((g) => referenceOpposable(g?.vectorial));
  const compares = opposables.length + materielCompares;

  const montantTotal =
    affiches.reduce((s, g) => s + (Number(g?.devis_total_ht) || 0), 0) + materielMontantHT;
  const montantCompare =
    opposables.reduce((s, g) => s + (Number(g?.devis_total_ht) || 0), 0) + materielMontantHT;

  return {
    compares,
    total,
    pctMontant: montantTotal > 0 ? Math.round((montantCompare / montantTotal) * 100) : null,
  };
}

/**
 * Part du montant à partir de laquelle nous pouvons affirmer que L'ENSEMBLE du
 * devis est cohérent.
 *
 * 🔴 CE N'EST PAS le seuil de 5 % de `leviersBuilder`
 * (`COUVERTURE_MIN_POUR_AFFIRMER_PCT`), et les confondre était mon erreur.
 * Celui-là répond à « n'avons-nous RIEN pu comparer ? » — volontairement bas
 * pour que la réponse soit indiscutable. Affirmer la cohérence de l'ensemble
 * engage bien davantage : sur le devis JeanBERNARD (1 poste opposable sur 10,
 * mais 21 % du montant), un seuil à 5 % laissait passer « Ce devis nous paraît
 * cohérent » sur un devis dont nous ignorions quatre cinquièmes.
 *
 * 🟢 LA VALEUR N'EST PAS ARBITRAIRE : ELLE TOMBE DANS UN TROU DE LA
 * DISTRIBUTION. Mesuré sur les 43 analyses sans aucun constat (banc du
 * 2026-09-22) — portée : Q1 **0 %**, médiane **87 %**, Q3 **100 %**. Les devis
 * sont soit très bien couverts, soit pas du tout. Conséquence directe : les
 * seuils 40 %, 50 %, 60 % et 70 % donnent **exactement le même partage**
 * (21 verts / 22 gris). Le déplacer ne change rien — c'est ce qui le rend
 * robuste, et c'est aussi ce qui interdit de le « régler » pour obtenir plus
 * de vert.
 *
 * Et il s'explique en une phrase au lecteur : nous avons comparé plus de la
 * moitié du montant, ou nous ne l'avons pas fait.
 */
export const PORTEE_MIN_POUR_AFFIRMER_PCT = 50;

/**
 * Pouvons-nous affirmer que l'ensemble du devis est cohérent ?
 *
 * ⚠️ Répondre `false` ne veut PAS dire que le devis est douteux : cela veut
 * dire que nous n'en savons pas assez pour nous prononcer. C'est toute la
 * séparation des deux axes — le doute sur NOUS ne se colore pas comme un
 * doute sur LE DEVIS.
 */
export function porteeSuffisantePourAffirmer(portee: Portee | null): boolean {
  if (!portee) return false;
  if (portee.compares === 0) return false;
  // Sans montants exploitables, on se rabat sur le compte de postes : la
  // majorité des postes comparés vaut la majorité du montant.
  if (portee.pctMontant === null) return portee.compares * 2 >= portee.total;
  return portee.pctMontant >= PORTEE_MIN_POUR_AFFIRMER_PCT;
}

/**
 * La phrase de portée, en UNE ligne.
 *
 * 🔴 L'ancienne `coverageLine` faisait deux à trois phrases et se lisait comme
 * une excuse (« Nous avons comparé au marché tout ce que notre référentiel
 * couvre. Sur le reste, nous n'avons pas de prix à opposer — un second devis
 * reste le meilleur comparatif… »). Le temps d'attention est de quelques
 * secondes : la portée est un FAIT, elle se donne en une ligne et se vérifie
 * dans le détail juste en dessous.
 */
export function phrasePortee(portee: Portee | null): string | null {
  if (!portee) return null;
  const { compares, total } = portee;
  if (compares === 0) {
    return `Aucune des ${total} prestations n'a de prix de référence que nous puissions opposer.`;
  }
  if (compares >= total) {
    return `Nous avons comparé les ${total} prestations de ce devis au marché.`;
  }
  return `Nous avons comparé ${compares} des ${total} prestations au marché${
    portee.pctMontant !== null ? `, soit ${portee.pctMontant} % du montant` : ""
  }.`;
}
