import { useState, useEffect } from 'react';
import { Lightbulb, Loader2, ArrowDownUp, Zap, Wrench, PiggyBank, AlertTriangle } from 'lucide-react';
import type { LigneBudgetIA, EtapeRoadmap, LotChantier, ArtisanIA } from '@/types/chantier-ia';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConseilMO {
  type: 'ordre' | 'synergie' | 'technique' | 'economie' | 'risque';
  emoji: string;
  titre: string;
  detail: string;
}

interface ConseilsChantierProps {
  chantierId?: string | null;
  token?: string | null;
  nomChantier?: string;
  lignesBudget?: LigneBudgetIA[];
  lots?: LotChantier[];
  artisans?: ArtisanIA[];
  roadmap?: EtapeRoadmap[];
}

// ── Config par type ───────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ConseilMO['type'], {
  label: string;
  bg: string;
  border: string;
  text: string;
  icon: React.FC<{ className?: string }>;
}> = {
  ordre: {
    label: 'Ordre d\'intervention',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/25',
    text: 'text-blue-300',
    icon: ArrowDownUp,
  },
  synergie: {
    label: 'Synergie',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/25',
    text: 'text-violet-300',
    icon: Zap,
  },
  technique: {
    label: 'Point technique',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/25',
    text: 'text-cyan-300',
    icon: Wrench,
  },
  economie: {
    label: 'Économie',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
    text: 'text-emerald-300',
    icon: PiggyBank,
  },
  risque: {
    label: 'Point de vigilance',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/25',
    text: 'text-amber-300',
    icon: AlertTriangle,
  },
};

// ── Composant ─────────────────────────────────────────────────────────────────

export default function ConseilsChantier({
  chantierId,
  token,
  nomChantier = '',
  lignesBudget = [],
  lots = [],
  artisans = [],
  roadmap = [],
}: ConseilsChantierProps) {
  const [conseils, setConseils] = useState<ConseilMO[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);

  useEffect(() => {
    if (!chantierId || !token) {
      setLoading(false);
      return;
    }

    fetch('/api/chantier/conseils', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ nomChantier, lignesBudget, lots, artisans, roadmap }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (Array.isArray(data.conseils) && data.conseils.length > 0) {
          setConseils(data.conseils.slice(0, 5));
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chantierId, token]);

  return (
    <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-5">

      {/* En-tête */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
          <Lightbulb className="h-4 w-4 text-amber-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-sm">Conseils de maître d'œuvre</h3>
          <p className="text-slate-500 text-xs mt-0.5">Synergies, ordre d'intervention, points techniques</p>
        </div>
      </div>

      {/* Corps */}
      {loading ? (
        <div className="flex items-center gap-2.5 text-slate-500 text-sm py-3">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>Analyse de vos lots en cours…</span>
        </div>
      ) : error || conseils.length === 0 ? (
        <p className="text-slate-500 text-sm py-2">
          Les conseils ne sont pas disponibles pour le moment.
        </p>
      ) : (
        <div className="space-y-3">
          {conseils.map((conseil, i) => {
            const cfg = TYPE_CONFIG[conseil.type as ConseilMO['type']] ?? TYPE_CONFIG.technique;
            const Icon = cfg.icon;
            return (
              <div
                key={i}
                className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4`}
              >
                {/* Badge type + emoji */}
                <div className="flex items-center gap-2 mb-2">
                  <div className={`inline-flex items-center gap-1.5 ${cfg.text} text-xs font-semibold`}>
                    <Icon className="h-3.5 w-3.5" />
                    {cfg.label}
                  </div>
                  <span className="text-base leading-none">{conseil.emoji}</span>
                </div>
                {/* Titre */}
                <p className="text-white text-sm font-semibold mb-1.5">{conseil.titre}</p>
                {/* Détail */}
                <p className="text-slate-400 text-xs leading-relaxed">{conseil.detail}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
