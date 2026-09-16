/**
 * scripts/detecteur-affirmation-prix.mjs
 *
 * « Ce texte AFFIRME-T-IL que le prix est correct ? » — une seule définition,
 * partagée par le banc qui MESURE la fuite
 * (`scripts/banc-invariant-affirmation.mjs`) et par le test qui garantit que
 * notre propre phrase d'intro ne la produit pas
 * (`src/lib/analyse/phraseIntroSansReference.test.ts`).
 *
 * 🔴 POURQUOI C'EST UN FICHIER À PART, ET PAS UNE COPIE DE CHAQUE CÔTÉ.
 * Le 2026-09-11, `scripts/preview-review-email.ts` tenait une COPIE des
 * gabarits d'e-mail « faute d'export », avec un commentaire demandant de penser
 * à les synchroniser. Personne ne le fait : l'aperçu a fini par faire approuver
 * un texte qui n'était plus celui qui partait. Ici l'enjeu est le même, à
 * l'envers — un test qui utiliserait SA PROPRE définition de « affirmer un
 * prix » prouverait seulement que notre phrase échappe à un motif que nous
 * avons écrit pour elle. Il doit échapper au motif de la MESURE.
 *
 * ⚠️ Le banc fait un `await` Supabase au chargement : on ne peut pas importer
 * le banc lui-même depuis un test sans déclencher toute la mesure. D'où ce
 * module, qui ne fait rien d'autre que porter la règle.
 */

/**
 * Ce qui compte comme AFFIRMER que le prix est correct.
 *
 * ⚠️ Cette liste est volontairement LARGE — elle sert à MESURER, pas à filtrer.
 * C'est précisément parce qu'une liste ne peut pas être exhaustive que le banc
 * existe : si elle trouve déjà des violations, une liste plus fine n'est pas la
 * solution.
 */
export const AFFIRME_UN_PRIX =
  /\b(prix|tarifs?|montants?|devis)\b[^.!?]{0,40}\b(coh[ée]rents?|corrects?|justes?|normaux?|conformes?|dans (la|les) (norme|moyenne|fourchettes?)|raisonnables?|align[ée]s?|competitifs?|comp[ée]titifs?|attractifs?|bien plac[ée]s?)\b|\b(coh[ée]rents?|corrects?|conformes?|raisonnables?)\b[^.!?]{0,30}\b(march[ée]|prix|tarifs?)\b|\bau (bon|juste) prix\b|\bpas de surco[ûu]t\b|\brien [àa] redire sur (le|les) prix\b/i;

/**
 * 🔴 UNE NÉGATION N'EST PAS UNE AFFIRMATION — et mon premier jet l'ignorait.
 *
 * « nous ne sommes **pas en mesure** de dire si le prix est juste » contient
 * « prix … juste » : le motif brut y voyait une violation. Il en a compté 19,
 * dont la plupart étaient des phrases qui disent EXACTEMENT ce qu'on veut
 * qu'elles disent. Troisième fois dans la même journée qu'un indicateur mal
 * écrit fabrique un signal qui n'existe pas.
 *
 * On travaille donc PHRASE PAR PHRASE, et on écarte celle qui porte une marque
 * de négation ou de réserve.
 */
export const NEGATION =
  /\b(ne |n'|pas |aucun|sans |impossible|ni |jamais|ne pouvons|pas en mesure|hors d'[ée]tat|faute de|insuffisan|invérifiable|non v[ée]rifiable|ne permet pas|ne dit rien)/i;

/**
 * Rend la première phrase qui affirme un prix correct SANS réserve, ou `null`.
 */
export function phraseAffirmative(texte) {
  for (const phrase of String(texte ?? "").split(/(?<=[.!?])\s+/)) {
    if (!AFFIRME_UN_PRIX.test(phrase)) continue;
    if (NEGATION.test(phrase)) continue;
    return phrase.trim();
  }
  return null;
}
