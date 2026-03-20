import { useState } from 'react';
import { ArrowLeft, Loader2, ArrowRight } from 'lucide-react';
import type { ChantierGuideForm } from '@/types/chantier-ia';

// ── Exemples cliquables ───────────────────────────────────────────────────────

const EXAMPLES = [
  'Piscine + terrasse bois + pergola',
  'Rénovation complète maison 120m²',
  'Extension avec baie vitrée',
];

// ── Ambiance selon l'heure ────────────────────────────────────────────────────

type TimeSlot = 'morning' | 'day' | 'sunset' | 'night';

function getTimeSlot(): TimeSlot {
  const h = new Date().getHours();
  if (h >= 6  && h < 10) return 'morning';
  if (h >= 10 && h < 17) return 'day';
  if (h >= 17 && h < 21) return 'sunset';
  return 'night';
}

interface TimeConfig {
  imgFilter : string;
  overlay   : string;
  glow?     : string; // radial gradient en surimpression
}

const TIME_CONFIG: Record<TimeSlot, TimeConfig> = {
  // Matin : lumière fraîche, légèrement bleutée
  morning: {
    imgFilter: 'brightness(1.05) saturate(1.15)',
    overlay: 'linear-gradient(180deg, rgba(5,10,30,0.44) 0%, rgba(5,10,25,0.40) 60%, rgba(0,5,20,0.54) 100%)',
  },

  // Journée : naturel, soleil zénithal
  day: {
    imgFilter: 'brightness(1.0) saturate(1.05)',
    overlay: 'linear-gradient(180deg, rgba(0,0,0,0.44) 0%, rgba(0,0,0,0.40) 60%, rgba(0,0,0,0.54) 100%)',
  },

  // Coucher de soleil : teinte chaude orangée + halo solaire en bas
  sunset: {
    imgFilter: 'brightness(0.88) sepia(0.30) saturate(1.8) hue-rotate(-8deg)',
    overlay: 'linear-gradient(180deg, rgba(50,15,0,0.52) 0%, rgba(70,25,0,0.44) 50%, rgba(25,8,0,0.60) 100%)',
    glow: 'radial-gradient(ellipse 90% 50% at 50% 110%, rgba(255,120,30,0.30) 0%, rgba(255,80,10,0.14) 50%, transparent 72%)',
  },

  // Nuit : très sombre + halo chaud simulant les lumières de la maison
  night: {
    imgFilter: 'brightness(0.28) saturate(0.60)',
    overlay: 'linear-gradient(180deg, rgba(0,2,20,0.58) 0%, rgba(0,2,18,0.50) 55%, rgba(0,1,12,0.60) 100%)',
    glow: [
      'radial-gradient(ellipse 75% 55% at 48% 88%, rgba(255,190,70,0.32) 0%, rgba(255,150,40,0.18) 38%, rgba(255,110,20,0.07) 62%, transparent 78%)',
      'radial-gradient(ellipse 40% 25% at 68% 78%, rgba(255,220,120,0.16) 0%, transparent 65%)',
    ].join(', '),
  },
};

const HERO_URL = 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1920&q=80';

// ── Props ─────────────────────────────────────────────────────────────────────

