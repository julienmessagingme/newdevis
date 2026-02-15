import { useState, useCallback, useRef, useEffect } from "react";
import { Receipt, MapPin, Info, ChevronDown, ChevronUp, GripVertical, CheckCircle2, Pencil, RotateCcw, ListChecks, BarChart3 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useMarketPriceAPI, type MarketPriceTableRow, type JobTypeDisplayRow } from "@/hooks/useMarketPriceAPI";
import { useMarketPriceEditor } from "@/hooks/useMarketPriceEditor";
import MarketPositionAnalysis from "./MarketPositionAnalysis";
import PremiumGate from "@/components/funnel/PremiumGate";

// =======================
// TYPES
// =======================

interface BlockPrixMarcheProps {
  montantTotalHT?: number;
  codePostal?: string;
  selectedWorkType?: string;
  filePath?: string;
  cachedN8NData?: unknown;
  analysisId?: string;
  marketPriceOverrides?: Record<string, unknown> | null;
  defaultOpen?: boolean;
  resume?: string | null;
  showGate?: boolean;
  onAuthSuccess?: () => void;
  convertToPermanent?: (params: { email: string; password: string; firstName: string; lastName: string; phone: string; acceptCommercial?: boolean }) => Promise<unknown>;
}

// =======================
// HELPERS
// =======================

const fmt = (n: number | null | undefined) => {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
};

const verdictColor = (verdict: string | null): string => {
  if (!verdict) return "text-muted-foreground";
  if (verdict === "Bien placé" || verdict === "Inférieur à la moyenne") return "text-green-600";
  if (verdict === "Dans la norme") return "text-blue-600";
  if (verdict === "Légèrement élevé") return "text-amber-600";
  return "text-red-600";
};

const verdictBg = (verdict: string | null): string => {
  if (!verdict) return "";
  if (verdict === "Bien placé" || verdict === "Inférieur à la moyenne") return "bg-green-500/10";
  if (verdict === "Dans la norme") return "bg-blue-500/10";
  if (verdict === "Légèrement élevé") return "bg-amber-500/10";
  return "bg-red-500/10";
};

// =======================
// PHASE 1 : ASSIGNMENT CARD (DnD + editable qty, no price analysis)
// =======================

interface AssignmentCardProps {
  row: JobTypeDisplayRow;
  onDrop: (lineIndex: number, fromJobType: string) => void;
  onQuantityChange: (qty: number) => void;
}

