/**
 * src/lib/seo/centreAideConfig.ts
 *
 * Config centralisée du centre d'aide GérerMonChantier.
 *
 * - Une entrée par catégorie éditoriale.
 * - `status: "live"` = catégorie ouverte, ses articles sont indexés.
 * - `status: "coming_soon"` = tuile visible sur le hub principal (bon pour maillage
 *   interne + preview de la profondeur du site), landing noindex sur la page catégorie.
 *
 * Ajouter une nouvelle catégorie = ajouter une entrée ici + créer le dossier
 * src/content/centre-aide/<slug>/. Aucun fichier Astro à créer.
 */

export type CategoryStatus = "live" | "coming_soon";

export interface GmcModuleCta {
  /** Accroche affichée dans le CTA fin d'article. */
  hook: string;
  /** Libellé du bouton. */
  cta: string;
  /** URL de destination sur gerermonchantier.fr (avec UTM standardisé). */
  href: string;
}

export interface VmdCrossLink {
  href: string;
  label: string;
}

export interface CategoryConfig {
  label: string;
  slug: string;
  status: CategoryStatus;
  /** Icône emoji (une seule). Pas de dépendance à un pack. */
  icon: string;
  /** Sous-titre affiché sur les tuiles + le hub catégorie. */
  intro: string;
  gmcModule: GmcModuleCta;
  vmdCrossLinks: VmdCrossLink[];
}

const GMC_BASE = "https://www.gerermonchantier.fr";
const VMD_BASE = "https://www.verifiermondevis.fr";

function utm(campaign: string): string {
  const params = new URLSearchParams({
    utm_source: "gmc",
    utm_medium: "centre-aide",
    utm_campaign: campaign,
  });
  return params.toString();
}

