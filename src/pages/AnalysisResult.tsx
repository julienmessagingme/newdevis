import { useEffect, useState } from "react";
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

  useEffect(() => {
    const fetchAnalysis = async () => {
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

      setAnalysis(data as Analysis);
      setLoading(false);
    };

    fetchAnalysis();

    // Subscribe to realtime updates
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
          setAnalysis(payload.new as Analysis);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  // Show loading state while analysis is processing
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
          <h1 className="text-2xl font-bold text-foreground mb-4">
            Analyse en cours...
          </h1>
          <p className="text-muted-foreground mb-8">
            Notre IA analyse votre devis. Cela peut prendre quelques minutes.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            La page se mettra à jour automatiquement
          </div>
        </main>
      </div>
    );
  }

  // Show error state
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
          <h1 className="text-2xl font-bold text-foreground mb-4">
            Erreur lors de l'analyse
          </h1>
          <p className="text-muted-foreground mb-8">
            {analysis.error_message || "Une erreur est survenue lors de l'analyse de votre devis."}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/tableau-de-bord">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retour au tableau de bord
              </Button>
            </Link>
            <Link to="/nouvelle-analyse">
              <Button>
                Réessayer avec un autre fichier
              </Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
        {/* Back Button */}
        <Link 
          to="/tableau-de-bord" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au tableau de bord
        </Link>

        {/* Score Hero */}
        <div className={`border-2 rounded-2xl p-6 md:p-8 mb-8 ${getScoreBgClass(analysis.score)}`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                Score de fiabilité
              </p>
              <h1 className={`text-3xl md:text-4xl font-bold flex items-center gap-3 ${getScoreTextClass(analysis.score)}`}>
                {getScoreIcon(analysis.score, "h-8 w-8")}
                {getScoreLabel(analysis.score)}
              </h1>
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
        </div>

        {/* Resume */}
        {analysis.resume && (
          <div className="bg-card border border-border rounded-xl p-6 mb-8 card-shadow">
            <h2 className="font-semibold text-foreground mb-3">Résumé</h2>
            <p className="text-muted-foreground">{analysis.resume}</p>
          </div>
        )}

        {/* Points OK */}
        {analysis.points_ok && analysis.points_ok.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 mb-6 card-shadow">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-score-green" />
              Points conformes
            </h2>
            <ul className="space-y-3">
              {analysis.points_ok.map((point, index) => (
                <li key={index} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-score-green mt-0.5 flex-shrink-0" />
                  <span className="text-foreground">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Alertes */}
        {analysis.alertes && analysis.alertes.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 mb-6 card-shadow">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-score-orange" />
              Points de vigilance
            </h2>
            <ul className="space-y-3">
              {analysis.alertes.map((alerte, index) => (
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
            <h2 className="font-semibold text-foreground mb-4">
              Nos recommandations
            </h2>
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

        {/* Disclaimer */}
        <p className="text-xs text-center text-muted-foreground mb-8">
          Cette analyse est fournie à titre informatif et ne constitue pas un conseil juridique. 
          Les informations sont basées sur l'analyse automatique du devis fourni.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/tableau-de-bord">
            <Button variant="outline" size="lg">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tableau de bord
            </Button>
          </Link>
          <Link to="/nouvelle-analyse">
            <Button size="lg">
              Analyser un autre devis
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
};

export default AnalysisResult;
