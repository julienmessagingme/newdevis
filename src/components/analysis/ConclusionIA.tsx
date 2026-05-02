import { useState, useEffect, useRef } from "react";
import { Loader2, Sparkles, RefreshCw, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConclusionIA } from "@/hooks/useConclusionIA";
import type { ConclusionData, AnomalieConclusion } from "@/lib/conclusionTypes";

// ============================================================
// HELPERS
// ============================================================

const fmtPrice = (n: number): string =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";

const fmtUnitPrice = (n: number, unit: string): string =>
  `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/${unit}`;

/** Calcule le chiffre central de la fourchette (arrondi à la centaine) */
function midpoint(min: number, max: number): number {
  const raw = (min + max) / 2;
  return Math.round(raw / 100) * 100;
}

// ============================================================
// CONFIG VERDICT DÉCISIONNEL
// Labels porteurs de décision (pas juste descriptifs)
// ============================================================

const DECISION_CONFIG = {
  signer: {
    bg:       "bg-green-600  dark:bg-green-700",
    border:   "border-green-700 dark:border-green-600",
    text:     "text-white",
    icon:     "✅",
    label:    "Vous pouvez signer",
    sublabel: "Les prix sont cohérents avec le marché",
  },
  signer_avec_negociation: {
    bg:       "bg-orange-500  dark:bg-orange-600",
    border:   "border-orange-600 dark:border-orange-500",
    text:     "text-white",
    icon:     "🟠",
    label:    "À négocier — prix au-dessus du marché",
    sublabel: "Négociez ces points avant de signer",
  },
  ne_pas_signer: {
    bg:       "bg-red-600  dark:bg-red-700",
    border:   "border-red-700 dark:border-red-600",
    text:     "text-white",
    icon:     "🔴",
    label:    "Ne signez pas — anomalies majeures détectées",
    sublabel: "Des clarifications sont indispensables",
  },
} as const;

// ============================================================
// LOADER — étapes de chargement simulées
// ============================================================

const LOAD_STEPS = [
  "Lecture du devis",
  "Comparaison prix marché",
  "Détection des anomalies",
] as const;

