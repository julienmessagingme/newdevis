import { useState } from "react";
import { TrendingUp, Lock, ChevronDown, ChevronUp, Info, Zap } from "lucide-react";
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
  "Potentiel stratégique":       { color: "text-blue-700",    bg: "bg-blue-50 border-blue-200",       dot: "bg-blue-500"    },
  "Valorisation significative":  { color: "text-violet-700",  bg: "bg-violet-50 border-violet-200",   dot: "bg-violet-500"  },
  "Optimisation modérée":        { color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     dot: "bg-amber-500"   },
  "Impact patrimonial limité":   { color: "text-slate-600",   bg: "bg-slate-50 border-slate-200",     dot: "bg-slate-400"   },
};
const DEFAULT_CONFIG = { color: "text-slate-600", bg: "bg-slate-50 border-slate-200", dot: "bg-slate-400" };

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

type ClassInfo = { label: string; color: string; bg: string; border: string };

function getClassification(score: number): ClassInfo {
  if (score >= 70) return { label: "Fort",   color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" };
  if (score >= 40) return { label: "Modéré", color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200"  };
  return             { label: "Faible",  color: "text-slate-500",   bg: "bg-slate-100",  border: "border-slate-200"  };
}

function getVerdict(ivp: number | null, ipi: number | null): string {
  if (ivp === null || ipi === null) return "Impact à analyser selon le contexte du bien.";
  if (ivp >= 70 && ipi >= 70) return "Excellent : valeur et rentabilité renforcées simultanément.";
  if (ivp >= 70 && ipi < 70)  return "Fort impact patrimonial, rendement locatif plus modéré.";
  if (ivp < 70  && ipi >= 70) return "Bon levier de rendement, impact patrimonial limité.";
  return "Impact global limité — des marges d'optimisation existent.";
}

/** Extrait les Top N leviers (hors capex_risk) en fusionnant owner + investor. */
function getTopLeviers(
  owner: Record<string, number> | null,
  investor: Record<string, number> | null,
  n = 3
): string[] {
  const merged: Record<string, number> = {};
  const add = (src: Record<string, number>) => {
    for (const [k, v] of Object.entries(src)) {
      if (k === "capex_risk") continue;
      merged[k] = Math.max(merged[k] ?? 0, v);
    }
  };
  if (owner)    add(owner);
  if (investor) add(investor);
  return Object.entries(merged)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => BREAKDOWN_LABELS[k] ?? k);
}

// =======================
// SUB-COMPONENTS
// =======================

function ScoreBlock({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent: "blue" | "violet";
}) {
  const cls = getClassification(value);
  const barColor  = accent === "blue" ? "bg-blue-500"   : "bg-violet-500";
  const textColor = accent === "blue" ? "text-blue-700" : "text-violet-700";
  return (
    <div className="flex-1 min-w-0 p-3.5 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${cls.bg} ${cls.color} ${cls.border}`}>
          {cls.label}
        </span>
      </div>
      <div className="flex items-end gap-1.5 mb-2.5">
        <span className={`text-3xl font-black tabular-nums leading-none ${textColor}`}>{value}</span>
        <span className="text-xs text-slate-400 mb-1">/100</span>
      </div>
      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  isRisk = false,
}: {
  label: string;
  value: number;
  isRisk?: boolean;
}) {
  const pct = (value / 10) * 100;
  const barColor = isRisk
    ? "bg-red-300"
    : value >= 7 ? "bg-slate-600" : value >= 4 ? "bg-slate-400" : "bg-slate-300";
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs text-slate-500 w-36 shrink-0 leading-tight">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-slate-600 w-8 text-right tabular-nums">{value}</span>
    </div>
  );
}

// =======================
// MAIN COMPONENT
// =======================

