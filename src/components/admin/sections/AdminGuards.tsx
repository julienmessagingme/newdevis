import { Button } from "@/components/ui/button";
import { Loader2, XCircle, LogOut, AlertCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function AdminLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export function AdminAccessDenied() {
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

interface AdminKPIsErrorProps {
  error: string | null;
  onRefresh: () => void;
  refreshing: boolean;
}

export function AdminKPIsError({ error, onRefresh, refreshing }: AdminKPIsErrorProps) {
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
        <Button onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Chargement..." : "Réessayer"}
        </Button>
      </div>
    </div>
  );
}
