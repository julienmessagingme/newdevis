/**
 * src/components/analysis/AvisEtPreparation.tsx
 *
 * Orchestrateur — remplace ConclusionIA en drop-in dans AnalysisResult.
 * Assemble les composants issus de la Bible Produit VMD :
 *
 *   1. Notre lecture (AvisSurLeDevis)
 *   2. Préparez votre rendez-vous avec votre artisan (PreparezVotreRendezVous)
 *   3. Ce qui nous a menés à cet avis (PourquoiCetAvis)
 *   4. Un proche a un chantier en cours ? (InvitationPartager)
 *
 * Utilise le hook useConclusionIA existant — aucune modification du moteur,
 * aucune nouvelle route API, aucun nouveau calcul.
 */

import { useEffect, useRef } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConclusionIA } from "@/hooks/useConclusionIA";
import AvisSurLeDevis from "./AvisSurLeDevis";
import PreparezVotreRendezVous from "./PreparezVotreRendezVous";
import PourquoiCetAvis from "./PourquoiCetAvis";
import InvitationPartager from "./InvitationPartager";

interface Props {
  analysisId: string;
  conclusionIaRaw: string | null;
  pointsOk: string[];
  alertes: string[];
  entrepriseName?: string | null;
  criticalReasons?: string[];
  comparableCount?: number | null;
  totalCount?: number | null;
  onVerdictReady?: (raw: string) => void;
  onCopy?: () => void;
}

export default function AvisEtPreparation({
  analysisId,
  conclusionIaRaw,
  pointsOk,
  alertes,
  entrepriseName,
  criticalReasons = [],
  comparableCount,
  totalCount,
  onVerdictReady,
  onCopy,
}: Props) {
  const { conclusion, isGenerating, error, regenerate } = useConclusionIA({
    analysisId,
    initialRaw: conclusionIaRaw,
  });

  // Notifie le parent une fois la conclusion arrivée (analytics + cache local).
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (conclusion && !notifiedRef.current) {
      notifiedRef.current = true;
      try {
        onVerdictReady?.(JSON.stringify(conclusion));
      } catch {
        /* silencieux */
      }
    }
  }, [conclusion, onVerdictReady]);

  if (isGenerating && !conclusion) {
    return <LoadingState />;
  }

  if (error && !conclusion) {
    return <ErrorState error={error} onRetry={regenerate} />;
  }

  if (!conclusion) {
    return <LoadingState />;
  }

  // Bypass complet : les cas non comparables (étranger / courtier / incomplet /
  // hors-scope / prestation intellectuelle) sont portés uniquement par le
  // hero. Ni fiche, ni « Pourquoi », ni invitation à partager — le message est
  // tout. Cf. Bible Produit VMD §5.
  const isBypass =
    Boolean(conclusion.foreign_quote) ||
    Boolean(conclusion.estimation_courtier) ||
    Boolean(conclusion.incomplete_quote) ||
    Boolean(conclusion.hors_scope) ||
    Boolean(conclusion.prestation_intellectuelle);

  if (isBypass) {
    return (
      <AvisSurLeDevis
        conclusion={conclusion}
        comparableCount={comparableCount}
        totalCount={totalCount}
        criticalReasons={criticalReasons}
      />
    );
  }

  return (
    <div className="space-y-2">
      <AvisSurLeDevis
        conclusion={conclusion}
        comparableCount={comparableCount}
        totalCount={totalCount}
        criticalReasons={criticalReasons}
      />
      <PreparezVotreRendezVous
        conclusion={conclusion}
        pointsOk={pointsOk}
        alertes={alertes}
        entrepriseName={entrepriseName}
        onCopy={onCopy}
      />
      <PourquoiCetAvis conclusion={conclusion} />
      <InvitationPartager />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ÉTATS DE CHARGEMENT ET D'ERREUR — sobres, sans effet spectaculaire.
// ═══════════════════════════════════════════════════════════════════

function LoadingState() {
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-8 md:px-8 md:py-10">
      <div className="flex items-center gap-3 text-foreground/70">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <p className="text-sm">Nous relisons votre devis.</p>
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/60 px-6 py-6 md:px-8 md:py-8">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm font-medium text-rose-900">{error}</p>
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={onRetry}>
              Réessayer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
