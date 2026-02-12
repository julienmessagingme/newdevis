import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { 
  Shield, 
  Users,
  FileText,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Bell,
  TrendingUp,
  Calendar,
  Loader2,
  LogOut,
  RefreshCw,
  Clock,
  Building2,
  LineChart
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AnalysesEvolutionChart,
  ScoreEvolutionChart,
  ScoreDistributionPieChart,
  UsersEvolutionChart,
} from "@/components/admin/AdminCharts";

interface EvolutionData {
  date?: string;
  week?: string;
  label: string;
  analyses: number;
  vert: number;
  orange: number;
  rouge: number;
  users: number;
}

interface ScoreDistribution {
  name: string;
  value: number;
  color: string;
}

interface KPIs {
  usage: {
    total_users: number;
    total_analyses: number;
    completed_analyses: number;
    pending_analyses: number;
    error_analyses: number;
    completion_rate: number;
    avg_analyses_per_user: number;
  };
  scoring: {
    score_vert: number;
    score_orange: number;
    score_rouge: number;
    pct_vert: number;
    pct_orange: number;
    pct_rouge: number;
  };
  tracking: {
    total_entries: number;
    consent_given: number;
    consent_rate: number;
    whatsapp_enabled: number;
    whatsapp_rate: number;
    signed_quotes: number;
    responses_received: number;
    status_completed: number;
    status_in_progress: number;
    status_delayed: number;
  };
  documents: {
    devis_travaux: number;
    devis_diagnostic: number;
    devis_prestation_technique: number;
    documents_refuses: number;
    total: number;
  };
  alerts: {
    total_alerts: number;
    avg_alerts_per_analysis: number;
    top_alerts: Array<{ category: string; count: number; percentage: number }>;
    analyses_without_critical: number;
    pct_without_critical: number;
  };
  time_analytics: {
    today: number;
    this_week: number;
    this_month: number;
  };
  charts: {
    evolution_daily: EvolutionData[];
    evolution_weekly: EvolutionData[];
    score_distribution: ScoreDistribution[];
  };
}

