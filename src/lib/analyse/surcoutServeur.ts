/**
 * surcoutServeur.ts — CE QUE NOUS AFFIRMONS QU'UN DEVIS COÛTE DE TROP.
 *
 * Extrait de `conclusion.ts` le 2026-09-15 pour deux raisons : la règle devait
 * devenir testable, et un banc de mesure devait pouvoir l'IMPORTER plutôt que
 * la recopier (leçon du banc de re-classement — une copie mesure une autre
 * règle que celle qui part en production).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 🔴 LE COEFFICIENT ×1,3 A ÉTÉ SUPPRIMÉ — ET IL N'AVAIT JAMAIS EU DE RAISON.
 *
 * De sa création (2026-04-01, `quoteGlobalAnalysis.ts`) à aujourd'hui, le
 * montant affiché était `Σ(devis − plafond marché)` puis « min = × 0,7 ·
 * max = × 1,3 ». Aucun commentaire, aucun commit, aucune mesure n'a jamais
 * justifié ces deux nombres : la seule trace est « fourchette basse (×0.7) /
 * fourchette haute (×1.3) », c'est-à-dire leur propre énoncé.
 *
 * Trois raisons de les retirer, pas une :
 *
 *  1. **La somme brute est DÉJÀ un plancher.** Elle compare le devis au
 *     PLAFOND de la fourchette marché — pas à sa moyenne. Ce qui dépasse ce
 *     plafond dépasse le prix le plus cher que nous connaissions. La majorer
 *     de 30 % invente ; la minorer de 30 % descend sous un plancher.
 *
 *  2. **Le haut de fourchette n'était rattachable à aucune ligne.** Les postes
 *     qui composent l'écart somment à la valeur BRUTE. Le `max` affiché
 *     dépassait donc toujours de 30 % le total du détail — en contradiction
 *     directe avec la règle du 2026-08-30 (« on ne chiffre que ce qu'on peut
 *     nommer ») et celle du 2026-09-05 (« aucun montant sans poste nommé »).
 *
 *  3. **Il amplifiait les rapprochements faux.** Sur un devis à 2 000 € HT
 *     dont l'écart brut sortait déjà à 2 500 € — donc au-dessus du devis
 *     entier, preuve que la comparaison était fausse — on publiait 3 250 €.
 *
 * ⚠️ NE PAS « rétablir une fourchette » pour faire moins sec. Si un jour un
 * intervalle est souhaité, il devra être CALCULÉ (par exemple l'écart au
 * plancher du marché face à l'écart au plafond) et chaque borne devra rester
 * égale à la somme de postes nommés. Un intervalle décoratif est un chiffre
 * faux.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { isLikelyHeterogeneousGroup } from "./groupHomogeneity";

// ── Vocabulaire d'unités ─────────────────────────────────────────────────────

// "f" et "fft" = abréviations françaises de "forfait" courantes dans les devis BTP
export const FORFAIT_UNIT_KEYWORDS = [
  "forfait", "global", "prestation", "ensemble", "installation complète", "f", "fft", "ff", "ens",
];

// Postes dont la comparaison marché se fait en m² mais que l'artisan peut facturer en U/forfait
// (exporté : `surfaceMismatchConfidence`, dans conclusion.ts, s'en sert aussi)
export const SURFACE_WORK_KEYWORDS = [
  "cloison", "doublage", "contre-cloison", "peinture", "enduit", "lasure",
  "carrelage", "faïence", "parquet", "plancher", "ragréage", "chape",
  "isolation", "isol", "plafond", "toile de verre", "papier peint",
  "revêtement sol", "revêtement mur", "sol stratifié", "moquette",
];
// Équipements/appareils vendus naturellement à l'unité → jamais en m²
const EQUIPMENT_KEYWORDS = [
  "chauffe-eau", "chauffe eau", "cumulus", "ballon",
  "climatisation", "climatiseur", "clim", "split",
  "pompe à chaleur", "pompe a chaleur", "pac",
  "radiateur", "convecteur", "sèche-serviette", "seche serviette",
  "chaudière", "chaudiere", "poêle", "poele",
  "ventilation", "vmc", "extracteur",
  "robinet", "mitigeur", "sanitaire", "wc", "toilette",
  "porte", "fenêtre", "fenetre", "baie", "volet",
  "tableau électrique", "tableau electrique", "disjoncteur",
];
const M2_UNITS = ["m²", "m2", "m ²", "mètre carré", "metre carre", "m2 ht", "m² ht"];
export const UNIT_LIKE = [
  "u", "unité", "unite", "forfait", "ens", "ensemble",
  "prestation", "pce", "pièce", "piece", "lot", "global", "art", "article",
];

/**
 * Extrait la surface totale en m² connue depuis les lignes du groupe.
 * Cherche les lignes ayant une unité m² avec une quantité positive.
 * Retourne null si aucune surface explicite trouvée.
 */
