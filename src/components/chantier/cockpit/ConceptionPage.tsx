import { useState } from 'react';
import { AlertCircle, Edit2, CheckCircle2, XCircle, Send, ChevronRight, SlidersHorizontal } from 'lucide-react';
import type { ChantierIAResult } from '@/types/chantier-ia';
import { useMaterialDetection } from '@/hooks/useMaterialDetection';
import type { MaterialOption } from '@/data/MATERIALS_MAP';

// ── Types ─────────────────────────────────────────────────────────────────────

export type StepStatus = 'completed' | 'skip' | 'sent' | 'next';

interface ConceptionPageProps {
  result: ChantierIAResult;
  /** Numéro de l'étape affichée dans la roadmap (0-based) */
  currentStepIndex?: number;
  /** Masque le bloc "Prochaine décision" (utile quand il est déjà affiché au-dessus) */
  showHeader?: boolean;
  /** Appelé quand l'utilisateur marque l'étape */
  onMarkStep?: (status: StepStatus) => void;
  /** Appelé quand l'utilisateur confirme un matériau */
  onMaterialConfirm?: (materialId: string) => void;
}

// ── Étapes de marquage ────────────────────────────────────────────────────────

const STEP_ACTIONS: Array<{
  status: StepStatus;
  label: string;
  Icon: React.ElementType;
  colorClasses: string;
}> = [
  {
    status: 'completed',
    label: 'Déjà fait',
    Icon: CheckCircle2,
    colorClasses: 'bg-green-500/10 border-green-500/50 text-green-400 hover:bg-green-500/20',
  },
  {
    status: 'skip',
    label: 'Non nécessaire',
    Icon: XCircle,
    colorClasses: 'bg-red-500/10 border-red-500/50 text-red-400 hover:bg-red-500/20',
  },
  {
    status: 'sent',
    label: 'Document envoyé',
    Icon: Send,
    colorClasses: 'bg-blue-500/10 border-blue-500/50 text-blue-400 hover:bg-blue-500/20',
  },
  {
    status: 'next',
    label: 'Étape suivante',
    Icon: ChevronRight,
    colorClasses: 'bg-purple-500/10 border-purple-500/50 text-purple-400 hover:bg-purple-500/20',
  },
];

// ── Carte matériau ────────────────────────────────────────────────────────────

