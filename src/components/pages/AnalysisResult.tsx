import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { trackEvent } from "@/lib/amplitude";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Download,
  CheckCircle2,
  AlertCircle,
  XCircle,
  FileText,
  Loader2,
  RefreshCw,
  Lock,
  FilePlus2,
  Search,
  Building2,
  BarChart3,
  ShieldCheck,
  FileCheck
} from "lucide-react";
import { getScoreBadge } from "@/lib/scoreUtils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
// generatePdfReport chargé dynamiquement (jsPDF ~250 Ko évité au chargement initial)
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
  ExtractionIncompleteWarning,
  ConclusionIA,
} from "@/components/analysis";
import { PostSignatureTrackingSection } from "@/components/tracking";
const OcrDebugPanel = lazy(() => import("@/components/analysis/OcrDebugPanel").then(m => ({ default: m.OcrDebugPanel })));
import type { TravauxItem } from "@/components/analysis";
import StrategicBadge from "@/components/analysis/StrategicBadge";
import { useAnonymousAuth } from "@/hooks/useAnonymousAuth";
import { usePremium } from "@/hooks/usePremium";
import FunnelStepper from "@/components/funnel/FunnelStepper";
import PassSereniteGate from "@/components/funnel/PassSereniteGate";
import { ANALYSIS } from "@/lib/constants";
import { getVisibleBlocks } from "@/lib/domainConfig";

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
  domain?: string;
  conclusion_ia?: string | null;
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

/** Parse devis expiry date from raw_text JSON */
function parseDevisExpiry(rawText?: string | null): { expired: boolean; dateStr: string } | null {
  if (!rawText) return null;
  try {
    const parsed = JSON.parse(rawText);
    const dateValidite = parsed?.extracted?.dates?.date_validite;
    if (!dateValidite) return null;
    const dateObj = new Date(dateValidite);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expired = dateObj < today;
    const dateStr = dateObj.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    return { expired, dateStr };
  } catch {
    return null;
  }
}

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
  // Données financières brutes issues de verified.finances (data.economie.gouv.fr)
  finances: import("@/lib/entrepriseUtils").FinancialRatios[];
  finances_status: string;
  // Qualifications RGE (ADEME)
  rge_pertinent: boolean;
  rge_trouve: boolean;
  rge_qualifications: Array<{ nom: string; domaine?: string; date_fin?: string }>;
  // Certification QUALIBAT
  qualibat_mentionne: boolean;
  qualibat_verifie: boolean;
  qualibat_certifie: boolean | null;
  qualibat_qualifications: Array<{ code: string; libelle: string; date_fin?: string }>;
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
      finances: Array.isArray(verified?.finances) ? verified.finances : [],
      finances_status: verified?.finances_status || "skipped",
      rge_pertinent: verified?.rge_pertinent ?? false,
      rge_trouve: verified?.rge_trouve ?? false,
      rge_qualifications: Array.isArray(verified?.rge_qualifications) ? verified.rge_qualifications : [],
      qualibat_mentionne: verified?.qualibat_mentionne ?? false,
      qualibat_verifie: verified?.qualibat_verifie ?? false,
      qualibat_certifie: verified?.qualibat_certifie ?? null,
      qualibat_qualifications: Array.isArray(verified?.qualibat_qualifications) ? verified.qualibat_qualifications : [],
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

// ---- Pipeline progress config ----
const PIPELINE_STEPS = [
  { key: "[1/5]", label: "Téléchargement du fichier", icon: FileText, pct: 8 },
  { key: "[2/5]", label: "Extraction du document", icon: Search, pct: 30 },
  { key: "[2.5/5]", label: "Résumé des postes", icon: FileCheck, pct: 45 },
  { key: "[3/5]", label: "Vérifications entreprise", icon: Building2, pct: 60 },
  { key: "[4/5]", label: "Calcul du score", icon: BarChart3, pct: 80 },
  { key: "[5/5]", label: "Génération du rapport", icon: ShieldCheck, pct: 95 },
];

const WAITING_MESSAGES = [
  "Nos algorithmes inspectent chaque ligne de votre devis...",
  "Vérification de l'entreprise auprès des registres officiels...",
  "Comparaison avec les prix du marché en cours...",
  "Analyse des garanties et assurances...",
  "C'est bientôt fini, on y est presque !",
  "Encore quelques secondes de patience...",
  "On peaufine les derniers détails du rapport...",
];