export function extractKnownSurface(lines: any[]): number | null {
  let total = 0;
  for (const l of Array.isArray(lines) ? lines : []) {
    const u = (l?.unit || l?.unite || "").toLowerCase().trim();
    const qty = typeof l?.quantity === "number" ? l.quantity
      : typeof l?.quantite === "number" ? l.quantite : 0;
    if (qty > 0 && M2_UNITS.some((m) => u.includes(m))) total += qty;
  }
  return total > 0 ? total : null;
}

/**
 * 2026-08-30 (retour Johan, devis ALES sdb) — GARDE D'UNITÉ.
 *
 * Cas vécu : une ligne « Dépose totale des cloisons intérieures » facturée
 * 8 950 € en forfait (unité « U », quantité 1) comparée à un tarif catalogue
 * de 15–40 €/m². Le calcul fait `40 × 1 = 40 €` de référence, donc 8 910 € de
 * « surcoût » — un chiffre né d'une multiplication par une quantité qui
 * n'existe pas. Six groupes du même devis étaient dans ce cas, produisant un
 * écart annoncé de 7 405 à 13 751 € sur un devis de 22 150 €.
 *
 * Règle : si le prix catalogue est exprimé dans une unité MÉTRIQUE (m², ml,
 * m³) alors que la ligne de devis n'a pas de quantité dans cette unité, la
 * comparaison n'a pas de sens.
 */
const METRIC_UNIT_RE = /^(m2|m²|m3|m³|ml|mètre|metre)/i;

/**
 * 🔴 2026-09-17 — « MÉTRIQUE DES DEUX CÔTÉS » NE VEUT PAS DIRE « COMPARABLE ».
 *
 * Jusqu'ici la garde demandait seulement si le tarif catalogue était métrique
 * et si la ligne portait UNE quantité métrique. Jamais si c'était la MÊME.
 * Un tarif au **m²** face à une ligne en **ml** passait donc : on multipliait un
 * prix au mètre carré par un métré linéaire.
 *
 * Mesuré avant correctif ([`banc-unites-discordantes.mjs`](scripts/banc-unites-discordantes.mjs))
 * sur 984 groupes comparés à un tarif métrique : **55 (5,6 %) opposent deux
 * familles d'unités différentes, dont 6 portent un écart chiffré — 5 610 €**.
 * Les six ont été relus un par un : **tous mécaniquement faux**, et deux
 * d'entre eux composaient à eux seuls les montants accusés sur deux devis que
 * l'expert avait annulés — « Traitement hydrofuge toiture » 38 ML × tarif/m²
 * (1 504 €, tout le devis Renov'Toitures) et « Faîtage tuile » 6,9 m² ×
 * tarif/ml (378 €, Mélier). **Zéro accusation légitime perdue.**
 *
 * C'est la même famille que le cas DESMARIS du 16/09 (« 80 €/ml × 1 Ens »),
 * mais entre deux unités TOUTES DEUX métriques — l'angle mort exact de la
 * formulation d'origine.
 */
