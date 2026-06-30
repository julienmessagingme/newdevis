/**
 * src/components/pages/seo/EtudeVmdPage.tsx
 *
 * Rendu d'une étude VMD générée par scripts/seo/generate-etudes-vmd.ts.
 * Le JSON est passé en prop depuis l'Astro page.
 */

import Breadcrumb from "@/components/seo/Breadcrumb";
import RelatedGuides from "@/components/seo/RelatedGuides";
import GmcGatewayBanner from "@/components/cta/GmcGatewayBanner";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, Calendar, Database } from "lucide-react";
import type { InternalLink } from "@/lib/seo/internalLinking";

export interface EtudeData {
  slug: string;
  title: string;
  description: string;
  lastGenerated: string;
  totalAnalyses: number;
  intro: string;
  stats: Array<{
    rank: number;
    label: string;
    value: string;
    subtitle?: string;
    context?: string;
  }>;
  methodology: string;
}

interface Props {
  data: EtudeData;
  related: InternalLink[];
}

export default function EtudeVmdPage({ data, related }: Props) {
  const lastDate = new Date(data.lastGenerated).toLocaleDateString("fr-FR", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <Breadcrumb segments={[
        { name: "Études VMD", href: "/etudes-vmd" },
        { name: data.title, href: `/etudes-vmd/${data.slug}` },
      ]} />

      {/* Badge "Données réelles" */}
      <div className="inline-flex items-center gap-2 bg-accent border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full mb-4">
        <Database className="h-3.5 w-3.5" /> Étude basée sur nos données réelles
      </div>

      <header className="max-w-3xl mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">{data.title}</h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-4">{data.intro}</p>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BarChart3 className="h-3.5 w-3.5" /> {data.totalAnalyses} devis analysés
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> Mis à jour le {lastDate}
          </span>
        </div>
      </header>

      {/* Liste des stats */}
      <section className="space-y-3 my-8">
        {data.stats.map((s) => (
          <div
            key={s.rank}
            className="bg-card border border-border rounded-xl p-5 flex items-start gap-4 hover:border-primary/40 transition-colors"
          >
            <div className="flex-shrink-0 w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-sm">
              {s.rank}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                <h3 className="font-semibold text-base">{s.label}</h3>
                <span className="text-primary font-bold text-lg">{s.value}</span>
              </div>
              {s.subtitle && (
                <p className="text-xs text-muted-foreground mb-1">{s.subtitle}</p>
              )}
              {s.context && (
                <p className="text-sm text-foreground/70 leading-relaxed mt-2">{s.context}</p>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* Méthodologie (transparence E-E-A-T) */}
      <section className="bg-muted rounded-xl p-5 my-10 border-l-4 border-muted-foreground/30">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground mb-2">Méthodologie</h2>
        <p className="text-sm text-foreground/80 leading-relaxed">{data.methodology}</p>
        <p className="text-xs text-muted-foreground mt-3">
          Cette étude est régénérée mensuellement avec les nouvelles données. Le code est ouvert et auditable.
          Pas de cherry-picking, pas de manipulation : c'est ce que nos outils mesurent vraiment.
        </p>
      </section>

      {/* CTA */}
      <div className="my-10 flex justify-center">
        <Button asChild size="lg">
          <a href="/nouvelle-analyse">
            Vérifier mon propre devis <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>

      <RelatedGuides items={related} title="Études et guides liés" />

      <div className="mt-10">
        <GmcGatewayBanner variant="guide" />
      </div>
    </main>
  );
}
