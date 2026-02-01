import { useState, useEffect, useMemo, useRef } from "react";
import { ChevronDown, Search, Loader2, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

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
// TRAVAUX POPULAIRES (curated list)
// ========================================

const POPULAR_JOB_TYPES = [
  // Peinture / murs / finitions
  "peinture_murs",
  "peinture_plafond",
  "enduit_lissage",
  "toile_verre",
  "papier_peint",
  // Sols
  "carrelage_sol_pose",
  "parquet_flottant",
  "sol_pvc",
  "ragreage",
  "poncage_parquet",
  // Salle de bain / WC
  "douche",
  "wc_remplacement",
  "wc_suspendu",
  "lavabo",
  "pose_meuble_sdb",
  // Électricité
  "prise_pose",
  "interrupteur_pose",
  "tableau_electrique_remplacement",
  "luminaire",
  // Plomberie
  "robinet_remplacement",
  "remplacement_siphon",
  "chauffe_eau_remplacement",
  // Menuiseries
  "fenetre_pose",
  "porte_interieure_pose",
  "volet",
  // Divers
  "demolition_legere",
  "nettoyage_fin_chantier",
  "protection_chantier",
];

// ========================================
// COMPONENT
// ========================================

const JobTypeSelector = ({ value, onChange, onJobTypeData }: JobTypeSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [allJobTypes, setAllJobTypes] = useState<JobTypeItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch job types from n8n on mount
  useEffect(() => {
    const fetchJobTypes = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Appel à n8n pour récupérer la liste des job types
        const { data, error: fnError } = await supabase.functions.invoke("test-webhook", {
          body: {
            url: "https://n8n.messagingme.app/webhook/d1cfedb7-0ebb-44ca-bb2b-543ee84b0075",
            method: "POST",
            formDataFields: {
              action: "list_job_types",
            },
          },
        });

        if (fnError) throw new Error(fnError.message);
        
        // Parse response - expecting { ok: true, job_types: [...] }
        const response = data?.data;
        
        if (response?.ok && Array.isArray(response.job_types)) {
          setAllJobTypes(response.job_types);
        } else if (response?.ok && Array.isArray(response.lines)) {
          // Fallback if job_types comes as lines
          const jobTypes = response.lines.map((line: any) => ({
            job_type: line.job_type || line.key,
            label: line.label || line.name,
            unit: line.unit || "m²",
          }));
          setAllJobTypes(jobTypes);
        } else {
          // Fallback to hardcoded list if API fails
          console.warn("n8n didn't return job_types, using fallback");
          setAllJobTypes([
            { job_type: "peinture_murs", label: "Peinture murs", unit: "m²" },
            { job_type: "peinture_plafond", label: "Peinture plafond", unit: "m²" },
            { job_type: "carrelage_sol_pose", label: "Pose carrelage sol", unit: "m²" },
            { job_type: "parquet_flottant", label: "Pose parquet flottant", unit: "m²" },
            { job_type: "enduit_lissage", label: "Enduit / lissage", unit: "m²" },
            { job_type: "demolition_legere", label: "Démolition légère", unit: "m²" },
            { job_type: "douche", label: "Pose douche", unit: "unité" },
            { job_type: "wc_remplacement", label: "Remplacement WC", unit: "unité" },
            { job_type: "fenetre_pose", label: "Pose fenêtre", unit: "unité" },
            { job_type: "volet", label: "Pose volet roulant", unit: "unité" },
          ]);
        }
      } catch (err) {
        console.error("Failed to fetch job types:", err);
        setError("Impossible de charger les types de travaux");
        // Fallback minimal
        setAllJobTypes([
          { job_type: "peinture_murs", label: "Peinture murs", unit: "m²" },
          { job_type: "carrelage_sol_pose", label: "Pose carrelage sol", unit: "m²" },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchJobTypes();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter popular job types based on what exists in n8n response
  const popularItems = useMemo(() => {
    return POPULAR_JOB_TYPES
      .map(jobType => allJobTypes.find(item => item.job_type === jobType))
      .filter((item): item is JobTypeItem => item !== undefined)
      .slice(0, 30);
  }, [allJobTypes]);

  // Filter all job types by search query
  const filteredAllItems = useMemo(() => {
    // Filter out items with missing labels first
    const validItems = allJobTypes.filter(item => item && item.label && item.job_type);
    
    if (!searchQuery.trim()) return validItems;
    
    const query = searchQuery.toLowerCase().trim();
    return validItems.filter(item => 
      item.label.toLowerCase().includes(query) ||
      item.job_type.toLowerCase().includes(query)
    );
  }, [allJobTypes, searchQuery]);

  // Sort all items alphabetically
  const sortedAllItems = useMemo(() => {
    return [...filteredAllItems].sort((a, b) => 
      (a.label || "").localeCompare(b.label || "", 'fr')
    );
  }, [filteredAllItems]);

  // Get selected item
  const selectedItem = useMemo(() => {
    return allJobTypes.find(item => item.job_type === value);
  }, [allJobTypes, value]);

  // Notify parent of selected job type data
  useEffect(() => {
    onJobTypeData?.(selectedItem || null);
  }, [selectedItem, onJobTypeData]);

  const handleSelect = (jobType: string) => {
    onChange(jobType);
    setIsOpen(false);
    setSearchQuery("");
  };

  const formatLabel = (item: JobTypeItem) => {
    const unitDisplay = item.unit === "m²" || item.unit === "m2" 
      ? "m²" 
      : item.unit === "forfait" 
        ? "forfait" 
        : "unité";
    return `${item.label} (${unitDisplay})`;
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selectedItem ? "text-foreground" : "text-muted-foreground"}>
          {selectedItem ? formatLabel(selectedItem) : "Sélectionnez un type de travaux"}
        </span>
        <ChevronDown className={`h-4 w-4 opacity-50 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-lg">
          {/* Search Input */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Rechercher un type de travaux..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 bg-background"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Chargement...</span>
              </div>
            ) : error ? (
              <div className="p-4 text-center text-sm text-destructive">{error}</div>
            ) : (
              <>
                {/* Popular Section - only if no search */}
                {!searchQuery.trim() && popularItems.length > 0 && (
                  <div className="py-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <Star className="h-3 w-3" />
                      Travaux populaires
                    </div>
                    {popularItems.map((item) => (
                      <button
                        key={item.job_type}
                        type="button"
                        onClick={() => handleSelect(item.job_type)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${
                          value === item.job_type ? "bg-accent/50 font-medium" : ""
                        }`}
                      >
                        {formatLabel(item)}
                      </button>
                    ))}
                  </div>
                )}

                {/* Separator */}
                {!searchQuery.trim() && popularItems.length > 0 && sortedAllItems.length > 0 && (
                  <div className="border-t my-1" />
                )}

                {/* All Jobs Section */}
                {(searchQuery.trim() || sortedAllItems.length > 0) && (
                  <div className="py-2">
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {searchQuery.trim() 
                        ? `Résultats (${sortedAllItems.length})` 
                        : "Tous les travaux (A-Z)"}
                    </div>
                    {sortedAllItems.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                        Aucun résultat pour "{searchQuery}"
                      </div>
                    ) : (
                      sortedAllItems.map((item) => (
                        <button
                          key={item.job_type}
                          type="button"
                          onClick={() => handleSelect(item.job_type)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${
                            value === item.job_type ? "bg-accent/50 font-medium" : ""
                          }`}
                        >
                          {formatLabel(item)}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default JobTypeSelector;
