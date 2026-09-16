/**
 * src/lib/analyse/phraseIntroSansReference.ts
 *
 * 🔴 2026-09-16 — QUAND LE MOTEUR NE SAIT PAS CHIFFRER, LA PHRASE D'INTRO EST
 * COMPOSÉE PAR NOUS, PAS ÉCRITE PAR GEMINI.
 *
 * Depuis le 04/09, huit défauts ont été corrigés un par un. Relus ensemble, ils
 * disent tous la même phrase : *la page a affirmé quelque chose que le moteur
 * ne savait pas.* Le banc `scripts/banc-invariant-affirmation.mjs` a mesuré la
 * fuite qui restait ouverte sur le stock :
 *
 *   118 analyses mesurables · 43 incapables de chiffrer · 5 violent l'invariant
 *
 *   | champ                    | violations | qui l'écrit                  |
 *   |--------------------------|-----------:|------------------------------|
 *   | phrase_intro             |      5 / 5 | Gemini, sur le chemin normal |
 *   | verdict_reasons.summary  |          2 | déterministe hérité          |
 *   | verdict_ligne            |          0 | déterministe (leviersBuilder)|
 *   | leviers, justifications  |          0 | déterministe                 |
 *
 * **Zéro violation sur tout ce que nous composons nous-mêmes. Cent pour cent
 * sur ce que nous faisons écrire.** D'où ce module.
 *
 * ⚠️ CE N'EST PAS UNE GARDE DE PLUS. `sanitizeLLMText` (niveau 0) est une
 * LISTE NOIRE posée sur de la prose générée, et une liste noire ne peut pas
 * être complète — c'est le défaut exact de la garde hors-scope du même jour.
 * Le 04/09 elle bloquait « globalement cohérent » et « cohérent avec les prix
 * du marché » ; le 16/09 Gemini écrit « présente un prix cohérent » et passe.
 * Il y aura toujours une formulation de plus. On cesse donc de SOUSTRAIRE une
 * affirmation : on ne la produit pas.
 *
 * ⚠️ Et ce n'est pas une invention non plus : `phrase_intro` est DÉJÀ composée
 * en dur sur les quatre chemins d'exception de `conclusion.ts` (devis étranger,
 * estimation de courtier, devis incomplet, hors-scope), où elle ne fuit jamais.
 * Ce module étend au chemin normal ce qui marche déjà sur les exceptions.
 *
 * 🔴 CE QU'ON NE DIT PAS, ET C'EST LE CŒUR DE LA RÈGLE : on n'affirme pas
 * l'inverse. « Ces prix sont suspects » serait tout aussi faux que « ces prix
 * sont corrects » — nous n'en savons rien, et le conseil intempestif est
 * proscrit depuis le 04/09. Un doute produit un doute.
 */

export interface FaitsSansReference {
  /** Total HT extrait du devis. `null` quand le document ne porte aucun montant. */
  totalHT: number | null;
  /** Ville du chantier telle qu'extraite. Chaîne vide si absente. */
  ville: string;
  /**
   * Part du montant rapprochée en confiance haute, en %. `null` quand le
   * dénominateur est nul — c'est-à-dire quand le devis ne porte AUCUN prix.
   * ⚠️ `null` est le signal le plus FORT, pas une absence de signal
   * (règle du 2026-09-13, devis « Entreprise Fk »).
   */
  coveragePct: number | null;
  /** Aucune ligne de travaux n'a été extraite (garde du 2026-09-08, devis D-261053). */
  aucuneLigneTravaux?: boolean;

  /**
   * Année du devis quand il a plus de 12 mois, sinon `null`.
   *
   * 🔴 MESURÉ, PAS SUPPOSÉ. `scripts/banc-perte-phrase-intro.mjs` a relu les 42
   * phrases d'intro que ce module remplace : sur trois d'entre elles, l'âge du
   * devis n'était écrit NULLE PART AILLEURS sur la page — le levier
   * « devis > 12 mois » ne s'était pas déclenché. Les remplacer sans reprendre
   * l'année aurait fait disparaître le fait. C'est exactement ce qu'un banc de
   * perte doit attraper, et il l'a attrapé.
   */
  anneeDevisAncien?: number | null;
}

