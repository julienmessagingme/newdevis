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

// ============================================================
// DÉMARCHES URBANISME — Détection et estimation simplifiée
// ============================================================

export type DetectedCategory =
  | "extension"
  | "piscine"
  | "cloture"
  | "abri_jardin"
  | "facade"
  | "construction_neuve";

export interface TravauxDetection {
  categories: DetectedCategory[];
  detected_from: string[];
}

export interface DemarcheInputs {
  surface_creee: number | null;
  surface_actuelle: number | null;
  surface_totale_apres: number | null;
  surface_bassin: number | null;
  hauteur_cloture: number | null;
}

export interface DemarcheItem {
  category: DetectedCategory;
  label: string;
  probable_demarche:
    | "DP probable"
    | "PC probable"
    | "DP ou PC probable"
    | "Aucune formalité probable";
  explanation: string;
  link_dp?: { label: string; url: string };
  link_pc?: { label: string; url: string };
  warnings?: string[];
}

export interface DemarcheResult {
  items: DemarcheItem[];
  disclaimer: string;
}

export const DEMARCHE_LINKS = {
  dp: {
    label: "Déclaration préalable — Service-Public.fr",
    url: "https://www.service-public.fr/particuliers/vosdroits/R11646",
  },
  pc: {
    label: "Permis de construire — Service-Public.fr",
    url: "https://www.service-public.fr/particuliers/vosdroits/R11637",
  },
} as const;

const DETECTION_KEYWORDS: Record<DetectedCategory, string[]> = {
  extension: [
    "extension",
    "agrandissement",
    "véranda",
    "veranda",
    "surélévation",
    "surelevation",
    "annexe",
  ],
  piscine: ["piscine", "bassin", "spa", "jacuzzi"],
  cloture: ["clôture", "cloture", "portail", "grillage", "muret"],
  abri_jardin: [
    "abri de jardin",
    "abri jardin",
    "abris de jardin",
    "cabanon",
    "carport",
  ],
  facade: [
    "ravalement",
    "façade",
    "facade",
    "toiture",
    "couverture",
    "ouverture",
    "velux",
    "lucarne",
  ],
  construction_neuve: [
    "construction neuve",
    "maison neuve",
    "fondations",
    "fondation",
    "gros œuvre",
    "gros oeuvre",
  ],
};

export function detectUrbanismeCategories(
  rawText: string | null,
  workType: string | null
): TravauxDetection {
  const categories = new Set<DetectedCategory>();
  const detected_from: string[] = [];

  const textParts: string[] = [];
  if (workType) textParts.push(workType.toLowerCase());

  if (rawText) {
    try {
      const parsed: unknown =
        typeof rawText === "string" ? JSON.parse(rawText) : rawText;
      if (parsed && typeof parsed === "object") {
        const p = parsed as Record<string, unknown>;
        const extracted = p["extracted"] as Record<string, unknown> | undefined;
        if (extracted) {
          const travaux = extracted["travaux"] as
            | Array<Record<string, unknown>>
            | undefined;
          if (Array.isArray(travaux)) {
            for (const t of travaux) {
              if (t["libelle"] && typeof t["libelle"] === "string")
                textParts.push((t["libelle"] as string).toLowerCase());
              if (t["categorie"] && typeof t["categorie"] === "string")
                textParts.push((t["categorie"] as string).toLowerCase());
            }
          }
          if (
            extracted["work_type"] &&
            typeof extracted["work_type"] === "string"
          ) {
            textParts.push((extracted["work_type"] as string).toLowerCase());
          }
        }
      }
    } catch (_) {
      // rawText is plain text
      textParts.push(rawText.toLowerCase());
    }
  }

  const combinedText = textParts.join(" ");

  for (const [cat, keywords] of Object.entries(DETECTION_KEYWORDS) as [
    DetectedCategory,
    string[],
  ][]) {
    for (const kw of keywords) {
      if (combinedText.includes(kw)) {
        categories.add(cat);
        detected_from.push(kw);
        break;
      }
    }
  }

  return {
    categories: Array.from(categories),
    detected_from,
  };
}

