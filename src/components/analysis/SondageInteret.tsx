/**
 * src/components/analysis/SondageInteret.tsx
 *
 * 2026-09-13 (retour Johan) — remplace `InterestPrompt`. Ce n'est plus une
 * offre avec un bouton, c'est une QUESTION avec plusieurs réponses.
 *
 * 🔴 POURQUOI CE CHANGEMENT, ET CE QU'IL CORRIGE VRAIMENT.
 * Mesuré le 13/09 sur les analyses depuis l'ouverture du test le 29/08 :
 * dommages-ouvrage 2 affichages / 0 clic, financement 16 / 0. Johan
 * soupçonnait que les gens n'osent pas cliquer de peur d'être démarchés. La
 * mesure montre deux défauts plus profonds, de CONCEPTION :
 *
 *   1. UN BOUTON À SENS UNIQUE NE MESURE RIEN. « Oui, ça m'intéresse » était
 *      la seule réponse possible : celui qui pense « non » ne clique pas, et
 *      on n'enregistre rien. On ne distinguait pas « pas intéressé » de « n'a
 *      pas osé » ni de « n'a jamais fait défiler jusque-là ».
 *   2. ON NE COMPTAIT PAS LES AFFICHAGES. Le seuil de décision du projet —
 *      15 % de clics — était donc INCALCULABLE. Il a fallu reconstituer le
 *      dénominateur hors production en rejouant les conditions d'affichage.
 *
 * Ce composant corrige les deux : chaque réponse est une donnée (y compris les
 * négatives), et l'affichage est journalisé dans `site_events`.
 *
 * ⚠️ PLUS AUCUN MOT D'OFFRE. Ni « proposition », ni « sans engagement » —
 * formule que plus personne ne croit, et qui annonçait justement ce qu'on ne
 * fait pas. Le remerciement dit ce que la réponse sert RÉELLEMENT : décider si
 * on développe ce service. C'est vrai, et c'est tout ce qu'on promet.
 *
 * ⚠️ Toute mention du parcours des fondateurs reste BIOGRAPHIQUE ET AU PASSÉ
 * (ORIAS / IOBSP) : on explique pourquoi on regarde ce point, on ne conseille
 * ni assurance ni crédit.
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/integrations/amplitude";

export type SujetSondage = "dommages_ouvrage" | "credit" | "utilite";
export type ReponseSondage = "interesse" | "deja_equipe" | "non";

interface Props {
  analysisId: string;
  sujet: SujetSondage;
  question: string;
  /** Les réponses proposées, dans l'ordre d'affichage. */
  reponses: Array<{ valeur: ReponseSondage; libelle: string }>;
  /** Palette : sky (assurance) ou indigo (financement) */
  tone?: "sky" | "indigo";
  /** Provenance des fondateurs — biographique, au passé. */
  provenance?: string;
  /**
   * 2026-09-14 (retour Johan) — CE QU'ON CHERCHE À SAVOIR, propre au sujet.
   * Formulé comme un complément de « Nous cherchons à savoir… » : la suite de
   * la phrase est commune aux deux sondages (cf. `SUITE_DU_POURQUOI`).
   */
  besoin: string;
}

/**
 * 2026-09-14 (retour Johan) — LA MOITIÉ COMMUNE DE L'EXPLICATION, EN UN SEUL
 * ENDROIT.
 *
 * Johan : « il faudrait davantage expliquer pourquoi nous faisons ce sondage :
 * estimer s'il y a un besoin de financement et essayer de trouver la meilleure
 * solution en recherchant des partenaires. »
 *
 * ⚠️ CE N'EST PAS UN RETOUR DE L'OFFRE, et la nuance porte tout : on énonce
 * une INTENTION vérifiable (« nous irions chercher »), jamais un service qui
 * existerait déjà. La règle du 13/09 interdit les mots d'offre — « sans
 * engagement », « proposition » — parce qu'ils annonçaient ce qu'on ne fait
 * pas. Dire pourquoi on pose la question est l'inverse : c'est une raison que
 * le lecteur peut opposer.
 *
 * ⚠️ ET LA PHRASE SUIVANTE RESTE OBLIGATOIRE. « Partenaire » ne doit jamais
 * pouvoir se lire comme « on va vendre votre dossier » — c'est exactement ce
 * que la page d'accueil promet de ne pas faire (« sans revente de lead »).
 * D'où l'ordre : d'abord l'intention, puis la garantie que rien ne part.
 *
 * Une seule constante partagée plutôt que deux formulations jumelles : elles
 * finiraient par diverger, et l'une des deux redeviendrait une promesse
 * (même raisonnement que `HERO_CONFIRME`, 2026-09-11).
 */
