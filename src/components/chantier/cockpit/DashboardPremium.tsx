import { useState } from 'react';
import type { ChantierIAResult, ProjectMode, StatutArtisan, TacheIA } from '@/types/chantier-ia';
import DashboardGuided from './DashboardGuided';
import DashboardOrganised from './DashboardOrganised';
import DashboardExpert from './DashboardExpert';
import ScreenModeSelection from '@/components/chantier/nouveau/ScreenModeSelection';

interface Props {
  result: ChantierIAResult;
  chantierId: string | null;
  projectMode: ProjectMode | null;
  onProjectModeChange: (mode: ProjectMode) => void;
  onToggleTache?: (todoId: string, done: boolean) => void;
  onLotStatutChange?: (lotId: string, statut: StatutArtisan) => void;
  token?: string | null;
  userId?: string | null;
}

export default function DashboardPremium({
  result,
  chantierId,
  projectMode,
  onProjectModeChange,
  onToggleTache,
  onLotStatutChange,
  token,
}: Props) {
  // Si pas de mode choisi, afficher le sélecteur
  if (!projectMode) {
    return (
      <ScreenModeSelection
        onSelect={onProjectModeChange}
      />
    );
  }

  const sharedProps = {
    result,
    chantierId,
    token,
    onProjectModeChange,
  };

  switch (projectMode) {
    case 'guided':
      return (
        <DashboardGuided
          {...sharedProps}
          onToggleTache={onToggleTache}
        />
      );

    case 'flexible':
      return (
        <DashboardOrganised
          {...sharedProps}
          onLotStatutChange={onLotStatutChange}
        />
      );

    case 'investor':
      return (
        <DashboardExpert
          {...sharedProps}
          onLotStatutChange={onLotStatutChange}
        />
      );

    default:
      return null;
  }
}
