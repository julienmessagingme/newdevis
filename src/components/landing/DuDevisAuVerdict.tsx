/**
 * src/components/landing/DuDevisAuVerdict.tsx
 *
 * 2026-09-08 (retour Johan) — « cette partie du site est un peu triste, ne se
 * démarque pas ».
 *
 * Remplace DEUX sections de la page d'accueil : « Comment ça marche ? » et
 * « Ce que vous obtenez ». Le fond gris n'était pas seul en cause — la zone
 * empilait **huit boîtes blanches quasi identiques** (même rayon, même bordure,
 * même ombre) dans deux bandes grises successives : rien ne ressortait parce
 * que tout ressortait pareil. Trois autres défauts s'y ajoutaient :
 *
 *   · les deux sections se répétaient — l'étape « Verdict clair + arguments
 *     prêts » et les cartes « Verdict global » / « Arguments pour négocier »
 *     disaient la même chose à trois écrans d'écart ;
 *   · on DÉCRIVAIT le produit au lieu de le MONTRER, alors que la sortie de
 *     l'analyse est précisément ce qu'aucun comparateur ne peut copier ;
 *   · les emojis (🔍 💶 📋 🏢 ⚠️) desservaient une promesse de rigueur — ce sont
 *     les mêmes qu'on avait retirés du hero le 07/09.
 *
 * D'où une composition unique : le parcours à gauche, le résultat à droite.
 * Huit boîtes deviennent un objet, et la redondance disparaît d'elle-même.
 *
 * ⚠️ AUCUN ÉTAT, AUCUN GESTIONNAIRE — donc rendu SANS directive client dans
 * index.astro : HTML au build, zéro JS envoyé. Y ajouter la moindre
 * interactivité obligerait à repasser en île (cf. CLAUDE.md § client:only).
 *
 * ⚠️ La fiche de droite est un EXEMPLE FABRIQUÉ, et la page le dit. Ce n'est
 * pas une analyse réelle, et elle ne doit jamais être présentée comme telle.
 * Ses fourchettes de référence viennent en revanche du vrai référentiel : si le
 * catalogue bouge, l'exemple ne devient pas faux.
 */

import { AlertTriangle } from "lucide-react";
import { poste, CATALOGUE_TAILLE } from "@/lib/prix/reference";

const etapes = [
  {
    titre: "Vous déposez votre devis",
    detail: "PDF, photo ou scan. Rien à ressaisir.",
  },
  {
    titre: "On compare trois choses",
    detail: `Le prix poste par poste sur ${CATALOGUE_TAILLE.toLocaleString("fr-FR")} références, l'entreprise dans les registres officiels, et les clauses du devis.`,
  },
  {
    titre: "Vous décidez",
    detail: "Signer, négocier ou refuser — avec les phrases exactes à envoyer à votre artisan.",
  },
];

const carrelage = poste("carrelage_fourni_pose");
const peinture = poste("peinture_murs_plafonds");

const lignesExemple = [
  {
    libelle: "Pose carrelage sol",
    reference: `Référence : ${carrelage.min} à ${carrelage.max} € HT/m²`,
    valeur: "128 €/m²",
    cher: true,
  },
  {
    libelle: "Peinture murs et plafonds",
    reference: `Référence : ${peinture.min} à ${peinture.max} € HT/m²`,
    valeur: "42 €/m²",
    cher: false,
  },
  {
    libelle: "L'entreprise",
    reference: "SIRET actif · 11 ans d'ancienneté · RGE vérifié",
    valeur: "Fiable",
    cher: false,
  },
];

const DuDevisAuVerdict = () => {
  return (
    /* Pas d'`id="comment-ca-marche"` ici : `index.astro` pose déjà un div
       d'ancrage juste avant, pour que le header collant ne recouvre pas le
       titre. Le porter aussi sur la section créait un id EN DOUBLE — le lien
       du menu sautait sur le premier, qui est vide. Défaut préexistant, hérité
       de HowItWorksSection ; corrigé ici. */
    <section className="py-12 sm:py-16 bg-background border-b border-border">
      <div className="container">
        <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-10 lg:gap-14 items-center max-w-5xl mx-auto">

          {/* ── Le parcours ─────────────────────────────────────────────── */}
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mb-1">
              Du devis au verdict
            </h2>
            <p className="text-sm text-muted-foreground mb-7">
              Moins d'une minute, aucune saisie à faire.
            </p>

            <ol className="space-y-0">
              {etapes.map((etape, i) => (
                <li key={etape.titre} className="relative grid grid-cols-[28px_1fr] gap-3 pb-6 last:pb-0">
                  {/* Le filet ne relie que les étapes entre elles : il s'arrête
                      avant la dernière, sinon il pend dans le vide. */}
                  {i < etapes.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[13.5px] top-7 bottom-1 w-px bg-border"
                    />
                  )}
                  <span className="relative z-10 w-7 h-7 rounded-full bg-accent text-primary grid place-items-center text-xs font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-foreground leading-snug">
                      {etape.titre}
                    </p>
                    <p className="text-[13px] text-muted-foreground leading-relaxed mt-0.5">
                      {etape.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <a
              href="/nouvelle-analyse"
              className="inline-flex items-center justify-center mt-8 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm px-6 py-3 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Savoir si je peux signer
            </a>
          </div>

          {/* ── Le résultat ─────────────────────────────────────────────── */}
          <div>
            <div className="vmd-scan relative rounded-2xl border border-border bg-card overflow-hidden card-shadow-lg">
              <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3 flex-wrap">
                <span className="bg-[#F97316] text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full">
                  À négocier
                </span>
                <span className="text-xs text-primary-foreground/75">
                  Devis n° 2026-0431 · Salle de bain
                </span>
              </div>

              <div className="px-4 py-4">
                <div className="flex items-baseline gap-2.5 mb-3">
                  <span className="text-3xl font-bold text-destructive tracking-tight tabular-nums">
                    +1 480 €
                  </span>
                  <span className="text-xs text-muted-foreground">
                    au-dessus des fourchettes, sur 2 postes nommés
                  </span>
                </div>

                <dl className="m-0">
                  {lignesExemple.map((ligne) => (
                    <div
                      key={ligne.libelle}
                      className="grid grid-cols-[1fr_auto] gap-3 items-center py-2.5 border-t border-border/70"
                    >
                      <dt className="min-w-0">
                        <span className="block text-[13px] text-foreground">{ligne.libelle}</span>
                        <span className="block text-[11px] text-muted-foreground">{ligne.reference}</span>
                      </dt>
                      <dd
                        className={`m-0 text-[13px] font-bold tabular-nums whitespace-nowrap ${
                          ligne.cher ? "text-destructive" : "text-emerald-700"
                        }`}
                      >
                        {ligne.valeur}
                      </dd>
                    </div>
                  ))}
                </dl>

                <p className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive leading-relaxed">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-px" aria-hidden="true" />
                  <span>
                    <strong className="font-semibold">Acompte de 50 %</strong> demandé à la
                    signature — 30 % est l'usage.
                  </span>
                </p>
              </div>
            </div>

            {/* La mention n'est pas une précaution juridique : une capture qui
                ressemble à une vraie analyse DOIT dire qu'elle n'en est pas une. */}
            <p className="text-[11px] text-muted-foreground text-center mt-2.5">
              Exemple illustratif — les fourchettes affichées sont celles de notre référentiel.
            </p>
          </div>

        </div>
      </div>
    </section>
  );
};

export default DuDevisAuVerdict;
