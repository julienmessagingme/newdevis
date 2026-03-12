import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { usePremium } from "@/hooks/usePremium";
import { toast } from "sonner";
import {
  Check,
  X,
  Shield,
  FileText,
  ArrowRight,
  Loader2,
  CheckCircle2,
  BarChart3,
  Download,
  Infinity,
} from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";

const COMPARISON_ROWS = [
  { feature: "Analyses de devis", free: "5 à vie", premium: "Illimitées" },
  { feature: "Score de fiabilité", free: true, premium: true },
  { feature: "Vérification entreprise", free: true, premium: true },
  { feature: "Comparaison prix marché", free: true, premium: true },
  { feature: "Tri par type de travaux", free: false, premium: true },
  { feature: "Rapport PDF téléchargeable", free: false, premium: true },
  { feature: "Prix", free: "Gratuit", premium: "4,99€/mois" },
];

const FEATURES = [
  {
    icon: Infinity,
    title: "Analyses illimitées",
    desc: "Analysez autant de devis que vous le souhaitez, sans aucune restriction.",
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    icon: Download,
    title: "Rapport PDF",
    desc: "Téléchargez un rapport complet pour chaque analyse, partageable avec votre entourage.",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    icon: BarChart3,
    title: "Tri par type de travaux",
    desc: "Classez et comparez vos devis par catégorie : plomberie, électricité, toiture...",
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    icon: Shield,
    title: "Tranquillité d'esprit",
    desc: "Faites analyser chaque devis reçu, sans compter. Protégez-vous sur tous vos projets.",
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
];

const PassSerenite = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const { isPremium, lifetimeAnalysisCount, isLoading } = usePremium();

  const isSuccess = new URLSearchParams(window.location.search).get("success") === "true";
  const isCanceled = new URLSearchParams(window.location.search).get("canceled") === "true";

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
  }, []);

  useEffect(() => {
    if (isSuccess) {
      toast.success("Bienvenue dans le Pass Sérénité ! Vos résultats sont maintenant débloqués.");
    }
    if (isCanceled) {
      toast.info("Paiement annulé. Vous pouvez réessayer quand vous le souhaitez.");
    }
  }, [isSuccess, isCanceled]);

  const handleSubscribe = async () => {
    if (!user) {
      window.location.href = "/connexion?redirect=/pass-serenite";
      return;
    }

    setIsRedirecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.details || data.error || "Erreur lors de la redirection vers le paiement");
        setIsRedirecting(false);
      }
    } catch {
      toast.error("Une erreur est survenue");
      setIsRedirecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="py-16 sm:py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Shield className="h-4 w-4" />
            Pass Sérénité
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold text-foreground mb-6 leading-tight">
            Analysez tous vos devis<br className="hidden sm:block" /> en toute sérénité
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground mb-4 max-w-2xl mx-auto">
            Ne laissez plus aucun devis sans vérification. Le Pass Sérénité vous donne un accès illimité à l'analyse de devis.
          </p>
          <p className="text-3xl font-bold text-primary mb-2">4,99€<span className="text-lg font-normal text-muted-foreground">/mois</span></p>
          <p className="text-sm text-muted-foreground mb-8">Sans engagement · Annulable à tout moment</p>

          {isPremium && !isLoading ? (
            <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-green-50 border-2 border-green-200 text-green-700 font-medium">
              <CheckCircle2 className="h-5 w-5" />
              Vous avez le Pass Sérénité
            </div>
          ) : (
            <Button
              size="lg"
              className="text-base px-8 py-6 h-auto"
              onClick={handleSubscribe}
              disabled={isRedirecting || isLoading}
            >
              {isRedirecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Redirection vers le paiement...
                </>
              ) : (
                <>
                  Souscrire au Pass Sérénité
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          )}

          {!isPremium && !isLoading && lifetimeAnalysisCount > 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              Vous avez utilisé <strong>{lifetimeAnalysisCount}/5</strong> analyses gratuites
            </p>
          )}
        </div>
      </section>

      {/* Feature cards */}
      <section className="max-w-5xl mx-auto px-4 mb-16">
        <h2 className="text-2xl font-bold text-foreground text-center mb-10">Ce que vous obtenez</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc, color, bg }) => (
            <div key={title} className="bg-card border border-border rounded-2xl p-5 hover:shadow-md transition-shadow">
              <div className={`inline-flex p-2.5 rounded-xl ${bg} mb-3`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <h3 className="font-semibold text-foreground mb-1">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="max-w-3xl mx-auto px-4 mb-16">
        <h2 className="text-2xl font-bold text-foreground text-center mb-8">Gratuit vs Pass Sérénité</h2>
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="grid grid-cols-3 bg-muted/50 border-b border-border">
            <div className="p-4 text-sm font-medium text-muted-foreground"></div>
            <div className="p-4 text-sm font-medium text-center text-muted-foreground">Gratuit</div>
            <div className="p-4 text-sm font-medium text-center text-primary">Pass Sérénité</div>
          </div>
          {COMPARISON_ROWS.map(({ feature, free, premium }, idx) => (
            <div key={feature} className={`grid grid-cols-3 border-b border-border/50 last:border-0 ${idx % 2 === 0 ? "" : "bg-muted/20"}`}>
              <div className="p-4 text-sm text-foreground">{feature}</div>
              <div className="p-4 text-center">
                {typeof free === "boolean" ? (
                  free
                    ? <Check className="h-4 w-4 text-green-500 mx-auto" />
                    : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                ) : (
                  <span className="text-sm text-muted-foreground">{free}</span>
                )}
              </div>
              <div className="p-4 text-center">
                {typeof premium === "boolean" ? (
                  premium
                    ? <Check className="h-4 w-4 text-green-500 mx-auto" />
                    : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                ) : (
                  <span className="text-sm font-medium text-primary">{premium}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 px-4 text-center bg-primary/5 border-t border-border">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
          Protégez-vous sur tous vos projets travaux
        </h2>
        <p className="text-muted-foreground mb-8">4,99€/mois · Sans engagement · Annulable en 1 clic</p>
        {isPremium && !isLoading ? (
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-green-50 border-2 border-green-200 text-green-700 font-medium">
            <CheckCircle2 className="h-5 w-5" />
            Vous avez déjà le Pass Sérénité
          </div>
        ) : (
          <Button
            size="lg"
            className="text-base px-10 py-6 h-auto"
            onClick={handleSubscribe}
            disabled={isRedirecting || isLoading}
          >
            {isRedirecting ? "Redirection..." : "Souscrire maintenant →"}
          </Button>
        )}
      </section>
    </div>
  );
};

export default PassSerenite;
