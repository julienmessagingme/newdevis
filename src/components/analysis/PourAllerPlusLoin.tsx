/**
 * PourAllerPlusLoin — bloc post-verdict d'analyse. Propose 4 rebonds contextuels :
 * Observatoire (prix marché), Guide, Comparateur, GérerMonChantier.
 *
 * Injecté dans AnalysisResult sous ConclusionIA. Reçoit un chantierSlug optionnel
 * détecté depuis les lignes du devis (helper detectChantierSlug) — si présent,
 * les liens Observatoire + Comparateur sont personnalisés (fourchette du chantier
 * détecté, comparateur préseté).
 */

import { ArrowRight, BarChart3, BookOpen, Hammer, Scale } from "lucide-react";
import GmcGatewayBanner from "@/components/cta/GmcGatewayBanner";
import { getPourAllerPlusLoinLinks, labelForChantier } from "@/lib/seo/observatoireCrossLinks";

interface Props {
  /** Slug Observatoire détecté depuis les lignes du devis (ex: 'salle-de-bain').
   * Si null/absent, on garde les liens génériques. */
  chantierSlug?: string | null;
}

export default function PourAllerPlusLoin({ chantierSlug = null }: Props) {
  const links = getPourAllerPlusLoinLinks(chantierSlug);
  const contextLabel = chantierSlug ? labelForChantier(chantierSlug) : null;

  return (
    <section className="my-8 border-2 border-dashed border-primary/20 rounded-2xl p-5 sm:p-6 bg-primary/5">
      <h2 className="text-lg sm:text-xl font-bold text-foreground mb-1">
        Pour aller plus loin
      </h2>
      <p className="text-sm text-muted-foreground mb-5">
        {contextLabel
          ? `Approfondissez votre projet ${contextLabel}, comparez ou pilotez votre chantier.`
          : "Approfondissez, comparez ou pilotez votre chantier."}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a
          href={links.observatoire?.href ?? "/observatoire"}
          className="group bg-card border border-border rounded-xl p-4 flex items-start gap-3 hover:border-primary/40 hover:shadow-sm transition-all"
        >
          <BarChart3 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors mb-0.5">
              {links.observatoire?.label ?? "Voir les prix marché"}
            </div>
            <div className="text-xs text-muted-foreground leading-snug">
              {contextLabel
                ? `Fourchette prix ${contextLabel} sur les devis analysés.`
                : "Fourchettes par métier et par chantier — Observatoire."}
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform flex-shrink-0 mt-0.5" />
        </a>

        <a
          href={links.comparateur.href}
          className="group bg-card border border-border rounded-xl p-4 flex items-start gap-3 hover:border-primary/40 hover:shadow-sm transition-all"
        >
          <Scale className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors mb-0.5">
              {links.comparateur.label}
            </div>
            <div className="text-xs text-muted-foreground leading-snug">
              Verdict comparatif entre plusieurs artisans.
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform flex-shrink-0 mt-0.5" />
        </a>

        <a
          href={links.guide.href}
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
          href="https://www.gerermonchantier.fr/"
          className="group bg-card border border-border rounded-xl p-4 flex items-start gap-3 hover:border-primary/40 hover:shadow-sm transition-all"
        >
          <Hammer className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors mb-0.5">
              {contextLabel ? `Piloter mon chantier ${contextLabel}` : "Piloter mon chantier"}
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
