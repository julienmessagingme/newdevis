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

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/integrations/amplitude";
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
  /** 2026-08-27 — requis pour la mesure d'intérêt dommages-ouvrage. */
  analysisId?: string;
}

/**
 * 2026-08-27 (décision Johan) — mesure d'intérêt « dommages-ouvrage », test de
 * 3 mois. Affiché sous le conseil DO uniquement. AUCUN lead n'est transmis à
 * un tiers aujourd'hui : le libellé le dit honnêtement (« dès qu'un partenaire
 * sera en place »), on ne promet pas un devis qu'on ne peut pas fournir.
 * Verdict du test : aucun clic en 3 mois = piste abandonnée.
 */
function DommagesOuvrageInterest({ analysisId }: { analysisId: string }) {
  const storageKey = `vmd_do_interest_${analysisId}`;
  const [state, setState] = useState<"idle" | "sending" | "done">(() => {
    try {
      return localStorage.getItem(storageKey) === "1" ? "done" : "idle";
    } catch {
      return "idle";
    }
  });

  const send = async () => {
    setState("sending");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        await fetch(`/api/analyse/${analysisId}/do-interest`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        });
      }
      trackEvent("do_interest_click", { analysis_id: analysisId });
      try { localStorage.setItem(storageKey, "1"); } catch { /* ignore */ }
    } catch {
      /* mesure best-effort — on remercie quand même */
    }
    setState("done");
  };

  if (state === "done") {
    return (
      <p className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-[13px] text-emerald-900">
        Merci — c'est noté. Nous vous recontacterons dès qu'un partenaire assurance sera en place.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/60 px-3.5 py-3">
      <p className="text-[13px] text-sky-950 leading-relaxed mb-2">
        Souhaitez-vous recevoir une proposition de dommages-ouvrage, sans engagement&nbsp;?
      </p>
      <button
        type="button"
        onClick={send}
        disabled={state === "sending"}
        className="rounded-lg bg-sky-700 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-sky-800 disabled:opacity-60"
      >
        {state === "sending" ? "…" : "Oui, ça m'intéresse"}
      </button>
    </div>
  );
}

export default function LeviersNegociation({ conclusion, analysisId }: LeviersNegociationProps) {
  const leviers = conclusion.leviers ?? [];
  if (leviers.length === 0) return null;

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
              {levier.type === "dommages_ouvrage" && analysisId && (
                <DommagesOuvrageInterest analysisId={analysisId} />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
