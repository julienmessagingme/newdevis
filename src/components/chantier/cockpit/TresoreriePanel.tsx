/**
 * TresoreriePanel — module financier complet du cockpit chantier.
 *
 * Onglets :
 *   📅 Échéancier  — timeline de paiement trié + statuts
 *   📊 Trésorerie  — jauge budget réel + projection cashflow + alertes
 *   💳 Financement — simulateur crédit immobilier / travaux
 */
import { useState, useMemo } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, Calendar, TrendingUp, CreditCard,
  ChevronRight, Loader2, RefreshCw, AlertCircle, Check, X, RotateCcw,
  FileText, Info,
} from 'lucide-react';
import {
  usePaymentEvents,
  computeAlerts,
  computeCashflow,
  computeTotalEngaged,
  type PaymentAlert,
} from '@/hooks/usePaymentEvents';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

const fmtEurPrecis = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function fmtDateFR(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function fmtDateShort(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short',
  });
}

function daysUntil(iso: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(iso + 'T00:00:00');
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

type Tab = 'timeline' | 'cashflow' | 'financement';

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'timeline',    label: 'Échéancier',  icon: <Calendar  className="h-3.5 w-3.5" /> },
    { id: 'cashflow',    label: 'Trésorerie',  icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { id: 'financement', label: 'Financement', icon: <CreditCard className="h-3.5 w-3.5" /> },
  ];
  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-all ${
            active === t.id
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.icon}
          <span className="hidden sm:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  paid:      { dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100', label: 'Payé ✓',    icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> },
  late:      { dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700 border-red-100',             label: 'En retard', icon: <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> },
  pending:   { dot: 'bg-blue-400',    badge: 'bg-blue-50 text-blue-700 border-blue-100',           label: 'À venir',   icon: <Clock className="h-3.5 w-3.5 text-blue-500" /> },
  cancelled: { dot: 'bg-gray-300',    badge: 'bg-gray-50 text-gray-400 border-gray-100',           label: 'Annulé',    icon: null },
};

