/**
 * Mapping éditorial métiers ↔ chantiers pour le maillage interne Observatoire.
 * Utilisé par le composant ObservatoireCrossLinks + par le CTA "Pour aller plus loin"
 * post-verdict d'analyse.
 *
 * Convention slug : conforme aux fichiers src/data/observatoire/{metiers,chantiers}/*.json
 */

export interface CrossLink {
  href: string;
  label: string;
  kind: "metier" | "chantier" | "guide" | "etude" | "tool" | "gmc";
}

/**
 * Pour un chantier donné, les 2-3 métiers dominants qui interviennent.
 * Exclut le chantier lui-même.
 */
const CHANTIER_TO_METIERS: Record<string, string[]> = {
  "salle-de-bain":       ["plomberie-sanitaires", "carrelage-faience", "peinture-revetements"],
  cuisine:               ["menuiserie-vitrages", "plomberie-sanitaires", "electricite"],
  isolation:             ["placo-isolation", "toiture-couverture", "menuiserie-vitrages"],
  chauffage:             ["plomberie-sanitaires", "cvc-ventilation", "electricite"],
  toiture:               ["toiture-couverture", "charpente-bois", "menuiserie-vitrages"],
  carrelage:             ["carrelage-faience", "sols-durs", "plomberie-sanitaires"],
  peinture:              ["peinture-revetements", "placo-isolation", "sols-souples"],
  fenetres:              ["menuiserie-vitrages", "stores-occultation", "placo-isolation"],
  electricite:           ["electricite", "domotique-securite", "placo-isolation"],
  plomberie:             ["plomberie-sanitaires", "carrelage-faience", "cvc-ventilation"],
  facade:                ["facade-ravalement", "bardage-exterieur", "peinture-revetements"],
  cloisons:              ["placo-isolation", "peinture-revetements", "menuiserie-vitrages"],
  cloture:               ["metallerie-serrurerie", "maconnerie-structure", "ouvrages-paysagisme"],
  garage:                ["maconnerie-structure", "electricite", "menuiserie-vitrages"],
  piscine:               ["ouvrages-piscine", "carrelage-faience", "maconnerie-structure"],
  terrasse:              ["sols-durs", "ouvrages-paysagisme", "menuiserie-vitrages"],
};

/**
 * Pour un métier donné, les 2-3 types de chantier où il intervient le plus.
 */
const METIER_TO_CHANTIERS: Record<string, string[]> = {
  "menuiserie-vitrages":  ["cuisine", "fenetres", "isolation"],
  "peinture-revetements": ["peinture", "cloisons", "salle-de-bain"],
  "toiture-couverture":   ["toiture", "isolation", "garage"],
  "carrelage-faience":    ["salle-de-bain", "carrelage", "cuisine"],
  "plomberie-sanitaires": ["salle-de-bain", "cuisine", "chauffage"],
  "placo-isolation":      ["isolation", "cloisons", "peinture"],
  "electricite":          ["cuisine", "electricite", "chauffage"],
  chauffage:              ["chauffage", "salle-de-bain", "cuisine"],
  "cvc-ventilation":      ["chauffage", "isolation", "salle-de-bain"],
  "cuisine-agencement":   ["cuisine"],
  "demolition-depose":    ["salle-de-bain", "cuisine", "cloisons"],
  "maconnerie-structure": ["garage", "facade", "cloture"],
  "facade-ravalement":    ["facade", "isolation"],
  "bardage-exterieur":    ["facade", "isolation"],
  "charpente-bois":       ["toiture", "isolation"],
  "sols-durs":            ["carrelage", "terrasse", "salle-de-bain"],
  "sols-souples":         ["peinture", "cloisons"],
  "stores-occultation":   ["fenetres", "cuisine"],
  "metallerie-serrurerie":["cloture", "garage"],
  "ouvrages-piscine":     ["piscine"],
  "ouvrages-paysagisme":  ["terrasse", "cloture"],
  "domotique-securite":   ["electricite", "cuisine"],
  "logistique-chantier":  ["salle-de-bain", "cuisine", "isolation"],
  "ouvrages-vrd":         ["cloture", "terrasse"],
  "ouvrages-ascenseur":   [],
  "ouvrages-anc":         [],
  "renovation-globale":   ["salle-de-bain", "cuisine", "isolation"],
  "diagnostic-reglementaire": [],
  "prestations-intellectuelles": [],
};

