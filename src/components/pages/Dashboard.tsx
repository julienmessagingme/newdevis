import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Plus,
  FileText,
  LogOut,
  User,
  Settings,
  Loader2,
  CheckCircle2,
  Shield,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getStatusIcon, getScoreBadge } from "@/lib/scoreUtils";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { usePremium } from "@/hooks/usePremium";

type Analysis = {
  id: string;
  file_name: string;
  score: string | null;
  status: string;
  created_at: string;
};

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

const ADMIN_EMAILS = ["julien@messagingme.fr", "bridey.johan@gmail.com"];

const Dashboard = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const trustpilotRef = useRef<HTMLDivElement>(null);
  const { isPremium, lifetimeAnalysisCount } = usePremium();

  // Garde de session : déconnexion après 10 min d'inactivité + détection nouvel onglet/navigateur
  useSessionGuard("/connexion");

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/connexion";
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
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        console.error("Error removing realtime channel:", e);
      }
    };
  }, []);

  // Initialize Trustpilot widget once analyses are loaded (with retry if script not yet ready)
  useEffect(() => {
    if (analyses.length === 0 || !trustpilotRef.current) return;
    const el = trustpilotRef.current;
    type TW = { Trustpilot?: { loadFromElement: (el: HTMLElement, force: boolean) => void } };
    const tryLoad = () => {
      const tp = (window as unknown as TW).Trustpilot;
      if (tp) { tp.loadFromElement(el, true); return true; }
      return false;
    };
    if (!tryLoad()) {
      setTimeout(() => { if (!tryLoad()) setTimeout(tryLoad, 2000); }, 1000);
    }
  }, [analyses]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    toast.success("Déconnexion réussie");
    window.location.href = "/";
  }, []);

  const firstName = useMemo(() => {
    const meta = user?.user_metadata;
    if (meta?.first_name) return meta.first_name;
    if (meta?.full_name) return meta.full_name.split(" ")[0];
    if (user?.email) return user.email.split("@")[0];
    return "Utilisateur";
  }, [user]);

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
          </a>

          <div className="flex items-center gap-2 sm:gap-4">
            <a href="/parametres">
              <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label="Paramètres">
                <Settings className="h-5 w-5" />
              </Button>
            </a>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
              <span className="hidden md:block text-sm font-medium">{firstName}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Se déconnecter">
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

        {/* Mon Chantier CTA — visible admins uniquement */}
        {ADMIN_EMAILS.includes(user?.email || "") && <a href="/mon-chantier" className="block mb-4">
          <div className="bg-gradient-to-r from-primary/10 to-blue-500/10 border border-primary/30 rounded-2xl p-5 hover:border-primary hover:shadow-sm transition-all duration-200 cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/15 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-200 text-2xl">
                🏗️
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold text-foreground">
                    Mon Chantier
                  </h2>
                  <span className="text-[10px] font-bold bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded-full leading-none">NOUVEAU</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Devis, budget, aides, journal — gérez votre projet de A à Z
                </p>
              </div>
            </div>
          </div>
        </a>}

        {/* Pass Sérénité CTA */}
        {!isPremium && (
          <a href="/pass-serenite" className="block mb-4">
            <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-300 rounded-2xl p-4 hover:border-orange-400 hover:shadow-sm transition-all duration-200 cursor-pointer group">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl flex items-center justify-center text-white text-lg">⭐</div>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Pass Sérénité — 4,99€/mois</h2>
                    <p className="text-xs text-muted-foreground">Analyses illimitées, rapport PDF, tri par travaux</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-3 py-1 rounded-full whitespace-nowrap">Découvrir →</span>
              </div>
            </div>
          </a>
        )}

        {/* Quick Action */}
        <a href="/nouvelle-analyse" className="block mb-8">
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
                  Téléchargez un devis PDF ou photo pour obtenir votre score
                </p>
              </div>
            </div>
          </div>
        </a>

        {/* Analyses List */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-foreground">
              Mes analyses
            </h2>
            <div className="flex items-center gap-3">
              {isPremium ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Pass Sérénité
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {lifetimeAnalysisCount}/5 analyses utilisées
                </span>
              )}
            </div>
          </div>

          {analyses.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-xl">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-foreground mb-2">Aucune analyse</h3>
              <p className="text-muted-foreground mb-4">
                Commencez par télécharger votre premier devis
              </p>
              <a href="/nouvelle-analyse">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nouvelle analyse
                </Button>
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              {analyses.map((analysis) => (
                <a
                  key={analysis.id}
                  href={analysis.status === "completed" ? `/analyse/${analysis.id}` : "#"}
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
                        {getStatusIcon(analysis.score, analysis.status)}
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Trustpilot — bandeau d'invitation avis (si au moins 1 analyse) */}
        {analyses.length > 0 && (
          <div className="mt-8 p-5 bg-card border border-border rounded-xl text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Notre service vous est utile ? Votre avis nous aide à nous améliorer 🙏
            </p>
            <div
              ref={trustpilotRef}
              className="trustpilot-widget"
              data-locale="fr-FR"
              data-template-id="56278e9abfbbba0bdcd568bc"
              data-businessunit-id="69a6cc3942d8a24e56af1528"
              data-style-height="52px"
              data-style-width="100%"
              data-token="f49b09bf-811e-458a-bfe0-6a1df2cca869"
            >
              <a href="https://fr.trustpilot.com/review/verifiermondevis.fr" target="_blank" rel="noopener">
                Laisser un avis sur Trustpilot
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
