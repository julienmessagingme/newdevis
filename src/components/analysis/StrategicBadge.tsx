import { useState } from "react";
import { TrendingUp, Lock, ChevronDown, ChevronUp, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// =======================
// TYPES
// =======================

interface StrategicScores {
  ivp_score: number | null;
  ipi_score: number | null;
  label: string;
  breakdown_owner: Record<string, number> | null;
  breakdown_investor: Record<string, number> | null;
}

interface StrategicBadgeProps {
  rawText: string | null;
  isPremium?: boolean;
}

// =======================
// HELPERS
// =======================

function parseStrategicScores(rawText: string | null): StrategicScores | null {
  if (!rawText) return null;
  try {
    const parsed = typeof rawText === "string" ? JSON.parse(rawText) : rawText;
    const s = parsed?.strategic_scores;
    if (!s || s.ivp_score === undefined) return null;
    return s as StrategicScores;
  } catch {
    return null;
  }
}

const LABEL_CONFIG: Record<string, { color: string; bg: string; dot: string }> = {
  "Transformation patrimoniale": { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  "Potentiel stratégique":       { color: "text-blue-700",    bg: "bg-blue-50 border-blue-200",    dot: "bg-blue-500"    },
  "Valorisation significative":  { color: "text-violet-700",  bg: "bg-violet-50 border-violet-200", dot: "bg-violet-500" },
  "Optimisation modérée":        { color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",  dot: "bg-amber-500"  },
  "Impact patrimonial limité":   { color: "text-slate-600",   bg: "bg-slate-50 border-slate-200",  dot: "bg-slate-400"  },
};

const DEFAULT_CONFIG = { color: "text-slate-600", bg: "bg-slate-50 border-slate-200", dot: "bg-slate-400" };

function ScoreGauge({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
        <span className={`text-sm font-bold tabular-nums ${color}`}>{value}<span className="text-xs font-normal text-slate-400">/100</span></span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${color.replace("text-", "bg-")}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

const BREAKDOWN_LABELS: Record<string, string> = {
  value:            "Valeur intrinsèque",
  liquidite:        "Liquidité",
  attractivite:     "Attractivité",
  energie:          "Performance énergétique",
  reduction_risque: "Réduction de risques",
  impact_loyer:     "Impact loyer",
  vacance:          "Réduction vacance",
  fiscalite:        "Optimisation fiscale",
  capex_risk:       "Risque CAPEX",
};

function BreakdownRow({ label, value }: { label: string; value: number }) {
  const pct = (value / 10) * 100;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-40 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-slate-400 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-600 w-8 text-right tabular-nums">{value}/10</span>
    </div>
  );
}

// =======================
// COMPONENT
// =======================

const StrategicBadge = ({ rawText, isPremium = false }: StrategicBadgeProps) => {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const scores = parseStrategicScores(rawText);

  if (!scores) return null;

  const cfg = LABEL_CONFIG[scores.label] ?? DEFAULT_CONFIG;

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white overflow-hidden shadow-sm">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-white/80">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-slate-900">
            <TrendingUp className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-slate-800 tracking-tight">
            Indice Stratégique Immobilier™
          </span>
          {!isPremium && (
            <span className="hidden sm:inline-block text-[10px] font-semibold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              Aperçu
            </span>
          )}
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-4 w-4 text-slate-400 hover:text-slate-600 transition-colors" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs" side="left">
              <p className="text-xs leading-relaxed">
                L'Indice Stratégique Immobilier™ mesure l'impact de ce devis sur la valeur
                patrimoniale (IVP) et la performance investisseur (IPI) de votre bien.
                Calculé automatiquement à partir des types de travaux détectés.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="px-5 py-4">

        {/* Label badge */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-sm font-semibold ${cfg.bg} ${cfg.color}`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
            {scores.label}
          </div>
        </div>

        {/* FREE — teaser + lock */}
        {!isPremium && (
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-500 leading-relaxed">
              Scores IVP &amp; IPI, breakdown par critère et recommandations stratégiques disponibles en version complète.
            </p>
            <button
              type="button"
              className="flex items-center gap-1.5 shrink-0 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-400 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-all duration-150 shadow-sm"
            >
              <Lock className="h-3.5 w-3.5" />
              Débloquer
            </button>
          </div>
        )}

        {/* PREMIUM — scores + breakdown */}
        {isPremium && scores.ivp_score !== null && scores.ipi_score !== null && (
          <>
            {/* Scores */}
            <div className="flex gap-4 mb-4">
              <ScoreGauge value={scores.ivp_score} label="IVP — Valeur patrimoniale" color="text-blue-600" />
              <ScoreGauge value={scores.ipi_score} label="IPI — Performance investisseur" color="text-violet-600" />
            </div>

            {/* Explication */}
            <p className="text-xs text-slate-500 mb-3 leading-relaxed border-t border-slate-100 pt-3">
              Cet indice mesure l'impact stratégique du devis sur votre patrimoine ou votre rendement locatif,
              pondéré par le montant HT de chaque poste de travaux.
            </p>

            {/* Breakdown toggle */}
            {(scores.breakdown_owner || scores.breakdown_investor) && (
              <button
                type="button"
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
              >
                {showBreakdown ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showBreakdown ? "Masquer le détail" : "Voir le détail des critères"}
              </button>
            )}

            {showBreakdown && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 pt-3 border-t border-slate-100">
                {scores.breakdown_owner && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Propriétaire occupant</p>
                    <div className="space-y-1.5">
                      {Object.entries(scores.breakdown_owner).map(([key, val]) => (
                        <BreakdownRow key={key} label={BREAKDOWN_LABELS[key] ?? key} value={val} />
                      ))}
                    </div>
                  </div>
                )}
                {scores.breakdown_investor && (
                  <div className="mt-3 sm:mt-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Investisseur locatif</p>
                    <div className="space-y-1.5">
                      {Object.entries(scores.breakdown_investor).map(([key, val]) => (
                        <BreakdownRow key={key} label={BREAKDOWN_LABELS[key] ?? key} value={val} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default StrategicBadge;
