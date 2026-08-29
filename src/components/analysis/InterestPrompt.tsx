/**
 * src/components/analysis/InterestPrompt.tsx
 *
 * 2026-08-29 — bloc générique de mesure d'intérêt (tests de 3 mois).
 * Sujets : `dommages_ouvrage` (sous le conseil DO) et `credit` (financement).
 *
 * Règles tenues :
 *  - AUCUN lead n'est transmis à un tiers aujourd'hui : le remerciement dit
 *    honnêtement « dès qu'un partenaire sera en place » — on ne promet pas
 *    une proposition qu'on ne peut pas fournir.
 *  - Discret : une question, un bouton. Jamais dans le message copiable
 *    envoyé à l'artisan.
 *  - Idempotent côté serveur + état « merci » persistant (localStorage) pour
 *    ne pas redemander à chaque visite.
 */

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/integrations/amplitude";

export type InterestTopic = "dommages_ouvrage" | "credit";

interface Props {
  analysisId: string;
  topic: InterestTopic;
  question: string;
  cta: string;
  /** Palette : sky (assurance) ou indigo (financement) */
  tone?: "sky" | "indigo";
  /**
   * 2026-08-29 — provenance des fondateurs. Justifie POURQUOI ce point est
   * vérifié (réflexe de banquier / d'assureur), pas une position de conseil
   * réglementé : formulation biographique et au passé, jamais « notre expert
   * vous conseille » (ORIAS / IOBSP).
   */
  provenance?: string;
}

const TONES = {
  sky: { box: "border-sky-200 bg-sky-50/60", text: "text-sky-950", btn: "bg-sky-700 hover:bg-sky-800" },
  indigo: { box: "border-indigo-200 bg-indigo-50/60", text: "text-indigo-950", btn: "bg-indigo-700 hover:bg-indigo-800" },
};

export default function InterestPrompt({ analysisId, topic, question, cta, tone = "sky", provenance }: Props) {
  const storageKey = `vmd_interest_${topic}_${analysisId}`;
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
        await fetch(`/api/analyse/${analysisId}/interest`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ topic }),
        });
      }
      trackEvent("interest_click", { topic, analysis_id: analysisId });
      try { localStorage.setItem(storageKey, "1"); } catch { /* ignore */ }
    } catch {
      /* mesure best-effort — on remercie quand même */
    }
    setState("done");
  };

  if (state === "done") {
    return (
      <p className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-[13px] text-emerald-900">
        Merci — c'est noté. Nous vous recontacterons dès qu'un partenaire sera en place.
      </p>
    );
  }

  const t = TONES[tone];
  return (
    <div className={`mt-3 rounded-lg border px-3.5 py-3 ${t.box}`}>
      <p className={`text-[13px] leading-relaxed mb-2 ${t.text}`}>{question}</p>
      <button
        type="button"
        onClick={send}
        disabled={state === "sending"}
        className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white transition-colors disabled:opacity-60 ${t.btn}`}
      >
        {state === "sending" ? "…" : cta}
      </button>
      {provenance && (
        <p className="mt-2 text-[12px] text-foreground/55 leading-relaxed">
          {provenance}{" "}
          <a href="/qui-sommes-nous" className="underline hover:text-foreground/80">
            Qui sommes-nous ?
          </a>
        </p>
      )}
    </div>
  );
}
