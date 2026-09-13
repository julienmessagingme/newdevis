/**
 * src/components/analysis/LeviersNegociation.tsx
 *
 * 🟢 Phase 4 (2026-08-15) — « Vos leviers de négociation » (Maillon 3).
 * Spec : docs/refonte/BUGS-A-CORRIGER.md § "Spec produit validée".
 *
 * Affiche les 3 leviers max hiérarchisés produits par leviersBuilder.ts
 * (déterministe, côté serveur). Remplace la liste de 6-8 actions dans le
 * chemin de lecture principal : l'utilisateur sait par où commencer.
 *
 * Rendu uniquement si `conclusion.leviers` est présent (conclusions Phase 4+).
 * Les conclusions antérieures gardent la fiche « Préparez votre rendez-vous »
 * comme seul bloc actionnable.
 */

import SondageInteret from "./SondageInteret";
import type { ConclusionData } from "@/lib/analyse/conclusionTypes";

/**
 * 2026-09-13 — le sondage dommages-ouvrage est identique où qu'il soit posé
 * (sous le conseil DO, ou seul quand le devis touche au gros œuvre sans que le
 * conseil se déclenche). Une seule définition pour éviter que les deux
 * emplacements divergent.
 * ⚠️ La question ne parle PAS de « proposition » : c'est un sondage, pas une
 * offre. Et elle ne s'adresse qu'aux devis de gros œuvre — la poser sur un
 * devis de peinture produirait du bruit et nous décrédibiliserait.
 */
const sondageDo = (analysisId: string) =>
  ({
    analysisId,
    sujet: "dommages_ouvrage" as const,
    tone: "sky" as const,
    // Même correction de registre que pour le financement : on s'adresse à
    // quelqu'un qui analyse un devis, pas à quelqu'un qui a déjà entamé une
    // démarche d'assurance.
    question:
      "Ces travaux touchent à la structure du bâtiment. Envisagez-vous une assurance dommages-ouvrage ?",
    reponses: [
      { valeur: "interesse" as const, libelle: "Je ne l'ai pas et ça m'intéresse" },
      { valeur: "deja_equipe" as const, libelle: "Je l'ai déjà" },
      { valeur: "non" as const, libelle: "Je ne compte pas en prendre" },
    ],
    provenance:
      "Nous vérifions ce point parce que nos fondateurs viennent de l'assurance et de la banque.",
  });

const NIVEAU_STYLE: Record<
  string,
  { badge: string; label: string; ring: string }
> = {
  puissant: {
    badge: "bg-rose-100 text-rose-800",
    label: "Le plus puissant",
    ring: "border-rose-200",
  },
  important: {
    badge: "bg-amber-100 text-amber-800",
    label: "Important",
    ring: "border-amber-200",
  },
  bonus: {
    badge: "bg-slate-100 text-slate-700",
    label: "Bonus",
    ring: "border-slate-200",
  },
};

// 2026-08-18 (retour Johan) — les actions de SÉCURISATION (assurance,
// références) ne sont pas des leviers de négociation : badge dédié, et si la
// liste n'en contient QUE, le bloc change de titre pour ne pas promettre une
// négociation qui n'existe pas.
const SECURISER_STYLE = {
  badge: "bg-sky-100 text-sky-800",
  label: "Sécurisation",
  ring: "border-sky-200",
};

interface LeviersNegociationProps {
  conclusion: ConclusionData;
  /** 2026-08-27 — requis pour les mesures d'intérêt (DO, crédit). */
  analysisId?: string;
  /** 2026-08-29 — montant HT du devis : le test « crédit » n'est proposé
   *  qu'à partir de 5 000 € (en dessous, un financement n'a pas de sens). */
  totalHt?: number | null;
  /** 2026-08-30 — analyse en attente de validation experte : aucun montant
   *  d'écart affiché tant que l'expert n'a pas tranché. */
  provisoire?: boolean;
}

