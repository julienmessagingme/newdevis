import { Loader2, RefreshCw, FileText, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ============================================================
// RÈGLE BLOQUANTE: Pas de rapport sans extraction complète
// ============================================================
// IF document_extractions.debug IS NULL
// THEN report_status = "processing"
// AND UI shows "Analyse en cours…"
// ============================================================

interface ExtractionStatus {
  hasExtraction: boolean;
  hasOcrDebug: boolean;
  hasParserDebug: boolean;
  hasQtyRefDebug: boolean;
  isComplete: boolean;
  stage: "ocr" | "parsing" | "analysis" | "complete";
  stageLabel: string;
}

interface ExtractionBlockerProps {
  analysisId: string;
  analysisStatus: string;
  children: React.ReactNode;
}

const STAGE_LABELS = {
  ocr: "Extraction du texte en cours...",
  parsing: "Analyse des lignes du devis...",
  analysis: "Vérification des informations...",
  complete: "Analyse terminée"
};

export const useExtractionStatus = (analysisId: string): ExtractionStatus | null => {
  const [status, setStatus] = useState<ExtractionStatus | null>(null);

  useEffect(() => {
    if (!analysisId) return;

    const checkStatus = async () => {
      const { data, error } = await supabase
        .from("document_extractions")
        .select("ocr_debug, parser_debug, qty_ref_debug, raw_text")
        .eq("analysis_id", analysisId)
        .maybeSingle();

      if (error || !data) {
        setStatus({
          hasExtraction: false,
          hasOcrDebug: false,
          hasParserDebug: false,
          hasQtyRefDebug: false,
          isComplete: false,
          stage: "ocr",
          stageLabel: STAGE_LABELS.ocr
        });
        return;
      }

      const hasOcrDebug = data.ocr_debug !== null;
      const hasParserDebug = data.parser_debug !== null;
      const hasQtyRefDebug = data.qty_ref_debug !== null;

      let stage: "ocr" | "parsing" | "analysis" | "complete" = "ocr";
      if (hasOcrDebug && hasParserDebug && hasQtyRefDebug) {
        stage = "complete";
      } else if (hasOcrDebug && hasParserDebug) {
        stage = "analysis";
      } else if (hasOcrDebug) {
        stage = "parsing";
      }

      setStatus({
        hasExtraction: true,
        hasOcrDebug,
        hasParserDebug,
        hasQtyRefDebug,
        isComplete: stage === "complete",
        stage,
        stageLabel: STAGE_LABELS[stage]
      });
    };

    checkStatus();

    // Poll toutes les 3 secondes si pas encore complet
    const interval = setInterval(() => {
      if (!status?.isComplete) {
        checkStatus();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [analysisId, status?.isComplete]);

  return status;
};

const ExtractionBlocker = ({ analysisId, analysisStatus, children }: ExtractionBlockerProps) => {
  const extractionStatus = useExtractionStatus(analysisId);

  // Si statut "pending" ou "processing", afficher écran d'attente
  if (analysisStatus === "pending" || analysisStatus === "processing") {
    return <ExtractionWaitingScreen stage="ocr" />;
  }

  // Si l'analyse est "completed" mais pas d'extraction → forcer attente
  if (analysisStatus === "completed" && extractionStatus && !extractionStatus.isComplete) {
    return <ExtractionWaitingScreen stage={extractionStatus.stage} />;
  }

  // Extraction complète → afficher le rapport
  return <>{children}</>;
};

const ExtractionWaitingScreen = ({ stage }: { stage: "ocr" | "parsing" | "analysis" | "complete" }) => {
  const stageIndex = ["ocr", "parsing", "analysis", "complete"].indexOf(stage);
  
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
      <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
      </div>
      
      <h1 className="text-2xl font-bold text-foreground mb-4">Analyse en cours...</h1>
      <p className="text-muted-foreground text-center mb-8 max-w-md">
        Notre moteur analyse votre devis en profondeur. Cette analyse complète prend généralement moins de 2 minutes.
      </p>

      {/* Progress steps */}
      <div className="w-full max-w-sm space-y-3 mb-8">
        <ProgressStep 
          label="Extraction du texte" 
          status={stageIndex >= 1 ? "done" : stageIndex === 0 ? "active" : "pending"} 
        />
        <ProgressStep 
          label="Analyse des lignes" 
          status={stageIndex >= 2 ? "done" : stageIndex === 1 ? "active" : "pending"} 
        />
        <ProgressStep 
          label="Vérifications & scoring" 
          status={stageIndex >= 3 ? "done" : stageIndex === 2 ? "active" : "pending"} 
        />
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        La page se mettra à jour automatiquement
      </div>
    </div>
  );
};

const ProgressStep = ({ 
  label, 
  status 
}: { 
  label: string; 
  status: "pending" | "active" | "done" 
}) => {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
        status === "done" ? "bg-score-green text-white" :
        status === "active" ? "bg-primary/20 border-2 border-primary" :
        "bg-muted border border-border"
      }`}>
        {status === "done" && "✓"}
        {status === "active" && <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />}
      </div>
      <span className={`text-sm ${
        status === "done" ? "text-score-green font-medium" :
        status === "active" ? "text-foreground font-medium" :
        "text-muted-foreground"
      }`}>
        {label}
      </span>
    </div>
  );
};

// Composant pour afficher l'état incomplet d'extraction (warning admin)
export const ExtractionIncompleteWarning = ({ analysisId }: { analysisId: string }) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const extractionStatus = useExtractionStatus(analysisId);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data } = await supabase.rpc("is_admin");
      setIsAdmin(data === true);
    };
    checkAdmin();
  }, []);

  if (!isAdmin || !extractionStatus || extractionStatus.isComplete) return null;

  return (
    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">
            Extraction incomplète détectée
          </p>
          <p className="text-xs text-amber-700 mt-1">
            Stage: {extractionStatus.stage} | 
            OCR: {extractionStatus.hasOcrDebug ? "✓" : "✗"} | 
            Parser: {extractionStatus.hasParserDebug ? "✓" : "✗"} | 
            QtyRef: {extractionStatus.hasQtyRefDebug ? "✓" : "✗"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ExtractionBlocker;
