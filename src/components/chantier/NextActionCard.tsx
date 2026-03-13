import { useState, useEffect } from 'react';
import { Zap, ChevronRight, Loader2 } from 'lucide-react';
import type { ChantierIAResult, DocumentChantier } from '@/types/chantier-ia';
import { getNextAction, type NextActionResult } from '@/utils/chantier/getNextAction';

// ── Props ──────────────────────────────────────────────────────────────────────

interface NextActionCardProps {
  result:      ChantierIAResult;
  chantierId?: string | null;
  token?:      string | null;
  /** Appelé quand l'utilisateur clique "Voir le lot" — fournit le lotId ou label */
  onViewLot?:  (lotId: string) => void;
}

// ── Composant ──────────────────────────────────────────────────────────────────

export default function NextActionCard({
  result,
  chantierId,
  token,
  onViewLot,
}: NextActionCardProps) {
  const [action, setAction]   = useState<NextActionResult | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Action locale instantanée au mount ──────────────────────────────────────
  useEffect(() => {
    // Calcul sans documents (fallback depuis roadmap uniquement)
    const local = getNextAction(
      result.lignesBudget ?? [],
      [],
      result.lots ?? [],
      result.roadmap ?? [],
    );
    setAction(local);
  }, [result]);

  // ── Rechargement si documents disponibles ───────────────────────────────────
  useEffect(() => {
    if (!chantierId || !token) return;

    setLoading(true);
    fetch(`/api/chantier/${chantierId}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        const docs = (data.documents ?? []) as DocumentChantier[];
        const computed = getNextAction(
          result.lignesBudget ?? [],
          docs,
          result.lots ?? [],
          result.roadmap ?? [],
        );
        setAction(computed);
      })
      .catch(() => { /* garder l'action locale */ })
      .finally(() => setLoading(false));
  }, [chantierId, token, result]);

  if (!action) return null;

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-950/40 to-purple-950/40 p-4 mb-1">

      {/* En-tête */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0">
          <Zap className="h-3.5 w-3.5 text-violet-400" />
        </div>
        <span className="text-xs font-semibold text-violet-300 uppercase tracking-wider flex-1">
          Prochaine action
        </span>
        {loading && (
          <Loader2 className="h-3.5 w-3.5 text-violet-500/60 animate-spin" />
        )}
      </div>

      {/* Corps */}
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none mt-0.5 shrink-0">{action.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-snug">
            {action.action}
          </p>
          <p className="text-slate-400 text-xs mt-1 leading-relaxed">
            {action.detail}
          </p>

          {/* Bouton "Voir le lot" */}
          {action.lotId && onViewLot && (
            <button
              onClick={() => onViewLot(action.lotId!)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/25 text-violet-300 rounded-lg px-3 py-1.5 font-medium transition-all"
            >
              Voir le lot
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
          {action.lot && !onViewLot && (
            <span className="inline-block mt-3 text-xs bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-lg px-2.5 py-1">
              Lot : {action.lot}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
