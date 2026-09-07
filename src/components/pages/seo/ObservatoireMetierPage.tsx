/**
 * src/components/pages/seo/ObservatoireMetierPage.tsx
 *
 * Rendu d'une page /observatoire/metiers/[slug].
 *
 * 2026-09-07 (retour Johan) — « 1 397 € de panier moyen, et alors ? »
 *
 * La page affichait quatre tuiles (prix moyen, médian, min–max, écart marché)
 * calculées sur TOUTES les lignes du métier, unités confondues : en menuiserie,
 * une poignée de porte et une baie vitrée dans la même médiane. Aucun de ces
 * chiffres ne répondait à une question que quelqu'un se pose.
 *
 * Elle affiche désormais des prix POSTE PAR POSTE, à unité égale, avec pour
 * chacun ce que le prix couvre (fourniture comprise ou pose seule) et l'écart
 * observé entre artisans. La règle d'agrégation vit dans
 * `src/lib/observatoire/statsPrix.ts` — une seule définition pour toutes les
 * pages de prix du site.
 *
 * ⚠️ On n'invite JAMAIS à soustraire « pose seule » de « fourni + posé » pour
 * en déduire le prix du matériel : ce sont deux séries de devis différents, et
 * sur la menuiserie l'écart mesuré (75 €) est un artefact de rapprochement, pas
 * le prix d'une fenêtre.
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


export interface MetierData {
  slug: string;                     // "peinture-revetements"
  metier: string;                   // "peinture_revetements"
  metier_label: string;             // "Peinture & revêtements"
  title: string;                    // "Prix moyens & anomalies : Peinture & revêtements"
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
  related?: InternalLink[];
}

export default function ObservatoireMetierPage({ data }: Props) {
  const postes = data.postes ?? [];
  const marquant = data.fait_marquant ?? null;
  // Une page ne montre des chiffres que si au moins un poste est publiable :
  // « nb_lignes > 0 » suffisait avant et laissait passer des moyennes bâties
  // sur trois lignes d'unités différentes.
  const hasData = postes.length > 0;
  const crossLinks = getObservatoireCrossLinks("metier", data.slug);

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
          <FaitMarquantBloc poste={marquant} />
          <TablePostes postes={postes} />
          <CommentLireCesPrix />


          {/* 2026-09-07 — SECTION « POSTES LES PLUS SURFACTURÉS » RETIRÉE.
           *
           * Elle accusait les artisans sur des bases indéfendables :
           *   - « Pose porte de garage +503 % » reposait sur TROIS devis, quand
           *     la règle de publication de cette page en exige huit ;
           *   - « Pose fenêtre +222 % sur 13 devis » contredisait le tableau
           *     juste au-dessus. En réalité les lignes rapprochées de ce libellé
           *     comprennent la fenêtre, alors que le tarif catalogue ne couvre
           *     que la main-d'œuvre : le dépassement mesure notre propre défaut
           *     de rapprochement, pas une surfacturation.
           *
           * Le champ reste dans le JSON, mais rien ne le publie tant qu'il n'est
           * pas calculé à périmètre comparable (même unité, même nature de prix)
           * et sur assez d'observations.
           */}

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

      <ObservatoireCrossLinks
        type="metier"
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
