/**
 * FeedbackModal — popup post-analyse
 *
 * V3.4.14+ (2026-05-16) — Refonte Phase 1 + 2 :
 *   - Persistance : table `analysis_feedback` via POST /api/feedback.
 *   - Trigger UNIQUEMENT externe via openFeedback() — appelé sur clic
 *     "Copier le message" (moment de valeur). Plus de scroll/timer auto.
 *   - Découplage : step "reward" affiché UNIQUEMENT si choice === "positive".
 *     Sur neutral / negative → on saute direct au step "done" remerciement.
 *     L'utilisateur mécontent ne se voit pas proposer une "récompense" qui
 *     paraît déplacée — il a un message d'écoute.
 *   - Reward reformulé : on assume que GMC est une suite naturelle du parcours
 *     VMD (analyser → gérer), wording centré sur "continuer son projet".
 *
 * Persistence anti-spam : localStorage 'vmdf_feedback_shown' avec TTL 7 jours.
 *
 * 2026-09-26 — TRUSTPILOT REBRANCHÉ APRÈS LE SONDAGE (option 2, décision
 * Johan). Depuis le 16/09, `REMPLACEMENT_CREDIT` court-circuite tout le
 * parcours feedback : le lien Trustpilot, qui ne vivait que dans `StepDone`
 * après un avis POSITIF, n'était donc plus atteignable. Mesuré le 26/09 : le
 * profil public n'a reçu **aucun avis depuis le 12 avril**. Il vit désormais
 * dans l'écran de remerciement de `StepCredit` — une seule demande, puis le
 * lien. Cf. le commentaire sur place pour la garde du « Si ».
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/integrations/amplitude";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY      = "vmdf_feedback_shown";
const TTL_DAYS         = 7;
const TRUSTPILOT_URL   = "https://fr.trustpilot.com/evaluate/verifiermondevis.fr";
const TEXT_MAX         = 200;

// V3.4.15+ — Trigger auto sur scroll bottom de l'analyse.
// Seuil 90% (au lieu de 60% en V3.4.14-) : le user a effectivement parcouru
// toute l'analyse avant qu'on lui demande son avis. Évite l'effet "modal qui
// interrompt la lecture" tout en gardant un trigger non-manuel.
const SCROLL_BOTTOM_THRESHOLD = 0.90;

// 2026-08-20 (retour Johan) — temps de lecture minimal avant que le trigger
// scroll puisse ouvrir la modal. Un scroll rapide vers le bas (survol de la
// page, recherche d'une section) atteignait 90 % en quelques secondes et la
// modal interrompait la lecture. Le trigger manuel (clic « Copier le
// message ») n'est PAS soumis à ce délai — c'est un acte volontaire.
const SCROLL_TRIGGER_MIN_DWELL_MS = 90_000;

// ─── Types ────────────────────────────────────────────────────────────────────

type Choice  = "positive" | "neutral" | "negative";
type Step    = "feedback" | "reward" | "done";
type Activating = "idle" | "activating" | "activated";
type VerdictColor = "VERT" | "ORANGE" | "ROUGE";

// V3.4.20+ — Causes du feedback négatif (chips multi-select). Whitelist alignée
// avec ALLOWED_TAGS dans src/pages/api/feedback.ts.
type NegativeTag =
  | "mauvaise_entreprise"
  | "faux_radiee"
  | "siret_non_extrait"
  | "prix_marche_incorrect"
  | "verdict_incoherent"
  | "mauvais_type_doc"
  | "autre";

const NEGATIVE_TAGS: { id: NegativeTag; label: string }[] = [
  { id: "mauvaise_entreprise",   label: "Mauvaise entreprise affichée" },
  { id: "faux_radiee",           label: "Entreprise dite radiée à tort" },
  { id: "siret_non_extrait",     label: "SIRET pas lu sur le PDF" },
  { id: "prix_marche_incorrect", label: "Prix marché incohérent" },
  { id: "verdict_incoherent",    label: "Verdict ne reflète pas la réalité" },
  { id: "mauvais_type_doc",      label: "Pas un devis classique (estimation, MOE…)" },
  { id: "autre",                 label: "Autre" },
];

export interface UseFeedbackOptions {
  /** Analyse en cours (pour persister la soumission côté serveur). */
  analysisId?: string | null;
  /** Verdict global courant (snapshot pour cohorter en admin). */
  verdict?: VerdictColor | null;
  /** Montant HT du devis — gate du test crédit (cf. REMPLACEMENT_CREDIT). */
  totalHt?: number | null;
}

