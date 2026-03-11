import { Lock, Shield, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PassSereniteGateProps {
  analysisCount: number;
}

const PassSereniteGate = ({ analysisCount }: PassSereniteGateProps) => {
  return (
    <div className="max-w-2xl mx-auto py-16 px-4">
      <div className="text-center mb-8">
        <div className="inline-flex p-4 rounded-full bg-primary/10 mb-6">
          <Lock className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-3">
          Vous avez utilisé vos 5 analyses gratuites
        </h2>
        <p className="text-muted-foreground mb-2">
          Vous avez analysé {analysisCount} devis. L'offre gratuite est limitée à 5 analyses.
        </p>
        <p className="text-muted-foreground">
          Passez au <strong className="text-primary">Pass Sérénité</strong> pour débloquer vos résultats et analyser tous vos devis en illimité.
        </p>
      </div>

      <div className="bg-card border-2 border-primary/20 rounded-2xl p-6 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="h-6 w-6 text-primary" />
          <h3 className="font-semibold text-foreground text-lg">Pass Sérénité</h3>
          <span className="ml-auto text-2xl font-bold text-primary">4,99€<span className="text-sm font-normal text-muted-foreground">/mois</span></span>
        </div>

        <ul className="space-y-2 mb-6">
          {[
            "Analyses de devis illimitées",
            "Rapport PDF téléchargeable",
            "Tri par type de travaux",
            "Score de fiabilité complet",
            "Comparaison prix marché",
          ].map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              {feature}
            </li>
          ))}
        </ul>

        <a href="/pass-serenite">
          <Button size="lg" className="w-full text-base">
            Souscrire au Pass Sérénité
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </a>
        <p className="text-xs text-center text-muted-foreground mt-3">
          Sans engagement · Annulable à tout moment
        </p>
      </div>
    </div>
  );
};

export default PassSereniteGate;
