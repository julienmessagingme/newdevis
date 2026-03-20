import { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { ChantierGuideForm } from '@/types/chantier-ia';

interface ScreenPromptProps {
  onGenerate: (description: string, mode: 'libre' | 'guide', guidedForm?: ChantierGuideForm) => void;
  isLoading?: boolean;
}

export default function ScreenPrompt({ onGenerate, isLoading = false }: ScreenPromptProps) {
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    const text = description.trim();
    if (!text || isLoading) return;
    onGenerate(text, 'libre');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-[#080d1a] flex flex-col items-center justify-center px-4">
      {/* Back link */}
      <div className="absolute top-6 left-6">
        <a
          href="/mon-chantier"
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          Mes chantiers
        </a>
      </div>

      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-3">
            Créer mon chantier
          </h1>
          <p className="text-slate-400 text-lg">
            Estimez votre projet et organisez vos travaux simplement
          </p>
        </div>

        {/* Input block */}
        <div
          className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden transition-all duration-200 focus-within:border-blue-500/50 focus-within:shadow-[0_0_0_4px_rgba(59,130,246,0.08)]"
        >
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Décrivez votre projet (ex : piscine avec terrasse bois)"
            className="w-full bg-transparent text-white placeholder-slate-600 text-base resize-none px-5 pt-5 pb-3 outline-none min-h-[110px] leading-relaxed"
            maxLength={500}
            autoFocus
          />
          <div className="flex items-center justify-between px-5 pb-4 pt-1">
            <span className="text-xs text-slate-700 select-none">{description.length}/500</span>
            <button
              onClick={handleSubmit}
              disabled={!description.trim() || isLoading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-all duration-150"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLoading ? 'Analyse en cours…' : 'Créer mon chantier'}
            </button>
          </div>
        </div>

        {/* Exemple */}
        <p className="text-center text-slate-600 text-sm mt-5">
          Ex : Piscine + terrasse bois{' '}
          <span className="text-slate-500">→ ~28 000€</span>
        </p>
      </div>
    </div>
  );
}
