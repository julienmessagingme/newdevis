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
  ChevronRight,
  ChevronDown,
} from "lucide-react";

// ─── Category mapping ────────────────────────────────────
// Maps catalog_job_type prefixes to main trade categories
const PREFIX_TO_CATEGORY: Record<string, string> = {
  electricite: "Électricité",
  plomberie: "Plomberie",
  peinture: "Peinture",
  carrelage: "Carrelage",
  faience: "Carrelage",
  menuiserie: "Menuiseries",
  porte_fenetre: "Menuiseries",
  baie_vitree: "Menuiseries",
  fenetre: "Menuiseries",
  chassis: "Menuiseries",
  volet: "Menuiseries",
  porte: "Menuiseries",
  maconnerie: "Maçonnerie",
  isolation: "Isolation",
  toiture: "Toiture",
  couverture: "Toiture",
  zinguerie: "Toiture",
  chauffage: "Chauffage",
  climatisation: "Chauffage",
  pompe_a_chaleur: "Chauffage",
  demolition: "Démolition",
  evacuation: "Divers",
  revetement: "Revêtement sol",
  parquet: "Revêtement sol",
  cloison: "Cloisons / Placo",
  placo: "Cloisons / Placo",
  doublage: "Cloisons / Placo",
  facade: "Façade",
  ravalement: "Façade",
  charpente: "Charpente",
  terrasse: "Terrasse",
  amenagement: "Aménagement",
  cuisine: "Cuisine",
  salle_de_bain: "Salle de bain",
  sdb: "Salle de bain",
  assainissement: "Assainissement",
  terrassement: "Terrassement",
  enduit: "Façade",
  etancheite: "Étanchéité",
  serrurerie: "Serrurerie",
  vitrerie: "Menuiseries",
  stores: "Menuiseries",
  domotique: "Électricité",
  alarme: "Électricité",
  vmc: "Ventilation",
  ventilation: "Ventilation",
};

function getCategoryFromJobType(jt: JobTypeDisplayRow): string {
  // Try catalog_job_types first
  for (const catalogId of jt.catalogJobTypes) {
    const lower = catalogId.toLowerCase();
    // Try longest prefix match first
    for (const [prefix, cat] of Object.entries(PREFIX_TO_CATEGORY)) {
      if (lower.startsWith(prefix)) return cat;
    }
  }
  // Fallback: try to infer from the label
  const label = jt.jobTypeLabel.toLowerCase();
  for (const [prefix, cat] of Object.entries(PREFIX_TO_CATEGORY)) {
    if (label.includes(prefix.replace(/_/g, " "))) return cat;
  }
  return "Divers";
}

// ─── Types ───────────────────────────────────────────────
interface AnalysisRaw {
  id: string;
  file_name: string;
  score: string | null;
  created_at: string;
  raw_text: string | null;
}

interface SubRow {
  jobTypeLabel: string;
  category: string;
  amountHT: number;
  marketAvgHT: number;
}

