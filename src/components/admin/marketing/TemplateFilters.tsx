import {
  NARRATIVE_LABELS,
  MOOD_LABELS,
  ALL_NARRATIVES,
  ALL_MOODS,
} from "./helpers";
import type { NarrativeType } from "@/types/marketing";

export interface TemplateFiltersState {
  product: "all" | "vmd" | "gmc";
  narrative_type: "all" | NarrativeType;
  usage_status: "all" | "never_used" | "available" | "cooldown";
  mood: "all" | string;
}

export const DEFAULT_TEMPLATE_FILTERS: TemplateFiltersState = {
  product: "all",
  narrative_type: "all",
  usage_status: "all",
  mood: "all",
};

interface Props {
  filters: TemplateFiltersState;
  onChange: (f: TemplateFiltersState) => void;
}

export default function TemplateFilters({ filters, onChange }: Props) {
  const set = <K extends keyof TemplateFiltersState>(
    key: K,
    value: TemplateFiltersState[K],
  ) => onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Product toggle */}
      <div className="flex rounded-lg border overflow-hidden">
        {(["all", "vmd", "gmc"] as const).map((v) => (
          <button
            key={v}
            onClick={() => set("product", v)}
            className={`px-3 py-1.5 text-xs font-medium transition ${
              filters.product === v
                ? "bg-primary text-primary-foreground"
                : "bg-card hover:bg-muted"
            }`}
          >
            {v === "all" ? "Tous" : v.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Narrative */}
      <select
        value={filters.narrative_type}
        onChange={(e) => set("narrative_type", e.target.value as TemplateFiltersState["narrative_type"])}
        className="rounded-md border border-input bg-background px-3 py-1.5 text-xs"
      >
        <option value="all">Structure — Toutes</option>
        {ALL_NARRATIVES.map((n) => (
          <option key={n} value={n}>
            {n} — {NARRATIVE_LABELS[n]}
          </option>
        ))}
      </select>

      {/* Usage status */}
      <select
        value={filters.usage_status}
        onChange={(e) => set("usage_status", e.target.value as TemplateFiltersState["usage_status"])}
        className="rounded-md border border-input bg-background px-3 py-1.5 text-xs"
      >
        <option value="all">Usage — Tous</option>
        <option value="never_used">Jamais utilisé</option>
        <option value="available">Disponible</option>
        <option value="cooldown">En cooldown</option>
      </select>

      {/* Mood */}
      <select
        value={filters.mood}
        onChange={(e) => set("mood", e.target.value)}
        className="rounded-md border border-input bg-background px-3 py-1.5 text-xs"
      >
        <option value="all">Mood — Tous</option>
        {ALL_MOODS.map((m) => (
          <option key={m} value={m}>
            {MOOD_LABELS[m] ?? m}
          </option>
        ))}
      </select>
    </div>
  );
}