export default function LeviersNegociation({ conclusion, analysisId, totalHt, provisoire = false }: LeviersNegociationProps) {
  // 2026-08-30 — en attente de validation experte, le levier de surcoût est
  // retiré : c'est le seul qui chiffre un écart, et c'est précisément ce que
  // l'expert doit confirmer. Les autres leviers (clauses, acompte, assurance)
  // reposent sur des faits du devis, pas sur notre comparaison de prix.
  const leviers = (conclusion.leviers ?? []).filter(
    (l) => !(provisoire && l.type === "surcout_postes"),
  );
  if (leviers.length === 0) return null;

  // 2026-09-13 — où poser le sondage dommages-ouvrage.
  // Sous le conseil DO quand il existe (il y est à sa place) ; sinon, seul,
  // dès que le devis touche au gros œuvre. ⚠️ Jamais les deux à la fois.
  // ⚠️ Le levier `dommages_ouvrage_verification` (« une DO est déjà facturée
  // sur ce devis ») EXCLUT la question : demander à quelqu'un s'il envisage
  // une assurance qu'il paie déjà est la meilleure façon de se décrédibiliser.
  const conseilDoPresent = leviers.some((l) => l.type === "dommages_ouvrage");
  const doDejaAuDevis = leviers.some((l) => l.type === "dommages_ouvrage_verification");
  const sondageDoHorsListe =
    !conseilDoPresent && !doDejaAuDevis && conclusion.travaux_gros_oeuvre === true;

  const hasNegocier = leviers.some((l) => l.objectif !== "securiser");
  const title = hasNegocier ? "Vos leviers de négociation" : "Avant de signer";
  // 2026-08-27 (retour Johan) — compteur DYNAMIQUE : « deux vérifications »
  // en dur s'affichait au-dessus d'un seul levier.
  const subtitle = hasNegocier
    ? "Par ordre de puissance — commencez par le premier."
    : leviers.length === 1
      ? "Rien de significatif à négocier sur ce devis — une vérification de bon sens suffit."
      : "Rien de significatif à négocier sur ce devis — quelques vérifications de bon sens suffisent.";

  return (
    <section
      aria-label={title}
      className="rounded-2xl border border-border/60 bg-card px-6 py-6 md:px-8 md:py-7"
    >
      <h2 className="text-[17px] font-semibold text-foreground mb-1">
        {title}
      </h2>
      <p className="text-[13px] text-foreground/60 mb-5 leading-relaxed">
        {subtitle}
      </p>

      <ol className="space-y-4">
        {leviers.map((levier, i) => {
          const style = levier.objectif === "securiser"
            ? SECURISER_STYLE
            : (NIVEAU_STYLE[levier.niveau] ?? NIVEAU_STYLE.bonus);
          return (
            <li
              key={i}
              className={`rounded-xl border ${style.ring} bg-background/40 p-4`}
            >
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/5 text-[13px] font-semibold text-foreground/70">
                  {i + 1}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${style.badge}`}
                >
                  {style.label}
                </span>
              </div>
              <p className="text-[15px] font-medium text-foreground leading-snug">
                {levier.titre}
              </p>
              <p className="mt-1 text-[13.5px] text-foreground/70 leading-relaxed">
                {levier.detail}
              </p>
              {levier.type === "dommages_ouvrage" && analysisId && !sondageDoHorsListe && (
                <SondageInteret {...sondageDo(analysisId)} />
              )}
            </li>
          );
        })}
      </ol>

      {/* 2026-09-13 — le sondage dommages-ouvrage est posé à TOUTE la population
          concernée (devis touchant au gros œuvre), et plus seulement là où le
          CONSEIL DO se déclenche : 2 affichages en quinze jours ne permettaient
          aucune conclusion. Quand le conseil est là, la question reste sous lui
          (elle y est à sa place) ; sinon elle vient ici.
          ⚠️ `travaux_gros_oeuvre` est absent des conclusions antérieures →
          l'ancien comportement est conservé pour elles. */}
      {analysisId && sondageDoHorsListe && <SondageInteret {...sondageDo(analysisId)} />}

      {/* 2026-08-29 — test « financement des travaux » (3 mois). Proposé sur
          les devis ≥ 5 000 € HT, indépendamment du verdict : le besoin de
          financement n'a rien à voir avec la qualité du devis. */}
      {analysisId && typeof totalHt === "number" && totalHt >= 5000 && (
        <SondageInteret
          analysisId={analysisId}
          sujet="credit"
          tone="indigo"
          // 2026-09-13 (retour Johan) — « qu'envisagez-vous ? » et non « où en
          // êtes-vous ? ». La seconde présuppose une démarche déjà engagée ;
          // or on s'adresse à quelqu'un qui est en train d'ANALYSER un devis,
          // donc avant son choix. Poser la question au mauvais stade fait
          // répondre « ça ne me concerne pas » à des gens que ça concerne.
          question={`Pour financer ces travaux (${Math.round(totalHt).toLocaleString("fr-FR")} € HT), qu'envisagez-vous ?`}
          reponses={[
            { valeur: "interesse", libelle: "Je cherche une solution" },
            { valeur: "deja_equipe", libelle: "J'ai déjà mon financement" },
            { valeur: "non", libelle: "Je paie sans emprunter" },
          ]}
          provenance="Nos fondateurs ont exercé 20 ans en banque et en assurance, dont le crédit immobilier."
        />
      )}
    </section>
  );
}
