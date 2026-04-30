import { useState } from "react";
import { Loader2, Sparkles, RefreshCw, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConclusionIA } from "@/hooks/useConclusionIA";
import type { ConclusionData, AnomalieConclusion } from "@/lib/conclusionTypes";

// ============================================================
// HELPERS
// ============================================================

const fmtPrice = (n: number): string =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + "\u00a0€";

const fmtUnitPrice = (n: number, unit: string): string =>
  `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00a0€/${unit}`;

// ============================================================
// CONFIG VERDICT DÉCISIONNEL — élément le plus visible
// ============================================================

const DECISION_CONFIG = {
  signer: {
    bg:        "bg-green-600  dark:bg-green-700",
    border:    "border-green-700 dark:border-green-600",
    text:      "text-white",
    icon:      "✅",
    label:     "Vous pouvez signer ce devis",
    sublabel:  "Le devis est cohérent avec le marché",
  },
  signer_avec_negociation: {
    bg:        "bg-orange-500  dark:bg-orange-600",
    border:    "border-orange-600 dark:border-orange-500",
    text:      "text-white",
    icon:      "🟠",
    label:     "Négociez avant de signer",
    sublabel:  "Quelques points méritent clarification",
  },
  ne_pas_signer: {
    bg:        "bg-red-600  dark:bg-red-700",
    border:    "border-red-700 dark:border-red-600",
    text:      "text-white",
    icon:      "🛑",
    label:     "Ne signez pas sans clarifications",
    sublabel:  "Des anomalies importantes ont été détectées",
  },
} as const;

// ============================================================
// CONFIG NIVEAU DE RISQUE — chip compact
// ============================================================

const RISQUE_CONFIG = {
  "faible": {
    cls: "bg-green-100  text-green-800  border-green-200  dark:bg-green-900/30  dark:text-green-300  dark:border-green-800",
    dot: "bg-green-500",
  },
  "modéré": {
    cls: "bg-amber-100  text-amber-800  border-amber-200  dark:bg-amber-900/30  dark:text-amber-300  dark:border-amber-800",
    dot: "bg-amber-500",
  },
  "élevé": {
    cls: "bg-red-100    text-red-800    border-red-200    dark:bg-red-900/30    dark:text-red-300    dark:border-red-800",
    dot: "bg-red-500",
  },
} as const;

// ============================================================
// VERDICT GLOBAL (analyse narrative) — config couleur chip
// ============================================================

