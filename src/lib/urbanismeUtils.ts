// ============================================================
// TYPES
// ============================================================

export type WorkCategory = "piscine" | "cloture" | "abri_jardin" | "extension" | "";
export type Formalite = "Aucune" | "Déclaration préalable" | "Permis";

export interface CerfaLink {
  label: string;
  url: string;
}

export interface UrbanismeResult {
  formalite: Formalite;
  rule_explained: string;
  article_ref: string;
  cerfas: CerfaLink[];
  notice?: CerfaLink;
  warnings?: string[];
}

// ============================================================
// CERFA LINKS (Official URLs)
// ============================================================

export const CERFA_LINKS = {
  dp_construction: {
    label: "CERFA DP (13703*10)",
    url: "https://www.service-public.fr/particuliers/vosdroits/R11646",
  },
  dp_notice: {
    label: "Notice DP (51434)",
    url: "https://www.formulaires.service-public.fr/gf/getNotice.do?cerfaNotice=51434&cerfaFormulaire=13703",
  },
  permis_construire: {
    label: "CERFA Permis de construire (13409)",
    url: "https://www.service-public.fr/particuliers/vosdroits/R21378",
  },
  fiche_dp: {
    label: "Fiche DP (rappel)",
    url: "https://www.service-public.fr/particuliers/vosdroits/F17578",
  },
};

// ============================================================
// PARAMETER INTERFACES
// ============================================================

export interface PiscineParams {
  bassin_surface_m2: number;
  couverture_hauteur_m: number;
  zone_protegee: boolean;
}

export interface ClotureParams {
  zone_protegee: boolean;
  commune_soumet_clotures_dp: boolean;
}

export interface AbriJardinParams {
  emprise_sol_m2: number;
  surface_plancher_m2: number;
  hauteur_m: number;
  zone_protegee: boolean;
}

export interface ExtensionParams {
  surface_plancher_m2: number;
  emprise_sol_m2: number;
  zone_urbaine_plu: boolean;
  zone_protegee: boolean;
}

// ============================================================
// COMPUTATION FUNCTIONS
// ============================================================

export function computeUrbanismePiscine(params: PiscineParams): UrbanismeResult {
  const { bassin_surface_m2, couverture_hauteur_m, zone_protegee } = params;

  if (couverture_hauteur_m > 1.80) {
    return {
      formalite: "Permis",
      rule_explained: "La couverture de piscine dépasse 1,80 m de hauteur.",
      article_ref: "R.421-1 du Code de l'urbanisme",
      cerfas: [CERFA_LINKS.permis_construire],
      notice: CERFA_LINKS.dp_notice,
    };
  }

  if (zone_protegee && bassin_surface_m2 <= 100) {
    return {
      formalite: "Déclaration préalable",
      rule_explained: "En zone protégée, une déclaration préalable est requise même pour les petites piscines.",
      article_ref: "R.421-11 II d) du Code de l'urbanisme",
      cerfas: [CERFA_LINKS.dp_construction, CERFA_LINKS.fiche_dp],
      notice: CERFA_LINKS.dp_notice,
      warnings: ["Zone protégée : vérifiez les prescriptions architecturales auprès de votre mairie ou de l'ABF."],
    };
  }

  if (bassin_surface_m2 <= 10) {
    return {
      formalite: "Aucune",
      rule_explained: "Une piscine de 10 m² ou moins ne nécessite aucune formalité (hors zone protégée).",
      article_ref: "R.421-2 d) du Code de l'urbanisme",
      cerfas: [],
    };
  }

  if (bassin_surface_m2 <= 100) {
    return {
      formalite: "Déclaration préalable",
      rule_explained: "Une piscine entre 10 et 100 m² nécessite une déclaration préalable.",
      article_ref: "R.421-9 f) du Code de l'urbanisme",
      cerfas: [CERFA_LINKS.dp_construction, CERFA_LINKS.fiche_dp],
      notice: CERFA_LINKS.dp_notice,
    };
  }

  return {
    formalite: "Permis",
    rule_explained: "Une piscine de plus de 100 m² nécessite un permis de construire.",
    article_ref: "R.421-1 du Code de l'urbanisme",
    cerfas: [CERFA_LINKS.permis_construire],
    notice: CERFA_LINKS.dp_notice,
  };
}

export function computeUrbanismeCloture(params: ClotureParams): UrbanismeResult {
  const { zone_protegee, commune_soumet_clotures_dp } = params;

  if (zone_protegee) {
    return {
      formalite: "Déclaration préalable",
      rule_explained: "En zone protégée (abords MH, site classé), une déclaration préalable est requise.",
      article_ref: "R.421-12 du Code de l'urbanisme",
      cerfas: [CERFA_LINKS.dp_construction, CERFA_LINKS.fiche_dp],
      notice: CERFA_LINKS.dp_notice,
      warnings: ["Zone protégée : vérifiez les prescriptions auprès de l'ABF."],
    };
  }

  if (commune_soumet_clotures_dp) {
    return {
      formalite: "Déclaration préalable",
      rule_explained: "Votre commune soumet l'édification de clôtures à déclaration préalable (PLU ou délibération).",
      article_ref: "R.421-12 du Code de l'urbanisme",
      cerfas: [CERFA_LINKS.dp_construction, CERFA_LINKS.fiche_dp],
      notice: CERFA_LINKS.dp_notice,
    };
  }

  return {
    formalite: "Aucune",
    rule_explained: "En dehors des zones protégées et si votre commune n'impose pas de DP, aucune formalité n'est requise.",
    article_ref: "R.421-2 g) du Code de l'urbanisme",
    cerfas: [],
  };
}