export const CATEGORIES: Record<string, CategoryConfig> = {
  artisans: {
    label: "Problèmes avec les artisans",
    slug: "artisans",
    status: "live",
    icon: "👷",
    intro:
      "Retards, silence, abandon, malfaçon, refus de garantie. Les vraies procédures — amiables et juridiques — pour reprendre la main.",
    gmcModule: {
      hook:
        "Centralisez les échanges avec chaque artisan (WhatsApp, email, journal auto) et gardez une trace horodatée exploitable en cas de litige.",
      cta: "Tester GérerMonChantier — 30 jours gratuits",
      href: `${GMC_BASE}/beta?${utm("centre-aide-artisans")}`,
    },
    vmdCrossLinks: [
      { href: `${VMD_BASE}/nouvelle-analyse`, label: "Vérifier un devis d'artisan" },
      { href: `${VMD_BASE}/observatoire/postes-surfactures`, label: "Postes les plus surfacturés en 2026" },
    ],
  },
  budget: {
    label: "Maîtriser son budget",
    slug: "budget",
    status: "coming_soon",
    icon: "💰",
    intro:
      "Dépassement, imprévus, aides, trésorerie. Comment budgéter juste et tenir l'enveloppe jusqu'à la réception.",
    gmcModule: {
      hook: "Budget cible vs engagé vs décaissé, en temps réel, avec alerte dès qu'un dépassement se prépare.",
      cta: "Tester GérerMonChantier — 30 jours gratuits",
      href: `${GMC_BASE}/beta?${utm("centre-aide-budget")}`,
    },
    vmdCrossLinks: [
      { href: `${VMD_BASE}/observatoire/prix-variables`, label: "Les postes dont les prix varient le plus" },
    ],
  },
  planning: {
    label: "Tenir son planning",
    slug: "planning",
    status: "coming_soon",
    icon: "📅",
    intro:
      "Retards en cascade, artisans absents, dépendances entre lots. Comment reconstruire un planning réaliste et le faire tenir.",
    gmcModule: {
      hook: "Un planning CPM automatique qui recale toutes les dates dès qu'un lot glisse.",
      cta: "Tester GérerMonChantier — 30 jours gratuits",
      href: `${GMC_BASE}/beta?${utm("centre-aide-planning")}`,
    },
    vmdCrossLinks: [],
  },
  documents: {
    label: "Devis, factures, PV",
    slug: "documents",
    status: "coming_soon",
    icon: "📄",
    intro:
      "Ce qu'un devis doit contenir, ce que doit dire une facture, à quoi sert le PV de réception. Les documents qui protègent.",
    gmcModule: {
      hook: "Tous vos documents chantier centralisés, avec extraction auto des montants et rappels d'échéance.",
      cta: "Tester GérerMonChantier — 30 jours gratuits",
      href: `${GMC_BASE}/beta?${utm("centre-aide-documents")}`,
    },
    vmdCrossLinks: [
      { href: `${VMD_BASE}/nouvelle-analyse`, label: "Analyser un devis en 30 secondes" },
    ],
  },
  litiges: {
    label: "Litiges & recours",
    slug: "litiges",
    status: "coming_soon",
    icon: "⚖️",
    intro:
      "Mise en demeure, médiation, huissier, tribunal. Les étapes concrètes selon le type de litige et le montant en jeu.",
    gmcModule: {
      hook: "Un journal horodaté de tous les échanges — utilisable comme pièce en médiation ou au tribunal.",
      cta: "Tester GérerMonChantier — 30 jours gratuits",
      href: `${GMC_BASE}/beta?${utm("centre-aide-litiges")}`,
    },
    vmdCrossLinks: [],
  },
  reception: {
    label: "Réception & garanties",
    slug: "reception",
    status: "coming_soon",
    icon: "🏁",
    intro:
      "Réception avec ou sans réserves, garantie de parfait achèvement, biennale, décennale. Ce qui se joue au moment de signer le PV.",
    gmcModule: {
      hook: "Un checklist de réception par lot + génération du PV en un clic.",
      cta: "Tester GérerMonChantier — 30 jours gratuits",
      href: `${GMC_BASE}/beta?${utm("centre-aide-reception")}`,
    },
    vmdCrossLinks: [],
  },
  devis: {
    label: "Comprendre les devis",
    slug: "devis",
    status: "coming_soon",
    icon: "🧾",
    intro:
      "Lire un devis, repérer une surfacturation, comparer plusieurs devis, négocier avant signature.",
    gmcModule: {
      hook: "Import de vos devis dans GMC pour suivre budget engagé vs facturé, artisan par artisan.",
      cta: "Tester GérerMonChantier — 30 jours gratuits",
      href: `${GMC_BASE}/beta?${utm("centre-aide-devis")}`,
    },
    vmdCrossLinks: [
      { href: `${VMD_BASE}/nouvelle-analyse`, label: "Analyser gratuitement un devis" },
      { href: `${VMD_BASE}/comparateur`, label: "Comparer 2 devis" },
    ],
  },
  tresorerie: {
    label: "Trésorerie & paiements",
    slug: "tresorerie",
    status: "coming_soon",
    icon: "🏦",
    intro:
      "Acomptes, échéancier, retenue de garantie, aides et crédit travaux. Comment étaler intelligemment sans se retrouver à sec.",
    gmcModule: {
      hook: "Échéancier prévisionnel automatique + projection de trésorerie sur la durée du chantier.",
      cta: "Tester GérerMonChantier — 30 jours gratuits",
      href: `${GMC_BASE}/beta?${utm("centre-aide-tresorerie")}`,
    },
    vmdCrossLinks: [],
  },
};

/** Ordre d'affichage sur le hub principal. */
export const CATEGORY_ORDER: string[] = [
  "artisans",
  "budget",
  "planning",
  "documents",
  "litiges",
  "reception",
  "devis",
  "tresorerie",
];

export function getCategory(slug: string): CategoryConfig | null {
  return CATEGORIES[slug] ?? null;
}

export function getAllCategories(): CategoryConfig[] {
  return CATEGORY_ORDER.map((s) => CATEGORIES[s]).filter(Boolean);
}

export function getLiveCategories(): CategoryConfig[] {
  return getAllCategories().filter((c) => c.status === "live");
}
