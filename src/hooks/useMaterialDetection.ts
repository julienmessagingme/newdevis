import { useMemo } from 'react';
import { detectChantierType, type ChantierType } from '@/data/MATERIALS_MAP';
import type { ChantierIAResult } from '@/types/chantier-ia';

/**
 * Hook React wrappant `detectChantierType()`.
 * Retourne le type de chantier détecté + ses options, ou null si aucun match.
 */
export function useMaterialDetection(result: ChantierIAResult): {
  chantierType: ChantierType | null;
  hasMatch: boolean;
} {
  return useMemo(() => {
    const chantierType = detectChantierType({
      typeProjet: result.typeProjet,
      description: result.description,
      prochaineActionTitre: result.prochaineAction?.titre,
      lotNoms: (result.lots ?? []).map((l) => l.nom),
    });

    return {
      chantierType,
      hasMatch: chantierType !== null,
    };
  }, [result]);
}