const SUITE_DU_POURQUOI =
  "Si le besoin se confirme, nous irions chercher des partenaires pour construire la meilleure solution. Ce service n'existe pas encore : votre réponse sert à décider s'il doit exister.";

const TONES = {
  sky: { box: "border-sky-200 bg-sky-50/60", text: "text-sky-950", btn: "border-sky-300 text-sky-900 hover:bg-sky-100" },
  indigo: { box: "border-indigo-200 bg-indigo-50/60", text: "text-indigo-950", btn: "border-indigo-300 text-indigo-900 hover:bg-indigo-100" },
};

/** Nom d'événement attendu par la liste fermée de `/api/track/event`. */
const EVENEMENT_VU: Record<SujetSondage, string> = {
  dommages_ouvrage: "sondage_do_vu",
  credit: "sondage_credit_vu",
  utilite: "sondage_utilite_vu",
};

export default function SondageInteret({
  analysisId, sujet, question, reponses, tone = "sky", provenance, besoin,
}: Props) {
  const storageKey = `vmd_sondage_${sujet}_${analysisId}`;
  const [etat, setEtat] = useState<"idle" | "envoi" | "fait">(() => {
    try { return localStorage.getItem(storageKey) ? "fait" : "idle"; } catch { return "idle"; }
  });
  const vuEnvoye = useRef(false);

  // ── L'affichage est une donnée : c'est le DÉNOMINATEUR qui manquait ───────
  // ⚠️ Une seule fois par montage et jamais si l'utilisateur a déjà répondu :
  // sinon chaque revisite gonflerait le dénominateur et le taux baisserait
  // tout seul.
  useEffect(() => {
    if (etat !== "idle" || vuEnvoye.current) return;
    vuEnvoye.current = true;
    // Best-effort absolu : une mesure ne doit jamais gêner la lecture.
    fetch("/api/track/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: EVENEMENT_VU[sujet], path: `/analyse/${analysisId}` }),
      keepalive: true,
    }).catch(() => { /* ignoré */ });
  }, [etat, sujet, analysisId]);

  const repondre = async (valeur: ReponseSondage) => {
    setEtat("envoi");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        await fetch(`/api/analyse/${analysisId}/interest`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ topic: sujet, reponse: valeur }),
        });
      }
      trackEvent("sondage_reponse", { topic: sujet, reponse: valeur, analysis_id: analysisId });
      try { localStorage.setItem(storageKey, valeur); } catch { /* ignore */ }
    } catch {
      /* mesure best-effort — on remercie quand même */
    }
    setEtat("fait");
  };

  if (etat === "fait") {
    return (
      <p className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-[13px] text-emerald-900">
        Merci — ça nous aide à décider si nous développons ce service, et avec quels partenaires.
      </p>
    );
  }

  const t = TONES[tone];
  return (
    <div className={`mt-3 rounded-lg border px-3.5 py-3 ${t.box}`}>
      <p className={`text-[13px] leading-relaxed mb-2.5 ${t.text}`}>{question}</p>
      <div className="flex flex-wrap gap-2">
        {reponses.map((r) => (
          <button
            key={r.valeur}
            type="button"
            onClick={() => repondre(r.valeur)}
            disabled={etat === "envoi"}
            className={`rounded-lg border bg-white/70 px-3 py-2 text-[13px] font-medium transition-colors disabled:opacity-60 ${t.btn}`}
          >
            {r.libelle}
          </button>
        ))}
      </div>
      {/* 2026-09-14 — POURQUOI ON POSE LA QUESTION, avant la garantie.
          L'ordre compte : l'intention d'abord (ce qu'on cherche à savoir et ce
          qu'on en ferait), la garantie ensuite (rien ne part). Inversé, le mot
          « partenaires » resterait seul en tête et se lirait comme une revente
          de dossier. */}
      <p className={`mt-2.5 text-[12px] leading-relaxed ${t.text} opacity-80`}>
        <span className="font-semibold">Pourquoi cette question&nbsp;?</span>{" "}
        Nous cherchons à savoir {besoin}. {SUITE_DU_POURQUOI}
      </p>
      {/* ⚠️ NE PAS ÉCRIRE « anonyme » : la réponse est enregistrée avec le
          compte et l'analyse (table `lead_interest`). Ce qui est vrai, et
          suffisant, c'est qu'elle ne déclenche rien et n'est transmise à
          personne. */}
      <p className="mt-2 text-[12px] text-foreground/55 leading-relaxed">
        Votre réponse ne déclenche aucun appel ni aucun e-mail, et n'est transmise à personne.
        {provenance ? ` ${provenance} ` : " "}
        <a href="/qui-sommes-nous" className="underline hover:text-foreground/80">Qui sommes-nous ?</a>
      </p>
    </div>
  );
}
