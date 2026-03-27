import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { DocumentChantier } from '@/types/chantier-ia';

// ── Types ───────────────────────────────────────────────────────────────────

export type ScoreText = 'VERT' | 'ORANGE' | 'ROUGE';

export interface AnalysisScoreData {
  score: ScoreText | null;
  /** Score numérique (75/55/25) pour les composants qui l'attendent */
  scoreNum: number | null;
  ttc: number | null;
  ht: number | null;
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Fetch les scores et montants depuis les analyses liées aux documents.
 * Retourne un Record<docId, AnalysisScoreData>.
 * Déduplique les appels — un seul SELECT pour tous les analyse_id distincts.
 */
export function useAnalysisScores(docs: DocumentChantier[]) {
  const [data, setData] = useState<Record<string, AnalysisScoreData>>({});
  const [loading, setLoading] = useState(false);

  // Clé stable : on ne rejoue l'effet que si les analyse_id changent réellement.
  // Passer `docs` directement causerait une boucle infinie car c'est un nouveau
  // tableau à chaque render du parent.
  const analyseKey = docs.map(d => `${d.id}:${d.analyse_id ?? ''}`).join(',');

  useEffect(() => {
    const withAnalyse = docs.filter(d => d.analyse_id);
    if (!withAnalyse.length) {
      setData({});
      return;
    }

    const ids = [...new Set(withAnalyse.map(d => d.analyse_id!))];
    setLoading(true);

    supabase
      .from('analyses')
      .select('id, score, raw_text')
      .in('id', ids)
      .then(({ data: rows }) => {
        if (!rows) { setLoading(false); return; }

        // Index par analyse_id
        const byAnalyseId: Record<string, AnalysisScoreData> = {};
        rows.forEach(a => {
          // raw_text peut être TEXT (JSON string) ou JSONB — toujours parser
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let raw: any = a.raw_text;
          if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
          const totaux = raw?.extracted?.totaux;

          const scoreText: ScoreText | null =
            a.score === 'VERT' || a.score === 'ORANGE' || a.score === 'ROUGE'
              ? a.score as ScoreText : null;

          byAnalyseId[a.id] = {
            score: scoreText,
            scoreNum: scoreText === 'VERT' ? 75 : scoreText === 'ORANGE' ? 55 : scoreText === 'ROUGE' ? 25 : null,
            ttc: totaux?.ttc != null && !isNaN(Number(totaux.ttc)) ? Number(totaux.ttc) : null,
            ht:  totaux?.ht  != null && !isNaN(Number(totaux.ht))  ? Number(totaux.ht)  : null,
          };
        });

        // Relier analyse_id → doc.id
        const result: Record<string, AnalysisScoreData> = {};
        withAnalyse.forEach(d => {
          if (d.analyse_id && byAnalyseId[d.analyse_id]) {
            result[d.id] = byAnalyseId[d.analyse_id];
          }
        });

        setData(result);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyseKey]);

  return { data, loading };
}
