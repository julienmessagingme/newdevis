/**
 * VerdictReasons — section "Pourquoi ce verdict ?"
 *
 * Affiche 1 à 3 raisons courtes, lisibles en 5 secondes, sans jargon.
 * Les raisons sont générées par generateVerdictReasons() (verdictEngine.ts).
 */

import type { VerdictReasonsInput } from "@/lib/verdictEngine";
import { generateVerdictReasons } from "@/lib/verdictEngine";

interface VerdictReasonsProps {
  input: VerdictReasonsInput;
  className?: string;
}

export function VerdictReasons({ input, className = "" }: VerdictReasonsProps) {
  const reasons = generateVerdictReasons(input);
  if (reasons.length === 0) return null;

  return (
    <div className={`rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-2 ${className}`}>
      <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wide flex items-center gap-1.5">
        <span>🔍</span>
        <span>Pourquoi ce verdict ?</span>
      </p>
      <ul className="space-y-1.5">
        {reasons.map((reason, i) => (
          <li
            key={i}
            className="text-sm text-foreground leading-snug flex items-start gap-2"
          >
            <span className="mt-[2px] shrink-0 text-muted-foreground">•</span>
            <span>{reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
