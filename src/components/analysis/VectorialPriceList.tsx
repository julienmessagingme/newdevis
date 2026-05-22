/**
 * VectorialPriceList.tsx — Phase D affichage mode vectoriel (V3.5.0).
 *
 * Bascule de BlockPrixMarche quand l'edge function a tourné en
 * MARKET_MATCHER_VECTORIAL=on. Chaque ligne devis est désormais 1 carte avec
 * un badge confidence (high/medium/low/no_match) basé sur la similarity du
 * top-1 match catalogue (cosine similarity entre embedding ligne et catalogue).
 *
 * Pourquoi cette UI vs l'AnalysisCard V3.6 :
 *   - V3.6 groupait N lignes en M groupes (groupement Gemini Phase 2)
 *     → 1 carte par groupe, badge "verdict" basé sur ratio devis/marché.
 *     → Bug : groupements aberrants (PH VISION, devis placo TCE).
 *   - V3.5 vectoriel : 1 ligne devis = 1 embedding = 1 match catalogue.
 *     → 1 carte par ligne (plus de cartes mais plus précis).
 *     → Badge "confidence" sur la qualité du match catalogue (pas le prix).
 *     → Section "Non comparable" séparée pour les no_match (au lieu de
 *       forcer un match faux comme V3.6 le faisait).
 *
 * Trois sections affichées dans l'ordre :
 *   1. Comparables fiables (high + medium) — affichage prix marché + verdict.
 *   2. Comparables incertains (low) — affichage avec disclaimer.
 *   3. Non comparables (no_match) — carte grise, montant devis only.
 *
 * Pagination : si > 15 cartes dans une section, on n'affiche que les 15 premières
 * + bouton "Voir les X autres".
 */

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import type { JobTypeDisplayRow } from "@/hooks/useMarketPriceAPI";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

