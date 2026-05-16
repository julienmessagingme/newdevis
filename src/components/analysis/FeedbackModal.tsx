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

// ─── Types ────────────────────────────────────────────────────────────────────

type Choice  = "positive" | "neutral" | "negative";
type Step    = "feedback" | "reward" | "done";
type Activating = "idle" | "activating" | "activated";
type VerdictColor = "VERT" | "ORANGE" | "ROUGE";

export interface UseFeedbackOptions {
  /** Analyse en cours (pour persister la soumission côté serveur). */
  analysisId?: string | null;
  /** Verdict global courant (snapshot pour cohorter en admin). */
  verdict?: VerdictColor | null;
}

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
  choice, text, submitting, onChoice, onText, onNext,
}: {
  choice:     Choice | null;
  text:       string;
  submitting: boolean;
  onChoice:   (c: Choice) => void;
  onText:     (t: string) => void;
  onNext:     () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <p className="text-base font-semibold text-slate-900">
          Cette analyse vous a-t-elle aidé ?
        </p>
        <p className="text-xs text-slate-400 mt-0.5">30 secondes — aucune obligation</p>
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

      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => onText(e.target.value.slice(0, TEXT_MAX))}
          placeholder="Ex : le verdict n'était pas clair / prix incohérent / très utile"
          rows={2}
          maxLength={TEXT_MAX}
          className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2
                     text-sm text-slate-700 placeholder:text-slate-400
                     focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
        />
        {text.length > 0 && (
          <span className="absolute bottom-2 right-3 text-[10px] text-slate-400">
            {text.length}/{TEXT_MAX}
          </span>
        )}
      </div>

      <Button
        onClick={onNext}
        disabled={!choice || submitting}
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
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
              Petit cadeau : on vous ouvre l'accès à{" "}
              <strong className="text-slate-700">GérerMonChantier</strong>,
              notre outil pour piloter la suite — paiements, planning, alertes —
              dans le prolongement de votre analyse de devis.
            </p>
            <p className="text-xs text-slate-400 mt-2">Gratuit, sans carte bancaire</p>
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
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors touch-manipulation"
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
            <p className="text-sm text-slate-500 mt-1">
              Votre accès GérerMonChantier est maintenant actif.
            </p>
          </>
        ) : choice === "positive" ? (
          <>
            <p className="text-base font-bold text-slate-900">Merci 🙏</p>
            <p className="text-sm text-slate-500 mt-1">
              Votre retour nous aide vraiment à améliorer l'outil.
            </p>
          </>
        ) : choice === "neutral" ? (
          <>
            <p className="text-base font-bold text-slate-900">Merci pour votre retour</p>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
              On note vos remarques et on continue d'améliorer l'analyse.
              N'hésitez pas à nous écrire si quelque chose n'a pas été clair.
            </p>
          </>
        ) : (
          <>
            <p className="text-base font-bold text-slate-900">Désolé que ça n'ait pas répondu à vos attentes</p>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
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

// ─── Hook — source de vérité unique ───────────────────────────────────────────

export function useFeedback(opts: UseFeedbackOptions = {}) {
  const { analysisId = null, verdict = null } = opts;

  const [open,       setOpen]       = useState(false);
  const [step,       setStep]       = useState<Step>("feedback");
  const [choice,     setChoice]     = useState<Choice | null>(null);
  const [text,       setText]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activating, setActivating] = useState<Activating>("idle");

  // V3.4.14+ — refs pour lire la valeur courante des props sans causer de
  // re-création des callbacks (qui invaliderait le useMemo du Modal).
  const analysisIdRef = useRef(analysisId);
  const verdictRef    = useRef(verdict);
  useEffect(() => { analysisIdRef.current = analysisId; }, [analysisId]);
  useEffect(() => { verdictRef.current    = verdict;    }, [verdict]);

  const triggeredRef = useRef(false);

  // V3.4.14+ — SUPPRESSION de l'auto-scroll/timer. Trigger UNIQUEMENT externe
  // (via openFeedback) → déclenché sur un "moment de valeur" : clic "Copier le
  // message" pour négocier (cf. AnalysisResult onCopy={openFeedback}).
  // Raison : l'auto-trigger au scroll 60% intervenait pendant la lecture
  // (= dérangeant) → taux de réponse proche de zéro. On préfère ne montrer
  // la modal que quand l'utilisateur a tiré une valeur concrète de l'outil.

  // ── ESC pour fermer ───────────────────────────────────────────────────────
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // ── Trigger externe — UNIQUE entry point ──────────────────────────────────
  const openFeedback = useCallback(() => {
    if (hasBeenShown()) return;
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    setOpen(true);
    track("feedback_open", { trigger: "manual" });
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleChoice = useCallback((c: Choice) => {
    setChoice(c);
    track("feedback_choice", { choice: c });
  }, []);

  const handleNext = useCallback(async () => {
    if (!choice) return;
    setSubmitting(true);

    // Tracking Amplitude (existant)
    if (text.trim()) track("feedback_text", { length: text.trim().length });

    // Persistance DB (nouveau — non bloquant si échec)
    const aid = analysisIdRef.current;
    if (aid) {
      try {
        await persistFeedback({
          analysisId: aid,
          choice,
          text,
          verdict: verdictRef.current,
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
  }, [choice, text]);

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
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors touch-manipulation"
          >
            <X className="h-4 w-4" />
          </button>

          <ProgressBar step={step} withReward={withReward} />

          {step === "feedback" && (
            <StepFeedback
              choice={choice}
              text={text}
              submitting={submitting}
              onChoice={handleChoice}
              onText={setText}
              onNext={handleNext}
            />
          )}

          {step === "reward" && (
            <StepReward
              activating={activating}
              onActivate={handleActivate}
              onSkip={handleSkip}
            />
          )}

          {step === "done" && choice && (
            <StepDone choice={choice} rewardActivated={rewardActivated} onClose={close} />
          )}
        </div>
      </>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, choice, text, submitting, activating]);

  return { openFeedback, FeedbackModal: Modal };
}
