import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ========================================
// TYPES
// ========================================

export interface JobTypeItem {
  job_type: string;
  label: string;
  unit: string;
}

interface JobTypeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  onJobTypeData?: (item: JobTypeItem | null) => void;
}

// ========================================
// 30 TRAVAUX POPULAIRES (liste statique)
// ========================================

const POPULAR_JOB_TYPES: JobTypeItem[] = [
  // Peinture / murs / finitions
  { job_type: "peinture_murs", label: "Peinture murs", unit: "m²" },
  { job_type: "peinture_plafond", label: "Peinture plafond", unit: "m²" },
  { job_type: "enduit_lissage", label: "Enduit / lissage", unit: "m²" },
  { job_type: "toile_verre", label: "Pose toile de verre", unit: "m²" },
  { job_type: "papier_peint", label: "Pose papier peint", unit: "m²" },
  
  // Sols
  { job_type: "carrelage_sol_pose", label: "Pose carrelage sol", unit: "m²" },
  { job_type: "parquet_flottant", label: "Pose parquet flottant", unit: "m²" },
  { job_type: "sol_pvc", label: "Pose sol PVC", unit: "m²" },
  { job_type: "ragreage", label: "Ragréage", unit: "m²" },
  { job_type: "poncage_parquet", label: "Ponçage parquet", unit: "m²" },
  
  // Salle de bain / WC
  { job_type: "douche", label: "Pose douche", unit: "unité" },
  { job_type: "wc_remplacement", label: "Remplacement WC", unit: "unité" },
  { job_type: "wc_suspendu", label: "Pose WC suspendu", unit: "unité" },
  { job_type: "lavabo", label: "Pose lavabo", unit: "unité" },
  { job_type: "pose_meuble_sdb", label: "Pose meuble SDB", unit: "unité" },
  
  // Électricité
  { job_type: "prise_pose", label: "Pose prise électrique", unit: "unité" },
  { job_type: "interrupteur_pose", label: "Pose interrupteur", unit: "unité" },
  { job_type: "tableau_electrique_remplacement", label: "Remplacement tableau électrique", unit: "forfait" },
  { job_type: "luminaire", label: "Point lumineux", unit: "unité" },
  
  // Plomberie
  { job_type: "robinet_remplacement", label: "Remplacement robinet", unit: "unité" },
  { job_type: "remplacement_siphon", label: "Remplacement siphon", unit: "unité" },
  { job_type: "chauffe_eau_remplacement", label: "Remplacement chauffe-eau", unit: "unité" },
  
  // Menuiseries
  { job_type: "fenetre_pose", label: "Pose fenêtre", unit: "unité" },
  { job_type: "porte_interieure_pose", label: "Pose porte intérieure", unit: "unité" },
  { job_type: "volet", label: "Pose volet roulant", unit: "unité" },
  
  // Divers très demandés
  { job_type: "demolition_legere", label: "Démolition légère", unit: "m²" },
  { job_type: "nettoyage_fin_chantier", label: "Nettoyage fin de chantier", unit: "m²" },
  { job_type: "protection_chantier", label: "Protection chantier", unit: "forfait" },
  { job_type: "placo", label: "Pose placo / cloison", unit: "m²" },
  { job_type: "isolation", label: "Isolation", unit: "m²" },
];

// ========================================
// COMPONENT
// ========================================

const JobTypeSelector = ({ value, onChange, onJobTypeData }: JobTypeSelectorProps) => {
  
  const handleChange = (newValue: string) => {
    onChange(newValue);
    const selectedItem = POPULAR_JOB_TYPES.find(item => item.job_type === newValue);
    onJobTypeData?.(selectedItem || null);
  };

  const formatLabel = (item: JobTypeItem) => {
    const unitDisplay = item.unit === "m²" || item.unit === "m2" 
      ? "m²" 
      : item.unit === "forfait" 
        ? "forfait" 
        : "unité";
    return `${item.label} (${unitDisplay})`;
  };

  // Get selected item for display
  const selectedItem = POPULAR_JOB_TYPES.find(item => item.job_type === value);

  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger className="bg-background">
        <SelectValue placeholder="Sélectionnez un type de travaux">
          {selectedItem ? formatLabel(selectedItem) : "Sélectionnez un type de travaux"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-popover border shadow-lg z-50 max-h-[300px]">
        {POPULAR_JOB_TYPES.map((item) => (
          <SelectItem key={item.job_type} value={item.job_type}>
            {formatLabel(item)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default JobTypeSelector;
