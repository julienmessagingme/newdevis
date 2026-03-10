import { useState } from 'react';
import { Sparkles, ChevronRight, ChevronLeft, Wand2, Loader2 } from 'lucide-react';
import type { ChantierGuideForm, TypeProjet, Financement } from '@/types/chantier-ia';

interface ScreenPromptProps {
  onGenerate: (description: string, mode: 'libre' | 'guide', guidedForm?: ChantierGuideForm) => void;
  isLoading?: boolean;
}

const EXEMPLES = [
  { emoji: '🪵', text: 'Pergola + terrasse bois + éclairage LED, 20k€ crédit 36 mois' },
  { emoji: '🏠', text: 'Extension maison 30m², budget 80k€, apport + prêt travaux' },
  { emoji: '🛁', text: 'Rénovation complète salle de bain, 15k€ apport perso' },
  { emoji: '🍳', text: 'Cuisine ouverte sur salon, 12k€ crédit conso' },
  { emoji: '🌿', text: 'Aménagement jardin paysager + arrosage auto, 8k€' },
  { emoji: '🔌', text: 'Rénovation électrique totale maison 120m², 12k€' },
];

const TYPES_PROJET: { key: TypeProjet; label: string; emoji: string }[] = [
  { key: 'renovation_maison', label: 'Rénovation maison', emoji: '🏠' },
  { key: 'salle_de_bain', label: 'Salle de bain', emoji: '🛁' },
  { key: 'cuisine', label: 'Cuisine', emoji: '🍳' },
  { key: 'extension', label: 'Extension', emoji: '🏗️' },
  { key: 'terrasse', label: 'Terrasse', emoji: '🪵' },
  { key: 'pergola', label: 'Pergola', emoji: '⛺' },
  { key: 'isolation', label: 'Isolation', emoji: '🧱' },
  { key: 'toiture', label: 'Toiture', emoji: '🏚️' },
  { key: 'piscine', label: 'Piscine', emoji: '🏊' },
  { key: 'electricite', label: 'Électricité', emoji: '⚡' },
  { key: 'plomberie', label: 'Plomberie', emoji: '🔧' },
  { key: 'autre', label: 'Autre projet', emoji: '🔨' },
];

const BUDGETS_PRESETS = [5000, 10000, 20000, 35000, 50000, 80000, 100000, 150000];

const DATES_OPTIONS = [
  { value: '2026-04', label: 'Avril 2026' },
  { value: '2026-05', label: 'Mai 2026' },
  { value: '2026-06', label: 'Juin 2026' },
  { value: '2026-07', label: 'Juillet 2026' },
  { value: '2026-09', label: 'Automne 2026' },
  { value: '2027-01', label: 'Début 2027' },
];

const FINANCEMENTS: { key: Financement; label: string; icon: string; desc: string }[] = [
  { key: 'apport', label: 'Apport personnel', icon: '💰', desc: 'Financement 100% sur fonds propres' },
  { key: 'credit', label: 'Crédit travaux', icon: '🏦', desc: 'Prêt bancaire ou crédit conso' },
  { key: 'mixte', label: 'Mixte', icon: '⚖️', desc: 'Apport + crédit complémentaire' },
];

const DUREES_CREDIT = ['12 mois', '24 mois', '36 mois', '48 mois', '60 mois', '84 mois', '120 mois'];