// ── Badge confidence ────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence, similarity }: { confidence: "high" | "medium" | "low" | "no_match"; similarity: number | null }) {
  const config = {
    high: {
      label: "Match fiable",
      icon: "✅",
      cls: "text-emerald-700 bg-emerald-100 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-800",
      tip: similarity !== null
        ? `Correspondance catalogue très fiable (similarité ${fmtPct(similarity)}). Le prix marché affiché est représentatif.`
        : "Correspondance catalogue très fiable.",
    },
    medium: {
      label: "Match plausible",
      icon: "🟡",
      cls: "text-amber-800 bg-amber-100 border-amber-200 dark:text-amber-300 dark:bg-amber-900/30 dark:border-amber-800",
      tip: similarity !== null
        ? `Correspondance catalogue plausible (similarité ${fmtPct(similarity)}). À valider visuellement avec la description du devis.`
        : "Correspondance catalogue plausible.",
    },
    low: {
      label: "Match incertain",
      icon: "⚠️",
      cls: "text-orange-700 bg-orange-100 border-orange-200 dark:text-orange-300 dark:bg-orange-900/30 dark:border-orange-800",
      tip: similarity !== null
        ? `Correspondance catalogue faible (similarité ${fmtPct(similarity)}). Le prix marché affiché peut ne pas être représentatif de la prestation réelle.`
        : "Correspondance catalogue faible.",
    },
    no_match: {
      label: "Non comparable",
      icon: "⚫",
      cls: "text-gray-700 bg-gray-100 border-gray-200 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-700",
      tip: "Aucune correspondance fiable trouvée dans notre référentiel pour ce type de prestation. Le prix marché n'est pas affiché — il n'aurait pas de valeur indicative.",
    },
  };

  const c = config[confidence];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${c.cls}`}
      title={c.tip}
    >
      <span aria-hidden="true">{c.icon}</span>
      {c.label}
    </span>
  );
}

// ── Carte vectorielle ───────────────────────────────────────────────────────

interface VectorialCardProps {
  row: JobTypeDisplayRow;
}

function VectorialCard({ row }: VectorialCardProps) {
  const [expanded, setExpanded] = useState(false);
  const v = row.vectorial;
  if (!v) return null; // garde TS — appelé uniquement quand vectorial set

  const isNoMatch = v.confidence === "no_match";
  const hasPrices = row.prices.length > 0;
  // Pour les cartes vectorielles, 1 ligne = 1 carte → on prend la première ligne
  // pour la description visible (le row.jobTypeLabel = label catalogue top-1)
  const lineDesc = row.devisLines[0]?.description ?? row.jobTypeLabel;

  return (
    <div className={`border rounded-xl bg-card overflow-hidden ${isNoMatch ? "border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-900/20" : "border-border/60"}`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3 sm:p-4 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Description devis (ligne réelle) */}
            <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
              {lineDesc}
            </p>
            {/* Match catalogue (top-1) — affiché seulement si !no_match */}
            {!isNoMatch && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                → matché à : <span className="font-medium">{row.jobTypeLabel}</span>
              </p>
            )}
            {/* Ligne prix + badge confidence */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
              <span className="text-foreground font-medium">{"Devis : "}{fmt(row.devisTotalHT)}</span>
              {hasPrices && !isNoMatch && (
                <span className="text-muted-foreground">
                  {"Marché : "}{fmt(row.theoreticalMinHT)}{" – "}{fmt(row.theoreticalMaxHT)}
                </span>
              )}
              <ConfidenceBadge confidence={v.confidence} similarity={v.top_similarity} />
            </div>
          </div>
          {expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          }
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/50 p-3 sm:p-4 space-y-3">
          {/* Détails ligne devis */}
          {row.devisLines.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Détail devis</p>
              {row.devisLines.map((l, idx) => (
                <div key={idx} className="text-xs space-y-0.5">
                  <p className="text-foreground">{l.description}</p>
                  <p className="text-muted-foreground">
                    {l.quantity !== null && l.unit ? `${l.quantity} ${l.unit} · ` : ""}
                    {fmt(l.amountHT)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Top candidats catalogue (transparence) */}
          {v.all_candidates.length > 1 && (
            <div className="space-y-1.5 pt-2 border-t border-border/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Autres correspondances catalogue
              </p>
              <ul className="space-y-0.5">
                {v.all_candidates.slice(1).map((c, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                    <span className="truncate">{c.label}</span>
                    <span className="font-mono text-[10px] flex-shrink-0">{fmtPct(c.similarity)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Disclaimer no_match */}
          {isNoMatch && (
            <div className="flex items-start gap-2 p-2.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <Info className="h-3.5 w-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-700 dark:text-gray-300 leading-snug">
                Notre référentiel n'a pas trouvé d'équivalent fiable pour ce type de prestation.
                Demandez à l'artisan le détail du prix unitaire pour valider la cohérence.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section avec pagination ─────────────────────────────────────────────────

const SECTION_PAGE_SIZE = 15;

function PaginatedSection({
  title,
  description,
  rows,
  defaultExpanded = true,
}: {
  title: string;
  description?: string;
  rows: JobTypeDisplayRow[];
  defaultExpanded?: boolean;
}) {
  const [sectionExpanded, setSectionExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);

  if (rows.length === 0) return null;

  const visible = showAll ? rows : rows.slice(0, SECTION_PAGE_SIZE);
  const hidden = rows.length - visible.length;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setSectionExpanded(!sectionExpanded)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            {title} <span className="text-muted-foreground font-normal">({rows.length})</span>
          </h3>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {sectionExpanded
          ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        }
      </button>

      {sectionExpanded && (
        <div className="space-y-2">
          {visible.map((row, idx) => (
            <VectorialCard key={`${row.jobTypeLabel}-${idx}`} row={row} />
          ))}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full text-center py-2 text-xs text-primary hover:text-primary/80 font-medium"
            >
              Voir les {hidden} autres correspondances
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Composant principal ─────────────────────────────────────────────────────

interface VectorialPriceListProps {
  rows: JobTypeDisplayRow[];
}

export function VectorialPriceList({ rows }: VectorialPriceListProps) {
  const { fiables, incertains, nonComparables } = useMemo(() => {
    const fiables: JobTypeDisplayRow[] = [];
    const incertains: JobTypeDisplayRow[] = [];
    const nonComparables: JobTypeDisplayRow[] = [];
    for (const r of rows) {
      const c = r.vectorial?.confidence ?? "no_match";
      if (c === "high" || c === "medium") fiables.push(r);
      else if (c === "low") incertains.push(r);
      else nonComparables.push(r);
    }
    return { fiables, incertains, nonComparables };
  }, [rows]);

  const total = rows.length;
  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground italic py-4 text-center">
        Aucun poste analysé.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Mini-récap en-tête */}
      <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs">
        <p className="text-muted-foreground leading-relaxed">
          Analyse ligne par ligne via similarité catalogue. <strong>{fiables.length}</strong> {fiables.length > 1 ? "postes comparables fiablement" : "poste comparable fiablement"},{" "}
          <strong>{incertains.length}</strong> {incertains.length > 1 ? "incertains" : "incertain"},{" "}
          <strong>{nonComparables.length}</strong> {nonComparables.length > 1 ? "sans équivalent catalogue" : "sans équivalent catalogue"}.
        </p>
      </div>

      <PaginatedSection
        title="Comparables fiables"
        description="Match catalogue de bonne qualité — prix marché représentatif."
        rows={fiables}
        defaultExpanded={true}
      />

      <PaginatedSection
        title="Comparables incertains"
        description="Match catalogue faible — à valider visuellement avec l'artisan."
        rows={incertains}
        defaultExpanded={incertains.length <= 5}
      />

      <PaginatedSection
        title="Non comparables"
        description="Aucun équivalent dans notre référentiel — prix marché non affiché par honnêteté."
        rows={nonComparables}
        defaultExpanded={false}
      />

      <p className="text-xs text-muted-foreground mt-3 italic">
        Ces correspondances sont calculées par similarité sémantique (embedding vectoriel) sur 911 entrées catalogue.
        Elles ne constituent pas une évaluation de la qualité du prestataire.
      </p>
    </div>
  );
}
