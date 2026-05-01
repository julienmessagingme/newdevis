/**
 * FeedbackModal — popup post-analyse
 *
 * Triggers :
 *   1. Auto : scroll > 60% OU 5s après première interaction (scroll/clic) — jamais sur page idle
 *   2. Externe : openFeedback() — ex. clic "Copier le message"
 *
 * Flow : feedback (👍/😐/❌ + texte) → reward (activation GMC) → done (Trustpilot conditionnel)
 * Persistence : localStorage 'vmdf_feedback_shown' avec TTL 7 jours
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/amplitude";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY      = "vmdf_feedback_shown";
const TTL_DAYS         = 7;
const INTERACTION_WAIT = 5_000;   // ms après première interaction
const SCROLL_THRESHOLD = 0.60;    // 60% de la page
const TRUSTPILOT_URL   = "https://fr.trustpilot.com/evaluate/verifiermondevis.fr";
const TEXT_MAX         = 200;

// ─── Types ────────────────────────────────────────────────────────────────────

type Choice  = "positive" | "neutral" | "negative";
type Step    = "feedback" | "reward" | "done";
// État intermédiaire de l'activation (credibility delay)
type Activating = "idle" | "activating" | "activated";

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
  choice, text, onChoice, onText, onNext,
}: {
  choice:   Choice | null;
  text:     string;
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
        disabled={!choice}
        className="w-full h-11 rounded-xl font-semibold"
      >
        Continuer →
      </Button>
    </div>
  );
}

// ─── Step 2 — Reward ─────────────────────────────────────────────────────────

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
        <span className="text-3xl">🏗️</span>
      </div>

      {activating === "activating" ? (
        <div className="flex flex-col items-center gap-2 py-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm font-medium text-slate-600">
            Merci pour votre retour 🙏<br />
            <span className="text-slate-400">Activation en cours…</span>
          </p>
        </div>
      ) : (
        <>
          <div>
            <p className="text-lg font-bold text-slate-900">Merci pour votre retour !</p>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
              Débloquez{" "}
              <strong className="text-slate-700">GérerMonChantier</strong>{" "}
              gratuitement — suivez votre chantier, paiements et alertes depuis une seule interface.
            </p>
            <p className="text-xs text-slate-400 mt-2">Utilisé par +200 propriétaires</p>
          </div>

          <div>
            <Button
              onClick={onActivate}
              disabled={activating !== "idle"}
              className="w-full h-12 rounded-xl font-semibold text-base"
            >
              🎁 Débloquer mon accès offert
            </Button>
            <p className="text-xs text-slate-400 mt-1.5">
              Suivi chantier, paiements et alertes
            </p>
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

function StepDone({ choice, onClose }: { choice: Choice; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-5 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle2 className="h-6 w-6 text-green-600" />
      </div>

      <div>
        <p className="text-base font-bold text-slate-900">🎁 Accès débloqué !</p>
        <p className="text-sm text-slate-500 mt-1">
          Votre accès GérerMonChantier est maintenant actif.
        </p>
      </div>

      {choice !== "negative" ? (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-left">
          <p className="text-sm text-slate-700 leading-relaxed mb-3">
            Merci 🙏<br />
            Votre retour nous aide vraiment à améliorer l'outil.
            <br /><br />
            Si l'analyse vous a été utile, vous pouvez nous aider en laissant un avis.
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
      ) : (
        <p className="text-sm text-slate-500 leading-relaxed">
          On travaille continuellement à améliorer les analyses.
          Votre retour honnête nous aide à progresser — merci. 🙏
        </p>
      )}

      <Button variant="outline" onClick={onClose} className="w-full h-10 rounded-xl">
        Fermer
      </Button>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

const STEPS: Step[] = ["feedback", "reward", "done"];

function ProgressBar({ step }: { step: Step }) {
  const idx = STEPS.indexOf(step);
  return (
    <div className="flex gap-1.5 mb-5">
      {STEPS.map((_, i) => (
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

export function useFeedback() {
  const [open,       setOpen]       = useState(false);
  const [step,       setStep]       = useState<Step>("feedback");
  const [choice,     setChoice]     = useState<Choice | null>(null);
  const [text,       setText]       = useState("");
  const [activating, setActivating] = useState<Activating>("idle");

  // ── Trigger intelligent (scroll > 60% OU 5s après première interaction) ───
  const triggeredRef   = useRef(false);
  const interactedRef  = useRef(false);
  const interactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tryOpen = useCallback((trigger: string) => {
    if (triggeredRef.current) return;
    if (hasBeenShown()) return;
    triggeredRef.current = true;
    setOpen(true);
    track("feedback_open", { trigger });
  }, []);

  useEffect(() => {
    if (hasBeenShown()) return;

    const onInteraction = () => {
      if (interactedRef.current) return;
      interactedRef.current = true;
      interactTimerRef.current = setTimeout(() => tryOpen("interaction_timer"), INTERACTION_WAIT);
    };

    const onScroll = () => {
      onInteraction(); // l'interaction démarre aussi le timer
      const scrolled = window.scrollY / (document.body.scrollHeight - window.innerHeight);
      if (scrolled >= SCROLL_THRESHOLD) tryOpen("scroll");
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("click",  onInteraction, { passive: true, once: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("click",  onInteraction);
      if (interactTimerRef.current) clearTimeout(interactTimerRef.current);
    };
  }, [tryOpen]);

  // ── ESC pour fermer ───────────────────────────────────────────────────────
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // ── Trigger externe ───────────────────────────────────────────────────────
  const openFeedback = useCallback(() => {
    if (hasBeenShown()) return;
    triggeredRef.current = true; // évite double-trigger auto
    if (interactTimerRef.current) clearTimeout(interactTimerRef.current);
    setOpen(true);
    track("feedback_open", { trigger: "manual" });
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleChoice = useCallback((c: Choice) => {
    setChoice(c);
    track("feedback_choice", { choice: c });
  }, []);

  const handleNext = useCallback(() => {
    if (!choice) return;
    if (text.trim()) track("feedback_text", { length: text.trim().length });
    markShown();
    setStep("reward");
  }, [choice, text]);

  const handleActivate = useCallback(async () => {
    setActivating("activating");
    try {
      // Délai crédibilité : 600–800ms avant d'appeler l'API
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
              activating={activating}
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
  }, [open, step, choice, text, activating]);

  return { openFeedback, FeedbackModal: Modal };
}