const AssignmentCard = ({ row, onDrop, onQuantityChange }: AssignmentCardProps) => {
  const [dragOver, setDragOver] = useState(false);
  const [editingQty, setEditingQty] = useState(false);
  const [qtyInput, setQtyInput] = useState(String(row.mainQuantity));

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    try {
      const payload = JSON.parse(e.dataTransfer.getData("application/json"));
      if (payload.fromJobType !== row.jobTypeLabel) {
        onDrop(payload.lineIndex, payload.fromJobType);
      }
    } catch {
      // Invalid drag data
    }
  }, [onDrop, row.jobTypeLabel]);

  const handleQtyBlur = useCallback(() => {
    setEditingQty(false);
    const val = parseFloat(qtyInput);
    if (!isNaN(val) && val > 0) {
      onQuantityChange(val);
    } else {
      setQtyInput(String(row.mainQuantity));
    }
  }, [qtyInput, onQuantityChange, row.mainQuantity]);

  const handleQtyKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
    if (e.key === "Escape") {
      setQtyInput(String(row.mainQuantity));
      setEditingQty(false);
    }
  }, [row.mainQuantity]);

  return (
    <div
      className={`border rounded-xl bg-card overflow-hidden transition-all ${
        dragOver ? "border-primary border-2 ring-2 ring-primary/20 scale-[1.01]" : "border-border/60"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="p-3 bg-muted/30 border-b border-border/40 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-semibold text-foreground text-sm truncate">{row.jobTypeLabel}</h3>
          {row.prices.length === 0 && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-amber-600 bg-amber-500/10 whitespace-nowrap">
              {row.jobTypeLabel === "Autre" ? "Non catégorisé" : "Hors catalogue"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
          {editingQty ? (
            <span className="flex items-center gap-1">
              <input
                type="number"
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                onBlur={handleQtyBlur}
                onKeyDown={handleQtyKeyDown}
                className="w-16 px-1.5 py-0.5 text-xs border border-primary rounded bg-background text-foreground"
                autoFocus
                min={0.01}
                step="any"
              />
              <span>{row.mainUnit}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => { setQtyInput(String(row.mainQuantity)); setEditingQty(true); }}
              className="flex items-center gap-1 hover:text-primary transition-colors"
            >
              {row.mainQuantity} {row.mainUnit}
              <Pencil className="h-3 w-3 opacity-50" />
            </button>
          )}
          <span className="font-medium text-foreground">{fmt(row.devisTotalHT)}</span>
        </div>
      </div>

      {/* Devis lines (always visible, draggable) */}
      <div className="px-2 py-1 space-y-0.5">
        {row.devisLines.map((line) => (
          <div
            key={line.index}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/json", JSON.stringify({
                lineIndex: line.index,
                fromJobType: row.jobTypeLabel,
              }));
              e.dataTransfer.effectAllowed = "move";
            }}
            className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-background border border-border/20 cursor-grab active:cursor-grabbing hover:border-primary/40 transition-all group"
          >
            <GripVertical className="h-3 w-3 text-muted-foreground/30 flex-shrink-0 group-hover:text-muted-foreground/60" />
            <span className="flex-1 min-w-0 text-xs text-foreground truncate">{line.description}</span>
            <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap pl-1">
              {fmt(line.amountHT)}
            </span>
          </div>
        ))}
        {row.devisLines.length === 0 && (
          <p className="text-[11px] text-muted-foreground italic py-2 text-center">
            Glissez des lignes ici
          </p>
        )}
      </div>
    </div>
  );
};

// =======================
// PHASE 2 : ANALYSIS CARD (verdict + gauge, read-only)
// =======================

const AnalysisCard = ({ row }: { row: JobTypeDisplayRow }) => {
  const [expanded, setExpanded] = useState(false);
  const hasPrices = row.prices.length > 0;

  return (
    <div className="border border-border/60 rounded-xl bg-card overflow-hidden">
      {/* Header with verdict */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-sm truncate">{row.jobTypeLabel}</h3>
            {row.verdict ? (
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${verdictColor(row.verdict)} ${verdictBg(row.verdict)}`}>
                {row.verdict}
              </span>
            ) : !hasPrices ? (
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap text-muted-foreground bg-muted/50">
                Pas de référence marché
              </span>
            ) : null}
          </div>
          {expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          }
        </div>

        {/* Price summary */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs">
          {hasPrices && <span className="text-muted-foreground">{row.mainQuantity} {row.mainUnit}</span>}
          <span className="text-foreground font-medium">{"Devis : "}{fmt(row.devisTotalHT)}</span>
          {hasPrices && (
            <span className="text-muted-foreground">{"Marché : "}{fmt(row.theoreticalMinHT)}{" – "}{fmt(row.theoreticalMaxHT)}</span>
          )}
        </div>
      </button>

      {/* Expanded: lines + gauge */}
      {expanded && (
        <div className="border-t border-border/50 p-4 space-y-4">
          {row.devisLines.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Lignes du devis</p>
              {row.devisLines.map((line) => (
                <div key={line.index} className="flex items-center gap-2 p-1.5 text-sm">
                  <span className="flex-1 text-foreground truncate">{line.description}</span>
                  <span className="font-medium text-foreground whitespace-nowrap">{fmt(line.amountHT)}</span>
                </div>
              ))}
            </div>
          )}
          {hasPrices ? (
            <MarketPositionAnalysis
              quote_total_ht={row.devisTotalHT}
              market_min_ht={row.theoreticalMinHT}
              market_avg_ht={row.theoreticalAvgHT}
              market_max_ht={row.theoreticalMaxHT}
            />
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Aucune donnée de référence marché pour ce type de travaux.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// =======================
// LEGACY TABLE COMPONENT
// =======================

const MarketPriceTable = ({ rows }: { rows: MarketPriceTableRow[] }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border/50">
          <th className="text-left py-3 px-2 font-semibold text-foreground">Poste</th>
          <th className="text-right py-3 px-2 font-semibold text-foreground">Devis HT</th>
          <th className="text-right py-3 px-2 font-semibold text-foreground">Min marché</th>
          <th className="text-right py-3 px-2 font-semibold text-foreground">Moy. marché</th>
          <th className="text-right py-3 px-2 font-semibold text-foreground">Max marché</th>
          <th className="text-center py-3 px-2 font-semibold text-foreground">Verdict</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={idx} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
            <td className="py-3 px-2">
              <div className="font-medium text-foreground">{row.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {row.description.length > 80 ? row.description.slice(0, 80) + "..." : row.description}
              </div>
              {row.quantity && row.quantity > 0 && (
                <div className="text-xs text-muted-foreground">
                  {row.quantity} {row.unitDevis || row.unit || "unité(s)"}
                  {row.notes && <span className="ml-1 italic">({row.notes})</span>}
                </div>
              )}
            </td>
            <td className="text-right py-3 px-2 font-medium text-foreground whitespace-nowrap">{fmt(row.amountHT)}</td>
            <td className="text-right py-3 px-2 text-muted-foreground whitespace-nowrap">{fmt(row.totalMinHT)}</td>
            <td className="text-right py-3 px-2 text-muted-foreground whitespace-nowrap">{fmt(row.totalAvgHT)}</td>
            <td className="text-right py-3 px-2 text-muted-foreground whitespace-nowrap">{fmt(row.totalMaxHT)}</td>
            <td className="text-center py-3 px-2">
              {row.verdict ? (
                <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${verdictColor(row.verdict)} ${verdictBg(row.verdict)}`}>
                  {row.verdict}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="text-xs text-muted-foreground mt-3 italic">
      Ces fourchettes sont basées sur des données de marché externes et ne constituent pas une évaluation de la qualité du prestataire.
    </p>
  </div>
);

// =======================
// STEPPER — visual indicator of the 2-step process
// =======================

const StepIndicator = ({ currentStep }: { currentStep: 1 | 2 }) => (
  <div className="flex items-center gap-0 mb-4">
    {/* Step 1 */}
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <div className={`flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 transition-colors ${
        currentStep === 1
          ? "bg-primary text-primary-foreground"
          : "bg-green-500 text-white"
      }`}>
        {currentStep > 1
          ? <CheckCircle2 className="h-4 w-4" />
          : <ListChecks className="h-3.5 w-3.5" />
        }
      </div>
      <div className="min-w-0">
        <p className={`text-xs font-semibold leading-tight ${currentStep === 1 ? "text-foreground" : "text-green-600"}`}>
          Affectation des postes
        </p>
        <p className="text-[10px] text-muted-foreground leading-tight truncate">
          {currentStep === 1 ? "Vérifiez le classement des lignes" : "Terminé"}
        </p>
      </div>
    </div>

    {/* Connector */}
    <div className={`w-8 h-0.5 flex-shrink-0 mx-1 transition-colors ${
      currentStep > 1 ? "bg-green-500" : "bg-border"
    }`} />

    {/* Step 2 */}
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <div className={`flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 transition-colors ${
        currentStep === 2
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground"
      }`}>
        <BarChart3 className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className={`text-xs font-semibold leading-tight ${currentStep === 2 ? "text-foreground" : "text-muted-foreground"}`}>
          Analyse des prix
        </p>
        <p className="text-[10px] text-muted-foreground leading-tight truncate">
          {currentStep === 2 ? "Comparaison au marché" : "Après validation"}
        </p>
      </div>
    </div>
  </div>
);

// =======================
// PHASE 1 WRAPPER — scrollable container with auto-scroll on drag
// =======================

interface AssignmentPhaseProps {
  rows: JobTypeDisplayRow[];
  moveLineToJobType: (lineIndex: number, from: string, to: string) => void;
  updateQuantity: (jobTypeLabel: string, qty: number) => void;
  isDirty: boolean;
  saving: boolean;
  validate: () => Promise<void>;
  reset: () => void;
}

const AssignmentPhase = ({ rows, moveLineToJobType, updateQuantity, isDirty, saving, validate, reset }: AssignmentPhaseProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef<number | null>(null);

  // Auto-scroll when dragging near edges of the scroll container
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const EDGE_SIZE = 60; // px from edge to trigger scroll
    const SCROLL_SPEED = 8; // px per frame

    const handleDragOver = (e: DragEvent) => {
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;

      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = null;
      }

      if (y < EDGE_SIZE && container.scrollTop > 0) {
        // Near top → scroll up
        const tick = () => {
          container.scrollTop -= SCROLL_SPEED;
          if (container.scrollTop > 0) {
            autoScrollRef.current = requestAnimationFrame(tick);
          }
        };
        autoScrollRef.current = requestAnimationFrame(tick);
      } else if (y > rect.height - EDGE_SIZE && container.scrollTop < container.scrollHeight - container.clientHeight) {
        // Near bottom → scroll down
        const tick = () => {
          container.scrollTop += SCROLL_SPEED;
          if (container.scrollTop < container.scrollHeight - container.clientHeight) {
            autoScrollRef.current = requestAnimationFrame(tick);
          }
        };
        autoScrollRef.current = requestAnimationFrame(tick);
      }
    };

    const handleDragEnd = () => {
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = null;
      }
    };

    container.addEventListener("dragover", handleDragOver);
    container.addEventListener("dragend", handleDragEnd);
    container.addEventListener("drop", handleDragEnd);

    return () => {
      container.removeEventListener("dragover", handleDragOver);
      container.removeEventListener("dragend", handleDragEnd);
      container.removeEventListener("drop", handleDragEnd);
      if (autoScrollRef.current) cancelAnimationFrame(autoScrollRef.current);
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="p-2.5 bg-blue-500/5 border border-blue-500/20 rounded-lg">
        <p className="text-xs text-foreground">
          <strong>Vérifiez l'affectation des postes</strong>{" — "}
          <span className="text-muted-foreground font-normal">Glissez-déposez les lignes entre catégories si besoin, puis validez.</span>
        </p>
      </div>

      <div
        ref={scrollRef}
        className="space-y-2 max-h-[65vh] overflow-y-auto pr-1 scroll-smooth"
      >
        {rows.map((row, idx) => (
          <AssignmentCard
            key={`${row.jobTypeLabel}-${idx}`}
            row={row}
            onDrop={(lineIndex, fromJobType) => moveLineToJobType(lineIndex, fromJobType, row.jobTypeLabel)}
            onQuantityChange={(qty) => updateQuantity(row.jobTypeLabel, qty)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        {isDirty && (
          <Button variant="ghost" size="sm" onClick={reset} className="text-xs text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Réinitialiser
          </Button>
        )}
        <Button
          onClick={validate}
          disabled={saving}
          className="ml-auto"
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          {saving ? "Validation..." : "Valider et voir l'analyse prix"}
        </Button>
      </div>
    </div>
  );
};

// =======================
// MAIN COMPONENT
// =======================

const BlockPrixMarche = ({
  codePostal,
  cachedN8NData,
  analysisId,
  marketPriceOverrides,
  defaultOpen = true,
  resume,
  showGate = false,
  onAuthSuccess,
  convertToPermanent,
}: BlockPrixMarcheProps) => {
  const [isBlockOpen, setIsBlockOpen] = useState(defaultOpen);
  const { error, rows, isNewFormat } = useMarketPriceAPI({ cachedN8NData });

  const editor = useMarketPriceEditor({
    analysisId,
    initialData: cachedN8NData,
    savedOverrides: marketPriceOverrides as { quantity_overrides: Record<string, number>; line_reassignments: Record<string, string>; validated_at: string } | null,
  });

  const renderContent = () => {
    if (error) {
      return (
        <div className="p-5 bg-muted/30 rounded-xl border border-border mb-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-muted rounded-lg"><Info className="h-5 w-5 text-muted-foreground" /></div>
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Comparaison marché non disponible</strong><br />{error}
            </p>
          </div>
        </div>
      );
    }

    // ==========================================
    // NEW FORMAT — 2-phase flow
    // ==========================================
    if (isNewFormat && editor.rows.length > 0) {

      // ---- PHASE 1 : Assignment (not validated yet) ----
      if (!editor.isValidated) {
        return (
          <>
            <StepIndicator currentStep={1} />
            <AssignmentPhase
              rows={editor.rows}
              moveLineToJobType={editor.moveLineToJobType}
              updateQuantity={editor.updateQuantity}
              isDirty={editor.isDirty}
              saving={editor.saving}
              validate={editor.validate}
              reset={editor.reset}
            />
          </>
        );
      }

      // ---- PHASE 2 : Price analysis (validated) ----
      // Filter out empty groups and "Autre" (no price reference ever)
      const analysisRows = editor.rows.filter(
        (row) => row.devisLines.length > 0 && row.jobTypeLabel !== "Autre"
      );

      return (
        <div className="space-y-3">
          <StepIndicator currentStep={2} />
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={editor.editAssignment}
              className="text-xs text-primary hover:underline font-medium"
            >
              Modifier l'affectation
            </button>
          </div>

          {analysisRows.length > 0 ? (
            analysisRows.map((row, idx) => (
              <AnalysisCard key={`${row.jobTypeLabel}-${idx}`} row={row} />
            ))
          ) : (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              Aucun poste avec référence de prix marché.
            </p>
          )}

          <p className="text-xs text-muted-foreground mt-3 italic">
            Ces fourchettes sont basées sur des données de marché externes et ne constituent pas une évaluation de la qualité du prestataire.
          </p>
        </div>
      );
    }

    // ==========================================
    // LEGACY FORMAT — flat table
    // ==========================================
    if (rows.length > 0) {
      return <MarketPriceTable rows={rows} />;
    }

    return (
      <div className="p-5 bg-muted/30 rounded-xl border border-border mb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-muted rounded-lg"><Info className="h-5 w-5 text-muted-foreground" /></div>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Comparaison marché non disponible</strong><br />
            Aucune donnée de prix marché pour les postes de ce devis.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="border-2 rounded-2xl p-6 mb-6 bg-primary/5 border-primary/20 overflow-hidden">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
          <Receipt className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setIsBlockOpen(!isBlockOpen)}
            className="w-full flex items-center gap-3 text-left cursor-pointer"
          >
            <h2 className="font-bold text-foreground text-xl">Analyse Prix & Cohérence Marché</h2>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    Ces fourchettes sont basées sur des données de marché externes.
                    Elles ne constituent pas une évaluation de la qualité du prestataire.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <ChevronDown className={`h-5 w-5 ml-auto text-muted-foreground transition-transform flex-shrink-0 ${isBlockOpen ? "rotate-180" : ""}`} />
          </button>

          {isBlockOpen && !showGate && (<>
          {/* Résumé du devis */}
          {resume && (
            <div className="mt-3 mb-4 p-4 bg-background/50 rounded-lg border border-border/30">
              <p className="text-sm text-muted-foreground">{resume}</p>
            </div>
          )}

          {codePostal && (
            <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>Zone de référence : {codePostal}</span>
            </div>
          )}

          {renderContent()}
          </>)}

          {/* Gate de conversion — visible uniquement quand le bloc est collapsé */}
          {!isBlockOpen && showGate && onAuthSuccess && convertToPermanent && (
            <div className="mt-4">
              <PremiumGate
                onAuthSuccess={onAuthSuccess}
                convertToPermanent={convertToPermanent}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlockPrixMarche;