/**
 * 🔴 2026-09-16 (décision Johan) — LA QUESTION DE FINANCEMENT REMPLACE
 * PROVISOIREMENT LA DEMANDE DE SATISFACTION.
 *
 * Le sondage crédit vivait dans le 2ᵉ écran de la page d'analyse et a produit
 * **32 affichages pour ZÉRO réponse** — pas même un « non », pourtant
 * enregistrable depuis le 13/09. Le lecteur y découvre s'il doit signer ; une
 * question de financement à cet instant ne pouvait que passer à côté.
 *
 * Consigne : *« ôter cette partie test sondage pour le crédit et remplacer
 * provisoirement le feedback client par la question du crédit »*. Une seule
 * demande, posée à la fin de la lecture (défilement à 90 %), là où l'attention
 * a déjà été payée.
 *
 * ⚠️ CE QUE CE TEST COÛTE, ET IL FAUT LE SAVOIR : pendant sa durée, on ne
 * recueille plus de satisfaction (`analysis_feedback`), plus les motifs de
 * mécontentement, et **on ne propose plus Trustpilot** — le lien n'était offert
 * qu'après un avis positif. C'est un échange délibéré et RÉVERSIBLE : remettre
 * `false` ci-dessous restaure l'ancien comportement à l'identique.
 *
 * ⚠️ Le seuil de 5 000 € HT était celui de l'ancien emplacement : en dessous, la
 * question de financement n'a pas de sens, et la satisfaction reprend la main.
 *
 * 🟢 2026-09-24 (décision Johan) — SEUIL ABAISSÉ À 3 000 € HT, ET LE GAIN EST
 * PETIT : IL FAUT LE DIRE AVANT DE L'ESPÉRER.
 *
 * Mesuré sur les 103 analyses des 90 derniers jours qui portent un montant ET
 * des leviers (les seules où la modale peut s'ouvrir) — médiane 8 772 € HT :
 *
 *     ≥ 5 000 € : 64 devis (62 %)
 *     ≥ 3 000 € : 72 devis (70 %)   →   +8 devis sur 90 jours, soit +13 %
 *
 * Le rythme d'affichage RÉELLEMENT journalisé depuis le déménagement du 16/09
 * est de 1,0 à 1,5/jour : l'échéance du 16/12 amènera donc de l'ordre de 100 à
 * 150 observations, et ce seuil en ajoute une dizaine. Il ne rend pas le test
 * puissant — il ne prétend pas l'être.
 *
 * 🔴 CE QUE ÇA CHANGE POUR LE VERDICT DU 16/12, ET C'EST LE VRAI SUJET. Le
 * critère « 15 % de réponses » demanderait ~200 observations pour être mesuré à
 * ±5 points : il ne sera PAS atteignable. Le critère qui le sera est celui que
 * Johan avait posé d'origine (2026-08-29) : **aucun intérêt au bout de trois
 * mois = piste abandonnée**. C'est un binaire, et 120 observations suffisent
 * largement à le trancher (0 sur 120 borne l'appétence à moins de 2,5 %).
 * État au 24/09 : 44 affichages, 1 réponse, et **zéro « je cherche une
 * solution »**.
 *
 * ⚠️ NE PAS descendre plus bas pour « avoir du volume ». Les deux devis du
 * 23/09 qui manquent le seuil sont à 2 400 € et 2 417 € : sous 3 000 €, on
 * poserait une question de financement sur des chantiers qu'on paie
 * comptant — on mesurerait notre propre insistance, pas un besoin.
 */
const REMPLACEMENT_CREDIT = true;
const CREDIT_MONTANT_MIN_HT = 3000;

// ─── Tracking helper ──────────────────────────────────────────────────────────

function track(eventName: string, payload?: Record<string, unknown>) {
  try { trackEvent(eventName, payload); } catch { /* never throw */ }
}

// ─── Persistence helpers (TTL 7 jours) ───────────────────────────────────────

