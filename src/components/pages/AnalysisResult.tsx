import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
  Shield,
  ArrowLeft,
  Download,
  CheckCircle2,
  AlertCircle,
  XCircle,
  FileText,
  Loader2,
  RefreshCw,
  Lock,
  FilePlus2
} from "lucide-react";
import { getScoreIcon, getScoreLabel, getScoreBgClass, getScoreTextClass } from "@/lib/scoreUtils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generatePdfReport } from "@/utils/generatePdfReport";
import {
  BlockEntreprise,
  BlockDevis,
  BlockDevisMultiple,
  BlockPrixMarche,
  BlockSecurite,
  BlockContexte,
  BlockUrbanisme,
  filterOutEntrepriseItems,
  filterOutDevisItems,
  filterOutPriceItems,
  filterOutSecuriteItems,
  filterOutContexteItems,
  DocumentRejectionScreen,
  AdaptedAnalysisBanner,
  ExtractionBlocker,
  ExtractionIncompleteWarning
} from "@/components/analysis";
import { PostSignatureTrackingSection } from "@/components/tracking";
const OcrDebugPanel = lazy(() => import("@/components/analysis/OcrDebugPanel").then(m => ({ default: m.OcrDebugPanel })));
import type { TravauxItem } from "@/components/analysis";
import { useAnonymousAuth } from "@/hooks/useAnonymousAuth";
import FunnelStepper from "@/components/funnel/FunnelStepper";
import { ANALYSIS } from "@/lib/constants";

type DocumentDetection = {
  type: "devis_travaux" | "devis_prestation_technique" | "devis_diagnostic_immobilier" | "facture" | "autre";
  analysis_mode: "full" | "adapted" | "diagnostic" | "rejected";
  diagnostic_types?: string[];
};

type Analysis = {
  id: string;
  file_name: string;
  file_path: string;
  score: string | null;
  resume: string | null;
  points_ok: string[];
  alertes: string[];
  recommandations: string[];
  status: string;
  error_message: string | null;
  created_at: string;
  assurance_source?: string;
  assurance_level2_score?: string | null;
  attestation_analysis?: Record<string, unknown>;
  attestation_comparison?: Record<string, unknown>;
  raw_text?: string;
  site_context?: Record<string, unknown>;
  types_travaux?: TravauxItem[];
  work_type?: string;
  market_price_overrides?: Record<string, unknown> | null;
};

// Pure helper functions — extracted outside component
const parseDocumentDetection = (rawText?: string): DocumentDetection | null => {
  if (!rawText) return null;
  try {
    const parsed = JSON.parse(rawText);
    if (parsed?.document_detection) {
      return {
        type: parsed.document_detection.type,
        analysis_mode: parsed.document_detection.analysis_mode,
        diagnostic_types: parsed.document_detection.diagnostic_types,
      };
    }
  } catch {
    // rawText might not be JSON
  }
  return null;
};

const extractQuoteInfo = (analysis: Analysis) => {
  const rawText = analysis.raw_text || "";
  let nom_entreprise = "";
  let siret = "";
  const adresse = "";
  const categorie_travaux = "";

  for (const point of analysis.points_ok || []) {
    if (point.includes("Entreprise") && point.includes(":")) {
      const match = point.match(/Entreprise[^:]*:\s*(.+)/i);
      if (match) nom_entreprise = match[1].trim();
    }
    if (point.includes("SIRET") || point.includes("SIREN")) {
      const match = point.match(/(\d{9,14})/);
      if (match) siret = match[1];
    }
  }

  const siretMatch = rawText.match(/siret[:\s]*(\d[\d\s]{8,13}\d)/i);
  if (siretMatch && !siret) {
    siret = siretMatch[1].replace(/\s/g, "");
  }

  return { nom_entreprise, siret, adresse, categorie_travaux };
};

