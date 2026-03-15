import { useState, useEffect } from 'react';
import {
  Lightbulb, Loader2, ArrowDownUp, Zap, Wrench,
  PiggyBank, AlertTriangle, ChevronDown, CheckCircle2,
} from 'lucide-react';
import type { LigneBudgetIA, EtapeRoadmap, LotChantier, ArtisanIA } from '@/types/chantier-ia';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConseilMO {
  type: 'ordre' | 'synergie' | 'technique' | 'economie' | 'risque';
  emoji: string;
  titre: string;
  detail: string;
  economie_potentielle?: { min: number; max: number } | null;
}

interface ConseilsChantierProps {
  chantierId?: string | null;
  token?: string | null;
  nomChantier?: string;
  lignesBudget?: LigneBudgetIA[];
  lots?: LotChantier[];
  artisans?: ArtisanIA[];
  roadmap?: EtapeRoadmap[];
  /** Appelé quand les conseils sont chargés — permet au parent de calculer les optimisations */
  onConseils?: (conseils: ConseilMO[]) => void;
}

// ── Config par type ───────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ConseilMO['type'], {
  label: string;
  bg: string;
  border: string;
  text: string;
  iconBg: string;
  icon: React.FC<{ className?: string }>;
}> = {
  ordre: {
    label:  'Ordre d\'intervention',
    bg:     'bg-blue-500/[0.07]',
    border: 'border-blue-500/20',
    text:   'text-blue-300',
    iconBg: 'bg-blue-500/15 border-blue-500/20',
    icon:   ArrowDownUp,
  },
  synergie: {
    label:  'Synergie',
    bg:     'bg-violet-500/[0.07]',
    border: 'border-violet-500/20',
    text:   'text-violet-300',
    iconBg: 'bg-violet-500/15 border-violet-500/20',
    icon:   Zap,
  },
  technique: {
    label:  'Point technique',
    bg:     'bg-cyan-500/[0.07]',
    border: 'border-cyan-500/20',
    text:   'text-cyan-300',
    iconBg: 'bg-cyan-500/15 border-cyan-500/20',
    icon:   Wrench,
  },
  economie: {
    label:  'Économie',
    bg:     'bg-emerald-500/[0.07]',
    border: 'border-emerald-500/20',
    text:   'text-emerald-300',
    iconBg: 'bg-emerald-500/15 border-emerald-500/20',
    icon:   PiggyBank,
  },
  risque: {
    label:  'Vigilance',
    bg:     'bg-amber-500/[0.07]',
    border: 'border-amber-500/20',
    text:   'text-amber-300',
    iconBg: 'bg-amber-500/15 border-amber-500/20',
    icon:   AlertTriangle,
  },
};

// ── Card individuelle ─────────────────────────────────────────────────────────

function ConseilCard({ conseil }: { conseil: ConseilMO }) {
  const [expanded, setExpanded] = useState(false);
  const [applied, setApplied]   = useState(false);
  const cfg = TYPE_CONFIG[conseil.type as ConseilMO['type']] ?? TYPE_CONFIG.technique;
  const Icon = cfg.icon;

  return (
    <div className={`rounded-2xl border ${cfg.border} ${applied ? 'opacity-55' : cfg.bg} transition-all duration-300`}>
      <div className="p-4">

        {/* Badge type */}
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${cfg.iconBg}`}>
            <Icon className={`h-3.5 w-3.5 ${cfg.text}`} />
          </div>
          <span className={`text-[11px] font-semibold uppercase tracking-wider ${cfg.text}`}>
            {cfg.label}
          </span>
          <span className="text-base leading-none ml-auto select-none">{conseil.emoji}</span>
        </div>

        {/* Titre */}
        <p className="text-white font-semibold text-sm leading-snug mb-2">{conseil.titre}</p>

        {/* Badge économie potentielle */}
        {conseil.economie_potentielle && (
          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5 mb-3 w-fit">
            <PiggyBank className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="text-emerald-300 text-xs font-semibold">
              Économie potentielle&nbsp;:&nbsp;
              {conseil.economie_potentielle.min.toLocaleString('fr-FR')}&nbsp;–&nbsp;
              {conseil.economie_potentielle.max.toLocaleString('fr-FR')}&nbsp;€
            </span>
          </div>
        )}

        {/* Détail dépliable */}
        {expanded && (
          <div className="border-t border-white/[0.05] pt-3 mb-3">
            <p className="text-slate-300 text-xs leading-relaxed">{conseil.detail}</p>
          </div>
        )}

        {/* Boutons */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setExpanded((v) => !v)}
            className={`inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 border font-medium transition-all ${
              expanded
                ? `${cfg.border} ${cfg.text} bg-white/[0.04]`
                : 'border-white/[0.08] text-slate-400 hover:text-white hover:border-white/20 bg-white/[0.03]'
            }`}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            {expanded ? 'Réduire' : 'Voir pourquoi'}
          </button>

          <button
            onClick={() => setApplied((v) => !v)}
            className={`inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 border font-medium transition-all ${
              applied
                ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300'
                : 'border-white/[0.08] text-slate-400 hover:text-emerald-300 hover:border-emerald-500/30 bg-white/[0.03]'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {applied ? 'Appliqué ✓' : 'Marquer appliqué'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-white/[0.06]" />
        <div className="h-3 w-28 bg-white/[0.06] rounded" />
      </div>
      <div className="h-4 w-3/4 bg-white/[0.06] rounded mb-2.5" />
      <div className="h-3 w-full bg-white/[0.04] rounded mb-1.5" />
      <div className="h-3 w-4/5 bg-white/[0.04] rounded mb-3" />
      <div className="flex gap-2">
        <div className="h-7 w-24 bg-white/[0.04] rounded-lg" />
        <div className="h-7 w-32 bg-white/[0.04] rounded-lg" />
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function ConseilsChantier({
  chantierId,
  token,
  nomChantier = '',
  lignesBudget = [],
  lots = [],
  artisans = [],
  roadmap = [],
  onConseils,
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
          const result = data.conseils.slice(0, 5) as ConseilMO[];
          setConseils(result);
          onConseils?.(result);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chantierId, token]);

  return (
    <div className="space-y-4">

      {/* En-tête section */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
          <Lightbulb className="h-4 w-4 text-amber-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-lg">Conseils de maître d'œuvre</h3>
          <p className="text-slate-500 text-xs mt-0.5">
            Synergies, ordre d'intervention, optimisations spécifiques à votre chantier
          </p>
        </div>
      </div>

      {/* Corps */}
      {loading ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-slate-500 text-xs pb-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            <span>Votre maître d'œuvre analyse les lots…</span>
          </div>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error || conseils.length === 0 ? (
        <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-5 text-center">
          <p className="text-slate-500 text-sm">
            Les conseils ne sont pas disponibles pour le moment.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {conseils.map((conseil, i) => (
            <ConseilCard key={i} conseil={conseil} />
          ))}
        </div>
      )}
    </div>
  );
}
