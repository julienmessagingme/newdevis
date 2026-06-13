import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Info } from 'lucide-react';

// ── Réponses d'onboarding ─────────────────────────────────────────────────────

export interface OnboardingAnswers {
  /** Gère un seul chantier ou plusieurs (l'essai gratuit ne couvre qu'un chantier ;
   *  'multi' sert surtout de signal d'intention pour l'offre Multi). */
  chantiersScope: 'mono' | 'multi';
  /** Comment l'utilisateur cadre le démarrage. */
  dateMode: 'debut' | 'fin' | 'inconnu';
  /** Date ISO yyyy-mm-dd si dateMode = debut|fin, sinon null. */
  dateValue: string | null;
  /** A déjà un budget défini (true) → on lui demande le montant à l'étape suivante ;
   *  sinon (false) → le Pilote estime le budget. Pilote l'écran de description. */
  hasBudget: boolean;
}

interface Props {
  onComplete: (answers: OnboardingAnswers) => void;
  onBack: () => void;
  /** Réponses déjà saisies (retour depuis l'écran de description) → on les pré-remplit
   *  et on reprend à la dernière question, pour ne pas re-poser le tunnel. */
  initial?: OnboardingAnswers | null;
}

const TOTAL_STEPS = 3;

// ── Carte d'option ────────────────────────────────────────────────────────────

