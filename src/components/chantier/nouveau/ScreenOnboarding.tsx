import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

// ── Réponses d'onboarding ─────────────────────────────────────────────────────

export interface OnboardingAnswers {
  /** Gère un seul chantier ou plusieurs (orientation offre — usage futur). */
  chantiersScope: 'mono' | 'multi';
  /** Comment l'utilisateur cadre le démarrage. */
  dateMode: 'debut' | 'fin' | 'inconnu';
  /** Date ISO yyyy-mm-dd si dateMode = debut|fin, sinon null. */
  dateValue: string | null;
  /** A-t-il déjà des devis d'artisans ? */
  hasDevis: boolean;
}

interface Props {
  onComplete: (answers: OnboardingAnswers) => void;
  onBack: () => void;
}

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

// ── Écran principal ───────────────────────────────────────────────────────────

export default function ScreenOnboarding({ onComplete, onBack }: Props) {
  const [scope, setScope]       = useState<'mono' | 'multi' | null>(null);
  const [dateMode, setDateMode] = useState<'debut' | 'fin' | 'inconnu' | null>(null);
  const [dateValue, setDateValue] = useState('');
  const [hasDevis, setHasDevis] = useState<boolean | null>(null);

  const needsDate = dateMode === 'debut' || dateMode === 'fin';
  const canSubmit =
    scope !== null && dateMode !== null && hasDevis !== null && (!needsDate || !!dateValue);

  const submit = () => {
    if (!canSubmit) return;
    onComplete({
      chantiersScope: scope!,
      dateMode: dateMode!,
      dateValue: needsDate ? dateValue : null,
      hasDevis: hasDevis!,
    });
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-[#080d1a] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" aria-hidden="true" />
          Mes chantiers
        </button>
      </div>

      {/* Contenu */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div
          className="w-full max-w-lg"
          style={{ animation: 'fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both' }}
        >
          {/* Titre */}
          <div className="mb-8">
            <span className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full mb-4">
              🏗️ Nouveau chantier
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-1.5">
              Avant de commencer, 3 questions
            </h1>
            <p className="text-slate-500 text-sm">
              Pour adapter votre plan de chantier et votre planning.
            </p>
          </div>

          <div className="space-y-7">

            {/* Q1 — Scope chantiers */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
                Vous gérez…
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Opt selected={scope === 'mono'} onClick={() => setScope('mono')}
                  emoji="🏠" title="Un seul chantier" sub="Mon projet du moment" />
                <Opt selected={scope === 'multi'} onClick={() => setScope('multi')}
                  emoji="🏘️" title="Plusieurs chantiers" sub="J'en pilote plusieurs" />
              </div>
            </div>

            {/* Q2 — Démarrage */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
                Où en êtes-vous du démarrage ?
              </p>
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
              </div>
              {needsDate && (
                <div className="mt-3">
                  <label className="block text-xs text-slate-500 mb-1.5">
                    {dateMode === 'debut' ? 'Date de début' : 'Date de fin souhaitée'}
                  </label>
                  <input
                    type="date"
                    value={dateValue}
                    min={dateMode === 'debut' ? today : undefined}
                    onChange={(e) => setDateValue(e.target.value)}
                    className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500/60 [color-scheme:dark]"
                  />
                </div>
              )}
            </div>

            {/* Q3 — Devis */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
                Avez-vous déjà des devis d'artisans ?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Opt selected={hasDevis === true} onClick={() => setHasDevis(true)}
                  emoji="📄" title="Oui, j'en ai déjà" sub="Vous pourrez les ajouter ensuite" />
                <Opt selected={hasDevis === false} onClick={() => setHasDevis(false)}
                  emoji="✨" title="Non, pas encore" sub="L'IA estime un budget de départ" />
              </div>
            </div>

          </div>

          {/* CTA */}
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="mt-8 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold rounded-xl py-4 text-base transition-all touch-manipulation min-h-[48px] disabled:bg-white/10 disabled:text-slate-600 disabled:cursor-not-allowed"
          >
            Continuer
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
