import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { usePremium } from "@/hooks/usePremium";
import { processJobTypes } from "@/hooks/useMarketPriceAPI";
import type { JobTypeDisplayRow } from "@/hooks/useMarketPriceAPI";
import {
  Loader2,
  ArrowLeft,
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────
interface AnalysisRaw {
  id: string;
  file_name: string;
  score: string | null;
  created_at: string;
  raw_text: string | null;
}

interface AnalysisRow {
  id: string;
  fileName: string;
  score: string | null;
  createdAt: string;
  jobTypes: Map<string, number>; // label → devisTotalHT
  totalHT: number;
}

interface ColumnMarketData {
  avgHT: number;
  count: number;
}

// ─── Helpers ─────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

const scoreColor = (score: string | null) => {
  if (!score) return "text-muted-foreground";
  if (["A+", "A"].includes(score)) return "text-score-green";
  if (["B"].includes(score)) return "text-score-orange";
  return "text-score-red";
};

// ─── Component ───────────────────────────────────────────
const SuiviBudget = () => {
  const { isPremium, isLoading: premiumLoading } = usePremium();
  const [analyses, setAnalyses] = useState<AnalysisRaw[]>([]);
  const [loading, setLoading] = useState(true);

  // Auth + premium guard
  useEffect(() => {
    if (premiumLoading) return;
    if (!isPremium) {
      window.location.href = "/pass-serenite";
      return;
    }

    const fetchAnalyses = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/connexion?redirect=/suivi-budget";
        return;
      }

      const { data } = await supabase
        .from("analyses")
        .select("id, file_name, score, created_at, raw_text")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("created_at", { ascending: false });

      setAnalyses(data || []);
      setLoading(false);
    };

    fetchAnalyses();
  }, [isPremium, premiumLoading]);

  // Build matrix data
  const { rows, columns, columnTotals, columnMarket, grandTotal, grandMarketAvg } = useMemo(() => {
    const allJobTypes = new Set<string>();
    const parsedRows: AnalysisRow[] = [];
    // Accumulate market data per column
    const marketAcc: Map<string, ColumnMarketData> = new Map();

    for (const analysis of analyses) {
      let rawData: unknown = null;
      try {
        const parsed = JSON.parse(analysis.raw_text || "{}");
        rawData = parsed.n8n_price_data;
      } catch { /* ignore */ }

      const jtRows: JobTypeDisplayRow[] = processJobTypes(rawData);
      const jobTypes = new Map<string, number>();
      let totalHT = 0;

      for (const jt of jtRows) {
        const label = jt.jobTypeLabel;
        if (label === "Autre") continue; // Skip uncategorized
        allJobTypes.add(label);
        const amount = jt.devisTotalHT ?? 0;
        jobTypes.set(label, amount);
        totalHT += amount;

        // Accumulate market averages
        if (jt.theoreticalAvgHT > 0) {
          const existing = marketAcc.get(label) || { avgHT: 0, count: 0 };
          existing.avgHT += jt.theoreticalAvgHT;
          existing.count += 1;
          marketAcc.set(label, existing);
        }
      }

      parsedRows.push({
        id: analysis.id,
        fileName: analysis.file_name,
        score: analysis.score,
        createdAt: analysis.created_at,
        jobTypes,
        totalHT,
      });
    }

    // Sort columns alphabetically
    const cols = Array.from(allJobTypes).sort((a, b) => a.localeCompare(b, "fr"));

    // Column totals
    const colTotals = new Map<string, number>();
    for (const col of cols) {
      let sum = 0;
      for (const row of parsedRows) {
        sum += row.jobTypes.get(col) ?? 0;
      }
      colTotals.set(col, sum);
    }

    // Column market averages (weighted average across analyses)
    const colMarket = new Map<string, number>();
    let gMarket = 0;
    for (const col of cols) {
      const acc = marketAcc.get(col);
      if (acc && acc.count > 0) {
        const avg = acc.avgHT / acc.count;
        colMarket.set(col, avg);
        gMarket += avg;
      }
    }

    const gTotal = parsedRows.reduce((sum, r) => sum + r.totalHT, 0);

    return {
      rows: parsedRows,
      columns: cols,
      columnTotals: colTotals,
      columnMarket: colMarket,
      grandTotal: gTotal,
      grandMarketAvg: gMarket,
    };
  }, [analyses]);

  // ─── Loading states ────────────────────────────────────
  if (premiumLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container flex h-16 items-center gap-4">
          <a href="/tableau-de-bord">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </a>
          <div>
            <h1 className="text-lg font-bold text-foreground">Suivi budget</h1>
            <p className="text-xs text-muted-foreground">Vue croisée de tous vos devis par type de lot</p>
          </div>
        </div>
      </header>

      <main className="container py-8">
        {rows.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-xl">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-2">Aucune analyse disponible</h3>
            <p className="text-muted-foreground mb-4">
              Analysez au moins un devis pour voir votre suivi budget
            </p>
            <a href="/nouvelle-analyse">
              <Button>Analyser un devis</Button>
            </a>
          </div>
        ) : columns.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-xl">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-2">Aucun type de lot identifié</h3>
            <p className="text-muted-foreground">
              Vos analyses n'ont pas encore de données de prix marché exploitables
            </p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Devis analysés</p>
                <p className="text-2xl font-bold text-foreground">{rows.length}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Types de lots</p>
                <p className="text-2xl font-bold text-foreground">{columns.length}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Budget total devis</p>
                <p className="text-2xl font-bold text-foreground">{fmt(grandTotal)}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Moyenne marché</p>
                <p className="text-2xl font-bold text-foreground">
                  {grandMarketAvg > 0 ? fmt(grandMarketAvg) : "—"}
                </p>
              </div>
            </div>

            {/* Matrix table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground sticky left-0 bg-muted/50 z-10 min-w-[200px] border-r border-border">
                        Devis
                      </th>
                      {columns.map(col => (
                        <th key={col} className="text-right py-3 px-3 font-medium text-muted-foreground min-w-[130px] whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                      <th className="text-right py-3 px-4 font-bold text-foreground min-w-[120px] border-l border-border bg-muted/70">
                        Total HT
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr
                        key={row.id}
                        className={`border-t border-border/50 hover:bg-muted/20 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                      >
                        <td className="py-3 px-4 sticky left-0 bg-card z-10 border-r border-border">
                          <a
                            href={`/analyse/${row.id}`}
                            className="hover:underline text-foreground font-medium text-xs block truncate max-w-[180px]"
                            title={row.fileName}
                          >
                            {row.fileName}
                          </a>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">{fmtDate(row.createdAt)}</span>
                            {row.score && (
                              <span className={`text-[10px] font-bold ${scoreColor(row.score)}`}>
                                {row.score}
                              </span>
                            )}
                          </div>
                        </td>
                        {columns.map(col => {
                          const val = row.jobTypes.get(col);
                          return (
                            <td key={col} className="text-right py-3 px-3 font-mono text-xs">
                              {val != null && val > 0 ? (
                                <span className="text-foreground">{fmt(val)}</span>
                              ) : (
                                <span className="text-muted-foreground/30">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="text-right py-3 px-4 font-mono text-xs font-bold text-foreground border-l border-border bg-muted/10">
                          {fmt(row.totalHT)}
                        </td>
                      </tr>
                    ))}

                    {/* Total row */}
                    <tr className="border-t-2 border-border bg-primary/5 font-bold">
                      <td className="py-3 px-4 sticky left-0 bg-primary/5 z-10 border-r border-border text-foreground">
                        TOTAL
                      </td>
                      {columns.map(col => (
                        <td key={col} className="text-right py-3 px-3 font-mono text-xs text-foreground">
                          {fmt(columnTotals.get(col) ?? 0)}
                        </td>
                      ))}
                      <td className="text-right py-3 px-4 font-mono text-xs text-foreground border-l border-border bg-primary/10">
                        {fmt(grandTotal)}
                      </td>
                    </tr>

                    {/* Market average row */}
                    <tr className="border-t border-border bg-blue-50/50">
                      <td className="py-3 px-4 sticky left-0 bg-blue-50/50 z-10 border-r border-border">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-blue-700">Prix marché moy.</span>
                        </div>
                      </td>
                      {columns.map(col => {
                        const marketAvg = columnMarket.get(col);
                        const total = columnTotals.get(col) ?? 0;
                        if (!marketAvg || marketAvg <= 0) {
                          return (
                            <td key={col} className="text-right py-3 px-3 text-xs text-muted-foreground/30">
                              —
                            </td>
                          );
                        }
                        const diff = total - marketAvg;
                        const pct = (diff / marketAvg) * 100;
                        return (
                          <td key={col} className="text-right py-3 px-3">
                            <div className="font-mono text-xs text-blue-700">{fmt(marketAvg)}</div>
                            {total > 0 && (
                              <div className={`flex items-center justify-end gap-0.5 text-[10px] mt-0.5 ${
                                pct <= -10 ? "text-score-green" : pct >= 10 ? "text-score-red" : "text-muted-foreground"
                              }`}>
                                {pct <= -5 ? <TrendingDown className="h-3 w-3" /> : pct >= 5 ? <TrendingUp className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                {pct >= 0 ? "+" : ""}{pct.toFixed(0)}%
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-right py-3 px-4 border-l border-border bg-blue-50/70">
                        {grandMarketAvg > 0 ? (
                          <>
                            <div className="font-mono text-xs font-medium text-blue-700">{fmt(grandMarketAvg)}</div>
                            <div className={`text-[10px] mt-0.5 ${
                              grandTotal <= grandMarketAvg * 0.9 ? "text-score-green" : grandTotal >= grandMarketAvg * 1.1 ? "text-score-red" : "text-muted-foreground"
                            }`}>
                              {grandTotal > grandMarketAvg ? "+" : ""}{((grandTotal - grandMarketAvg) / grandMarketAvg * 100).toFixed(0)}% vs marché
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground/30 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <TrendingDown className="h-3 w-3 text-score-green" />
                <span>En dessous du marché (-10%+)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Minus className="h-3 w-3 text-muted-foreground" />
                <span>Dans la norme</span>
              </div>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3 text-score-red" />
                <span>Au dessus du marché (+10%+)</span>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default SuiviBudget;
