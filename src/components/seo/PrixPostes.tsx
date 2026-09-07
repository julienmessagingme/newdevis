/**
 * src/components/seo/PrixPostes.tsx
 *
 * 2026-09-07 (retour Johan) — L'AFFICHAGE D'UN PRIX, DÉFINI UNE SEULE FOIS.
 *
 * « 1 397 € de panier moyen, et alors ? » Les pages métier ET chantier
 * affichaient des moyennes calculées toutes unités confondues — une poignée de
 * porte et une baie vitrée dans la même médiane. Elles montrent désormais les
 * prix POSTE PAR POSTE, à unité égale.
 *
 * Ces trois blocs vivent ici plutôt qu'en double dans les deux pages : la règle
 * de calcul est déjà unique (`src/lib/observatoire/statsPrix.ts`), sa
 * présentation doit l'être aussi, sans quoi les deux familles de pages
 * divergeront au premier ajustement.
 */

export type NaturePrix = "fourni_pose" | "pose_seule" | "non_precise";

export interface PostePublieVue {
  label: string;
  unite: string;
  /** Nombre de lignes retenues. */
  nbObs: number;
  /** Nombre de DEVIS distincts — c est ce que la page affiche. */
  nbDevis: number;
  p10: number;
  mediane: number;
  p90: number;
  /** Rapport P90/P10 : l'écart entre artisans, à prestation et unité égales. */
  ecart: number;
  nature_prix: NaturePrix;
}

export function fmtEUR(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toLocaleString("fr-FR") + " €";
}

/** Écart P90/P10, avec la virgule décimale française. */
export function fmtEcart(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Unité écrite comme on la lit sur un devis. */
export function fmtUnite(u: string): string {
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

export function BadgeNature({ nature }: { nature: NaturePrix }) {
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

/** L'accroche de la page — ce qui remplace l'ancien « panier moyen ». */
export function FaitMarquantBloc({ poste }: { poste: PostePublieVue | null }) {
  if (!poste) return null;
  return (
    <section className="my-8 bg-accent border border-primary/20 rounded-xl p-5 md:p-6">
      <div className="text-[11px] uppercase tracking-wider text-primary font-semibold mb-2">
        Le chiffre à retenir
      </div>
      <p className="text-xl md:text-2xl font-bold leading-snug mb-3">
        {poste.label}, c'est {fmtEUR(poste.p10)} chez les artisans les moins chers et{" "}
        {fmtEUR(poste.p90)} chez les plus chers — pour {fmtUnite(poste.unite)}.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <BadgeNature nature={poste.nature_prix} />
        <span>
          Soit un rapport de {fmtEcart(poste.ecart)} entre les deux, sur {poste.nbDevis} devis. Prix
          médian : <strong>{fmtEUR(poste.mediane)}</strong>.
        </span>
      </div>
    </section>
  );
}

/** Le tableau des prix, une ligne par (poste, unité). */
export function TablePostes({ postes }: { postes: PostePublieVue[] }) {
  return (
    <section className="my-10">
      <h2 className="text-xl font-bold tracking-tight mb-2">Prix relevés, poste par poste</h2>
      <p className="text-sm text-muted-foreground mb-4 max-w-3xl leading-relaxed">
        Chaque ligne regroupe des devis qui facturent la même prestation dans la même unité. Les
        fourchettes vont du 10<sup>e</sup> au 90<sup>e</sup> centile : les dix pour cent de devis
        les moins chers et les dix pour cent les plus chers sont exclus, pour qu'un devis atypique
        ne fasse pas la fourchette.
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
                      pour {fmtUnite(p.unite)} · {p.nbDevis} devis
                    </span>
                  </div>
                </td>
                <td className="py-3 px-3 whitespace-nowrap">{fmtEUR(p.p10)}</td>
                <td className="py-3 px-3 whitespace-nowrap font-semibold">{fmtEUR(p.mediane)}</td>
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
  );
}

/**
 * L'explication — la vraie valeur ajoutée d'un observatoire.
 *
 * ⚠️ Le second paragraphe est un garde-fou, pas du remplissage : sans lui, un
 * lecteur soustrairait « pose seule » de « fourni + posé » pour en déduire le
 * prix du matériel. Sur la menuiserie, l'écart mesuré est de 75 €, ce qui
 * ferait une fenêtre quasi gratuite — c'est un artefact de rapprochement (les
 * lignes classées « Pose fenêtre » comprennent la fenêtre), pas un prix.
 */
export function CommentLireCesPrix() {
  return (
    <section className="my-10 bg-card border border-border rounded-xl p-5 md:p-6">
      <h2 className="text-lg font-bold mb-3">Comment lire ces prix</h2>
      <div className="space-y-4 text-sm text-foreground/80 leading-relaxed">
        <div>
          <h3 className="font-semibold text-foreground mb-1">
            Vérifiez d'abord ce que le prix couvre
          </h3>
          <p>
            C'est le premier écart entre deux devis, avant même la marge de l'artisan : un prix{" "}
            <strong>fourniture + pose</strong> comprend le matériel, un prix{" "}
            <strong>pose seule</strong> ne facture que la main-d'œuvre — le matériel est alors soit
            acheté par vous, soit facturé sur une autre ligne. Deux devis peuvent être écrits de ces
            deux façons pour le même chantier ; comparer leurs totaux au poste n'a alors aucun sens.
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
                <strong>Les caractéristiques du produit</strong> : gamme et marque, double ou triple
                vitrage, épaisseur d'isolant, classement d'usage d'un revêtement, motorisation.
                C'est ce que le devis doit nommer, avec les références.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary flex-shrink-0">→</span>
              <span>
                <strong>Les dimensions</strong> : un prix à l'unité masque un écart de surface. Une
                fenêtre de 60 × 75 cm et une baie de 2,40 m sont deux « unités ».
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary flex-shrink-0">→</span>
              <span>
                <strong>Ce qui entoure la pose</strong> : dépose et évacuation de l'ancien ouvrage,
                reprise des finitions, étage sans ascenseur, échafaudage, accès difficile. Souvent
                absent du devis, souvent facturé ensuite.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary flex-shrink-0">→</span>
              <span>
                <strong>Le taux de TVA</strong> : 10 % en rénovation d'un logement de plus de deux
                ans, 5,5 % sur les travaux d'amélioration énergétique, 20 % sinon. Vérifiez toujours
                si la fourchette que vous comparez est HT ou TTC — les chiffres de cette page sont
                hors taxes.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
