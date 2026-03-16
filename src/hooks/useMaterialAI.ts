import { useState, useEffect, useRef } from 'react';

// ── Types exportés ──────────────────────────────────────────────────────────

export interface MaterialOption {
  id: string;
  name: string;
  description: string;
  priceMin: number;
  priceMax: number;
  unit: string;
  imageQuery: string;
  tier: 'économique' | 'intermédiaire' | 'premium';
  tags: string[];
}

export interface MaterialAIResult {
  travaux_type: string;
  materiaux: MaterialOption[];
}

// ── Détection de besoin matériau ────────────────────────────────────────────

/**
 * Mots-clés qui signalent qu'une étape implique un choix de matériau.
 * Complémentaire à WORK_OPTIONS_MAP dans DashboardChantier (qui couvre
 * revêtement, allée, terrasse, façade, isolation via SimulateurOptions).
 * MaterialSelector prend le relais pour les autres mots-clés.
 */
const MATERIAL_KEYWORDS = [
  'carrelage', 'carreler', 'faïence', 'faience', 'cérame', 'cerame', 'marbre',
  'matériau', 'matériaux', 'materiaux', 'materiau',
  'parquet', 'plancher bois', 'sol stratifié', 'sol souple',
  'bardage', 'enduit', 'revêtement mural',
  'peinture intérieure', 'peinture extérieure',
  'cloison', 'doublage',
  'menuiserie intérieure',
  'choisir revêt', 'choisir le carr',
];

export function detectMaterialNeed(stepTitle: string, stepDetail: string): boolean {
  const haystack = `${stepTitle} ${stepDetail}`.toLowerCase();
  return MATERIAL_KEYWORDS.some((kw) => haystack.includes(kw));
}

// ── Hook ────────────────────────────────────────────────────────────────────

interface UseMaterialAIOptions {
  description: string;
  lots: string[];
  currentStepTitle: string;
  currentStepDetail: string;
  token?: string | null;
  /** Passer false pour désactiver (ex : SimulateurOptions déjà affiché) */
  enabled?: boolean;
}

export interface UseMaterialAIReturn {
  shouldShow: boolean;
  isLoading: boolean;
  result: MaterialAIResult | null;
  error: string | null;
}

/**
 * Détecte si l'étape courante implique un choix de matériau,
 * puis appelle /api/chantier/materiaux pour générer 3 options via Gemini.
 * Le fetch n'est effectué qu'une seule fois par montage du composant.
 */
export function useMaterialAI({
  description,
  lots,
  currentStepTitle,
  currentStepDetail,
  token,
  enabled = true,
}: UseMaterialAIOptions): UseMaterialAIReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [result,    setResult]    = useState<MaterialAIResult | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  // Guard : ne fetch qu'une fois (même si les dépendances changent légèrement)
  const fetchedRef = useRef(false);

  const shouldShow =
    enabled &&
    detectMaterialNeed(currentStepTitle, currentStepDetail);

  useEffect(() => {
    if (!shouldShow || fetchedRef.current) return;
    fetchedRef.current = true;

    setIsLoading(true);
    setError(null);

    fetch('/api/chantier/materiaux', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        description,
        lots,
        currentStep: `${currentStepTitle} — ${currentStepDetail}`,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<MaterialAIResult>;
      })
      .then((data) => {
        if (Array.isArray(data.materiaux) && data.materiaux.length > 0) {
          setResult(data);
        }
      })
      .catch((e: Error) => {
        console.error('[useMaterialAI]', e.message);
        setError(e.message);
      })
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShow, token]);

  return { shouldShow, isLoading, result, error };
}
