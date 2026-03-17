import { useState } from 'react';
import { AlertCircle, Edit2, CheckCircle2, XCircle, Send, ChevronRight } from 'lucide-react';
import type { ChantierIAResult } from '@/types/chantier-ia';
import { useMaterialSuggestions, type MaterialCard } from '@/hooks/useMaterialSuggestions';

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

function MaterialCardItem({
  card,
  selected,
  onSelect,
}: {
  card: MaterialCard;
  selected: boolean;
  onSelect: () => void;
}) {
  const badgeColor =
    card.maintenanceBadgeVariant === 'green'
      ? 'bg-green-500/20 text-green-400'
      : card.maintenanceBadgeVariant === 'red'
      ? 'bg-red-500/20 text-red-400'
      : 'bg-amber-500/20 text-amber-400';

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
      <div className="relative h-40 overflow-hidden">
        <img
          src={card.image}
          alt={card.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        {selected && (
          <div className="absolute inset-0 bg-indigo-500/10 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
          </div>
        )}
      </div>

      {/* Contenu */}
      <div className="p-4">
        <h4 className="font-semibold mb-1 text-white">{card.name}</h4>
        <div className="text-sm text-indigo-400 font-semibold mb-3">{card.priceRange}</div>

        <div className="space-y-2 mb-3">
          {card.features.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
              <div
                className={`w-3 h-3 rounded-sm mt-0.5 flex-shrink-0 flex items-center justify-center ${
                  f.positive ? 'bg-green-500/20' : 'bg-red-500/20'
                }`}
              >
                <span className={`text-[9px] leading-none ${f.positive ? 'text-green-400' : 'text-red-400'}`}>
                  {f.positive ? '✓' : '✗'}
                </span>
              </div>
              <span>{f.text}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">{card.duration}</span>
          <span className={`px-2 py-1 rounded text-[11px] ${badgeColor}`}>
            {card.maintenanceBadge}
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
  const { cards, categoryLabel, hasMatch } = useMaterialSuggestions(result);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [markedStatus, setMarkedStatus] = useState<StepStatus | null>(null);

  // ── Données de la prochaine action ─────────────────────────────────────────

  const action = result.prochaineAction;
  const roadmap = result.roadmap ?? [];
  const currentStep = roadmap[currentStepIndex];

  // Numéro de l'étape courante parmi les étapes actives
  const totalSteps = roadmap.length;
  const stepLabel = totalSteps > 0 ? `${currentStepIndex + 1}/${totalSteps}` : null;

  // Formatage de la deadline
  const deadline = action?.deadline ?? currentStep?.mois ?? null;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSelectMaterial = (id: string) => {
    setSelectedMaterialId((prev) => (prev === id ? null : id));
  };

  const handleConfirmMaterial = () => {
    if (!selectedMaterialId) return;
    onMaterialConfirm?.(selectedMaterialId);
  };

  const handleMarkStep = (status: StepStatus) => {
    setMarkedStatus(status);
    onMarkStep?.(status);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

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

      {/* ── Sélection de matériaux (si catégorie détectée) ───────────────── */}
      {hasMatch && cards.length > 0 && (
        <div className="mb-8">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2 text-white">
              Choisir {categoryLabel.toLowerCase()}
            </h3>
            <p className="text-sm text-gray-400">
              Comparez les options selon votre budget et vos priorités.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {cards.map((card) => (
              <MaterialCardItem
                key={card.id}
                card={card}
                selected={selectedMaterialId === card.id}
                onSelect={() => handleSelectMaterial(card.id)}
              />
            ))}
          </div>

          <button
            onClick={handleConfirmMaterial}
            disabled={!selectedMaterialId}
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              selectedMaterialId
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            {selectedMaterialId
              ? `Confirmer : ${cards.find((c) => c.id === selectedMaterialId)?.name}`
              : 'Sélectionnez un matériau pour continuer'}
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