/**
 * Fallback humain pour les labels (utile quand on ne charge pas le JSON).
 * Cohérent avec `chantier_label` / `metier_label` des fichiers JSON.
 */
const CHANTIER_LABELS: Record<string, string> = {
  "salle-de-bain": "salle de bain",
  cuisine: "cuisine",
  isolation: "isolation",
  chauffage: "chauffage",
  toiture: "toiture",
  carrelage: "carrelage",
  peinture: "peinture",
  fenetres: "fenêtres",
  electricite: "rénovation électrique",
  plomberie: "plomberie",
  facade: "façade",
  cloisons: "cloisons",
  cloture: "clôture",
  garage: "garage",
  piscine: "piscine",
  terrasse: "terrasse",
};

const METIER_LABELS: Record<string, string> = {
  "menuiserie-vitrages":  "menuiserie",
  "peinture-revetements": "peinture",
  "toiture-couverture":   "toiture",
  "carrelage-faience":    "carrelage",
  "plomberie-sanitaires": "plomberie",
  "placo-isolation":      "placo & isolation",
  electricite:            "électricité",
  chauffage:              "chauffage",
  "cvc-ventilation":      "VMC",
  "maconnerie-structure": "maçonnerie",
  "facade-ravalement":    "ravalement de façade",
  "bardage-exterieur":    "bardage extérieur",
  "charpente-bois":       "charpente bois",
  "sols-durs":            "sols durs",
  "sols-souples":         "sols souples",
  "stores-occultation":   "stores",
  "metallerie-serrurerie":"métallerie",
  "ouvrages-piscine":     "piscine",
  "ouvrages-paysagisme":  "paysagisme",
  "domotique-securite":   "domotique",
  "cuisine-agencement":   "cuisine",
  "renovation-globale":   "rénovation globale",
};

export function labelForChantier(slug: string): string {
  return CHANTIER_LABELS[slug] ?? slug.replace(/-/g, " ");
}

export function labelForMetier(slug: string): string {
  return METIER_LABELS[slug] ?? slug.replace(/-/g, " ");
}

/**
 * Retourne les liens croisés à afficher sur une page Observatoire donnée.
 * On produit toujours 5 catégories : métiers · chantiers · guide · analyse · comparateur.
 * La bannière GMC est gérée séparément (car conditionnelle au type de chantier).
 */
