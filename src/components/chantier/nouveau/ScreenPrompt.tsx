import { useState } from 'react';
import { ArrowLeft, Loader2, ArrowRight } from 'lucide-react';
import type { ChantierGuideForm } from '@/types/chantier-ia';

// ── Exemples cliquables ───────────────────────────────────────────────────────

const EXAMPLES = [
  'Piscine + terrasse bois + pergola',
  'Rénovation complète maison 120m²',
  'Extension avec baie vitrée',
];

// ── Hero image ────────────────────────────────────────────────────────────────

const HERO_URL =
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1920&q=80';

// ── Props ─────────────────────────────────────────────────────────────────────

interface ScreenPromptProps {
  onGenerate: (description: string, mode: 'libre' | 'guide', guidedForm?: ChantierGuideForm) => void;
  isLoading?: boolean;
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function ScreenPrompt({ onGenerate, isLoading = false }: ScreenPromptProps) {
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    const text = description.trim();
    if (!text || isLoading) return;
    onGenerate(text, 'libre');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter seul = soumettre · Shift+Enter = nouvelle ligne
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSubmit = description.trim().length > 0 && !isLoading;

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden">

      {/* ── Background hero ──────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url('${HERO_URL}')`,
          animation: 'zoom-slow 24s ease-in-out infinite alternate',
        }}
      />
      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.65) 100%)',
          backdropFilter: 'blur(0.5px)',
        }}
      />

      {/* ── Lien retour ──────────────────────────────────────────────────── */}
      <div className="absolute top-6 left-6 z-10">
        <a
          href="/mon-chantier"
          className="inline-flex items-center gap-1.5 text-white/45 hover:text-white/90 text-sm transition-all duration-200 group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          Mes chantiers
        </a>
      </div>

      {/* ── Contenu central ──────────────────────────────────────────────── */}
      <div
        className="relative z-10 w-full max-w-2xl"
        style={{ animation: 'fade-up 0.65s cubic-bezier(0.22,1,0.36,1) both' }}
      >

        {/* ── Titre ─────────────────────────────────────────────────────── */}
        <div className="text-center mb-10">
          <h1 className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight leading-[1.06] mb-5">
            Pilotez votre projet<br />comme un pro
          </h1>
          <p className="text-white/60 text-lg max-w-lg mx-auto leading-relaxed">
            Transformez votre projet en un chantier maîtrisé,
            <br className="hidden sm:block" /> du premier devis à la réception
          </p>
        </div>

        {/* ── Input glassmorphism ───────────────────────────────────────── */}
        <div
          className="rounded-2xl overflow-hidden transition-all duration-300"
          style={{
            background: 'rgba(255, 255, 255, 0.07)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            boxShadow: '0 10px 50px rgba(0, 0, 0, 0.35), 0 0 0 0 rgba(59,130,246,0)',
          }}
          onFocus={() => {/* déclaratif via CSS */}}
        >
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Décrivez votre projet (ex : piscine avec terrasse bois et pergola)"
            className="w-full bg-transparent text-white placeholder-white/28 text-base sm:text-lg resize-none px-6 pt-6 pb-3 outline-none min-h-[130px] leading-relaxed"
            style={{ caretColor: 'rgba(255,255,255,0.8)' }}
            maxLength={500}
            autoFocus
          />
          <div className="flex items-center justify-between px-6 pb-5 pt-1 gap-3">
            <span className="text-xs text-white/22 select-none tabular-nums">
              {description.length}/500
              {description.length > 0 && (
                <span className="text-white/15 ml-1.5">· Entrée pour valider</span>
              )}
            </span>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="shrink-0 flex items-center gap-2 font-semibold rounded-xl px-6 py-3 text-sm transition-all duration-200"
              style={{
                background: canSubmit
                  ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                  : 'rgba(255,255,255,0.1)',
                color: canSubmit ? '#fff' : 'rgba(255,255,255,0.3)',
                boxShadow: canSubmit ? '0 4px 20px rgba(37,99,235,0.45)' : 'none',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                transform: 'scale(1)',
              }}
              onMouseEnter={e => {
                if (canSubmit) (e.currentTarget as HTMLElement).style.transform = 'scale(1.02)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
              }}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              {isLoading ? 'Analyse en cours…' : 'Créer mon chantier'}
            </button>
          </div>
        </div>

        {/* ── Exemples cliquables ───────────────────────────────────────── */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="text-white/30 text-xs font-medium">Exemples :</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setDescription(ex)}
              className="text-xs text-white/55 hover:text-white/90 border rounded-full px-4 py-1.5 transition-all duration-150"
              style={{
                background: 'rgba(255,255,255,0.05)',
                borderColor: 'rgba(255,255,255,0.12)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.22)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)';
              }}
            >
              {ex}
            </button>
          ))}
        </div>

        {/* ── Crédibilité ──────────────────────────────────────────────── */}
        <p className="text-center text-white/25 text-xs mt-8 tracking-wide">
          +2 000 projets analysés · basé sur des milliers de devis réels
        </p>
      </div>

      {/* ── Animations CSS ───────────────────────────────────────────────── */}
      <style>{`
        @keyframes zoom-slow {
          from { transform: scale(1); }
          to   { transform: scale(1.10); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