function familleUnite(u: unknown): "surface" | "lineaire" | "volume" | null {
  const s = String(u ?? "").trim().toLowerCase();
  if (/^(m2|m²)/.test(s)) return "surface";
  if (/^(m3|m³)/.test(s)) return "volume";
  if (/^(ml|mètre|metre)/.test(s)) return "lineaire";
  return null;
}

export function hasIncomparableUnit(group: Record<string, any>): boolean {
  const prices: any[] = Array.isArray(group?.prices) ? group.prices : [];
  if (prices.length === 0) return false;
  const tarifMetrique = prices.find(
    (p) =>
      typeof p?.price_max_unit_ht === "number" &&
      p.price_max_unit_ht > 0 &&
      METRIC_UNIT_RE.test(String(p?.unit ?? "").trim()),
  );
  if (!tarifMetrique) return false;

  const unitDevis = String(group?.main_unit ?? "").trim();
  const qty = Number(group?.main_quantity ?? 0);
  // Cas d'origine (30/08) : la ligne ne porte aucune quantité métrique.
  if (!(METRIC_UNIT_RE.test(unitDevis) && qty > 0)) return true;

  // Cas ajouté le 17/09 : les deux sont métriques, mais pas de la même famille.
  // ⚠️ On ne rejette QUE sur deux familles identifiées et différentes — une
  // unité qu'on ne sait pas classer ne doit pas devenir un refus silencieux.
  const fCatalogue = familleUnite(tarifMetrique.unit);
  const fDevis = familleUnite(unitDevis);
  return fCatalogue !== null && fDevis !== null && fCatalogue !== fDevis;
}

/**
 * 🔴 2026-09-16 — ON N'ADDITIONNE JAMAIS UN TARIF UNITAIRE ET UN FORFAIT.
 *
 * Une entrée du catalogue peut porter les DEUX : « Tubage conduit cheminée »
 * vaut **80-280 €/ml OU 200-800 € au forfait** — le forfait est l'alternative
 * « petit chantier », pas un supplément. Elles sont 13 sur 925 dans ce cas
 * (2 au ml, 10 au m², 1 à l'unité), et le sens est le même partout : un OU.
 *
 * Or six endroits du code calculaient `unitaire × quantité + forfait`. Sur le
 * devis DESMARIS (16/09), cela donnait une fourchette **280-1 080 €** là où la
 * seule lecture défendable est **200-800 €** : ni la borne basse ni la haute ne
 * correspondaient à quoi que ce soit. Mesuré : **45 groupes** du stock touchés,
 * et l'erreur va dans les DEUX sens — le tubage était accusé à tort, tandis
 * qu'une unité de climatisation à 510 € passait pour bon marché face à un
 * « 2 000-5 400 € » tout aussi inventé.
 *
 * 🟢 CE N'EST PAS UNE INTUITION, C'EST LA RÉCOLTE DU GOLD STANDARD. Sur les 44
 * notes d'expert de `analysis_corrections`, **28 citent un faux rapprochement,
 * dont 13 disent explicitement « forfait vs métrique »**. Le rejeu des 55
 * décisions (`banc-rejeu-decisions-expert.mjs`) retrouve la même famille en
 * tête des défauts encore vivants.
 *
 * LA RÈGLE : on choisit UN des deux tarifs.
 *   · le tarif UNITAIRE quand la ligne du devis peut réellement s'y comparer —
 *     c'est-à-dire quand son unité correspond à celle du catalogue et qu'elle
 *     porte une quantité exploitable ;
 *   · le FORFAIT sinon (ligne au forfait, ou unité qui ne correspond pas).
 *
 * ⚠️ NE PAS « SIMPLIFIER » EN PRENANT TOUJOURS LE FORFAIT : sur une entrée
 * tarifée « par unité intérieure », quatre unités valent 4 × le tarif unitaire,
 * pas un forfait unique. C'est le piège que la première version de ce correctif
 * a failli introduire.
 *
 * ⚠️ Comportement INCHANGÉ pour les 912 autres entrées : celles qui n'ont qu'un
 * seul des deux tarifs passent exactement par le même calcul qu'avant.
 */
