import { useMemo } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import {
  usePaymentEvents,
  computeAlerts,
  computeCashflow,
  computeTotalEngaged,
} from '@/hooks/usePaymentEvents';
import { fmtEur } from '@/lib/financingUtils';
import { AlertsPanel } from '@/components/chantier/cockpit/AlertsPanel';
import BudgetGaugeReal from '@/components/chantier/cockpit/BudgetGaugeReal';
import CashflowProjection from '@/components/chantier/cockpit/CashflowProjection';
import FinancingSources, { type SourceKey } from '@/components/chantier/cockpit/FinancingSources';

export default function CashflowTab({
  chantierId,
  token,
  budgetMax,
  onBudgetOverride,
  financingAmounts,
  setFinancingAmounts,
}: {
  chantierId: string;
  token: string;
  budgetMax: number;
  onBudgetOverride: (v: number | null) => void;
  financingAmounts: Record<SourceKey, string>;
  setFinancingAmounts: React.Dispatch<React.SetStateAction<Record<SourceKey, string>>>;
}) {
  const { events, loading, error, refresh } = usePaymentEvents(chantierId, token);

  const totalEngaged = useMemo(() => computeTotalEngaged(events), [events]);
  const totalPaid    = useMemo(() => events.filter(e => e.status === 'paid').reduce((s, e) => s + (e.amount ?? 0), 0), [events]);
  const lateAmount   = useMemo(() => events.filter(e => e.status === 'late').reduce((s, e) => s + (e.amount ?? 0), 0), [events]);
  const cashflow     = useMemo(() => computeCashflow(events), [events]);
  const alerts       = useMemo(() => computeAlerts(events, budgetMax || null), [events, budgetMax]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">Calcul de la trésorerie…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-gray-500">{error}</p>
        <button type="button" onClick={refresh} className="flex items-center gap-1.5 text-xs text-blue-600 font-semibold">
          <RefreshCw className="h-3.5 w-3.5" /> Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AlertsPanel alerts={alerts} />
      <BudgetGaugeReal
        totalEngaged={totalEngaged}
        totalPaid={totalPaid}
        budgetMax={budgetMax}
        lateAmount={lateAmount}
        onBudgetOverride={onBudgetOverride}
      />
      <CashflowProjection
        next7={cashflow.next7}
        next30={cashflow.next30}
        next60={cashflow.next60}
        events={events}
      />
      <FinancingSources budgetMax={budgetMax} amounts={financingAmounts} setAmounts={setFinancingAmounts} />
    </div>
  );
}