const extractWorkDates = (analysis: Analysis) => {
  const rawText = analysis.raw_text || "";
  let workStartDate: string | undefined;
  let workEndDate: string | undefined;
  let maxExecutionDays: number | undefined;

  try {
    const parsed = JSON.parse(rawText);
    if (parsed?.work_dates) {
      workStartDate = parsed.work_dates.start_date;
      workEndDate = parsed.work_dates.end_date;
      maxExecutionDays = parsed.work_dates.max_execution_days;
    }
  } catch {
    const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g;
    const allPoints = [...(analysis.points_ok || []), ...(analysis.alertes || [])];

    for (const point of allPoints) {
      const lowerPoint = point.toLowerCase();
      if (lowerPoint.includes("début") || lowerPoint.includes("démarrage") || lowerPoint.includes("commencement")) {
        const match = point.match(datePattern);
        if (match) workStartDate = match[0];
      }
      if (lowerPoint.includes("fin") || lowerPoint.includes("livraison") || lowerPoint.includes("achèvement")) {
        const match = point.match(datePattern);
        if (match) workEndDate = match[0];
      }
      const durationMatch = point.match(/(\d+)\s*(jours?|semaines?)/i);
      if (durationMatch) {
        const value = parseInt(durationMatch[1]);
        const unit = durationMatch[2].toLowerCase();
        maxExecutionDays = unit.includes("semaine") ? value * 7 : value;
      }
    }
  }

  return { workStartDate, workEndDate, maxExecutionDays };
};

export interface CompanyDisplayData {
  siret: string | null;
  nom_devis: string | null;
  nom_officiel: string | null;
  adresse_officielle: string | null;
  ville_officielle: string | null;
  date_creation: string | null;
  anciennete_annees: number | null;
  entreprise_immatriculee: boolean | null;
  entreprise_radiee: boolean | null;
  procedure_collective: boolean | null;
  lookup_status: string | null;
}

const extractCompanyData = (analysis: Analysis): CompanyDisplayData | null => {
  if (!analysis.raw_text) return null;
  try {
    const parsed = JSON.parse(analysis.raw_text);
    const extracted = parsed?.extracted;
    const verified = parsed?.verified;
    if (!extracted && !verified) return null;

    return {
      siret: extracted?.entreprise?.siret || null,
      nom_devis: extracted?.entreprise?.nom || null,
      nom_officiel: verified?.nom_officiel || null,
      adresse_officielle: verified?.adresse_officielle || null,
      ville_officielle: verified?.ville_officielle || null,
      date_creation: verified?.date_creation || null,
      anciennete_annees: verified?.anciennete_annees ?? null,
      entreprise_immatriculee: verified?.entreprise_immatriculee ?? null,
      entreprise_radiee: verified?.entreprise_radiee ?? null,
      procedure_collective: verified?.procedure_collective ?? null,
      lookup_status: verified?.lookup_status || null,
    };
  } catch {
    return null;
  }
};

const extractN8NPriceData = (analysis: Analysis): unknown => {
  if (!analysis.raw_text) return undefined;
  try {
    const parsed = JSON.parse(analysis.raw_text);
    return parsed?.n8n_price_data !== undefined ? parsed.n8n_price_data : undefined;
  } catch {
    return undefined;
  }
};

const extractLocationInfo = (analysis: Analysis) => {
  const rawText = analysis.raw_text || "";
  let codePostal: string | undefined;
  let zoneType: string | undefined;

  try {
    const parsed = JSON.parse(rawText);
    codePostal = parsed?.client?.code_postal || parsed?.extracted?.client?.code_postal;
    zoneType = parsed?.zone_type || analysis.types_travaux?.[0]?.zone_type;
  } catch {
    const cpMatch = rawText.match(/(?:code\s*postal|cp)[:\s]*(\d{5})/i) ||
                     rawText.match(/(\d{5})\s*[A-Za-z]/);
    if (cpMatch) codePostal = cpMatch[1];
  }

  return { codePostal, zoneType };
};