const VERDICT_CHIP: Record<string, string> = {
  dans_la_norme:  "bg-green-100  text-green-800  border-green-200  dark:bg-green-900/30  dark:text-green-300  dark:border-green-800",
  eleve_justifie: "bg-amber-100  text-amber-800  border-amber-200  dark:bg-amber-900/30  dark:text-amber-300  dark:border-amber-800",
  a_negocier:     "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
  a_risque:       "bg-red-100    text-red-800    border-red-200    dark:bg-red-900/30    dark:text-red-300    dark:border-red-800",
};
const VERDICT_LABEL: Record<string, string> = {
  dans_la_norme:  "Dans la norme",
  eleve_justifie: "Élevé mais justifié",
  a_negocier:     "À négocier",
  a_risque:       "À risque",
};

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
// CONCLUSION DISPLAY — version complète avec 4 sections
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
  const [copied, setCopied] = useState(false);

  const decisionCfg = DECISION_CONFIG[conclusion.verdict_decisionnel] ?? DECISION_CONFIG.signer_avec_negociation;
  const risqueCfg   = RISQUE_CONFIG[conclusion.niveau_risque]         ?? RISQUE_CONFIG["modéré"];
  const chipCls     = VERDICT_CHIP[conclusion.verdict_global]         ?? VERDICT_CHIP.a_negocier;
  const chipLabel   = VERDICT_LABEL[conclusion.verdict_global]        ?? "À négocier";
  const hasSurcout  = conclusion.surcout_global.max > 0;

  const handleCopy = () => {
    const lines: string[] = [
      `Analyse de devis — ${new Date(conclusion.generated_at).toLocaleDateString("fr-FR")}`,
      "",
      `Verdict : ${decisionCfg.label}`,
    ];
    if (hasSurcout) {
      lines.push(`Surcoût estimé : ${fmtPrice(conclusion.surcout_global.min)} – ${fmtPrice(conclusion.surcout_global.max)}`);
    }
    if (conclusion.actions_avant_signature.length > 0) {
      lines.push("", "Points à discuter avant de signer :");
      conclusion.actions_avant_signature.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="space-y-4">

      {/* ═══════════════════════════════════════════════════════════
          SECTION 1 — VERDICT DÉCISIONNEL (la plus visible)
      ════════════════════════════════════════════════════════════ */}
      <div className={`rounded-xl border px-5 py-4 ${decisionCfg.bg} ${decisionCfg.border}`}>
        <div className="flex items-center gap-3">
          <span className="text-3xl leading-none flex-shrink-0" aria-hidden="true">
            {decisionCfg.icon}
          </span>
          <div className="min-w-0">
            <p className={`text-lg sm:text-xl font-extrabold leading-tight ${decisionCfg.text}`}>
              {decisionCfg.label}
            </p>
            <p className={`text-sm mt-0.5 opacity-85 ${decisionCfg.text}`}>
              {decisionCfg.sublabel}
            </p>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          SECTION 2 — SYNTHÈSE : phrase intro + risque + surcoût
      ════════════════════════════════════════════════════════════ */}
      <div className="space-y-3">
        {/* Phrase intro + chip verdict global */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-2">
          <p className="flex-1 text-sm sm:text-base text-foreground leading-relaxed font-medium">
            {conclusion.phrase_intro}
          </p>
          <span className={`inline-block self-start flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${chipCls}`}>
            {chipLabel}
          </span>
        </div>

        {/* Risque + surcoût sur la même ligne */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Niveau de risque */}
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${risqueCfg.cls}`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${risqueCfg.dot}`} aria-hidden="true" />
            Risque {conclusion.niveau_risque}
          </div>

          {/* Surcoût global */}
          {hasSurcout && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30 text-xs font-semibold text-orange-800 dark:text-orange-300">
              <span aria-hidden="true">💸</span>
              Surcoût estimé :&nbsp;
              <span className="font-bold">
                {fmtPrice(conclusion.surcout_global.min)} – {fmtPrice(conclusion.surcout_global.max)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          SECTION 3 — ANOMALIES (si présentes)
      ════════════════════════════════════════════════════════════ */}
      {conclusion.has_anomalies && conclusion.anomalies.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Anomalies détectées
          </p>
          {conclusion.anomalies.map((item, i) => (
            <AnomalieCard key={`${item.poste}-${i}`} item={item} />
          ))}
        </div>
      )}

      {/* Justifications */}
      {conclusion.justifications && (
        <p className="text-sm text-muted-foreground leading-relaxed border-l-2 border-border pl-3">
          {conclusion.justifications}
        </p>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SECTION 4 — ACTIONS AVANT SIGNATURE
      ════════════════════════════════════════════════════════════ */}
      {conclusion.actions_avant_signature.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Ce que vous devez faire avant de signer
          </p>
          <ol className="space-y-2.5 mb-4">
            {conclusion.actions_avant_signature.map((action, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm text-foreground leading-snug">{action}</span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={handleCopy}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-border bg-background hover:bg-muted/60 transition-colors text-sm font-medium text-foreground"
          >
            {copied
              ? <><Check className="h-4 w-4 text-green-600" />Copié !</>
              : <><Copy className="h-4 w-4" />Copier les points à négocier</>
            }
          </button>
        </div>
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
  analysisId:      string;
  conclusionIaRaw?: string | null;
}

export function ConclusionIA({ analysisId, conclusionIaRaw }: ConclusionIAProps) {
  const { conclusion, isGenerating, error, generate, regenerate } = useConclusionIA({
    analysisId,
    initialRaw: conclusionIaRaw,
  });

  // ── Pas encore de conclusion ──────────────────────────────────────────────
  if (!conclusion && !isGenerating) {
    return (
      <div className="border-2 border-dashed border-primary/25 rounded-2xl p-5 sm:p-6 mb-6 bg-primary/3">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="font-bold text-foreground text-base">
              Dois-je signer ce devis ?
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Obtenez en 10 secondes un verdict expert : anomalies de prix, niveau de risque, surcoût estimé et les 3 actions à faire avant de signer.
            </p>
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>
            )}
            <Button
              onClick={() => generate()}
              disabled={isGenerating}
              className="mt-3 gap-2"
              size="sm"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Obtenir le verdict expert
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Génération en cours ───────────────────────────────────────────────────
  if (isGenerating && !conclusion) {
    return (
      <div className="border-2 border-primary/20 rounded-2xl p-5 sm:p-6 mb-6 bg-primary/3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">Analyse en cours…</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Détection des anomalies, calcul du risque et rédaction des actions
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Conclusion disponible ─────────────────────────────────────────────────
  if (conclusion) {
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

  return null;
}

export default ConclusionIA;
