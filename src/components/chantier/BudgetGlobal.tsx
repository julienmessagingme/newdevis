import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import type { DocumentChantier, LigneBudgetIA } from '@/types/chantier-ia';
import { calcBudgetFromDocuments, type BudgetResult } from '@/utils/chantier/calcBudgetFromDocuments';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatEur(n: number): string {
  return n.toLocaleString('fr-FR') + '\u202f€';
}

// ── Sous-composant carte métrique ─────────────────────────────────────────────

interface MetricCardProps {
  label:    string;
  value:    number;
  /** true → affiche "–" + sous-label quand value === 0 */
  dashWhenZero?: boolean;
  subLabel?:     string;
  accent:   'blue' | 'amber' | 'emerald' | 'rose';
}

const ACCENT: Record<MetricCardProps['accent'], { card: string; value: string; badge: string }> = {
  blue:    { card: 'bg-blue-500/[0.07]   border-blue-500/20',   value: 'text-blue-200',    badge: 'bg-blue-500/15   text-blue-300'    },
  amber:   { card: 'bg-amber-500/[0.07]  border-amber-500/20',  value: 'text-amber-200',   badge: 'bg-amber-500/15  text-amber-300'   },
  emerald: { card: 'bg-emerald-500/[0.07] border-emerald-500/20', value: 'text-emerald-200', badge: 'bg-emerald-500/15 text-emerald-300' },
  rose:    { card: 'bg-rose-500/[0.07]   border-rose-500/20',   value: 'text-rose-200',    badge: 'bg-rose-500/15   text-rose-300'    },
};

function MetricCard({ label, value, dashWhenZero, subLabel, accent }: MetricCardProps) {
  const cls   = ACCENT[accent];
  const empty = dashWhenZero && value === 0;

  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-1.5 ${cls.card}`}>
      <span className="text-slate-500 text-xs font-medium uppercase tracking-wide leading-none">
        {label}
      </span>
      <span className={`text-xl font-bold leading-tight ${empty ? 'text-slate-700' : cls.value}`}>
        {empty ? '–' : formatEur(value)}
      </span>
      {subLabel && (
        <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 self-start ${
          empty ? 'bg-white/[0.04] text-slate-600' : cls.badge
        }`}>
          {subLabel}
        </span>
      )}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface BudgetGlobalProps {
  lignesBudget: LigneBudgetIA[];
  chantierId?:  string | null;
  token?:       string | null;
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function BudgetGlobal({ lignesBudget, chantierId, token }: BudgetGlobalProps) {
  const [budget, setBudget]     = useState<BudgetResult>(() =>
    calcBudgetFromDocuments(lignesBudget, []),
  );
  const [nbDevis, setNbDevis]       = useState(0);
  const [nbFactures, setNbFactures] = useState(0);
  const [loading, setLoading]       = useState(false);

  const fetchAndCompute = useCallback(async () => {
    if (!chantierId || !token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const docs = (data.documents ?? []) as DocumentChantier[];

      setBudget(calcBudgetFromDocuments(lignesBudget, docs));
      setNbDevis(docs.filter((d) => d.document_type === 'devis').length);
      setNbFactures(docs.filter((d) => d.document_type === 'facture').length);
    } catch {
      // Non critique — l'estimé IA reste affiché
    } finally {
      setLoading(false);
    }
  }, [chantierId, token, lignesBudget]);

  useEffect(() => { fetchAndCompute(); }, [fetchAndCompute]);

  // Sous-labels dynamiques pour engagé / payé
  const engageLabel  = nbDevis    === 0 ? 'Aucun devis'
    : `${nbDevis} devis${nbDevis > 1 ? '' : ''}`;
  const payeLabel    = nbFactures === 0 ? 'Aucune facture'
    : `${nbFactures} facture${nbFactures > 1 ? 's' : ''}`;

  // Couleur resteAPayer : rose si positif, slate sinon
  const resteAccent: MetricCardProps['accent'] = budget.resteAPayer > 0 ? 'rose' : 'blue';

  return (
    <div className="relative mb-4">

      {/* Spinner overlay pendant le fetch */}
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[#0a0f1e]/60">
          <Loader2 className="h-5 w-5 text-slate-600 animate-spin" />
        </div>
      )}

      {/* Grille 2×2 */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Budget estimé"
          value={budget.totalEstime}
          accent="blue"
        />
        <MetricCard
          label="Budget engagé"
          value={budget.totalEngage}
          dashWhenZero
          subLabel={engageLabel}
          accent="amber"
        />
        <MetricCard
          label="Déjà payé"
          value={budget.totalPaye}
          dashWhenZero
          subLabel={payeLabel}
          accent="emerald"
        />
        <MetricCard
          label="Reste à payer"
          value={budget.resteAPayer}
          dashWhenZero
          accent={resteAccent}
        />
      </div>
    </div>
  );
}
