import type { GlobalAnalysis } from "@/lib/quoteGlobalAnalysis";

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

// ============================================================
// MAIN COMPONENT
// Rôle : afficher UNIQUEMENT le décompte des postes par catégorie de prix.
// Le verdict, le surcoût et les actions vivent exclusivement dans ConclusionIA.
// ============================================================

interface GlobalAnalysisCardProps {
  analysis: GlobalAnalysis;
}

export function GlobalAnalysisCard({ analysis }: GlobalAnalysisCardProps) {
  const {
    nbNormal,
    nbLegerementEleve,
    nbSurvalue,
    nbAnomalie,
    nbForfait,
    totalItemsAnalyzed,
  } = analysis;

  // N'affiche rien s'il n'y a aucun poste comparable ET aucun forfait
  if (totalItemsAnalyzed === 0 && nbForfait === 0) return null;

  // Cas forfait global uniquement
  if (totalItemsAnalyzed === 0 && nbForfait > 0) {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-4 py-3 mb-4">
        <p className="text-xs text-blue-700 dark:text-blue-400 leading-snug">
          <strong>Devis au forfait global.</strong>{" "}
          Demandez le détail des postes à l&apos;artisan pour comparer efficacement avec le marché.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Répartition des postes
        {nbForfait > 0 && (
          <span className="ml-2 text-blue-600 dark:text-blue-400 normal-case font-normal">
            &middot; {nbForfait} forfait{nbForfait > 1 ? "s" : ""} exclu{nbForfait > 1 ? "s" : ""} de la comparaison
          </span>
        )}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatChip value={nbNormal}          label="Prix correct"      color="green"  />
        <StatChip value={nbLegerementEleve}  label="Légèrement élevé" color="amber"  />
        <StatChip value={nbSurvalue}         label="Surévalué"        color="orange" />
        <StatChip value={nbAnomalie}         label="Prix anormal"     color="red"    />
      </div>
    </div>
  );
}

export default GlobalAnalysisCard;