export function bornesMarche(
  prices: Array<Record<string, any>> | null | undefined,
  quantite: number,
  uniteLigne: string | null | undefined,
): { min: number; avg: number; max: number } {
  const qty = Number.isFinite(quantite) && quantite > 0 ? quantite : 1;
  const uDevis = String(uniteLigne ?? "").trim();
  let min = 0;
  let avg = 0;
  let max = 0;

  for (const p of Array.isArray(prices) ? prices : []) {
    if (!p || typeof p !== "object") continue;
    const uMin = Number(p.price_min_unit_ht) || 0;
    const uAvg = Number(p.price_avg_unit_ht) || 0;
    const uMax = Number(p.price_max_unit_ht) || 0;
    const fMin = Number(p.fixed_min_ht) || 0;
    const fAvg = Number(p.fixed_avg_ht) || 0;
    const fMax = Number(p.fixed_max_ht) || 0;

    if (uMax > 0 && fMax > 0) {
      // L'entrée propose les deux : on tranche, on n'additionne pas.
      // ⚠️ La moyenne suit le MÊME choix que les bornes — sinon elle peut
      // sortir de l'intervalle qu'elle est censée résumer.
      //
      // 🔴 NE PAS COMPARER LES DEUX UNITÉS LITTÉRALEMENT — ma première version
      // le faisait, et « u » ≠ « unité » alors que c'est le même mot. Elle
      // basculait donc sur le forfait pour « Climatisation multi-split (par
      // unité intérieure) » et rendait 5 postes ACCUSÉS à tort, en mesurant
      // une amélioration là où elle créait un défaut. Mesuré avant livraison.
      //
      // La vraie question n'est pas « les deux unités sont-elles identiques ? »
      // mais « le tarif unitaire est-il APPLICABLE à cette ligne ? ». Il ne
      // l'est pas quand le catalogue facture au MÈTRE et que la ligne n'a pas
      // de quantité métrique — c'est exactement `hasIncomparableUnit`, dont on
      // réutilise le test plutôt que d'en réinventer un.
      const catalogueMetrique = METRIC_UNIT_RE.test(String(p.unit ?? "").trim());
      const ligneMetrique = METRIC_UNIT_RE.test(uDevis) && qty > 0;
      const unitaireApplicable = !catalogueMetrique || ligneMetrique;

      if (unitaireApplicable) {
        min += uMin * qty; avg += uAvg * qty; max += uMax * qty;
      } else {
        min += fMin; avg += fAvg; max += fMax;
      }
      continue;
    }

    // Un seul tarif : comportement historique, strictement inchangé.
    min += uMin * qty + fMin;
    avg += uAvg * qty + fAvg;
    max += uMax * qty + fMax;
  }

  return { min, avg, max };
}

export function hasSurfaceUnitMismatch(group: Record<string, any>): boolean {
  const label = (group?.job_type_label || "").toLowerCase();
  const unit = (group?.main_unit || "").toLowerCase().trim();
  const lines: any[] = Array.isArray(group?.devis_lines) ? group.devis_lines : [];

  // Exclure les équipements vendus à l'unité par nature
  if (EQUIPMENT_KEYWORDS.some((kw) => label.includes(kw))) return false;
  const allDescriptions = lines.map((l: any) => (l?.description || "").toLowerCase()).join(" ");
  if (EQUIPMENT_KEYWORDS.some((kw) => allDescriptions.includes(kw))) return false;

  const isSurfaceWork =
    SURFACE_WORK_KEYWORDS.some((kw) => label.includes(kw)) ||
    lines.some((l: any) =>
      SURFACE_WORK_KEYWORDS.some((kw) => (l?.description || "").toLowerCase().includes(kw)),
    );
  if (!isSurfaceWork) return false;

  const isM2 = M2_UNITS.some((u) => unit.includes(u));
  const isUnitLike = UNIT_LIKE.some((u) => unit === u || unit.startsWith(u + " "));
  if (!(!isM2 && isUnitLike)) return false;

  // Si la surface est explicitement connue via une ligne m² dans le groupe, pas de mismatch
  return extractKnownSurface(lines) === null;
}