export function computeDemarcheSimple(
  detection: TravauxDetection,
  inputs: DemarcheInputs
): DemarcheResult {
  const items: DemarcheItem[] = [];

  for (const category of detection.categories) {
    switch (category) {
      case "extension": {
        const sc = inputs.surface_creee;
        let probable_demarche: DemarcheItem["probable_demarche"];
        let explanation: string;
        const warnings: string[] = [];

        if (sc === null) {
          probable_demarche = "DP ou PC probable";
          explanation =
            "Sans connaître la surface créée, la démarche est probablement une DP (≤ 20 m²) ou un PC (> 20 m²) selon la zone PLU.";
        } else if (sc <= 20) {
          probable_demarche = "DP probable";
          explanation = `Pour ${sc} m² créés, une déclaration préalable est probable (seuil standard hors zone urbaine PLU).`;
        } else {
          probable_demarche = "PC probable";
          explanation = `Pour ${sc} m² créés, un permis de construire est probable (> 20 m², ou > 40 m² en zone urbaine PLU).`;
        }

        if (
          inputs.surface_totale_apres !== null &&
          inputs.surface_totale_apres > 150
        ) {
          warnings.push(
            "Surface totale > 150 m² : le recours à un architecte est probablement obligatoire."
          );
        }

        items.push({
          category,
          label: "Extension / Agrandissement",
          probable_demarche,
          explanation,
          link_dp: DEMARCHE_LINKS.dp,
          link_pc: DEMARCHE_LINKS.pc,
          warnings: warnings.length ? warnings : undefined,
        });
        break;
      }

      case "piscine": {
        const sb = inputs.surface_bassin;
        let probable_demarche: DemarcheItem["probable_demarche"];
        let explanation: string;

        if (sb === null) {
          probable_demarche = "DP ou PC probable";
          explanation =
            "Sans connaître la surface du bassin, la démarche est probablement une DP (≤ 100 m²) ou un PC (> 100 m²).";
        } else if (sb <= 100) {
          probable_demarche = "DP probable";
          explanation = `Pour un bassin de ${sb} m², une déclaration préalable est probable.`;
        } else {
          probable_demarche = "PC probable";
          explanation = `Pour un bassin de ${sb} m², un permis de construire est probable (> 100 m²).`;
        }

        items.push({
          category,
          label: "Piscine / Bassin",
          probable_demarche,
          explanation,
          link_dp: DEMARCHE_LINKS.dp,
          link_pc: DEMARCHE_LINKS.pc,
        });
        break;
      }

      case "cloture": {
        items.push({
          category,
          label: "Clôture / Portail",
          probable_demarche: "DP probable",
          explanation:
            "Une déclaration préalable est souvent requise selon le PLU et les secteurs protégés. Vérifiez auprès de votre mairie.",
          link_dp: DEMARCHE_LINKS.dp,
          warnings: [
            "Les règles varient selon la commune (PLU) et les zones protégées (ABF).",
          ],
        });
        break;
      }

      case "abri_jardin": {
        const sc = inputs.surface_creee;
        let probable_demarche: DemarcheItem["probable_demarche"];
        let explanation: string;

        if (sc === null) {
          probable_demarche = "DP ou PC probable";
          explanation =
            "Sans connaître la surface, la démarche est probablement une DP (5–20 m²) ou un PC (> 20 m²).";
        } else if (sc <= 5) {
          probable_demarche = "Aucune formalité probable";
          explanation = `Pour ${sc} m², aucune formalité n'est généralement requise (≤ 5 m², hors zone protégée).`;
        } else if (sc <= 20) {
          probable_demarche = "DP probable";
          explanation = `Pour ${sc} m², une déclaration préalable est probable.`;
        } else {
          probable_demarche = "PC probable";
          explanation = `Pour ${sc} m², un permis de construire est probable (> 20 m²).`;
        }

        items.push({
          category,
          label: "Abri de jardin / Carport",
          probable_demarche,
          explanation,
          link_dp: DEMARCHE_LINKS.dp,
          link_pc: DEMARCHE_LINKS.pc,
        });
        break;
      }

      case "facade": {
        items.push({
          category,
          label: "Façade / Toiture / Ouvertures",
          probable_demarche: "DP probable",
          explanation:
            "Les travaux sur façade, toiture ou ouvertures nécessitent généralement une déclaration préalable.",
          link_dp: DEMARCHE_LINKS.dp,
          warnings: [
            "En secteur sauvegardé ou abords de monument historique, l'accord de l'ABF est probablement requis.",
          ],
        });
        break;
      }

      case "construction_neuve": {
        items.push({
          category,
          label: "Construction neuve",
          probable_demarche: "PC probable",
          explanation:
            "Une construction neuve nécessite généralement un permis de construire.",
          link_pc: DEMARCHE_LINKS.pc,
          warnings: [
            "Si la surface dépasse 150 m², le recours à un architecte est probablement obligatoire.",
          ],
        });
        break;
      }
    }
  }

  return {
    items,
    disclaimer:
      "Indications automatisées à titre informatif uniquement. Elles ne constituent pas un avis juridique. Les démarches obligatoires dépendent du PLU de votre commune, des secteurs protégés et de la nature exacte des travaux. Vérifiez auprès de votre mairie avant tout dépôt de dossier.",
  };
}
