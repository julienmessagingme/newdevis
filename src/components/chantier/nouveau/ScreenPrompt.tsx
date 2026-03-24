import { useState, useMemo } from 'react';
import { ArrowLeft, Loader2, ArrowRight, Plus, Check } from 'lucide-react';
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
  glow?     : string;
}

const TIME_CONFIG: Record<TimeSlot, TimeConfig> = {
  morning: {
    imgFilter: 'brightness(1.05) saturate(1.15)',
    overlay: 'linear-gradient(180deg, rgba(5,10,30,0.44) 0%, rgba(5,10,25,0.40) 60%, rgba(0,5,20,0.54) 100%)',
  },
  day: {
    imgFilter: 'brightness(1.0) saturate(1.05)',
    overlay: 'linear-gradient(180deg, rgba(0,0,0,0.44) 0%, rgba(0,0,0,0.40) 60%, rgba(0,0,0,0.54) 100%)',
  },
  sunset: {
    imgFilter: 'brightness(0.88) sepia(0.30) saturate(1.8) hue-rotate(-8deg)',
    overlay: 'linear-gradient(180deg, rgba(50,15,0,0.52) 0%, rgba(70,25,0,0.44) 50%, rgba(25,8,0,0.60) 100%)',
    glow: 'radial-gradient(ellipse 90% 50% at 50% 110%, rgba(255,120,30,0.30) 0%, rgba(255,80,10,0.14) 50%, transparent 72%)',
  },
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

// ── Suggestions contextuelles ─────────────────────────────────────────────────

interface SuggestionRule {
  id: string;
  label: string;
  appendText: string;
  absent: (d: string) => boolean;
}

const SUGGESTION_RULES: SuggestionRule[] = [
  {
    id: 'surface',
    label: '📐 Surface (m²)',
    appendText: ', sur environ ___ m²',
    absent: (d) => !/\d+\s*m[²2]/i.test(d),
  },
  {
    id: 'location',
    label: '📍 Localisation',
    appendText: ', à ___',
    absent: (d) => !/\b\d{5}\b|paris|lyon|marseille|bordeaux|lille|nantes|toulouse|rennes|strasbourg|nice|montpellier/i.test(d),
  },
  {
    id: 'budget',
    label: '💶 Budget',
    appendText: ', budget environ ___',
    absent: (d) => !/budget|€|euro|k€/i.test(d),
  },
  {
    id: 'timing',
    label: '📅 Délai souhaité',
    appendText: ', pour ___',
    absent: (d) => !/\b(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|\d{4}|mois|semaine|urgent)/i.test(d),
  },
  {
    id: 'materials',
    label: '🧱 Matériaux',
    appendText: ', en ___',
    absent: (d) => !/\b(bois|pierre|béton|métal|aluminium|pvc|brique|parquet|carrelage|inox|verre)\b/i.test(d),
  },
  {
    id: 'logement',
    label: '🏠 Type de logement',
    appendText: ', pour une ___',
    absent: (d) => !/\b(maison|appartement|villa|studio|bureau|local|entrepôt|résidence)\b/i.test(d),
  },
];

function getRelevantSuggestions(description: string): SuggestionRule[] {
  // Affiche les suggestions pertinentes (infos absentes de la description)
  // Maximum 5 suggestions
  return SUGGESTION_RULES.filter((r) => r.absent(description)).slice(0, 5);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ScreenPromptProps {
  onGenerate: (description: string, mode: 'libre' | 'guide', guidedForm?: ChantierGuideForm) => void;
  isLoading?: boolean;
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function ScreenPrompt({ onGenerate, isLoading = false }: ScreenPromptProps) {
  const [description, setDescription]           = useState('');
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());

  const slot   = getTimeSlot();
  const config = TIME_CONFIG[slot];

  // Suggestions recalculées à chaque changement de description
  const suggestions = useMemo(() => getRelevantSuggestions(description), [description]);

  // Nettoie les suggestions sélectionnées qui ne sont plus pertinentes
  const cleanedSelected = useMemo(
    () => new Set([...selectedSuggestions].filter((id) => suggestions.some((s) => s.id === id))),
    [suggestions, selectedSuggestions],
  );

  const toggleSuggestion = (id: string) => {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applySuggestions = () => {
    if (cleanedSelected.size === 0) return;
    const toAppend = suggestions
      .filter((s) => cleanedSelected.has(s.id))
      .map((s) => s.appendText)
      .join('');
    // Ajout à la fin du texte utilisateur — la textarea reste sous contrôle total
    setDescription((prev) => prev.trimEnd() + toAppend);
    setSelectedSuggestions(new Set());
  };

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
    <div className="min-h-screen relative flex flex-col pb-[env(safe-area-inset-bottom,16px)] overflow-hidden">

      {/* ── Image de fond ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0 z-0">
        <img
          src={HERO_URL}
          alt=""
          className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
          style={{ filter: config.imgFilter }}
          fetchpriority="high"
        />
        {/* Overlay principal */}
        <div className="absolute inset-0" style={{ background: config.overlay }} />
        {/* Glow optionnel (sunset / night) */}
        {config.glow && (
          <div className="absolute inset-0" style={{ background: config.glow }} />
        )}
      </div>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-4">
        <a href="/mon-chantier"
          className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors group">
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          Mes chantiers
        </a>
      </div>

      {/* ── Contenu central ──────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-2xl" style={{ animation: 'fade-up 0.55s cubic-bezier(0.22,1,0.36,1) both' }}>

          {/* Badge */}
          <div className="flex justify-center mb-6">
            <span className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white text-xs font-semibold px-3.5 py-1.5 rounded-full backdrop-blur-sm">
              🏗️ Créer un nouveau chantier
            </span>
          </div>

          {/* Titre */}
          <div className="text-center mb-8 sm:mb-10">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight mb-4 drop-shadow-sm">
              Pilotez votre projet<br className="hidden sm:block" /> comme un pro
            </h1>
            <p className="text-white/75 text-base sm:text-lg max-w-lg mx-auto leading-relaxed">
              Décrivez votre projet en quelques mots — nous générons votre plan de chantier complet en 15 secondes.
            </p>
          </div>

          {/* Input card */}
          <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-white/30 shadow-xl overflow-hidden">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Décrivez votre projet (ex : rénovation complète maison 120m², piscine avec terrasse bois et pergola…)"
              className="w-full text-gray-900 placeholder-gray-400 text-base sm:text-lg resize-none px-5 sm:px-6 pt-5 sm:pt-6 pb-3 outline-none min-h-[110px] sm:min-h-[130px] leading-relaxed bg-transparent"
              maxLength={500}
            />
            <div className="flex items-center justify-between px-5 sm:px-6 pb-4 sm:pb-5 pt-2 gap-3 border-t border-gray-100">
              <span className="text-xs text-gray-400 tabular-nums select-none">
                {description.length}/500
                {description.length > 0 && (
                  <span className="text-gray-300 ml-1.5 hidden sm:inline">· Entrée pour valider</span>
                )}
              </span>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="shrink-0 flex items-center gap-2 font-semibold rounded-xl px-5 sm:px-6 py-2.5 text-sm transition-all bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-white shadow-sm hover:shadow-md"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {isLoading ? 'Analyse en cours…' : 'Créer mon chantier'}
              </button>
            </div>
          </div>

          {/* ── Suggestions IA ─────────────────────────────────────────── */}
          {description.trim().length > 10 && suggestions.length > 0 && (
            <div className="mt-4 bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl px-4 sm:px-5 py-4">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-3">
                Suggestions pour préciser votre projet
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {suggestions.map((s) => {
                  const selected = cleanedSelected.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSuggestion(s.id)}
                      className={[
                        'inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5 border transition-all',
                        selected
                          ? 'bg-white text-gray-900 border-white shadow-sm'
                          : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20 hover:text-white',
                      ].join(' ')}
                    >
                      {selected && <Check className="h-3 w-3 shrink-0" />}
                      {s.label}
                    </button>
                  );
                })}
              </div>
              {cleanedSelected.size > 0 && (
                <button
                  type="button"
                  onClick={applySuggestions}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-300 hover:text-blue-200 border border-blue-400/40 hover:border-blue-300/60 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg px-3 py-1.5 transition-all"
                >
                  <Plus className="h-3 w-3" />
                  Appliquer ({cleanedSelected.size})
                </button>
              )}
            </div>
          )}

          {/* Exemples */}
          <div className="mt-4 sm:mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="text-white/50 text-xs font-medium">Exemples :</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setDescription(ex)}
                className="text-xs text-white/80 hover:text-white border border-white/20 hover:border-white/40 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full px-3 sm:px-4 py-1.5 transition-all"
              >
                {ex}
              </button>
            ))}
          </div>

          {/* Crédibilité */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-white/50">
            <span>✅ Analyse gratuite</span>
            <span>⚡ Résultats en 15s</span>
            <span>📊 Basé sur des milliers de devis réels</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