interface ScreenPromptProps {
  onGenerate: (description: string, mode: 'libre' | 'guide', guidedForm?: ChantierGuideForm) => void;
  isLoading?: boolean;
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function ScreenPrompt({ onGenerate, isLoading = false }: ScreenPromptProps) {
  const [description, setDescription] = useState('');

  // Calculé une fois au rendu — l'heure ne change pas pendant la session
  const slot   = getTimeSlot();
  const config = TIME_CONFIG[slot];

  const handleSubmit = () => {
    const text = description.trim();
    if (!text || isLoading) return;
    onGenerate(text, 'libre');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSubmit = description.trim().length > 0 && !isLoading;

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden">

      {/* ── Image de fond ────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url('${HERO_URL}')`,
          filter: config.imgFilter,
          animation: 'zoom-slow 24s ease-in-out infinite alternate',
        }}
      />

      {/* ── Overlay principal ─────────────────────────────────────────────── */}
      <div className="absolute inset-0" style={{ background: config.overlay }} />

      {/* ── Halo lumineux (coucher de soleil / nuit) ──────────────────────── */}
      {config.glow && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: config.glow }} />
      )}

      {/* ── Lien retour ──────────────────────────────────────────────────── */}
      <div className="absolute top-6 left-6 z-10">
        <a
          href="/mon-chantier"
          className="inline-flex items-center gap-1.5 text-white/60 hover:text-white text-sm transition-all duration-200 group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          Mes chantiers
        </a>
      </div>

      {/* ── Indicateur heure (discret, coin sup droit) ────────────────────── */}
      <div className="absolute top-6 right-6 z-10">
        <span className="text-white/25 text-xs tabular-nums">
          {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* ── Contenu central ──────────────────────────────────────────────── */}
      <div
        className="relative z-10 w-full max-w-2xl"
        style={{ animation: 'fade-up 0.65s cubic-bezier(0.22,1,0.36,1) both' }}
      >

        {/* Titre */}
        <div className="text-center mb-10">
          <h1
            className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight leading-[1.06] mb-5"
            style={{ textShadow: '0 2px 20px rgba(0,0,0,0.55)' }}
          >
            Pilotez votre projet<br />comme un pro
          </h1>
          <p
            className="text-white text-lg max-w-lg mx-auto leading-relaxed inline-block px-4 py-2 rounded-xl"
            style={{
              textShadow: '0 1px 12px rgba(0,0,0,0.9), 0 2px 30px rgba(0,0,0,0.8)',
              background: 'rgba(0,0,0,0.22)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
          >
            Transformez votre projet en un chantier maîtrisé,
            <br className="hidden sm:block" /> du premier devis à la réception
          </p>
        </div>

        {/* ── Input glassmorphism ───────────────────────────────────────── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: slot === 'night'
              ? 'rgba(20, 15, 5, 0.55)'
              : slot === 'sunset'
              ? 'rgba(30, 12, 0, 0.40)'
              : 'rgba(255, 255, 255, 0.10)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: slot === 'night'
              ? '1px solid rgba(255,200,80,0.18)'
              : slot === 'sunset'
              ? '1px solid rgba(255,160,60,0.22)'
              : '1px solid rgba(255,255,255,0.22)',
            boxShadow: slot === 'night'
              ? '0 12px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,180,60,0.06)'
              : '0 10px 50px rgba(0,0,0,0.38)',
          }}
        >
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Décrivez votre projet (ex : piscine avec terrasse bois et pergola)"
            className="w-full bg-transparent text-white placeholder-white/45 text-base sm:text-lg resize-none px-6 pt-6 pb-3 outline-none min-h-[130px] leading-relaxed"
            style={{ caretColor: 'rgba(255,255,255,0.85)' }}
            maxLength={500}
            autoFocus
          />
          <div className="flex items-center justify-between px-6 pb-5 pt-1 gap-3">
            <span className="text-xs text-white/40 select-none tabular-nums">
              {description.length}/500
              {description.length > 0 && (
                <span className="text-white/28 ml-1.5">· Entrée pour valider</span>
              )}
            </span>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="shrink-0 flex items-center gap-2 font-semibold rounded-xl px-6 py-3 text-sm transition-all duration-200"
              style={{
                background: canSubmit
                  ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                  : 'rgba(255,255,255,0.10)',
                color: canSubmit ? '#fff' : 'rgba(255,255,255,0.30)',
                boxShadow: canSubmit ? '0 4px 20px rgba(37,99,235,0.50)' : 'none',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
              }}
              onMouseEnter={e => {
                if (canSubmit) (e.currentTarget as HTMLElement).style.transform = 'scale(1.02)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
              }}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {isLoading ? 'Analyse en cours…' : 'Créer mon chantier'}
            </button>
          </div>
        </div>

        {/* ── Exemples cliquables ───────────────────────────────────────── */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="text-white/55 text-xs font-medium">Exemples :</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setDescription(ex)}
              className="text-xs text-white/75 hover:text-white border rounded-full px-4 py-1.5 transition-all duration-150"
              style={{
                background: 'rgba(255,255,255,0.06)',
                borderColor: 'rgba(255,255,255,0.14)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.24)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)';
              }}
            >
              {ex}
            </button>
          ))}
        </div>

        {/* ── Crédibilité ──────────────────────────────────────────────── */}
        <p className="text-center text-white/45 text-xs mt-8 tracking-wide">
          +2 000 projets analysés · basé sur des milliers de devis réels
        </p>
      </div>

      {/* ── Keyframes ────────────────────────────────────────────────────── */}
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
