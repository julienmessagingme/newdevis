/**
 * scripts/memes-postes.mjs
 *
 * « Ces deux libellés désignent-ils le même poste ? » — une seule définition,
 * partagée par le banc de rejeu ET par le contrôle qui l'a corrigé.
 *
 * 🔴 POURQUOI UN MODULE SÉPARÉ. Le 17/09, le contrôle `controle-postes-juges`
 * a montré que le banc surestimait la régression : il comparait des MONTANTS
 * quand l'expert avait jugé des POSTES. Si chacun des deux gardait sa propre
 * notion de « même poste », ils re-diverggeraient au premier ajustement — et on
 * ne saurait plus lequel croire. Même leçon que `detecteur-affirmation-prix`
 * (16/09) et que `preview-review-email` (11/09).
 *
 * ⚠️ C'est un rapprochement de LIBELLÉS, donc un indicateur, pas une vérité.
 * Il est délibérément TOLÉRANT : sur ce banc, se tromper en déclarant « déjà
 * jugé » fait compter une régression de trop — le sens prudent, celui qui nous
 * alerte à tort plutôt que de nous rassurer à tort.
 */

/** Minuscules, sans accents, sans parenthèses ni ponctuation. */
export function normaliserLibelle(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function memePoste(a, b) {
  const na = normaliserLibelle(a);
  const nb = normaliserLibelle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  // Recouvrement des mots significatifs : deux tiers suffisent à désigner le
  // même ouvrage (« Pose faïence murale » ⟷ « Faïence murale salle de bain »).
  const ma = new Set(na.split(" ").filter((w) => w.length > 3));
  const mb = new Set(nb.split(" ").filter((w) => w.length > 3));
  if (ma.size === 0 || mb.size === 0) return false;
  const communs = [...ma].filter((w) => mb.has(w)).length;
  return communs / Math.min(ma.size, mb.size) >= 0.67;
}

/**
 * Les postes que l'expert avait sous les yeux au moment de trancher.
 * ⚠️ Un tableau VIDE ne veut pas dire « il a tout validé » : avant le correctif
 * du 2026-09-05, un montant pouvait s'afficher SANS aucun poste nommé. Dans ce
 * cas l'expert a annulé un chiffre anonyme — il n'a jugé aucun poste.
 */
export function postesJugesParExpert(originalConclusion) {
  const anomalies = Array.isArray(originalConclusion?.anomalies) ? originalConclusion.anomalies : [];
  return anomalies
    .map((x) => x?.poste ?? x?.libelle ?? x?.label ?? "")
    .map((x) => String(x).trim())
    .filter(Boolean);
}

/**
 * 🟢 2026-09-17 — LES POSTES TRANCHÉS APRÈS COUP, avec leur verdict.
 *
 * Versés dans `analysis_corrections.corrected_anomalies` par
 * `injecter-postes-tranches.mjs` : l'expert a jugé des POSTES que la conclusion
 * d'origine ne nommait pas (elle n'affichait qu'un montant anonyme, d'avant le
 * correctif du 05/09). C'est ainsi que l'étalon GRANDIT sans qu'on invente ses
 * réponses.
 *
 * Rend `[{ poste, verdict, ecartValide }]` où :
 *   · verdict "OK"    → ce poste ne doit PAS être accusé (écart attendu : 0)
 *   · verdict "ECART" → il doit l'être ; `ecartValide` vaut `null` quand seul
 *     le verdict a été validé et pas le montant.
 *
 * ⚠️ Ne retourne QUE les postes portant le marqueur d'origine : le champ
 * pourrait un jour servir à autre chose, et un banc ne doit pas se nourrir de
 * ce qu'il ne reconnaît pas.
 */
export function postesTranchesApresCoup(correctedAnomalies) {
  const liste = Array.isArray(correctedAnomalies) ? correctedAnomalies : [];
  return liste
    .filter((x) => x && typeof x.poste === "string" && typeof x.origine === "string" && x.origine.includes("SOURÇAGE IA VALIDÉ"))
    .map((x) => ({
      poste: String(x.poste).trim(),
      verdict: x.verdict === "OK" ? "OK" : "ECART",
      ecartValide: typeof x.ecart_valide === "number" ? x.ecart_valide : null,
    }))
    .filter((x) => x.poste);
}

/**
 * 🔴 2026-09-17 — « L'EXPERT A-T-IL DIT QUE CE POSTE EST AU PRIX NORMAL ? »
 * UNE SEULE DÉFINITION, parce qu'il y a DEUX chemins pour le dire et qu'ils
 * n'ont pas la même force :
 *
 *   · `reaccuses` — l'expert avait le poste NOMMÉ sous les yeux et a annulé le
 *     montant. C'est le signal le plus fort de l'étalon.
 *   · `aTort` — le poste a été tranché APRÈS COUP (sourçage validé le 17/09),
 *     avec un verdict explicite « OK » par poste.
 *
 * Les deux bancs qui mesurent « le moteur accuse-t-il ce que l'humain absout ? »
 * doivent partir de la même liste. Le 17/09 j'ai écrit un second banc avec sa
 * propre combinaison de ces deux chemins : il annonçait 16 postes là où le banc
 * de référence en publie 8 + 4. Deux compteurs d'apprentissage qui ne comptent
 * pas la même chose, c'est exactement ce que ce module existe pour empêcher.
 *
 * ⚠️ `reaccuses` est rendu SANS condition sur le montant tranché par l'expert :
 * c'est l'appelant qui décide quoi en faire (le banc de référence exige en plus
 * `expert === 0`). On sépare le FAIT de son INTERPRÉTATION.
 */
export function confronterPostes({ originalConclusion, correctedAnomalies }, postesAccuses) {
  const accuses = Array.isArray(postesAccuses) ? postesAccuses : [];

  const jugesAlors = postesJugesParExpert(originalConclusion);
  const reaccuses = accuses.filter((p) => jugesAlors.some((n) => memePoste(n, p.label)));

  const tranches = postesTranchesApresCoup(correctedAnomalies);
  const aTort = [];   // le moteur accuse un poste que l'expert dit NORMAL
  const aRaison = []; // le moteur accuse un poste que l'expert dit SURFACTURÉ
  const manques = []; // l'expert dit surfacturé, le moteur n'accuse pas
  for (const t of tranches) {
    const accuse = accuses.find((p) => memePoste(t.poste, p.label));
    if (t.verdict === "OK" && accuse) aTort.push({ ...t, ecart: accuse.ecart });
    else if (t.verdict === "ECART" && accuse) aRaison.push({ ...t, ecart: accuse.ecart });
    else if (t.verdict === "ECART" && !accuse) manques.push(t);
  }

  return { jugesAlors, reaccuses, aTort, aRaison, manques };
}