// ── Garde « tarif de main-d'œuvre face à une ligne fournie » ─────────────────

/**
 * 🔴 2026-09-15 — LA PREMIÈRE CAUSE DES ÉCARTS ABERRANTS, MESURÉE.
 *
 * Sur les 66 devis du stock qui affichent un écart, **20 (30 %)** sont
 * rapprochés d'une entrée catalogue qui ne chiffre QUE la main-d'œuvre, alors
 * que la ligne du devis comprend la fourniture. Le plafond opposé est alors
 * celui d'une prestation amputée de son matériel, et tout ce qui reste
 * ressort en « surfacturation » :
 *
 *   « Fenêtre » 2 892 €  contre  « Menuisier (taux horaire) » 3 h × 120 €
 *   « SCREENS EXTÉRIEURS » 6 300 €  contre  « Pose store banne (MO) » 2 200 €
 *
 * ⚠️ `isSupplyVsLaborMismatch` (garde 2 du matcher) ne ferme PAS ce trou :
 * elle exige des marqueurs dans les DEUX libellés, et « Fenêtre » ne dit pas
 * qu'elle est fournie. Ici on ne regarde qu'un fait certain — **notre entrée
 * catalogue annonce elle-même qu'elle exclut la fourniture** — et on refuse
 * d'en tirer une accusation, sauf si la ligne du devis dit elle aussi qu'elle
 * ne porte que la pose.
 *
 * ⚠️ Cette garde ne retire pas le rapprochement : la carte du poste continue
 * d'exister et d'afficher sa fourchette. Elle retire seulement le droit d'en
 * CHIFFRER un écart — même doctrine que `hasIncomparableUnit`.
 */
