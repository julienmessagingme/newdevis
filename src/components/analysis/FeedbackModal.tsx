/**
 * FeedbackModal — popup post-analyse
 *
 * Triggers :
 *   1. Auto : 2.5s après le mount (si pas déjà affiché)
 *   2. Externe : appeler openFeedback() retourné par useFeedback()
 *
 * Flow : feedback (👍/😐/❌ + texte optionnel) → reward (activation GMC) → done (Trustpilot ou message)
 *
 * Usage :
 *   const { openFeedback, FeedbackModal } = useFeedback({ userId });
 *   // dans le JSX :
 *   <button onClick={openFeedback}>Copier message</button>
 *   <FeedbackModal />
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/amplitude";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY    = "vmdf_feedback_shown";
const TRUSTPILOT_URL = "https://fr.trustpilot.com/evaluate/verifiermondevis.fr";
const AUTO_DELAY_MS  = 2500;

// ─── Types ────────────────────────────────────────────────────────────────────

type Choice = "positive" | "neutral" | "negative";
type Step   = "feedback" | "reward" | "done";

// ─── Tracking helper ──────────────────────────────────────────────────────────

function track(eventName: string, payload?: Record<string, unknown>) {
  try { trackEvent(eventName, payload); } catch { /* never throw */ }
}

// ─── API ──────────────────────────────────────────────────────────────────────

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

// ─── Step components ──────────────────────────────────────────────────────────

const CHOICES: { id: Choice; emoji: string; label: string }[] = [
  { id: "positive", emoji: "👍", label: "Oui, vraiment" },
  { id: "neutral",  emoji: "😐", label: "Un peu" },
  { id: "negative", emoji: "❌", label: "Pas vraiment" },
];

function StepFeedback({
  choice, text,
  onChoice, onText, onNext,
}: {
  choice: Choice | null;
  text: string;
  onChoice: (c: Choice) => void;
  onText:   (t: string) => void;
  onNext:   () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <p className="text-base font-semibold text-slate-900">
          Cette analyse vous a-t-elle aidé ?
        </p>
        <p className="text-xs text-slate-400 mt-0.5">Votre avis améliore l'outil</p>
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

      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder="Un commentaire ? (optionnel)"
        rows={2}
        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2
                   text-sm text-slate-700 placeholder:text-slate-400
                   focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
      />

      <Button
        onClick={onNext}
        disabled={!choice}
        className="w-full h-11 rounded-xl font-semibold"
      >
        Continuer →
      </Button>
    </div>
  );
}

function StepReward({
  loading, onActivate, onSkip,
}: {
  loading:    boolean;
  onActivate: () => void;
  onSkip:     () => void;
}) {
  return (
    <div className="flex flex-col gap-5 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <span className="text-3xl">🏗️</span>
      </div>

      <div>
        <p className="text-lg font-bold text-slate-900">Merci pour votre retour !</p>
        <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
          Débloquez{" "}
          <strong className="text-slate-700">GérerMonChantier</strong>{" "}
          gratuitement — suivez votre chantier, vos dépenses et vos artisans depuis une seule interface.
        </p>
      </div>

      <Button
        onClick={onActivate}
        disabled={loading}
        className="w-full h-12 rounded-xl font-semibold text-base"
      >
        {loading
          ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Activation…</>
          : "Activer mon accès →"}
      </Button>

      <button
        onClick={onSkip}
        className="text-xs text-slate-400 hover:text-slate-600 transition-colors touch-manipulation"
      >
        Non merci, plus tard
      </button>
    </div>
  );
}

