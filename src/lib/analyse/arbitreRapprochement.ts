/**
 * arbitreRapprochement.ts — UNE IA QUI NE JUGE PAS LE VERDICT, MAIS LA RÉFÉRENCE.
 *
 * 2026-09-15, décision Johan après mesure.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 🔴 CE QU'ELLE FAIT, ET CE QU'ELLE NE FAIT PAS.
 *
 * Elle répond à **une seule question vérifiable** : *cette entrée catalogue
 * décrit-elle la même prestation que cette ligne de devis ?* Elle ne lit pas le
 * verdict, ne voit aucun prix, ne propose aucune correction de texte.
 *
 * ❌ **Lui faire relire le VERDICT est une piste fermée par la mesure** (30/08) :
 * le relecteur disait « corriger » sur 37/37 du gold standard ET sur 15 des 16
 * analyses témoins jamais signalées. Il détecte, il ne tranche pas. Ne pas
 * rouvrir cette porte sans une mesure nouvelle.
 *
 * ❌ **Son désaccord ne SUPPRIME jamais un prix.** Mesuré : elle conteste 21 à
 * 26 % des références JUSTES. Supprimer sur sa parole coûterait un quart des
 * prix exacts. Elle **route l'analyse vers la relecture humaine** — c'est
 * l'humain qui tranche, et c'est ce qui rend son taux de fausse alerte
 * acceptable.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * MESURÉ AVANT LIVRAISON ([`scripts/banc-arbitre-rapprochement.mjs`](../../../scripts/banc-arbitre-rapprochement.mjs)) :
 * témoin sur 30 lignes de l'étalon dont le prix est RÉELLEMENT affiché, bonne
 * réponse connue de deux juges — **11 références fausses, elle en conteste 10 ;
 * 19 justes, elle en conteste 5 à tort**. Volume : ~2,5 analyses/mois.
 */

import { computeServerSurcout } from "./surcoutServeur";

/**
 * ⚠️ `gemini-2.5-flash`, et c'est MESURÉ, pas supposé.
 *
 * Le témoin a été repassé intégralement avec les deux modèles : flash rattrape
 * 10 des 11 références fausses (pro : 9) et conteste 5 des 19 justes (pro : 4)
 * — l'écart est du bruit à 30 observations. Pour **4,7 s au lieu de 11,6** et
 * huit fois moins cher.
 *
 * ⚠️ La règle du fichier CLAUDE.md « 2.5-flash trop créatif pour le catalogue »
 * vise une tâche DIFFÉRENTE : là-bas le modèle devait produire un identifiant
 * `job_type` en texte libre, et il en inventait. Ici il choisit un ENTIER parmi
 * cinq, avec sortie JSON contrainte — il ne peut rien inventer.
 *
 * ⚠️ Changer ce modèle PÉRIME le témoin. Repasser le banc avant.
 */
export const MODELE_ARBITRE = "gemini-2.5-flash";

/**
 * Au-delà, l'analyse part de toute façon en revue pour d'autres raisons, et
 * lancer trente appels en parallèle sur un devis pathologique mettrait en péril
 * le budget de la route. Les postes sont triés par écart décroissant : on
 * arbitre l'argent, pas la longueur du devis.
 */
export const MAX_POSTES_ARBITRES = 8;

/** Budget par appel. Mesuré à 4,7 s en médiane ; 15 s laisse trois fois la marge. */
export const TIMEOUT_APPEL_MS = 15_000;

/**
 * Seuils de MATÉRIALITÉ de la contestation.
 *
 * 🔴 Sans eux, le déclencheur compte « l'IA a choisi une autre entrée » — et
 * 28 % de ces contestations désignent un QUASI-SYNONYME du catalogue (« Mur
 * parpaing 20 cm » contre « Construction mur parpaing 20 cm »). Le montant ne
 * bouge pas : router une analyse en relecture pour ça est du bruit pur, et une
 * file de revue bruyante finit par ne plus être lue.
 * 300 € est le plancher d'affichage d'un montant ; 20 % le seuil sous lequel ni
 * le verdict ni la phrase ne changent.
 */
export const SEUIL_EFFET_EUR = 300;
export const SEUIL_EFFET_PART = 0.2;

export interface CandidatCatalogue {
  job_type?: string;
  label?: string;
  similarity?: number;
}

