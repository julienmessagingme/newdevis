/**
 * BudgetAffinageModal — Modal questionnaire pour affiner l'estimation budget.
 */
import { useMemo, useState, useCallback } from 'react';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import type {
  ProjectElementDef,
  BreakdownItem,
  AffinageAnswers,
} from '@/lib/budgetAffinageData';
import {
  ELEMENT_DEFS,
  INITIAL_ANSWERS,
  buildElementsFromLots,
  computeRefinedRange,
  computeScore,
} from '@/lib/budgetAffinageData';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)} k€`;
  return `${Math.round(n)} €`;
}

// ── ScoreBadge ────────────────────────────────────────────────────────────────

export function ScoreBadge({ score }: { score: number }) {
  const cfg = score <= 1
    ? { label: '🟡 Fiabilité faible',   cls: 'bg-amber-50  text-amber-700  border-amber-200'  }
    : score <= 3
    ? { label: '🔵 Fiabilité moyenne',  cls: 'bg-blue-50   text-blue-700   border-blue-100'   }
    : { label: '🟢 Fiabilité élevée',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Modal affinage budget ─────────────────────────────────────────────────────

export default function BudgetAffinageModal({
  baseMin, baseMax, resultNom, isImmeuble, resultDescription, resultLots,
  onClose, onValidate,
}: {
  baseMin: number; baseMax: number; resultNom: string; isImmeuble: boolean;
  resultDescription?: string;
  resultLots?: { nom: string; budget_min_ht?: number | null; budget_max_ht?: number | null }[];
  onClose: () => void; onValidate: (min: number, max: number, breakdown: BreakdownItem[]) => void;
}) {
  // ── Détection éléments — lots IA comme source primaire ───────────────────
  // Les lots générés par l'IA contiennent déjà tous les types de travaux détectés.
  // On les utilise en priorité, puis on complète avec le texte du prompt.
  const promptText = useMemo(
    () => [resultNom, resultDescription ?? ''].join(' '),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [detectedElements, setDetectedElements] = useState<ProjectElementDef[]>(() =>
    buildElementsFromLots(resultLots ?? [], promptText),
  );

  const [step, setStep] = useState(1);
  const [diyAnswer, setDiyAnswer] = useState<'non' | 'oui' | 'nsp' | null>(null);
  const [diyDetail, setDiyDetail]  = useState('');
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customLabel, setCustomLabel]       = useState('');
  const [customBudMin, setCustomBudMin]     = useState('');
  const [customBudMax, setCustomBudMax]     = useState('');

  function handleAddCustom() {
    const label = customLabel.trim();
    if (!label) return;
    const min = customBudMin ? Math.max(0, Math.round(Number(customBudMin))) : 0;
    const max = customBudMax ? Math.max(0, Math.round(Number(customBudMax))) : 0;
    const id = `custom_${Date.now()}`;
    const def: ProjectElementDef = {
      id, label, emoji: '✏️', keywords: [], typeEquiv: 'renovation_partielle',
      questions: [], isCustom: true,
      customBudgetMin: min || undefined,
      customBudgetMax: max || undefined,
    };
    addCustomElement(def);
    setCustomLabel(''); setCustomBudMin(''); setCustomBudMax('');
    setShowCustomForm(false);
  }

  const [answers, setAnswers] = useState<AffinageAnswers>(() => ({
    ...INITIAL_ANSWERS,
    // Pré-sélectionner tous les éléments détectés depuis les lots IA
    confirmedElements: buildElementsFromLots(resultLots ?? [], promptText).map(e => e.id),
  }));

  // Séquence : confirm_elements → une étape par élément confirmé (toutes les questions sont contextuelles)
  const stepKeys = useMemo(() => {
    const keys: string[] = ['confirm_elements'];
    for (const elemId of answers.confirmedElements) {
      const def = detectedElements.find(e => e.id === elemId);
      // Les éléments personnalisés n'ont pas d'étape questions (budget renseigné à la création)
      if (def && def.questions.length > 0 && !def.isCustom) keys.push(`elem_${elemId}`);
    }
    keys.push('diy'); // Question DIY toujours en dernière position
    return keys;
  }, [answers.confirmedElements, detectedElements]);

  const TOTAL_STEPS = stepKeys.length;
  const currentKey  = stepKeys[step - 1] ?? 'confirm_elements';

  const refined = useMemo(
    () => computeRefinedRange(baseMin, baseMax, answers, detectedElements, resultLots ?? []),
    [baseMin, baseMax, answers, detectedElements, resultLots],
  );
  const score   = useMemo(() => computeScore(answers, detectedElements), [answers, detectedElements]);
  const hasBase = baseMin > 0 || baseMax > 0;

  const upd = useCallback(<K extends keyof AffinageAnswers>(key: K, val: AffinageAnswers[K]) => {
    setAnswers(prev => ({ ...prev, [key]: val }));
  }, []);

  function toggleElement(id: string) {
    setAnswers(prev => {
      const s = new Set(prev.confirmedElements);
      s.has(id) ? s.delete(id) : s.add(id);
      return { ...prev, confirmedElements: Array.from(s) };
    });
  }

  function addCustomElement(def: ProjectElementDef) {
    if (!detectedElements.find(e => e.id === def.id)) {
      setDetectedElements(prev => [...prev, def]);
    }
    setAnswers(prev => {
      if (prev.confirmedElements.includes(def.id)) return prev;
      return { ...prev, confirmedElements: [...prev.confirmedElements, def.id] };
    });
  }

  function updElemAnswer(elemId: string, qId: string, val: string | number) {
    setAnswers(prev => ({
      ...prev,
      elementAnswers: {
        ...prev.elementAnswers,
        [elemId]: { ...(prev.elementAnswers[elemId] ?? {}), [qId]: val },
      },
    }));
  }

  const safeNext = () => {
    const nextStep = step + 1;
    if (!stepKeys[nextStep - 1]) return;
    setStep(nextStep);
  };

  const canNext = (() => {
    if (currentKey === 'confirm_elements') return answers.confirmedElements.length > 0;
    return true; // Les étapes par élément sont toutes facultatives
  })();

  const CHOICE_BASE = 'flex flex-col items-start gap-1 px-4 py-3.5 rounded-2xl border-2 cursor-pointer transition-all text-left w-full';
  const CHOICE_ON   = 'border-blue-500 bg-blue-50 text-blue-900';
  const CHOICE_OFF  = 'border-gray-100 bg-white hover:border-blue-200 text-gray-700';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl flex flex-col max-h-[92vh] sm:max-h-[85vh] shadow-2xl overflow-hidden">

        {/* Header modal */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 text-lg">Affiner mon budget</h2>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Stepper */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i + 1 < step ? 'bg-blue-500' : i + 1 === step ? 'bg-blue-400' : 'bg-gray-100'
              }`} />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1.5">Étape {step} sur {TOTAL_STEPS}</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">

          {/* Estimation live */}
          {hasBase && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl px-5 py-3.5 flex items-center justify-between mb-4 border border-blue-100">
              <div>
                <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-0.5">Estimation actuelle</p>
                <p className="text-2xl font-extrabold text-blue-900 leading-none">
                  {refined.min > 0 ? `${fmtK(refined.min)} – ${fmtK(refined.max)}` : `${fmtK(baseMin)} – ${fmtK(baseMax)}`}
                </p>
              </div>
              <ScoreBadge score={score} />
            </div>
          )}

          {/* Étape 1 — Confirmation des éléments du projet */}
          {currentKey === 'confirm_elements' && (
            <div className="space-y-2">
              <p className="font-semibold text-gray-900 mb-1">Confirmez les éléments de votre projet</p>
              <p className="text-sm text-gray-400 mb-3">
                {detectedElements.length > 0
                  ? 'Nous avons identifié ces éléments — décochez ceux qui ne sont pas prévus'
                  : 'Sélectionnez les éléments de votre projet'}
              </p>

              {detectedElements.map(elem => {
                const active = answers.confirmedElements.includes(elem.id);
                return (
                  <button key={elem.id} onClick={() => toggleElement(elem.id)}
                    className={`${CHOICE_BASE} ${active ? CHOICE_ON : CHOICE_OFF}`}>
                    <div className="flex items-center gap-2 w-full">
                      <span className="text-lg">{elem.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-left">{elem.label}</p>
                        {elem.isCustom && (elem.customBudgetMin || elem.customBudgetMax) && (
                          <p className="text-[10px] text-blue-600 opacity-70 mt-0.5">
                            {elem.customBudgetMin ? fmtK(elem.customBudgetMin) : '?'}{' '}–{' '}
                            {elem.customBudgetMax ? fmtK(elem.customBudgetMax) : '?'}
                          </p>
                        )}
                        {elem.isCustom && !elem.customBudgetMin && !elem.customBudgetMax && (
                          <p className="text-[10px] text-blue-400 opacity-70 mt-0.5">Budget non estimé</p>
                        )}
                      </div>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                        active ? 'border-blue-500 bg-blue-500' : 'border-gray-200'
                      }`}>
                        {active && <Check className="h-3 w-3 text-white" />}
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Ajouter un élément manquant */}
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2">Un élément manque ?</p>
                <div className="flex flex-wrap gap-2">
                  {ELEMENT_DEFS.filter(d => !detectedElements.find(e => e.id === d.id)).map(d => (
                    <button key={d.id} onClick={() => addCustomElement(d)}
                      className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 rounded-full px-3 py-1.5 transition-all">
                      <span>{d.emoji}</span>+ {d.label}
                    </button>
                  ))}
                  {/* Chip "Autre..." */}
                  {!showCustomForm && (
                    <button onClick={() => setShowCustomForm(true)}
                      className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 border-dashed rounded-full px-3 py-1.5 transition-all">
                      ✏️ + Autre...
                    </button>
                  )}
                </div>

                {/* Formulaire inline "Autre" */}
                {showCustomForm && (
                  <div className="mt-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-4 space-y-3">
                    <p className="text-xs font-bold text-blue-900 uppercase tracking-wider">Ajouter un autre élément</p>
                    <input
                      type="text"
                      placeholder="Ex : Réfection toiture, Création bureau…"
                      value={customLabel}
                      onChange={e => setCustomLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && customLabel.trim()) handleAddCustom(); if (e.key === 'Escape') { setShowCustomForm(false); setCustomLabel(''); } }}
                      className="w-full border border-blue-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      autoFocus
                    />
                    <div>
                      <p className="text-[10px] font-semibold text-blue-700 mb-1.5">Estimation budgétaire (optionnel)</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <p className="text-[10px] text-blue-500 mb-1">Min €</p>
                          <input
                            type="number" min="0" placeholder="5 000"
                            value={customBudMin} onChange={e => setCustomBudMin(e.target.value)}
                            className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400"
                          />
                        </div>
                        <span className="text-gray-400 mt-4 shrink-0">–</span>
                        <div className="flex-1">
                          <p className="text-[10px] text-blue-500 mb-1">Max €</p>
                          <input
                            type="number" min="0" placeholder="15 000"
                            value={customBudMax} onChange={e => setCustomBudMax(e.target.value)}
                            className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-blue-400 mt-1.5 leading-relaxed">
                        💡 Laissez vide si vous n'avez pas encore d'estimation — l'élément sera quand même ajouté à votre liste.
                      </p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { setShowCustomForm(false); setCustomLabel(''); setCustomBudMin(''); setCustomBudMax(''); }}
                        className="flex-1 py-2.5 text-sm text-gray-500 border border-gray-200 bg-white rounded-xl hover:bg-gray-50 transition-colors">
                        Annuler
                      </button>
                      <button
                        onClick={handleAddCustom}
                        disabled={!customLabel.trim()}
                        className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors">
                        + Ajouter
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {answers.confirmedElements.length === 0 && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-2.5 mt-1">
                  <span className="text-sm shrink-0">⚠️</span>
                  <p className="text-xs text-amber-700">Sélectionnez au moins un élément pour continuer</p>
                </div>
              )}
            </div>
          )}

          {/* Étapes par élément — questions contextuelles */}
          {currentKey.startsWith('elem_') && (() => {
            const elemId = currentKey.slice(5);
            const def = detectedElements.find(e => e.id === elemId);
            if (!def) return null;
            const ea = answers.elementAnswers[elemId] ?? {};
            return (
              <div className="space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{def.emoji}</span>
                  <p className="font-semibold text-gray-900">{def.label}</p>
                </div>
                <p className="text-sm text-gray-400 -mt-3">Répondez aux questions ci-dessous pour affiner votre estimation</p>
                {def.questions.map(q => (
                  <div key={q.id}>
                    <label className="text-sm font-semibold text-gray-800 mb-0.5 block">{q.label}</label>
                    {q.sub && <p className="text-xs text-gray-400 mb-2 leading-relaxed">{q.sub}</p>}
                    {q.type === 'number' ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="0" placeholder={q.placeholder}
                          value={ea[q.id] ?? ''}
                          onChange={e => updElemAnswer(elemId, q.id, e.target.value ? Number(e.target.value) : '')}
                          className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                        {q.unit && <span className="text-sm font-medium text-gray-400 shrink-0">{q.unit}</span>}
                      </div>
                    ) : q.type === 'yesno' ? (
                      <div className="grid grid-cols-2 gap-2">
                        {(['oui', 'non'] as const).map(v => {
                          const active = ea[q.id] === v;
                          const isOui = v === 'oui';
                          return (
                            <button key={v} onClick={() => updElemAnswer(elemId, q.id, v)}
                              className={`py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                                active
                                  ? isOui ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-400 bg-gray-100 text-gray-700'
                                  : 'border-gray-100 hover:border-gray-300 text-gray-600'
                              }`}>
                              {isOui ? '✓ Oui' : '✗ Non'}
                              {active && isOui && q.addMax && q.addMax > 0 && (
                                <span className="ml-1.5 text-[10px] opacity-70">+{fmtK(q.addMax)} max</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {q.choices?.map(choice => (
                          <button key={choice} onClick={() => updElemAnswer(elemId, q.id, choice)}
                            className={`${CHOICE_BASE} ${ea[q.id] === choice ? CHOICE_ON : CHOICE_OFF} w-full text-left`}>
                            <div className="flex items-center gap-2 w-full">
                              <div className="flex-1">
                                <p className="font-semibold text-sm">{choice}</p>
                                {q.choiceImpact?.[choice] && (() => {
                                  const imp = q.choiceImpact![choice];
                                  const delta = imp.addAvg;
                                  if (delta === 0) return <p className="text-[10px] text-gray-400">Prix de référence</p>;
                                  return (
                                    <p className={`text-[10px] font-medium ${delta > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                      {delta > 0 ? `+${fmtK(delta)} en moyenne` : `${fmtK(delta)} en moyenne`}
                                    </p>
                                  );
                                })()}
                              </div>
                              {ea[q.id] === choice && <Check className="h-4 w-4 text-blue-500 shrink-0" />}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Étape DIY — travaux réalisés soi-même */}
          {currentKey === 'diy' && (
            <div className="space-y-4">
              <div className="mb-1">
                <p className="font-semibold text-gray-900 mb-1">Pensez-vous réaliser certains travaux vous-même ?</p>
                <p className="text-sm text-gray-400 leading-relaxed">Peinture, petits aménagements, plantations… Indiquez ce que vous comptez faire pour que nous adaptions les conseils.</p>
              </div>

              {/* Non */}
              <button onClick={() => { setDiyAnswer('non'); setDiyDetail(''); }}
                className={`${CHOICE_BASE} ${diyAnswer === 'non' ? CHOICE_ON : CHOICE_OFF}`}>
                <div className="flex items-center gap-3 w-full">
                  <span className="text-lg shrink-0">🙅</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-left">Non — je délègue tout à des professionnels</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Le budget affiché correspond à une réalisation 100% artisans</p>
                  </div>
                  {diyAnswer === 'non' && <Check className="h-4 w-4 text-blue-500 shrink-0" />}
                </div>
              </button>

              {/* Oui */}
              <div className={`${CHOICE_BASE} ${diyAnswer === 'oui' ? CHOICE_ON : CHOICE_OFF} cursor-pointer`}
                onClick={() => setDiyAnswer('oui')}>
                <div className="flex items-start gap-3 w-full">
                  <span className="text-lg shrink-0 mt-0.5">🔨</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-left mb-1">Oui — je prévois de faire certains travaux moi-même</p>
                    {diyAnswer === 'oui' && (
                      <textarea
                        value={diyDetail}
                        onChange={e => setDiyDetail(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        placeholder="Lesquels ? Ex : peinture des murs, plantations, montage de meubles…"
                        className="w-full text-sm border border-blue-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none mt-1"
                        rows={2}
                        autoFocus
                      />
                    )}
                  </div>
                  {diyAnswer === 'oui' && <Check className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />}
                </div>
              </div>

              {/* Je ne sais pas encore */}
              <button onClick={() => { setDiyAnswer('nsp'); setDiyDetail(''); }}
                className={`${CHOICE_BASE} ${diyAnswer === 'nsp' ? CHOICE_ON : CHOICE_OFF}`}>
                <div className="flex items-center gap-3 w-full">
                  <span className="text-lg shrink-0">🤔</span>
                  <p className="flex-1 font-semibold text-sm text-left">Je ne sais pas encore</p>
                  {diyAnswer === 'nsp' && <Check className="h-4 w-4 text-blue-500 shrink-0" />}
                </div>
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          {step < TOTAL_STEPS ? (
            <div className="flex items-center gap-3">
              {step > 1 && (
                <button onClick={() => setStep(s => s - 1)}
                  className="w-11 h-11 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors shrink-0">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <button onClick={safeNext} disabled={!canNext}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm transition-all ${
                  canNext ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}>
                {currentKey === 'confirm_elements' && answers.confirmedElements.length === 0
                  ? 'Sélectionnez au moins un élément'
                  : 'Continuer'}
                {canNext && <ChevronRight className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <ScoreBadge score={score} />
                <span className="text-xs text-gray-400">{score} / 5 informations renseignées</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(s => s - 1)}
                  className="w-11 h-11 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors shrink-0">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onValidate(refined.min || baseMin, refined.max || baseMax, refined.breakdown)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all">
                  <Check className="h-4 w-4" /> Valider mon estimation
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
