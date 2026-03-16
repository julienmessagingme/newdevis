import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { MaterialOption, MaterialAIResult } from '@/hooks/useMaterialAI';

// ── Props ─────────────────────────────────────────────────────────────────────

interface MaterialSelectorProps {
  result: MaterialAIResult;
  baseBudget: number;
  /** Appelée quand l'utilisateur confirme son choix — aucun appel API interne */
  onConfirm?: (selected: MaterialOption, surface: number) => void;
}

// ── Constantes visuelles ──────────────────────────────────────────────────────

const TIER_BADGE: Record<string, { label: string; classes: string }> = {
  'économique':    { label: 'Économique',    classes: 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300' },
  'intermédiaire': { label: 'Intermédiaire', classes: 'bg-amber-500/20  border border-amber-500/30  text-amber-300'   },
  'premium':       { label: 'Premium',       classes: 'bg-violet-500/20 border border-violet-500/30 text-violet-300' },
};

/** Couleur de glow (boxShadow) par tier */
const TIER_GLOW: Record<string, string> = {
  'économique':    '#34d39933',
  'intermédiaire': '#fbbf2433',
  'premium':       '#a78bfa33',
};

/** Gradient de fallback quand l'image Unsplash ne charge pas */
const TIER_GRADIENT: Record<string, string> = {
  'économique':    'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
  'intermédiaire': 'linear-gradient(135deg, #78350f 0%, #92400e 100%)',
  'premium':       'linear-gradient(135deg, #3b0764 0%, #4c1d95 100%)',
};

// ── Composant ─────────────────────────────────────────────────────────────────

export default function MaterialSelector({
  result,
  baseBudget,
  onConfirm,
}: MaterialSelectorProps) {
  const [selectedId,   setSelectedId]   = useState<string>(result.materiaux[0]?.id ?? '');
  const [surface,      setSurface]      = useState<number>(20);
  const [imageErrors,  setImageErrors]  = useState<Set<string>>(new Set());
  const [confirmed,    setConfirmed]    = useState(false);
  const [confirmedMat, setConfirmedMat] = useState<MaterialOption | null>(null);

  const selectedMat = result.materiaux.find((m) => m.id === selectedId) ?? result.materiaux[0];

  // Calcul impact budgétaire
  const impactMin = selectedMat ? selectedMat.priceMin * surface : 0;
  const impactMax = selectedMat ? selectedMat.priceMax * surface : 0;

  // Couleur de l'impact selon proportion du budget total
  const impactRatio = baseBudget > 0 ? impactMax / baseBudget : 0;
  const impactColor =
    impactRatio < 0.15 ? 'text-emerald-400' :
    impactRatio < 0.35 ? 'text-amber-400'   :
                         'text-rose-400';

  const handleConfirm = () => {
    if (!selectedMat) return;
    setConfirmedMat(selectedMat);
    setConfirmed(true);
    onConfirm?.(selectedMat, surface);
  };

  // ── État confirmé ──────────────────────────────────────────────────────────
  if (confirmed && confirmedMat) {
    return (
      <div className="mt-4 bg-emerald-500/[0.08] border border-emerald-500/25 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
          <Check className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold">
            Matériau confirmé : <span className="text-emerald-300">{confirmedMat.name}</span>
          </p>
          <p className="text-slate-400 text-xs mt-0.5">
            {surface}&nbsp;{confirmedMat.unit} ·{' '}
            {impactMin.toLocaleString('fr-FR')}–{impactMax.toLocaleString('fr-FR')}&nbsp;€ estimé
          </p>
        </div>
      </div>
    );
  }

  // ── Rendu principal ────────────────────────────────────────────────────────
  return (
    <div className="mt-4 space-y-3">

      {/* En-tête */}
      <div className="flex items-center gap-2">
        <span className="text-base select-none">🪵</span>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-bold leading-tight">Choisir votre matériau</p>
          <p className="text-slate-500 text-[11px]">Type détecté : {result.travaux_type}</p>
        </div>
      </div>

      {/* Cards matériaux */}
      <div className="grid grid-cols-3 gap-2">
        {result.materiaux.map((mat) => {
          const isSelected  = mat.id === selectedId;
          const hasError    = imageErrors.has(mat.id);
          const tier        = TIER_BADGE[mat.tier] ?? TIER_BADGE['intermédiaire'];
          const glowColor   = TIER_GLOW[mat.tier]  ?? TIER_GLOW['premium'];
          const fallbackBg  = TIER_GRADIENT[mat.tier] ?? TIER_GRADIENT['intermédiaire'];

          return (
            <button
              key={mat.id}
              onClick={() => setSelectedId(mat.id)}
              title={mat.description}
              className={`relative rounded-xl overflow-hidden text-left transition-all duration-200 group outline-none ${
                isSelected
                  ? 'border-2 border-violet-500 scale-[1.02] shadow-lg'
                  : 'border-2 border-white/[0.08] hover:border-white/20 hover:scale-[1.01]'
              }`}
              style={isSelected ? { boxShadow: `0 0 18px ${glowColor}` } : undefined}
            >
              {/* Photo */}
              <div className="relative h-[72px] overflow-hidden">
                {!hasError ? (
                  <img
                    src={`https://source.unsplash.com/featured/?${encodeURIComponent(mat.imageQuery)}&sig=${mat.id}`}
                    alt={mat.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                    onError={() => setImageErrors((prev) => new Set([...prev, mat.id]))}
                  />
                ) : (
                  <div
                    className="w-full h-full"
                    style={{ background: fallbackBg }}
                  />
                )}
                {/* Gradient overlay bas */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                {/* Badge tier */}
                <span className={`absolute top-1.5 left-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full ${tier.classes}`}>
                  {tier.label}
                </span>

                {/* Checkmark sélectionné */}
                {isSelected && (
                  <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow-md">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>

              {/* Infos */}
              <div className="p-2 bg-[#0d1525]">
                <p className="text-white font-bold text-[11px] leading-tight truncate">{mat.name}</p>
                <p className="text-white font-black text-sm leading-tight mt-0.5 tabular-nums">
                  {mat.priceMin}–{mat.priceMax}
                  <span className="text-slate-500 font-normal text-[9px] ml-0.5">€/{mat.unit}</span>
                </p>
                {mat.tags.length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {mat.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="text-[8px] text-slate-500 bg-white/[0.04] rounded-full px-1.5 py-0.5 leading-tight"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Slider surface */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-xs">Surface concernée</span>
          <span className="text-white font-bold text-xs tabular-nums">
            {surface}&nbsp;{selectedMat?.unit ?? 'm²'}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={200}
          step={1}
          value={surface}
          onChange={(e) => setSurface(Number(e.target.value))}
          className="w-full h-1.5 rounded-full cursor-pointer appearance-none bg-white/[0.08]"
          style={{ accentColor: '#7c3aed' }}
        />
        <div className="flex items-center justify-between text-[10px] text-slate-600">
          <span>1 {selectedMat?.unit ?? 'm²'}</span>
          <span>200 {selectedMat?.unit ?? 'm²'}</span>
        </div>
      </div>

      {/* Impact budgétaire */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400 text-xs shrink-0">Impact budget estimé</span>
          <span className={`font-black text-sm tabular-nums ${impactColor}`}>
            {impactMin.toLocaleString('fr-FR')}&nbsp;–&nbsp;{impactMax.toLocaleString('fr-FR')}&nbsp;€
          </span>
        </div>
        {selectedMat && (
          <p className="text-slate-500 text-[10px] mt-1 leading-relaxed">{selectedMat.description}</p>
        )}
      </div>

      {/* Bouton confirmation */}
      <button
        onClick={handleConfirm}
        disabled={!selectedMat}
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl py-2.5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-violet-900/40 active:scale-[0.99]"
      >
        Confirmer {selectedMat?.name ?? 'ce matériau'}
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