function Opt({
  selected, onClick, emoji, title, sub,
}: {
  selected: boolean;
  onClick: () => void;
  emoji: string;
  title: string;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex items-center gap-3 w-full text-left rounded-2xl border px-4 py-3.5 transition-all touch-manipulation ${
        selected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
      }`}
    >
      <span className="text-2xl shrink-0 leading-none">{emoji}</span>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-semibold ${selected ? 'text-white' : 'text-slate-200'}`}>{title}</span>
        {sub && <span className="block text-xs text-slate-500 mt-0.5">{sub}</span>}
      </span>
      <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
        selected ? 'bg-blue-500 border-blue-500' : 'border-white/20'
      }`}>
        {selected && <Check className="w-3 h-3 text-white" aria-hidden="true" />}
      </span>
    </button>
  );
}

// ── Écran principal (assistant une-question-par-écran) ──────────────────────────

export default function ScreenOnboarding({ onComplete, onBack, initial }: Props) {
  // Si on revient depuis l'écran de description, on reprend à la dernière question
  // avec les réponses déjà données (pas de re-questionnement).
  const [step, setStep]           = useState(initial ? TOTAL_STEPS - 1 : 0);
  const [scope, setScope]         = useState<'mono' | 'multi' | null>(initial?.chantiersScope ?? null);
  const [hasBudget, setHasBudget] = useState<boolean | null>(initial ? initial.hasBudget : null);
  const [dateMode, setDateMode]   = useState<'debut' | 'fin' | 'inconnu' | null>(initial?.dateMode ?? null);
  const [dateValue, setDateValue] = useState(initial?.dateValue ?? '');

  const today = new Date().toISOString().slice(0, 10);
  const needsDate = dateMode === 'debut' || dateMode === 'fin';

  const stepValid =
    step === 0 ? scope !== null :
    step === 1 ? hasBudget !== null :
    dateMode !== null && (!needsDate || !!dateValue);

  const goBack = () => {
    if (step === 0) onBack();
    else setStep((s) => s - 1);
  };

  const goNext = () => {
    if (!stepValid) return;
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
      return;
    }
    onComplete({
      chantiersScope: scope!,
      hasBudget: hasBudget!,
      dateMode: dateMode!,
      dateValue: needsDate ? dateValue : null,
    });
  };

  const headings = [
    { kicker: 'Question 1 / 3', title: 'Vous gérez un seul chantier ou plusieurs ?', sub: 'Pour adapter votre espace.' },
    { kicker: 'Question 2 / 3', title: 'Avez-vous déjà un budget défini pour votre chantier ?', sub: 'Pour démarrer au bon endroit.' },
    { kicker: 'Question 3 / 3', title: 'Où en êtes-vous du démarrage ?', sub: 'Pour caler votre planning.' },
  ];
  const h = headings[step];

  return (
    <div className="min-h-screen bg-[#080d1a] flex flex-col">
      {/* Header : retour + progression */}
      <div className="flex items-center gap-4 px-4 sm:px-6 py-4">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" aria-hidden="true" />
          {step === 0 ? 'Mes chantiers' : 'Retour'}
        </button>
        <div className="flex items-center gap-1.5 ml-auto" aria-hidden="true">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-6 bg-blue-500' : i < step ? 'w-1.5 bg-blue-500/60' : 'w-1.5 bg-white/15'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div
          key={step}
          className="w-full max-w-lg"
          style={{ animation: 'fade-up 0.4s cubic-bezier(0.22,1,0.36,1) both' }}
        >
          {/* Titre de l'étape */}
          <div className="mb-7">
            <span className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full mb-4">
              🏗️ Nouveau chantier
            </span>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400/80 mb-2">{h.kicker}</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-1.5">{h.title}</h1>
            <p className="text-slate-500 text-sm">{h.sub}</p>
          </div>

          {/* Étape 1 — périmètre */}
          {step === 0 && (
            <div className="space-y-2">
              <Opt selected={scope === 'mono'} onClick={() => setScope('mono')}
                emoji="🏠" title="Un seul chantier" sub="Mon projet du moment" />
              <Opt selected={scope === 'multi'} onClick={() => setScope('multi')}
                emoji="🏘️" title="Plusieurs chantiers" sub="J'en pilote plusieurs" />
              {scope === 'multi' && (
                <div className="flex items-start gap-2.5 rounded-xl bg-[#F58A06]/10 border border-[#F58A06]/25 px-3.5 py-3 mt-1">
                  <Info className="h-4 w-4 text-[#F58A06] shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-xs text-slate-300 leading-relaxed">
                    L'essai gratuit couvre <span className="font-semibold text-white">1 chantier</span>. Le pilotage multi-chantiers fait partie de l'offre Multi, activable quand vous voulez. On continue avec votre premier chantier.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Étape 2 — budget (pilote l'écran de description : montant vs estimation IA) */}
          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Opt selected={hasBudget === true} onClick={() => setHasBudget(true)}
                emoji="💶" title="Oui, j'ai un budget défini" sub="Vous saisirez le montant juste après" />
              <Opt selected={hasBudget === false} onClick={() => setHasBudget(false)}
                emoji="✨" title="Non, pas encore" sub="Le Pilote estime un budget de départ" />
            </div>
          )}

          {/* Étape 3 — démarrage */}
          {step === 2 && (
            <div className="space-y-2">
              <Opt selected={dateMode === 'debut'} onClick={() => setDateMode('debut')}
                emoji="📅" title="Je connais ma date de début"
                sub="Le planning se calcule à partir de cette date" />
              <Opt selected={dateMode === 'fin'} onClick={() => setDateMode('fin')}
                emoji="🏁" title="Je connais ma date de fin souhaitée"
                sub="Le planning remonte depuis cette date" />
              <Opt selected={dateMode === 'inconnu'} onClick={() => setDateMode('inconnu')}
                emoji="🤷" title="Je ne sais pas encore"
                sub="Vous définirez les dates plus tard" />
              {needsDate && (
                <div className="pt-1">
                  <label className="block text-xs text-slate-500 mb-1.5">
                    {dateMode === 'debut' ? 'Date de début' : 'Date de fin souhaitée'}
                  </label>
                  <input
                    type="date"
                    value={dateValue}
                    min={today}
                    onChange={(e) => setDateValue(e.target.value)}
                    className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500/60 [color-scheme:dark]"
                  />
                </div>
              )}
            </div>
          )}

          {/* CTA */}
          <button
            type="button"
            onClick={goNext}
            disabled={!stepValid}
            className="mt-8 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold rounded-xl py-4 text-base transition-all touch-manipulation min-h-[48px] disabled:bg-white/10 disabled:text-slate-600 disabled:cursor-not-allowed"
          >
            {step < TOTAL_STEPS - 1 ? 'Continuer' : "C'est parti"}
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
