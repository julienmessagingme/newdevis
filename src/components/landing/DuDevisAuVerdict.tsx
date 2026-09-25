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

import { AlertTriangle, Check } from "lucide-react";
import { poste, CATALOGUE_TAILLE, ANALYSES_TOTAL } from "@/lib/prix/reference";

/**
 * 🔴 FUSION DU 2026-09-25 (décision Johan) — CETTE SECTION ABSORBE LES PREUVES
 * DU HERO, qui n'en porte plus aucune.
 *
 * LA RAISON EST MESURÉE, pas esthétique : les trois mêmes vérifications étaient
 * énoncées TROIS FOIS sur la page — dans les quatre preuves du hero, réécrites
 * à l'étape 2, puis DÉMONTRÉES par la carte d'exemple. Seule la carte prouve ;
 * les deux autres annonçaient. On garde donc la démonstration et on enrichit
 * l'étape 2 du vocabulaire précis qui vivait dans le hero.
 *
 * ⚠️ TOUT CE QUI DESCEND DOIT ATTERRIR, SINON C'EST UNE PERTE. Trois éléments
 * n'ont pas d'équivalent dans la carte et vivent désormais dans `preuves` :
 * le compteur d'analyses, la relecture humaine, et surtout la signature « sans
 * commission / sans revente de lead » — documentée le 07/09 comme la seule
 * promesse qu'un comparateur ne peut pas copier. **Ne jamais la laisser
 * disparaître d'une refonte.**
 */
const etapes = [
  {
    titre: "Vous déposez votre devis",
    detail: "PDF, photo ou scan. Rien à ressaisir.",
  },
  {
    titre: "On compare trois choses",
    // ⚠️ Le vocabulaire précis vient des preuves du hero : sans lui, « marché »,
    // « surcoût », « radiation » et « RGE » disparaîtraient de la page — mesuré
    // 10/12 mots-clés survivants avant cet enrichissement, 12/12 après.
    detail: `Le surcoût poste par poste face à ${CATALOGUE_TAILLE.toLocaleString("fr-FR")} références de prix du marché, l'entreprise dans les registres officiels (radiation, procédure collective, santé financière, certification RGE), et les clauses abusives du devis.`,
  },
  {
    titre: "Vous décidez",
    detail: "Signer, négocier ou refuser — avec les phrases exactes à envoyer à votre artisan.",
  },
];

/** Ce que la carte ne démontre pas — et qu'on ne peut donc pas se contenter de montrer. */
const preuves = [
  { fort: `${ANALYSES_TOTAL.toLocaleString("fr-FR")} devis analysés`, suite: "" },
  { fort: "Relu par un expert", suite: "— tant qu'il n'a pas tranché, aucun montant n'est affiché" },
  { fort: "Sans commission d'artisan. Sans revente de lead.", suite: "" },
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
                <span className="bg-[#C2410C] text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full">
                  À négocier
                </span>
                <span className="text-xs text-primary-foreground/75">
                  Devis n° 2026-0431 · Salle de bain
                </span>
              </div>

              <div className="px-4 py-4">
                {/* 2026-09-08 — sur mobile, « +1 480 € » se cassait en TROIS lignes.
                    Un élément flex peut rétrécir sous la largeur de son contenu : le
                    montant se faisait comprimer par la légende à côté de lui. D'où
                    `whitespace-nowrap` sur le chiffre — un montant ne se coupe jamais —
                    et l'empilement en dessous de `sm`, où les deux ne tiennent pas
                    côte à côte.
                    ⚠️ Séparateur de milliers en insécable NORMALE (U+00A0) : l'espace
                    fine U+202F, pourtant correcte en typographie française, ne rend pas
                    dans DM Sans — on lisait « +1480 € ». Vérifié à l'écran. */}
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2.5 mb-3">
                  <span className="text-3xl font-bold text-destructive tracking-tight tabular-nums whitespace-nowrap">
                    +1&nbsp;480&nbsp;€
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

            {/* 2026-09-25 — le lien vers la démo quitte le hero et se pose ICI,
                sous la carte dont il est le prolongement naturel.
                ⚠️ LE LIBELLÉ NE DIT PAS « RÉELLE », ET C'EST DÉLIBÉRÉ : le devis
                de la page démo est FICTIF, nous l'avons écrit. Publier l'analyse
                d'un vrai client est exclu — un devis appartient aussi à
                l'artisan qui l'a émis, tiers qui n'a jamais consenti (précédent
                du 10/09). Les fourchettes et les règles, elles, sont vraies. */}
            <p className="text-center mt-2">
              <a
                href="/exemple-analyse"
                className="text-[13px] text-primary underline underline-offset-2 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Voir un exemple d'analyse complet
              </a>
            </p>
          </div>

        </div>

        {/* ── Ce que la carte ne montre pas ──────────────────────────────
            Ces trois faits n'ont aucun équivalent dans l'exemple : on ne peut
            donc pas se contenter de les démontrer, il faut les dire. */}
        <ul className="mx-auto mt-12 flex max-w-5xl flex-col gap-3 border-t border-border pt-7 text-[13px] text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-9 sm:gap-y-3">
          {preuves.map((p) => (
            <li key={p.fort} className="flex items-start gap-2">
              <Check className="mt-px h-4 w-4 flex-shrink-0 text-score-green-foreground" aria-hidden="true" />
              <span>
                <strong className="font-semibold text-foreground">{p.fort}</strong>
                {p.suite ? ` ${p.suite}` : ""}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-center text-[12px]">
          <a
            href="/comprendre-score"
            className="text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Voir en détail ce qui est analysé
          </a>
        </p>
      </div>
    </section>
  );
};

export default DuDevisAuVerdict;
