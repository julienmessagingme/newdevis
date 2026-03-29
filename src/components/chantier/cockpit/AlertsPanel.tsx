import { AlertTriangle, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import type { PaymentAlert } from '@/hooks/usePaymentEvents';

export const ALERT_CFG: Record<PaymentAlert['type'], { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  late:   { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-800',   icon: <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" /> },
  soon:   { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', icon: <Clock className="h-4 w-4 text-amber-500 shrink-0" /> },
  budget: { bg: 'bg-orange-50',border: 'border-orange-200',text: 'text-orange-800',icon: <AlertCircle className="h-4 w-4 text-orange-500 shrink-0" /> },
};

export function AlertsPanel({ alerts }: { alerts: PaymentAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        <p className="text-sm font-medium text-emerald-800">Aucune alerte — tout est à jour ✓</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => {
        const cfg = ALERT_CFG[a.type];
        return (
          <div key={i} className={`flex items-start gap-2.5 ${cfg.bg} border ${cfg.border} rounded-xl px-4 py-3`}>
            {cfg.icon}
            <p className={`text-sm font-medium ${cfg.text} leading-snug`}>{a.message}</p>
          </div>
        );
      })}
    </div>
  );
}
