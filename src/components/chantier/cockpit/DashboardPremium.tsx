/**
 * DashboardPremium — point d'entrée unique.
 * Redirige toujours vers DashboardUnified (plus de sélection de mode).
 */
import type { ChantierIAResult, ProjectMode, StatutArtisan, TacheIA } from '@/types/chantier-ia';
import DashboardUnified from './DashboardUnified';

interface Props {
  result: ChantierIAResult;
  chantierId: string | null;
  projectMode?: ProjectMode | null;
  onProjectModeChange?: (mode: ProjectMode) => void;
  onToggleTache?: (todoId: string, done: boolean) => void;
  onLotStatutChange?: (lotId: string, statut: StatutArtisan) => void;
  token?: string | null;
  userId?: string | null;
  initialBudgetAffine?: { min: number; max: number; breakdown: unknown[] } | null;
}

export default function DashboardPremium({ result, chantierId, token, onLotStatutChange, initialBudgetAffine }: Props) {
  return (
    <DashboardUnified
      result={result}
      chantierId={chantierId}
      token={token}
      onLotStatutChange={onLotStatutChange}
      initialBudgetAffine={initialBudgetAffine}
    />
  );
}
