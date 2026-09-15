/**
 * src/components/analysis/MaterielVerifie.tsx
 *
 * 2026-09-15 — LE MATÉRIEL QU'ON A PU CHIFFRER PAR SA RÉFÉRENCE FABRICANT.
 *
 * Origine : un devis de climatisation déclaré « cohérent » alors que 15 625 €
 * sur 16 485 € n'avaient aucune référence. Ces climatiseurs ne sont pourtant
 * ni du sur-mesure ni du réglementaire — ce sont des produits de catalogue
 * dont le prix est public. Le devis était bien correct ; simplement, on
 * n'avait rien pour le dire.
 *
 * 🔴 CE BLOC NE DÉNONCE PAS UNE MARGE, IL DONNE UNE RÉFÉRENCE.
 * La marge de l'installateur sur le matériel est de +30 à +50 % — mesuré sur
 * 16 références, chez des artisans différents, sur deux marques. C'est le
 * fonctionnement normal du métier : il achète avec une remise de négociant et
 * revend. On ne le commente donc pas en dessous de +50 %.
 *
 * ⚠️ AUCUN LIEN MARCHAND, ET C'EST DÉLIBÉRÉ. Pousser le lecteur à acheter le
 * matériel lui-même serait un mauvais conseil : beaucoup d'artisans refusent
 * de poser du matériel fourni par le client, ou déclinent leur garantie
 * dessus. On donne de quoi NÉGOCIER, pas de quoi court-circuiter.
 */

import { PackageSearch } from "lucide-react";
import type { ConclusionData } from "@/lib/analyse/conclusionTypes";

type Materiel = NonNullable<ConclusionData["materiel_verifie"]>[number];

const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

const dateCourte = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : iso;
};

const TON: Record<Materiel["zone"], { cadre: string; badge: string; libelle: string }> = {
  normal:   { cadre: "border-border/60",  badge: "bg-emerald-100 text-emerald-800", libelle: "Prix cohérent" },
  mention:  { cadre: "border-amber-200",  badge: "bg-amber-100 text-amber-800",     libelle: "Un peu au-dessus" },
  question: { cadre: "border-rose-200",   badge: "bg-rose-100 text-rose-800",       libelle: "À faire expliquer" },
};

export default function MaterielVerifie({ materiel }: { materiel: Materiel[] }) {
  if (!materiel || materiel.length === 0) return null;

  const aExpliquer = materiel.filter((m) => m.zone === "question");
  const aMentionner = materiel.filter((m) => m.zone === "mention");
  const releve = materiel[0]?.releve_le ?? "";
  // Toutes nos entrées ont au moins deux sources (contrainte SQL) ; on annonce
  // le minimum du lot, jamais un chiffre plus flatteur.
  const sourcesMin = Math.min(...materiel.map((m) => m.nb_sources));

  return (
    <section
      aria-label="Matériel vérifié"
      className="rounded-2xl border border-border/60 bg-card px-6 py-6 md:px-8 md:py-7"
    >
      <div className="flex items-start gap-3 mb-1">
        <PackageSearch className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <h2 className="text-[17px] font-semibold text-foreground">
          Le matériel de ce devis, chiffré
        </h2>
      </div>

      <p className="text-[13px] text-foreground/60 mb-5 leading-relaxed">
        {materiel.length === 1 ? "Un équipement est identifié" : `${materiel.length} équipements sont identifiés`}
        {" "}par leur référence fabricant. Nous les avons comparés au prix auquel vous les
        achèteriez vous-même chez un distributeur — pas au prix payé par l'artisan, que
        personne ne connaît.{" "}
        {aExpliquer.length === 0 && aMentionner.length === 0
          ? "Tout est dans les usages du métier."
          : "L'écart au-dessus de ce prix couvre sa pose, son déplacement et sa garantie."}
      </p>

      <ul className="space-y-3">
        {materiel.map((m, i) => {
          const t = TON[m.zone];
          return (
            <li key={`${m.reference}-${i}`} className={`rounded-xl border ${t.cadre} bg-background/40 p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                {/* ⚠️ Le titre est la LIGNE DU DEVIS, jamais notre désignation
                    catalogue — règle du 2026-09-10 : le lecteur doit
                    reconnaître sa ligne. */}
                <p className="text-[14.5px] font-medium text-foreground leading-snug min-w-0 flex-1">
                  {m.ligne}
                </p>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${t.badge}`}>
                  {t.libelle}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-[13px]">
                <div>
                  <span className="text-foreground/55">Facturé</span>{" "}
                  <span className="font-semibold text-foreground">{euros(m.prix_unitaire_devis)}</span>
                  {m.quantite > 1 && (
                    <span className="text-foreground/55"> l'unité ({m.quantite} × )</span>
                  )}
                </div>
                <div>
                  <span className="text-foreground/55">En distribution</span>{" "}
                  <span className="font-semibold text-foreground">
                    {euros(m.marche_min_ht)} à {euros(m.marche_max_ht)}
                  </span>
                  <span className="text-foreground/55"> HT</span>
                </div>
                <div>
                  <span className="text-foreground/55">Réf.</span>{" "}
                  <span className="font-mono text-[12px] text-foreground">{m.reference}</span>
                </div>
              </div>

              {m.zone !== "normal" && (
                <p className="mt-2.5 text-[13px] text-foreground/75 leading-relaxed">
                  {m.zone === "question"
                    ? `Cet équipement est facturé environ ${m.ecart_min_pct} % au-dessus de son prix en distribution, quand l'usage se situe entre 30 et 50 %. Demandez à l'artisan le détail entre le matériel et la pose.`
                    : `L'écart (environ ${m.ecart_min_pct} %) dépasse un peu l'usage du métier. De quoi en parler, sans que ce soit anormal.`}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* 🔴 LA SOURCE ET LA DATE SONT AFFICHÉES — c'est ce qui rend le chiffre
          opposable, et c'est une demande explicite de Johan. On cite le NOMBRE
          de distributeurs et la date plutôt que les noms : nommer un marchand
          nous rendrait dépendants de son erreur de prix, et la date, elle,
          reste vraie pour toujours. */}
      <p className="mt-5 text-[12px] text-foreground/55 leading-relaxed border-t border-border/40 pt-3">
        Prix relevés le {dateCourte(releve)} chez au moins {sourcesMin} distributeurs français,
        hors offres d'import à long délai et hors tarif catalogue constructeur — ce dernier
        vaut deux à trois fois le prix réellement pratiqué.
      </p>
    </section>
  );
}