function StepDone({
  choice, onClose,
}: {
  choice:  Choice;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle2 className="h-6 w-6 text-green-600" />
      </div>

      <div>
        <p className="text-base font-bold text-slate-900">Accès activé ! 🎉</p>
        <p className="text-sm text-slate-500 mt-1">
          Votre accès GérerMonChantier est maintenant actif.
        </p>
      </div>

      {choice !== "negative" ? (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <p className="text-sm text-slate-600 font-medium mb-3">
            Vous avez 2 min ? Votre avis nous aide énormément 🙏
          </p>
          <a
            href={TRUSTPILOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("trustpilot_click", { from: "feedback_modal" })}
            className="inline-flex items-center gap-2 bg-[#00B67A] hover:bg-[#00a369]
                       text-white font-semibold text-sm px-5 py-2.5 rounded-xl
                       transition-colors touch-manipulation"
          >
            <ExternalLink className="h-4 w-4" />
            Laisser un avis Trustpilot
          </a>
        </div>
      ) : (
        <p className="text-sm text-slate-500 leading-relaxed">
          On travaille continuellement à améliorer les analyses.
          Votre retour nous aide à progresser — merci. 🙏
        </p>
      )}

      <Button variant="outline" onClick={onClose} className="w-full h-10 rounded-xl">
        Fermer
      </Button>
    </div>
  );
}

// ─── Progress dots ─────────────────────────────────────────────────────────────

const STEPS: Step[] = ["feedback", "reward", "done"];

function ProgressBar({ step }: { step: Step }) {
  const currentIdx = STEPS.indexOf(step);
  return (
    <div className="flex gap-1.5 mb-5">
      {STEPS.map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
            i <= currentIdx ? "bg-primary" : "bg-slate-200"
          }`}
        />
      ))}
    </div>
  );
}

// ─── Hook — single source of truth ───────────────────────────────────────────

export function useFeedback() {
  const [open, setOpen]       = useState(false);
  const [step, setStep]       = useState<Step>("feedback");
  const [choice, setChoice]   = useState<Choice | null>(null);
  const [text, setText]       = useState("");
  const [loading, setLoading] = useState(false);

  // Auto-trigger
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    const t = setTimeout(() => {
      setOpen(true);
      track("feedback_open", { trigger: "auto" });
    }, AUTO_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const openFeedback = useCallback(() => {
    if (typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY)) return;
    setOpen(true);
    track("feedback_open", { trigger: "manual" });
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const handleChoice = useCallback((c: Choice) => {
    setChoice(c);
    track("feedback_choice", { choice: c });
  }, []);

  const handleNext = useCallback(() => {
    if (!choice) return;
    if (text.trim()) track("feedback_text", { length: text.trim().length });
    localStorage.setItem(STORAGE_KEY, "true");
    setStep("reward");
  }, [choice, text]);

  const handleActivate = useCallback(async () => {
    setLoading(true);
    try {
      await activateGererMonChantier();
      track("reward_activated");
      toast.success("Accès GérerMonChantier activé !");
    } catch {
      toast.error("Erreur lors de l'activation. Réessayez.");
    } finally {
      setLoading(false);
      setStep("done");
    }
  }, []);

  const handleSkip = useCallback(() => setStep("done"), []);

  // Le composant modal est mémoïsé pour éviter les re-renders inutiles du parent
  const Modal = useMemo(() => {
    if (!open) return null;

    return (
      <>
        {/* Backdrop */}
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
        >
          {/* Close */}
          <button
            onClick={close}
            aria-label="Fermer"
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors touch-manipulation"
          >
            <X className="h-4 w-4" />
          </button>

          <ProgressBar step={step} />

          {step === "feedback" && (
            <StepFeedback
              choice={choice}
              text={text}
              onChoice={handleChoice}
              onText={setText}
              onNext={handleNext}
            />
          )}

          {step === "reward" && (
            <StepReward
              loading={loading}
              onActivate={handleActivate}
              onSkip={handleSkip}
            />
          )}

          {step === "done" && choice && (
            <StepDone choice={choice} onClose={close} />
          )}
        </div>
      </>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, choice, text, loading]);

  return { openFeedback, FeedbackModal: Modal };
}
