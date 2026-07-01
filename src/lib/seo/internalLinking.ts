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
    topics: ["devis", "verifier", "negociation", "signature", "artisan"],
    type: "pillar",
  },
  {
    href: "/verifier-devis-travaux",
    title: "Vérifier un devis avec notre IA",
    excerpt: "Outil gratuit. Comparez votre devis à 891 prix marché en 30 secondes.",
    topics: ["devis", "verifier", "comparateur"],
    type: "tool",
  },
  {
    href: "/comparateur",
    title: "Comparer plusieurs devis",
    excerpt: "Analysez et comparez plusieurs devis pour un même chantier avec un verdict expert.",
    topics: ["comparateur", "devis"],
    type: "tool",
  },

  // ─── Prix travaux ──────────────────────────────────────────────────────
  {
    href: "/prix-travaux-maison",
    title: "Prix des travaux maison",
    excerpt: "Fourchettes prix marché rénovation maison, mises à jour avec les vrais devis.",
    topics: ["prix"],
    type: "pillar",
  },
  {
    href: "/devis-piscine-prix",
    title: "Prix d'un devis piscine",
    excerpt: "Coût, prestations, fourchettes 2026.",
    topics: ["prix"],
    type: "guide",
  },

  // ─── Gestion chantier (passerelle GMC) ─────────────────────────────────
  {
    href: "/application-gestion-chantier",
    title: "Piloter son chantier après signature",
    excerpt: "Budget, planning, artisans : tout depuis un seul tableau de bord.",
    topics: ["chantier"],
    type: "pillar",
  },
  {
    href: "/gestion-artisans-travaux",
    title: "Coordonner les artisans du chantier",
    excerpt: "Un tableau de bord pour suivre tous les intervenants au même endroit.",
    topics: ["chantier", "artisan"],
    type: "guide",
  },
  {
    href: "/gestion-documents-chantier",
    title: "Centraliser les documents du chantier",
    excerpt: "Devis, factures, photos, contrats : tout au même endroit.",
    topics: ["chantier"],
    type: "guide",
  },

  // ─── Études VMD (données réelles) ──────────────────────────────────────
  {
    href: "/observatoire",
    title: "Observatoire des devis travaux",
    excerpt: "Statistiques réelles sur des centaines de devis analysés : prix, erreurs, anomalies.",
    topics: ["verifier", "prix"],
    type: "study",
  },
  {
    href: "/observatoire/erreurs-frequentes",
    title: "Étude VMD : les erreurs les plus fréquentes",
    excerpt: "Données réelles sur les devis analysés. Quels métiers, quels postes.",
    topics: ["verifier", "prix"],
    type: "study",
  },
  {
    href: "/observatoire/postes-surfactures",
    title: "Étude VMD : les postes les plus surfacturés",
    excerpt: "Top des postes où l'écart entre devis et marché est le plus élevé.",
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
