/**
 * src/components/pages/seo/ObservatoireMetierPage.tsx
 *
 * Rendu d'une page /observatoire/metiers/[slug].
 * Le JSON generé par scripts/observatoire/generate.ts contient toutes les stats.
 *
 * Structure :
 *   - Hero : nom du métier + chiffres clés
 *   - KPIs Grid (4 cards : nb devis, prix moyen, écart marché, panier moyen)
 *   - Top 5 postes surfacturés du métier
 *   - Distribution prix (min / P25 / médiane / P75 / max)
 *   - Erreurs fréquentes (si data disponible)
 *   - Conseils
 *   - CTA VMD + GMC
 */

import Breadcrumb from "@/components/seo/Breadcrumb";
import RelatedGuides from "@/components/seo/RelatedGuides";
import GmcGatewayBanner from "@/components/cta/GmcGatewayBanner";
import ObservatoireChip from "@/components/seo/ObservatoireChip";
import ObservatoireDisclaimer from "@/components/seo/ObservatoireDisclaimer";
import { Button } from "@/components/ui/button";
import { ArrowRight, Database, TrendingUp } from "lucide-react";
import type { InternalLink } from "@/lib/seo/internalLinking";

export interface MetierData {
  slug: string;                     // "peinture-revetements"
  metier: string;                   // "peinture_revetements"
  metier_label: string;             // "Peinture & revêtements"
  title: string;                    // "Prix moyens & anomalies : Peinture & revêtements"
  description: string;
  lastGenerated: string;
  intro: string;
  kpis: {
    nb_devis: number;
    nb_lignes: number;
    prix_moyen: number;
    prix_median: number;
    prix_min: number;
    prix_max: number;
    prix_p25: number;
    prix_p75: number;
    panier_moyen: number;
    ratio_moyen_vs_marche: number | null;
  };
  postesSurfactures: Array<{
    label: string;
    ratio_median: number;
    nb_obs: number;
  }>;
  conseils: string[];
}

interface Props {
  data: MetierData;
  related: InternalLink[];
}

function fmtEUR(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toLocaleString("fr-FR") + " €";
}

function fmtPct(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return "—";
  const pct = (ratio - 1) * 100;
  const sign = pct > 0 ? "+" : "";
  return sign + Math.round(pct) + "%";
}

