/**
 * src/components/pages/seo/ObservatoireChantierPage.tsx
 *
 * Rendu d'une page /observatoire/chantiers/[slug].
 * Ex : /observatoire/chantiers/salle-de-bain
 *
 * Structure similaire à MetierPage mais avec le prisme "type de chantier".
 *
 * 2026-09-07 (retour Johan) — mêmes blocs que la page métier, servis par le
 * composant partagé PrixPostes : le chiffre à retenir, les prix poste par poste
 * à unité égale, puis ce qui fait varier un prix. Les quatre tuiles de moyennes
 * (panier moyen par ligne, médiane unitaire, P25-P75, min-max) ont disparu :
 * elles agrégeaient toutes les unités ensemble et ne répondaient à aucune
 * question.
 */

import Breadcrumb from "@/components/seo/Breadcrumb";
import ObservatoireChip from "@/components/seo/ObservatoireChip";
import ObservatoireDisclaimer from "@/components/seo/ObservatoireDisclaimer";
import ObservatoireCrossLinks from "@/components/seo/ObservatoireCrossLinks";
import { Database } from "lucide-react";
import {
  FaitMarquantBloc,
  TablePostes,
  CommentLireCesPrix,
  type PostePublieVue,
} from "@/components/seo/PrixPostes";
import type { InternalLink } from "@/lib/seo/internalLinking";
import { getObservatoireCrossLinks } from "@/lib/seo/observatoireCrossLinks";

export interface ChantierData {
  slug: string;
  chantier_type: string;
  chantier_label: string; // "Salle de bain", "Cuisine", "Toiture", ...
  title: string;
  description: string;
  lastGenerated: string;
  intro: string;
  /** Postes publiables (≥ 5 observations, unité connue, forfaits exclus). */
  postes?: PostePublieVue[];
  /** Le poste au plus fort écart parmi ceux qui pèsent — l'accroche de la page. */
  fait_marquant?: PostePublieVue | null;
  kpis: {
    nb_devis: number;
    nb_lignes: number;
  };
  pointsVigilance: string[];
  erreursFrequentes: string[];
}

interface Props {
  data: ChantierData;
  related?: InternalLink[];
}

export default function ObservatoireChantierPage({ data }: Props) {
  const postes = data.postes ?? [];
  const marquant = data.fait_marquant ?? null;
  // Une page ne montre des chiffres que si au moins un poste est publiable.
  const hasData = postes.length > 0;
  const crossLinks = getObservatoireCrossLinks("chantier", data.slug);

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <Breadcrumb
        segments={[
          { name: "Observatoire", href: "/observatoire" },
          { name: "Chantiers", href: "/observatoire/chantiers" },
          { name: data.chantier_label, href: `/observatoire/chantiers/${data.slug}` },
        ]}
      />

      <div className="inline-flex items-center gap-2 bg-accent border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full mb-4">
        <Database className="h-3.5 w-3.5" /> Nos analyses de devis
      </div>

      <header className="max-w-3xl mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">{data.title}</h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-4">{data.intro}</p>
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
            Ce type de chantier n'a pas encore assez de devis pour publier des statistiques
            représentatives.
          </p>
        </section>
      ) : (
        <>
          <FaitMarquantBloc poste={marquant} />
          <TablePostes postes={postes} />
          <CommentLireCesPrix />

          {data.pointsVigilance.length > 0 && (
            <section className="my-10 bg-amber-50 border border-amber-200 rounded-xl p-6">
              <h2 className="text-lg font-bold mb-3 text-amber-900">Points de vigilance</h2>
              <ul className="space-y-2 text-sm text-amber-900/90">
                {data.pointsVigilance.map((v, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="flex-shrink-0 mt-1">⚠️</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.erreursFrequentes.length > 0 && (
            <section className="my-10">
              <h2 className="text-xl font-bold tracking-tight mb-4">Erreurs fréquentes sur ce type de chantier</h2>
              <div className="space-y-2">
                {data.erreursFrequentes.map((e, idx) => (
                  <div key={idx} className="bg-card border border-border rounded-lg p-4 flex items-start gap-3">
                    <div className="flex-shrink-0 w-7 h-7 bg-red-100 text-red-700 rounded-full flex items-center justify-center font-bold text-xs">
                      {idx + 1}
                    </div>
                    <div className="flex-1 text-sm">{e}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <ObservatoireCrossLinks
        type="chantier"
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
