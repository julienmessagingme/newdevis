import { useEffect, useState, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
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
  RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generatePdfReport } from "@/utils/generatePdfReport";
import { 
  BlockEntreprise, 
  BlockDevis, 
  BlockDevisMultiple,
  BlockSecurite, 
  BlockContexte,
  filterOutEntrepriseItems,
  filterOutDevisItems,
  filterOutPriceItems,
  filterOutSecuriteItems,
  filterOutContexteItems,
  DocumentRejectionScreen,
  AdaptedAnalysisBanner
} from "@/components/analysis";
import type { TravauxItem } from "@/components/analysis";

type DocumentDetection = {
  type: "devis_travaux" | "devis_prestation_technique" | "devis_diagnostic_immobilier" | "facture" | "autre";
  analysis_mode: "full" | "adapted" | "diagnostic" | "rejected";
  diagnostic_types?: string[];
};

type Analysis = {
  id: string;
  file_name: string;
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
};

// Helper to parse document detection from raw_text
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

const getScoreIcon = (score: string | null, className: string = "h-5 w-5") => {
  switch (score) {
    case "VERT": return <CheckCircle2 className={`${className} text-score-green`} />;
    case "ORANGE": return <AlertCircle className={`${className} text-score-orange`} />;
    case "ROUGE": return <XCircle className={`${className} text-score-red`} />;
    default: return null;
  }
};

const getScoreLabel = (score: string | null) => {
  switch (score) {
    case "VERT": return "FEU VERT";
    case "ORANGE": return "FEU ORANGE";
    case "ROUGE": return "FEU ROUGE";
    default: return "-";
  }
};

const getScoreBgClass = (score: string | null) => {
  switch (score) {
    case "VERT": return "bg-score-green-bg border-score-green/30";
    case "ORANGE": return "bg-score-orange-bg border-score-orange/30";
    case "ROUGE": return "bg-score-red-bg border-score-red/30";
    default: return "bg-muted border-border";
  }
};

const getScoreTextClass = (score: string | null) => {
  switch (score) {
    case "VERT": return "text-score-green";
    case "ORANGE": return "text-score-orange";
    case "ROUGE": return "text-score-red";
    default: return "text-muted-foreground";
  }
};