export default function ObservatoireMetierPage({ data, related }: Props) {
  const hasData = data.kpis.nb_lignes > 0;

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <Breadcrumb
        segments={[
          { name: "Observatoire", href: "/observatoire" },
          { name: "Métiers", href: "/observatoire/metiers" },
          { name: data.metier_label, href: `/observatoire/metiers/${data.slug}` },
        ]}
      />

      <div className="inline-flex items-center gap-2 bg-accent border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full mb-4">
        <Database className="h-3.5 w-3.5" /> Nos analyses de devis
      </div>

      <header className="max-w-3xl mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">{data.title}</h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-4">
          {data.intro}
        </p>
        <ObservatoireChip
          nbDevis={data.kpis.nb_devis}
          nbLignes={data.kpis.nb_lignes}
          lastGenerated={data.lastGenerated}
        />
      </header>

      {!hasData ? (
        <section className="my-8 bg-accent border-2 border-dashed border-primary/30 rounded-xl p-8 text-center">
          <h2 className="text-lg font-bold mb-2">Données en cours d'accumulation</h2>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Ce métier n'a pas encore assez de devis analysés pour publier des statistiques
            représentatives. Cette page sera enrichie automatiquement dès que le seuil sera atteint.
          </p>
        </section>
      ) : (
        <>
          {/* KPIs Grid */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3 my-8">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                Prix moyen
              </div>
              <div className="text-2xl font-bold text-foreground">{fmtEUR(data.kpis.prix_moyen)}</div>
              <div className="text-[11px] text-muted-foreground mt-1">par unité observée</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                Prix médian
              </div>
              <div className="text-2xl font-bold text-foreground">{fmtEUR(data.kpis.prix_median)}</div>
              <div className="text-[11px] text-muted-foreground mt-1">50% des devis en-dessous</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                Fourchette
              </div>
              <div className="text-lg font-bold text-foreground">
                {fmtEUR(data.kpis.prix_min)} – {fmtEUR(data.kpis.prix_max)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">min → max observés</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                Écart vs marché
              </div>
              <div
                className={
                  "text-2xl font-bold " +
                  (data.kpis.ratio_moyen_vs_marche === null
                    ? "text-muted-foreground"
                    : data.kpis.ratio_moyen_vs_marche > 1.15
                      ? "text-red-600"
                      : data.kpis.ratio_moyen_vs_marche < 0.85
                        ? "text-green-600"
                        : "text-foreground")
                }
              >
                {fmtPct(data.kpis.ratio_moyen_vs_marche)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">devis vs catalogue moyen</div>
            </div>
          </section>

          {/* Interquartile visuel */}
          <section className="bg-card border border-border rounded-xl p-5 my-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Distribution des prix observés
            </h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{fmtEUR(data.kpis.prix_min)}</span>
              <div className="flex-1 h-3 bg-muted rounded-full relative overflow-hidden">
                <div
                  className="absolute top-0 h-full bg-primary/60 rounded-full"
                  style={{
                    left:
                      Math.max(
                        0,
                        Math.min(
                          100,
                          ((data.kpis.prix_p25 - data.kpis.prix_min) /
                            (data.kpis.prix_max - data.kpis.prix_min || 1)) *
                            100,
                        ),
                      ) + "%",
                    width:
                      Math.max(
                        4,
                        Math.min(
                          100,
                          ((data.kpis.prix_p75 - data.kpis.prix_p25) /
                            (data.kpis.prix_max - data.kpis.prix_min || 1)) *
                            100,
                        ),
                      ) + "%",
                  }}
                />
              </div>
              <span>{fmtEUR(data.kpis.prix_max)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground mt-2">
              <span>P25 : {fmtEUR(data.kpis.prix_p25)}</span>
              <span>Médiane : {fmtEUR(data.kpis.prix_median)}</span>
              <span>P75 : {fmtEUR(data.kpis.prix_p75)}</span>
            </div>
          </section>

          {/* Top postes surfacturés */}
          {data.postesSurfactures.length > 0 && (
            <section className="my-10">
              <h2 className="text-xl font-bold tracking-tight mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-red-600" />
                Postes du métier les plus surfacturés
              </h2>
              <p className="text-sm text-muted-foreground mb-4 max-w-3xl">
                Ces postes sont ceux où les devis dépassent le plus la fourchette catalogue moyenne
                sur nos analyses.
              </p>
              <div className="space-y-2">
                {data.postesSurfactures.map((p, idx) => (
                  <div
                    key={p.label + idx}
                    className="bg-card border border-border rounded-lg p-4 flex items-center gap-4"
                  >
                    <div className="flex-shrink-0 w-9 h-9 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-sm">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{p.label}</div>
                      <div className="text-xs text-muted-foreground">
                        Sur {p.nb_obs} devis observés
                      </div>
                    </div>
                    <div className="text-red-600 font-bold text-lg">{fmtPct(p.ratio_median)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Conseils */}
          {data.conseils.length > 0 && (
            <section className="my-10 bg-muted rounded-xl p-6 border-l-4 border-primary">
              <h2 className="text-lg font-bold mb-3">Conseils pour ce métier</h2>
              <ul className="space-y-2 text-sm text-foreground/80">
                {data.conseils.map((c, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-primary flex-shrink-0 mt-1">→</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* CTA */}
      <div className="my-10 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <a href="/nouvelle-analyse">
            Vérifier mon devis {data.metier_label.toLowerCase()} <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="/comparateur">Comparer plusieurs devis</a>
        </Button>
      </div>

      <ObservatoireDisclaimer />

      <RelatedGuides items={related} title="À explorer aussi" />

      <div className="mt-10">
        <GmcGatewayBanner variant="guide" />
      </div>
    </main>
  );
}
