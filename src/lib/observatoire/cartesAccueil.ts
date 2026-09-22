/**
 * src/lib/observatoire/cartesAccueil.ts
 *
 * LES CARTES DE L'OBSERVATOIRE SUR L'ACCUEIL — leurs compteurs viennent des
 * données publiées, jamais d'un nombre écrit à la main.
 *
 * 🔴 2026-09-23 — LES SEPT COMPTEURS DE L'ACCUEIL ÉTAIENT FAUX. Ils étaient
 * figés dans `index.astro` et n'avaient jamais suivi le rafraîchissement
 * hebdomadaire des JSON de l'observatoire :
 *
 *   | carte                   | affiché | réel |
 *   |-------------------------|--------:|-----:|
 *   | Prix salle de bain      |      56 |   64 |
 *   | Prix isolation          |      66 |   38 |
 *   | Prix rénovation cuisine |      22 |   25 |
 *   | Prix chauffage          |      37 |   36 |
 *   | Postes surfacturés      |     347 |  272 |
 *   | Erreurs de TVA          |     313 |  360 |
 *   | Prix menuiserie         |      81 |   78 |
 *
 * C'est exactement la famille de défaut documentée les 14 et 21/09 : une
 * promesse chiffrée affichée au public se périme dans un coin du site, et
 * personne ne s'en aperçoit parce qu'elle a l'air vraie. Un lecteur qui clique
 * sur « 66 devis analysés » et atterrit sur une page qui en annonce 38 ne
 * retient qu'une chose : nos chiffres ne tiennent pas.
 *
 * ⚠️ IMPORT STATIQUE, JAMAIS `fs`. `src/pages/index.astro` est en
 * `prerender = false` : le runtime serverless de Vercel n'embarque pas `src/`,
 * donc un `readFileSync` y rendrait un fichier introuvable — le trou noir
 * silencieux du 01/07 sur le hub `/observatoire`. Vite résout ces imports au
 * BUILD et les embarque dans le bundle, comme `src/lib/prix/reference.ts`.
 *
 * ⚠️ UNE CLÉ MANQUANTE FAIT ÉCHOUER LE BUILD, et c'est voulu : afficher
 * « — devis analysés » serait pire que ne rien publier. Les JSON sont
 * régénérés chaque lundi par `refresh-donnees-publiees.yml`.
 */

import salleDeBain from "@/data/observatoire/chantiers/salle-de-bain.json";
import isolation from "@/data/observatoire/chantiers/isolation.json";
import cuisine from "@/data/observatoire/chantiers/cuisine.json";
import chauffage from "@/data/observatoire/chantiers/chauffage.json";
import menuiserie from "@/data/observatoire/metiers/menuiserie-vitrages.json";
import postesSurfactures from "@/data/observatoire/postes-surfactures.json";
import erreursTva from "@/data/observatoire/erreurs-tva.json";

export interface CarteObservatoire {
  titre: string;
  /** Ce que le lecteur lit sous le titre — porte toujours son unité. */
  compteur: string;
  href: string;
}

/** Les pages chantier et métier portent leur volume dans `kpis.nb_devis`. */
const nbDevis = (page: { kpis?: { nb_devis?: number } }): number => {
  const n = page?.kpis?.nb_devis;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    throw new Error(
      "observatoire : `kpis.nb_devis` absent ou nul — l'accueil ne peut pas annoncer un volume qu'on ne connaît pas.",
    );
  }
  return n;
};

/** Les études thématiques comptent des ANALYSES, pas des devis-chantier. */
const nbAnalyses = (etude: { totalAnalyses?: number }): number => {
  const n = etude?.totalAnalyses;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    throw new Error(
      "observatoire : `totalAnalyses` absent ou nul — voir le commentaire ci-dessus.",
    );
  }
  return n;
};

/**
 * ⚠️ L'ORDRE EST CELUI DE LA MAQUETTE VALIDÉE, et il n'est pas anodin : les
 * quatre chantiers les plus cherchés d'abord, les deux études ensuite, le
 * métier en dernier. Le CTA est rendu à part par la page — il n'a pas de
 * compteur et ne suit pas la même règle d'affichage.
 */
export const CARTES_OBSERVATOIRE: CarteObservatoire[] = [
  {
    titre: "Prix salle de bain",
    compteur: `${nbDevis(salleDeBain)} devis analysés`,
    href: "/observatoire/chantiers/salle-de-bain",
  },
  {
    titre: "Prix isolation",
    compteur: `${nbDevis(isolation)} devis analysés`,
    href: "/observatoire/chantiers/isolation",
  },
  {
    titre: "Prix rénovation cuisine",
    compteur: `${nbDevis(cuisine)} devis analysés`,
    href: "/observatoire/chantiers/cuisine",
  },
  {
    titre: "Prix chauffage",
    compteur: `${nbDevis(chauffage)} devis analysés`,
    href: "/observatoire/chantiers/chauffage",
  },
  {
    titre: "Postes les plus surfacturés",
    compteur: `Étude sur ${nbAnalyses(postesSurfactures)} devis`,
    href: "/observatoire/postes-surfactures",
  },
  {
    titre: "Erreurs de TVA fréquentes",
    compteur: `Étude sur ${nbAnalyses(erreursTva)} devis`,
    href: "/observatoire/erreurs-tva",
  },
  {
    titre: "Prix menuiserie",
    compteur: `${nbDevis(menuiserie)} devis analysés`,
    href: "/observatoire/metiers/menuiserie-vitrages",
  },
];
