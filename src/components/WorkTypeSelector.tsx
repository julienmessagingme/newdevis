import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, X, Plus, Ruler } from "lucide-react";
import { 
  CATEGORIES_TRAVAUX, 
  parseWorkTypeValue, 
  createWorkTypeValue,
  type Categorie,
  type SousType 
} from "@/lib/workTypeReferentiel";

interface WorkTypeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  // Mode multi-select pour la page résultat
  multiSelect?: boolean;
  // Surface manuelle si non détectée
  manualSurface?: number | null;
  onManualSurfaceChange?: (surface: number | null) => void;
  // Unité pour la surface (détectée ou forcée)
  surfaceUnit?: string;
  // Message quand surface non détectée
  showSurfaceInput?: boolean;
}

/**
 * Sélecteur hiérarchique à deux niveaux pour le type de travaux
 * 
 * Niveau 1: Catégorie (ex: Extérieur, Intérieur, Plomberie...)
 * Niveau 2: Sous-type métier (ex: Allée / accès / voirie privée)
 * 
 * RÈGLE ABSOLUE: Tant qu'un sous-type n'est pas sélectionné, 
 * la jauge de prix reste masquée.
 */
const WorkTypeSelector = ({ 
  value, 
  onChange, 
  disabled,
  multiSelect = false,
  manualSurface,
  onManualSurfaceChange,
  surfaceUnit = "m²",
  showSurfaceInput = false,
}: WorkTypeSelectorProps) => {
  // Parse la valeur initiale
  const parsed = parseWorkTypeValue(value);
  
  const [selectedCategorie, setSelectedCategorie] = useState<string>(parsed?.categorieKey || "");
  const [selectedSousType, setSelectedSousType] = useState<string>(parsed?.sousTypeKey || "");
  const [surfaceInputValue, setSurfaceInputValue] = useState<string>(manualSurface?.toString() || "");

  // Trouver la catégorie sélectionnée
  const categorie = CATEGORIES_TRAVAUX.find(cat => cat.key === selectedCategorie);
  const hasSousTypes = categorie && categorie.sousTypes.length > 0;

  // Sync avec la valeur externe si elle change
  useEffect(() => {
    const parsed = parseWorkTypeValue(value);
    if (parsed) {
      setSelectedCategorie(parsed.categorieKey);
      setSelectedSousType(parsed.sousTypeKey);
    } else if (value && !value.includes(':')) {
      // Ancien format (juste une catégorie) - reset
      setSelectedCategorie(value);
      setSelectedSousType("");
    }
  }, [value]);

  // Sync manual surface
  useEffect(() => {
    setSurfaceInputValue(manualSurface?.toString() || "");
  }, [manualSurface]);

  // Quand on change de catégorie
  const handleCategorieChange = (catKey: string) => {
    setSelectedCategorie(catKey);
    setSelectedSousType("");
    
    // Si c'est "autres", pas besoin de sous-type
    if (catKey === "autres") {
      onChange("autres");
    } else {
      // Clear la valeur tant qu'un sous-type n'est pas sélectionné
      onChange("");
    }
  };

  // Quand on sélectionne un sous-type
  const handleSousTypeChange = (sousTypeKey: string) => {
    setSelectedSousType(sousTypeKey);
    
    if (selectedCategorie && sousTypeKey) {
      const combinedValue = createWorkTypeValue(selectedCategorie, sousTypeKey);
      onChange(combinedValue);
    }
  };

  // Gestion de la surface manuelle
  const handleSurfaceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSurfaceInputValue(val);
    
    if (onManualSurfaceChange) {
      const numVal = parseFloat(val.replace(',', '.'));
      onManualSurfaceChange(isNaN(numVal) || numVal <= 0 ? null : numVal);
    }
  };

  // Trouver le sous-type sélectionné pour afficher sa description
  const selectedSousTypeInfo = categorie?.sousTypes.find(st => st.key === selectedSousType);
  const needsM2 = selectedSousTypeInfo?.unite === 'm²';

  return (
    <div className="space-y-4">
      {/* Niveau 1: Catégorie */}
      <div className="space-y-2">
        <Label className="text-base font-semibold flex items-center gap-2">
          Type de travaux
          <span className="text-destructive">*</span>
        </Label>
        
        <Select
          value={selectedCategorie}
          onValueChange={handleCategorieChange}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sélectionnez une catégorie de travaux" />
          </SelectTrigger>
          <SelectContent className="bg-background border border-border z-50 max-h-[300px]">
            {CATEGORIES_TRAVAUX.map((cat) => (
              <SelectItem key={cat.key} value={cat.key}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Niveau 2: Sous-type (affiché seulement si une catégorie avec sous-types est sélectionnée) */}
      {selectedCategorie && selectedCategorie !== "autres" && hasSousTypes && (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-muted-foreground">
            Précisez le type exact de travaux
            <span className="text-destructive ml-1">*</span>
          </Label>
          
          <Select
            value={selectedSousType}
            onValueChange={handleSousTypeChange}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sélectionnez le sous-type de travaux" />
            </SelectTrigger>
            <SelectContent className="bg-background border border-border z-50 max-h-[300px]">
              {categorie?.sousTypes.map((st) => (
                <SelectItem key={st.key} value={st.key}>
                  <div className="flex flex-col items-start">
                    <span>{st.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {st.prixMin}–{st.prixMax} € / {st.unite}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Description du sous-type sélectionné */}
          {selectedSousTypeInfo?.description && (
            <p className="text-xs text-muted-foreground italic mt-1">
              {selectedSousTypeInfo.description}
            </p>
          )}
        </div>
      )}

      {/* Saisie manuelle de surface (si nécessaire pour les catégories m²) */}
      {showSurfaceInput && needsM2 && selectedSousType && (
        <div className="space-y-2 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Ruler className="h-4 w-4 text-amber-600" />
            Surface totale ({surfaceUnit})
          </Label>
          <p className="text-xs text-muted-foreground mb-2">
            Aucune surface n'a été détectée automatiquement. 
            Saisissez la surface totale pour activer la comparaison de prix.
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="decimal"
              placeholder="Ex: 192"
              value={surfaceInputValue}
              onChange={handleSurfaceChange}
              disabled={disabled}
              className="max-w-[150px]"
            />
            <span className="text-sm text-muted-foreground">{surfaceUnit}</span>
          </div>
        </div>
      )}

      {/* Message d'alerte si catégorie sélectionnée mais pas de sous-type */}
      {selectedCategorie && selectedCategorie !== "autres" && hasSousTypes && !selectedSousType && (
        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Veuillez sélectionner le type exact de travaux pour activer l'analyse de prix.
          </p>
        </div>
      )}

      {/* Info pour catégorie "autres" */}
      {selectedCategorie === "autres" && (
        <div className="flex items-start gap-2 p-3 bg-muted/50 border border-border rounded-lg">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            Cette catégorie ne dispose pas de fourchette de prix de référence. 
            L'analyse de cohérence financière ne sera pas disponible.
          </p>
        </div>
      )}
    </div>
  );
};

export default WorkTypeSelector;