function ConclusionLoader({ isGenerating, error, onRetry }: {
  isGenerating: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  // Étape active simulée : bascule toutes les 1,4s
  const [step, setStep] = useState(0);
  if (isGenerating && step < LOAD_STEPS.length - 1) {
    setTimeout(() => setStep(s => Math.min(s + 1, LOAD_STEPS.length - 1)), 1400);
  }

  return (
    <div className="border-2 border-primary/20 rounded-2xl p-5 sm:p-6 mb-6 bg-primary/3">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          {isGenerating
            ? <Loader2 className="h-5 w-5 text-primary animate-spin" />
            : <Sparkles className="h-5 w-5 text-primary" />
          }
        </div>
        <p className="font-semibold text-foreground text-sm">
          {isGenerating ? "Analyse en cours…" : "Préparation du verdict…"}
        </p>
      </div>

      {isGenerating && (
        <div className="space-y-2.5 pl-1">
          {LOAD_STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2.5">
              {i < step ? (
                <span className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[10px] text-primary font-bold flex-shrink-0">✓</span>
              ) : i === step ? (
                <span className="w-4 h-4 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                </span>
              ) : (
                <span className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
              )}
              <span className={`text-xs ${i <= step ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center gap-2">
          <p className="text-xs text-red-600 dark:text-red-400 flex-1">{error}</p>
          <Button onClick={onRetry} size="sm" variant="outline" className="h-7 text-xs px-2 flex-shrink-0">
            Réessayer
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ANOMALIE CARD
// ============================================================

function AnomalieCard({ item }: { item: AnomalieConclusion }) {
  const hasRange   = item.fourchette_min !== null && item.fourchette_max !== null;
  const hasSurcout = item.surcout_estime !== null && item.surcout_estime > 0;

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3">
      <div className="flex items-start gap-2">
        <span className="flex-shrink-0 text-base leading-none mt-0.5" aria-hidden="true">🔴</span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-red-900 dark:text-red-200 leading-snug">
            {item.poste}
            {item.ligne_devis && item.ligne_devis !== item.poste && (
              <span className="font-normal text-red-700/80 dark:text-red-400/80">
                {" "}—{" "}<em>{item.ligne_devis}</em>
              </span>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-red-800 dark:text-red-300">
            {item.prix_unitaire_devis > 0 && (
              <span className="font-bold">
                {fmtUnitPrice(item.prix_unitaire_devis, item.unite)}
              </span>
            )}
            {hasRange && (
              <>
                <span className="text-red-400" aria-hidden="true">→</span>
                <span>
                  attendu{" "}
                  <span className="font-medium">
                    {item.fourchette_min!.toLocaleString("fr-FR")}–{item.fourchette_max!.toLocaleString("fr-FR")}&nbsp;€/{item.unite}
                  </span>
                </span>
              </>
            )}
            {hasSurcout && (
              <>
                <span className="text-red-400" aria-hidden="true">→</span>
                <span className="font-semibold">surcoût ~+{fmtPrice(item.surcout_estime!)}</span>
              </>
            )}
          </div>

          {item.explication && (
            <p className="text-xs text-red-700/80 dark:text-red-400/80 leading-snug">
              {item.explication}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CONCLUSION DISPLAY
// ============================================================

function ConclusionDisplay({
  conclusion,
  onRegenerate,
  isGenerating,
}: {
  conclusion: ConclusionData;
  onRegenerate: () => void;
  isGenerating: boolean;
}) {
  const [copied,       setCopied]       = useState(false);
  const [showAllAnom,  setShowAllAnom]  = useState(false);
  const [showAllActs,  setShowAllActs]  = useState(false);

  const decisionCfg  = DECISION_CONFIG[conclusion.verdict_decisionnel] ?? DECISION_CONFIG.signer_avec_negociation;
  const hasSurcout   = conclusion.surcout_global.max > 0;
  const mid          = hasSurcout ? midpoint(conclusion.surcout_global.min, conclusion.surcout_global.max) : 0;
  const anomalies    = conclusion.anomalies ?? [];
  const anomCount    = anomalies.length;
  const visibleAnom  = showAllAnom ? anomalies : anomalies.slice(0, 3);
  const actions      = conclusion.actions_avant_signature ?? [];
  const visibleActs  = showAllActs ? actions : actions.slice(0, 3);

  const handleCopy = () => {
    const lines: string[] = [
      `Analyse de devis — ${new Date(conclusion.generated_at).toLocaleDateString("fr-FR")}`,
      "",
      `Verdict : ${decisionCfg.label}`,
    ];
    if (hasSurcout) {
      lines.push(`Surcoût estimé : environ ${fmtPrice(mid)} (entre ${fmtPrice(conclusion.surcout_global.min)} et ${fmtPrice(conclusion.surcout_global.max)})`);
    }
    if (actions.length > 0) {
      lines.push("", "Points à discuter avant de signer :");
      actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      onCopy?.();
    });
  };

  return (
    <div className="space-y-4">

      {/* ═══════════════════════════════════════════════════════════
          SECTION 1 — SURCOÛT (chiffre principal, le plus visible)
      ════════════════════════════════════════════════════════════ */}
      {hasSurcout && (
        <div className="text-center py-2">
          <p className="text-5xl sm:text-6xl font-extrabold text-foreground tracking-tight leading-none">
            +{fmtPrice(mid)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">environ payé en trop</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            (entre {fmtPrice(conclusion.surcout_global.min)} et {fmtPrice(conclusion.surcout_global.max)})
          </p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SECTION 2 — VERDICT DÉCISIONNEL + ligne justificatrice
      ════════════════════════════════════════════════════════════ */}
      <div className={`rounded-xl border px-5 py-4 ${decisionCfg.bg} ${decisionCfg.border}`}>
        <div className="flex items-start gap-3">
          <span className="text-3xl leading-none flex-shrink-0 mt-0.5" aria-hidden="true">
            {decisionCfg.icon}
          </span>
          <div className="min-w-0">
            <p className={`text-lg sm:text-xl font-extrabold leading-tight ${decisionCfg.text}`}>
              {decisionCfg.label}
            </p>
            {/* Ligne justificatrice : nombre d'anomalies ou sous-label */}
            {anomCount > 0 ? (
              <p className={`text-sm mt-1 font-medium opacity-90 ${decisionCfg.text}`}>
                → {anomCount} poste{anomCount > 1 ? "s" : ""} dépass{anomCount > 1 ? "ent" : "e"} largement les prix du marché
              </p>
            ) : (
              <p className={`text-sm mt-0.5 opacity-85 ${decisionCfg.text}`}>
                {decisionCfg.sublabel}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Crédibilité */}
      <p className="text-center text-[11px] text-muted-foreground/70">
        Analyse basée sur des milliers de prix travaux en France
      </p>

      {/* ═══════════════════════════════════════════════════════════
          SECTION "POURQUOI CE VERDICT ?" — summary + raisons + contexte
      ════════════════════════════════════════════════════════════ */}
      {(conclusion as any).verdict_reasons && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-2.5">

          {/* En-tête */}
          <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wide flex items-center gap-1.5">
            <span aria-hidden="true">🔍</span>
            <span>Pourquoi ce verdict ?</span>
          </p>

          {/* Résumé 1 ligne */}
          <p className="text-sm font-medium text-foreground leading-snug">
            👉 {(conclusion as any).verdict_reasons.summary}
          </p>

          {/* Raisons — problèmes uniquement */}
          {(conclusion as any).verdict_reasons.reasons?.length > 0 && (
            <ul className="space-y-1.5">
              {((conclusion as any).verdict_reasons.reasons as string[]).map((r: string, i: number) => (
                <li key={i} className="text-sm text-foreground leading-snug flex items-start gap-2">
                  <span className="mt-[2px] shrink-0 text-muted-foreground" aria-hidden="true">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Contexte — badges secondaires séparés */}
          {(conclusion as any).verdict_reasons.context?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {((conclusion as any).verdict_reasons.context as string[]).map((c: string, i: number) => (
                <span
                  key={i}
                  className="inline-flex items-center text-xs text-muted-foreground bg-background border border-border rounded-full px-2.5 py-1 leading-none"
                >
                  {c}
                </span>
              ))}
            </div>
          )}

        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          CTA — visible sans scroll, juste après le verdict
      ════════════════════════════════════════════════════════════ */}
      {actions.length > 0 && (
        <button
          type="button"
          onClick={handleCopy}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-primary bg-primary hover:bg-primary/90 transition-colors text-sm font-semibold text-primary-foreground shadow-sm"
        >
          {copied
            ? <><Check className="h-4 w-4" />Copié !</>
            : <><Copy className="h-4 w-4" />📋 Copier le message pour négocier</>
          }
        </button>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SECTION 3 — ACTIONS AVANT SIGNATURE
      ════════════════════════════════════════════════════════════ */}
      {actions.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-4">
          <p className="text-sm font-bold text-foreground mb-3">
            Voici exactement quoi dire à votre artisan :
          </p>
          <ol className="space-y-2.5">
            {visibleActs.map((action, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm text-foreground leading-snug">{action}</span>
              </li>
            ))}
          </ol>
          {actions.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllActs(v => !v)}
              className="mt-3 flex items-center gap-1 text-xs text-primary hover:underline font-medium"
            >
              {showAllActs
                ? <><ChevronUp className="h-3 w-3" />Réduire</>
                : <><ChevronDown className="h-3 w-3" />+{actions.length - 3} autres points</>
              }
            </button>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SECTION 4 — ANOMALIES DÉTECTÉES (max 3 visible, expand)
      ════════════════════════════════════════════════════════════ */}
      {conclusion.has_anomalies && anomalies.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Anomalies détectées
          </p>
          {visibleAnom.map((item, i) => (
            <AnomalieCard key={`${item.poste}-${i}`} item={item} />
          ))}
          {anomCount > 3 && (
            <button
              type="button"
              onClick={() => setShowAllAnom(v => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline font-medium mt-1"
            >
              {showAllAnom
                ? <><ChevronUp className="h-3 w-3" />Réduire</>
                : <><ChevronDown className="h-3 w-3" />Voir les {anomCount - 3} autres anomalies</>
              }
            </button>
          )}
        </div>
      )}

      {/* Justifications */}
      {conclusion.justifications && (
        <p className="text-sm text-muted-foreground leading-relaxed border-l-2 border-border pl-3">
          {conclusion.justifications}
        </p>
      )}

      {/* Note contextuelle seuils adaptatifs — affiché seulement si marché large ou chantier complexe */}
      {(conclusion as any).market_context_note && (
        <p className="text-xs text-muted-foreground/70 flex items-center gap-1.5 bg-muted/40 rounded px-2.5 py-1.5">
          <span className="text-base leading-none">ℹ️</span>
          <span>{(conclusion as any).market_context_note}</span>
        </p>
      )}

      {/* ── Footer ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[11px] text-muted-foreground">
          Analysé le{" "}
          {new Date(conclusion.generated_at).toLocaleDateString("fr-FR", {
            day: "numeric", month: "long", year: "numeric",
          })}
        </p>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={isGenerating}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${isGenerating ? "animate-spin" : ""}`} />
          Régénérer
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

interface ConclusionIAProps {
  analysisId:          string;
  conclusionIaRaw?:    string | null;
  /** Called once conclusion is available — passes raw JSON so parent can update effectiveScore */
  onVerdictReady?:     (rawJson: string) => void;
  /** Called when user clicks "Copier le message" — used to trigger FeedbackModal */
  onCopy?:             () => void;
}

export function ConclusionIA({ analysisId, conclusionIaRaw, onVerdictReady, onCopy }: ConclusionIAProps) {
  const { conclusion, isGenerating, error, generate, regenerate } = useConclusionIA({
    analysisId,
    initialRaw: conclusionIaRaw,
  });

  // Notify parent once conclusion is available (generated or from cache)
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (conclusion && onVerdictReady && !notifiedRef.current) {
      notifiedRef.current = true;
      onVerdictReady(JSON.stringify(conclusion));
    }
  }, [conclusion, onVerdictReady]);

  // ── Génération en cours ou en attente ────────────────────────────────────
  if (!conclusion) {
    return (
      <ConclusionLoader
        isGenerating={isGenerating}
        error={error}
        onRetry={() => generate()}
      />
    );
  }

  // ── Conclusion disponible ─────────────────────────────────────────────────
  return (
    <div className="border-2 rounded-2xl p-4 sm:p-6 mb-6 bg-card border-border/60">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 bg-primary/10 rounded-lg">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <h3 className="font-bold text-foreground text-base">
          Verdict expert — Dois-je signer ?
        </h3>
      </div>

      <ConclusionDisplay
        conclusion={conclusion}
        onRegenerate={regenerate}
        isGenerating={isGenerating}
      />

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-3">{error}</p>
      )}
    </div>
  );
}

export default ConclusionIA;
