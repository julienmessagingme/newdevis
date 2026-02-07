import { useState, useMemo } from "react";
import { 
  Building2, 
  ExternalLink, 
  FileText, 
  AlertTriangle,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import InfoTooltip from "./InfoTooltip";

// ============================================================
// TYPES
// ============================================================

type WorkCategory = "piscine" | "cloture" | "abri_jardin" | "extension" | "";
type Formalite = "Aucune" | "Déclaration préalable" | "Permis";

interface CerfaLink {
  label: string;
  url: string;
}

interface UrbanismeResult {
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

const CERFA_LINKS = {
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
// DETERMINISTIC COMPUTATION FUNCTION
// ============================================================

interface PiscineParams {
  bassin_surface_m2: number;
  couverture_hauteur_m: number;
  zone_protegee: boolean;
}

interface ClotureParams {
  zone_protegee: boolean;
  commune_soumet_clotures_dp: boolean;
}

interface AbriJardinParams {
  emprise_sol_m2: number;
  surface_plancher_m2: number;
  hauteur_m: number;
  zone_protegee: boolean;
}

interface ExtensionParams {
  surface_plancher_m2: number;
  emprise_sol_m2: number;
  zone_urbaine_plu: boolean;
  zone_protegee: boolean;
}

function computeUrbanismePiscine(params: PiscineParams): UrbanismeResult {
  const { bassin_surface_m2, couverture_hauteur_m, zone_protegee } = params;

  // Règle 1: Couverture > 1.80m → Permis
  if (couverture_hauteur_m > 1.80) {
    return {
      formalite: "Permis",
      rule_explained: "La couverture de piscine dépasse 1,80 m de hauteur.",
      article_ref: "R.421-1 du Code de l'urbanisme",
      cerfas: [CERFA_LINKS.permis_construire],
      notice: CERFA_LINKS.dp_notice,
    };
  }

  // Zone protégée : DP requise même pour petites piscines
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

  // Règle 2: Bassin ≤ 10 m² → Aucune formalité
  if (bassin_surface_m2 <= 10) {
    return {
      formalite: "Aucune",
      rule_explained: "Une piscine de 10 m² ou moins ne nécessite aucune formalité (hors zone protégée).",
      article_ref: "R.421-2 d) du Code de l'urbanisme",
      cerfas: [],
    };
  }

  // Règle 3: Bassin ≤ 100 m² → Déclaration préalable
  if (bassin_surface_m2 <= 100) {
    return {
      formalite: "Déclaration préalable",
      rule_explained: "Une piscine entre 10 et 100 m² nécessite une déclaration préalable.",
      article_ref: "R.421-9 f) du Code de l'urbanisme",
      cerfas: [CERFA_LINKS.dp_construction, CERFA_LINKS.fiche_dp],
      notice: CERFA_LINKS.dp_notice,
    };
  }

  // Règle 4: Bassin > 100 m² → Permis
  return {
    formalite: "Permis",
    rule_explained: "Une piscine de plus de 100 m² nécessite un permis de construire.",
    article_ref: "R.421-1 du Code de l'urbanisme",
    cerfas: [CERFA_LINKS.permis_construire],
    notice: CERFA_LINKS.dp_notice,
  };
}

function computeUrbanismeCloture(params: ClotureParams): UrbanismeResult {
  const { zone_protegee, commune_soumet_clotures_dp } = params;

  // Règle 1: Zone protégée → DP
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

  // Règle 2: Commune soumet les clôtures à DP → DP
  if (commune_soumet_clotures_dp) {
    return {
      formalite: "Déclaration préalable",
      rule_explained: "Votre commune soumet l'édification de clôtures à déclaration préalable (PLU ou délibération).",
      article_ref: "R.421-12 du Code de l'urbanisme",
      cerfas: [CERFA_LINKS.dp_construction, CERFA_LINKS.fiche_dp],
      notice: CERFA_LINKS.dp_notice,
    };
  }

  // Règle 3: Sinon → Aucune formalité
  return {
    formalite: "Aucune",
    rule_explained: "En dehors des zones protégées et si votre commune n'impose pas de DP, aucune formalité n'est requise.",
    article_ref: "R.421-2 g) du Code de l'urbanisme",
    cerfas: [],
  };
}

// ============================================================
// ABRI DE JARDIN RULES
// R.421-2 a) : dispense si emprise ≤ 5 m² ET hauteur ≤ 12 m (hors zone protégée)
// R.421-9 : DP si emprise ou surface plancher > 5 m² et ≤ 20 m² ET hauteur ≤ 12 m
// R.421-11 : en zone protégée, DP dès le 1er m²
// Au-delà de 20 m² → Permis
// ============================================================

function computeUrbanismeAbriJardin(params: AbriJardinParams): UrbanismeResult {
  const { emprise_sol_m2, surface_plancher_m2, hauteur_m, zone_protegee } = params;
  const surfaceMax = Math.max(emprise_sol_m2, surface_plancher_m2);

  // Zone protégée : DP dès le premier m²
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

  // Hauteur > 12 m → Permis (cas rare pour un abri)
  if (hauteur_m > 12) {
    return {
      formalite: "Permis",
      rule_explained: "Une construction de plus de 12 m de hauteur nécessite un permis de construire.",
      article_ref: "R.421-1 du Code de l'urbanisme",
      cerfas: [CERFA_LINKS.permis_construire],
      notice: CERFA_LINKS.dp_notice,
    };
  }

  // Surface > 20 m² → Permis
  if (surfaceMax > 20) {
    return {
      formalite: "Permis",
      rule_explained: "Un abri de jardin de plus de 20 m² (emprise au sol ou surface de plancher) nécessite un permis de construire.",
      article_ref: "R.421-1 du Code de l'urbanisme",
      cerfas: [CERFA_LINKS.permis_construire],
      notice: CERFA_LINKS.dp_notice,
    };
  }

  // Surface > 5 m² et ≤ 20 m² → DP
  if (surfaceMax > 5) {
    return {
      formalite: "Déclaration préalable",
      rule_explained: "Un abri de jardin entre 5 et 20 m² nécessite une déclaration préalable.",
      article_ref: "R.421-9 du Code de l'urbanisme",
      cerfas: [CERFA_LINKS.dp_construction, CERFA_LINKS.fiche_dp],
      notice: CERFA_LINKS.dp_notice,
    };
  }

  // Surface ≤ 5 m² et hauteur ≤ 12 m → Aucune
  return {
    formalite: "Aucune",
    rule_explained: "Un abri de jardin de 5 m² ou moins (et hauteur ≤ 12 m) ne nécessite aucune formalité.",
    article_ref: "R.421-2 a) du Code de l'urbanisme",
    cerfas: [],
  };
}

// ============================================================
// EXTENSION RULES
// Seuil de 40 m² en zone urbaine PLU (sinon 20 m²)
// Si extension porte surface totale > 150 m² → recours architecte obligatoire
// R.421-14 : DP si surface ≤ seuil
// Au-delà → Permis
// ============================================================

function computeUrbanismeExtension(params: ExtensionParams): UrbanismeResult {
  const { surface_plancher_m2, emprise_sol_m2, zone_urbaine_plu, zone_protegee } = params;
  const surfaceMax = Math.max(surface_plancher_m2, emprise_sol_m2);
  const seuil = zone_urbaine_plu ? 40 : 20;

  // Zone protégée : DP ou Permis selon la surface
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

  // Surface > seuil → Permis
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

  // Surface ≤ seuil → DP
  return {
    formalite: "Déclaration préalable",
    rule_explained: `Une extension de ${seuil} m² ou moins ${zone_urbaine_plu ? "(zone urbaine PLU)" : "(hors zone urbaine PLU)"} nécessite une déclaration préalable.`,
    article_ref: "R.421-14 du Code de l'urbanisme",
    cerfas: [CERFA_LINKS.dp_construction, CERFA_LINKS.fiche_dp],
    notice: CERFA_LINKS.dp_notice,
  };
}

// ============================================================
// BADGE COMPONENT
// ============================================================

function FormaliteBadge({ formalite }: { formalite: Formalite }) {
  switch (formalite) {
    case "Aucune":
      return (
        <Badge className="bg-score-green/10 text-score-green border-score-green/30 gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Aucune formalité
        </Badge>
      );
    case "Déclaration préalable":
      return (
        <Badge className="bg-primary/10 text-primary border-primary/30 gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Déclaration préalable (DP)
        </Badge>
      );
    case "Permis":
      return (
        <Badge className="bg-score-orange/10 text-score-orange border-score-orange/30 gap-1.5">
          <Building2 className="h-3.5 w-3.5" />
          Permis de construire
        </Badge>
      );
  }
}

// ============================================================
// MAIN COMPONENT
// ============================================================

interface BlockUrbanismeProps {
  initialWorkType?: string;
}

function detectInitialCategory(workType?: string): WorkCategory {
  if (!workType) return "";
  const lower = workType.toLowerCase();
  if (lower.includes("piscine")) return "piscine";
  if (lower.includes("clôture") || lower.includes("cloture")) return "cloture";
  if (lower.includes("abri") || lower.includes("jardin") || lower.includes("cabanon")) return "abri_jardin";
  if (lower.includes("extension") || lower.includes("agrandissement") || lower.includes("véranda") || lower.includes("veranda")) return "extension";
  return "";
}

export default function BlockUrbanisme({ initialWorkType }: BlockUrbanismeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [workCategory, setWorkCategory] = useState<WorkCategory>(detectInitialCategory(initialWorkType));

  // Piscine params
  const [bassinSurface, setBassinSurface] = useState<string>("");
  const [couvertureHauteur, setCouvertureHauteur] = useState<string>("");
  const [zoneProtegeePiscine, setZoneProtegeePiscine] = useState(false);

  // Cloture params
  const [zoneProtegeeCloture, setZoneProtegeeCloture] = useState(false);
  const [communeSoumetClotures, setCommuneSoumetClotures] = useState(false);

  // Abri de jardin params
  const [abriEmprise, setAbriEmprise] = useState<string>("");
  const [abriSurfacePlancher, setAbriSurfacePlancher] = useState<string>("");
  const [abriHauteur, setAbriHauteur] = useState<string>("");
  const [zoneProtegeeAbri, setZoneProtegeeAbri] = useState(false);

  // Extension params
  const [extensionSurfacePlancher, setExtensionSurfacePlancher] = useState<string>("");
  const [extensionEmprise, setExtensionEmprise] = useState<string>("");
  const [zoneUrbainePlu, setZoneUrbainePlu] = useState(false);
  const [zoneProtegeeExtension, setZoneProtegeeExtension] = useState(false);

  // Compute result
  const result = useMemo<UrbanismeResult | null>(() => {
    if (workCategory === "piscine") {
      const surface = parseFloat(bassinSurface) || 0;
      const hauteur = parseFloat(couvertureHauteur) || 0;
      if (surface <= 0) return null;
      return computeUrbanismePiscine({
        bassin_surface_m2: surface,
        couverture_hauteur_m: hauteur,
        zone_protegee: zoneProtegeePiscine,
      });
    }

    if (workCategory === "cloture") {
      return computeUrbanismeCloture({
        zone_protegee: zoneProtegeeCloture,
        commune_soumet_clotures_dp: communeSoumetClotures,
      });
    }

    if (workCategory === "abri_jardin") {
      const emprise = parseFloat(abriEmprise) || 0;
      const surfacePlancher = parseFloat(abriSurfacePlancher) || 0;
      const hauteur = parseFloat(abriHauteur) || 0;
      if (emprise <= 0 && surfacePlancher <= 0) return null;
      return computeUrbanismeAbriJardin({
        emprise_sol_m2: emprise,
        surface_plancher_m2: surfacePlancher,
        hauteur_m: hauteur,
        zone_protegee: zoneProtegeeAbri,
      });
    }

    if (workCategory === "extension") {
      const surfacePlancher = parseFloat(extensionSurfacePlancher) || 0;
      const emprise = parseFloat(extensionEmprise) || 0;
      if (surfacePlancher <= 0 && emprise <= 0) return null;
      return computeUrbanismeExtension({
        surface_plancher_m2: surfacePlancher,
        emprise_sol_m2: emprise,
        zone_urbaine_plu: zoneUrbainePlu,
        zone_protegee: zoneProtegeeExtension,
      });
    }

    return null;
  }, [
    workCategory, bassinSurface, couvertureHauteur, zoneProtegeePiscine, 
    zoneProtegeeCloture, communeSoumetClotures,
    abriEmprise, abriSurfacePlancher, abriHauteur, zoneProtegeeAbri,
    extensionSurfacePlancher, extensionEmprise, zoneUrbainePlu, zoneProtegeeExtension
  ]);

  // Show component for supported work types or when manually opened
  const shouldShow = workCategory !== "" || detectInitialCategory(initialWorkType) !== "";

  if (!shouldShow && !isOpen) {
    return null;
  }
  return (
    <Card className="mb-6 card-shadow">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <CardTitle className="flex items-center justify-between text-lg">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <span>Urbanisme — Formalités & CERFA</span>
                <Badge variant="outline" className="text-xs font-normal">indicatif</Badge>
              </div>
              {isOpen ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-6">
            {/* Work Type Selector */}
            <div className="space-y-2">
              <Label htmlFor="work-category">Type de travaux</Label>
              <Select
                value={workCategory}
                onValueChange={(value) => setWorkCategory(value as WorkCategory)}
              >
                <SelectTrigger id="work-category">
                  <SelectValue placeholder="Sélectionnez..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="piscine">🏊 Piscine</SelectItem>
                  <SelectItem value="cloture">🚧 Clôture</SelectItem>
                  <SelectItem value="abri_jardin">🏠 Abri de jardin / Cabanon</SelectItem>
                  <SelectItem value="extension">🏗️ Extension / Véranda</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Piscine Form */}
            {workCategory === "piscine" && (
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bassin-surface" className="flex items-center gap-1">
                      Surface du bassin (m²)
                      <InfoTooltip title="Surface du bassin" content="Surface intérieure du bassin, hors margelles." />
                    </Label>
                    <Input
                      id="bassin-surface"
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="Ex: 32"
                      value={bassinSurface}
                      onChange={(e) => setBassinSurface(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="couverture-hauteur" className="flex items-center gap-1">
                      Hauteur couverture/abri (m)
                      <InfoTooltip title="Hauteur de couverture" content="Hauteur de la couverture ou de l'abri au-dessus du sol. Laisser à 0 si pas de couverture." />
                    </Label>
                    <Input
                      id="couverture-hauteur"
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="0 si aucune"
                      value={couvertureHauteur}
                      onChange={(e) => setCouvertureHauteur(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="zone-protegee-piscine"
                    checked={zoneProtegeePiscine}
                    onCheckedChange={(checked) => setZoneProtegeePiscine(checked === true)}
                  />
                  <Label htmlFor="zone-protegee-piscine" className="text-sm cursor-pointer">
                    Site patrimonial / abords monuments historiques / site classé
                  </Label>
                </div>
              </div>
            )}

            {/* Cloture Form */}
            {workCategory === "cloture" && (
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="zone-protegee-cloture"
                    checked={zoneProtegeeCloture}
                    onCheckedChange={(checked) => setZoneProtegeeCloture(checked === true)}
                  />
                  <Label htmlFor="zone-protegee-cloture" className="text-sm cursor-pointer">
                    Site patrimonial / abords monuments historiques / site classé
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="commune-soumet-clotures"
                    checked={communeSoumetClotures}
                    onCheckedChange={(checked) => setCommuneSoumetClotures(checked === true)}
                  />
                  <Label htmlFor="commune-soumet-clotures" className="text-sm cursor-pointer flex items-center gap-1">
                    Ma commune soumet les clôtures à déclaration préalable
                    <InfoTooltip title="Réglementation communale" content="Consultez le PLU de votre commune ou contactez le service urbanisme de votre mairie." />
                  </Label>
                </div>
              </div>
            )}

            {/* Abri de jardin Form */}
            {workCategory === "abri_jardin" && (
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="abri-emprise" className="flex items-center gap-1">
                      Emprise au sol (m²)
                      <InfoTooltip title="Emprise au sol" content="Projection verticale du volume de la construction, débords et surplombs inclus." />
                    </Label>
                    <Input
                      id="abri-emprise"
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="Ex: 12"
                      value={abriEmprise}
                      onChange={(e) => setAbriEmprise(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="abri-surface-plancher" className="flex items-center gap-1">
                      Surface de plancher (m²)
                      <InfoTooltip title="Surface de plancher" content="Somme des surfaces de plancher closes et couvertes, sous une hauteur de plafond supérieure à 1,80 m." />
                    </Label>
                    <Input
                      id="abri-surface-plancher"
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="Ex: 10"
                      value={abriSurfacePlancher}
                      onChange={(e) => setAbriSurfacePlancher(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="abri-hauteur" className="flex items-center gap-1">
                      Hauteur (m)
                      <InfoTooltip title="Hauteur" content="Hauteur maximale de la construction depuis le sol naturel jusqu'au point le plus haut." />
                    </Label>
                    <Input
                      id="abri-hauteur"
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="Ex: 2.5"
                      value={abriHauteur}
                      onChange={(e) => setAbriHauteur(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="zone-protegee-abri"
                    checked={zoneProtegeeAbri}
                    onCheckedChange={(checked) => setZoneProtegeeAbri(checked === true)}
                  />
                  <Label htmlFor="zone-protegee-abri" className="text-sm cursor-pointer">
                    Site patrimonial / abords monuments historiques / site classé
                  </Label>
                </div>
              </div>
            )}

            {/* Extension Form */}
            {workCategory === "extension" && (
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="extension-surface-plancher" className="flex items-center gap-1">
                      Surface de plancher créée (m²)
                      <InfoTooltip title="Surface de plancher" content="Surface de plancher supplémentaire créée par l'extension." />
                    </Label>
                    <Input
                      id="extension-surface-plancher"
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="Ex: 25"
                      value={extensionSurfacePlancher}
                      onChange={(e) => setExtensionSurfacePlancher(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="extension-emprise" className="flex items-center gap-1">
                      Emprise au sol créée (m²)
                      <InfoTooltip title="Emprise au sol" content="Surface au sol supplémentaire créée par l'extension." />
                    </Label>
                    <Input
                      id="extension-emprise"
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="Ex: 20"
                      value={extensionEmprise}
                      onChange={(e) => setExtensionEmprise(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="zone-urbaine-plu"
                      checked={zoneUrbainePlu}
                      onCheckedChange={(checked) => setZoneUrbainePlu(checked === true)}
                    />
                    <Label htmlFor="zone-urbaine-plu" className="text-sm cursor-pointer flex items-center gap-1">
                      Zone urbaine d'un PLU (seuil 40 m² au lieu de 20 m²)
                      <InfoTooltip title="Zone urbaine PLU" content="Si votre terrain est situé en zone urbaine (U) d'un PLU, le seuil de la DP passe de 20 à 40 m²." />
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="zone-protegee-extension"
                      checked={zoneProtegeeExtension}
                      onCheckedChange={(checked) => setZoneProtegeeExtension(checked === true)}
                    />
                    <Label htmlFor="zone-protegee-extension" className="text-sm cursor-pointer">
                      Site patrimonial / abords monuments historiques / site classé
                    </Label>
                  </div>
                </div>
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="space-y-4">
                {/* Formalite Badge + Rule */}
                <div className="p-4 bg-background rounded-lg border border-border space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <FormaliteBadge formalite={result.formalite} />
                      <p className="text-sm text-foreground">{result.rule_explained}</p>
                      <p className="text-xs text-muted-foreground">
                        Référence : {result.article_ref}
                      </p>
                    </div>
                  </div>

                  {/* Warnings */}
                  {result.warnings && result.warnings.length > 0 && (
                    <div className="flex items-start gap-2 p-3 bg-score-orange/5 border border-score-orange/20 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-score-orange flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-score-orange">
                        {result.warnings.map((w, i) => (
                          <p key={i}>{w}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* CERFA Links */}
                {(result.cerfas.length > 0 || result.notice) && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Formulaires à télécharger</Label>
                    <div className="flex flex-wrap gap-2">
                      {result.cerfas.map((cerfa, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="sm"
                          asChild
                          className="gap-1.5"
                        >
                          <a href={cerfa.url} target="_blank" rel="noopener noreferrer">
                            <FileText className="h-4 w-4" />
                            {cerfa.label}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </Button>
                      ))}
                      {result.notice && (
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="gap-1.5 text-muted-foreground"
                        >
                          <a href={result.notice.url} target="_blank" rel="noopener noreferrer">
                            <Info className="h-4 w-4" />
                            {result.notice.label}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Disclaimer */}
            <div className="p-3 bg-muted/50 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">⚠️ Information indicative</strong> — Ces règles sont générales et peuvent varier selon le PLU de votre commune, les zones spécifiques (littoral, montagne) ou les servitudes locales. Vérifiez auprès de votre mairie avant de déposer un dossier.
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
