import type { GlobalAnalysis } from "@/lib/quoteGlobalAnalysis";

// ============================================================
// HELPERS
// ============================================================

const fmt = (n: number): string =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + "\u00a0€";

// ============================================================
// SUB-COMPONENTS
// ============================================================

interface StatChipProps {
  value: number;
  label: string;
  color: "green" | "amber" | "orange" | "red";
}

const COLOR_MAP: Record<StatChipProps["color"], string> = {
  green:  "bg-green-100  text-green-800  border-green-200  dark:bg-green-900/30  dark:text-green-300  dark:border-green-800",
  amber:  "bg-amber-100  text-amber-800  border-amber-200  dark:bg-amber-900/30  dark:text-amber-300  dark:border-amber-800",
  orange: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
  red:    "bg-red-100    text-red-800    border-red-200    dark:bg-red-900/30    dark:text-red-300    dark:border-red-800",
};

function StatChip({ value, label, color }: StatChipProps) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border px-3 py-2.5 gap-0.5 ${COLOR_MAP[color]}`}>
      <span className="text-xl font-bold leading-none">{value}</span>
      <span className="text-[10px] font-medium text-center leading-tight opacity-80">{label}</span>
    </div>
  );
}

interface ActionItemProps {
  text: string;
  /** Affiche le texte en gras + couleur accent */
  emphasis?: boolean;
}

function ActionItem({ text, emphasis = false }: ActionItemProps) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 flex-shrink-0 text-base leading-none">👉</span>
      <span className={emphasis ? "font-semibold text-foreground" : "text-foreground/90"}>{text}</span>
    </li>
  );
}

// ============================================================
// STATUS CONFIG
// ============================================================

const STATUS_CONFIG = {
  correct: {
    containerCls: "bg-green-50  border-green-200  dark:bg-green-950/30  dark:border-green-800",
    titleCls:     "text-green-800  dark:text-green-300",
    costCls:      "text-green-700  dark:text-green-400",
    icon:         "🟢",
    title:        "Devis globalement cohérent",
  },
  a_negocier: {
    containerCls: "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800",
    titleCls:     "text-orange-800 dark:text-orange-300",
    costCls:      "text-orange-700 dark:text-orange-400",
    icon:         "🟠",
    title:        "Devis à négocier avant signature",
  },
  risque_eleve: {
    containerCls: "bg-red-50    border-red-200    dark:bg-red-950/30    dark:border-red-800",
    titleCls:     "text-red-800    dark:text-red-300",
    costCls:      "text-red-700    dark:text-red-400",
    icon:         "🔴",
    title:        "Devis à risque élevé",
  },
} as const;

// ============================================================
// MAIN COMPONENT
// ============================================================

interface GlobalAnalysisCardProps {
  analysis: GlobalAnalysis;
}

export function GlobalAnalysisCard({ analysis }: GlobalAnalysisCardProps) {
  const {
    status,
    nbNormal,
    nbLegerementEleve,
    nbSurvalue,
    nbAnomalie,
    surcoutEstime,
    surcoutMin,
    surcoutMax,
    anomalieItems,
    survalueItems,
    totalItemsAnalyzed,
  } = analysis;

  // N'affiche rien s'il n'y a aucun poste comparable
  if (totalItemsAnalyzed === 0) return null;

  const cfg = STATUS_CONFIG[status];

  return (
    <div
      className={`rounded-2xl border-2 p-4 sm:p-6 mb-5 ${cfg.containerCls}`}
      role="region"
      aria-label="Analyse globale du devis"
    >
      {/* ── En-tête ─────────────────────────────────────────── */}
      <div className="flex items-start gap-3 mb-5">
        <span className="text-2xl leading-none flex-shrink-0 mt-0.5" aria-hidden="true">
          {cfg.icon}
        </span>
        <div className="min-w-0">
          <h3 className={`font-bold text-base sm:text-lg leading-tight ${cfg.titleCls}`}>
            {cfg.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Basé sur{" "}
            <strong>{totalItemsAnalyzed}</strong>{" "}
            poste{totalItemsAnalyzed > 1 ? "s" : ""} avec référence marché
          </p>
        </div>
      </div>

      <div className="space-y-5">

        {/* ── Synthèse ─────────────────────────────────────────── */}
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
            📊 Synthèse
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatChip value={nbNormal}          label="Correct"           color="green"  />
            <StatChip value={nbLegerementEleve}  label="Légèrement élevé" color="amber"  />
            <StatChip value={nbSurvalue}         label="Surévalué"        color="orange" />
            <StatChip value={nbAnomalie}         label="Anomalie majeure" color="red"    />
          </div>
        </section>

        {/* ── Surcoût estimé (uniquement si > 0) ───────────────── */}
        {surcoutEstime > 0 && (
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
              💸 Surcoût estimé
            </p>
            <div className="bg-background/60 rounded-xl border border-border/40 px-4 py-3">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
                <span className={`text-2xl font-bold tabular-nums ${cfg.costCls}`}>
                  {fmt(surcoutMin)}{" "}–{" "}{fmt(surcoutMax)}
                </span>
                <span className="text-xs text-muted-foreground">
                  au-dessus des fourchettes marché
                </span>
              </div>
              {/* Liste des postes concernés */}
              {(anomalieItems.length > 0 || survalueItems.length > 0) && (
                <div className="mt-2.5 pt-2.5 border-t border-border/30 flex flex-wrap gap-x-4 gap-y-1">
                  {anomalieItems.map((item) => (
                    <span key={item.label} className="text-[11px] text-red-700 dark:text-red-400 font-medium">
                      🔴 {item.label} (+{fmt(item.surcout)})
                    </span>
                  ))}
                  {survalueItems.map((item) => (
                    <span key={item.label} className="text-[11px] text-orange-700 dark:text-orange-400 font-medium">
                      🟠 {item.label} (+{fmt(item.surcout)})
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Plan d'action ────────────────────────────────────── */}
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
            Plan d'action
          </p>
          <ul className="space-y-2">
            {nbAnomalie > 0 && (
              <ActionItem
                text={
                  anomalieItems.length === 1
                    ? `Demandez des explications détaillées pour le poste "${anomalieItems[0].label}" (prix anormalement élevé)`
                    : `Demandez des explications détaillées pour les ${nbAnomalie} postes anormalement élevés`
                }
              />
            )}
            {nbSurvalue > 0 && (
              <ActionItem
                text={
                  survalueItems.length === 1
                    ? `Négociez le poste "${survalueItems[0].label}" ou comparez avec d'autres devis`
                    : `Négociez les ${nbSurvalue} postes surévalués ou comparez avec d'autres devis`
                }
              />
            )}
            <ActionItem
              text="Nous recommandons de ne pas signer sans clarification des écarts identifiés"
              emphasis
            />
          </ul>
        </section>

      </div>
    </div>
  );
}

export default GlobalAnalysisCard;