interface AnalysisRow {
  id: string;
  fileName: string;
  score: string | null;
  createdAt: string;
  categoryTotals: Map<string, number>;
  subRows: SubRow[];
  totalHT: number;
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
  const { rows, categories, categoryTotals, categoryMarket, grandTotal, grandMarketAvg } = useMemo(() => {
    const allCategories = new Set<string>();
    const parsedRows: AnalysisRow[] = [];
    const marketAcc: Map<string, { total: number; count: number }> = new Map();

    for (const analysis of analyses) {
      let rawData: unknown = null;
      try {
        const parsed = JSON.parse(analysis.raw_text || "{}");
        rawData = parsed.n8n_price_data;
      } catch { /* ignore */ }

      const jtRows: JobTypeDisplayRow[] = processJobTypes(rawData);
      const catTotals = new Map<string, number>();
      const subRows: SubRow[] = [];
      let totalHT = 0;

      for (const jt of jtRows) {
        if (jt.jobTypeLabel === "Autre") continue;
        const category = getCategoryFromJobType(jt);
        allCategories.add(category);
        const amount = jt.devisTotalHT ?? 0;
        catTotals.set(category, (catTotals.get(category) ?? 0) + amount);
        totalHT += amount;

        subRows.push({
          jobTypeLabel: jt.jobTypeLabel,
          category,
          amountHT: amount,
          marketAvgHT: jt.theoreticalAvgHT,
        });

        // Market accumulation per category
        if (jt.theoreticalAvgHT > 0) {
          const acc = marketAcc.get(category) || { total: 0, count: 0 };
          acc.total += jt.theoreticalAvgHT;
          acc.count += 1;
          marketAcc.set(category, acc);
        }
      }

      parsedRows.push({
        id: analysis.id,
        fileName: analysis.file_name,
        score: analysis.score,
        createdAt: analysis.created_at,
        categoryTotals: catTotals,
        subRows,
        totalHT,
      });
    }

    // Sort categories: biggest total first
    const catSums = new Map<string, number>();
    for (const cat of allCategories) {
      let sum = 0;
      for (const row of parsedRows) sum += row.categoryTotals.get(cat) ?? 0;
      catSums.set(cat, sum);
    }
    const cats = Array.from(allCategories).sort((a, b) => (catSums.get(b) ?? 0) - (catSums.get(a) ?? 0));

    // Column totals
    const colTotals = new Map<string, number>();
    for (const cat of cats) colTotals.set(cat, catSums.get(cat) ?? 0);

    // Column market averages
    const colMarket = new Map<string, number>();
    let gMarket = 0;
    for (const cat of cats) {
      const acc = marketAcc.get(cat);
      if (acc && acc.count > 0) {
        const avg = acc.total / acc.count;
        colMarket.set(cat, avg);
        gMarket += avg;
      }
    }

    const gTotal = parsedRows.reduce((sum, r) => sum + r.totalHT, 0);

    return {
      rows: parsedRows,
      categories: cats,
      categoryTotals: colTotals,
      categoryMarket: colMarket,
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
        ) : categories.length === 0 ? (
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
                <p className="text-xs text-muted-foreground mb-1">Corps de métier</p>
                <p className="text-2xl font-bold text-foreground">{categories.length}</p>
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
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground sticky left-0 bg-muted/50 z-10 min-w-[220px] border-r border-border">
                        Devis
                      </th>
                      {categories.map(cat => (
                        <th key={cat} className="text-right py-3 px-3 font-medium text-muted-foreground min-w-[120px] whitespace-nowrap">
                          {cat}
                        </th>
                      ))}
                      <th className="text-right py-3 px-4 font-bold text-foreground min-w-[110px] border-l border-border bg-muted/70">
                        Total HT
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const isOpen = expanded.has(row.id);
                      return (
                        <>
                          {/* Main devis row */}
                          <tr
                            key={row.id}
                            className={`border-t border-border/50 hover:bg-muted/20 cursor-pointer select-none ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                            onClick={() => toggleExpand(row.id)}
                          >
                            <td className="py-3 px-4 sticky left-0 bg-card z-10 border-r border-border">
                              <div className="flex items-center gap-2">
                                {isOpen
                                  ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                  : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                }
                                <div className="min-w-0">
                                  <span className="text-foreground font-medium text-xs block truncate max-w-[170px]" title={row.fileName}>
                                    {row.fileName}
                                  </span>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] text-muted-foreground">{fmtDate(row.createdAt)}</span>
                                    {row.score && (
                                      <span className={`text-[10px] font-bold ${scoreColor(row.score)}`}>
                                        {row.score}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            {categories.map(cat => {
                              const val = row.categoryTotals.get(cat);
                              return (
                                <td key={cat} className="text-right py-3 px-3 font-mono text-xs">
                                  {val != null && val > 0 ? (
                                    <span className="text-foreground font-medium">{fmt(val)}</span>
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

                          {/* Expanded sub-rows */}
                          {isOpen && row.subRows.map((sub, si) => (
                            <tr
                              key={`${row.id}-sub-${si}`}
                              className="border-t border-border/20 bg-accent/30"
                            >
                              <td className="py-2 px-4 pl-12 sticky left-0 bg-accent/30 z-10 border-r border-border">
                                <span className="text-xs text-muted-foreground">{sub.jobTypeLabel}</span>
                              </td>
                              {categories.map(cat => (
                                <td key={cat} className="text-right py-2 px-3 font-mono text-[11px]">
                                  {cat === sub.category && sub.amountHT > 0 ? (
                                    <div>
                                      <span className="text-foreground">{fmt(sub.amountHT)}</span>
                                      {sub.marketAvgHT > 0 && (
                                        <div className={`text-[9px] mt-0.5 ${
                                          sub.amountHT <= sub.marketAvgHT * 0.9
                                            ? "text-score-green"
                                            : sub.amountHT >= sub.marketAvgHT * 1.1
                                            ? "text-score-red"
                                            : "text-muted-foreground"
                                        }`}>
                                          moy. {fmt(sub.marketAvgHT)}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground/20">·</span>
                                  )}
                                </td>
                              ))}
                              <td className="text-right py-2 px-4 font-mono text-[11px] text-muted-foreground border-l border-border bg-accent/20">
                                {fmt(sub.amountHT)}
                              </td>
                            </tr>
                          ))}
                        </>
                      );
                    })}

                    {/* Total row */}
                    <tr className="border-t-2 border-border bg-primary/5 font-bold">
                      <td className="py-3 px-4 sticky left-0 bg-primary/5 z-10 border-r border-border text-foreground">
                        TOTAL
                      </td>
                      {categories.map(cat => (
                        <td key={cat} className="text-right py-3 px-3 font-mono text-xs text-foreground">
                          {fmt(categoryTotals.get(cat) ?? 0)}
                        </td>
                      ))}
                      <td className="text-right py-3 px-4 font-mono text-xs text-foreground border-l border-border bg-primary/10">
                        {fmt(grandTotal)}
                      </td>
                    </tr>

                    {/* Market average row */}
                    <tr className="border-t border-border bg-blue-50/50">
                      <td className="py-3 px-4 sticky left-0 bg-blue-50/50 z-10 border-r border-border">
                        <span className="text-xs font-medium text-blue-700">Prix marché moy.</span>
                      </td>
                      {categories.map(cat => {
                        const marketAvg = categoryMarket.get(cat);
                        const total = categoryTotals.get(cat) ?? 0;
                        if (!marketAvg || marketAvg <= 0) {
                          return (
                            <td key={cat} className="text-right py-3 px-3 text-xs text-muted-foreground/30">—</td>
                          );
                        }
                        const pct = ((total - marketAvg) / marketAvg) * 100;
                        return (
                          <td key={cat} className="text-right py-3 px-3">
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
              <div className="flex items-center gap-1.5 ml-auto">
                <span>Cliquez sur un devis pour voir le détail par poste</span>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default SuiviBudget;