const Admin = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkAdminAndFetchKPIs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        window.location.href = "/connexion";
        return;
      }

      // Fetch KPIs from edge function (it handles admin check)
      const { data, error } = await supabase.functions.invoke("admin-kpis");

      if (error) {
        if (error.message?.includes("403") || error.message?.includes("Accès réservé")) {
          setError("Accès réservé aux administrateurs");
          setIsAdmin(false);
        } else {
          throw error;
        }
        return;
      }

      setIsAdmin(true);
      setKpis(data);
    } catch (err) {
      console.error("Error:", err);
      setError("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    checkAdminAndFetchKPIs();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    checkAdminAndFetchKPIs();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin || error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md p-8">
          <div className="w-16 h-16 bg-score-red/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <XCircle className="h-8 w-8 text-score-red" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Accès refusé</h1>
          <p className="text-muted-foreground mb-6">
            {error || "Cette page est réservée aux administrateurs de VerifierMonDevis.fr"}
          </p>
          <a href="/">
            <Button>Retour à l'accueil</Button>
          </a>
        </div>
      </div>
    );
  }

  if (!kpis) return null;

  const totalScored = kpis.scoring.score_vert + kpis.scoring.score_orange + kpis.scoring.score_rouge;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <span className="text-xl font-bold text-foreground">VerifierMonDevis.fr</span>
            <span className="ml-2 px-2 py-0.5 bg-primary text-primary-foreground text-xs font-medium rounded">
              Admin
            </span>
          </a>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
            <a href="/">
              <Button variant="ghost" size="icon">
                <LogOut className="h-5 w-5" />
              </Button>
            </a>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Tableau de bord administrateur</h1>
          <p className="text-muted-foreground">Suivi d'activité et indicateurs anonymisés</p>
        </div>

        {/* === SECTION 1: KPIs D'USAGE === */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            KPIs d'usage
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Utilisateurs uniques</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{kpis.usage.total_users}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Devis déposés</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{kpis.usage.total_analyses}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Analyses réussies</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-score-green">{kpis.usage.completed_analyses}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Taux de complétion</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{kpis.usage.completion_rate}%</p>
                <Progress value={kpis.usage.completion_rate} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Moyenne / utilisateur</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{kpis.usage.avg_analyses_per_user}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>En erreur</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-score-red">{kpis.usage.error_analyses}</p>
              </CardContent>
            </Card>
          </div>

          {/* Time-based analytics */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <Card className="bg-primary/5">
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Aujourd'hui</p>
                  <p className="text-2xl font-bold text-foreground">{kpis.time_analytics.today}</p>
                </div>
                <Calendar className="h-8 w-8 text-primary/50" />
              </CardContent>
            </Card>
            <Card className="bg-primary/5">
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Cette semaine</p>
                  <p className="text-2xl font-bold text-foreground">{kpis.time_analytics.this_week}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-primary/50" />
              </CardContent>
            </Card>
            <Card className="bg-primary/5">
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Ce mois</p>
                  <p className="text-2xl font-bold text-foreground">{kpis.time_analytics.this_month}</p>
                </div>
                <BarChart3 className="h-8 w-8 text-primary/50" />
              </CardContent>
            </Card>
          </div>
        </section>

        {/* === SECTION: GRAPHIQUES D'ÉVOLUTION === */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <LineChart className="h-5 w-5 text-primary" />
            Évolution temporelle
          </h2>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <AnalysesEvolutionChart 
              evolutionDaily={kpis.charts.evolution_daily} 
              evolutionWeekly={kpis.charts.evolution_weekly} 
            />
            <UsersEvolutionChart 
              evolutionDaily={kpis.charts.evolution_daily} 
              evolutionWeekly={kpis.charts.evolution_weekly} 
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <ScoreEvolutionChart 
              evolutionDaily={kpis.charts.evolution_daily} 
              evolutionWeekly={kpis.charts.evolution_weekly} 
            />
            <ScoreDistributionPieChart 
              scoreDistribution={kpis.charts.score_distribution} 
            />
          </div>
        </section>

        {/* === SECTION 2: KPIs DE SCORING === */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            KPIs de scoring
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Score distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Répartition des scores</CardTitle>
                <CardDescription>Distribution FEU VERT / ORANGE / ROUGE</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 w-32">
                      <CheckCircle2 className="h-5 w-5 text-score-green" />
                      <span className="text-sm font-medium">FEU VERT</span>
                    </div>
                    <div className="flex-1">
                      <Progress 
                        value={kpis.scoring.pct_vert} 
                        className="h-4"
                        style={{ 
                          ["--progress-background" as string]: "hsl(var(--score-green))"
                        }}
                      />
                    </div>
                    <span className="text-sm font-bold w-20 text-right">
                      {kpis.scoring.score_vert} ({kpis.scoring.pct_vert}%)
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 w-32">
                      <AlertCircle className="h-5 w-5 text-score-orange" />
                      <span className="text-sm font-medium">FEU ORANGE</span>
                    </div>
                    <div className="flex-1">
                      <Progress 
                        value={kpis.scoring.pct_orange} 
                        className="h-4"
                        style={{ 
                          ["--progress-background" as string]: "hsl(var(--score-orange))"
                        }}
                      />
                    </div>
                    <span className="text-sm font-bold w-20 text-right">
                      {kpis.scoring.score_orange} ({kpis.scoring.pct_orange}%)
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 w-32">
                      <XCircle className="h-5 w-5 text-score-red" />
                      <span className="text-sm font-medium">FEU ROUGE</span>
                    </div>
                    <div className="flex-1">
                      <Progress 
                        value={kpis.scoring.pct_rouge} 
                        className="h-4"
                        style={{ 
                          ["--progress-background" as string]: "hsl(var(--score-red))"
                        }}
                      />
                    </div>
                    <span className="text-sm font-bold w-20 text-right">
                      {kpis.scoring.score_rouge} ({kpis.scoring.pct_rouge}%)
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Total analysé : <strong className="text-foreground">{totalScored}</strong> devis
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Alerts analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Principaux critères déclencheurs</CardTitle>
                <CardDescription>Classement par fréquence d'apparition</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {kpis.alerts.top_alerts.length > 0 ? (
                    kpis.alerts.top_alerts.map((alert, index) => (
                      <div key={alert.category} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-muted-foreground w-6">
                          #{index + 1}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{alert.category}</span>
                            <span className="text-xs text-muted-foreground">{alert.count}x</span>
                          </div>
                          <Progress value={alert.percentage} className="h-2" />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Aucune donnée disponible</p>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-border grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Moyenne alertes/devis</p>
                    <p className="text-lg font-bold text-foreground">{kpis.alerts.avg_alerts_per_analysis}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sans critère critique</p>
                    <p className="text-lg font-bold text-score-green">{kpis.alerts.pct_without_critical}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* === SECTION 3: KPIs DOCUMENTS === */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            KPIs documents
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <CardDescription>Devis travaux</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{kpis.documents.devis_travaux}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {kpis.documents.total > 0 
                    ? Math.round((kpis.documents.devis_travaux / kpis.documents.total) * 100)
                    : 0}% du total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <CardDescription>Diagnostics immobiliers</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{kpis.documents.devis_diagnostic}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {kpis.documents.total > 0 
                    ? Math.round((kpis.documents.devis_diagnostic / kpis.documents.total) * 100)
                    : 0}% du total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <CardDescription>Prestations techniques</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{kpis.documents.devis_prestation_technique}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {kpis.documents.total > 0 
                    ? Math.round((kpis.documents.devis_prestation_technique / kpis.documents.total) * 100)
                    : 0}% du total
                </p>
              </CardContent>
            </Card>

            <Card className="border-score-red/30">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-score-red" />
                  <CardDescription>Documents refusés</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-score-red">{kpis.documents.documents_refuses}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Factures + non conformes
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* === SECTION 4: KPIs BUSINESS & ENGAGEMENT === */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            KPIs business & engagement
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Consent & Communication */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Consentement & communication</CardTitle>
                <CardDescription>Suivi post-signature</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-accent/50 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Taux consentement</p>
                    <p className="text-2xl font-bold text-foreground">{kpis.tracking.consent_rate}%</p>
                    <p className="text-xs text-muted-foreground">
                      {kpis.tracking.consent_given} / {kpis.tracking.total_entries}
                    </p>
                  </div>

                  <div className="bg-accent/50 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Activation WhatsApp</p>
                    <p className="text-2xl font-bold text-foreground">{kpis.tracking.whatsapp_rate}%</p>
                    <p className="text-xs text-muted-foreground">
                      {kpis.tracking.whatsapp_enabled} utilisateurs
                    </p>
                  </div>

                  <div className="bg-accent/50 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Devis signés</p>
                    <p className="text-2xl font-bold text-score-green">{kpis.tracking.signed_quotes}</p>
                  </div>

                  <div className="bg-accent/50 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Réponses reçues</p>
                    <p className="text-2xl font-bold text-foreground">{kpis.tracking.responses_received}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Work Status (declarative) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Statut des travaux (déclaratif)</CardTitle>
                <CardDescription>Réponses utilisateurs sur l'avancement</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 flex-1">
                      <CheckCircle2 className="h-5 w-5 text-score-green" />
                      <span className="text-sm font-medium">Travaux terminés</span>
                    </div>
                    <span className="text-lg font-bold text-score-green">
                      {kpis.tracking.status_completed}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 flex-1">
                      <Clock className="h-5 w-5 text-score-orange" />
                      <span className="text-sm font-medium">En cours</span>
                    </div>
                    <span className="text-lg font-bold text-score-orange">
                      {kpis.tracking.status_in_progress}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 flex-1">
                      <AlertCircle className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm font-medium">Non réalisés / Retard</span>
                    </div>
                    <span className="text-lg font-bold text-muted-foreground">
                      {kpis.tracking.status_delayed}
                    </span>
                  </div>
                </div>

                <div className="mt-6 p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    ⚠️ Ces données sont déclaratives et ne permettent pas de conclure 
                    à un manquement de l'artisan.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* === SECTION 5: LEGAL DISCLAIMER === */}
        <section className="mb-8">
          <div className="bg-muted/50 border border-border rounded-xl p-6">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Conformité et anonymisation
            </h3>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                • Toutes les données affichées sont <strong className="text-foreground">agrégées et anonymisées</strong>
              </p>
              <p>
                • Aucun KPI ne permet d'identifier un artisan ou un client individuellement
              </p>
              <p>
                • Les statuts de travaux sont <strong className="text-foreground">déclaratifs</strong> et ne constituent pas un jugement
              </p>
              <p>
                • Ce tableau de bord est réservé à l'administrateur de la plateforme
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Admin;
