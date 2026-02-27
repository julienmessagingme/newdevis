import { Loader2, RefreshCw, AlertTriangle, XCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ============================================================
// RÈGLE BLOQUANTE: Pas de rapport sans extraction complète
// ============================================================
// IF document_extractions.debug IS NULL
// THEN report_status = "processing"
// AND UI shows "Analyse en cours…"
// 
// IF status = "failed"
// THEN UI shows "Analyse interrompue" avec bouton Relancer
// ============================================================

interface ExtractionStatus {
  hasExtraction: boolean;
  hasOcrDebug: boolean;
  hasParserDebug: boolean;
  hasQtyRefDebug: boolean;
  isComplete: boolean;
  isFailed: boolean;
  errorMessage: string | null;
  stage: "ocr" | "parsing" | "analysis" | "complete" | "failed";
  stageLabel: string;
}

interface ExtractionBlockerProps {
  analysisId: string;
  analysisStatus: string;
  errorMessage?: string | null;
  children: React.ReactNode;
}

const STAGE_LABELS = {
  ocr: "Extraction du texte en cours...",
  parsing: "Analyse des lignes du devis...",
  analysis: "Vérification des informations...",
  complete: "Analyse terminée",
  failed: "Analyse interrompue"
};

export const useExtractionStatus = (analysisId: string): ExtractionStatus | null => {
  const [status, setStatus] = useState<ExtractionStatus | null>(null);

  useEffect(() => {
    if (!analysisId) return;

    const checkStatus = async () => {
      // Check document_extractions with new explicit status columns
      const { data, error } = await supabase
        .from("document_extractions")
        .select("ocr_status, parser_status, qtyref_status, ocr_debug, parser_debug, qty_ref_debug, ocr_reason, error_code, error_details")
        .eq("analysis_id", analysisId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Check for failed status
      const ocrStatus = data?.ocr_status as string | null;
      const isFailed = ocrStatus === "failed" || ocrStatus === "timeout" ||
                       data?.error_code === "OCR_TIMEOUT" || 
                       data?.error_code === "OCR_FAILED";
      
      const errorDetails = data?.error_details as { message?: string } | null;
      const ocrDebug = data?.ocr_debug as { error_message?: string } | null;
      const errorMessage = errorDetails?.message || ocrDebug?.error_message || "L'extraction a échoué";

      if (isFailed) {
        setStatus({
          hasExtraction: true,
          hasOcrDebug: data?.ocr_debug !== null,
          hasParserDebug: false,
          hasQtyRefDebug: false,
          isComplete: false,
          isFailed: true,
          errorMessage,
          stage: "failed",
          stageLabel: STAGE_LABELS.failed
        });
        return;
      }

      if (error || !data) {
        setStatus({
          hasExtraction: false,
          hasOcrDebug: false,
          hasParserDebug: false,
          hasQtyRefDebug: false,
          isComplete: false,
          isFailed: false,
          errorMessage: null,
          stage: "ocr",
          stageLabel: STAGE_LABELS.ocr
        });
        return;
      }

      // Use explicit status columns for progress tracking
      const parserStatus = data.parser_status as string | null;
      const qtyrefStatus = data.qtyref_status as string | null;
      
      const hasOcrSuccess = ocrStatus === "success";
      const hasParserSuccess = parserStatus === "success";
      const hasQtyRefSuccess = qtyrefStatus === "success" || qtyrefStatus === "failed"; // failed is still "done"
      
      // Fallback to checking debug objects for legacy records
      const hasOcrDebug = data.ocr_debug !== null || hasOcrSuccess;
      const hasParserDebug = data.parser_debug !== null || hasParserSuccess;
      const hasQtyRefDebug = data.qty_ref_debug !== null || hasQtyRefSuccess;

      let stage: "ocr" | "parsing" | "analysis" | "complete" | "failed" = "ocr";
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
        isFailed: false,
        errorMessage: null,
        stage,
        stageLabel: STAGE_LABELS[stage]
      });
    };

    checkStatus();

    // Poll every 3 seconds if not complete
    const interval = setInterval(() => {
      if (!status?.isComplete && !status?.isFailed) {
        checkStatus();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [analysisId, status?.isComplete, status?.isFailed]);

  return status;
};

const ExtractionBlocker = ({ analysisId, analysisStatus, errorMessage, children }: ExtractionBlockerProps) => {
  const extractionStatus = useExtractionStatus(analysisId);

  // Si statut "failed" ou "error", afficher écran d'erreur avec option de relance
  if (analysisStatus === "failed" || analysisStatus === "error" || extractionStatus?.isFailed) {
    return (
      <ExtractionFailedScreen 
        analysisId={analysisId} 
        errorMessage={errorMessage || extractionStatus?.errorMessage || "Erreur lors de l'analyse"} 
      />
    );
  }

  // Si statut "pending" ou "processing", afficher écran d'attente
  if (analysisStatus === "pending" || analysisStatus === "processing") {
    return <ExtractionWaitingScreen stage={extractionStatus?.stage === "failed" ? "ocr" : (extractionStatus?.stage || "ocr")} />;
  }

  // Si l'analyse est "completed", vérifier si c'est une analyse legacy (pas de document_extractions)
  if (analysisStatus === "completed") {
    // Si pas d'extraction du tout (legacy) → afficher le rapport quand même
    // Les analyses legacy ont raw_text rempli directement sans document_extractions
    if (!extractionStatus?.hasExtraction) {
      // Analyse legacy terminée - afficher le rapport normalement
      return <>{children}</>;
    }
    
    // Si extraction existe mais incomplète → attendre
    if (!extractionStatus.isComplete) {
      const stage = extractionStatus.stage;
      if (stage === "ocr" || stage === "parsing" || stage === "analysis") {
        return <ExtractionWaitingScreen stage={stage} />;
      }
    }
  }

  // Extraction complète ou analyse legacy → afficher le rapport
  return <>{children}</>;
};

// ============================================================
// ÉCRAN D'ERREUR - Analyse interrompue avec bouton Relancer
// ============================================================
const ExtractionFailedScreen = ({ 
  analysisId, 
  errorMessage 
}: { 
  analysisId: string; 
  errorMessage: string;
}) => {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      // Reset the analysis status to pending
      const { error: updateError } = await supabase
        .from("analyses")
        .update({ status: "pending", error_message: null })
        .eq("id", analysisId);

      if (updateError) {
        throw updateError;
      }

      // Delete the failed extraction to allow a fresh start
      await supabase
        .from("document_extractions")
        .delete()
        .eq("analysis_id", analysisId);

      // Fetch the analysis to get file info
      const { data: analysis, error: fetchError } = await supabase
        .from("analyses")
        .select("file_path")
        .eq("id", analysisId)
        .single();

      if (fetchError || !analysis) {
        throw new Error("Impossible de récupérer l'analyse");
      }

      // Trigger the analysis pipeline again
      const { error: invokeError } = await supabase.functions.invoke("analyze-quote", {
        body: { analysisId }
      });

      if (invokeError) {
        throw invokeError;
      }

      toast.success("Analyse relancée avec succès");
      
      // Force page refresh to reset state
      window.location.reload();

    } catch (error) {
      console.error("Retry failed:", error);
      toast.error("Impossible de relancer l'analyse. Veuillez réessayer.");
      setIsRetrying(false);
    }
  };

  const handleNewAnalysis = () => {
    window.location.href = "/nouvelle-analyse";
  };

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
      <div className="w-20 h-20 bg-destructive/10 rounded-2xl flex items-center justify-center mb-6">
        <XCircle className="h-10 w-10 text-destructive" />
      </div>
      
      <h1 className="text-2xl font-bold text-foreground mb-4">Analyse interrompue</h1>
      <p className="text-muted-foreground text-center mb-4 max-w-md">
        Une erreur s'est produite lors de l'extraction du document.
      </p>
      
      <div className="bg-muted/50 rounded-lg px-4 py-2 mb-8 max-w-md">
        <p className="text-sm text-muted-foreground text-center font-mono">
          {errorMessage}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button 
          onClick={handleRetry} 
          disabled={isRetrying}
          className="gap-2"
        >
          {isRetrying ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Relance en cours...
            </>
          ) : (
            <>
              <RotateCcw className="h-4 w-4" />
              Relancer l'analyse
            </>
          )}
        </Button>
        
        <Button 
          variant="outline" 
          onClick={handleNewAnalysis}
          disabled={isRetrying}
        >
          Soumettre un autre document
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-8 text-center max-w-sm">
        Si le problème persiste, le document peut être de mauvaise qualité (image floue, PDF protégé) ou dans un format non supporté.
      </p>
    </div>
  );
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