export function computeUrbanismeAbriJardin(params: AbriJardinParams): UrbanismeResult {
  const { emprise_sol_m2, surface_plancher_m2, hauteur_m, zone_protegee } = params;
  const surfaceMax = Math.max(emprise_sol_m2, surface_plancher_m2);

  if (zone_protegee) {
    if (surfaceMax > 20) {
      return {
        formalite: "Permis",
        rule_explained: "En zone protégée, un abri de plus de 20 m² nécessite un permis de construire.",
        article_ref: "R.421-1 du Code de l'urbanisme",
        cerfas: [CERFA_LINKS.permis_construire],
        notice: CERFA_LINKS.dp_notice,
        warnings: ["Zone protégée : consultez l'ABF pour les prescriptions architecturales."],
      };
    }
    return {
      formalite: "Déclaration préalable",
      rule_explained: "En zone protégée, une déclaration préalable est requise dès le premier m².",
      article_ref: "R.421-11 du Code de l'urbanisme",
      cerfas: [CERFA_LINKS.dp_construction, CERFA_LINKS.fiche_dp],
      notice: CERFA_LINKS.dp_notice,
      warnings: ["Zone protégée : vérifiez les prescriptions auprès de l'ABF."],
    };
  }

  if (hauteur_m > 12) {
    return {
      formalite: "Permis",
      rule_explained: "Une construction de plus de 12 m de hauteur nécessite un permis de construire.",
      article_ref: "R.421-1 du Code de l'urbanisme",
      cerfas: [CERFA_LINKS.permis_construire],
      notice: CERFA_LINKS.dp_notice,
    };
  }

  if (surfaceMax > 20) {
    return {
      formalite: "Permis",
      rule_explained: "Un abri de jardin de plus de 20 m² (emprise au sol ou surface de plancher) nécessite un permis de construire.",
      article_ref: "R.421-1 du Code de l'urbanisme",
      cerfas: [CERFA_LINKS.permis_construire],
      notice: CERFA_LINKS.dp_notice,
    };
  }

  if (surfaceMax > 5) {
    return {
      formalite: "Déclaration préalable",
      rule_explained: "Un abri de jardin entre 5 et 20 m² nécessite une déclaration préalable.",
      article_ref: "R.421-9 du Code de l'urbanisme",
      cerfas: [CERFA_LINKS.dp_construction, CERFA_LINKS.fiche_dp],
      notice: CERFA_LINKS.dp_notice,
    };
  }

  return {
    formalite: "Aucune",
    rule_explained: "Un abri de jardin de 5 m² ou moins (et hauteur ≤ 12 m) ne nécessite aucune formalité.",
    article_ref: "R.421-2 a) du Code de l'urbanisme",
    cerfas: [],
  };
}

export function computeUrbanismeExtension(params: ExtensionParams): UrbanismeResult {
  const { surface_plancher_m2, emprise_sol_m2, zone_urbaine_plu, zone_protegee } = params;
  const surfaceMax = Math.max(surface_plancher_m2, emprise_sol_m2);
  const seuil = zone_urbaine_plu ? 40 : 20;

  if (zone_protegee) {
    if (surfaceMax > seuil) {
      return {
        formalite: "Permis",
        rule_explained: `En zone protégée, une extension de plus de ${seuil} m² nécessite un permis de construire.`,
        article_ref: "R.421-1 du Code de l'urbanisme",
        cerfas: [CERFA_LINKS.permis_construire],
        notice: CERFA_LINKS.dp_notice,
        warnings: ["Zone protégée : consultez l'ABF pour les prescriptions architecturales."],
      };
    }
    return {
      formalite: "Déclaration préalable",
      rule_explained: "En zone protégée, toute extension nécessite au minimum une déclaration préalable.",
      article_ref: "R.421-11 du Code de l'urbanisme",
      cerfas: [CERFA_LINKS.dp_construction, CERFA_LINKS.fiche_dp],
      notice: CERFA_LINKS.dp_notice,
      warnings: ["Zone protégée : vérifiez les prescriptions auprès de l'ABF."],
    };
  }

  if (surfaceMax > seuil) {
    return {
      formalite: "Permis",
      rule_explained: `Une extension de plus de ${seuil} m² ${zone_urbaine_plu ? "(zone urbaine PLU)" : ""} nécessite un permis de construire.`,
      article_ref: "R.421-1 du Code de l'urbanisme",
      cerfas: [CERFA_LINKS.permis_construire],
      notice: CERFA_LINKS.dp_notice,
      warnings: surfaceMax > 40 ? ["Si la surface totale après travaux dépasse 150 m², le recours à un architecte est obligatoire."] : undefined,
    };
  }

  return {
    formalite: "Déclaration préalable",
    rule_explained: `Une extension de ${seuil} m² ou moins ${zone_urbaine_plu ? "(zone urbaine PLU)" : "(hors zone urbaine PLU)"} nécessite une déclaration préalable.`,
    article_ref: "R.421-14 du Code de l'urbanisme",
    cerfas: [CERFA_LINKS.dp_construction, CERFA_LINKS.fiche_dp],
    notice: CERFA_LINKS.dp_notice,
  };
}

export function detectInitialCategory(workType?: string): WorkCategory {
  if (!workType) return "";
  const lower = workType.toLowerCase();
  if (lower.includes("piscine")) return "piscine";
  if (lower.includes("clôture") || lower.includes("cloture")) return "cloture";
  if (lower.includes("abri") || lower.includes("jardin") || lower.includes("cabanon")) return "abri_jardin";
  if (lower.includes("extension") || lower.includes("agrandissement") || lower.includes("véranda") || lower.includes("veranda")) return "extension";
  return "";
}