const CATALOGUE_POSE_SEULE_RE =
  /\((?:mo|m\.o\.|pose|main[- ]d['’]?œuvre|main[- ]d['’]?oeuvre|hors fourniture)\)|taux horaire|hors fourniture|main[- ]d['’]?œuvre seule/i;
const LIGNE_DIT_POSE_SEULE_RE =
  /\bhors fourniture\b|\bpose seule\b|\bfourniture non comprise\b|\bmat[ée]riel non compris\b|\bfourni par le client\b|\bfourniture client\b|\bnon fournies?\b|\bnon fourni\b/i;

export function tarifMainDoeuvreFaceAFourniture(group: Record<string, any>): boolean {
  const prices: any[] = Array.isArray(group?.prices) ? group.prices : [];
  if (prices.length === 0) return false;
  const tousPoseSeule = prices.every((p) => CATALOGUE_POSE_SEULE_RE.test(String(p?.label ?? "")));
  if (!tousPoseSeule) return false;

  // 🔴 2026-09-15 — LE TEXTE NE VIENT QUE DU DEVIS, JAMAIS DE NOTRE ÉTIQUETTE.
  // Première version : `job_type_label` était concaténé ici. Or c'est NOTRE
  // libellé catalogue, et il contient précisément « (hors fourniture) » sur les
  // entrées que cette garde vise. Elle lisait donc sa propre étiquette, croyait
  // que le DEVIS annonçait la pose seule, et **se désarmait sur exactement les
  // cas pour lesquels elle avait été écrite**.
  // Trouvé en mesurant, pas en relisant : « Pose radiateur électrique à inertie
  // (hors fourniture) » restait opposé à « Fourniture et pose d'un radiateur à
  // inertie MOZART » — quatre fois sur le même devis.
  // ⚠️ Même famille que le piège du 10/09 (« nommer la LIGNE DU DEVIS, pas notre
  // étiquette catalogue ») : dès qu'on juge ce que le devis DIT, notre propre
  // vocabulaire n'a rien à faire dans l'entrée du test.
  const lines: any[] = Array.isArray(group?.devis_lines) ? group.devis_lines : [];
  const texte = lines.map((l: any) => l?.description).filter((t) => typeof t === "string").join(" ");
  // La ligne annonce elle-même qu'elle ne porte que la pose → comparaison licite.
  return !LIGNE_DIT_POSE_SEULE_RE.test(texte);
}

// ── Calcul du surcoût ────────────────────────────────────────────────────────

/**
 * 🔴 2026-09-15 — AU-DELÀ DE HUIT FOIS LE PLAFOND MARCHÉ, CE N'EST PLUS UNE
 * SURFACTURATION, C'EST UN RAPPROCHEMENT FAUX.
 *
 * Ce n'est pas une constante nouvelle : `isImplausiblyHighRatio` (garde 3 du
 * matcher, V3.5.9) rejette déjà un candidat catalogue au-delà de ×8. Elle ne
 * protège que le RAPPROCHEMENT, au moment où il est calculé — donc pas les
 * analyses produites avant elle, ni les groupes dont le montant a été agrégé
 * après coup. Le chiffrage restait sans garde : c'est lui qu'on ferme ici.
 *
 * Le seuil ne tombe pas dans une zone dense, et c'est ce qui le rend robuste.
 * Distribution mesurée sur les 125 postes chiffrés du stock : médiane ×1,56,
 * 3ᵉ quartile ×2,17, 9ᵉ décile ×5,0 — puis **plus rien entre ×6,0 et ×14,7**.
 * Les huit postes au-delà sont tous des rapprochements faux, vérifiés un par
 * un : une micro-station d'épuration (10 759 €) opposée à « Reprise tuyauterie
 * / soudure » au point (×97,8) ; une mission de maîtrise d'œuvre opposée à
 * « Diagnostic / devis approfondi » (×18,8) ; le forfait WC à 8 950 € du devis
 * ALES, déjà documenté comme faux positif le 2026-08-30 (×14,7).
 *
 * ⚠️ Déplacer ce seuil vers le bas le ferait entrer dans la zone dense : à ×5
 * on retire 12 postes, à ×3 on en retire 26 — dont de vraies surfacturations.
 * Le re-mesurer sur le stock avant d'y toucher.
 */
export const RATIO_RAPPROCHEMENT_INVRAISEMBLABLE = 8;

/**
 * 🔴 POURQUOI UN POSTE N'EST PAS CHIFFRABLE — LA RÈGLE, EN UN SEUL ENDROIT.
 *
 * Extrait le 2026-09-15 après un constat à l'écran : le hero annonçait 870 €
 * et le détail affichait encore une carte 🔴 « Anomalie marché » à 4 809 €
 * contre 1 072-2 228 €. Le groupe était sorti du MONTANT, pas de la CARTE —
 * parce que le serveur appliquait ses gardes et que `classifyRowEnriched`,
 * côté client, n'en connaissait aucune. Deux réponses à la même question sur
 * la même page, c'est précisément ce que la règle « source de vérité unique »
 * interdit.
 *
 * ⚠️ NE PAS RECOPIER CES CONDITIONS AILLEURS. Tout consommateur — chiffrage
 * serveur, badge de carte, pastille de répartition — passe par ici.
 */
export type MotifNonChiffrable =
  | "forfait"
  | "unite_incomparable"
  | "surface_non_precisee"
  | "groupe_heterogene"
  | "tarif_main_doeuvre"
  | "rapprochement_invraisemblable"
  | "poste_superieur_au_devis";

/**
 * Rend le motif pour lequel ce poste ne peut pas porter un écart chiffré, ou
 * `null` s'il est comparable.
 *
 * `totalDevisHT` est optionnel : sans lui, la garde « un poste ne pèse pas plus
 * que le devis entier » ne peut simplement pas s'appliquer.
 */
export function motifNonChiffrable(
  group: Record<string, any>,
  totalDevisHT?: number | null,
): MotifNonChiffrable | null {
  const unit = String(group?.main_unit ?? "").toLowerCase().trim();
  if (FORFAIT_UNIT_KEYWORDS.some((kw) => unit === kw || unit.startsWith(kw))) return "forfait";
  if (hasSurfaceUnitMismatch(group)) return "surface_non_precisee";
  if (hasIncomparableUnit(group)) return "unite_incomparable";
  if (isLikelyHeterogeneousGroup(group)) return "groupe_heterogene";

  const devisTotal = Number(group?.devis_total_ht) || 0;
  const qty = typeof group?.main_quantity === "number" && group.main_quantity > 0 ? group.main_quantity : 1;
  // Règle unique : jamais unitaire + forfait (cf. `bornesMarche`).
  const plafond = bornesMarche(group?.prices, qty, group?.main_unit).max;
  if (plafond <= 0 || devisTotal <= 0) return null; // rien à opposer : ce n'est pas un refus

  if (devisTotal / plafond > RATIO_RAPPROCHEMENT_INVRAISEMBLABLE) return "rapprochement_invraisemblable";
  if (tarifMainDoeuvreFaceAFourniture(group)) return "tarif_main_doeuvre";

  const totalHT = typeof totalDevisHT === "number" && totalDevisHT > 0 ? totalDevisHT : null;
  if (totalHT !== null && devisTotal > totalHT * 1.02) return "poste_superieur_au_devis";

  return null;
}

/**
 * Les motifs qui interdisent AUSSI d'afficher un verdict de prix sur la carte.
 *
 * ⚠️ `groupe_heterogene` en est volontairement ABSENT : côté carte, un groupe
 * mélangé est rétrogradé en « légèrement élevé » plutôt que mis en doute total
 * (garde V3.4, comportement en place et mesuré). Le basculer ici changerait le
 * badge de dizaines de postes — c'est une décision à mesurer à part, pas un
 * effet de bord de ce correctif.
 * ⚠️ `forfait` et `surface_non_precisee` non plus : la carte les traite déjà,
 * avec leurs propres libellés (« Surface à vérifier »), plus précis que
 * « non vérifiable ».
 */
export const MOTIFS_SANS_VERDICT_DE_PRIX: ReadonlySet<MotifNonChiffrable> = new Set([
  "unite_incomparable",
  "tarif_main_doeuvre",
  "rapprochement_invraisemblable",
  "poste_superieur_au_devis",
]);

export interface PosteEcart {
  label: string;
  ecart: number;
  /**
   * devis_total_ht ÷ plafond marché. Sert à la garde de plausibilité et aux
   * bancs. ⚠️ Optionnel à dessein : un dépassement MATÉRIEL (comparé au prix
   * distributeur relevé, cf. `materielReference.ts`) rejoint cette liste sans
   * ratio catalogue — lui en inventer un le rendrait indistinguable.
   */
  ratio?: number;
}

export interface SurcoutServeur {
  /** Borne basse affichée. Depuis le 2026-09-15, min === max === brut. */
  min: number;
  /** Borne haute affichée. Depuis le 2026-09-15, min === max === brut. */
  max: number;
  /** Somme brute non arrondie — sert aux bancs de mesure. */
  brut: number;
  /** Les postes qui composent l'écart. Leur somme EST le montant affiché. */
  postes: PosteEcart[];
  /**
   * Groupes qui portaient un écart et dont une garde a interdit le chiffrage,
   * avec le motif ET le montant retiré. Le montant est indispensable : sans
   * lui, un banc ne peut pas mesurer ce que la garde coûte ou fait gagner.
   */
  ecartes: Array<{ label: string; motif: string; detail?: string; ecart: number }>;
}

/**
 * Calcule le surcoût total côté serveur depuis les données brutes priceData.
 *
 * Surcoût = Σ (devis_total_ht − theoreticalMaxHT) pour les postes où devis > max
 * theoreticalMaxHT = Σ (price_max_unit_ht × qty + fixed_max_ht)
 *
 * `totalDevisHT` est optionnel mais fortement recommandé : sans lui, la garde
 * de plausibilité par poste ne peut pas s'appliquer.
 */
export function computeServerSurcout(
  priceData: unknown[],
  totalDevisHT?: number | null,
): SurcoutServeur {
  if (!Array.isArray(priceData)) return { min: 0, max: 0, brut: 0, postes: [], ecartes: [] };

  let brut = 0;
  const postes: PosteEcart[] = [];
  const ecartes: Array<{ label: string; motif: string; detail?: string; ecart: number }> = [];
  const totalHT = typeof totalDevisHT === "number" && totalDevisHT > 0 ? totalDevisHT : null;

  // Un montant qu'on ne sait pas nommer n'a pas le droit d'être affiché
  // (règle du 2026-08-30). On descend donc jusqu'à la description de la
  // première ligne plutôt que de renoncer au nom — et à défaut de tout, le
  // poste est écarté du chiffrage plus bas.
  const nommer = (group: Record<string, any>): string => {
    const etiquette = typeof group.job_type_label === "string" ? group.job_type_label.trim() : "";
    if (etiquette) return etiquette;
    const jt = typeof group.job_type === "string" ? group.job_type.trim() : "";
    if (jt) return jt;
    const lignes: any[] = Array.isArray(group.devis_lines) ? group.devis_lines : [];
    const desc = lignes.find((l) => typeof l?.description === "string" && l.description.trim());
    return desc ? String(desc.description).trim().split("\n")[0].slice(0, 80) : "";
  };

  for (const g of priceData) {
    if (!g || typeof g !== "object") continue;
    const group = g as Record<string, any>;

    if (group.job_type_label === "Autre") continue;

    const devisTotal: number = typeof group.devis_total_ht === "number" ? group.devis_total_ht : 0;
    if (devisTotal <= 0) continue;

    const prices: any[] = Array.isArray(group.prices) ? group.prices : [];
    if (prices.length === 0) continue;

    const qty: number =
      typeof group.main_quantity === "number" && group.main_quantity > 0 ? group.main_quantity : 1;

    // Règle unique : jamais unitaire + forfait (cf. `bornesMarche`).
    const theoreticalMaxHT = bornesMarche(prices, qty, group.main_unit).max;
    if (theoreticalMaxHT <= 0) continue;
    if (devisTotal <= theoreticalMaxHT) continue;

    const ecart = devisTotal - theoreticalMaxHT;
    const ratio = devisTotal / theoreticalMaxHT;
    const label = nommer(group);

    // 🔴 L'INVARIANT : on n'additionne QUE ce qu'on sait nommer. Sinon le total
    // affiché dépasse la somme du détail, et le lecteur repart avec un montant
    // qu'aucune ligne ne porte (règle du 2026-09-05).
    if (!label) {
      ecartes.push({ label: "(poste sans libellé)", motif: "aucun nom à donner au poste", ecart: Math.round(ecart) });
      continue;
    }

    // 🔴 TOUTES LES EXCLUSIONS PASSENT PAR `motifNonChiffrable` — une seule
    // définition, partagée avec l'affichage des cartes. Recopier une condition
    // ici, c'est reconstruire la contradiction du 15/09 : le poste sorti du
    // montant mais gardant sa carte rouge « Anomalie marché ».
    const motif = motifNonChiffrable(group, totalHT);
    if (motif) {
      ecartes.push({
        label,
        motif,
        ...(motif === "rapprochement_invraisemblable"
          ? { detail: `×${ratio.toFixed(1)} le plafond marché` }
          : {}),
        ecart: Math.round(ecart),
      });
      continue;
    }

    brut += ecart;
    postes.push({ label, ecart: Math.round(ecart), ratio });
  }

  postes.sort((a, b) => b.ecart - a.ecart);

  // 🔴 Le montant affiché EST la somme des postes nommés — à l'arrondi près,
  // et l'arrondi se fait sur la somme, jamais poste par poste (sinon le détail
  // ne retombe pas sur le total).
  const montant = Math.round(brut);
  return { min: montant, max: montant, brut, postes, ecartes };
}
