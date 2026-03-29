import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { InsightItem } from '../useInsights';

export const INSIGHT_STYLES: Record<InsightItem['type'], { bg: string; text: string; border: string; icon: React.ReactNode }> = {
  success: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-100', icon: <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> },
  warning: { bg: 'bg-amber-50',   text: 'text-amber-800',   border: 'border-amber-100',   icon: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" /> },
  alert:   { bg: 'bg-red-50',     text: 'text-red-800',     border: 'border-red-100',     icon: <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" /> },
  info:    { bg: 'bg-blue-50',    text: 'text-blue-800',    border: 'border-blue-100',     icon: <Info className="h-4 w-4 text-blue-500 shrink-0" /> },
};

function KpiCard({ label, value, sub, trend, color = 'default' }: {
  label: string; value: string; sub?: string;
  trend?: 'up' | 'down' | 'neutral'; color?: 'default' | 'green' | 'amber' | 'red' | 'blue';
}) {
  const colors = {
    default: 'bg-white border-gray-100',
    green:   'bg-emerald-50 border-emerald-100',
    amber:   'bg-amber-50 border-amber-100',
    red:     'bg-red-50 border-red-100',
    blue:    'bg-blue-50 border-blue-100',
  };
  const valueColor = { default: 'text-gray-900', green: 'text-emerald-700', amber: 'text-amber-700', red: 'text-red-700', blue: 'text-blue-700' };
  return (
    <div className={`rounded-2xl border ${colors[color]} p-5 flex flex-col gap-1`}>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-extrabold ${valueColor[color]} leading-none`}>{value}</p>
      {sub && (
        <p className="text-xs text-gray-400 flex items-center gap-1">
          {trend === 'up'   && <TrendingUp   className="h-3 w-3 text-emerald-500" />}
          {trend === 'down' && <TrendingDown  className="h-3 w-3 text-red-500" />}
          {sub}
        </p>
      )}
    </div>
  );
}

export default KpiCard;
