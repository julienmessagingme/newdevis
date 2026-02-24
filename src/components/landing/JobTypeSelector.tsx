import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, ChevronDown, Check } from "lucide-react";

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
// HELPERS
// ========================================

const normalize = (str: string) =>
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const formatUnit = (unit: string) => {
  if (unit === "m²" || unit === "m2") return "m²";
  if (unit === "ml") return "ml";
  if (unit === "m3") return "m³";
  if (unit === "forfait") return "forfait";
  if (unit === "heure") return "heure";
  return "unité";
};

// ========================================
// COMPONENT
// ========================================

const JobTypeSelector = ({ value, onChange, onJobTypeData }: JobTypeSelectorProps) => {
  const [jobTypes, setJobTypes] = useState<JobTypeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchJobTypes = async () => {
      const { data, error } = await supabase
        .from("market_prices")
        .select("job_type, label, unit, notes")
        .order("label");

      if (error || !data) {
        console.error("[JobTypeSelector] Erreur chargement market_prices:", error);
        setIsLoading(false);
        return;
      }

      // Mots-clés de variante à détecter dans les parenthèses finales du label
      const VARIANT_KEYWORDS = ["difficile", "complexe", "standard", "urgence", "simple", "rapide", "normal", "économique", "basique", "premium", "chantier"];

      // Extrait le nom de base si le label se termine par une variante entre parenthèses
      const extractBase = (label: string): { base: string; isVariant: boolean; isStandard: boolean } => {
        const match = label.match(/^(.+?)\s*\(([^)]+)\)$/);
        if (match) {
          const suffix = match[2].toLowerCase();
          const isVariant = VARIANT_KEYWORDS.some(kw => suffix.includes(kw));
          return { base: match[1].trim(), isVariant, isStandard: suffix.includes("standard") };
        }
        return { base: label, isVariant: false, isStandard: false };
      };

      // Pass 1 : déduplique par label+unité, priorité notes="Base"
      const seen = new Map<string, JobTypeItem>();
      for (const row of data) {
        const key = `${row.label}||${row.unit}`;
        const existing = seen.get(key);
        if (!existing || row.notes === "Base") {
          seen.set(key, { job_type: row.job_type, label: row.label, unit: row.unit });
        }
      }

      // Pass 2 : regroupe les variantes (difficile/complexe/standard/urgence)
      // → garde uniquement l'entrée "standard" (ou la première dispo), renommée en nom de base
      const variantGroups = new Map<string, JobTypeItem[]>();
      const finalItems: JobTypeItem[] = [];

      for (const item of Array.from(seen.values())) {
        const { base, isVariant } = extractBase(item.label);
        if (isVariant) {
          const groupKey = `${base}||${item.unit}`;
          if (!variantGroups.has(groupKey)) variantGroups.set(groupKey, []);
          variantGroups.get(groupKey)!.push(item);
        } else {
          finalItems.push(item);
        }
      }

      for (const [groupKey, items] of variantGroups) {
        if (items.length === 1) {
          // Une seule entrée dans le groupe → garder telle quelle
          finalItems.push(items[0]);
        } else {
          // Plusieurs variantes → garder "standard" ou la première, renommer en nom de base
          const standard = items.find(i => i.label.toLowerCase().includes("standard"));
          const chosen = standard || items[0];
          const baseName = groupKey.split("||")[0];
          finalItems.push({ ...chosen, label: baseName });
        }
      }

      setJobTypes(
        finalItems.sort((a, b) => a.label.localeCompare(b.label, "fr"))
      );
      setIsLoading(false);
    };

    fetchJobTypes();
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedItem = jobTypes.find(item => item.job_type === value);

  const filtered = search.length >= 2
    ? jobTypes.filter(item => normalize(item.label).includes(normalize(search)))
    : jobTypes;

  const handleSelect = (item: JobTypeItem) => {
    onChange(item.job_type);
    onJobTypeData?.(item);
    setSearch("");
    setIsOpen(false);
  };

  const handleTriggerClick = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 h-10 px-3 text-sm text-muted-foreground border rounded-md bg-background">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement des travaux...
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleTriggerClick}
        className="flex items-center justify-between w-full h-10 px-3 text-sm border rounded-md bg-background hover:bg-accent/50 transition-colors text-left"
      >
        <span className={selectedItem ? "text-foreground" : "text-muted-foreground"}>
          {selectedItem
            ? `${selectedItem.label} (${formatUnit(selectedItem.unit)})`
            : "Sélectionnez un type de travaux"}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg">
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un type de travaux..."
              className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* Results list */}
          <div className="max-h-[250px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                Aucun résultat pour « {search} »
              </p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.job_type}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className="flex items-center justify-between w-full px-3 py-2 text-sm text-left hover:bg-accent transition-colors"
                >
                  <span>
                    {item.label}{" "}
                    <span className="text-muted-foreground">({formatUnit(item.unit)})</span>
                  </span>
                  {item.job_type === value && (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default JobTypeSelector;
