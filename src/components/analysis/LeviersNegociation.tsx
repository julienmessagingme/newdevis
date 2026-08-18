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

import type { ConclusionData } from "@/lib/analyse/conclusionTypes";

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
}

export default function LeviersNegociation({ conclusion }: LeviersNegociationProps) {
  const leviers = conclusion.leviers ?? [];
  if (leviers.length === 0) return null;

  const hasNegocier = leviers.some((l) => l.objectif !== "securiser");
  const title = hasNegocier ? "Vos leviers de négociation" : "Avant de signer";
  const subtitle = hasNegocier
    ? "Par ordre de puissance — commencez par le premier."
    : "Rien de significatif à négocier sur ce devis — deux vérifications de bon sens suffisent.";

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
            </li>
          );
        })}
      </ol>
    </section>
  );
}