const calculateTotalHT = (typesTravaux?: TravauxItem[]): number | undefined => {
  if (!typesTravaux || typesTravaux.length === 0) return undefined;
  const total = typesTravaux.reduce((sum, t) => sum + (t.montant_ht || 0), 0);
  return total > 0 ? total : undefined;
};

const AnalysisResult = () => {
  const id = window.location.pathname.split('/').pop();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const { user: authUser, isAnonymous: rawIsAnonymous, isPermanent: rawIsPermanent, loading: authLoading, convertToPermanent } = useAnonymousAuth();

  // Preview mode: ?preview=gate forces anonymous view for testing
  const previewGate = new URLSearchParams(window.location.search).get("preview") === "gate";
  const isAnonymous = previewGate || rawIsAnonymous;
  const isPermanent = previewGate ? false : rawIsPermanent;

  const handleAuthConversion = () => {
    window.location.reload();
  };

  const fetchAnalysis = useCallback(async () => {
    if (!id) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return;
    }

    const { data, error } = await supabase
      .from("analyses")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      toast.error("Analyse non trouvée");
      window.location.href = isPermanent ? "/tableau-de-bord" : "/";
      return;
    }

    setAnalysis(data as unknown as Analysis);
    setLoading(false);
  }, [id, isPermanent]);

  useEffect(() => {
    fetchAnalysis();

    // Realtime subscription pour les mises à jour instantanées
    const channel = supabase
      .channel(`analysis-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'analyses',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          setAnalysis(payload.new as unknown as Analysis);
        }
      )
      .subscribe();

    // Polling de sécurité (fallback si Realtime ne fonctionne pas)
    // Stops polling once analysis is completed
    const pollInterval = setInterval(() => {
      setAnalysis(current => {
        if (current?.status !== "completed") {
          fetchAnalysis();
        }
        return current;
      });
    }, ANALYSIS.POLL_INTERVAL_MS);

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        console.error("Error removing realtime channel:", e);
      }
      clearInterval(pollInterval);
    };
  }, [id, fetchAnalysis]);

  // Memoized computed values
  const quoteInfo = useMemo(() => analysis ? extractQuoteInfo(analysis) : { nom_entreprise: "", siret: "", adresse: "", categorie_travaux: "" }, [analysis]);
  const workDates = useMemo(() => analysis ? extractWorkDates(analysis) : { workStartDate: undefined, workEndDate: undefined, maxExecutionDays: undefined }, [analysis]);
  const cachedN8NData = useMemo(() => analysis ? extractN8NPriceData(analysis) : undefined, [analysis]);
  const locationInfo = useMemo(() => analysis ? extractLocationInfo(analysis) : { codePostal: undefined, zoneType: undefined }, [analysis]);
  const companyData = useMemo(() => analysis ? extractCompanyData(analysis) : null, [analysis]);
  const totalHT = useMemo(() => calculateTotalHT(analysis?.types_travaux), [analysis?.types_travaux]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Analyse introuvable</h1>
          <p className="text-muted-foreground text-sm">
            Cette analyse n'existe pas ou vous n'y avez pas accès.
          </p>
          <a href={isPermanent ? "/tableau-de-bord" : "/"}>
            <Button variant="outline" size="lg">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {isPermanent ? "Retour au tableau de bord" : "Retour à l'accueil"}
            </Button>
          </a>
        </div>
      </div>
    );
  }

  if (analysis.status === "pending" || analysis.status === "processing") {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-card border-b border-border">
          <div className="container flex h-16 items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <span className="text-xl font-bold text-foreground">VerifierMonDevis.fr</span>
            </a>
          </div>
        </header>
        <main className="container py-16 max-w-2xl text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Analyse en cours...</h1>
          <p className="text-muted-foreground mb-4">Notre IA analyse votre devis. Cela peut prendre quelques minutes.</p>
          {analysis.error_message && analysis.error_message.startsWith("[") && (
            <p className="text-sm font-medium text-primary mb-4">{analysis.error_message}</p>
          )}
          <p className="text-xs text-muted-foreground/60 mb-8">Statut : {analysis.status}</p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            La page se mettra à jour automatiquement
          </div>
        </main>
      </div>
    );
  }

  // Handle both "error" and "failed" status using ExtractionBlocker
  if (analysis.status === "error" || analysis.status === "failed") {
    return (
      <ExtractionBlocker
        analysisId={analysis.id}
        analysisStatus={analysis.status}
        errorMessage={analysis.error_message}
      >
        {/* This won't render because ExtractionBlocker handles failed status */}
        <div />
      </ExtractionBlocker>
    );
  }

  // Parse document detection from raw_text
  const documentDetection = parseDocumentDetection(analysis.raw_text);

  // Check if document was rejected (facture ou autre)
  const isRejectedDocument = analysis.status === "completed" && (
    documentDetection?.analysis_mode === "rejected" ||
    documentDetection?.type === "facture" ||
    documentDetection?.type === "autre" ||
    (!analysis.score && analysis.resume && (
      analysis.resume.includes("facture") ||
      analysis.resume.includes("ne correspond pas") ||
      analysis.resume.includes("VerifierMonDevis.fr analyse uniquement")
    ))
  );

  // Determine rejection type for proper messaging
  const getRejectionType = (): "facture" | "autre" => {
    if (documentDetection?.type === "facture") return "facture";
    if (analysis.resume?.toLowerCase().includes("facture")) return "facture";
    return "autre";
  };

  if (isRejectedDocument) {
    return (
      <DocumentRejectionScreen
        fileName={analysis.file_name}
        rejectionMessage={analysis.resume || undefined}
        rejectionType={getRejectionType()}
      />
    );
  }

  // Check if this is an adapted analysis (diagnostic or prestation technique)
  const isAdaptedAnalysis =
    documentDetection?.analysis_mode === "adapted" ||
    documentDetection?.analysis_mode === "diagnostic" ||
    documentDetection?.type === "devis_diagnostic_immobilier" ||
    documentDetection?.type === "devis_prestation_technique";

  const getAnalysisMode = (): "diagnostic" | "prestation_technique" | "standard" => {
    if (documentDetection?.type === "devis_diagnostic_immobilier" || documentDetection?.analysis_mode === "diagnostic") {
      return "diagnostic";
    }
    if (documentDetection?.type === "devis_prestation_technique" || documentDetection?.analysis_mode === "adapted") {
      return "prestation_technique";
    }
    return "standard";
  };

  const analysisMode = getAnalysisMode();

  // Check if we have structured types_travaux data
  const hasStructuredTypesTravaux = analysis.types_travaux && analysis.types_travaux.length > 0;

  // Filter remaining points after all blocks extract their data
  const remainingPointsOk = filterOutContexteItems(
    filterOutSecuriteItems(
      filterOutPriceItems(
        filterOutDevisItems(
          filterOutEntrepriseItems(analysis.points_ok || [])
        )
      )
    )
  );

  const remainingAlertes = filterOutContexteItems(
    filterOutSecuriteItems(
      filterOutPriceItems(
        filterOutDevisItems(
          filterOutEntrepriseItems(analysis.alertes || [])
        )
      )
    )
  );

  return (
    <ExtractionBlocker analysisId={analysis.id} analysisStatus={analysis.status} errorMessage={analysis.error_message}>
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <span className="text-xl font-bold text-foreground">VerifierMonDevis.fr</span>
          </a>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.location.href = "/nouvelle-analyse"}>
              <FilePlus2 className="h-4 w-4 mr-2" />
              Analyser un autre devis
            </Button>
            <Button variant="outline" size="sm" onClick={() => generatePdfReport(analysis)}>
              <Download className="h-4 w-4 mr-2" />
              Télécharger le rapport
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-4xl">
        {/* Funnel Stepper */}
        <FunnelStepper currentStep={isPermanent ? 3 : 2} />

        <a href={isPermanent ? "/tableau-de-bord" : "/"} className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          {isPermanent ? "Retour au tableau de bord" : "Retour à l'accueil"}
        </a>

        {/* Score Hero */}
        <div className={`border-2 rounded-2xl p-6 md:p-8 mb-8 ${getScoreBgClass(analysis.score)}`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Score de fiabilité global</p>
              <h1 className={`text-3xl md:text-4xl font-bold flex items-center gap-3 ${getScoreTextClass(analysis.score)}`}>
                {getScoreIcon(analysis.score, "h-8 w-8")}
                {getScoreLabel(analysis.score)}
              </h1>
              <p className="text-sm text-muted-foreground mt-3">
                {analysis.score === "VERT" && "Aucun critère critique ni combinaison de signaux majeurs détectés."}
                {analysis.score === "ORANGE" && "Certaines informations n'ont pas été trouvées dans le devis transmis."}
                {analysis.score === "ROUGE" && "Des critères critiques ou une combinaison de signaux forts ont été détectés."}
              </p>
              {isAnonymous && (
                <div className="mt-3 inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-3 py-1.5">
                  <Lock className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">Analyse prix marché verrouillée — créez un compte pour y accéder</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground">{analysis.file_name}</p>
                <p className="text-sm text-muted-foreground">
                  Analysé le {new Date(analysis.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
            </div>
          </div>

          {/* Score explanation */}
          <div className="mt-6 p-4 bg-background/50 rounded-xl border border-border/50">
            <p className="text-xs text-muted-foreground mb-3">
              <strong className="text-foreground">💡 Comment interpréter ce score ?</strong><br />
              Ce score est calculé selon une hiérarchie de critères : les <strong>critères critiques</strong> entraînent automatiquement un feu rouge, les <strong>critères majeurs</strong> génèrent des vigilances, et les <strong>critères de confort</strong> renforcent la confiance.
            </p>
            <a
              href={`/comprendre-score?fromAnalysis=true&analysisId=${id}`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
            >
              En savoir plus sur le scoring →
            </a>
          </div>
        </div>

        {/* Adapted Analysis Banner - for diagnostics and prestations techniques */}
        {isAdaptedAnalysis && (
          <AdaptedAnalysisBanner mode={analysisMode} />
        )}

        {/* Admin Warning if extraction incomplete */}
        <ExtractionIncompleteWarning analysisId={analysis.id} />

        {/* Recommandations — en haut, avant les blocs détaillés */}
        {analysis.recommandations && analysis.recommandations.length > 0 && (
          <div className="bg-accent/50 border border-border rounded-xl p-6 mb-8">
            <h2 className="font-semibold text-foreground mb-4">Nos recommandations</h2>
            <ul className="space-y-3">
              {analysis.recommandations.map((rec, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-medium text-primary">
                    {index + 1}
                  </span>
                  <p className="text-foreground">{rec}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* BLOC 1 — Entreprise & Fiabilité */}
        <BlockEntreprise
          pointsOk={analysis.points_ok || []}
          alertes={analysis.alertes || []}
          companyData={companyData}
          defaultOpen={false}
        />

        {/* BLOC 2 — Analyse Prix & Cohérence Marché (API-driven) */}
        <BlockPrixMarche
          montantTotalHT={totalHT}
          codePostal={locationInfo.codePostal}
          selectedWorkType={analysis.work_type}
          filePath={analysis.file_path}
          cachedN8NData={cachedN8NData}
          analysisId={analysis.id}
          marketPriceOverrides={analysis.market_price_overrides}
          resume={analysis.resume}
          defaultOpen={false}
          showGate={isAnonymous && !isPermanent}
          onAuthSuccess={handleAuthConversion}
          convertToPermanent={convertToPermanent}
        />

        {/* BLOC 3 — Sécurité & Conditions de paiement */}
        <BlockSecurite
          pointsOk={analysis.points_ok || []}
          alertes={analysis.alertes || []}
          analysisId={analysis.id}
          assuranceSource={analysis.assurance_source}
          assuranceLevel2Score={analysis.assurance_level2_score}
          attestationComparison={analysis.attestation_comparison as any}
          quoteInfo={quoteInfo}
          onUploadComplete={fetchAnalysis}
          defaultOpen={false}
        />

        {/* BLOC 4 — Contexte du chantier */}
        <BlockContexte
          siteContext={analysis.site_context as any}
          pointsOk={analysis.points_ok || []}
          alertes={analysis.alertes || []}
          defaultOpen={false}
        />

        {/* BLOC 5 — Urbanisme & Formalités CERFA */}
        <BlockUrbanisme initialWorkType={analysis.work_type} />

        {/* Remaining Points OK */}
        {remainingPointsOk.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 mb-6 card-shadow">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-score-green" />
              Autres points conformes
            </h2>
            <ul className="space-y-3">
              {remainingPointsOk.map((point, index) => (
                <li key={index} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-score-green mt-0.5 flex-shrink-0" />
                  <span className="text-foreground">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Remaining Alertes */}
        {remainingAlertes.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 mb-6 card-shadow">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-score-orange" />
              Autres points de vigilance
            </h2>
            <ul className="space-y-3">
              {remainingAlertes.map((alerte, index) => (
                <li key={index} className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-score-orange mt-0.5 flex-shrink-0" />
                  <span className="text-foreground">{alerte}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Post-Signature Tracking Section (permanent users only) */}
        {!isAdaptedAnalysis && isPermanent && (
          <PostSignatureTrackingSection
            analysisId={analysis.id}
            companySiret={quoteInfo.siret}
            companyName={quoteInfo.nom_entreprise}
            workStartDate={workDates.workStartDate}
            workEndDate={workDates.workEndDate}
            maxExecutionDays={workDates.maxExecutionDays}
            isRejectedDocument={isRejectedDocument}
          />
        )}

        {/* Message de synthèse obligatoire */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            📊 Comment interpréter ce score ?
          </h3>
          <div className="text-xs text-muted-foreground space-y-2">
            <p>Le score global résulte d'une <strong className="text-foreground">application stricte de règles prédéfinies</strong>.</p>
            <p>Un score <strong className="text-score-orange">ORANGE</strong> indique des informations non trouvées dans le devis. <strong className="text-foreground">Vous pouvez les ajouter directement</strong>.</p>
            <p>Un score <strong className="text-score-red">ROUGE</strong> est réservé à des <strong className="text-foreground">situations factuellement critiques</strong> (entreprise radiée, procédure collective, paiement en espèces, acompte &gt; 50%).</p>
          </div>
        </div>

        {/* OCR Debug Panel - Admin Only (lazy-loaded, hidden for anonymous users) */}
        {!isAnonymous && (
          <Suspense fallback={null}>
            <OcrDebugPanel analysisId={analysis.id} />
          </Suspense>
        )}

        {/* Disclaimer */}
        <div className="bg-muted/50 border border-border rounded-xl p-5 mb-8">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">⚠️ Avertissement important</h3>
          <div className="text-xs text-muted-foreground space-y-2">
            <p>L'analyse fournie par VerifierMonDevis.fr est <strong className="text-foreground">automatisée</strong> et repose sur les informations figurant sur le devis transmis.</p>
            <p>Cette analyse constitue une <strong className="text-foreground">aide à la décision</strong> et une <strong className="text-foreground">information indicative</strong>.</p>
            <p>VerifierMonDevis.fr <strong className="text-foreground">n'évalue pas les artisans</strong> et ne porte aucun jugement sur leur probité ou leur compétence.</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href={isPermanent ? "/tableau-de-bord" : "/"}><Button variant="outline" size="lg"><ArrowLeft className="h-4 w-4 mr-2" />{isPermanent ? "Tableau de bord" : "Accueil"}</Button></a>
          <a href="/nouvelle-analyse"><Button size="lg">Analyser un autre devis</Button></a>
        </div>
      </main>
    </div>
    </ExtractionBlocker>
  );
};

export default AnalysisResult;
