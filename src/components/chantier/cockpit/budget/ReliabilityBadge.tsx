import type { ChantierIAResult } from '@/types/chantier-ia';

function ReliabilityBadge({ signaux }: { signaux?: ChantierIAResult['estimationSignaux'] }) {
  if (!signaux) return null;
  const score = [
    signaux.hasLocalisation, signaux.hasBudget, signaux.hasSurface, signaux.typeProjetPrecis,
    (signaux.nbLignesBudget ?? 0) > 3,
  ].filter(Boolean).length;
  const cfg = score <= 1
    ? { label: 'Fiabilité : faible',  cls: 'bg-amber-100 text-amber-700 border-amber-200' }
    : score <= 3
    ? { label: 'Fiabilité : moyenne', cls: 'bg-blue-50 text-blue-700 border-blue-100' }
    : { label: 'Fiabilité : élevée',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

export default ReliabilityBadge;