function parseStepFromMessage(msg?: string | null): number {
  if (!msg) return 0;
  for (let i = PIPELINE_STEPS.length - 1; i >= 0; i--) {
    if (msg.startsWith(PIPELINE_STEPS[i].key)) return i;
  }
  return 0;
}

const AnalysisResult = () => {
  const id = window.location.pathname.split('/').pop();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  // Raw conclusion_ia JSON received from ConclusionIA once generated (may arrive after initial render)
  const [conclusionIaLive, setConclusionIaLive] = useState<string | null>(null);
  const [showTrustpilotModal, setShowTrustpilotModal] = useState(false);
  const { user: authUser, isAnonymous: rawIsAnonymous, isPermanent: rawIsPermanent, loading: authLoading, convertToPermanent } = useAnonymousAuth();
  const { isPremium, lifetimeAnalysisCount } = usePremium();

  // Preview mode: ?preview=gate forces anonymous view for testing
  const searchParams = new URLSearchParams(window.location.search);
  const previewGate = searchParams.get("preview") === "gate";
  const isAnonymous = previewGate || rawIsAnonymous;
  const isPermanent = previewGate ? false : rawIsPermanent;

  // Retour chantier — si l'analyse a été ouverte depuis un lot/chantier
  const fromChantier = searchParams.get("from") === "chantier";
  const chantierId = searchParams.get("chantierId");
  const backHref = fromChantier && chantierId
    ? `/mon-chantier/${chantierId}`
    : isPermanent ? "/tableau-de-bord" : "/";
  const backLabel = fromChantier && chantierId
    ? "Retour au chantier"
    : isPermanent ? "Retour au tableau de bord" : "Retour à l'accueil";

  const handleAuthConversion = () => {
    window.location.reload();
  };

  // Check admin role once auth is resolved
  useEffect(() => {
    if (authLoading) return;
    if (!authUser || rawIsAnonymous) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authUser.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => { if (data) setIsAdmin(true); });
  }, [authUser, authLoading, rawIsAnonymous]);

  const fetchAnalysis = useCallback(async () => {
    if (!id) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return;
    }

    // Admin check inline — admins can view any analysis regardless of owner
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    const isAdminFetch = !!roleData;
    if (isAdminFetch) setIsAdmin(true);

    // Check for pending ownership transfer (user logged into existing account after anonymous analysis)
    const pendingRaw = localStorage.getItem("pendingAnalysisTransfer");
    if (pendingRaw) {
      try {
        const pending = JSON.parse(pendingRaw);
        if (pending.analysisId === id && pending.fromUserId !== user.id) {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;
          if (token) {
            const res = await fetch("/api/transfer-analysis", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                analysisId: pending.analysisId,
                fromUserId: pending.fromUserId,
              }),
            });
            if (res.ok) {
              console.log("Analysis ownership transferred successfully");
            }
          }
        }
      } catch {
        // Ignore parse/transfer errors — will fall through to normal fetch
      } finally {
        localStorage.removeItem("pendingAnalysisTransfer");
      }
    }

    // Admins bypass the user_id ownership filter
    const query = supabase.from("analyses").select("*").eq("id", id);
    const { data, error } = await (isAdminFetch ? query : query.eq("user_id", user.id)).single();

    if (error || !data) {
      toast.error("Analyse non trouvée");
      window.location.href = isAdminFetch ? "/admin" : backHref;
      return;
    }

    setAnalysis(data as unknown as Analysis);
    setLoading(false);
  }, [id, isPermanent]);

  // Track analysis_viewed once analysis is completed
  useEffect(() => {
    if (!analysis || analysis.status !== "completed") return;
    trackEvent('analysis_viewed', {
      analysis_id: id,
      domain: (analysis as any).domain ?? 'travaux',
    });
  }, [analysis, id]);

  // Show Trustpilot modal 5s after analysis is loaded (skip if already dismissed)
  useEffect(() => {
    if (!analysis || analysis.status !== "completed") return;
    if (localStorage.getItem("trustpilot-dismissed")) return;
    const timer = setTimeout(() => setShowTrustpilotModal(true), 5000);
    return () => clearTimeout(timer);
  }, [analysis]);

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
  const visibleBlocks = useMemo(() => getVisibleBlocks(analysis?.domain || "travaux"), [analysis?.domain]);

  // Effective score — takes the worst of analysis.score (entreprise) and ConclusionIA verdict (prix marché).
  // ConclusionIA can only make the score worse, never better — prevents "Feu Vert" header
  // contradicting "À négocier" verdict below.
  // conclusionIaLive takes priority: it is set via onVerdictReady callback once ConclusionIA
  // finishes generating, even when analysis.conclusion_ia was null at page load time.
  const effectiveScore = useMemo(() => {
    if (!analysis) return null;
    const RANK: Record<string, number> = { VERT: 0, ORANGE: 1, ROUGE: 2 };
    const VERDICT_TO_SCORE: Record<string, string> = {
      signer:                  "VERT",
      signer_avec_negociation: "ORANGE",
      ne_pas_signer:           "ROUGE",
    };
    const baseScore = analysis.score ?? "VERT";
    const rawToCheck = conclusionIaLive ?? analysis.conclusion_ia;
    try {
      if (rawToCheck) {
        const parsed = JSON.parse(rawToCheck);
        const conclusionScore = VERDICT_TO_SCORE[parsed?.verdict ?? ""] ?? null;
        if (conclusionScore && (RANK[conclusionScore] ?? 0) > (RANK[baseScore] ?? 0)) {
          return conclusionScore;
        }
      }
    } catch { /* ignore parse errors */ }
    return baseScore;
  }, [analysis, conclusionIaLive]);

  // ---- Waiting message rotation (must be before any conditional return) ----
  const [waitingMsgIdx, setWaitingMsgIdx] = useState(0);
  const waitingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (analysis?.status === "pending" || analysis?.status === "processing") {
      waitingIntervalRef.current = setInterval(() => {
        setWaitingMsgIdx((prev) => (prev + 1) % WAITING_MESSAGES.length);
      }, 4000);
    } else if (waitingIntervalRef.current) {
      clearInterval(waitingIntervalRef.current);
    }
    return () => {
      if (waitingIntervalRef.current) clearInterval(waitingIntervalRef.current);
    };
  }, [analysis?.status]);

  // ---- Stuck detection: if step hasn't changed for 3 min, show error ----
  const STUCK_TIMEOUT_MS = 3 * 60 * 1000;
  const [isStuck, setIsStuck] = useState(false);
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (analysis?.status !== "pending" && analysis?.status !== "processing") {
      setIsStuck(false);
      if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
      return;
    }
    // Reset timer each time the step message changes
    setIsStuck(false);
    if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
    stuckTimerRef.current = setTimeout(() => setIsStuck(true), STUCK_TIMEOUT_MS);
    return () => {
      if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
    };
  }, [analysis?.status, analysis?.error_message]);

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
          <a href={backHref}>
            <Button variant="outline" size="lg">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {backLabel}
            </Button>
          </a>
        </div>
      </div>
    );
  }

  if (analysis.status === "pending" || analysis.status === "processing") {
    const currentStepIdx = parseStepFromMessage(analysis.error_message);
    const currentStep = PIPELINE_STEPS[currentStepIdx];
    const progressPct = currentStep?.pct ?? 5;
    const StepIcon = currentStep?.icon ?? Loader2;

    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-card border-b border-border">
          <div className="container flex h-16 items-center justify-between">
            <a href="/" className="flex items-center gap-2 sm:gap-3">
              <img
                alt="VerifierMonDevis.fr"
                className="h-12 w-12 sm:h-16 sm:w-16 object-contain drop-shadow-md"
                src="/images/logo-detoure.webp"
                width={64}
                height={64}
              />
              <span className="text-base sm:text-2xl font-bold leading-none">
                <span className="text-foreground">VerifierMon</span><span className="text-orange-500">Devis</span><span className="text-sm sm:text-lg font-semibold text-orange-500">.fr</span>
              </span>
            </a>
          </div>
        </header>
        <main className="container py-12 max-w-lg text-center">
          {/* Tapis roulant d'outils */}
          <div className="w-full rounded-xl overflow-hidden border border-primary/20 mb-8">
            <div className="overflow-hidden bg-primary/10 py-3">
              <div className="tools-ticker flex gap-5 text-3xl whitespace-nowrap w-max">
                {["🔨","🪚","🔧","🪛","🔩","📐","📏","🧰","🪣","💡","🔌","🪜","🧱","🔍","📋",
                  "🔨","🪚","🔧","🪛","🔩","📐","📏","🧰","🪣","💡","🔌","🪜","🧱","🔍","📋"
                ].map((tool, i) => (
                  <span key={i} className="flex-shrink-0">{tool}</span>
                ))}
              </div>
            </div>
            <div className="py-3 px-4 bg-primary/5">
              <p className="font-semibold text-foreground text-sm">Analyse en cours, patience !</p>
              <p className="text-xs text-muted-foreground mt-0.5" key={waitingMsgIdx}>
                {WAITING_MESSAGES[waitingMsgIdx]}
              </p>
            </div>
          </div>

          {/* Current step label */}
          <p className="text-base font-medium text-primary mb-4">
            {currentStep?.label ?? "Initialisation..."}
          </p>

          {/* Progress bar */}
          <div className="w-full bg-muted rounded-full h-3 mb-2 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mb-6">{progressPct}%</p>

          {/* Pipeline steps */}
          <div className="flex flex-col gap-2 text-left mb-6">
            {PIPELINE_STEPS.map((step, i) => {
              const done = i < currentStepIdx;
              const active = i === currentStepIdx;
              const Icon = step.icon;
              return (
                <div
                  key={step.key}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-500 ${
                    active ? "bg-primary/10 text-primary font-medium" : done ? "text-muted-foreground" : "text-muted-foreground/40"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  ) : (
                    <Icon className="h-4 w-4 shrink-0" />
                  )}
                  <span className="text-sm">{step.label}</span>
                </div>
              );
            })}
          </div>

          {isStuck ? (
            <div className="mt-4 p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-left">
              <p className="text-sm font-semibold text-destructive mb-1">L'analyse est bloquée</p>
              <p className="text-xs text-muted-foreground mb-3">
                Le service d'IA n'a pas répondu à temps. Relancez une nouvelle analyse avec le même fichier.
              </p>
              <Button
                size="sm"
                variant="destructive"
                onClick={async () => {
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session?.access_token && id) {
                      await fetch(`/api/analyse/${id}/mark-failed`, {
                        method: "POST",
                        headers: { "Authorization": `Bearer ${session.access_token}` },
                      }).catch(() => {});
                    }
                  } finally {
                    window.location.href = "/nouvelle-analyse";
                  }
                }}
              >
                <RefreshCw className="h-3 w-3 mr-2" />
                Nouvelle analyse
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/50">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Mise à jour automatique
            </div>
          )}
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

  // Extract scoring criteria for the interpretation section
  const criteresRouges: string[] = (() => {
    try {
      const parsed = JSON.parse(analysis.raw_text || "");
      return parsed?.scoring?.criteres_rouges ?? [];
    } catch { return []; }
  })();

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
    {/* Pass Sérénité gate: block results if 6+ analyses and not premium */}
    {lifetimeAnalysisCount > 5 && !isPremium && !isAnonymous && !isAdmin ? (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-card border-b border-border">
          <div className="container flex h-16 items-center justify-between">
            <a href="/" className="flex items-center gap-2 sm:gap-3">
              <img alt="VerifierMonDevis.fr" className="h-12 w-12 sm:h-16 sm:w-16 object-contain drop-shadow-md" src="/images/logo-detoure.webp" width={64} height={64} />
              <span className="text-base sm:text-2xl font-bold leading-none">
                <span className="text-foreground">VerifierMon</span><span className="text-orange-500">Devis</span><span className="text-sm sm:text-lg font-semibold text-orange-500">.fr</span>
              </span>
            </a>
          </div>
        </header>
        <main className="container py-8 max-w-4xl">
          <a href={backHref} className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </a>
          <PassSereniteGate analysisCount={lifetimeAnalysisCount} />
        </main>
      </div>
    ) : (
    <>
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <a href="/" className="flex items-center gap-2 sm:gap-3">
            <img
              alt="VerifierMonDevis.fr"
              className="h-12 w-12 sm:h-16 sm:w-16 object-contain drop-shadow-md"
              src="/images/logo-detoure.webp"
              width={64}
              height={64}
            />
            <span className="text-base sm:text-2xl font-bold leading-none">
              <span className="text-foreground">VerifierMon</span><span className="text-orange-500">Devis</span><span className="text-sm sm:text-lg font-semibold text-orange-500">.fr</span>
            </span>
          </a>
          <div className="flex items-center gap-2">
            {!isPremium && (
              <a href="/pass-serenite" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition-all text-sm font-semibold text-white shadow-sm">
                Pass Sérénité
              </a>
            )}
            <Button variant="outline" size="sm" onClick={() => window.location.href = "/nouvelle-analyse"} className="px-2 sm:px-3">
              <FilePlus2 className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Analyser un autre devis</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (isPremium) {
                  const { generatePdfReport } = await import("@/utils/generatePdfReport");
                  generatePdfReport(analysis);
                } else {
                  toast.info("Le rapport PDF est disponible avec le Pass Sérénité", {
                    action: { label: "En savoir plus", onClick: () => { window.location.href = "/pass-serenite"; } },
                  });
                }
              }}
              className="px-2 sm:px-3"
            >
              {!isPremium && <Lock className="h-3.5 w-3.5 sm:mr-1" />}
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Télécharger le rapport</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-4xl">
        {/* Funnel Stepper */}
        <FunnelStepper currentStep={isPermanent ? 3 : 2} />

        <a href={backHref} className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </a>

        {/* ── Barre de contexte (compacte) ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 p-4 bg-card border border-border rounded-xl">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm text-foreground leading-tight truncate">{analysis.file_name}</p>
              <p className="text-xs text-muted-foreground">
                Analysé le {new Date(analysis.created_at).toLocaleDateString("fr-FR")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {getScoreBadge(effectiveScore, analysis.status)}
            <a
              href={`/comprendre-score?fromAnalysis=true&analysisId=${id}`}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 whitespace-nowrap"
            >
              Comprendre
            </a>
          </div>
        </div>

        {/* ── Score ROUGE — motifs critiques (si applicable) ── */}
        {effectiveScore === "ROUGE" && (() => {
          const criteresRougesTop: string[] = (() => {
            try { return JSON.parse(analysis.raw_text || "")?.scoring?.criteres_rouges ?? []; }
            catch { return []; }
          })();
          if (!criteresRougesTop.length) return null;
          return (
            <div className="flex items-start gap-3 p-4 mb-4 bg-red-50 border border-red-200 rounded-xl">
              <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800 text-sm mb-1">Anomalie(s) critique(s) détectée(s)</p>
                <ul className="space-y-0.5">
                  {criteresRougesTop.map((c, i) => (
                    <li key={i} className="text-xs text-red-700 flex items-start gap-1.5">
                      <span className="shrink-0 mt-0.5">•</span><span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })()}

        {/* ── Bannière analyse adaptée ── */}
        {isAdaptedAnalysis && <AdaptedAnalysisBanner mode={analysisMode} />}

        {/* ── Warning extraction incomplète (admin) ── */}
        <ExtractionIncompleteWarning analysisId={analysis.id} />

        {/* ── Devis expiré ── */}
        {(() => {
          const expiry = parseDevisExpiry(analysis.raw_text);
          if (!expiry || !expiry.expired) return null;
          return (
            <div className="flex items-start gap-3 p-4 mb-4 bg-amber-50 border border-amber-300 rounded-xl">
              <span className="text-xl flex-shrink-0">📅</span>
              <div>
                <p className="font-semibold text-amber-800 text-sm">Devis expiré</p>
                <p className="text-sm text-amber-700 mt-0.5">
                  Ce devis était valable jusqu'au <strong>{expiry.dateStr}</strong>. Demandez une confirmation de validité à l'artisan avant de signer.
                </p>
              </div>
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════════════════
            BLOC 1 — VERDICT EXPERT (premier bloc, above the fold)
        ══════════════════════════════════════════════════════ */}
        {visibleBlocks.includes("prix_marche") && cachedN8NData && (
          <ConclusionIA
            analysisId={analysis.id}
            conclusionIaRaw={analysis.conclusion_ia ?? null}
            onVerdictReady={(raw) => setConclusionIaLive(raw)}
          />
        )}

        {isAnonymous && (
          <div className="mb-6 flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-4 py-3">
            <Lock className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-sm font-medium text-primary">Analyse prix marché verrouillée — créez un compte pour y accéder</span>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            BLOC 2 — ENTREPRISE (fiabilité artisan)
        ══════════════════════════════════════════════════════ */}
        {visibleBlocks.includes("entreprise") && (
          <BlockEntreprise
            pointsOk={analysis.points_ok || []}
            alertes={analysis.alertes || []}
            companyData={companyData}
            defaultOpen={false}
          />
        )}

        {/* ══════════════════════════════════════════════════════
            BLOC 3 — DÉTAIL PRIX MARCHÉ (accordéon)
        ══════════════════════════════════════════════════════ */}
        {visibleBlocks.includes("prix_marche") && (
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
            currentUserId={authUser?.id}
          />
        )}

        {/* ══════════════════════════════════════════════════════
            BLOC 4 — SÉCURITÉ & CONDITIONS DE PAIEMENT
        ══════════════════════════════════════════════════════ */}
        {visibleBlocks.includes("securite") && (
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
        )}

        {/* ══════════════════════════════════════════════════════
            BLOC 5 — CONTEXTE DU CHANTIER
        ══════════════════════════════════════════════════════ */}
        {visibleBlocks.includes("contexte") && (
          <BlockContexte
            siteContext={analysis.site_context as any}
            pointsOk={analysis.points_ok || []}
            alertes={analysis.alertes || []}
            rawText={analysis.raw_text || null}
            workType={analysis.work_type || null}
            defaultOpen={false}
          />
        )}

        {/* Urbanisme & Formalités CERFA */}
        {visibleBlocks.includes("urbanisme") && (
          <BlockUrbanisme initialWorkType={analysis.work_type} />
        )}

        {/* Points conformes & vigilance résiduels */}
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

        {/* ══════════════════════════════════════════════════════
            BLOC 6 — INDICE STRATÉGIQUE (secondaire — bas de page)
        ══════════════════════════════════════════════════════ */}
        <div id="strategic-index">
          <StrategicBadge
            rawText={analysis.raw_text ?? null}
            isPremium={isPermanent || isAdmin}
            onAuthSuccess={handleAuthConversion}
            convertToPermanent={convertToPermanent}
            currentUserId={authUser?.id}
          />
        </div>

        {/* Suivi post-signature (permanent users) */}
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

        {/* OCR Debug Panel - Admin Only */}
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

        {/* Trustpilot Review Collector */}
        <div className="mb-8 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Votre analyse est prête 🎉 — votre avis nous aide à améliorer le service
          </p>
          <a
            href="https://fr.trustpilot.com/review/verifiermondevis.fr"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00b67a] hover:bg-[#00a06a] text-white font-semibold rounded-lg text-sm transition-colors shadow-sm"
          >
            ⭐ Laisser un avis sur Trustpilot
          </a>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href={isPermanent ? "/tableau-de-bord" : "/"}><Button variant="outline" size="lg"><ArrowLeft className="h-4 w-4 mr-2" />{isPermanent ? "Tableau de bord" : "Accueil"}</Button></a>
          <a href="/nouvelle-analyse"><Button size="lg">Analyser un autre devis</Button></a>
        </div>
      </main>
    </div>

    {/* Trustpilot Review Modal — appears 5s after analysis loads */}
    {showTrustpilotModal && (
      <div
        className="fixed inset-0 z-[9997] flex items-end sm:items-center justify-center p-4 bg-black/40"
        onClick={() => { localStorage.setItem("trustpilot-dismissed", "1"); setShowTrustpilotModal(false); }}
      >
        <div
          className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 relative"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => { localStorage.setItem("trustpilot-dismissed", "1"); setShowTrustpilotModal(false); }}
            className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors p-1"
            aria-label="Fermer"
          >
            <XCircle className="h-5 w-5" />
          </button>
          <div className="text-center mb-4">
            <div className="text-2xl mb-2">⭐</div>
            <h3 className="text-lg font-bold text-foreground mb-1">Votre avis compte !</h3>
            <p className="text-sm text-muted-foreground">
              Notre service vous a été utile ? Laissez-nous un avis sur Trustpilot — ça prend 30 secondes.
            </p>
          </div>
          <a
            href="https://fr.trustpilot.com/review/verifiermondevis.fr"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => { localStorage.setItem("trustpilot-dismissed", "1"); setShowTrustpilotModal(false); }}
            className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-[#00b67a] hover:bg-[#00a06a] text-white font-semibold rounded-lg text-sm transition-colors shadow-sm"
          >
            ⭐ Laisser un avis sur Trustpilot
          </a>
          <button
            onClick={() => { localStorage.setItem("trustpilot-dismissed", "1"); setShowTrustpilotModal(false); }}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-3 transition-colors"
          >
            Non merci
          </button>
        </div>
      </div>
    )}
    </>
    )}
    </ExtractionBlocker>
  );
};

export default AnalysisResult;
