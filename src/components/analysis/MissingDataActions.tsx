import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Plus, AlertCircle } from "lucide-react";
import { useState } from "react";

// ============================================================
// COMPOSANT: Actions pour données manquantes
// Objectif: Ne jamais dire "à vérifier" → proposer une action concrète
// ============================================================

interface MissingDataButtonProps {
  type: "upload" | "input";
  label: string;
  description?: string;
  onAction?: (value?: string | File) => void;
  inputPlaceholder?: string;
  inputType?: "text" | "number";
  inputSuffix?: string;
  className?: string;
}

export const MissingDataButton = ({
  type,
  label,
  description,
  onAction,
  inputPlaceholder,
  inputType = "text",
  inputSuffix,
  className = ""
}: MissingDataButtonProps) => {
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const handleSubmit = () => {
    if (inputValue.trim()) {
      onAction?.(inputValue);
      setShowInput(false);
      setInputValue("");
    }
  };

  if (type === "upload") {
    return (
      <div className={`inline-flex flex-col ${className}`}>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-primary border-primary/30 hover:bg-primary/5"
          onClick={() => onAction?.()}
        >
          <Upload className="h-4 w-4" />
          {label}
        </Button>
        {description && (
          <span className="text-xs text-muted-foreground mt-1">{description}</span>
        )}
      </div>
    );
  }

  if (showInput) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Input
          type={inputType}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={inputPlaceholder}
          className="h-8 text-sm max-w-32"
        />
        {inputSuffix && (
          <span className="text-sm text-muted-foreground">{inputSuffix}</span>
        )}
        <Button size="sm" onClick={handleSubmit} disabled={!inputValue.trim()}>
          Valider
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowInput(false)}>
          Annuler
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={`gap-2 text-primary border-primary/30 hover:bg-primary/5 ${className}`}
      onClick={() => setShowInput(true)}
    >
      <Plus className="h-4 w-4" />
      {label}
    </Button>
  );
};

// ============================================================
// BANNIÈRE: Informations manquantes avec actions
// Remplace les anciens messages vagues par du concret
// ============================================================

interface MissingItem {
  label: string;
  actionType: "upload" | "input" | "none";
  actionLabel?: string;
  inputPlaceholder?: string;
  inputSuffix?: string;
  onAction?: (value?: string | File) => void;
}

interface MissingDataBannerProps {
  title?: string;
  items: MissingItem[];
  className?: string;
}

export const MissingDataBanner = ({
  title = "Informations non disponibles dans le devis transmis",
  items,
  className = ""
}: MissingDataBannerProps) => {
  if (items.length === 0) return null;

  return (
    <div className={`p-4 bg-muted/50 border border-border rounded-xl ${className}`}>
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground mb-3">{title}</p>
          <ul className="space-y-3">
            {items.map((item, idx) => (
              <li key={idx} className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground">• {item.label}</span>
                {item.actionType !== "none" && item.actionLabel && (
                  <MissingDataButton
                    type={item.actionType}
                    label={item.actionLabel}
                    inputPlaceholder={item.inputPlaceholder}
                    inputSuffix={item.inputSuffix}
                    onAction={item.onAction}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// TEXTES FACTUELS: Remplacements obligatoires
// INTERDIT: "à vérifier", "invitent à", "nous conseillons"
// ============================================================

export const FACTUAL_TEXTS = {
  // Assurances
  insurance_not_found: "Non disponible dans le devis transmis",
  decennale_not_detected: "Aucune attestation décennale n'a été détectée dans le devis fourni",
  rcpro_not_detected: "Aucune attestation RC Pro n'a été détectée dans le devis fourni",
  
  // IBAN
  iban_not_found: "Aucun IBAN n'a été détecté dans le devis",
  iban_invalid: "IBAN non valide",
  
  // Surface / Quantité
  quantity_not_found: "Quantité non disponible dans le devis transmis",
  surface_not_found: "Surface non disponible dans le devis transmis",
  
  // Entreprise
  company_not_identified: "Entreprise non identifiable à partir du devis transmis",
  siret_not_found: "Aucun SIRET n'a été détecté dans le devis fourni",
  
  // Données externes
  external_data_not_found: "Aucune donnée publique n'a été trouvée pour ce point",
  google_rating_not_found: "Aucun avis Google n'a été trouvé pour cette entreprise",
  rge_not_found: "Aucune certification RGE n'a été trouvée",
  
  // Générique
  data_not_available: "Non disponible",
  info_missing: "Information non présente dans le devis"
} as const;

export default MissingDataBanner;