export interface PosteAArbitrer {
  /** Notre étiquette catalogue — sert au journal, jamais au jugement. */
  label: string;
  /** Ce que dit le DEVIS. C'est l'objet du jugement. */
  ligne: string;
  contexte: string;
  candidats: CandidatCatalogue[];
  /** Rang, dans le top-5, de l'entrée que la production a retenue. */
  rangUtilise: number;
  ecart: number;
  devisTotal: number;
  qte: number;
}

export interface AvisArbitre {
  label: string;
  ligne: string;
  /** Rang choisi : 1-5, 0 = aucune entrée ne convient, -1 = ligne injugeable. */
  choix: number;
  raison: string;
  /** Étiquette proposée en remplacement, quand il en propose une. */
  propose: string | null;
  proposeJobType: string | null;
  ecart: number;
}

// ── La consigne — identique à celle du banc, mot pour mot ────────────────────
// ⚠️ Toute retouche de ce texte invalide le témoin. Le banc l'importe d'ici
// précisément pour que production et mesure ne puissent pas diverger.
export const CONSIGNE_ARBITRE = `Tu relis le rapprochement entre une LIGNE DE DEVIS d'artisan et notre catalogue de prix de référence.

Question : lequel des postes proposés décrit LA MÊME PRESTATION que la ligne de devis ?
Réponds par son numéro. Réponds 0 si AUCUN ne convient — c'est une réponse aussi utile que les autres, elle signale qu'il manque une entrée au catalogue. Réponds -1 si la ligne du devis est trop mal rédigée pour être jugée.

Ce n'est PAS une question de prix : les fourchettes ne te sont pas montrées. On veut savoir si la comparaison a un sens.

Repères :
- un tarif "pose" ou "MO" ne convient pas à une ligne qui fournit le matériel, et inversement ;
- l'unité compte : un tarif au m² ne convient pas à une ligne facturée au forfait sans surface ;
- un tarif qui décrit UN COMPOSANT ne convient pas à une ligne qui couvre TOUT UN LOT ;
- une DÉPOSE n'est pas une POSE.

Réponds uniquement en JSON : {"choix": <entier>, "raison": "<15 mots max>"}`;

/** Graine stable dérivée d'une chaîne — le mélange doit être reproductible. */
export function grainePour(cle: string): number {
  let h = 0;
  for (const c of cle) h = (h * 31 + c.charCodeAt(0)) % 2147483648;
  return (h * 7919) % 2147483648;
}

/**
 * 🔴 L'ORDRE PRÉSENTÉ N'EST JAMAIS L'ORDRE DU VECTORIEL, ET C'EST ESSENTIEL.
 * Sans mélange, un modèle qui répondrait « 1 » par réflexe afficherait un accord
 * parfait avec notre top-1 sans avoir rien jugé — et on conclurait « aucune
 * contestation » en ayant mesuré un automatisme. Le mélange est déterministe
 * pour qu'une même ligne soit toujours présentée pareil (reproductibilité).
 */
