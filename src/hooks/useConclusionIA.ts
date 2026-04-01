import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ConclusionData } from "@/lib/conclusionTypes";

export type { ConclusionData, AnomalieConclusion } from "@/lib/conclusionTypes";

interface UseConclusionIAParams {
  analysisId: string;
  /** Valeur pré-chargée (issue du select("*") dans AnalysisResult) */
  initialRaw?: string | null;
}

interface UseConclusionIAReturn {
  conclusion:   ConclusionData | null;
  isLoading:    boolean;
  isGenerating: boolean;
  error:        string | null;
  generate:     (force?: boolean) => Promise<void>;
  reset:        () => void;
  regenerate:   () => void;
}

export function useConclusionIA({
  analysisId,
  initialRaw,
}: UseConclusionIAParams): UseConclusionIAReturn {
  const [conclusion,   setConclusion]   = useState<ConclusionData | null>(null);
  const [isLoading,    setIsLoading]    = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // ── Initialisation depuis la valeur pré-chargée ───────────────────────────
  useEffect(() => {
    if (!initialRaw) return;
    try {
      const parsed: ConclusionData = JSON.parse(initialRaw);
      // Garde-fous minimaux
      if (parsed.phrase_intro && parsed.verdict_global) {
        setConclusion(parsed);
      }
    } catch {
      // JSON corrompu — ignoré, l'utilisateur pourra régénérer
    }
  }, [initialRaw]);

  // ── Génération via l'API route ────────────────────────────────────────────
  const generate = useCallback(async (force = false) => {
    if (isGenerating) return;
    setIsGenerating(true);
    setError(null);

    try {
      // Récupère le token de session (fonctionne pour auth anonyme ET permanente)
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Session expirée. Rechargez la page.");
        return;
      }

      const response = await fetch(`/api/analyse/${analysisId}/conclusion`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ force }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error || "Une erreur est survenue. Réessayez.");
        return;
      }

      const data: ConclusionData = body.conclusion;
      if (data?.phrase_intro && data?.verdict_global) {
        setConclusion(data);
      } else {
        setError("La réponse IA est incomplète. Réessayez.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur réseau";
      setError(msg.includes("abort") ? "Requête annulée. Réessayez." : msg);
    } finally {
      setIsGenerating(false);
    }
  }, [analysisId, isGenerating]);

  const reset = useCallback(() => {
    setConclusion(null);
    setError(null);
  }, []);

  const regenerate = useCallback(() => {
    setConclusion(null);
    setError(null);
    generate(true);
  }, [generate]);

  return { conclusion, isLoading, isGenerating, error, generate, reset, regenerate };
}
