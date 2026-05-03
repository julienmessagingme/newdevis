import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  ALL_PERSONAS,
  ALL_PLATFORMS,
  ALL_STATUSES,
  PERSONA_LABELS,
  PLATFORM_LABELS,
  STATUS_LABELS,
} from "./helpers";
import type {
  MarketingPersonaCode,
  MarketingPlatform,
  MarketingPostStatus,
} from "@/types/marketing";

export interface PostFiltersState {
  status: MarketingPostStatus | "all";
  persona: MarketingPersonaCode | "all";
  platform: MarketingPlatform | "all";
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_FILTERS: PostFiltersState = {
  status: "all",
  persona: "all",
  platform: "all",
  dateFrom: "",
  dateTo: "",
};

interface PostFiltersProps {
  filters: PostFiltersState;
  onChange: (next: PostFiltersState) => void;
}

export default function PostFilters({ filters, onChange }: PostFiltersProps) {
  const hasActive =
    filters.status !== "all" ||
    filters.persona !== "all" ||
    filters.platform !== "all" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  return (
    <div className="flex flex-col md:flex-row md:items-end gap-2 md:gap-3 md:flex-wrap">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:contents">
        <div className="md:w-44">
          <label className="text-xs font-medium text-muted-foreground block mb-1">Statut</label>
          <Select
            value={filters.status}
            onValueChange={(v) => onChange({ ...filters, status: v as PostFiltersState["status"] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {ALL_STATUSES.map(s => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="md:w-52">
          <label className="text-xs font-medium text-muted-foreground block mb-1">Persona</label>
          <Select
            value={filters.persona}
            onValueChange={(v) => onChange({ ...filters, persona: v as PostFiltersState["persona"] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les personas</SelectItem>
              {ALL_PERSONAS.map(p => (
                <SelectItem key={p} value={p}>{PERSONA_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="md:w-40">
          <label className="text-xs font-medium text-muted-foreground block mb-1">Plateforme</label>
          <Select
            value={filters.platform}
            onValueChange={(v) => onChange({ ...filters, platform: v as PostFiltersState["platform"] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {ALL_PLATFORMS.map(p => (
                <SelectItem key={p} value={p}>{PLATFORM_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:contents">
        <div className="md:w-40">
          <label className="text-xs font-medium text-muted-foreground block mb-1">Du</label>
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
          />
        </div>
        <div className="md:w-40">
          <label className="text-xs font-medium text-muted-foreground block mb-1">Au</label>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
          />
        </div>
      </div>

      {hasActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="md:self-end"
        >
          <X className="h-4 w-4 mr-1" />
          Réinitialiser
        </Button>
      )}
    </div>
  );
}
