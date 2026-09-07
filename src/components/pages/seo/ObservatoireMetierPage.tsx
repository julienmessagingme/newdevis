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
import type { InternalLink } from "@/lib/seo/internalLinking";
import { getObservatoireCrossLinks } from "@/lib/seo/observatoireCrossLinks";

/** Ce que le prix d'un poste couvre — déduit du libellé catalogue. */
export type NaturePrix = "fourni_pose" | "pose_seule" | "non_precise";

export interface PosteMetier {
  label: string;
  unite: string;
  nbObs: number;
  p10: number;
  mediane: number;
  p90: number;
  /** Rapport P90/P10 : l'écart entre artisans, à prestation et unité égales. */
  ecart: number;
  nature_prix: NaturePrix;
}

export interface MetierData {
  slug: string;                     // "peinture-revetements"
  metier: string;                   // "peinture_revetements"
  metier_label: string;             // "Peinture & revêtements"
  title: string;                    // "Prix moyens & anomalies : Peinture & revêtements"
  description: string;
  lastGenerated: string;
  intro: string;
  /** Postes publiables (≥ 5 observations, unité connue, forfaits exclus). */
  postes?: PosteMetier[];
  /** Le poste au plus fort écart parmi ceux qui pèsent — l'accroche de la page. */
  fait_marquant?: PosteMetier | null;
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

function fmtEUR(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toLocaleString("fr-FR") + " €";
}

/** Écart P90/P10, avec la virgule décimale française. */
function fmtEcart(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Unité écrite comme on la lit sur un devis. */
function fmtUnite(u: string): string {
  if (u === "u") return "l'unité";
  if (u === "h") return "l'heure";
  if (u === "j") return "la journée";
  return `le ${u}`;
}

const NATURE_LABEL: Record<NaturePrix, string> = {
  fourni_pose: "Fourniture + pose",
  pose_seule: "Pose seule",
  non_precise: "Périmètre non précisé",
};

const NATURE_CLASS: Record<NaturePrix, string> = {
  fourni_pose: "bg-green-50 text-green-800 border-green-200",
  pose_seule: "bg-amber-50 text-amber-800 border-amber-200",
  non_precise: "bg-muted text-muted-foreground border-border",
};

function BadgeNature({ nature }: { nature: NaturePrix }) {
  return (
    <span
      className={
        "inline-block text-[11px] font-semibold px-2 py-0.5 rounded border whitespace-nowrap " +
        NATURE_CLASS[nature]
      }
    >
      {NATURE_LABEL[nature]}
    </span>
  );
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
          {/* Le chiffre à retenir — remplace l'ancien « panier moyen ». */}
          {marquant && (
            <section className="my-8 bg-accent border border-primary/20 rounded-xl p-5 md:p-6">
              <div className="text-[11px] uppercase tracking-wider text-primary font-semibold mb-2">
                Le chiffre à retenir
              </div>
              <p className="text-xl md:text-2xl font-bold leading-snug mb-3">
                {marquant.label}, c'est {fmtEUR(marquant.p10)} chez les artisans les moins chers
                et {fmtEUR(marquant.p90)} chez les plus chers — pour {fmtUnite(marquant.unite)}.
              </p>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <BadgeNature nature={marquant.nature_prix} />
                <span>
                  Soit un rapport de {fmtEcart(marquant.ecart)} entre les deux, sur{" "}
                  {marquant.nbObs} devis. Prix médian : <strong>{fmtEUR(marquant.mediane)}</strong>.
                </span>
              </div>
            </section>
          )}

          {/* Prix poste par poste, à unité égale. */}
          <section className="my-10">
            <h2 className="text-xl font-bold tracking-tight mb-2">
              Prix relevés, poste par poste
            </h2>
            <p className="text-sm text-muted-foreground mb-4 max-w-3xl leading-relaxed">
              Chaque ligne regroupe des devis qui facturent la même prestation dans la même
              unité. Les fourchettes vont du 10<sup>e</sup> au 90<sup>e</sup> centile : les dix
              pour cent de devis les moins chers et les dix pour cent les plus chers sont exclus,
              pour qu'un devis atypique ne fasse pas la fourchette.
            </p>
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="min-w-[640px] w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-semibold">Poste</th>
                    <th className="py-2 px-3 font-semibold">Le moins cher</th>
                    <th className="py-2 px-3 font-semibold">Prix médian</th>
                    <th className="py-2 px-3 font-semibold">Le plus cher</th>
                    <th className="py-2 pl-3 font-semibold text-right">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {postes.map((p) => (
                    <tr key={p.label + p.unite} className="border-b border-border/60 align-top">
                      <td className="py-3 pr-3">
                        <div className="font-medium">{p.label}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <BadgeNature nature={p.nature_prix} />
                          <span className="text-[11px] text-muted-foreground">
                            pour {fmtUnite(p.unite)} · {p.nbObs} devis
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">{fmtEUR(p.p10)}</td>
                      <td className="py-3 px-3 whitespace-nowrap font-semibold">
                        {fmtEUR(p.mediane)}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">{fmtEUR(p.p90)}</td>
                      <td
                        className={
                          "py-3 pl-3 text-right font-bold whitespace-nowrap " +
                          (p.ecart >= 3 ? "text-red-600" : p.ecart >= 1.8 ? "text-amber-600" : "")
                        }
                      >
                        ×{fmtEcart(p.ecart)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Comment lire ces prix — la vraie valeur ajoutée d'un observatoire. */}
          <section className="my-10 bg-card border border-border rounded-xl p-5 md:p-6">
            <h2 className="text-lg font-bold mb-3">Comment lire ces prix</h2>
            <div className="space-y-4 text-sm text-foreground/80 leading-relaxed">
              <div>
                <h3 className="font-semibold text-foreground mb-1">
                  Vérifiez d'abord ce que le prix couvre
                </h3>
                <p>
                  C'est le premier écart entre deux devis, avant même la marge de l'artisan : un
                  prix <strong>fourniture + pose</strong> comprend le matériel, un prix{" "}
                  <strong>pose seule</strong> ne facture que la main-d'œuvre — le matériel est
                  alors soit acheté par vous, soit facturé sur une autre ligne. Deux devis peuvent
                  être écrits de ces deux façons pour le même chantier ; comparer leurs totaux au
                  poste n'a alors aucun sens.
                </p>
                <p className="mt-2 text-muted-foreground">
                  Ces deux fourchettes ne se soustraient pas non plus : elles proviennent de devis
                  différents, et l'écart entre elles ne donne pas le prix du matériel.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">
                  Ce qui fait varier un prix, à prestation identique
                </h3>
                <ul className="space-y-1.5 mt-1">
                  <li className="flex gap-2">
                    <span className="text-primary flex-shrink-0">→</span>
                    <span>
                      <strong>Les caractéristiques du produit</strong> : gamme et marque, double ou
                      triple vitrage, épaisseur d'isolant, classement d'usage d'un revêtement,
                      motorisation. C'est ce que le devis doit nommer, avec les références.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary flex-shrink-0">→</span>
                    <span>
                      <strong>Les dimensions</strong> : un prix à l'unité masque un écart de
                      surface. Une fenêtre de 60 × 75 cm et une baie de 2,40 m sont deux « unités ».
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary flex-shrink-0">→</span>
                    <span>
                      <strong>Ce qui entoure la pose</strong> : dépose et évacuation de l'ancien
                      ouvrage, reprise des finitions, étage sans ascenseur, échafaudage, accès
                      difficile. Souvent absent du devis, souvent facturé ensuite.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary flex-shrink-0">→</span>
                    <span>
                      <strong>Le taux de TVA</strong> : 10 % en rénovation d'un logement de plus de
                      deux ans, 5,5 % sur les travaux d'amélioration énergétique, 20 % sinon.
                      Vérifiez toujours si la fourchette que vous comparez est HT ou TTC — les
                      chiffres de cette page sont hors taxes.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </section>


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