export default function ScreenPrompt({ onGenerate, isLoading = false }: ScreenPromptProps) {
  const [mode, setMode] = useState<'libre' | 'guide'>('libre');
  const [description, setDescription] = useState('');
  const [step, setStep] = useState(0); // étape wizard (0-3)

  const [form, setForm] = useState<ChantierGuideForm>({
    typeProjet: null,
    typeEmoji: null,
    budget: 20000,
    financement: null,
    dureeCredit: '36 mois',
    dateDebut: '',
    dateLabelFr: '',
  });

  const updateForm = (patch: Partial<ChantierGuideForm>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmitLibre = () => {
    const text = description.trim() || EXEMPLES[0].text;
    onGenerate(text, 'libre');
  };

  const handleSubmitGuide = () => {
    if (!form.typeProjet || !form.financement || !form.dateDebut) return;
    onGenerate('', 'guide', form);
  };

  const canNextStep = () => {
    if (step === 0) return !!form.typeProjet;
    if (step === 1) return form.budget > 0;
    if (step === 2) return !!form.financement;
    return !!form.dateDebut;
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center px-4 py-12">
      {/* Header */}
      <div className="text-center mb-8 animate-fade-up">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-blue-300 text-sm font-medium mb-4">
          <Sparkles className="h-3.5 w-3.5" />
          Propulsé par Gemini AI
        </div>
        <h1 className="text-3xl sm:text-4xl font-display font-bold text-white mb-3">
          Créer mon chantier IA
        </h1>
        <p className="text-slate-400 text-base max-w-md mx-auto">
          Décrivez votre projet en quelques mots — notre IA génère un plan complet en 10 secondes.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex bg-white/5 rounded-xl p-1 mb-6 animate-fade-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
        <button
          onClick={() => { setMode('libre'); setStep(0); }}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'libre' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
        >
          ✍️ Mode libre
        </button>
        <button
          onClick={() => { setMode('guide'); setStep(0); }}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'guide' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
        >
          🧭 Mode guidé
        </button>
      </div>

      {/* Contenu selon mode */}
      {mode === 'libre' ? (
        <div className="w-full max-w-2xl animate-fade-up" style={{ animationDelay: '0.15s', animationFillMode: 'both' }}>
          {/* Textarea */}
          <div className="ia-prompt-box border border-white/10 rounded-2xl bg-white/5 backdrop-blur-sm overflow-hidden mb-4 transition-all">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex : Pergola 20m² + terrasse ipé + éclairage LED, budget 20k€ crédit 36 mois…"
              className="w-full bg-transparent text-white placeholder-slate-500 text-base resize-none p-5 outline-none min-h-[120px]"
              maxLength={500}
            />
            <div className="flex items-center justify-between px-5 pb-4">
              <span className="text-xs text-slate-600">{description.length}/500</span>
              <button
                onClick={handleSubmitLibre}
                disabled={isLoading}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-all"
              >
                {isLoading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Wand2 className="h-4 w-4" />}
                {isLoading ? 'Analyse en cours…' : 'Créer mon chantier'}
              </button>
            </div>
          </div>

          {/* Exemples */}
          <p className="text-slate-500 text-xs mb-3 text-center">Ou choisissez un exemple :</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EXEMPLES.map((ex) => (
              <button
                key={ex.text}
                onClick={() => setDescription(ex.text)}
                className="flex items-start gap-2.5 text-left bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/10 rounded-xl px-4 py-3 transition-all group"
              >
                <span className="text-lg shrink-0">{ex.emoji}</span>
                <span className="text-slate-400 group-hover:text-slate-200 text-xs leading-relaxed transition-colors">{ex.text}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="w-full max-w-2xl animate-fade-up" style={{ animationDelay: '0.15s', animationFillMode: 'both' }}>
          {/* Progress bar */}
          <div className="flex items-center gap-2 mb-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/10">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: i <= step ? '100%' : '0%' }}
                />
              </div>
            ))}
          </div>
          <div className="text-xs text-slate-500 mb-6 text-center">
            Étape {step + 1} / 4
          </div>

          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
            {/* Étape 0 : Type de projet */}
            {step === 0 && (
              <div>
                <h2 className="text-white font-semibold text-lg mb-1">Quel type de projet ?</h2>
                <p className="text-slate-500 text-sm mb-5">Sélectionnez la catégorie la plus proche</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {TYPES_PROJET.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => updateForm({ typeProjet: t.key, typeEmoji: t.emoji })}
                      className={`flex flex-col items-center gap-1.5 rounded-xl p-3 border transition-all ${
                        form.typeProjet === t.key
                          ? 'border-blue-500 bg-blue-500/15 text-blue-200'
                          : 'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-white/10 hover:text-white'
                      }`}
                    >
                      <span className="text-2xl">{t.emoji}</span>
                      <span className="text-xs text-center leading-tight">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Étape 1 : Budget */}
            {step === 1 && (
              <div>
                <h2 className="text-white font-semibold text-lg mb-1">Quel est votre budget ?</h2>
                <p className="text-slate-500 text-sm mb-5">Estimation globale travaux + matériaux</p>
                <div className="text-center mb-6">
                  <span className="text-4xl font-display font-bold text-white">
                    {form.budget.toLocaleString('fr-FR')} €
                  </span>
                </div>
                <input
                  type="range"
                  min={2000}
                  max={200000}
                  step={1000}
                  value={form.budget}
                  onChange={(e) => updateForm({ budget: Number(e.target.value) })}
                  className="w-full accent-blue-500 mb-5"
                />
                <div className="flex flex-wrap gap-2 justify-center">
                  {BUDGETS_PRESETS.map((b) => (
                    <button
                      key={b}
                      onClick={() => updateForm({ budget: b })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        form.budget === b
                          ? 'border-blue-500 bg-blue-500/20 text-blue-200'
                          : 'border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {b >= 1000 ? `${b / 1000}k€` : `${b}€`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Étape 2 : Financement */}
            {step === 2 && (
              <div>
                <h2 className="text-white font-semibold text-lg mb-1">Comment financez-vous ?</h2>
                <p className="text-slate-500 text-sm mb-5">Mode de financement du projet</p>
                <div className="flex flex-col gap-3 mb-5">
                  {FINANCEMENTS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => updateForm({ financement: f.key })}
                      className={`flex items-center gap-3 rounded-xl p-4 border transition-all text-left ${
                        form.financement === f.key
                          ? 'border-blue-500 bg-blue-500/15'
                          : 'border-white/[0.07] bg-white/[0.02] hover:border-white/10'
                      }`}
                    >
                      <span className="text-2xl">{f.icon}</span>
                      <div>
                        <p className="text-white text-sm font-medium">{f.label}</p>
                        <p className="text-slate-500 text-xs">{f.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {(form.financement === 'credit' || form.financement === 'mixte') && (
                  <div>
                    <p className="text-slate-400 text-sm mb-2">Durée du crédit :</p>
                    <div className="flex flex-wrap gap-2">
                      {DUREES_CREDIT.map((d) => (
                        <button
                          key={d}
                          onClick={() => updateForm({ dureeCredit: d })}
                          className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                            form.dureeCredit === d
                              ? 'border-blue-500 bg-blue-500/20 text-blue-200'
                              : 'border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Étape 3 : Date + récap */}
            {step === 3 && (
              <div>
                <h2 className="text-white font-semibold text-lg mb-1">Date de démarrage souhaitée ?</h2>
                <p className="text-slate-500 text-sm mb-5">Quand souhaitez-vous démarrer les travaux ?</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
                  {DATES_OPTIONS.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => updateForm({ dateDebut: d.value, dateLabelFr: d.label })}
                      className={`rounded-xl py-3 px-4 border text-sm transition-all ${
                        form.dateDebut === d.value
                          ? 'border-blue-500 bg-blue-500/15 text-blue-200'
                          : 'border-white/[0.07] text-slate-400 hover:border-white/10 hover:text-white'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>

                {/* Récapitulatif */}
                {form.typeProjet && form.dateDebut && (
                  <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 mt-2">
                    <p className="text-slate-400 text-xs mb-3 font-medium uppercase tracking-wider">Récapitulatif</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Projet</span>
                        <span className="text-white">
                          {form.typeEmoji} {TYPES_PROJET.find((t) => t.key === form.typeProjet)?.label}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Budget</span>
                        <span className="text-white">{form.budget.toLocaleString('fr-FR')} €</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Financement</span>
                        <span className="text-white">
                          {FINANCEMENTS.find((f) => f.key === form.financement)?.label}
                          {form.financement !== 'apport' ? ` · ${form.dureeCredit}` : ''}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Démarrage</span>
                        <span className="text-white">{form.dateLabelFr}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/[0.06]">
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="flex items-center gap-1 text-slate-400 hover:text-white text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
                Retour
              </button>

              {step < 3 ? (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canNextStep()}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-all"
                >
                  Suivant
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmitGuide}
                  disabled={!canNextStep() || isLoading}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-all"
                >
                  {isLoading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Wand2 className="h-4 w-4" />}
                  {isLoading ? 'Analyse en cours…' : 'Créer mon chantier'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