export function melangeDeterministe<T>(arr: T[], graine: number): T[] {
  const a = [...arr];
  let x = graine;
  const suivant = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(suivant() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function construirePrompt(ligne: string, contexte: string, labels: string[]): string {
  return `${CONSIGNE_ARBITRE}\n\nLIGNE DE DEVIS : ${ligne}\nContexte : ${contexte || "non précisé"}\n\nPOSTES PROPOSÉS :\n` +
    labels.map((l, i) => `${i + 1}. ${l}`).join("\n");
}

/**
 * Lit la réponse et la REMET dans la numérotation d'origine (rang vectoriel).
 * Retourne `null` si la réponse est inexploitable — le silence vaut mieux
 * qu'un rang inventé.
 */
export function interpreterChoix(
  texte: string,
  ordre: Array<{ rangVectoriel: number }>,
): { choix: number; raison: string } | null {
  let p: Record<string, unknown>;
  try {
    const bloc = texte.match(/\{[\s\S]*\}/);
    if (!bloc) return null;
    p = JSON.parse(bloc[0]);
  } catch { return null; }
  const presente = Number(p.choix);
  if (!Number.isFinite(presente)) return null;
  const choix = presente >= 1 && presente <= ordre.length ? ordre[presente - 1].rangVectoriel : presente;
  if (choix < -1 || choix > ordre.length) return null;
  return { choix, raison: String(p.raison ?? "").slice(0, 160) };
}

/**
 * La contestation change-t-elle ce qu'on annonce au client ?
 *
 * `ecartAlternatif` vaut `null` quand on ne sait pas le calculer (l'arbitre dit
 * « aucune entrée ne convient », ou l'entrée proposée n'existe plus au
 * catalogue). Dans ce cas la contestation est MATÉRIELLE par défaut : ne pas
 * savoir recalculer n'est pas une raison de se taire.
 */
export function contestationMaterielle(
  ecartActuel: number,
  ecartAlternatif: number | null,
): { materiel: boolean; motif: string } {
  if (ecartAlternatif === null) {
    return { materiel: true, motif: "aucune référence opposable retenue par l'arbitre" };
  }
  const delta = Math.abs(ecartAlternatif - ecartActuel);
  const materiel = delta >= SEUIL_EFFET_EUR && delta >= ecartActuel * SEUIL_EFFET_PART;
  return {
    materiel,
    motif: materiel
      ? `l'écart passerait de ${Math.round(ecartActuel)} € à ${Math.round(ecartAlternatif)} €`
      : "même montant à quelques euros près (entrées quasi équivalentes)",
  };
}

/**
 * Quels postes soumettre à l'arbitre ?
 *
 * ⚠️ La règle de chiffrage est IMPORTÉE et appliquée GROUPE PAR GROUPE : un
 * poste n'est soumis que s'il est réellement chiffré aujourd'hui, gardes
 * comprises. Recopier ici la liste des filtres ferait diverger l'arbitre de ce
 * que la page affiche — et il jugerait des postes que personne ne voit.
 */
export function postesAArbitrer(
  priceData: unknown[],
  totalHT: number | null,
): PosteAArbitrer[] {
  if (!Array.isArray(priceData)) return [];
  const postes: PosteAArbitrer[] = [];

  for (const g of priceData) {
    if (!g || typeof g !== "object") continue;
    const groupe = g as Record<string, any>;
    const r = computeServerSurcout([groupe], totalHT);
    if (r.postes.length === 0) continue;

    const candidats: CandidatCatalogue[] = Array.isArray(groupe.vectorial?.all_candidates)
      ? groupe.vectorial.all_candidates
      : [];
    const utilise = groupe.prices?.[0]?.job_type ?? groupe.catalog_job_types?.[0] ?? null;
    const rangUtilise = candidats.findIndex((c) => c.job_type === utilise) + 1;
    // Sans top-5, l'arbitre n'a rien à lire — c'est le cas des analyses V3.6
    // antérieures au matcher vectoriel. On ne les invente pas.
    if (candidats.length === 0 || rangUtilise === 0) continue;

    const lignes: any[] = Array.isArray(groupe.devis_lines) ? groupe.devis_lines : [];
    const ligne = String(lignes[0]?.description ?? groupe.job_type_label ?? "")
      .replace(/\s+/g, " ").trim().slice(0, 300);
    if (!ligne) continue;

    postes.push({
      label: String(groupe.job_type_label ?? ""),
      ligne,
      contexte: [
        groupe.main_quantity && `${groupe.main_quantity} ${groupe.main_unit ?? ""}`.trim(),
        groupe.devis_total_ht && `${groupe.devis_total_ht} € HT`,
      ].filter(Boolean).join(" · "),
      candidats,
      rangUtilise,
      ecart: r.postes[0].ecart,
      devisTotal: Number(groupe.devis_total_ht) || 0,
      qte: typeof groupe.main_quantity === "number" && groupe.main_quantity > 0 ? groupe.main_quantity : 1,
    });
  }

  // L'argent d'abord : si on doit plafonner, on garde les plus gros écarts.
  return postes.sort((a, b) => b.ecart - a.ecart).slice(0, MAX_POSTES_ARBITRES);
}

/** Écart qu'on annoncerait si l'on retenait l'entrée proposée par l'arbitre. */
export function ecartAvecTarif(
  devisTotal: number,
  qte: number,
  tarif: { price_max_unit_ht?: number | null; fixed_max_ht?: number | null } | null | undefined,
): number | null {
  if (!tarif) return null;
  const plafond = (Number(tarif.price_max_unit_ht) || 0) * qte + (Number(tarif.fixed_max_ht) || 0);
  if (plafond <= 0) return null;
  return Math.max(0, devisTotal - plafond);
}

// ── Exécution ────────────────────────────────────────────────────────────────

export interface ResultatArbitrage {
  modele: string;
  postes_juges: number;
  /** Contestations qui CHANGENT le montant — ce sont elles qui routent en revue. */
  conteste: AvisArbitre[];
  /**
   * Somme des écarts contestés. C'est ELLE qui décide du routage, pas le
   * nombre de contestations : sur un devis où l'on annonce 5 000 €, contester
   * un poste à 65 € ne justifie pas de mobiliser un humain.
   */
  ecart_conteste: number;
  /** Contestations sans effet sur le montant (quasi-doublons). Comptées, pas routées. */
  sans_effet: number;
  /** Appels qui n'ont rien rendu (timeout, quota, JSON illisible). */
  echecs: number;
  duree_ms: number;
}

export type TarifsParJobType = Map<string, { price_max_unit_ht?: number | null; fixed_max_ht?: number | null }>;

/**
 * Soumet les postes à l'arbitre et rend la liste des contestations matérielles.
 *
 * ⚠️ **Best-effort par construction.** Un échec d'appel ne doit JAMAIS empêcher
 * une analyse de se terminer : sans arbitre, on retombe exactement sur le
 * comportement d'avant le 15/09 — le prix s'affiche. L'arbitre ajoute une
 * sécurité, il n'est pas une dépendance.
 *
 * ⚠️ `chargerTarifs` est INJECTÉ : ce module ne connaît ni Supabase ni la forme
 * de la table, ce qui le rend testable sans base.
 */
export async function arbitrerRapprochements(
  postes: PosteAArbitrer[],
  apiKey: string,
  chargerTarifs: (jobTypes: string[]) => Promise<TarifsParJobType>,
): Promise<ResultatArbitrage> {
  const t0 = Date.now();
  const vide: ResultatArbitrage = {
    modele: MODELE_ARBITRE, postes_juges: 0, conteste: [], ecart_conteste: 0, sans_effet: 0, echecs: 0, duree_ms: 0,
  };
  if (!apiKey || postes.length === 0) return vide;

  const jugements = await Promise.all(postes.map(async (p) => {
    const ordre = melangeDeterministe(
      p.candidats.map((c, i) => ({ ...c, rangVectoriel: i + 1 })),
      grainePour(`${p.label}|${p.ligne}`),
    );
    const prompt = construirePrompt(p.ligne, p.contexte, ordre.map((o) => String(o.label ?? "")));
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODELE_ARBITRE}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 8192, responseMimeType: "application/json" },
          }),
          signal: AbortSignal.timeout(TIMEOUT_APPEL_MS),
        },
      );
      if (!r.ok) return { poste: p, avis: null };
      const j = await r.json();
      const texte = j?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof texte !== "string") return { poste: p, avis: null };
      return { poste: p, avis: interpreterChoix(texte, ordre) };
    } catch {
      return { poste: p, avis: null };
    }
  }));

  const echecs = jugements.filter((x) => x.avis === null).length;
  // Une ligne « injugeable même par un humain » (-1) n'est pas une contestation.
  const contestations = jugements.filter(
    (x) => x.avis !== null && x.avis.choix !== -1 && x.avis.choix !== x.poste.rangUtilise,
  );

  // Un seul aller-retour en base pour toutes les entrées proposées.
  const proposes = [...new Set(contestations
    .map((x) => x.poste.candidats[(x.avis as { choix: number }).choix - 1]?.job_type)
    .filter((j): j is string => Boolean(j)))];
  const tarifs = proposes.length > 0 ? await chargerTarifs(proposes) : (new Map() as TarifsParJobType);

  const conteste: AvisArbitre[] = [];
  let sansEffet = 0;
  for (const { poste, avis } of contestations) {
    const a = avis as { choix: number; raison: string };
    const candidat = a.choix > 0 ? poste.candidats[a.choix - 1] : null;
    const ecartAlt = candidat?.job_type
      ? ecartAvecTarif(poste.devisTotal, poste.qte, tarifs.get(candidat.job_type))
      : null;
    const { materiel, motif } = contestationMaterielle(poste.ecart, ecartAlt);
    if (!materiel) { sansEffet++; continue; }
    conteste.push({
      label: poste.label,
      ligne: poste.ligne.slice(0, 160),
      choix: a.choix,
      raison: `${a.raison} — ${motif}`,
      propose: candidat?.label ?? null,
      proposeJobType: candidat?.job_type ?? null,
      ecart: poste.ecart,
    });
  }

  return {
    modele: MODELE_ARBITRE,
    postes_juges: postes.length,
    conteste,
    ecart_conteste: Math.round(conteste.reduce((s, c) => s + c.ecart, 0)),
    sans_effet: sansEffet,
    echecs,
    duree_ms: Date.now() - t0,
  };
}
