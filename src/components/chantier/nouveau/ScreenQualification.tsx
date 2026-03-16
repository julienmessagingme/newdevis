import { useState } from 'react';
import { Wand2, ArrowRight, Check, ChevronLeft, MessageSquareDashed } from 'lucide-react';
import type { FollowUpQuestion } from '@/types/chantier-ia';

interface ScreenQualificationProps {
  questions: FollowUpQuestion[];
  description: string;
  onSubmit: (answers: Record<string, string>) => void;
  onBack: () => void;
}

interface QuestionCardProps {
  question: FollowUpQuestion;
  index: number;
  answer: string;
  onChange: (id: string, value: string) => void;
}

function QuestionCard({ question, index, answer, onChange }: QuestionCardProps) {
  const [customText, setCustomText] = useState('');
  const isAnswered = !!answer?.trim();
  const choiceSelected = (question.choices ?? []).includes(answer);

  const handleChoiceClick = (choice: string) => {
    setCustomText('');
    onChange(question.id, choice);
  };

  const handleTextChange = (val: string) => {
    setCustomText(val);
    onChange(question.id, val);
  };

  return (
    <div
      className={`rounded-2xl p-5 border transition-all duration-300 ${
        isAnswered
          ? 'border-blue-500/30 bg-blue-500/[0.06]'
          : 'border-white/[0.08] bg-white/[0.03]'
      }`}
      style={{ animation: `ia-fade-up 0.4s ease-out ${index * 0.08}s both` }}
    >
      {/* Question header */}
      <div className="flex items-start gap-3 mb-4">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold transition-all ${
            isAnswered
              ? 'bg-blue-500/30 border border-blue-400/40 text-blue-200'
              : 'bg-white/8 border border-white/10 text-slate-500'
          }`}
        >
          {isAnswered ? <Check className="h-3 w-3" /> : index + 1}
        </div>
        <h3 className="text-white font-medium text-sm leading-snug">{question.label}</h3>
      </div>

      {/* text type */}
      {question.type === 'text' && (
        <input
          type="text"
          placeholder={question.placeholder ?? ''}
          value={answer ?? ''}
          onChange={(e) => onChange(question.id, e.target.value)}
          className="w-full bg-white/[0.05] border border-white/[0.1] focus:border-blue-500/50 rounded-xl px-4 py-3 text-white placeholder-slate-600 text-sm outline-none transition-colors"
        />
      )}

      {/* single_choice type */}
      {question.type === 'single_choice' && (
        <div className="flex flex-wrap gap-2">
          {(question.choices ?? []).map((choice) => (
            <button
              key={choice}
              onClick={() => handleChoiceClick(choice)}
              className={`px-3.5 py-2 rounded-xl text-xs border transition-all ${
                answer === choice
                  ? 'border-blue-500 bg-blue-500/20 text-blue-200'
                  : choice === 'Je ne sais pas encore'
                  ? 'border-white/[0.06] bg-white/[0.02] text-slate-500 hover:border-white/10 hover:text-slate-400'
                  : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:border-white/12 hover:text-white'
              }`}
            >
              {choice}
            </button>
          ))}
        </div>
      )}

      {/* text_or_choice type */}
      {question.type === 'text_or_choice' && (
        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            {(question.choices ?? []).map((choice) => (
              <button
                key={choice}
                onClick={() => handleChoiceClick(choice)}
                className={`px-3.5 py-2 rounded-xl text-xs border transition-all ${
                  answer === choice && !customText
                    ? 'border-blue-500 bg-blue-500/20 text-blue-200'
                    : choice === 'Je ne sais pas encore'
                    ? 'border-white/[0.06] bg-white/[0.02] text-slate-500 hover:border-white/10 hover:text-slate-400'
                    : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:border-white/12 hover:text-white'
                }`}
              >
                {choice}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder={question.placeholder ?? 'Ou précisez votre réponse…'}
            value={customText}
            onChange={(e) => handleTextChange(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-blue-500/40 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 text-xs outline-none transition-colors"
          />
        </div>
      )}
    </div>
  );
}

// Questions fixes ajoutées systématiquement en fin de qualification
const FIXED_QUESTIONS: FollowUpQuestion[] = [
  {
    id: '_finition',
    label: 'Quel niveau de finition souhaitez-vous ?',
    type: 'single_choice',
    choices: ['Économique', 'Standard', 'Haut de gamme', 'Je ne sais pas'],
    required: true,
    reason: 'Impacte le budget et le choix des matériaux',
  },
  {
    id: '_auto_travaux',
    label: 'Souhaitez-vous réaliser une partie des travaux vous-même ?',
    type: 'single_choice',
    choices: ['Non', 'Peut-être', 'Oui'],
    required: true,
    reason: 'Permet d\'adapter les recommandations',
  },
];

export default function ScreenQualification({
  questions,
  description,
  onSubmit,
  onBack,
}: ScreenQualificationProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const handleChange = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  // Merge questions API + questions fixes (sans doublons)
  const allQuestions = [
    ...questions,
    ...FIXED_QUESTIONS.filter((fq) => !questions.some((q) => q.id === fq.id)),
  ];

  const requiredCount = allQuestions.filter((q) => q.required).length;
  const answeredCount = allQuestions.filter((q) => q.required && !!answers[q.id]?.trim()).length;
  const allAnswered = answeredCount === requiredCount;

  const handleSubmit = () => {
    if (allAnswered) onSubmit(answers);
  };

  // Truncate description for display
  const descriptionPreview = description.length > 80
    ? description.slice(0, 80) + '…'
    : description;

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col px-4 py-10">
      {/* Header */}
      <div className="max-w-2xl mx-auto w-full text-center mb-8" style={{ animation: 'ia-fade-up 0.4s ease-out both' }}>
        <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-indigo-300 text-sm font-medium mb-4">
          <MessageSquareDashed className="h-3.5 w-3.5" />
          Personnalisation de votre plan
        </div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-white mb-2">
          Affinons votre projet
        </h1>
        <p className="text-slate-500 text-sm max-w-md mx-auto">
          Quelques précisions pour créer un plan vraiment sur mesure
        </p>

        {/* Description preview */}
        {description && (
          <div className="mt-4 inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-2 text-xs text-slate-500 max-w-sm">
            <span className="shrink-0">💬</span>
            <span className="truncate">{descriptionPreview}</span>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="max-w-2xl mx-auto w-full mb-6" style={{ animation: 'ia-fade-up 0.4s ease-out 0.05s both' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500">{answeredCount}/{requiredCount} questions répondues</span>
          {allAnswered && (
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
              <Check className="h-3 w-3" /> Tout est prêt !
            </span>
          )}
        </div>
        <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
            style={{ width: `${requiredCount > 0 ? (answeredCount / requiredCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Questions */}
      <div className="max-w-2xl mx-auto w-full space-y-3 pb-32">
        {allQuestions.map((q, idx) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={idx}
            answer={answers[q.id] ?? ''}
            onChange={handleChange}
          />
        ))}
      </div>

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 pointer-events-none">
        <div className="bg-gradient-to-t from-[#0a0f1e] via-[#0a0f1e]/95 to-transparent pt-8 pb-6 px-4 pointer-events-auto">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={handleSubmit}
              disabled={!allAnswered}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-35 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3.5 text-sm transition-all"
            >
              <Wand2 className="h-4 w-4" />
              Générer mon plan
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={onBack}
              className="w-full flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-300 text-xs mt-3 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Modifier ma description
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