const StrategicBadge = ({ rawText, isPremium = false }: StrategicBadgeProps) => {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const scores = parseStrategicScores(rawText);

  if (!scores) return null;

  const cfg         = LABEL_CONFIG[scores.label] ?? DEFAULT_CONFIG;
  const verdict     = getVerdict(scores.ivp_score, scores.ipi_score);
  const leviers     = getTopLeviers(scores.breakdown_owner, scores.breakdown_investor, 3);
  const hasScores   = scores.ivp_score !== null && scores.ipi_score !== null;
  const hasBreakdown = !!(scores.breakdown_owner || scores.breakdown_investor);

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-slate-900 flex-shrink-0">
            <TrendingUp className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-slate-800 tracking-tight">
            Indice Stratégique Immobilier™
          </span>
          {!isPremium && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              <Lock className="h-2.5 w-2.5" />
              Aperçu
            </span>
          )}
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs" side="left">
              <p className="text-xs leading-relaxed">
                Cet indice résume l'impact réel du devis sur votre valeur patrimoniale (IVP)
                et votre performance locative (IPI), calculé à partir des types de travaux détectés.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="px-5 pt-4 pb-5 space-y-4">

        {/* ── LABEL + VERDICT ── */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold shrink-0 ${cfg.bg} ${cfg.color}`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
            {scores.label}
          </div>
          <p className="text-sm text-slate-600 leading-snug sm:pt-0.5">
            <span className="font-bold text-slate-400 text-[10px] uppercase tracking-widest mr-1.5">
              Verdict
            </span>
            {verdict}
          </p>
        </div>

        {/* ── SCORES IVP / IPI (premium uniquement) ── */}
        {isPremium && hasScores && (
          <div className="flex gap-3">
            <ScoreBlock value={scores.ivp_score!} label="IVP — Valeur patrimoniale"      accent="blue"   />
            <ScoreBlock value={scores.ipi_score!} label="IPI — Performance investisseur" accent="violet" />
          </div>
        )}

        {/* ── LEVIERS CLÉS (toujours visible) ── */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Leviers clés
          </span>
          {leviers.length > 0 ? (
            <>
              {leviers.map((l) => (
                <span
                  key={l}
                  className="text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full transition-colors"
                >
                  {l}
                </span>
              ))}
              {!isPremium && (
                <span className="text-xs text-slate-400 italic">+ risques et conseils…</span>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-400 italic">
              Leviers clés disponibles en version premium
            </span>
          )}
        </div>

        {/* ── FREE : teaser premium ── */}
        {!isPremium && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-sm text-slate-700 font-medium leading-snug">
              Débloquez : IVP/IPI détaillés, poste par poste, et recommandations de négociation.
            </p>
            <ul className="space-y-1.5">
              {[
                "Scores IVP & IPI avec classification Fort / Modéré / Faible",
                "Leviers stratégiques + risques CAPEX par critère",
                "Conseils de négociation par poste de travaux",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-slate-500">
                  <span className="w-1 h-1 rounded-full bg-slate-400 flex-shrink-0 mt-1.5" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="pt-0.5">
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 active:bg-slate-800 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors duration-150 shadow-sm"
              >
                <Zap className="h-4 w-4 text-amber-400 flex-shrink-0" />
                Débloquer l'analyse premium
              </button>
              <p className="text-center text-[11px] text-slate-400 mt-1.5 tracking-wide">
                Instantané · 30 secondes
              </p>
            </div>
          </div>
        )}

        {/* ── PREMIUM : micro-copy + toggle breakdown ── */}
        {isPremium && (
          <>
            <p className="text-xs text-slate-400 leading-relaxed border-t border-slate-100 pt-3">
              Cet indice résume l'impact réel du devis sur votre valeur patrimoniale (IVP)
              et votre performance locative (IPI), pondéré par le montant HT de chaque poste.
            </p>

            {hasBreakdown && (
              <>
                <button
                  type="button"
                  onClick={() => setShowBreakdown(!showBreakdown)}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
                >
                  {showBreakdown
                    ? <ChevronUp className="h-3.5 w-3.5" />
                    : <ChevronDown className="h-3.5 w-3.5" />
                  }
                  {showBreakdown ? "Masquer le détail des critères" : "Voir le détail des critères"}
                </button>

                {showBreakdown && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 pt-3 border-t border-slate-100">
                    {scores.breakdown_owner && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                          Propriétaire occupant
                        </p>
                        <div className="space-y-2">
                          {Object.entries(scores.breakdown_owner).map(([key, val]) => (
                            <BreakdownRow
                              key={key}
                              label={BREAKDOWN_LABELS[key] ?? key}
                              value={val}
                              isRisk={key === "capex_risk"}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {scores.breakdown_investor && (
                      <div className="mt-3 sm:mt-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                          Investisseur locatif
                        </p>
                        <div className="space-y-2">
                          {Object.entries(scores.breakdown_investor).map(([key, val]) => (
                            <BreakdownRow
                              key={key}
                              label={BREAKDOWN_LABELS[key] ?? key}
                              value={val}
                              isRisk={key === "capex_risk"}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default StrategicBadge;