export function getObservatoireCrossLinks(
  type: "metier" | "chantier" | "etude",
  slug: string,
): {
  metiers: CrossLink[];
  chantiers: CrossLink[];
  guide: CrossLink;
  analyse: CrossLink;
  comparateur: CrossLink;
  gmcRelevant: boolean;
} {
  let metiers: CrossLink[] = [];
  let chantiers: CrossLink[] = [];

  if (type === "chantier") {
    metiers = (CHANTIER_TO_METIERS[slug] ?? []).slice(0, 3).map((m) => ({
      href: `/observatoire/metiers/${m}`,
      label: `Prix ${labelForMetier(m)}`,
      kind: "metier",
    }));
    // Autres chantiers apparentés = les chantiers partageant ≥ 2 métiers dominants
    chantiers = findRelatedChantiers(slug).slice(0, 2).map((c) => ({
      href: `/observatoire/chantiers/${c}`,
      label: `Prix ${labelForChantier(c)}`,
      kind: "chantier",
    }));
  } else if (type === "metier") {
    chantiers = (METIER_TO_CHANTIERS[slug] ?? []).slice(0, 3).map((c) => ({
      href: `/observatoire/chantiers/${c}`,
      label: `Prix ${labelForChantier(c)}`,
      kind: "chantier",
    }));
    // Métiers proches = ceux qui partagent au moins un chantier commun
    metiers = findRelatedMetiers(slug).slice(0, 2).map((m) => ({
      href: `/observatoire/metiers/${m}`,
      label: `Prix ${labelForMetier(m)}`,
      kind: "metier",
    }));
  } else {
    // Étude globale : on remonte les 3 plus gros métiers et 3 plus gros chantiers
    metiers = [
      { href: "/observatoire/metiers/menuiserie-vitrages", label: "Prix menuiserie", kind: "metier" },
      { href: "/observatoire/metiers/peinture-revetements", label: "Prix peinture", kind: "metier" },
      { href: "/observatoire/metiers/plomberie-sanitaires", label: "Prix plomberie", kind: "metier" },
    ];
    chantiers = [
      { href: "/observatoire/chantiers/salle-de-bain", label: "Prix salle de bain", kind: "chantier" },
      { href: "/observatoire/chantiers/isolation", label: "Prix isolation", kind: "chantier" },
      { href: "/observatoire/chantiers/cuisine", label: "Prix rénovation cuisine", kind: "chantier" },
    ];
  }

  // Guide générique
  const guide: CrossLink = {
    href: "/guides/devis-travaux",
    label: "Le guide complet du devis travaux",
    kind: "guide",
  };

  // Ancre analyse contextuelle
  const analyseLabel =
    type === "chantier"
      ? `Analyser mon devis de ${labelForChantier(slug)}`
      : type === "metier"
        ? `Analyser mon devis de ${labelForMetier(slug)}`
        : "Analyser gratuitement mon devis";
  const analyse: CrossLink = {
    href: type === "chantier" ? `/nouvelle-analyse?preset=${slug}` : "/nouvelle-analyse",
    label: analyseLabel,
    kind: "tool",
  };

  const comparateurLabel =
    type === "chantier"
      ? `Comparer 2 devis de ${labelForChantier(slug)}`
      : "Comparer plusieurs devis";
  const comparateur: CrossLink = {
    href: type === "chantier" ? `/comparateur/nouveau?preset=${slug}` : "/comparateur",
    label: comparateurLabel,
    kind: "tool",
  };

  // GMC pertinent uniquement sur gros œuvre (chantier structurant)
  const GMC_RELEVANT_CHANTIERS = new Set([
    "salle-de-bain",
    "cuisine",
    "isolation",
    "chauffage",
    "toiture",
    "facade",
    "garage",
    "piscine",
    "terrasse",
  ]);
  const gmcRelevant = type === "chantier" && GMC_RELEVANT_CHANTIERS.has(slug);

  return { metiers, chantiers, guide, analyse, comparateur, gmcRelevant };
}

function findRelatedChantiers(slug: string): string[] {
  const own = new Set(CHANTIER_TO_METIERS[slug] ?? []);
  if (own.size === 0) return [];
  return Object.entries(CHANTIER_TO_METIERS)
    .filter(([s]) => s !== slug)
    .map(([s, ms]) => {
      const shared = ms.filter((m) => own.has(m)).length;
      return { slug: s, shared };
    })
    .filter((x) => x.shared >= 2)
    .sort((a, b) => b.shared - a.shared)
    .map((x) => x.slug);
}

function findRelatedMetiers(slug: string): string[] {
  const own = new Set(METIER_TO_CHANTIERS[slug] ?? []);
  if (own.size === 0) return [];
  return Object.entries(METIER_TO_CHANTIERS)
    .filter(([s]) => s !== slug)
    .map(([s, cs]) => {
      const shared = cs.filter((c) => own.has(c)).length;
      return { slug: s, shared };
    })
    .filter((x) => x.shared >= 1)
    .sort((a, b) => b.shared - a.shared)
    .map((x) => x.slug);
}

/**
 * Pour l'analyse : à partir du chantier_type détecté, retourne le lien
 * Observatoire correspondant + le comparateur préfixé.
 */
export function getPourAllerPlusLoinLinks(chantierSlug: string | null): {
  observatoire: CrossLink | null;
  guide: CrossLink;
  comparateur: CrossLink;
  gmc: boolean;
} {
  const normalized = chantierSlug && CHANTIER_LABELS[chantierSlug] ? chantierSlug : null;
  return {
    observatoire: normalized
      ? {
          href: `/observatoire/chantiers/${normalized}`,
          label: `Voir les prix marché ${labelForChantier(normalized)}`,
          kind: "chantier",
        }
      : {
          href: "/observatoire",
          label: "Explorer l'Observatoire des prix",
          kind: "chantier",
        },
    guide: {
      href: "/guides/devis-travaux",
      label: "Le guide complet du devis travaux",
      kind: "guide",
    },
    comparateur: {
      href: normalized ? `/comparateur/nouveau?preset=${normalized}` : "/comparateur/nouveau",
      label: normalized
        ? `Comparer 2 devis de ${labelForChantier(normalized)}`
        : "Comparer plusieurs devis",
      kind: "tool",
    },
    gmc: !!normalized,
  };
}
