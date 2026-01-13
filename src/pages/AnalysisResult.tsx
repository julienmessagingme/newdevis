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
  RefreshCw,
  Star,
  Globe,
  Award,
  ShieldCheck,
  FileCheck,
  CreditCard
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generatePdfReport } from "@/utils/generatePdfReport";
import AttestationUpload from "@/components/AttestationUpload";

interface ReputationOnline {
  rating?: number;
  reviews_count?: number;
  score: "VERT" | "ORANGE" | "ROUGE";
  explanation: string;
}

interface RGEQualification {
  isRGE: boolean;
  status: "OUI" | "NON" | "INDISPONIBLE" | "NON_REQUIS";
  score: "VERT" | "ORANGE" | "NON_REQUIS";
  explanation: string;
}

interface QualibatQualification {
  hasQualibat: boolean;
  score: "VERT" | "ORANGE";
  explanation: string;
}

interface AssuranceInfo {
  decennale: {
    mentionnee: boolean;
    critique: boolean;
    score: "VERT" | "ORANGE" | "ROUGE";
  };
  rcpro: {
    mentionnee: boolean;
    score: "VERT" | "ORANGE" | "ROUGE";
  };
  globalScore: "VERT" | "ORANGE" | "ROUGE";
}

interface AttestationComparison {
  nom_entreprise: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
  siret_siren: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
  adresse: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
  periode_validite: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
  activite_couverte: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
  coherence_globale: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
}

interface AttestationAnalysis {
  type_assurance: "decennale" | "rc_pro" | "autre";
  nom_entreprise_assuree: string;
  assureur: string;
  numero_contrat: string;
  date_fin_couverture: string;
  activites_couvertes: string;
}

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
  reputation_online?: ReputationOnline;
  // Level 2 attestation fields
  assurance_source?: string;
  assurance_level2_score?: "VERT" | "ORANGE" | "ROUGE";
  attestation_analysis?: {
    decennale?: AttestationAnalysis;
    rc_pro?: AttestationAnalysis;
  };
  attestation_comparison?: {
    decennale?: AttestationComparison;
    rc_pro?: AttestationComparison;
  };
  // Quote info for attestation comparison
  raw_text?: string;
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