const AnalysisResult = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalysis = useCallback(async () => {
    if (!id) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/connexion");
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
      navigate("/tableau-de-bord");
      return;
    }

    setAnalysis(data as unknown as Analysis);
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => {
    fetchAnalysis();

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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, fetchAnalysis]);

  const extractQuoteInfo = (analysis: Analysis) => {
    const rawText = analysis.raw_text || "";
    let nom_entreprise = "";
    let siret = "";
    let adresse = "";
    let categorie_travaux = "";

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!analysis) return null;

  if (analysis.status === "pending" || analysis.status === "processing") {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-card border-b border-border">
          <div className="container flex h-16 items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <span className="text-xl font-bold text-foreground">VerifierMonDevis.fr</span>
            </Link>
          </div>
        </header>
        <main className="container py-16 max-w-2xl text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Analyse en cours...</h1>
          <p className="text-muted-foreground mb-8">Notre IA analyse votre devis. Cela peut prendre quelques minutes.</p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            La page se mettra à jour automatiquement
          </div>
        </main>
      </div>
    );
  }

  if (analysis.status === "error") {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-card border-b border-border">
          <div className="container flex h-16 items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <span className="text-xl font-bold text-foreground">VerifierMonDevis.fr</span>
            </Link>
          </div>
        </header>
        <main className="container py-16 max-w-2xl text-center">
          <div className="w-20 h-20 bg-score-red/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <XCircle className="h-10 w-10 text-score-red" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Erreur lors de l'analyse</h1>
          <p className="text-muted-foreground mb-8">{analysis.error_message || "Une erreur est survenue."}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/tableau-de-bord"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />Retour</Button></Link>
            <Link to="/nouvelle-analyse"><Button>Réessayer</Button></Link>
          </div>
        </main>
      </div>
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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <span className="text-xl font-bold text-foreground">VerifierMonDevis.fr</span>
          </Link>
          <Button variant="outline" size="sm" onClick={() => generatePdfReport(analysis)}>
            <Download className="h-4 w-4 mr-2" />
            Télécharger le rapport
          </Button>
        </div>
      </header>

      <main className="container py-8 max-w-4xl">
        <Link to="/tableau-de-bord" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Retour au tableau de bord
        </Link>

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
                {analysis.score === "ORANGE" && "Plusieurs points de vigilance nécessitent une vérification."}
                {analysis.score === "ROUGE" && "Critères critiques ou combinaison de signaux forts détectés."}
              </p>
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
            <Link 
              to="/comprendre-score" 
              state={{ fromAnalysis: true, analysisId: id }}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
            >
              En savoir plus sur le scoring →
            </Link>
          </div>
        </div>

        {/* Adapted Analysis Banner - for diagnostics and prestations techniques */}
        {isAdaptedAnalysis && (
          <AdaptedAnalysisBanner mode={analysisMode} />
        )}

        {/* Resume */}
        {analysis.resume && (
          <div className="bg-card border border-border rounded-xl p-6 mb-8 card-shadow">
            <h2 className="font-semibold text-foreground mb-3">Résumé</h2>
            <p className="text-muted-foreground">{analysis.resume}</p>
          </div>
        )}

        {/* BLOC 1 — Entreprise & Fiabilité */}
        <BlockEntreprise 
          pointsOk={analysis.points_ok || []} 
          alertes={analysis.alertes || []} 
        />

        {/* BLOC 2 — Devis & Cohérence financière */}
        {/* Use BlockDevisMultiple if we have structured data or price analysis in points */}
        <BlockDevisMultiple 
          typesTravaux={analysis.types_travaux}
          pointsOk={analysis.points_ok || []} 
          alertes={analysis.alertes || []} 
        />
        
        {/* Fallback to simple BlockDevis if no multi-type data */}
        {!hasStructuredTypesTravaux && (
          <BlockDevis 
            pointsOk={analysis.points_ok || []} 
            alertes={analysis.alertes || []} 
          />
        )}

        {/* BLOC 3 — Sécurité & Conditions de paiement */}
        <BlockSecurite 
          pointsOk={analysis.points_ok || []} 
          alertes={analysis.alertes || []}
          analysisId={analysis.id}
          assuranceSource={analysis.assurance_source}
          assuranceLevel2Score={analysis.assurance_level2_score}
          attestationComparison={analysis.attestation_comparison as any}
          quoteInfo={extractQuoteInfo(analysis)}
          onUploadComplete={fetchAnalysis}
        />

        {/* BLOC 4 — Contexte du chantier */}
        <BlockContexte 
          siteContext={analysis.site_context as any}
          pointsOk={analysis.points_ok || []} 
          alertes={analysis.alertes || []} 
        />

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

        {/* Recommendations */}
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

        {/* Message de synthèse obligatoire */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            📊 Comment interpréter ce score ?
          </h3>
          <div className="text-xs text-muted-foreground space-y-2">
            <p>Le score global résulte d'une <strong className="text-foreground">application stricte de règles prédéfinies</strong>.</p>
            <p>Un score <strong className="text-score-orange">ORANGE</strong> indique des points à vérifier, et <strong className="text-foreground">non une situation problématique</strong>.</p>
            <p>Un score <strong className="text-score-red">ROUGE</strong> est réservé à des <strong className="text-foreground">situations factuellement critiques</strong> (entreprise radiée, procédure collective, paiement en espèces, acompte &gt; 50%).</p>
          </div>
        </div>

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
          <Link to="/tableau-de-bord"><Button variant="outline" size="lg"><ArrowLeft className="h-4 w-4 mr-2" />Tableau de bord</Button></Link>
          <Link to="/nouvelle-analyse"><Button size="lg">Analyser un autre devis</Button></Link>
        </div>
      </main>
    </div>
  );
};

export default AnalysisResult;
