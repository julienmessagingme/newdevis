/**
 * ObservatoireCrossLinks — bloc de maillage automatique en pied de page
 * Observatoire. Génère 5 catégories de liens contextuels + bannière GMC
 * conditionnelle.
 */

import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Hammer,
  Scale,
  Search,
} from "lucide-react";
import GmcGatewayBanner from "@/components/cta/GmcGatewayBanner";
import type { CrossLink } from "@/lib/seo/observatoireCrossLinks";

interface Props {
  type: "metier" | "chantier" | "etude";
  slug: string;
  metiers: CrossLink[];
  chantiers: CrossLink[];
  guide: CrossLink;
  analyse: CrossLink;
  comparateur: CrossLink;
  gmcRelevant?: boolean;
}

export default function ObservatoireCrossLinks({
  metiers,
  chantiers,
  guide,
  analyse,
  comparateur,
  gmcRelevant = false,
}: Props) {
  return (
    <section className="my-12 border-t border-border pt-10">
      <h2 className="text-xl font-bold tracking-tight mb-6">
        Pour aller plus loin
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CTA principal — Analyse */}
        <a
          href={analyse.href}
          className="group bg-primary text-primary-foreground rounded-xl p-5 flex items-center justify-between hover:bg-primary/90 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5" />
            <div>
              <div className="font-semibold">{analyse.label}</div>
              <div className="text-xs opacity-80">Analyse gratuite en 30 secondes</div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </a>

        {/* CTA secondaire — Comparateur */}
        <a
          href={comparateur.href}
          className="group bg-card border border-border rounded-xl p-5 flex items-center justify-between hover:border-primary/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Scale className="h-5 w-5 text-primary" />
            <div>
              <div className="font-semibold">{comparateur.label}</div>
              <div className="text-xs text-muted-foreground">
                Analyse comparative multi-artisans
              </div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
        </a>
      </div>

      {/* Liens métiers */}
      {metiers.length > 0 && (
        <div className="mt-8">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Hammer className="h-3.5 w-3.5" /> Métiers concernés
          </h3>
          <div className="flex flex-wrap gap-2">
            {metiers.map((m) => (
              <a
                key={m.href}
                href={m.href}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 bg-muted hover:bg-muted/60 border border-border rounded-full transition-colors"
              >
                {m.label}
                <ArrowRight className="h-3 w-3" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Liens chantiers */}
      {chantiers.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5" /> Chantiers similaires
          </h3>
          <div className="flex flex-wrap gap-2">
            {chantiers.map((c) => (
              <a
                key={c.href}
                href={c.href}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 bg-muted hover:bg-muted/60 border border-border rounded-full transition-colors"
              >
                {c.label}
                <ArrowRight className="h-3 w-3" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Guide associé */}
      <div className="mt-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5" /> Guide associé
        </h3>
        <a
          href={guide.href}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          {guide.label}
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Bannière GMC uniquement sur chantier gros œuvre */}
      {gmcRelevant && (
        <div className="mt-8">
          <GmcGatewayBanner variant="guide" />
        </div>
      )}
    </section>
  );
}