/** « 12 500 » — même formatage que le reste du produit. */
function euros(n: number): string {
  return Math.round(n).toLocaleString("fr-FR");
}

/**
 * Le FAIT, en tête : ce que le devis dit de lui-même. Montant et ville sont
 * extraits du document, jamais déduits — le lecteur peut les vérifier d'un
 * coup d'œil, et c'est ce qui rend la suite crédible.
 */
function rappelDuDevis(f: FaitsSansReference): string {
  const aMontant = typeof f.totalHT === "number" && f.totalHT > 0;
  const ville = (f.ville || "").trim();

  if (aMontant && ville) return `${euros(f.totalHT as number)} € HT pour un chantier à ${ville}.`;
  if (aMontant)           return `${euros(f.totalHT as number)} € HT.`;
  if (ville)              return `Ce devis porte sur un chantier à ${ville}.`;
  return "";
}

/**
 * Rappel de l'âge, en queue de phrase. Il ne parle PAS du prix de ce devis —
 * il dit que le marché a bougé depuis, ce qui est un fait daté et vérifiable.
 */
function mentionAge(f: FaitsSansReference): string {
  const annee = f.anneeDevisAncien;
  if (typeof annee !== "number" || !Number.isFinite(annee)) return "";
  return ` Attention également : ce devis date de ${annee} — les tarifs des matériaux et de la main-d'œuvre ont évolué depuis, demandez-en une version à jour avant de vous engager.`;
}

/**
 * Compose la phrase d'introduction quand le moteur n'a pas su chiffrer le devis.
 *
 * Trois cas, parce qu'ils ne disent pas la même chose au lecteur — et qu'écrire
 * « aucune prestation » là où une ligne EST comparée est une contradiction
 * qu'il voit immédiatement (même distinction que `aucuneReferenceDuTout`,
 * 2026-09-10, cas AQUIVOLTAIQUE).
 */
export function phraseIntroSansReference(f: FaitsSansReference): string {
  const debut = rappelDuDevis(f);
  const prefixe = debut ? `${debut} ` : "";
  const age = mentionAge(f);

  // (a) Le document ne porte aucune ligne de travaux exploitable.
  if (f.aucuneLigneTravaux) {
    return (
      `${prefixe}Nous n'avons trouvé dans ce document aucune ligne de travaux ` +
      `chiffrée : il n'y a donc rien que nous puissions comparer à nos références. ` +
      `Nous ne nous prononçons pas sur les prix — ni dans un sens ni dans l'autre. ` +
      `Les vérifications sur l'entreprise, les clauses et les modalités de paiement, elles, restent valables.` + age
    );
  }

  // (b) Une ligne au moins a bien été rapprochée, mais c'est marginal.
  //     Ne PAS écrire « aucune » ici : le détail affiche sa fourchette.
  const partielle =
    typeof f.coveragePct === "number" && f.coveragePct > 0;

  if (partielle) {
    return (
      `${prefixe}À une ligne près, les prestations de ce devis ne correspondent à ` +
      `aucun tarif de référence que nous puissions opposer à l'artisan — travail ` +
      `sur-mesure, vendu au jour ou à l'heure, ou trop spécifique pour qu'un ` +
      `référentiel existe. Nous ne pouvons donc pas dire si ce prix est juste, et ` +
      `personne ne le peut sur cette seule base. Un devis concurrent sur le même ` +
      `périmètre est le seul comparatif réel.` + age
    );
  }

  // (c) Rien du tout.
  return (
    `${prefixe}Aucune des prestations de ce devis ne correspond à un tarif de ` +
    `référence que nous puissions opposer à l'artisan — travail sur-mesure, vendu ` +
    `au jour ou à l'heure, ou trop spécifique pour qu'un référentiel existe. ` +
    `Ce n'est pas un signe que le prix est mauvais : c'est que personne, ni nous ` +
    `ni un comparateur, ne peut l'affirmer. Un devis concurrent sur le même ` +
    `périmètre est le seul comparatif réel. Les vérifications sur l'entreprise, ` +
    `les clauses et les modalités de paiement restent entièrement valables.` + age
  );
}