function PaymentTimeline({
  chantierId,
  token,
}: {
  chantierId: string;
  token: string;
}) {
  const { events, loading, error, refresh, markPaid, markUnpaid } = usePaymentEvents(chantierId, token);

  // Quel event est en attente de confirmation "marquer payé" ?
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">Chargement de l'échéancier…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-gray-500">{error}</p>
        <button onClick={refresh}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-semibold">
          <RefreshCw className="h-3.5 w-3.5" /> Réessayer
        </button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
          <Calendar className="h-5 w-5 text-blue-400" />
        </div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Aucune échéance pour l'instant</p>
        <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
          Les conditions de paiement de vos devis et factures seront analysées ici automatiquement.
        </p>
      </div>
    );
  }

  // KPI globaux
  const paidTotal = events.filter(e => e.status === 'paid').reduce((s, e) => s + (e.amount ?? 0), 0);
  const lateTotal = events.filter(e => e.status === 'late').reduce((s, e) => s + (e.amount ?? 0), 0);
  const pendingTotal = events.filter(e => e.status === 'pending').reduce((s, e) => s + (e.amount ?? 0), 0);

  // Groupe par mois
  const grouped = events.reduce<Record<string, typeof events>>((acc, ev) => {
    const key = ev.due_date
      ? new Date(ev.due_date + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      : 'Sans date';
    acc[key] = [...(acc[key] ?? []), ev];
    return acc;
  }, {});

  return (
    <div className="space-y-5">

      {/* ── Intro pédagogique ── */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex gap-2.5">
        <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 leading-relaxed">
          Cet échéancier regroupe <strong>tous les acomptes et règlements</strong> extraits de vos devis validés.
          Cochez ✓ une ligne pour la marquer comme payée.
        </p>
      </div>

      {/* ── KPI résumé ── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-0.5">Payé</p>
          <p className="text-base font-extrabold text-emerald-700">{paidTotal > 0 ? fmtEur(paidTotal) : '—'}</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-0.5">À venir</p>
          <p className="text-base font-extrabold text-blue-700">{pendingTotal > 0 ? fmtEur(pendingTotal) : '—'}</p>
        </div>
        {lateTotal > 0 ? (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
            <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-0.5">En retard</p>
            <p className="text-base font-extrabold text-red-700">{fmtEur(lateTotal)}</p>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Retard</p>
            <p className="text-base font-extrabold text-gray-400">—</p>
          </div>
        )}
      </div>

      {/* ── Liste groupée par mois ── */}
      {Object.entries(grouped).map(([month, evts]) => (
        <div key={month}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
            {month}
          </p>
          <div className="bg-white border border-gray-100 rounded-2xl divide-y divide-gray-50 overflow-hidden shadow-sm">
            {evts.map(ev => {
              const cfg    = STATUS_CFG[ev.status] ?? STATUS_CFG.pending;
              const isLate = ev.status === 'late';
              const isPaid = ev.status === 'paid';
              const days   = ev.due_date ? daysUntil(ev.due_date) : null;
              const isConfirming = confirmingId === ev.id;

              // Libellé du délai
              let delayLabel = '';
              if (ev.due_date && !isPaid) {
                if (isLate) {
                  delayLabel = `En retard de ${Math.abs(days!)} j`;
                } else if (days === 0) {
                  delayLabel = "Aujourd'hui";
                } else if (days === 1) {
                  delayLabel = 'Demain';
                } else if (days !== null && days <= 7) {
                  delayLabel = `Dans ${days} jours`;
                }
              }

              return (
                <div key={ev.id}
                  className={`px-4 py-3.5 ${isLate ? 'bg-red-50/40' : isPaid ? 'bg-emerald-50/30' : ''}`}>

                  <div className="flex items-start gap-3">
                    {/* Dot statut */}
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${cfg.dot}`} />

                    {/* Contenu principal */}
                    <div className="flex-1 min-w-0">
                      {/* Ligne 1 : label + montant */}
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`text-sm font-semibold leading-tight ${isPaid ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                          {ev.label}
                        </p>
                        {ev.amount !== null && (
                          <span className={`text-sm font-bold tabular-nums shrink-0 ${
                            isLate ? 'text-red-700' : isPaid ? 'text-gray-400' : 'text-gray-900'
                          }`}>
                            {fmtEur(ev.amount)}
                          </span>
                        )}
                      </div>

                      {/* Ligne 2 : artisan + lot/document source */}
                      {(ev.artisan_nom || ev.lot_nom || ev.source_name) && (
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {ev.artisan_nom ? (
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                              isPaid ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-700'
                            }`}>
                              🔧 {ev.artisan_nom}
                            </span>
                          ) : ev.lot_nom ? (
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                              isPaid ? 'bg-gray-100 text-gray-400' : 'bg-slate-100 text-slate-600'
                            }`}>
                              🔧 {ev.lot_nom}
                            </span>
                          ) : null}
                          {ev.source_name && (
                            <span className="text-[10px] text-gray-400 truncate max-w-[160px]">
                              {ev.source_name.replace(/\.(pdf|PDF)$/, '')}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Ligne 3 : date + badge + délai */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                        {/* Date */}
                        {ev.due_date && (
                          <span className={`text-[11px] font-medium ${isLate ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                            {fmtDateFR(ev.due_date)}
                          </span>
                        )}

                        {/* Badge statut */}
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cfg.badge}`}>
                          {cfg.label}
                        </span>

                        {/* Urgence */}
                        {delayLabel && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            isLate
                              ? 'bg-red-100 text-red-700'
                              : days !== null && days <= 3
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-gray-100 text-gray-500'
                          }`}>
                            {delayLabel}
                          </span>
                        )}
                      </div>

                      {/* Confirmation marquer payé */}
                      {isConfirming && (
                        <div className="mt-2.5 flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                          <p className="text-xs font-semibold text-emerald-700 flex-1">
                            Confirmer le paiement de {ev.amount !== null ? fmtEur(ev.amount) : 'cette échéance'} ?
                          </p>
                          <button
                            onClick={() => { markPaid(ev.id); setConfirmingId(null); }}
                            className="flex items-center gap-1 text-xs font-bold bg-emerald-600 text-white rounded-lg px-2.5 py-1.5 hover:bg-emerald-700 transition-colors"
                          >
                            <Check className="h-3 w-3" /> Oui, payé
                          </button>
                          <button
                            onClick={() => setConfirmingId(null)}
                            className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors"
                          >
                            <X className="h-3 w-3" /> Annuler
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      {/* Marquer payé */}
                      {(ev.status === 'pending' || ev.status === 'late') && !isConfirming && (
                        <button
                          onClick={() => setConfirmingId(ev.id)}
                          title="Marquer comme payé"
                          className="p-1.5 rounded-lg text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      {/* Annuler confirmation */}
                      {isConfirming && (
                        <button
                          onClick={() => setConfirmingId(null)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-all"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                      {/* Repasser en "À venir" */}
                      {isPaid && (
                        <button
                          onClick={() => markUnpaid(ev.id)}
                          title="Annuler ce paiement (repasser en À venir)"
                          className="p-1.5 rounded-lg text-gray-200 hover:text-amber-500 hover:bg-amber-50 transition-all"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <button onClick={refresh}
        className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 py-2 transition-colors">
        <RefreshCw className="h-3 w-3" /> Actualiser
      </button>
    </div>
  );
}

// ── Alertes intelligentes ─────────────────────────────────────────────────────

const ALERT_CFG: Record<PaymentAlert['type'], { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  late:   { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-800',   icon: <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" /> },
  soon:   { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', icon: <Clock className="h-4 w-4 text-amber-500 shrink-0" /> },
  budget: { bg: 'bg-orange-50',border: 'border-orange-200',text: 'text-orange-800',icon: <AlertCircle className="h-4 w-4 text-orange-500 shrink-0" /> },
};

function AlertsPanel({ alerts }: { alerts: PaymentAlert[] }) {
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

// ── Jauge budget réel ─────────────────────────────────────────────────────────

function BudgetGaugeReal({
  totalEngaged,
  totalPaid,
  budgetMax,
  lateAmount,
}: {
  totalEngaged: number;
  totalPaid: number;
  budgetMax: number;
  lateAmount: number;
}) {
  const ref     = budgetMax > 0 ? budgetMax : (totalEngaged || 1);
  const paidPct = Math.min((totalPaid    / ref) * 100, 100);
  const engPct  = Math.min((totalEngaged / ref) * 100, 100);
  const isOver  = totalEngaged > ref && budgetMax > 0;
  const remaining = budgetMax > 0 ? Math.max(0, budgetMax - totalEngaged) : null;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 text-sm">Budget total engagé</h3>
        {budgetMax > 0 && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
            isOver
              ? 'bg-red-50 text-red-600 border-red-100'
              : 'bg-gray-50 text-gray-500 border-gray-100'
          }`}>
            Enveloppe max · {fmtEur(budgetMax)}
          </span>
        )}
      </div>

      {/* Barre */}
      <div className="space-y-1.5">
        <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="absolute left-0 h-full bg-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${paidPct}%` }}
          />
          {engPct > paidPct && (
            <div
              className={`absolute h-full rounded-full transition-all duration-700 ${isOver ? 'bg-red-400' : 'bg-blue-400'}`}
              style={{ left: `${paidPct}%`, width: `${engPct - paidPct}%` }}
            />
          )}
        </div>
        {/* Légende de la barre */}
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Payé</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Engagé (reste à payer)</span>
          {budgetMax > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200 inline-block" /> Budget disponible</span>}
        </div>
      </div>

      {/* 3 KPI */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl py-2.5 px-2">
          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-0.5">Payé</p>
          <p className="text-base font-extrabold text-emerald-700">{totalPaid > 0 ? fmtEur(totalPaid) : '—'}</p>
          <p className="text-[10px] text-emerald-400 mt-0.5">versé aux artisans</p>
        </div>
        <div className={`border rounded-xl py-2.5 px-2 ${isOver ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isOver ? 'text-red-500' : 'text-blue-500'}`}>
            Engagé
          </p>
          <p className={`text-base font-extrabold ${isOver ? 'text-red-700' : 'text-blue-700'}`}>
            {totalEngaged > 0 ? fmtEur(totalEngaged) : '—'}
          </p>
          <p className={`text-[10px] mt-0.5 ${isOver ? 'text-red-400' : 'text-blue-400'}`}>total devis signés</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl py-2.5 px-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Restant</p>
          <p className="text-base font-extrabold text-gray-700">
            {remaining !== null ? fmtEur(remaining) : '—'}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {remaining !== null ? 'budget non engagé' : 'budget non défini'}
          </p>
        </div>
      </div>

      {/* Explication "Engagé" */}
      <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 flex gap-2">
        <Info className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-500 leading-relaxed">
          <strong className="text-gray-600">Engagé</strong> = somme de tous vos devis validés (acomptes déjà versés + ce qui reste à payer).
          {lateAmount > 0 && (
            <span className="text-red-600 font-semibold"> Dont {fmtEur(lateAmount)} en retard de paiement.</span>
          )}
        </p>
      </div>
    </div>
  );
}

// ── Projection cashflow ───────────────────────────────────────────────────────

function CashflowProjection({
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

  const active = events.filter(e => !e.is_override && e.status !== 'cancelled' && e.status !== 'paid' && e.due_date);

  const evts7  = active.filter(e => e.due_date! >= today && e.due_date! <= d7.toISOString().slice(0, 10));
  const evts30 = active.filter(e => e.due_date! >= today && e.due_date! <= d30.toISOString().slice(0, 10));
  const evts60 = active.filter(e => e.due_date! >= today && e.due_date! <= d60.toISOString().slice(0, 10));

  const rows: { key: '7' | '30' | '60'; label: string; sublabel: string; value: number; color: string; bg: string; evts: typeof active }[] = [
    { key: '7',  label: '7 prochains jours',  sublabel: 'Paiements urgents',    value: next7,  color: 'bg-red-400',    bg: 'bg-red-50',    evts: evts7  },
    { key: '30', label: '30 prochains jours', sublabel: 'Ce mois-ci',          value: next30, color: 'bg-amber-400',  bg: 'bg-amber-50',  evts: evts30 },
    { key: '60', label: '60 prochains jours', sublabel: 'Dans les 2 mois',     value: next60, color: 'bg-blue-400',   bg: 'bg-blue-50',   evts: evts60 },
  ];

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">Prévision de dépenses</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">Montants restant à verser par période</p>
        </div>
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
                  <span className="text-[10px] text-gray-400">
                    {expanded === row.key ? '▲' : '▼'}
                  </span>
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

          {/* Détail des paiements */}
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

// ── Onglet Trésorerie complet ─────────────────────────────────────────────────

function CashflowTab({
  chantierId,
  token,
  budgetMax,
}: {
  chantierId: string;
  token: string;
  budgetMax: number;
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
        <button onClick={refresh} className="flex items-center gap-1.5 text-xs text-blue-600 font-semibold">
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
      />
      <CashflowProjection
        next7={cashflow.next7}
        next30={cashflow.next30}
        next60={cashflow.next60}
        events={events}
      />
    </div>
  );
}

// ── Simulateur de financement ─────────────────────────────────────────────────

function SliderField({ label, value, min, max, step, onChange, display }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>
        <span className="text-sm font-extrabold text-blue-700 tabular-nums bg-blue-50 px-2.5 py-1 rounded-lg">{display}</span>
      </div>
      <div className="relative h-6 flex items-center">
        <div className="absolute w-full h-2 rounded-full bg-gray-200" />
        <div
          className="absolute h-2 rounded-full bg-blue-500 pointer-events-none"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="relative w-full h-2 appearance-none bg-transparent cursor-pointer"
          style={{ WebkitAppearance: 'none' }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-300 font-medium">
        <span>{min}{label.includes('Taux') ? ' %' : label.includes('Durée') ? ' mois' : ' €'}</span>
        <span>{max}{label.includes('Taux') ? ' %' : label.includes('Durée') ? ' mois' : ' €'}</span>
      </div>
    </div>
  );
}

function FinancingSimulator() {
  const [montant, setMontant] = useState('');
  const [duree,   setDuree]   = useState(120);
  const [taux,    setTaux]    = useState(3.5);

  const result = useMemo(() => {
    const M = parseFloat(montant);
    const n = duree;
    const t = taux / 100;
    if (!M || M <= 0 || n <= 0) return null;
    if (t === 0) {
      const mensualite = M / n;
      return { mensualite, coutTotal: M, interets: 0 };
    }
    const r = t / 12;
    const mensualite = M * r / (1 - Math.pow(1 + r, -n));
    const coutTotal  = mensualite * n;
    return { mensualite, coutTotal, interets: coutTotal - M };
  }, [montant, duree, taux]);

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3.5">
        <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">Simulateur crédit travaux</p>
        <p className="text-xs text-blue-700 leading-relaxed">
          Estimez vos mensualités pour financer votre chantier par emprunt.
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Montant à financer</label>
        </div>
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
          <input
            type="number"
            value={montant}
            onChange={e => setMontant(e.target.value)}
            placeholder="ex : 30 000"
            min="1000"
            className="flex-1 bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-300 placeholder:font-normal"
          />
          <span className="text-xs font-bold text-gray-400 shrink-0">€</span>
        </div>
      </div>

      <SliderField
        label="Durée de remboursement"
        value={duree} min={1} max={360} step={1}
        onChange={setDuree} display={`${duree} mois`}
      />
      <SliderField
        label="Taux annuel"
        value={taux} min={0.5} max={12} step={0.1}
        onChange={setTaux} display={`${taux.toFixed(1)} %`}
      />

      {result ? (
        <div className="grid grid-cols-1 gap-3">
          <div className="bg-blue-600 rounded-2xl p-5 text-center text-white">
            <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">Mensualité estimée</p>
            <p className="text-4xl font-extrabold leading-none">{fmtEurPrecis(result.mensualite)}</p>
            <p className="text-xs opacity-60 mt-1">par mois pendant {duree} mois</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Coût total</p>
              <p className="text-lg font-extrabold text-gray-900">{fmtEur(result.coutTotal)}</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1">Intérêts</p>
              <p className="text-lg font-extrabold text-amber-700">{fmtEur(result.interets)}</p>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 text-center leading-relaxed border-t border-gray-50 pt-3">
            Simulation indicative. Consultez votre banque ou un courtier pour une offre personnalisée.
          </p>
        </div>
      ) : (
        <div className="text-center py-6">
          <CreditCard className="h-8 w-8 text-gray-200 mx-auto mb-2" />
          <p className="text-xs text-gray-400">Saisissez le montant pour simuler votre emprunt</p>
        </div>
      )}
    </div>
  );
}

// ── Composant principal exporté ───────────────────────────────────────────────

interface TresoreeriePanelProps {
  chantierId: string;
  token: string;
  budgetMax?: number;
}

export default function TresoreriePanel({ chantierId, token, budgetMax = 0 }: TresoreeriePanelProps) {
  const [tab, setTab] = useState<Tab>('timeline');

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-gray-50">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </div>
          <h2 className="font-bold text-gray-900 text-base">Budget & Trésorerie</h2>
        </div>
        <TabBar active={tab} onChange={setTab} />
      </div>

      <div className="p-5">
        {tab === 'timeline'    && <PaymentTimeline    chantierId={chantierId} token={token} />}
        {tab === 'cashflow'    && <CashflowTab        chantierId={chantierId} token={token} budgetMax={budgetMax} />}
        {tab === 'financement' && <FinancingSimulator />}
      </div>
    </div>
  );
}
