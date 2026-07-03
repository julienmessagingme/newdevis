/**
 * BlogPourAllerPlusLoin — bloc "Pour aller plus loin" pied d'article blog.
 * 4 rebonds contextuels : Observatoire (prix marché), Analyse gratuite,
 * Comparateur, GérerMonChantier landing.
 *
 * Injecté dans BlogArticle après le BlogCTA "bottom". Zéro dépendance runtime
 * (statique, pas de fetch, pas de state).
 */

import { ArrowRight, BarChart3, BookOpen, Hammer, Scale, Search } from "lucide-react";

export default function BlogPourAllerPlusLoin() {
  return (
    <section className="my-10 border-t border-border pt-8">
      <h2 className="text-lg sm:text-xl font-bold text-foreground mb-1">
        Pour aller plus loin
      </h2>
      <p className="text-sm text-muted-foreground mb-5">
        Continuez à explorer : découvrez les vrais prix, comparez, ou pilotez votre chantier.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a
          href="/nouvelle-analyse"
          className="group bg-primary text-primary-foreground rounded-xl p-4 flex items-start gap-3 hover:bg-primary/90 transition-colors"
        >
          <Search className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm mb-0.5">
              Analyser mon devis gratuitement
            </div>
            <div className="text-xs opacity-90 leading-snug">
              Vérification en 30 secondes, comparaison automatique aux prix marché.
            </div>
          </div>
          <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform flex-shrink-0 mt-0.5" />
        </a>

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
              Fourchettes par métier et par chantier — Observatoire VMD.
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
              Analyse comparative multi-artisans, verdict argumenté.
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
              Comprendre, comparer, négocier, signer en sécurité.
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform flex-shrink-0 mt-0.5" />
        </a>
      </div>

      <a
        href="https://www.gerermonchantier.fr/"
        className="group mt-3 bg-slate-900 text-white rounded-xl p-4 flex items-center gap-3 hover:bg-slate-800 transition-colors"
      >
        <Hammer className="h-5 w-5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm mb-0.5">
            Piloter mon chantier avec GérerMonChantier
          </div>
          <div className="text-xs opacity-80 leading-snug">
            Budget, planning, artisans — essai gratuit 30 jours, sans carte bancaire.
          </div>
        </div>
        <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform flex-shrink-0" />
      </a>
    </section>
  );
}
