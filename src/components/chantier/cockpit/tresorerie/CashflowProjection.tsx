import { useState } from 'react';
import { Info } from 'lucide-react';
import { usePaymentEvents } from '@/hooks/usePaymentEvents';
import { fmtEur, fmtDateShort } from '@/lib/financingUtils';

export default function CashflowProjection({
  next7, next30, next60, events,
}: {
  next7: number;
  next30: number;
  next60: number;
  events: ReturnType<typeof usePaymentEvents>['events'];
}) {
  const max = Math.max(next7, next30, next60, 1);
  const [expanded, setExpanded] = useState<'7' | '30' | '60' | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const d7    = new Date(); d7.setDate(d7.getDate() + 7);
  const d30   = new Date(); d30.setDate(d30.getDate() + 30);
  const d60   = new Date(); d60.setDate(d60.getDate() + 60);

  const active = events.filter(e => e.status !== 'cancelled' && e.status !== 'paid' && e.due_date);

  const evts7  = active.filter(e => e.due_date! >= today && e.due_date! <= d7.toISOString().slice(0, 10));
  const evts30 = active.filter(e => e.due_date! >= today && e.due_date! <= d30.toISOString().slice(0, 10));
  const evts60 = active.filter(e => e.due_date! >= today && e.due_date! <= d60.toISOString().slice(0, 10));

  const rows: { key: '7' | '30' | '60'; label: string; sublabel: string; value: number; color: string; bg: string; evts: typeof active }[] = [
    { key: '7',  label: '7 prochains jours',  sublabel: 'Paiements urgents', value: next7,  color: 'bg-red-400',   bg: 'bg-red-50',   evts: evts7  },
    { key: '30', label: '30 prochains jours', sublabel: 'Ce mois-ci',        value: next30, color: 'bg-amber-400', bg: 'bg-amber-50', evts: evts30 },
    { key: '60', label: '60 prochains jours', sublabel: 'Dans les 2 mois',   value: next60, color: 'bg-blue-400',  bg: 'bg-blue-50',  evts: evts60 },
  ];

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3 shadow-sm">
      <div>
        <h3 className="font-semibold text-gray-900 text-sm">Prévision de dépenses</h3>
        <p className="text-[11px] text-gray-400 mt-0.5">Montants restant à verser par période</p>
      </div>

      {rows.map(row => (
        <div key={row.key} className={`${row.bg} rounded-xl overflow-hidden`}>
          <button
            className="w-full px-4 py-3 space-y-1.5 text-left"
            onClick={() => setExpanded(expanded === row.key ? null : row.key)}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-gray-700">{row.label}</span>
                <span className="text-[10px] text-gray-400 ml-2">({row.sublabel})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-gray-900 tabular-nums">
                  {row.value > 0 ? fmtEur(row.value) : <span className="text-gray-300 font-normal text-xs">Rien</span>}
                </span>
                {row.evts.length > 0 && (
                  <span className="text-[10px] text-gray-400">{expanded === row.key ? '▲' : '▼'}</span>
                )}
              </div>
            </div>
            {row.value > 0 && (
              <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                <div
                  className={`h-full ${row.color} rounded-full transition-all duration-700`}
                  style={{ width: `${(row.value / max) * 100}%` }}
                />
              </div>
            )}
            {row.evts.length > 0 && (
              <p className="text-[10px] text-gray-400">
                {row.evts.length} paiement{row.evts.length > 1 ? 's' : ''} concerné{row.evts.length > 1 ? 's' : ''} — cliquez pour voir le détail
              </p>
            )}
          </button>

          {expanded === row.key && row.evts.length > 0 && (
            <div className="border-t border-white/50 divide-y divide-white/50 mx-3 mb-3">
              {row.evts.map(ev => (
                <div key={ev.id} className="flex items-center gap-2 py-2 px-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-gray-700 truncate">{ev.label}</p>
                    <p className="text-[10px] text-gray-400">
                      {ev.artisan_nom ?? ev.lot_nom ?? ev.source_name?.replace(/\.(pdf|PDF)$/, '') ?? ''}
                      {ev.due_date && ` · ${fmtDateShort(ev.due_date)}`}
                    </p>
                  </div>
                  {ev.amount !== null && (
                    <span className="text-[11px] font-bold text-gray-700 tabular-nums shrink-0">
                      {fmtEur(ev.amount)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {next60 === 0 && (
        <p className="text-xs text-gray-400 text-center pt-1">
          Aucun paiement à prévoir dans les 60 prochains jours
        </p>
      )}

      <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 flex gap-2">
        <Info className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Ces montants sont <strong className="text-gray-600">cumulatifs</strong> : "30 prochains jours" inclut aussi les paiements des 7 premiers jours.
          Seules les échéances non encore payées sont comptées.
        </p>
      </div>
    </div>
  );
}
