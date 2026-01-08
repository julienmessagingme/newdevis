import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  Shield, 
  Plus, 
  FileText, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  XCircle,
  LogOut,
  User,
  Settings,
  Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Analysis = {
  id: string;
  file_name: string;
  score: string | null;
  status: string;
  created_at: string;
};

const getScoreIcon = (score: string | null, status: string) => {
  if (status === "pending" || status === "processing") {
    return <Clock className="h-5 w-5 text-muted-foreground animate-pulse" />;
  }
  if (status === "error") {
    return <XCircle className="h-5 w-5 text-score-red" />;
  }
  switch (score) {
    case "VERT":
      return <CheckCircle2 className="h-5 w-5 text-score-green" />;
    case "ORANGE":
      return <AlertCircle className="h-5 w-5 text-score-orange" />;
    case "ROUGE":
      return <XCircle className="h-5 w-5 text-score-red" />;
    default:
      return <Clock className="h-5 w-5 text-muted-foreground" />;
  }
};

const getScoreBadge = (score: string | null, status: string) => {
  if (status === "pending" || status === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
        <span className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" />
        En cours
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-score-red-bg text-score-red-foreground">
        <span className="w-2 h-2 bg-score-red rounded-full" />
        Erreur
      </span>
    );
  }
  switch (score) {
    case "VERT":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-score-green-bg text-score-green-foreground">
          <span className="w-2 h-2 bg-score-green rounded-full" />
          Feu Vert
        </span>
      );
    case "ORANGE":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-score-orange-bg text-score-orange-foreground">
          <span className="w-2 h-2 bg-score-orange rounded-full" />
          Feu Orange
        </span>
      );
    case "ROUGE":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-score-red-bg text-score-red-foreground">
          <span className="w-2 h-2 bg-score-red rounded-full" />
          Feu Rouge
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
          <span className="w-2 h-2 bg-muted-foreground rounded-full" />
          -
        </span>
      );
  }
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/connexion");
        return;
      }
      setUser(user);
      
      // Fetch analyses
      const { data, error } = await supabase
        .from("analyses")
        .select("id, file_name, score, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching analyses:", error);
        toast.error("Erreur lors du chargement des analyses");
      } else {
        setAnalyses(data || []);
      }
      setLoading(false);
    };

    checkAuthAndFetch();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('analyses-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'analyses',
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setAnalyses(prev => 
              prev.map(a => a.id === payload.new.id ? { ...a, ...payload.new } : a)
            );
          } else if (payload.eventType === 'INSERT') {
            setAnalyses(prev => [payload.new as Analysis, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Déconnexion réussie");
    navigate("/");
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  };

  const firstName = user?.user_metadata?.first_name || "Utilisateur";

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
              <span className="hidden md:block text-sm font-medium">{firstName}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            Bonjour {firstName} 👋
          </h1>
          <p className="text-muted-foreground">
            Gérez vos analyses de devis et suivez leur évolution
          </p>
        </div>

        {/* Quick Action */}
        <Link to="/nouvelle-analyse" className="block mb-8">
          <div className="bg-card border-2 border-dashed border-primary/30 rounded-2xl p-6 hover:border-primary hover:bg-accent/50 transition-all duration-200 cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                <Plus className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Analyser un nouveau devis
                </h2>
                <p className="text-sm text-muted-foreground">
                  Téléversez un devis PDF ou photo pour obtenir votre score
                </p>
              </div>
            </div>
          </div>
        </Link>

        {/* Analyses List */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-foreground">
              Mes analyses
            </h2>
            <span className="text-sm text-muted-foreground">
              {analyses.length} devis analysé{analyses.length > 1 ? "s" : ""}
            </span>
          </div>

          {analyses.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-xl">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-foreground mb-2">Aucune analyse</h3>
              <p className="text-muted-foreground mb-4">
                Commencez par téléverser votre premier devis
              </p>
              <Link to="/nouvelle-analyse">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nouvelle analyse
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {analyses.map((analysis) => (
                <Link 
                  key={analysis.id} 
                  to={analysis.status === "completed" ? `/analyse/${analysis.id}` : "#"}
                  className={`block ${analysis.status !== "completed" ? "cursor-wait" : ""}`}
                >
                  <div className="bg-card border border-border rounded-xl p-4 md:p-6 card-shadow hover:card-shadow-lg transition-all duration-200">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center flex-shrink-0">
                          <FileText className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-foreground truncate">
                            {analysis.file_name}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(analysis.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {getScoreBadge(analysis.score, analysis.status)}
                        {getScoreIcon(analysis.score, analysis.status)}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
