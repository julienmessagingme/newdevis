/**
 * src/lib/seo/internalLinking.ts
 *
 * Module de maillage interne contextuel. Pour chaque page, on tag ses topics,
 * et le système propose 3-4 liens contextuels vers d'autres pages du cocon.
 *
 * Convention : chaque page est taggée avec 1 à 3 `topics` (devis, prix, artisan,
 * litige, chantier). Le helper getRelatedLinks() retourne des liens qui partagent
 * au moins un topic, en excluant la page courante.
 */

export type Topic =
  | "devis"
  | "verifier"
  | "prix"
  | "artisan"
  | "litige"
  | "chantier"
  | "negociation"
  | "comparateur"
  | "signature"
  | "tva"
  | "acompte"
  | "aides";

export interface InternalLink {
  href: string;
  title: string;
  excerpt: string;
  topics: Topic[];
  type: "pillar" | "guide" | "tool" | "study" | "litige";
}

/**
 * Catalogue des pages internes par topics.
 *
 * IMPORTANT : à mettre à jour à chaque nouvelle page pilier/guide/litige.
 * Convention : la plus importante en premier dans son topic.
 */
export const INTERNAL_PAGES: InternalLink[] = [
  // ─── Pages piliers (autorité forte) ─────────────────────────────────────
  {
    href: "/guides/devis-travaux",
    title: "Le guide complet du devis travaux",
    excerpt: "Comprendre, comparer, négocier, refuser : tout ce qu'il faut savoir sur un devis travaux.",
    topics: ["devis", "verifier"],
    type: "pillar",
  },
  {
    href: "/verifier-mon-devis",
    title: "Vérifier un devis avec notre IA",
    excerpt: "Outil gratuit. Comparez votre devis à 891 prix marché en 30 secondes.",
    topics: ["devis", "verifier", "comparateur"],
    type: "tool",
  },
  {
    href: "/guides/comparer-plusieurs-devis",
    title: "Comparer plusieurs devis : la méthode experte",
    excerpt: "Quels critères au-delà du prix ? Postes omis, quantités, matériel, clauses.",
    topics: ["comparateur", "devis"],
    type: "guide",
  },
  {
    href: "/guides/negocier-un-devis",
    title: "Négocier un devis travaux",
    excerpt: "Les 5 leviers concrets pour obtenir 3 à 10% de remise sans froisser l'artisan.",
    topics: ["devis", "negociation"],
    type: "guide",
  },
  {
    href: "/guides/refuser-un-devis",
    title: "Comment refuser un devis (sans frais)",
    excerpt: "Cadre légal, délais, modèles de réponse.",
    topics: ["devis", "litige"],
    type: "guide",
  },
  {
    href: "/guides/signer-un-devis",
    title: "Signer un devis en sécurité",
    excerpt: "Les 7 vérifications avant signature : clauses, acompte, assurances, SIRET.",
    topics: ["devis", "signature"],
    type: "guide",
  },
  {
    href: "/guides/comprendre-un-devis",
    title: "Comprendre un devis travaux ligne à ligne",
    excerpt: "Décrypter unités, prix unitaires, forfaits, TVA, options.",
    topics: ["devis", "verifier"],
    type: "guide",
  },
  {
    href: "/guides/choisir-un-artisan",
    title: "Choisir un artisan : la checklist",
    excerpt: "SIRET, assurance décennale, avis Google, ancienneté, références.",
    topics: ["artisan", "devis"],
    type: "guide",
  },
  {
    href: "/guides/comprendre-le-verdict-vmd",
    title: "Comment lire le verdict VMD",
    excerpt: "Vert, orange, rouge : ce que chaque verdict veut dire concrètement.",
    topics: ["verifier"],
    type: "guide",
  },

  // ─── Prix travaux ──────────────────────────────────────────────────────
  {
    href: "/prix-travaux",
    title: "Prix des travaux : tout savoir",
    excerpt: "Fourchettes prix marché par métier, mises à jour avec les vrais devis.",
    topics: ["prix"],
    type: "pillar",
  },
  {
    href: "/prix-travaux/renovation-maison",
    title: "Prix rénovation maison complète",
    excerpt: "Coût au m² selon l'ampleur. Exemples chiffrés.",
    topics: ["prix"],
    type: "guide",
  },

  // ─── Litiges ───────────────────────────────────────────────────────────
  {
    href: "/litiges",
    title: "Litiges travaux : que faire ?",
    excerpt: "Acompte excessif, retard, malfaçon, abandon : démarches et recours.",
    topics: ["litige"],
    type: "pillar",
  },
  {
    href: "/litiges/surcout",
    title: "Surcoût travaux non prévu",
    excerpt: "Comment contester un surcoût ajouté en cours de chantier.",
    topics: ["litige", "chantier"],
    type: "litige",
  },

  // ─── Comparateurs concurrents ──────────────────────────────────────────
  {
    href: "/comparateurs/plateformes",
    title: "Comparer les plateformes de devis",
    excerpt: "Travaux Ninja, HabitatPresto, Travaux.com, Quotatis : avis et alternatives.",
    topics: ["comparateur"],
    type: "pillar",
  },

  // ─── Gestion chantier (passerelle GMC) ─────────────────────────────────
  {
    href: "/gestion-de-chantier",
    title: "Piloter son chantier après signature",
    excerpt: "Budget, planning, artisans : tout depuis un seul tableau de bord.",
    topics: ["chantier"],
    type: "pillar",
  },

  // ─── Études VMD (données réelles) ──────────────────────────────────────
  {
    href: "/etudes-vmd/erreurs-frequentes",
    title: "Étude VMD : les erreurs les plus fréquentes",
    excerpt: "Données réelles sur 348 devis analysés. Quels métiers, quels postes.",
    topics: ["verifier", "prix"],
    type: "study",
  },
  {
    href: "/etudes-vmd/postes-surfactures",
    title: "Étude VMD : les postes les plus surfacturés",
    excerpt: "Top 10 des postes où l'écart entre devis et marché est le plus élevé.",
    topics: ["prix", "verifier"],
    type: "study",
  },
];

/**
 * Retourne N liens contextuels pour la page courante.
 *
 * Algorithme :
 *   1. Filtre les liens qui partagent ≥ 1 topic avec ceux de la page courante
 *   2. Exclut le href de la page courante
 *   3. Priorise les piliers puis les guides puis les outils
 *   4. Limite à N résultats
 */
export function getRelatedLinks(
  pageTopics: Topic[],
  currentHref: string,
  options?: { count?: number; excludeTypes?: InternalLink["type"][] },
): InternalLink[] {
  const count = options?.count ?? 4;
  const excludeTypes = new Set(options?.excludeTypes ?? []);
  const candidates = INTERNAL_PAGES
    .filter((p) => !excludeTypes.has(p.type))
    .filter((p) => p.href !== currentHref)
    .filter((p) => p.topics.some((t) => pageTopics.includes(t)));

  // Score = nb de topics partagés + bonus pilier/study
  candidates.sort((a, b) => {
    const aShared = a.topics.filter((t) => pageTopics.includes(t)).length;
    const bShared = b.topics.filter((t) => pageTopics.includes(t)).length;
    if (aShared !== bShared) return bShared - aShared;
    const typeBonus: Record<InternalLink["type"], number> = {
      pillar: 4, study: 3, guide: 2, tool: 1, litige: 1,
    };
    return typeBonus[b.type] - typeBonus[a.type];
  });

  return candidates.slice(0, count);
}
