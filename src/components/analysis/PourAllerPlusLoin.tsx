/**
 * PourAllerPlusLoin — bloc post-verdict d'analyse. Propose 4 rebonds contextuels :
 * Observatoire (prix marché), Guide, Comparateur, GérerMonChantier.
 *
 * Injecté dans AnalysisResult sous ConclusionIA.
 */

import { ArrowRight, BarChart3, BookOpen, Hammer, Scale } from "lucide-react";
import GmcGatewayBanner from "@/components/cta/GmcGatewayBanner";

export default function PourAllerPlusLoin() {
  return (
    <section className="my-8 border-2 border-dashed border-primary/20 rounded-2xl p-5 sm:p-6 bg-primary/5">
      <h2 className="text-lg sm:text-xl font-bold text-foreground mb-1">
        Pour aller plus loin
      </h2>
      <p className="text-sm text-muted-foreground mb-5">
        Approfondissez, comparez ou pilotez votre chantier.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a
          href="/observatoire"
          className="group bg-card border border-border rounded-xl p-4 flex items-start gap-3 hover:border-primary/40 hover:shadow-sm transition-all"
        >
          <BarChart3 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors mb-0.5">
              Voir les prix marché
            </div>
            <div className="text-xs text-muted-foreground leading-snug">
              Fourchettes par métier et par chantier — Observatoire.
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform flex-shrink-0 mt-0.5" />
        </a>

        <a
          href="/comparateur/nouveau"
          className="group bg-card border border-border rounded-xl p-4 flex items-start gap-3 hover:border-primary/40 hover:shadow-sm transition-all"
        >
          <Scale className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors mb-0.5">
              Comparer 2 devis
            </div>
            <div className="text-xs text-muted-foreground leading-snug">
              Verdict comparatif entre plusieurs artisans.
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform flex-shrink-0 mt-0.5" />
        </a>

        <a
          href="/guides/devis-travaux"
          className="group bg-card border border-border rounded-xl p-4 flex items-start gap-3 hover:border-primary/40 hover:shadow-sm transition-all"
        >
          <BookOpen className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors mb-0.5">
              Le guide du devis travaux
            </div>
            <div className="text-xs text-muted-foreground leading-snug">
              Comprendre, négocier, signer en sécurité.
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform flex-shrink-0 mt-0.5" />
        </a>

        <a
          href="https://www.gerermonchantier.fr/mon-chantier"
          className="group bg-card border border-border rounded-xl p-4 flex items-start gap-3 hover:border-primary/40 hover:shadow-sm transition-all"
        >
          <Hammer className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors mb-0.5">
              Piloter mon chantier
            </div>
            <div className="text-xs text-muted-foreground leading-snug">
              Budget, planning, artisans — GérerMonChantier.
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform flex-shrink-0 mt-0.5" />
        </a>
      </div>

      <div className="mt-5">
        <GmcGatewayBanner variant="post-analysis" />
      </div>
    </section>
  );
}
