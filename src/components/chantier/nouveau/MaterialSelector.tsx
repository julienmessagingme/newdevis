import { useState } from 'react';
import type { MaterialOption, MaterialAIResult } from '@/hooks/useMaterialAI';

// ── Props ─────────────────────────────────────────────────────────────────────

interface MaterialSelectorProps {
  result: MaterialAIResult;
  baseBudget: number;
  /** Appelée quand l'utilisateur confirme son choix — aucun appel API interne */
  onConfirm?: (selected: MaterialOption, surface: number) => void;
}

// ── Constantes visuelles ──────────────────────────────────────────────────────

const TIER_TAG: Record<string, { label: string; bg: string; text: string }> = {
  'économique':    { label: 'Économique',    bg: 'bg-emerald-500/20', text: 'text-emerald-300' },
  'intermédiaire': { label: 'Intermédiaire', bg: 'bg-blue-500/20',    text: 'text-blue-300'   },
  'premium':       { label: 'Premium',       bg: 'bg-violet-500/20',  text: 'text-violet-300' },
};

const TIER_GRADIENT: Record<string, string> = {
  'économique':    'linear-gradient(160deg,#064e3b,#065f46)',
  'intermédiaire': 'linear-gradient(160deg,#1e3a5f,#1d4ed8)',
  'premium':       'linear-gradient(160deg,#3b0764,#4c1d95)',
};

// ── Composant ─────────────────────────────────────────────────────────────────

export default function MaterialSelector({
  result,
  baseBudget,
  onConfirm,
}: MaterialSelectorProps) {
  const [selectedId,  setSelectedId]  = useState<string>(result.materiaux[0]?.id ?? '');
  const [surface,     setSurface]     = useState<number>(10);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [confirmed,   setConfirmed]   = useState(false);

  const selectedMat = result.materiaux.find((m) => m.id === selectedId) ?? result.materiaux[0];

  const impactMin = selectedMat ? Math.round(selectedMat.priceMin * surface) : 0;
  const impactMax = selectedMat ? Math.round(selectedMat.priceMax * surface) : 0;

  const handleConfirm = () => {
    if (!selectedMat) return;
    setConfirmed(true);
    onConfirm?.(selectedMat, surface);
  };

  // ── État confirmé ──────────────────────────────────────────────────────────
  if (confirmed && selectedMat) {
    return (
      <div className="mt-3 bg-emerald-500/[0.08] border border-emerald-500/25 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
          <span className="text-emerald-400 font-bold text-base">✓</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold">
            Matériau confirmé : <span className="text-emerald-300">{selectedMat.name}</span>
          </p>
          <p className="text-slate-400 text-xs mt-0.5">
            {surface}&nbsp;{selectedMat.unit} ·{' '}
            {impactMin.toLocaleString('fr-FR')}–{impactMax.toLocaleString('fr-FR')}&nbsp;€ estimé
          </p>
        </div>
      </div>
    );
  }

  // ── Rendu principal ────────────────────────────────────────────────────────
  return (
    <div className="mt-3 space-y-3">

      {/* Grille 3 cartes photo-réalistes */}
      <div className="grid grid-cols-3 gap-2">
        {result.materiaux.map((mat) => {
          const isSelected = mat.id === selectedId;
          const hasError   = imageErrors.has(mat.id);
          const tag        = TIER_TAG[mat.tier] ?? TIER_TAG['intermédiaire'];
          const fallback   = TIER_GRADIENT[mat.tier] ?? TIER_GRADIENT['intermédiaire'];

          return (
            <button
              key={mat.id}
              onClick={() => setSelectedId(mat.id)}
              className={`flex flex-col rounded-xl overflow-hidden text-left transition-all duration-200 outline-none ${
                isSelected
                  ? 'ring-2 ring-violet-500 scale-[1.03] shadow-lg shadow-violet-900/40'
                  : 'ring-1 ring-white/[0.08] hover:ring-white/20 hover:scale-[1.01]'
              }`}
            >
              {/* Photo */}
              <div className="relative h-[90px] overflow-hidden shrink-0">
                {!hasError ? (
                  <img
                    src={`https://source.unsplash.com/featured/?${encodeURIComponent(mat.imageQuery)},material&sig=${mat.id}`}
                    alt={mat.name}
                    className="w-full h-full object-cover"
                    onError={() => setImageErrors((prev) => new Set([...prev, mat.id]))}
                  />
                ) : (
                  <div className="w-full h-full" style={{ background: fallback }} />
                )}
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                {/* Nom en overlay bas */}
                <p className="absolute bottom-1.5 left-2 right-2 text-white font-bold text-[11px] leading-tight truncate drop-shadow">
                  {mat.name}
                </p>

                {/* Check si sélectionné */}
                {isSelected && (
                  <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-violet-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold">✓</span>
                  </div>
                )}
              </div>

              {/* Prix + tag */}
              <div className="bg-[#0a0f1e] px-2 py-1.5 flex-1">
                <p className="text-white font-black text-sm tabular-nums leading-tight">
                  {mat.priceMin}–{mat.priceMax}
                  <span className="text-slate-500 font-normal text-[9px] ml-0.5">€/{mat.unit}</span>
                </p>
                <span className={`inline-block text-[8px] font-semibold mt-1 px-1.5 py-0.5 rounded-full ${tag.bg} ${tag.text}`}>
                  {mat.tags[0] ?? tag.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Impact budget si sélectionné */}
      {selectedMat && surface > 0 && (
        <div className="text-center">
          <span className="text-emerald-400 font-black text-sm tabular-nums">
            {impactMin.toLocaleString('fr-FR')} €
          </span>
          <span className="text-slate-500 text-[10px] mx-1">pour</span>
          <span className="text-white font-semibold text-xs tabular-nums">{surface} {selectedMat.unit}</span>
          <span className="text-slate-500 text-[10px] mx-1">de</span>
          <span className="text-amber-300 text-xs font-medium">{selectedMat.name}</span>
        </div>
      )}

      {/* Slider surface */}
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-[11px] shrink-0">Surface&nbsp;{selectedMat?.unit ?? 'm²'}</span>
        <input
          type="range" min={1} max={200} step={1} value={surface}
          onChange={(e) => setSurface(Number(e.target.value))}
          className="flex-1 cursor-pointer"
          style={{ accentColor: '#7c3aed' }}
        />
        <span className="text-white font-bold text-xs tabular-nums shrink-0 w-16 text-right">
          › {surface}&nbsp;{selectedMat?.unit ?? 'm²'}
        </span>
      </div>

      {/* Bouton confirmation */}
      <button
        onClick={handleConfirm}
        disabled={!selectedMat}
        className="w-full flex items-center justify-center gap-2 bg-white/[0.08] hover:bg-white/[0.13] border border-white/[0.15] hover:border-violet-500/50 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl py-2.5 transition-all duration-200"
      >
        Confirmer {result.travaux_type.toLowerCase()} choisi{result.travaux_type.toLowerCase().endsWith('e') ? 'e' : ''}
      </button>

    </div>
  );
}
