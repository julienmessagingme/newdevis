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
  LineChart,
  CreditCard,
  UserPlus,
  Search,
  Download,
  FolderOpen,
} from "lucide-react";
import { Input } from "@/components/ui/input";
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

interface RegisteredUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  created_at: string;
  last_sign_in_at: string | null;
}

interface Subscriber {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  lifetime_analysis_count: number;
  subscribed_at: string;
  current_period_end: string | null;
}

interface UsersData {
  registered_users: RegisteredUser[];
  subscribers: Subscriber[];
  total_registered: number;
  total_subscribers: number;
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
  const [usersData, setUsersData] = useState<UsersData | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [recentDevis, setRecentDevis] = useState<Array<{ id: string; file_name: string; file_path: string; created_at: string; score: string | null; status: string }>>([]);
  const [devisLoading, setDevisLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const checkAdminAndFetchKPIs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/connexion?redirect=/admin";
        return;
      }

      // Check admin role directly
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleData) {
        setError("Accès réservé aux administrateurs");
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(true);

      // Fetch KPIs, users and devis in parallel
      fetchUsers();
      fetchRecentDevis();
      const { data, error } = await supabase.functions.invoke("admin-kpis");

      if (error) {
        throw error;
      }

      setKpis(data);
    } catch (err) {
      console.error("Error:", err);
      setError("Erreur lors du chargement des KPIs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) throw new Error("Erreur API");
      const data = await res.json();
      setUsersData(data);
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchRecentDevis = async () => {
    setDevisLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/devis", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Erreur API");
      const data = await res.json();
      setRecentDevis(data.devis ?? []);
    } catch (err) {
      console.error("Error fetching devis:", err);
    } finally {
      setDevisLoading(false);
    }
  };

  const downloadFile = async (fileId: string, filePath: string) => {
    setDownloadingId(fileId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/signed-url", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ filePath }),
      });
      const data = await res.json();
      if (!res.ok || !data.signedUrl) {
        alert(data.error ?? "Impossible de générer le lien");
        return;
      }
      window.open(data.signedUrl, "_blank");
    } catch {
      alert("Erreur réseau");
    } finally {
      setDownloadingId(null);
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

  if (!isAdmin) {
    const handleLogoutAndReconnect = async () => {
      await supabase.auth.signOut();
      window.location.href = "/connexion?redirect=/admin";
    };

    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md p-8">
          <div className="w-16 h-16 bg-score-red/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <XCircle className="h-8 w-8 text-score-red" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Accès refusé</h1>
          <p className="text-muted-foreground mb-6">
            Cette page est réservée aux administrateurs de VerifierMonDevis.fr
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Vous êtes peut-être connecté avec un compte anonyme. Déconnectez-vous puis reconnectez-vous avec votre compte admin.
          </p>
          <div className="flex gap-3 justify-center">
            <a href="/">
              <Button variant="outline">Retour à l'accueil</Button>
            </a>
            <Button onClick={handleLogoutAndReconnect}>
              <LogOut className="h-4 w-4 mr-2" />
              Se connecter en admin
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!kpis) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md p-8">
          <div className="w-16 h-16 bg-score-orange/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-8 w-8 text-score-orange" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Erreur de chargement</h1>
          <p className="text-muted-foreground mb-6">
            {error || "Impossible de charger les KPIs administrateur."}
          </p>
          <Button onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Chargement..." : "Réessayer"}
          </Button>
        </div>
      </div>
    );
  }

  const totalScored = kpis.scoring.score_vert + kpis.scoring.score_orange + kpis.scoring.score_rouge;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <a href="/" className="flex items-center gap-2 sm:gap-3">
            <img
              alt="VerifierMonDevis.fr"
              className="h-12 w-12 sm:h-16 sm:w-16 object-contain drop-shadow-md"
              src="/images/logo detouré.png"
              width={64}
              height={64}
            />
            <span className="text-base sm:text-2xl font-bold leading-none">
              <span className="text-foreground">VerifierMon</span><span className="text-orange-500">Devis</span><span className="text-sm sm:text-lg font-semibold text-orange-500">.fr</span>
            </span>
            <span className="ml-2 px-2 py-0.5 bg-primary text-primary-foreground text-xs font-medium rounded">
              Admin
            </span>
          </a>

          <div className="flex items-center gap-2">
            <a href="/admin/blog">
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4 mr-2" />
                Blog
              </Button>
            </a>
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

        {/* === SECTION 5: UTILISATEURS INSCRITS === */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Utilisateurs inscrits
            {usersData && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({usersData.total_registered})
              </span>
            )}
          </h2>

          {usersLoading ? (
            <Card>
              <CardContent className="py-8 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Chargement...</span>
              </CardContent>
            </Card>
          ) : usersData ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher par email ou nom..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-9 max-w-sm"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Email</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Nom</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Téléphone</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Inscription</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Dernière connexion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersData.registered_users
                        .filter(u => {
                          if (!userSearch) return true;
                          const s = userSearch.toLowerCase();
                          return (
                            u.email?.toLowerCase().includes(s) ||
                            u.first_name?.toLowerCase().includes(s) ||
                            u.last_name?.toLowerCase().includes(s)
                          );
                        })
                        .slice(0, 50)
                        .map(u => (
                          <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2 px-3 font-mono text-xs">{u.email}</td>
                            <td className="py-2 px-3">
                              {u.first_name || u.last_name
                                ? `${u.first_name} ${u.last_name}`.trim()
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="py-2 px-3 text-xs">
                              {u.phone || <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="py-2 px-3 text-xs text-muted-foreground">
                              {new Date(u.created_at).toLocaleDateString("fr-FR")}
                            </td>
                            <td className="py-2 px-3 text-xs text-muted-foreground">
                              {u.last_sign_in_at
                                ? new Date(u.last_sign_in_at).toLocaleDateString("fr-FR")
                                : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {usersData.registered_users.filter(u => {
                    if (!userSearch) return true;
                    const s = userSearch.toLowerCase();
                    return u.email?.toLowerCase().includes(s) || u.first_name?.toLowerCase().includes(s) || u.last_name?.toLowerCase().includes(s);
                  }).length > 50 && (
                    <p className="text-xs text-muted-foreground mt-3 text-center">
                      50 premiers résultats affichés — affiner la recherche pour voir plus
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </section>

        {/* === SECTION 6: ABONNÉS PASS SÉRÉNITÉ === */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Abonnés Pass Sérénité
            {usersData && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({usersData.total_subscribers})
              </span>
            )}
          </h2>

          {usersLoading ? (
            <Card>
              <CardContent className="py-8 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Chargement...</span>
              </CardContent>
            </Card>
          ) : usersData && usersData.subscribers.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un abonné..."
                    value={subscriberSearch}
                    onChange={(e) => setSubscriberSearch(e.target.value)}
                    className="pl-9 max-w-sm"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Email</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Nom</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Statut</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Analyses</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Souscription</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Fin période</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersData.subscribers
                        .filter(s => {
                          if (!subscriberSearch) return true;
                          const q = subscriberSearch.toLowerCase();
                          return (
                            s.email?.toLowerCase().includes(q) ||
                            s.first_name?.toLowerCase().includes(q) ||
                            s.last_name?.toLowerCase().includes(q)
                          );
                        })
                        .map(s => (
                          <tr key={s.user_id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2 px-3 font-mono text-xs">{s.email}</td>
                            <td className="py-2 px-3">
                              {s.first_name || s.last_name
                                ? `${s.first_name} ${s.last_name}`.trim()
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="py-2 px-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                s.status === "active"
                                  ? "bg-score-green/10 text-score-green"
                                  : s.status === "trial"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-score-orange/10 text-score-orange"
                              }`}>
                                {s.status === "active" ? "Actif" : s.status === "trial" ? "Essai" : s.status === "inactive" ? "Inactif" : "Impayé"}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center font-medium">{s.lifetime_analysis_count}</td>
                            <td className="py-2 px-3 text-xs text-muted-foreground">
                              {new Date(s.subscribed_at).toLocaleDateString("fr-FR")}
                            </td>
                            <td className="py-2 px-3 text-xs text-muted-foreground">
                              {s.current_period_end
                                ? new Date(s.current_period_end).toLocaleDateString("fr-FR")
                                : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : usersData ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Aucun abonné Pass Sérénité pour le moment
              </CardContent>
            </Card>
          ) : null}
        </section>

        {/* === SECTION 7: DERNIERS DEVIS === */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            30 derniers devis téléchargés
          </h2>

          {devisLoading ? (
            <Card>
              <CardContent className="py-8 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Chargement...</span>
              </CardContent>
            </Card>
          ) : recentDevis.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Fichier</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Score</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentDevis.map((d) => (
                        <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-2 px-4 font-mono text-xs max-w-xs truncate">{d.file_name ?? "—"}</td>
                          <td className="py-2 px-4">
                            {d.score === "VERT" && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">✅ Vert</span>}
                            {d.score === "ORANGE" && <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">⚠️ Orange</span>}
                            {d.score === "ROUGE" && <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">🔴 Rouge</span>}
                            {!d.score && <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="py-2 px-4 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(d.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="py-2 px-4 text-right">
                            {d.file_path ? (
                              <button
                                onClick={() => downloadFile(d.id, d.file_path)}
                                disabled={downloadingId === d.id}
                                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors disabled:opacity-50"
                              >
                                {downloadingId === d.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Download className="h-3 w-3" />}
                                Télécharger
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground">Indisponible</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Aucun devis trouvé
              </CardContent>
            </Card>
          )}
        </section>

        {/* === SECTION 8: LEGAL DISCLAIMER === */}
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
