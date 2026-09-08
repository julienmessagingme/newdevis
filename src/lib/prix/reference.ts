/**
 * src/lib/prix/reference.ts
 *
 * 2026-09-08 (décision Johan) — « Il ne peut pas y avoir 2 valorisations
 * différentes dans un même site. »
 *
 * L'audit du 07/09 a trouvé exactement ça : « peinture 15 à 35 €/m² » sur une
 * page, « 30 à 60 » sur une autre, quand le catalogue dit 18-65 ; carrelage
 * « 50-130 » contre « 90-170 » alors que le catalogue plafonne à 94 €. Des
 * tableaux écrits à la main divergent un peu plus à chaque enrichissement du
 * catalogue — il n'y a pas de discipline qui tienne sur la durée.
 *
 * Les fourchettes viennent désormais d'un fichier généré depuis `market_prices`
 * (`scripts/prix/generate-reference.ts`), lu au BUILD. Une page qui cite un
 * prix passe par ici ; il ne doit plus rester de nombre en dur.
 *
 * ⚠️ Ces prix sont HORS TAXES, comme tout le catalogue. Toute page qui les
 * affiche doit l'écrire : sinon le lecteur compare un HT à un devis TTC et
 * conclut que l'artisan le vole (ou l'inverse).
 */

import donnees from "@/data/prix/reference.json";

export interface PosteReference {
  /** Ce que le lecteur voit — dit toujours si la fourniture est comprise. */
  libelle: string;
  note: string;
  unite: string;
  min: number;
  moy: number;
  max: number;
  job_type: string;
  label_catalogue: string;
}

export type ClePoste = keyof typeof donnees.postes;

const POSTES = donnees.postes as Record<string, PosteReference>;

/** Date de génération du fichier — à afficher pour dater la référence. */
export const GENERE_LE: string = donnees.genereLe;

/**
 * Nombre d'entrées du catalogue, à la génération.
 *
 * Il est annoncé en page d'accueil (« plus de 900 références ») : le faire
 * porter par le fichier généré évite qu'une promesse chiffrée se périme dans un
 * coin du site sans que personne ne le voie.
 */
export const CATALOGUE_TAILLE: number = donnees.catalogueTaille ?? 0;

/**
 * Nombre d'analyses réalisées depuis le lancement.
 *
 * Un CUMUL, pas un rythme : la page affichait « +100 devis analysés chaque
 * mois », vrai en mars-avril (124 puis 104), faux en juillet-août (22 puis 29).
 * Un chiffre cumulé ne peut pas devenir faux dans le mauvais sens.
 */
export const ANALYSES_TOTAL: number = donnees.analysesTotal ?? 0;

/**
 * Un poste de référence.
 *
 * Lève si la clé est inconnue, volontairement : une page qui demande un poste
 * inexistant doit casser le BUILD, pas afficher « — » en production. Le
 * générateur échoue déjà de la même façon quand le catalogue ne couvre pas un
 * poste déclaré.
 */
export function poste(cle: ClePoste): PosteReference {
  const p = POSTES[cle as string];
  if (!p) throw new Error(`[prix/reference] poste inconnu : « ${String(cle)} »`);
  return p;
}

/** Tous les postes, dans l'ordre de déclaration du générateur. */
export function tousLesPostes(): Array<PosteReference & { cle: string }> {
  return Object.entries(POSTES).map(([cle, p]) => ({ cle, ...p }));
}

function nombre(n: number): string {
  return Math.round(n).toLocaleString("fr-FR");
}

/** « 18 à 65 € HT/m² » — la forme qui se lit dans une phrase. */
export function fourchette(cle: ClePoste): string {
  const p = poste(cle);
  return `${nombre(p.min)} à ${nombre(p.max)} € HT${suffixeUnite(p.unite)}`;
}

/** « 18-65 € HT/m² » — la forme compacte, pour une énumération ou un tableau. */
export function fourchetteCourte(cle: ClePoste): string {
  const p = poste(cle);
  return `${nombre(p.min)}-${nombre(p.max)} € HT${suffixeUnite(p.unite)}`;
}

/**
 * Le suffixe d'unité. Un forfait n'en prend aucun : « 5 100 à 11 900 € HT/forfait »
 * ne veut rien dire.
 */
export function suffixeUnite(unite: string): string {
  if (!unite || unite === "forfait") return "";
  if (unite === "unité") return " l'unité";
  return `/${unite}`;
}