// Extract reputation data from points_ok or alertes
const extractReputationData = (analysis: Analysis): ReputationOnline | null => {
  const allPoints = [...(analysis.points_ok || []), ...(analysis.alertes || [])];
  
  for (const point of allPoints) {
    // Pattern: "Réputation en ligne : X/5 (Y avis Google)"
    const ratingMatch = point.match(/Réputation en ligne.*?(\d+(?:\.\d+)?)\s*\/\s*5.*?\((\d+)\s*avis/i);
    if (ratingMatch) {
      const rating = parseFloat(ratingMatch[1]);
      const reviewsCount = parseInt(ratingMatch[2], 10);
      
      let score: "VERT" | "ORANGE" | "ROUGE";
      if (rating > 4.5) {
        score = "VERT";
      } else if (rating >= 4.0) {
        score = "ORANGE";
      } else {
        score = "ROUGE";
      }
      
      return {
        rating,
        reviews_count: reviewsCount,
        score,
        explanation: point
      };
    }
    
    // Pattern for no reviews: "Aucun avis disponible"
    if (point.includes("Réputation en ligne") && point.includes("Aucun avis disponible")) {
      return {
        score: "ORANGE",
        explanation: point
      };
    }
    
    // Pattern for not found on Google
    if (point.includes("Réputation en ligne") && (point.includes("non trouvé") || point.includes("Établissement non trouvé"))) {
      return {
        score: "ORANGE",
        explanation: point
      };
    }
  }
  
  return null;
};

// Filter out reputation-related items from points_ok/alertes to avoid duplicates
const filterOutReputation = (items: string[]): string[] => {
  return items.filter(item => !item.toLowerCase().includes("réputation en ligne"));
};

// Extract RGE qualification data from points_ok or alertes
const extractRGEData = (analysis: Analysis): RGEQualification | null => {
  const allPoints = [...(analysis.points_ok || []), ...(analysis.alertes || [])];
  
  for (const point of allPoints) {
    // Pattern for RGE = NOT REQUIRED (non requis / hors périmètre)
    if (point.includes("Qualification RGE") && (point.includes("non requise") || point.includes("hors périmètre"))) {
      return {
        isRGE: false,
        status: "NON_REQUIS",
        score: "NON_REQUIS",
        explanation: point
      };
    }
    
    // Pattern for RGE = YES
    if (point.includes("Qualification RGE") && point.includes("Oui")) {
      return {
        isRGE: true,
        status: "OUI",
        score: "VERT",
        explanation: point
      };
    }
    
    // Pattern for RGE = NO
    if (point.includes("Qualification RGE") && point.includes("Non")) {
      return {
        isRGE: false,
        status: "NON",
        score: "ORANGE",
        explanation: point
      };
    }
    
    // Pattern for RGE = UNAVAILABLE (service indisponible, vérification impossible, erreur)
    if (point.includes("Qualification RGE") && (point.includes("indisponible") || point.includes("impossible") || point.includes("erreur"))) {
      return {
        isRGE: false,
        status: "INDISPONIBLE",
        score: "ORANGE",
        explanation: point
      };
    }
  }
  
  return null;
};

// Filter out RGE-related items from points_ok/alertes to avoid duplicates
const filterOutRGE = (items: string[]): string[] => {
  return items.filter(item => !item.toLowerCase().includes("qualification rge"));
};

// Extract QUALIBAT qualification data from points_ok or alertes
const extractQualibatData = (analysis: Analysis): QualibatQualification | null => {
  const allPoints = [...(analysis.points_ok || []), ...(analysis.alertes || [])];
  
  for (const point of allPoints) {
    // Pattern for QUALIBAT detected
    if (point.toLowerCase().includes("qualification qualibat") && point.toLowerCase().includes("mention détectée")) {
      return {
        hasQualibat: true,
        score: "VERT",
        explanation: point
      };
    }
    
    // Pattern for QUALIBAT not detected
    if (point.toLowerCase().includes("qualification qualibat") && point.toLowerCase().includes("aucune mention")) {
      return {
        hasQualibat: false,
        score: "ORANGE",
        explanation: point
      };
    }
  }
  
  return null;
};

// Filter out QUALIBAT-related items from points_ok/alertes to avoid duplicates
const filterOutQualibat = (items: string[]): string[] => {
  return items.filter(item => !item.toLowerCase().includes("qualification qualibat"));
};

// Extract Assurance data from points_ok or alertes
const extractAssuranceData = (analysis: Analysis): AssuranceInfo | null => {
  const allPoints = [...(analysis.points_ok || []), ...(analysis.alertes || [])];
  
  let decennaleMentionnee = false;
  let decennaleCritique = false;
  let decennaleScore: "VERT" | "ORANGE" | "ROUGE" = "ORANGE";
  let rcproMentionnee = false;
  let rcproScore: "VERT" | "ORANGE" | "ROUGE" = "ORANGE";
  let globalScore: "VERT" | "ORANGE" | "ROUGE" = "ORANGE";
  
  for (const point of allPoints) {
    const lowerPoint = point.toLowerCase();
    
    // Check for assurance mentions
    if (lowerPoint.includes("assurance") || lowerPoint.includes("décennale") || lowerPoint.includes("rc pro")) {
      // Décennale detection
      if (lowerPoint.includes("décennale mentionnée") || lowerPoint.includes("decennale mentionnée")) {
        decennaleMentionnee = true;
      }
      if (lowerPoint.includes("décennale") && lowerPoint.includes("non mentionnée")) {
        decennaleMentionnee = false;
      }
      
      // RC Pro detection
      if (lowerPoint.includes("rc pro mentionnée") || lowerPoint.includes("rc professionnelle mentionnée")) {
        rcproMentionnee = true;
      }
      
      // Score detection
      if (point.includes("🟢") && lowerPoint.includes("assurance")) {
        globalScore = "VERT";
        if (lowerPoint.includes("décennale")) decennaleScore = "VERT";
        if (lowerPoint.includes("rc pro")) rcproScore = "VERT";
      }
      if (point.includes("⚠️") && lowerPoint.includes("assurance")) {
        if (globalScore !== "ROUGE") globalScore = "ORANGE";
      }
      if (point.includes("🔴") && lowerPoint.includes("assurance")) {
        globalScore = "ROUGE";
        if (lowerPoint.includes("décennale") && lowerPoint.includes("obligatoire")) {
          decennaleCritique = true;
          decennaleScore = "ROUGE";
        }
      }
      
      // Parse structured info if present
      if (lowerPoint.includes("décennale") && lowerPoint.includes("obligatoire")) {
        decennaleCritique = true;
      }
    }
  }
  
  // If no assurance info found at all, return null
  const hasAssuranceInfo = allPoints.some(p => 
    p.toLowerCase().includes("assurance") || 
    p.toLowerCase().includes("décennale") ||
    p.toLowerCase().includes("rc pro")
  );
  
  if (!hasAssuranceInfo) return null;
  
  return {
    decennale: {
      mentionnee: decennaleMentionnee,
      critique: decennaleCritique,
      score: decennaleScore,
    },
    rcpro: {
      mentionnee: rcproMentionnee,
      score: rcproScore,
    },
    globalScore,
  };
};

// Filter out Assurance-related items from points_ok/alertes to avoid duplicates
const filterOutAssurance = (items: string[]): string[] => {
  return items.filter(item => {
    const lower = item.toLowerCase();
    return !lower.includes("assurance") && 
           !lower.includes("décennale") && 
           !lower.includes("rc pro") &&
           !lower.includes("attestation d'assurance");
  });
};

// Extract IBAN verification data from points_ok or alertes
interface IBANInfo {
  hasIBAN: boolean;
  isValid?: boolean;
  countryCode?: string;
  isFrance?: boolean;
  score: "VERT" | "ORANGE" | "ROUGE";
  explanation: string;
}

const extractIBANData = (analysis: Analysis): IBANInfo | null => {
  const allPoints = [...(analysis.points_ok || []), ...(analysis.alertes || [])];
  
  for (const point of allPoints) {
    const lowerPoint = point.toLowerCase();
    
    // Check for IBAN / mode de règlement mentions
    if (lowerPoint.includes("mode de règlement") || lowerPoint.includes("iban")) {
      // Valid French IBAN
      if (lowerPoint.includes("valide") && lowerPoint.includes("france")) {
        return {
          hasIBAN: true,
          isValid: true,
          countryCode: "FR",
          isFrance: true,
          score: "VERT",
          explanation: point
        };
      }
      
      // Valid but foreign IBAN
      if (lowerPoint.includes("valide") && (lowerPoint.includes("hors de france") || lowerPoint.includes("étranger"))) {
        // Extract country from the point
        const countryMatch = point.match(/\(([A-Za-zÀ-ÿ\s]+)\)/);
        const country = countryMatch ? countryMatch[1] : "Étranger";
        return {
          hasIBAN: true,
          isValid: true,
          isFrance: false,
          score: "ORANGE",
          explanation: point
        };
      }
      
      // Invalid IBAN
      if (lowerPoint.includes("non valide") || lowerPoint.includes("invalide")) {
        return {
          hasIBAN: true,
          isValid: false,
          score: "ROUGE",
          explanation: point
        };
      }
      
      // No IBAN detected
      if (lowerPoint.includes("aucun iban")) {
        return {
          hasIBAN: false,
          score: "ORANGE",
          explanation: point
        };
      }
    }
  }
  
  return null;
};

// Filter out IBAN-related items from points_ok/alertes to avoid duplicates
const filterOutIBAN = (items: string[]): string[] => {
  return items.filter(item => {
    const lower = item.toLowerCase();
    return !lower.includes("mode de règlement") && 
           !lower.includes("iban");
  });
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

    setAnalysis(data as Analysis);
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => {
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
  }, [id, fetchAnalysis]);

  // Extract quote info for attestation comparison
  const extractQuoteInfo = (analysis: Analysis) => {
    // Try to extract info from raw_text or points_ok
    const rawText = analysis.raw_text || "";
    let nom_entreprise = "";
    let siret = "";
    let adresse = "";
    let categorie_travaux = "";

    // Extract company name from points_ok
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

    // Extract SIRET from raw text
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

        {/* Qualification RGE - Bloc dédié */}
        {(() => {
          const rge = extractRGEData(analysis);
          if (!rge) return null;
          
          const getRGEBgClass = () => {
            if (rge.status === "NON_REQUIS" || rge.isRGE) {
              return "bg-score-green-bg border-score-green/30";
            }
            return "bg-score-orange-bg border-score-orange/30";
          };

          const getRGEIcon = () => {
            if (rge.status === "NON_REQUIS" || rge.isRGE) {
              return <CheckCircle2 className="h-6 w-6 text-score-green" />;
            }
            return <AlertCircle className="h-6 w-6 text-score-orange" />;
          };

          const getRGEStatusText = () => {
            switch (rge.status) {
              case "OUI":
                return "Oui – Artisan reconnu par France Rénov'";
              case "NON":
                return "Non – Artisan non référencé RGE à ce jour";
              case "INDISPONIBLE":
                return "Vérification indisponible";
              case "NON_REQUIS":
                return "Non requise pour ce type de travaux";
            }
          };

          const getRGEExplanation = () => {
            switch (rge.status) {
              case "OUI":
                return "L'entreprise est référencée dans l'annuaire officiel des professionnels RGE (ADEME / France Rénov'). Cette qualification permet de bénéficier des aides de l'État pour les travaux de rénovation énergétique.";
              case "NON":
                return "La qualification RGE est obligatoire pour bénéficier des aides publiques (MaPrimeRénov', CEE, Éco-PTZ) pour les travaux de rénovation énergétique. Cela ne préjuge pas de la qualité de l'artisan.";
              case "INDISPONIBLE":
                return "Le service de vérification RGE est temporairement indisponible. Vous pouvez vérifier manuellement sur france-renov.gouv.fr.";
              case "NON_REQUIS":
                return "La qualification RGE n'est pas requise pour ce type de travaux. Elle est pertinente uniquement pour les travaux de rénovation énergétique (isolation, pompe à chaleur, panneaux solaires, etc.).";
            }
          };

          return (
            <div className={`border rounded-xl p-6 mb-6 ${getRGEBgClass()}`}>
              <div className="flex items-start gap-4">
                <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
                  <Award className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="font-semibold text-foreground text-lg">Qualification RGE</h2>
                    {getRGEIcon()}
                  </div>
                  
                  <div className="mb-3">
                    <span className={`font-bold text-lg ${rge.status === "NON_REQUIS" || rge.isRGE ? "text-score-green" : "text-score-orange"}`}>
                      {getRGEStatusText()}
                    </span>
                  </div>
                  
                  <p className="text-sm text-muted-foreground">
                    {getRGEExplanation()}
                  </p>
                  
                  {rge.status !== "NON_REQUIS" && (
                    <p className="text-xs text-muted-foreground/70 mt-3 italic">
                      Vérification effectuée via l'annuaire officiel France Rénov' (ADEME).
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Qualification QUALIBAT - Bloc dédié */}
        {(() => {
          const qualibat = extractQualibatData(analysis);
          if (!qualibat) return null;
          
          const getQualibatBgClass = () => {
            return qualibat.hasQualibat 
              ? "bg-score-green-bg border-score-green/30" 
              : "bg-score-orange-bg border-score-orange/30";
          };

          return (
            <div className={`border rounded-xl p-6 mb-6 ${getQualibatBgClass()}`}>
              <div className="flex items-start gap-4">
                <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="font-semibold text-foreground text-lg">Qualification QUALIBAT</h2>
                    {qualibat.hasQualibat ? (
                      <CheckCircle2 className="h-6 w-6 text-score-green" />
                    ) : (
                      <AlertCircle className="h-6 w-6 text-score-orange" />
                    )}
                  </div>
                  
                  <div className="mb-3">
                    <span className={`font-bold text-lg ${qualibat.hasQualibat ? "text-score-green" : "text-score-orange"}`}>
                      {qualibat.hasQualibat ? "Mention détectée sur le devis" : "Aucune mention détectée sur le devis fourni"}
                    </span>
                  </div>
                  
                  <p className="text-sm text-muted-foreground">
                    {qualibat.hasQualibat 
                      ? "QUALIBAT est un organisme de qualification et certification du bâtiment. Cette certification volontaire atteste des compétences professionnelles de l'entreprise."
                      : "QUALIBAT est une certification volontaire et non obligatoire. Son absence ne préjuge pas de la qualité de l'artisan."
                    }
                  </p>
                  
                  <p className="text-xs text-muted-foreground/70 mt-3 italic">
                    Information complémentaire de confiance basée sur l'analyse du devis.
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Réputation en ligne - Bloc dédié */}
        {(() => {
          const reputation = extractReputationData(analysis);
          if (!reputation) return null;
          
          const getReputationIcon = () => {
            switch (reputation.score) {
              case "VERT": return <CheckCircle2 className="h-6 w-6 text-score-green" />;
              case "ORANGE": return <AlertCircle className="h-6 w-6 text-score-orange" />;
              case "ROUGE": return <XCircle className="h-6 w-6 text-score-red" />;
            }
          };
          
          const getReputationBgClass = () => {
            switch (reputation.score) {
              case "VERT": return "bg-score-green-bg border-score-green/30";
              case "ORANGE": return "bg-score-orange-bg border-score-orange/30";
              case "ROUGE": return "bg-score-red-bg border-score-red/30";
            }
          };

          return (
            <div className={`border rounded-xl p-6 mb-8 ${getReputationBgClass()}`}>
              <div className="flex items-start gap-4">
                <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
                  <Globe className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="font-semibold text-foreground text-lg">Réputation en ligne</h2>
                    {getReputationIcon()}
                  </div>
                  
                  {reputation.rating !== undefined && reputation.reviews_count !== undefined ? (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-5 w-5 ${
                                star <= Math.round(reputation.rating!)
                                  ? "text-yellow-400 fill-yellow-400"
                                  : "text-muted-foreground/30"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="font-bold text-foreground text-lg">
                          {reputation.rating}/5
                        </span>
                        <span className="text-muted-foreground">
                          ({reputation.reviews_count} avis Google)
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3">
                      <span className="text-muted-foreground">
                        {reputation.explanation.includes("non trouvé") 
                          ? "Établissement non trouvé sur Google"
                          : "Aucun avis disponible sur Google"}
                      </span>
                    </div>
                  )}
                  
                  <p className="text-sm text-muted-foreground">
                    {reputation.rating !== undefined && reputation.score === "VERT" && 
                      "Excellente réputation basée sur les avis clients Google."}
                    {reputation.rating !== undefined && reputation.score === "ORANGE" && 
                      "Bonne réputation avec quelques axes d'amélioration possibles."}
                    {reputation.rating !== undefined && reputation.score === "ROUGE" && 
                      "Il est recommandé de consulter les avis en détail avant de vous engager."}
                    {reputation.rating === undefined && 
                      "L'absence d'avis ne préjuge pas de la qualité de service de l'entreprise."}
                  </p>
                  
                  <p className="text-xs text-muted-foreground/70 mt-3 italic">
                    Les avis Google sont publics et peuvent évoluer dans le temps.
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Assurances - Bloc dédié avec Niveau 2 */}
        {(() => {
          const assurance = extractAssuranceData(analysis);
          if (!assurance) return null;
          
          const hasLevel2 = analysis.assurance_source === "devis+attestation";
          const level2Score = analysis.assurance_level2_score;
          
          // Use Level 2 score if available, otherwise Level 1
          const displayScore = hasLevel2 && level2Score ? level2Score : assurance.globalScore;
          
          const getAssuranceBgClass = () => {
            switch (displayScore) {
              case "VERT": return "bg-score-green-bg border-score-green/30";
              case "ORANGE": return "bg-score-orange-bg border-score-orange/30";
              case "ROUGE": return "bg-score-red-bg border-score-red/30";
            }
          };

          const getScoreIcon = (score: "VERT" | "ORANGE" | "ROUGE") => {
            switch (score) {
              case "VERT": return <CheckCircle2 className="h-5 w-5 text-score-green" />;
              case "ORANGE": return <AlertCircle className="h-5 w-5 text-score-orange" />;
              case "ROUGE": return <XCircle className="h-5 w-5 text-score-red" />;
            }
          };

          const getComparisonStatusText = (status: string) => {
            switch (status) {
              case "OK": return "Cohérent";
              case "INCOMPLET": return "Incomplet";
              case "INCOHERENT": return "Incohérent";
              case "NON_DISPONIBLE": return "Non disponible";
              default: return status;
            }
          };

          const getComparisonStatusClass = (status: string) => {
            switch (status) {
              case "OK": return "text-score-green";
              case "INCOMPLET": return "text-score-orange";
              case "INCOHERENT": return "text-score-red";
              default: return "text-muted-foreground";
            }
          };

          const getDecennaleStatus = () => {
            if (hasLevel2 && analysis.attestation_comparison?.decennale) {
              const comp = analysis.attestation_comparison.decennale;
              if (comp.coherence_globale === "OK") return "Attestation cohérente avec le devis";
              if (comp.coherence_globale === "INCOHERENT") return "Incohérences détectées";
              return "Informations incomplètes";
            }
            if (assurance.decennale.mentionnee) {
              return "Mentionnée sur le devis";
            }
            return assurance.decennale.critique 
              ? "Non mentionnée (obligatoire pour ce type de travaux)"
              : "Non mentionnée sur le devis";
          };

          const getRcproStatus = () => {
            if (hasLevel2 && analysis.attestation_comparison?.rc_pro) {
              const comp = analysis.attestation_comparison.rc_pro;
              if (comp.coherence_globale === "OK") return "Attestation cohérente avec le devis";
              if (comp.coherence_globale === "INCOHERENT") return "Incohérences détectées";
              return "Informations incomplètes";
            }
            return assurance.rcpro.mentionnee 
              ? "Mentionnée sur le devis" 
              : "Non mentionnée sur le devis";
          };

          const getDecennaleScore = (): "VERT" | "ORANGE" | "ROUGE" => {
            if (hasLevel2 && analysis.attestation_comparison?.decennale) {
              const comp = analysis.attestation_comparison.decennale;
              if (comp.coherence_globale === "OK") return "VERT";
              if (comp.coherence_globale === "INCOHERENT") return "ROUGE";
              return "ORANGE";
            }
            return assurance.decennale.score;
          };

          const getRcproScore = (): "VERT" | "ORANGE" | "ROUGE" => {
            if (hasLevel2 && analysis.attestation_comparison?.rc_pro) {
              const comp = analysis.attestation_comparison.rc_pro;
              if (comp.coherence_globale === "OK") return "VERT";
              if (comp.coherence_globale === "INCOHERENT") return "ROUGE";
              return "ORANGE";
            }
            return assurance.rcpro.score;
          };

          return (
            <div className={`border rounded-xl p-6 mb-6 ${getAssuranceBgClass()}`}>
              <div className="flex items-start gap-4">
                <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="font-semibold text-foreground text-lg">Assurances</h2>
                    {getScoreIcon(displayScore)}
                  </div>
                  
                  {/* Source indicator */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      hasLevel2 
                        ? "bg-primary/10 text-primary" 
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {hasLevel2 ? (
                        <>
                          <FileCheck className="h-3 w-3 inline mr-1" />
                          Devis + Attestation
                        </>
                      ) : (
                        "Devis seul"
                      )}
                    </span>
                  </div>
                  
                  {/* Décennale */}
                  <div className="mb-4 p-3 bg-background/30 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-foreground">Garantie décennale</span>
                      {getScoreIcon(getDecennaleScore())}
                    </div>
                    <span className={`text-sm ${
                      getDecennaleScore() === "VERT" ? "text-score-green" :
                      getDecennaleScore() === "ORANGE" ? "text-score-orange" :
                      "text-score-red"
                    }`}>
                      {getDecennaleStatus()}
                    </span>
                    
                    {/* Level 2 details */}
                    {hasLevel2 && analysis.attestation_comparison?.decennale && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <p className="text-xs text-muted-foreground mb-1">Comparaison attestation ↔ devis :</p>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          <span>Entreprise :</span>
                          <span className={getComparisonStatusClass(analysis.attestation_comparison.decennale.nom_entreprise)}>
                            {getComparisonStatusText(analysis.attestation_comparison.decennale.nom_entreprise)}
                          </span>
                          <span>SIRET :</span>
                          <span className={getComparisonStatusClass(analysis.attestation_comparison.decennale.siret_siren)}>
                            {getComparisonStatusText(analysis.attestation_comparison.decennale.siret_siren)}
                          </span>
                          <span>Période validité :</span>
                          <span className={getComparisonStatusClass(analysis.attestation_comparison.decennale.periode_validite)}>
                            {getComparisonStatusText(analysis.attestation_comparison.decennale.periode_validite)}
                          </span>
                          <span>Activité couverte :</span>
                          <span className={getComparisonStatusClass(analysis.attestation_comparison.decennale.activite_couverte)}>
                            {getComparisonStatusText(analysis.attestation_comparison.decennale.activite_couverte)}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {assurance.decennale.critique && !assurance.decennale.mentionnee && !hasLevel2 && (
                      <p className="text-xs text-score-red mt-1">
                        La garantie décennale est obligatoire pour les travaux affectant la solidité ou la destination de l'ouvrage.
                      </p>
                    )}
                  </div>
                  
                  {/* RC Pro */}
                  <div className="mb-4 p-3 bg-background/30 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-foreground">RC Professionnelle</span>
                      {getScoreIcon(getRcproScore())}
                    </div>
                    <span className={`text-sm ${
                      getRcproScore() === "VERT" ? "text-score-green" :
                      getRcproScore() === "ORANGE" ? "text-score-orange" :
                      "text-score-red"
                    }`}>
                      {getRcproStatus()}
                    </span>
                    
                    {/* Level 2 details */}
                    {hasLevel2 && analysis.attestation_comparison?.rc_pro && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <p className="text-xs text-muted-foreground mb-1">Comparaison attestation ↔ devis :</p>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          <span>Entreprise :</span>
                          <span className={getComparisonStatusClass(analysis.attestation_comparison.rc_pro.nom_entreprise)}>
                            {getComparisonStatusText(analysis.attestation_comparison.rc_pro.nom_entreprise)}
                          </span>
                          <span>SIRET :</span>
                          <span className={getComparisonStatusClass(analysis.attestation_comparison.rc_pro.siret_siren)}>
                            {getComparisonStatusText(analysis.attestation_comparison.rc_pro.siret_siren)}
                          </span>
                          <span>Période validité :</span>
                          <span className={getComparisonStatusClass(analysis.attestation_comparison.rc_pro.periode_validite)}>
                            {getComparisonStatusText(analysis.attestation_comparison.rc_pro.periode_validite)}
                          </span>
                          <span>Activité couverte :</span>
                          <span className={getComparisonStatusClass(analysis.attestation_comparison.rc_pro.activite_couverte)}>
                            {getComparisonStatusText(analysis.attestation_comparison.rc_pro.activite_couverte)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Upload attestation component - only show if not already uploaded */}
                  {!hasLevel2 && (
                    <AttestationUpload 
                      analysisId={analysis.id}
                      quoteInfo={extractQuoteInfo(analysis)}
                      onUploadComplete={fetchAnalysis}
                    />
                  )}
                  
                  {/* Recommendation */}
                  {!hasLevel2 && (
                    <p className="text-sm text-muted-foreground mt-4">
                      Pour renforcer la vérification, nous vous recommandons de demander à l'artisan son attestation d'assurance à jour (PDF).
                    </p>
                  )}
                  
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground italic">
                      ℹ️ <strong>Analyse documentaire automatisée</strong> basée sur les documents fournis.
                      {hasLevel2 
                        ? " La vérification par attestation prévaut sur l'analyse du devis seul."
                        : " Les mentions d'assurance sur un devis indiquent une cohérence documentaire. Seule l'attestation d'assurance officielle fait foi."
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Mode de règlement - IBAN - Bloc dédié */}
        {(() => {
          const ibanInfo = extractIBANData(analysis);
          if (!ibanInfo) return null;
          
          const getIBANBgClass = () => {
            switch (ibanInfo.score) {
              case "VERT": return "bg-score-green-bg border-score-green/30";
              case "ORANGE": return "bg-score-orange-bg border-score-orange/30";
              case "ROUGE": return "bg-score-red-bg border-score-red/30";
            }
          };

          const getIBANIcon = () => {
            switch (ibanInfo.score) {
              case "VERT": return <CheckCircle2 className="h-6 w-6 text-score-green" />;
              case "ORANGE": return <AlertCircle className="h-6 w-6 text-score-orange" />;
              case "ROUGE": return <XCircle className="h-6 w-6 text-score-red" />;
            }
          };

          const getIBANStatusText = () => {
            if (!ibanInfo.hasIBAN) {
              return "Aucun IBAN détecté sur le devis";
            }
            if (ibanInfo.isValid === false) {
              return "IBAN non valide techniquement";
            }
            if (ibanInfo.isFrance) {
              return "IBAN valide - Domicilié en France";
            }
            return "IBAN valide - Domicilié à l'étranger";
          };

          const getIBANExplanation = () => {
            if (!ibanInfo.hasIBAN) {
              return "Aucun numéro IBAN n'a été détecté sur le devis. Si un paiement par virement est demandé, vérifiez les coordonnées bancaires directement avec l'artisan.";
            }
            if (ibanInfo.isValid === false) {
              return "L'IBAN mentionné sur le devis n'est pas valide techniquement. Cela peut indiquer une erreur de saisie ou un numéro erroné. Vérifiez ce point avec l'artisan avant tout paiement.";
            }
            if (ibanInfo.isFrance) {
              return "L'IBAN mentionné sur le devis est valide et domicilié en France. Cela correspond à la situation habituelle pour un artisan intervenant en France.";
            }
            return "L'IBAN mentionné sur le devis est valide mais domicilié à l'étranger. Pour un artisan intervenant en France, un compte bancaire français est plus habituel. Cela ne préjuge pas de la qualité du prestataire, mais mérite vérification.";
          };

          return (
            <div className={`border rounded-xl p-6 mb-6 ${getIBANBgClass()}`}>
              <div className="flex items-start gap-4">
                <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
                  <CreditCard className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="font-semibold text-foreground text-lg">Mode de règlement</h2>
                    {getIBANIcon()}
                  </div>
                  
                  <div className="mb-3">
                    <span className={`font-bold text-lg ${
                      ibanInfo.score === "VERT" ? "text-score-green" :
                      ibanInfo.score === "ORANGE" ? "text-score-orange" :
                      "text-score-red"
                    }`}>
                      {getIBANStatusText()}
                    </span>
                  </div>
                  
                  <p className="text-sm text-muted-foreground">
                    {getIBANExplanation()}
                  </p>
                  
                  {(ibanInfo.score === "ORANGE" || ibanInfo.score === "ROUGE") && (
                    <div className="mt-3 p-2 bg-background/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        💡 <strong>Recommandation</strong> : Nous vous recommandons de vérifier ce point avec l'artisan avant tout paiement.
                      </p>
                    </div>
                  )}
                  
                  <p className="text-xs text-muted-foreground/70 mt-3 italic">
                    Vérification technique de l'IBAN via l'API OpenIBAN. Cette analyse est purement factuelle et ne constitue pas un jugement.
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Points OK - Filtered to exclude reputation, RGE, QUALIBAT, Assurance and IBAN items */}
        {(() => {
          const filteredPoints = filterOutIBAN(filterOutAssurance(filterOutQualibat(filterOutRGE(filterOutReputation(analysis.points_ok || [])))));
          if (filteredPoints.length === 0) return null;
          
          return (
            <div className="bg-card border border-border rounded-xl p-6 mb-6 card-shadow">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-score-green" />
                Points conformes
              </h2>
              <ul className="space-y-3">
                {filteredPoints.map((point, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-score-green mt-0.5 flex-shrink-0" />
                    <span className="text-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

        {/* Alertes - Filtered to exclude reputation, RGE, QUALIBAT, Assurance and IBAN items */}
        {(() => {
          const filteredAlertes = filterOutIBAN(filterOutAssurance(filterOutQualibat(filterOutRGE(filterOutReputation(analysis.alertes || [])))));
          if (filteredAlertes.length === 0) return null;
          
          return (
            <div className="bg-card border border-border rounded-xl p-6 mb-6 card-shadow">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-score-orange" />
                Points de vigilance
              </h2>
              <ul className="space-y-3">
                {filteredAlertes.map((alerte, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-score-orange mt-0.5 flex-shrink-0" />
                    <span className="text-foreground">{alerte}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

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
        <div className="bg-muted/50 border border-border rounded-xl p-5 mb-8">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            ⚠️ Avertissement important
          </h3>
          <div className="text-xs text-muted-foreground space-y-2">
            <p>
              L'analyse fournie par VerifierMonDevis.fr est <strong className="text-foreground">automatisée</strong> et repose sur les informations figurant sur le devis transmis, des données publiques issues de sources administratives ou institutionnelles, et des moyennes de prix observées sur le marché.
            </p>
            <p>
              Cette analyse constitue une <strong className="text-foreground">aide à la décision</strong> et une <strong className="text-foreground">information indicative</strong>. Elle ne constitue ni un avis juridique, ni un conseil professionnel, ni une expertise technique.
            </p>
            <p>
              VerifierMonDevis.fr <strong className="text-foreground">n'évalue pas les artisans</strong> et ne porte aucun jugement sur leur probité ou leur compétence. Les résultats présentés ne sauraient se substituer à l'avis d'un professionnel du bâtiment ou à une vérification humaine approfondie.
            </p>
          </div>
        </div>

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