function MaterialCard({
  option,
  selected,
  onSelect,
  surface,
}: {
  option: MaterialOption;
  selected: boolean;
  onSelect: () => void;
  surface: number;
}) {
  const [imgError, setImgError] = useState(false);

  const badgeColor =
    option.maintenanceBadgeVariant === 'green'
      ? 'bg-green-500/20 text-green-400'
      : option.maintenanceBadgeVariant === 'red'
      ? 'bg-red-500/20 text-red-400'
      : 'bg-amber-500/20 text-amber-400';

  // Badge "Sur devis" bleu pour l'option Autre
  const surDevisBadge = option.isOther
    ? 'bg-blue-500/20 text-blue-400'
    : null;

  const priceMin = option.priceUnit === 'm²' ? option.priceMin * surface : option.priceMin;
  const priceMax = option.priceUnit === 'm²' ? option.priceMax * surface : option.priceMax;
  const priceLabel =
    option.isOther
      ? 'Sur devis'
      : option.priceUnit === 'm²'
      ? `${priceMin.toLocaleString('fr-FR')} – ${priceMax.toLocaleString('fr-FR')} €`
      : `${option.priceMin.toLocaleString('fr-FR')} – ${option.priceMax.toLocaleString('fr-FR')} €`;

  return (
    <div
      onClick={onSelect}
      className={`bg-[#14182a] border rounded-xl overflow-hidden cursor-pointer transition-all group ${
        selected
          ? 'border-indigo-500 ring-1 ring-indigo-500/50'
          : 'border-gray-800 hover:border-indigo-500/50'
      }`}
    >
      {/* Image */}
      <div className="relative h-40 overflow-hidden bg-gray-800">
        {!imgError ? (
          <img
            src={option.image}
            alt={option.label}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">
            {option.emoji}
          </div>
        )}
        {selected && (
          <div className="absolute inset-0 bg-indigo-500/10 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
          </div>
        )}
        {option.isOther && (
          <div className="absolute top-2 right-2">
            <span className="bg-blue-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              Sur devis
            </span>
          </div>
        )}
      </div>

      {/* Contenu */}
      <div className="p-4">
        <div className="flex items-start gap-2 mb-1">
          <span className="text-lg leading-none">{option.emoji}</span>
          <h4 className="font-semibold text-white leading-tight">{option.label}</h4>
        </div>

        <div className="text-sm text-indigo-400 font-semibold mb-3">{priceLabel}</div>

        <p className="text-xs text-gray-400 mb-3 leading-relaxed line-clamp-3">{option.description}</p>

        <div className="flex items-center justify-between text-xs">
          {option.priceUnit === 'm²' && !option.isOther && (
            <span className="text-gray-500">{option.priceMin}–{option.priceMax} €/m²</span>
          )}
          {option.priceUnit !== 'm²' && !option.isOther && (
            <span className="text-gray-500">{option.priceUnit}</span>
          )}
          {option.isOther && <span className="text-gray-500">Estimation gratuite</span>}

          <span className={`px-2 py-1 rounded text-[11px] ${surDevisBadge ?? badgeColor}`}>
            {option.maintenanceBadge}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function ConceptionPage({
  result,
  currentStepIndex = 0,
  showHeader = true,
  onMarkStep,
  onMaterialConfirm,
}: ConceptionPageProps) {
  const { chantierType, hasMatch } = useMaterialDetection(result);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [markedStatus, setMarkedStatus] = useState<StepStatus | null>(null);
  const [surface, setSurface] = useState(50);

  // ── Données de la prochaine action ─────────────────────────────────────────

  const action = result.prochaineAction;
  const roadmap = result.roadmap ?? [];
  const currentStep = roadmap[currentStepIndex];

  const totalSteps = roadmap.length;
  const stepLabel = totalSteps > 0 ? `${currentStepIndex + 1}/${totalSteps}` : null;
  const deadline = action?.deadline ?? currentStep?.mois ?? null;

  // ── Budget impact ───────────────────────────────────────────────────────────

  const selectedOption = chantierType?.options.find((o) => o.id === selectedId);
  const budgetTotal = result.budgetTotal ?? 0;

  const budgetMin = selectedOption && !selectedOption.isOther
    ? selectedOption.priceUnit === 'm²'
      ? selectedOption.priceMin * surface
      : selectedOption.priceMin
    : null;

  const budgetMax = selectedOption && !selectedOption.isOther
    ? selectedOption.priceUnit === 'm²'
      ? selectedOption.priceMax * surface
      : selectedOption.priceMax
    : null;

  const showBudgetImpact = budgetMin !== null && budgetMax !== null && budgetTotal > 0;
  const avgBudget = budgetMin !== null && budgetMax !== null ? (budgetMin + budgetMax) / 2 : 0;
  const isOverBudget = showBudgetImpact && avgBudget > budgetTotal;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSelect = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  const handleConfirm = () => {
    if (!selectedId) return;
    onMaterialConfirm?.(selectedId);
  };

  const handleMarkStep = (status: StepStatus) => {
    setMarkedStatus(status);
    onMarkStep?.(status);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const showSlider = hasMatch && chantierType && chantierType.options.some((o) => o.priceUnit === 'm²');

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* ── En-tête : prochaine décision ─────────────────────────────────── */}
      {showHeader && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Edit2 className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className="text-sm text-purple-400 uppercase tracking-wider font-semibold">
                Prochaine décision
              </div>
              {stepLabel && (
                <div className="text-xs text-gray-400">{stepLabel}</div>
              )}
            </div>
          </div>

          <h2 className="text-2xl font-bold mb-2 text-white">
            {action?.titre ?? currentStep?.nom ?? 'Prochaine étape'}
          </h2>

          <p className="text-gray-400 mb-3">
            {action?.detail ?? currentStep?.detail ?? ''}
          </p>

          {deadline && (
            <div className="flex items-center gap-2 text-orange-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">{deadline}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Sélection de matériaux ────────────────────────────────────────── */}
      {hasMatch && chantierType && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">
                Choisir {chantierType.label.toLowerCase()}
              </h3>
              <p className="text-sm text-gray-400 mt-0.5">
                Comparez les options selon votre budget et vos priorités.
              </p>
            </div>
          </div>

          {/* Réglette surface */}
          {showSlider && (
            <div className="bg-[#14182a] border border-gray-800 rounded-xl p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-medium text-white">Surface estimée</span>
                </div>
                <span className="text-indigo-400 font-bold text-sm">{surface} m²</span>
              </div>
              <input
                type="range"
                min={1}
                max={500}
                step={1}
                value={surface}
                onChange={(e) => setSurface(Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-full appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1.5">
                <span>1 m²</span>
                <span>500 m²</span>
              </div>
            </div>
          )}

          {/* Grille 4 cartes (3 options + "Autre") */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            {chantierType.options.map((option) => (
              <MaterialCard
                key={option.id}
                option={option}
                selected={selectedId === option.id}
                onSelect={() => handleSelect(option.id)}
                surface={surface}
              />
            ))}
          </div>

          {/* Budget impact */}
          {showBudgetImpact && selectedOption && (
            <div className={`mb-5 rounded-xl border p-4 flex items-center justify-between ${
              isOverBudget
                ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-green-500/10 border-green-500/30'
            }`}>
              <div>
                <div className="text-sm font-semibold text-white mb-0.5">
                  Estimation pour {surface} m²
                </div>
                <div className="text-xs text-gray-400">
                  Budget initial : {budgetTotal.toLocaleString('fr-FR')} €
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-white">
                  {budgetMin!.toLocaleString('fr-FR')} – {budgetMax!.toLocaleString('fr-FR')} €
                </div>
                <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                  isOverBudget
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-green-500/20 text-green-400'
                }`}>
                  {isOverBudget ? '⚠ Budget serré' : '✓ Dans le budget'}
                </span>
              </div>
            </div>
          )}

          {/* Bouton confirmer */}
          <button
            onClick={handleConfirm}
            disabled={!selectedId}
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              selectedId && selectedOption?.isOther
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : selectedId
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            {selectedId && selectedOption?.isOther
              ? 'Obtenir des devis comparatifs'
              : selectedId
              ? `Confirmer : ${chantierType.options.find((o) => o.id === selectedId)?.label}`
              : 'Sélectionnez une option pour continuer'}
          </button>
        </div>
      )}

      {/* ── Marquer l'étape ───────────────────────────────────────────────── */}
      <div className="bg-[#14182a] border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 text-white">
          Marquer cette étape :
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {STEP_ACTIONS.map(({ status, label, Icon, colorClasses }) => {
            const isMarked = markedStatus === status;
            return (
              <button
                key={status}
                onClick={() => handleMarkStep(status)}
                className={`py-3 px-4 rounded-lg border transition-all hover:scale-105 flex flex-col items-center gap-1.5 ${colorClasses} ${
                  isMarked ? 'ring-1 ring-current scale-105' : ''
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{label}</span>
              </button>
            );
          })}
        </div>

        {markedStatus && (
          <p className="mt-3 text-xs text-gray-500 text-center">
            Étape marquée comme «{' '}
            {STEP_ACTIONS.find((a) => a.status === markedStatus)?.label}
            {' '}». Cette information sera sauvegardée.
          </p>
        )}
      </div>
    </div>
  );
}
