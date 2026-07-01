/**
 * src/components/pages/seo/EtudeVmdPage.tsx
 *
 * Rendu d'une étude VMD générée par scripts/seo/generate-etudes-vmd.ts.
 * Le JSON est passé en prop depuis l'Astro page.
 */

import Breadcrumb from "@/components/seo/Breadcrumb";
import ObservatoireChip from "@/components/seo/ObservatoireChip";
import ObservatoireDisclaimer from "@/components/seo/ObservatoireDisclaimer";
import ObservatoireCrossLinks from "@/components/seo/ObservatoireCrossLinks";
import { Database, HourglassIcon } from "lucide-react";
import type { InternalLink } from "@/lib/seo/internalLinking";
import { getObservatoireCrossLinks } from "@/lib/seo/observatoireCrossLinks";

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
  related?: InternalLink[];
}

export default function EtudeVmdPage({ data }: Props) {
  const crossLinks = getObservatoireCrossLinks("etude", data.slug);
  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <Breadcrumb segments={[
        { name: "Observatoire", href: "/observatoire" },
        { name: data.title, href: `/observatoire/${data.slug}` },
      ]} />

      <div className="inline-flex items-center gap-2 bg-accent border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full mb-4">
        <Database className="h-3.5 w-3.5" /> Nos analyses de devis
      </div>

      <header className="max-w-3xl mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">{data.title}</h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-4">{data.intro}</p>
        <ObservatoireChip nbDevis={data.totalAnalyses} lastGenerated={data.lastGenerated} />
      </header>

      {/* Liste des stats OU état "données en cours d'accumulation" */}
      {data.stats.length === 0 ? (
        <section className="my-8 bg-accent border-2 border-dashed border-primary/30 rounded-xl p-8 text-center">
          <HourglassIcon className="h-10 w-10 text-primary/70 mx-auto mb-4" />
          <h2 className="text-lg font-bold mb-2">Données en cours d'accumulation</h2>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed mb-4">
            Cette étude s'appuie sur les revues expertes réalisées sur les devis analysés par nos utilisateurs.
            Le volume actuel <strong>({data.totalAnalyses} revues expertes)</strong> est encore insuffisant pour
            publier des statistiques fiables et représentatives.
          </p>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Nous préférons <strong>ne rien publier plutôt que d'inventer des chiffres</strong>. Cette page sera
            enrichie automatiquement dès que le volume atteindra un seuil statistique suffisant (~30 revues expertes).
          </p>
          <div className="mt-6 inline-flex items-center gap-2 text-xs text-muted-foreground bg-card border border-border rounded-full px-4 py-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
            En attente de plus de données réelles
          </div>
        </section>
      ) : (
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
      )}

      {data.stats.length > 0 && (
        <section className="bg-muted rounded-xl p-5 my-10 border-l-4 border-muted-foreground/30">
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground mb-2">Méthodologie</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">{data.methodology}</p>
          <p className="text-xs text-muted-foreground mt-3">
            Cette étude est régénérée mensuellement avec les nouveaux devis analysés. Le code de génération est ouvert et auditable.
          </p>
        </section>
      )}

      <ObservatoireCrossLinks
        type="etude"
        slug={data.slug}
        metiers={crossLinks.metiers}
        chantiers={crossLinks.chantiers}
        guide={crossLinks.guide}
        analyse={crossLinks.analyse}
        comparateur={crossLinks.comparateur}
        gmcRelevant={crossLinks.gmcRelevant}
      />

      <ObservatoireDisclaimer />
    </main>
  );
}
