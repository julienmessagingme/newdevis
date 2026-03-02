import { useState } from "react";
import { TrendingUp, Lock, ChevronDown, ChevronUp, HelpCircle, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import PremiumGate from "@/components/funnel/PremiumGate";

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
  onAuthSuccess?: () => void;
  convertToPermanent?: (params: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone: string;
    acceptCommercial?: boolean;
  }) => Promise<any>;
  currentUserId?: string;
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

// ── Verdict humain basé sur IVP uniquement ──
type HumanVerdict = {
  emoji: string;
  label: string;
  color: string;
  bg: string;
  border: string;
};

function getHumanVerdict(ivp: number | null): HumanVerdict {
  if (ivp === null) {
    return { emoji: "⚪", label: "Impact non calculé", color: "text-slate-500", bg: "bg-slate-50", border: "border-slate-200" };
  }
  if (ivp >= 70) {
    return { emoji: "🟢", label: "Forte création de valeur", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" };
  }
  if (ivp >= 40) {
    return { emoji: "🟡", label: "Valorisation partielle", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" };
  }
  return { emoji: "🔴", label: "Faible impact à la revente", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" };
}

// ── Classification technique (premium) ──
type ClassInfo = { label: string; color: string; bg: string; border: string };

function getClassification(score: number): ClassInfo {
  if (score >= 70) return { label: "Fort",   color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" };
  if (score >= 40) return { label: "Modéré", color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200"  };
  return             { label: "Faible",  color: "text-slate-500",   bg: "bg-slate-100",  border: "border-slate-200"  };
}

// ── Interprétations en langage naturel ──
function getIvpInterpretation(ivp: number): string {
  if (ivp >= 70) return "Ces travaux ont un fort potentiel de revalorisation. Ils sont généralement bien perçus par les acheteurs et améliorent la valeur de revente.";
  if (ivp >= 40) return "Ces travaux améliorent le bien, mais leur impact sur le prix de vente sera probablement partiel. Tout l'investissement ne se retrouvera pas dans la valeur.";
  return "Ces travaux sont avant tout utiles au confort ou à la maintenance. Leur effet sur la valeur de revente reste limité.";
}

function getIpiInterpretation(ipi: number): string {
  if (ipi >= 70) return "Bon potentiel pour la location. Ces travaux peuvent réduire les périodes de vacance et améliorer le loyer perçu.";
  if (ipi >= 40) return "Impact modéré sur la rentabilité locative. Certains postes peuvent améliorer l'attractivité du bien.";
  return "Ces travaux ont peu d'effet direct sur les revenus locatifs ou la réduction de la vacance.";
}

// ── Mapping critères : clés techniques → libellés humains + tooltips ──
// Les clés internes (value, liquidite…) ne changent pas — seul l'affichage est modifié.
interface CriterionConfig {
  label: string;
  tooltip: string;
}

const CRITERIA_CONFIG: Record<string, CriterionConfig> = {
  // Propriétaire occupant
  value: {
    label:   "Qualité perçue du bien",
    tooltip: "Améliore l'image générale du logement aux yeux d'un futur acheteur.",
  },
  liquidite: {
    label:   "Facilité de revente",
    tooltip: "Plus un bien est facile à revendre rapidement, plus sa valeur est sécurisée.",
  },
  attractivite: {
    label:   "Attractivité du bien",
    tooltip: "Rend le bien plus séduisant sur le marché.",
  },
  energie: {
    label:   "Performance énergétique",
    tooltip: "Influence les factures, la réglementation et l'intérêt des acheteurs.",
  },
  reduction_risque: {
    label:   "Sécurité du projet",
    tooltip: "Réduit les risques de dépenses imprévues ou de dégradation.",
  },
  // Investisseur locatif
  impact_loyer: {
    label:   "Potentiel d'augmentation du loyer",
    tooltip: "Capacité des travaux à justifier un loyer plus élevé.",
  },
  vacance: {
    label:   "Réduction du risque de vacance",
    tooltip: "Diminue la probabilité que le bien reste vide.",
  },
  fiscalite: {
    label:   "Avantage fiscal potentiel",
    tooltip: "Peut améliorer la rentabilité selon votre situation fiscale.",
  },
  capex_risk: {
    label:   "Risque de gros travaux futurs",
    tooltip: "Probabilité d'avoir des dépenses importantes dans les prochaines années.",
  },
};

/** Retourne le libellé humain d'un critère (fallback sur la clé brute). */
function getCriterionLabel(key: string): string {
  return CRITERIA_CONFIG[key]?.label ?? key;
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
    .map(([k]) => getCriterionLabel(k));
}

// =======================
// SUB-COMPONENTS
// =======================

function ScoreBlock({
  value,
  title,
  subtitle,
  interpretation,
  accent,
}: {
  value: number;
  title: string;
  subtitle: string;
  interpretation: string;
  accent: "blue" | "violet";
}) {
  const cls       = getClassification(value);
  const barColor  = accent === "blue" ? "bg-blue-500"   : "bg-violet-500";
  const textColor = accent === "blue" ? "text-blue-700" : "text-violet-700";
  return (
    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors">
      {/* Titre + pastille */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</p>
          <p className="text-[10px] text-slate-400 leading-tight">{subtitle}</p>
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${cls.bg} ${cls.color} ${cls.border}`}>
          {cls.label}
        </span>
      </div>
      {/* Score */}
      <div className="flex items-end gap-1 mb-2">
        <span className={`text-3xl font-black tabular-nums leading-none ${textColor}`}>{value}</span>
        <span className="text-xs text-slate-400 mb-0.5">/100</span>
      </div>
      {/* Barre */}
      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
          style={{ width: `${value}%` }}
        />
      </div>
      {/* Interprétation */}
      <p className="text-xs text-slate-500 leading-relaxed">{interpretation}</p>
    </div>
  );
}

/**
 * Ligne de critère avec libellé humain + icône ⓘ tooltip.
 * Les clés internes (key) ne sont jamais affichées.
 */
function BreakdownRow({
  criterionKey,
  value,
  isRisk = false,
}: {
  criterionKey: string;
  value: number;
  isRisk?: boolean;
}) {
  const config   = CRITERIA_CONFIG[criterionKey];
  const label    = config?.label   ?? criterionKey;
  const tooltip  = config?.tooltip ?? undefined;
  const pct      = (value / 10) * 100;
  const barColor = isRisk
    ? "bg-red-300"
    : value >= 7 ? "bg-slate-600" : value >= 4 ? "bg-slate-400" : "bg-slate-300";

  return (
    <div className="flex items-center gap-2.5">
      {/* Libellé + icône info — largeur fixe pour l'alignement des barres */}
      <div className="flex items-start gap-1 w-48 shrink-0">
        <span className="text-xs text-slate-500 leading-tight flex-1 min-w-0">{label}</span>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`En savoir plus : ${label}`}
                className="flex-shrink-0 mt-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-sm"
              >
                <Info className="h-3 w-3 text-slate-300 hover:text-slate-500 transition-colors cursor-help" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              className="max-w-[220px] text-xs leading-relaxed shadow-md"
              side="right"
              sideOffset={6}
            >
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {/* Barre */}
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Score numérique */}
      <span className="text-xs font-semibold text-slate-600 w-8 text-right tabular-nums">{value}</span>
    </div>
  );
}

// =======================
// MAIN COMPONENT
// =======================

const StrategicBadge = ({ rawText, isPremium = false, onAuthSuccess, convertToPermanent, currentUserId }: StrategicBadgeProps) => {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const scores = parseStrategicScores(rawText);

  if (!scores) return null;

  const verdict      = getHumanVerdict(scores.ivp_score);
  const leviers      = getTopLeviers(scores.breakdown_owner, scores.breakdown_investor, 3);
  const hasScores    = scores.ivp_score !== null && scores.ipi_score !== null;
  const hasBreakdown = !!(scores.breakdown_owner || scores.breakdown_investor);

  return (
    // Un seul TooltipProvider couvre tout le composant (header + critères)
    <TooltipProvider delayDuration={200}>
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">

        {/* ── HEADER ── */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-slate-900 flex-shrink-0 mt-0.5">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 leading-tight">
                Impact des travaux sur la valeur du bien
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Indice Stratégique Immobilier™</p>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="En savoir plus sur cet indicateur"
                className="outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-sm flex-shrink-0 mt-0.5"
              >
                <HelpCircle className="h-4 w-4 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs leading-relaxed shadow-md" side="left">
              Tous les travaux n'ont pas le même effet sur la valeur d'un bien. Cet indicateur estime
              leur impact réel sur la valeur de revente et la performance locative, calculé à partir
              des types de travaux détectés dans le devis.
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="px-5 pt-4 pb-5 space-y-4">

          {/* ── VERDICT HUMAIN + PHRASE PÉDAGOGIQUE ── */}
          <div className="space-y-2.5">
            <div className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl border self-start ${verdict.bg} ${verdict.border}`}>
              <span className="text-base leading-none">{verdict.emoji}</span>
              <span className={`text-sm font-bold leading-tight ${verdict.color}`}>{verdict.label}</span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed">
              Tous les travaux n'augmentent pas le prix de revente à hauteur du montant investi.
              Cet indicateur estime la part réellement valorisable.
            </p>
          </div>

          {/* ── LEVIERS CLÉS (toujours visible) ── */}
          {leviers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-0.5">
                Ce qui porte la valeur
              </span>
              {leviers.map((l) => (
                <span
                  key={l}
                  className="text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full transition-colors"
                >
                  {l}
                </span>
              ))}
            </div>
          )}

          {/* ── FREE : PremiumGate collapsible ── */}
          {!isPremium && onAuthSuccess && convertToPermanent && (
            <div className="pt-1">
              <PremiumGate
                onAuthSuccess={onAuthSuccess}
                convertToPermanent={convertToPermanent}
                title="Débloquez l'analyse complète (IVP/IPI & rentabilité)"
                currentUserId={currentUserId}
              />
            </div>
          )}

          {/* ── PREMIUM : scores + breakdown + encadré ── */}
          {isPremium && hasScores && (
            <>
              {/* IVP + IPI avec interprétation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                <ScoreBlock
                  value={scores.ivp_score!}
                  title="IVP"
                  subtitle="Indice de Valorisation Patrimoniale"
                  interpretation={getIvpInterpretation(scores.ivp_score!)}
                  accent="blue"
                />
                <ScoreBlock
                  value={scores.ipi_score!}
                  title="IPI"
                  subtitle="Indice de Performance Investisseur"
                  interpretation={getIpiInterpretation(scores.ipi_score!)}
                  accent="violet"
                />
              </div>

              {/* Breakdown détaillé */}
              {hasBreakdown && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowBreakdown(!showBreakdown)}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    {showBreakdown
                      ? <ChevronUp   className="h-3.5 w-3.5" />
                      : <ChevronDown className="h-3.5 w-3.5" />
                    }
                    {showBreakdown ? "Masquer le détail des critères" : "Voir le détail des critères"}
                  </button>

                  {showBreakdown && (
                    <div className="pt-3 border-t border-slate-100 space-y-5">
                      {/* Phrase intro */}
                      <p className="text-[11px] text-slate-400 italic">
                        Ces éléments expliquent pourquoi certains travaux créent plus de valeur que d'autres.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                        {scores.breakdown_owner && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                              Propriétaire occupant
                            </p>
                            <div className="space-y-2.5">
                              {Object.entries(scores.breakdown_owner).map(([key, val]) => (
                                <BreakdownRow
                                  key={key}
                                  criterionKey={key}
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
                            <div className="space-y-2.5">
                              {Object.entries(scores.breakdown_investor).map(([key, val]) => (
                                <BreakdownRow
                                  key={key}
                                  criterionKey={key}
                                  value={val}
                                  isRisk={key === "capex_risk"}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Mini encadré pédagogique */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-700 mb-2.5">
                  💡 Comment interpréter ces scores ?
                </p>
                <ul className="space-y-2 mb-3">
                  {[
                    { bold: "IVP ≥ 70", text: "Les travaux ont un fort potentiel de revalorisation à la revente." },
                    { bold: "IPI ≥ 70", text: "Les travaux sont favorables à la location (loyer, attractivité, vacance)." },
                    { bold: "Leviers clés", text: "Les critères qui pèsent le plus dans le calcul de ces indices." },
                  ].map(({ bold, text }) => (
                    <li key={bold} className="flex items-start gap-2 text-xs text-slate-500 leading-relaxed">
                      <span className="font-semibold text-slate-600 shrink-0">{bold} —</span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="/valorisation-travaux-immobiliers"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium transition-colors"
                >
                  Comment fonctionne l'estimation de la valorisation ?
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default StrategicBadge;