function hasBeenShown(): boolean {
  if (typeof localStorage === "undefined") return false;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    const { ts } = JSON.parse(raw);
    const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
    return ageDays < TTL_DAYS;
  } catch {
    return true; // valeur legacy sans TTL → on respecte quand même
  }
}

function markShown() {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now() }));
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function persistFeedback(opts: {
  analysisId: string;
  choice: Choice;
  text: string;
  verdict: VerdictColor | null;
  tags: NegativeTag[];
}): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    // Pas de session : on log uniquement Amplitude, pas la peine de tenter l'API.
    // Cas marginal (l'analyse n'est normalement accessible que connecté).
    return;
  }
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      analysis_id: opts.analysisId,
      choice: opts.choice,
      text: opts.text.trim() || undefined,
      verdict_at_submission: opts.verdict ?? undefined,
      tags: opts.choice === "negative" ? opts.tags : undefined,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || "Erreur sauvegarde feedback");
  }
}

async function activateGererMonChantier(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Session expirée");

  const res = await fetch("/api/activate-chantier", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || "Erreur activation");
  }
}

// ─── Step 1 — Feedback ───────────────────────────────────────────────────────

const CHOICES: { id: Choice; emoji: string; label: string }[] = [
  { id: "positive", emoji: "👍", label: "Oui, vraiment" },
  { id: "neutral",  emoji: "😐", label: "Un peu" },
  { id: "negative", emoji: "❌", label: "Pas vraiment" },
];

