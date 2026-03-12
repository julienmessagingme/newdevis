import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
// startTrial removed for security — subscription goes through Stripe only
import { toast } from "sonner";
import { Check, X, Sparkles, FileText, Euro, Award, ClipboardList, Mail, Camera } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";

type Analysis = { id: string; file_name: string; score: string | null; created_at: string };

const FEATURES = [
  {
    icon: FileText,
    title: "Devis & Factures",
    desc: "Tous vos documents au même endroit, liés à vos analyses de devis existantes.",
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    icon: Euro,
    title: "Budget",
    desc: "Suivez chaque euro : apport, crédit, aides — votre enveloppe en temps réel.",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    icon: Award,
    title: "Aides & Subventions",
    desc: "MaPrimeRénov', CEE, Éco-PTZ… Ne ratez aucune subvention disponible.",
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    icon: ClipboardList,
    title: "Formalités",
    desc: "Checklist légale automatique : déclarations, PV de réception, assurances.",
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    icon: Mail,
    title: "Relances Artisans",
    desc: "Emails pré-rédigés en un clic : relance délai, réclamation, mise en demeure.",
    color: "text-rose-600",
    bg: "bg-rose-50",
  },
  {
    icon: Camera,
    title: "Journal de Chantier",
    desc: "Protégez-vous avec des preuves datées : photos, notes, phases de travaux.",
    color: "text-cyan-600",
    bg: "bg-cyan-50",
  },
];

const COMPARISON_ROWS = [
  { feature: "Analyses de devis", free: "3 / mois", premium: "Illimitées" },
  { feature: "Module suivi chantier", free: false, premium: true },
  { feature: "Import analyses auto", free: false, premium: true },
  { feature: "Relances artisans", free: false, premium: true },
  { feature: "Suivi budget & aides", free: false, premium: true },
  { feature: "Journal de chantier", free: false, premium: true },
  { feature: "Export PDF", free: false, premium: true },
  { feature: "Prix", free: "0 €", premium: "À venir" },
];

const Premium = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const { data } = await supabase
          .from("analyses")
          .select("id, file_name, score, created_at")
          .eq("user_id", user.id)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(5);
        setAnalyses(data || []);
      }
    };
    init();
  }, []);

  const handleStartTrial = async () => {
    if (!user) {
      window.location.href = "/connexion?redirect=/premium";
      return;
    }
    setIsStarting(true);
    // Redirect to Pass Sérénité subscription page
    window.location.href = "/pass-serenite";
    return;
  };

  const scoreColor = (score: string | null) => {
    if (score === "VERT") return "bg-green-100 text-green-700";
    if (score === "ORANGE") return "bg-orange-100 text-orange-700";
    if (score === "ROUGE") return "bg-red-100 text-red-700";
    return "bg-gray-100 text-gray-600";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="py-16 sm:py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Sparkles className="h-4 w-4" />
            Nouveau · Mon Chantier Premium
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold text-foreground mb-6 leading-tight">
            Suivez votre chantier<br className="hidden sm:block" /> de A à Z
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Le seul outil qui relie vos analyses de devis à la gestion complète de votre projet travaux.
          </p>
          <Button
            size="lg"
            className="text-base px-8 py-6 h-auto"
            onClick={handleStartTrial}
            disabled={isStarting}
          >
            {isStarting ? "Activation…" : "Commencer l'essai gratuit 14 jours →"}
          </Button>
          <p className="mt-4 text-sm text-muted-foreground">
            Sans engagement · Aucune carte bancaire requise
          </p>
        </div>
      </section>

      {/* Import automatique banner — visible uniquement si analyses existantes */}
      {analyses.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 mb-12">
          <div className="rounded-2xl bg-gradient-to-r from-primary/10 to-blue-500/10 border border-primary/20 p-6">
            <div className="flex items-start gap-4">
              <div className="text-2xl">✨</div>
              <div>
                <p className="font-semibold text-foreground mb-1">
                  Vos {analyses.length} analyse{analyses.length > 1 ? "s" : ""} seront importées automatiquement
                </p>
                <p className="text-sm text-muted-foreground mb-3">
                  Dès l'activation, vos devis déjà analysés seront disponibles dans Mon Chantier.
                </p>
                <div className="flex flex-wrap gap-2">
                  {analyses.map(a => (
                    <span key={a.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${scoreColor(a.score)}`}>
                      {a.file_name.length > 30 ? a.file_name.slice(0, 30) + "…" : a.file_name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Feature cards */}
      <section className="max-w-5xl mx-auto px-4 mb-16">
        <h2 className="text-2xl font-bold text-foreground text-center mb-10">6 modules pour tout gérer</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
        <h2 className="text-2xl font-bold text-foreground text-center mb-8">Gratuit vs Premium</h2>
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="grid grid-cols-3 bg-muted/50 border-b border-border">
            <div className="p-4 text-sm font-medium text-muted-foreground"></div>
            <div className="p-4 text-sm font-medium text-center text-muted-foreground">Gratuit</div>
            <div className="p-4 text-sm font-medium text-center text-primary">Premium</div>
          </div>
          {COMPARISON_ROWS.map(({ feature, free, premium }, idx) => (
            <div key={feature} className={`grid grid-cols-3 border-b border-border/50 last:border-0 ${idx % 2 === 0 ? "" : "bg-muted/20"}`}>
              <div className="p-4 text-sm text-foreground">{feature}</div>
              <div className="p-4 text-center">
                {typeof free === "boolean" ? (
                  free
                    ? <Check className="h-4 w-4 text-score-green mx-auto" />
                    : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                ) : (
                  <span className="text-sm text-muted-foreground">{free}</span>
                )}
              </div>
              <div className="p-4 text-center">
                {typeof premium === "boolean" ? (
                  premium
                    ? <Check className="h-4 w-4 text-score-green mx-auto" />
                    : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                ) : (
                  <span className="text-sm font-medium text-primary">{premium}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Early adopter badge */}
      <section className="max-w-2xl mx-auto px-4 mb-16">
        <div className="rounded-2xl border-2 border-amber-400/50 bg-amber-50/50 p-6 text-center">
          <p className="text-2xl mb-3">🎉</p>
          <h3 className="font-bold text-foreground text-lg mb-2">Accès Early Adopter</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Gratuit pendant toute la période de lancement. Prix définitif annoncé prochainement.
            <br />
            <strong className="text-foreground">Vos retours construisent le produit.</strong>
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 px-4 text-center bg-primary/5 border-t border-border">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">Prêt à prendre le contrôle de votre chantier ?</h2>
        <p className="text-muted-foreground mb-8">Essai gratuit 14 jours. Aucun engagement.</p>
        <Button
          size="lg"
          className="text-base px-10 py-6 h-auto"
          onClick={handleStartTrial}
          disabled={isStarting}
        >
          {isStarting ? "Activation…" : "Activer mon accès gratuit →"}
        </Button>
      </section>
    </div>
  );
};

export default Premium;