function StepFeedback({
  choice, text, tags, submitting, onChoice, onText, onToggleTag, onNext,
}: {
  choice:       Choice | null;
  text:         string;
  tags:         NegativeTag[];
  submitting:   boolean;
  onChoice:     (c: Choice) => void;
  onText:       (t: string) => void;
  onToggleTag:  (t: NegativeTag) => void;
  onNext:       () => void;
}) {
  const showTags = choice === "negative";
  // Si "autre" est seul sélectionné (sans autre tag), exiger une raison textuelle
  const requireText = showTags && tags.length === 1 && tags[0] === "autre";
  const textTooShort = requireText && text.trim().length < 5;

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <p className="text-base font-semibold text-slate-900">
          Cette analyse vous a-t-elle aidé ?
        </p>
        <p className="text-xs text-slate-600 mt-0.5">30 secondes — aucune obligation</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {CHOICES.map((c) => (
          <button
            key={c.id}
            onClick={() => onChoice(c.id)}
            className={`
              flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all
              touch-manipulation select-none
              ${choice === c.id
                ? "border-primary bg-primary/[0.08] scale-[1.03]"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}
            `}
          >
            <span className="text-2xl leading-none">{c.emoji}</span>
            <span className="text-xs font-medium text-slate-600">{c.label}</span>
          </button>
        ))}
      </div>

      {/* V3.4.20+ — Chips causes du feedback négatif (multi-select).
          Aide à identifier rapidement les bugs structurels en prod (mauvaise
          entreprise, faux radiée, mauvais type de doc, etc.) plutôt que de
          devoir lire chaque commentaire libre. */}
      {showTags && (
        <div className="flex flex-col gap-2.5 -mt-1">
          <p className="text-xs font-medium text-slate-600">
            Qu'est-ce qui n'allait pas ? (vous pouvez en cocher plusieurs)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {NEGATIVE_TAGS.map((t) => {
              const selected = tags.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onToggleTag(t.id)}
                  className={`
                    px-3 py-1.5 rounded-full border text-xs font-medium transition-all
                    touch-manipulation select-none
                    ${selected
                      ? "border-primary bg-primary text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}
                  `}
                  aria-pressed={selected}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => onText(e.target.value.slice(0, TEXT_MAX))}
          placeholder={
            requireText
              ? "Merci de préciser ce qui n'a pas marché"
              : "Ex : le verdict n'était pas clair / prix incohérent / très utile"
          }
          rows={2}
          maxLength={TEXT_MAX}
          className={`w-full resize-none rounded-xl border bg-slate-50 px-3 py-2
                     text-sm text-slate-700 placeholder:text-slate-600
                     focus:outline-none focus:ring-2 focus:ring-primary/30
                     ${textTooShort ? "border-red-300 focus:border-red-400" : "border-slate-200 focus:border-primary/40"}`}
        />
        {text.length > 0 && (
          <span className="absolute bottom-2 right-3 text-[10px] text-slate-600">
            {text.length}/{TEXT_MAX}
          </span>
        )}
        {textTooShort && (
          <p className="text-[11px] text-red-700 mt-1">
            Précise un peu, ça nous aide à corriger.
          </p>
        )}
      </div>

      <Button
        onClick={onNext}
        disabled={!choice || submitting || textTooShort}
        className="w-full h-11 rounded-xl font-semibold"
      >
        {submitting ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Envoi…
          </span>
        ) : (
          "Continuer →"
        )}
      </Button>
    </div>
  );
}

// ─── Step 2 — Reward (uniquement si choice positive) ─────────────────────────

function StepReward({
  activating, onActivate, onSkip,
}: {
  activating: Activating;
  onActivate: () => void;
  onSkip:     () => void;
}) {
  return (
    <div className="flex flex-col gap-5 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <span className="text-3xl">🎁</span>
      </div>

      {activating === "activating" ? (
        <div className="flex flex-col items-center gap-2 py-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm font-medium text-slate-600">
            Activation en cours…
          </p>
        </div>
      ) : (
        <>
          <div>
            <p className="text-lg font-bold text-slate-900">
              Merci pour votre retour 🙏
            </p>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              Petit cadeau : on vous ouvre l'accès à{" "}
              <strong className="text-slate-700">GérerMonChantier</strong>,
              notre outil pour piloter la suite — paiements, planning, alertes —
              dans le prolongement de votre analyse de devis.
            </p>
            <p className="text-xs text-slate-600 mt-2">Gratuit, sans carte bancaire</p>
          </div>

          <div>
            <Button
              onClick={onActivate}
              disabled={activating !== "idle"}
              className="w-full h-12 rounded-xl font-semibold text-base"
            >
              ✨ Débloquer mon accès offert
            </Button>
          </div>

          <button
            onClick={onSkip}
            className="text-xs text-slate-600 hover:text-slate-600 transition-colors touch-manipulation"
          >
            Non merci, plus tard
          </button>
        </>
      )}
    </div>
  );
}

// ─── Step 3 — Done ───────────────────────────────────────────────────────────

function StepDone({
  choice, rewardActivated, onClose,
}: {
  choice:          Choice;
  rewardActivated: boolean;
  onClose:         () => void;
}) {
  return (
    <div className="flex flex-col gap-5 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle2 className="h-6 w-6 text-green-600" />
      </div>

      <div>
        {rewardActivated ? (
          <>
            <p className="text-base font-bold text-slate-900">🎁 Accès débloqué !</p>
            <p className="text-sm text-slate-600 mt-1">
              Votre accès GérerMonChantier est maintenant actif.
            </p>
          </>
        ) : choice === "positive" ? (
          <>
            <p className="text-base font-bold text-slate-900">Merci 🙏</p>
            <p className="text-sm text-slate-600 mt-1">
              Votre retour nous aide vraiment à améliorer l'outil.
            </p>
          </>
        ) : choice === "neutral" ? (
          <>
            <p className="text-base font-bold text-slate-900">Merci pour votre retour</p>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              On note vos remarques et on continue d'améliorer l'analyse.
              N'hésitez pas à nous écrire si quelque chose n'a pas été clair.
            </p>
          </>
        ) : (
          <>
            <p className="text-base font-bold text-slate-900">Désolé que ça n'ait pas répondu à vos attentes</p>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              Votre retour honnête nous aide vraiment à progresser. Si vous avez
              30 secondes, écrivez-nous à <a className="underline" href="mailto:hello@verifiermondevis.fr">hello@verifiermondevis.fr</a> —
              on lit chaque message.
            </p>
          </>
        )}
      </div>

      {choice === "positive" && !rewardActivated && (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-left">
          <p className="text-sm text-slate-700 leading-relaxed mb-3">
            Si l'analyse vous a été utile, vous pouvez nous aider en laissant un
            avis — ça fait toute la différence pour un petit outil comme le nôtre.
          </p>
          <a
            href={TRUSTPILOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("trustpilot_click", { from: "feedback_modal", choice })}
            className="inline-flex items-center gap-2 bg-[#00B67A] hover:bg-[#00a369]
                       text-white font-semibold text-sm px-5 py-2.5 rounded-xl
                       transition-colors touch-manipulation w-full justify-center"
          >
            <ExternalLink className="h-4 w-4" />
            Laisser un avis sur Trustpilot
          </a>
        </div>
      )}

      <Button variant="outline" onClick={onClose} className="w-full h-10 rounded-xl">
        Fermer
      </Button>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

const STEPS_WITH_REWARD: Step[] = ["feedback", "reward", "done"];
const STEPS_NO_REWARD:   Step[] = ["feedback", "done"];

function ProgressBar({ step, withReward }: { step: Step; withReward: boolean }) {
  const sequence = withReward ? STEPS_WITH_REWARD : STEPS_NO_REWARD;
  const idx = sequence.indexOf(step);
  return (
    <div className="flex gap-1.5 mb-5">
      {sequence.map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
            i <= idx ? "bg-primary" : "bg-slate-200"
          }`}
        />
      ))}
    </div>
  );
}

// ─── Test crédit — une seule question, à la fin de la lecture ─────────────────

type ReponseCredit = "interesse" | "deja_equipe" | "non";

const REPONSES_CREDIT: { valeur: ReponseCredit; libelle: string }[] = [
  { valeur: "interesse",   libelle: "Je cherche une solution" },
  // 2026-09-13 (retour Johan) — les trois réponses doivent être du même
  // registre que la question, qui demande une INTENTION.
  { valeur: "deja_equipe", libelle: "C'est déjà financé" },
  { valeur: "non",         libelle: "Je paie sans emprunter" },
];

function StepCredit({
  totalHt, repondu, onRepondre, onClose,
}: {
  totalHt: number | null;
  repondu: boolean;
  onRepondre: (v: ReponseCredit) => void;
  onClose: () => void;
}) {
  if (repondu) {
    return (
      <div className="text-center">
        <CheckCircle2 className="h-9 w-9 text-emerald-500 mx-auto mb-3" aria-hidden="true" />
        <p className="text-[15px] font-semibold text-slate-900">Merci.</p>
        <p className="mt-1.5 text-[13.5px] text-slate-600 leading-relaxed">
          Votre réponse nous aide à décider si nous développons ce service.
        </p>

        {/* 🔴 TRUSTPILOT REVIENT ICI, APRÈS LA RÉPONSE — PAS À LA PLACE DU
            SONDAGE (option 2 validée Johan, 26/09).

            MESURÉ LE 26/09, ET C'EST LE CHIFFRE QUI A DÉCIDÉ : le profil
            public n'a reçu **aucun avis depuis le 12 avril** — cinq mois et
            demi — alors que des centaines de devis ont été analysés. La cause
            était chez nous : le lien ne vivait que dans l'écran `StepDone`,
            atteignable uniquement après un avis POSITIF, et tout ce parcours
            est court-circuité depuis le 16/09 par `REMPLACEMENT_CREDIT`. Le
            bloc existait toujours dans le code — il n'était plus atteignable.
            C'était documenté comme un coût assumé du test, mais celui-ci court
            jusqu'au 16/12 : trois mois de collecte en plus auraient été perdus.

            ⚠️ UNE SEULE DEMANDE, ET ELLE EST DÉJÀ FAITE. On ne redemande rien :
            la personne a répondu, on la remercie, et on lui OFFRE un lien.
            C'est la règle du 16/09 (« on ne brouille pas et on ne fait pas
            2 demandes en même temps ») — respectée, parce que les deux ne sont
            pas simultanées.

            ⚠️ LE « SI » FAIT LE TRI, ET IL EST INDISPENSABLE. Avant le 16/09 le
            lien n'était montré qu'après un avis positif ; cette question de
            satisfaction n'existe plus, donc nous ne savons PLUS si la personne
            est contente. Solliciter un avis public sans le savoir serait
            imprudent — la conditionnelle laisse le lecteur se qualifier
            lui-même. Ne pas la retirer pour « simplifier ». */}
        <div className="mt-5 pt-4 border-t border-slate-200 text-left">
          <p className="text-[13px] text-slate-700 leading-relaxed">
            Si l'analyse vous a été utile, vous pouvez nous aider en laissant un
            avis — ça fait toute la différence pour un petit outil comme le nôtre.
          </p>
          <a
            href={TRUSTPILOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("trustpilot_click", { from: "sondage_credit" })}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl
                       bg-[#00B67A] px-5 py-2.5 text-sm font-semibold text-white
                       transition-colors hover:bg-[#00a369] touch-manipulation"
          >
            Laisser un avis sur Trustpilot
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

        <Button variant="ghost" onClick={onClose} className="mt-3 w-full">Fermer</Button>
      </div>
    );
  }
  return (
    <div>
      <h3 className="text-[16px] font-semibold text-slate-900 leading-snug">
        {/* 2026-09-13 (retour Johan) — « qu'envisagez-vous ? » et non « où en
            êtes-vous ? » : la seconde présuppose une démarche déjà engagée,
            alors qu'on s'adresse à quelqu'un qui vient d'analyser un devis. */}
        Pour financer ces travaux
        {typeof totalHt === "number" && totalHt > 0
          ? ` (${Math.round(totalHt).toLocaleString("fr-FR")} € HT)`
          : ""}, qu'envisagez-vous&nbsp;?
      </h3>
      <div className="mt-4 flex flex-col gap-2">
        {REPONSES_CREDIT.map((r) => (
          <button
            key={r.valeur}
            onClick={() => onRepondre(r.valeur)}
            className="w-full text-left rounded-lg border border-indigo-300 px-3.5 py-2.5 text-[14px] text-indigo-900 hover:bg-indigo-50 transition-colors touch-manipulation"
          >
            {r.libelle}
          </button>
        ))}
      </div>
      {/* 2026-09-14 (retour Johan) — dire POURQUOI on interroge. ⚠️ L'ORDRE DES
          DEUX PHRASES EST LA GARDE : l'intention d'abord, la garantie ensuite.
          Inversées, « partenaires » resterait seul en tête et se lirait comme
          une revente de dossier — ce que la page d'accueil promet de ne pas
          faire (« nous ne vendons pas vos données »). */}
      <p className="mt-4 text-[12.5px] text-slate-600 leading-relaxed">
        <span className="font-semibold text-slate-800">Pourquoi cette question&nbsp;?</span>{" "}
        Nous cherchons à estimer si le financement est un frein réel sur des chantiers de ce
        montant. Si le besoin se confirme, nous irions chercher des partenaires pour construire
        la meilleure solution. Ce service n'existe pas encore&nbsp;: votre réponse sert à décider
        s'il doit exister.
      </p>
      {/* ⚠️ NE PAS écrire « anonyme » : la réponse est enregistrée avec le
          compte et l'analyse. On dit ce qui est vrai et suffisant. */}
      <p className="mt-2 text-[12px] text-slate-600 leading-relaxed">
        Votre réponse ne déclenche aucun appel ni aucun e-mail, et n'est transmise à personne.
      </p>
    </div>
  );
}

// ─── Hook — source de vérité unique ───────────────────────────────────────────

export function useFeedback(opts: UseFeedbackOptions = {}) {
  const { analysisId = null, verdict = null, totalHt = null } = opts;

  const [open,       setOpen]       = useState(false);
  const [step,       setStep]       = useState<Step>("feedback");
  const [choice,     setChoice]     = useState<Choice | null>(null);
  const [text,       setText]       = useState("");
  const [tags,       setTags]       = useState<NegativeTag[]>([]);  // V3.4.20+ — causes feedback négatif
  const [submitting, setSubmitting] = useState(false);
  const [activating, setActivating] = useState<Activating>("idle");

  // V3.4.14+ — refs pour lire la valeur courante des props sans causer de
  // re-création des callbacks (qui invaliderait le useMemo du Modal).
  const analysisIdRef = useRef(analysisId);
  const totalHtRef    = useRef(totalHt);
  const [creditRepondu, setCreditRepondu] = useState(false);

  /**
   * Le test ne remplace la satisfaction QUE là où la question a un sens : un
   * devis de 400 € n'appelle pas de financement. En dessous du seuil, la
   * modale garde son comportement d'origine.
   */
  const creditActif =
    REMPLACEMENT_CREDIT &&
    typeof totalHt === "number" &&
    totalHt >= CREDIT_MONTANT_MIN_HT;

  // ⚠️ SANS DÉNOMINATEUR, UN TAUX N'EXISTE PAS (règle du 13/09). On journalise
  // l'affichage une seule fois par ouverture, sinon chaque revisite gonflerait
  // le dénominateur et le taux baisserait tout seul.
  const vuEnvoye = useRef(false);
  useEffect(() => {
    if (!open || !creditActif || vuEnvoye.current) return;
    vuEnvoye.current = true;
    fetch("/api/track/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "sondage_credit_vu", path: `/analyse/${analysisIdRef.current ?? ""}` }),
      keepalive: true,
    }).catch(() => { /* best-effort */ });
  }, [open, creditActif]);

  const repondreCredit = useCallback(async (valeur: ReponseCredit) => {
    const aid = analysisIdRef.current;
    // On remercie TOUJOURS, même si l'enregistrement échoue : une mesure
    // best-effort ne doit jamais se voir de l'utilisateur.
    setCreditRepondu(true);
    markShown();
    track("sondage_reponse", { topic: "credit", reponse: valeur, analysis_id: aid });
    if (!aid) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      await fetch(`/api/analyse/${aid}/interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topic: "credit", reponse: valeur }),
      });
    } catch { /* ignoré — best-effort */ }
  }, []);
  const verdictRef    = useRef(verdict);
  useEffect(() => { analysisIdRef.current = analysisId; }, [analysisId]);
  useEffect(() => { totalHtRef.current = totalHt; }, [totalHt]);
  useEffect(() => { verdictRef.current    = verdict;    }, [verdict]);

  const triggeredRef = useRef(false);

  // ── Trigger interne (avant openFeedback exposé) ─────────────────────────
  const tryOpen = useCallback((trigger: string) => {
    if (triggeredRef.current) return;
    if (hasBeenShown()) return;
    triggeredRef.current = true;
    setOpen(true);
    track("feedback_open", { trigger });
  }, []);

  // ── Trigger auto sur scroll bottom de l'analyse (V3.4.15+) ──────────────
  //
  // Le user a parcouru toute l'analyse → moment de valeur, on demande son avis.
  // Seuil 90% (vs 60% en V3.4.14-) : on veut être SÛR qu'il a lu, pas l'interrompre.
  //
  // En V3.4.14, on avait retiré ce trigger pour éviter "modal qui interrompt
  // la lecture" — mais on perdait le canal principal de collecte de feedback
  // (clic "Copier le message" pas suffisant). Solution V3.4.15+ : on remet
  // l'auto-trigger, mais SEULEMENT en bas de page.
  //
  // Coexiste avec openFeedback() manuel (clic "Copier le message") — premier
  // déclencheur gagne, `triggeredRef` empêche le double-trigger.
  useEffect(() => {
    if (hasBeenShown()) return;

    // 2026-08-20 — dwell minimal : le scroll bottom ne déclenche qu'après
    // SCROLL_TRIGGER_MIN_DWELL_MS passées sur la page (laisser lire).
    const mountedAt = Date.now();

    const onScroll = () => {
      if (Date.now() - mountedAt < SCROLL_TRIGGER_MIN_DWELL_MS) return;
      const docHeight = document.body.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return; // page très courte, ne pas trigger
      const scrolled = window.scrollY / docHeight;
      if (scrolled >= SCROLL_BOTTOM_THRESHOLD) tryOpen("scroll_bottom");
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [tryOpen]);

  // ── ESC pour fermer ───────────────────────────────────────────────────────
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // ── Trigger externe (clic "Copier le message" via onCopy de ConclusionIA) ─
  // Coexiste avec le trigger auto scroll bottom. Premier déclencheur gagne.
  const openFeedback = useCallback(() => {
    tryOpen("manual_copy");
  }, [tryOpen]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleChoice = useCallback((c: Choice) => {
    setChoice(c);
    // Si on quitte "negative", on reset les tags pour éviter qu'ils restent
    // attachés à un choix positif/neutral (l'API les ignorerait mais c'est
    // plus propre côté state local).
    if (c !== "negative") setTags([]);
    track("feedback_choice", { choice: c });
  }, []);

  const handleToggleTag = useCallback((t: NegativeTag) => {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }, []);

  const handleNext = useCallback(async () => {
    if (!choice) return;
    setSubmitting(true);

    // Tracking Amplitude (existant)
    if (text.trim()) track("feedback_text", { length: text.trim().length });
    // V3.4.20+ — Tracking des tags pour Amplitude (gros funnel d'analyse côté admin)
    if (choice === "negative" && tags.length > 0) {
      track("feedback_negative_tags", { tags, count: tags.length });
    }

    // Persistance DB (nouveau — non bloquant si échec)
    const aid = analysisIdRef.current;
    if (aid) {
      try {
        await persistFeedback({
          analysisId: aid,
          choice,
          text,
          verdict: verdictRef.current,
          tags,  // V3.4.20+ — l'API ignore les tags si choice ≠ "negative"
        });
      } catch (err) {
        console.error("[feedback] persist failed:", err);
        // On NE bloque PAS l'utilisateur — Amplitude a déjà la donnée et la modal
        // continue son flow. Un toast silencieux aurait été inutile (l'utilisateur
        // n'a rien à corriger).
      }
    }

    markShown();
    setSubmitting(false);

    // V3.4.14+ — Découplage : reward UNIQUEMENT si choice positive.
    // Sur neutral/negative, on saute au "done" pour ne pas paraître insistant.
    if (choice === "positive") {
      setStep("reward");
    } else {
      setStep("done");
    }
  }, [choice, text, tags]);

  const handleActivate = useCallback(async () => {
    setActivating("activating");
    try {
      await new Promise((r) => setTimeout(r, 700));
      await activateGererMonChantier();
      track("reward_activated");
      setActivating("activated");
      toast.success("Accès GérerMonChantier activé !");
    } catch {
      toast.error("Erreur lors de l'activation. Réessayez.");
      setActivating("idle");
      return;
    }
    setStep("done");
  }, []);

  const handleSkip = useCallback(() => {
    track("reward_skipped");
    setStep("done");
  }, []);

  // ── Modal mémoïsé (zéro re-render parent lors de la frappe textarea) ──────
  const Modal = useMemo(() => {
    if (!open) return null;

    const withReward = choice === "positive";
    const rewardActivated = activating === "activated";

    return (
      <>
        {/* Backdrop — clic ferme */}
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          onClick={close}
          aria-hidden
        />

        {/* Panel */}
        <div
          role="dialog"
          aria-modal
          aria-label="Retour sur l'analyse"
          className="
            fixed z-50 inset-x-4 bottom-4
            sm:inset-auto sm:bottom-auto sm:top-1/2 sm:left-1/2
            sm:-translate-x-1/2 sm:-translate-y-1/2
            bg-white rounded-2xl shadow-2xl p-6
            w-auto sm:w-[400px] max-w-full
            pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6
          "
          onClick={(e) => e.stopPropagation()}
        >
          {/* Bouton fermer */}
          <button
            onClick={close}
            aria-label="Fermer"
            className="absolute top-4 right-4 text-slate-600 hover:text-slate-700 transition-colors touch-manipulation"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Test crédit : une seule question, pas de parcours en trois temps —
              donc pas de barre de progression qui promettrait des étapes. */}
          {!creditActif && <ProgressBar step={step} withReward={withReward} />}

          {creditActif && (
            <StepCredit
              totalHt={totalHtRef.current}
              repondu={creditRepondu}
              onRepondre={repondreCredit}
              onClose={close}
            />
          )}

          {!creditActif && step === "feedback" && (
            <StepFeedback
              choice={choice}
              text={text}
              tags={tags}
              submitting={submitting}
              onChoice={handleChoice}
              onText={setText}
              onToggleTag={handleToggleTag}
              onNext={handleNext}
            />
          )}

          {!creditActif && step === "reward" && (
            <StepReward
              activating={activating}
              onActivate={handleActivate}
              onSkip={handleSkip}
            />
          )}

          {!creditActif && step === "done" && choice && (
            <StepDone choice={choice} rewardActivated={rewardActivated} onClose={close} />
          )}
        </div>
      </>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, choice, text, tags, submitting, activating, creditActif, creditRepondu, repondreCredit]);

  return { openFeedback, FeedbackModal: Modal };
}
