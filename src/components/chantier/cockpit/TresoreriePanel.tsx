/**
 * TresoreriePanel — module financier complet du cockpit chantier.
 *
 * Onglets :
 *   📅 Timeline    — échéancier de paiement trié + statuts
 *   📊 Trésorerie  — jauge budget réel + projection cashflow + alertes
 *   💳 Financement — simulateur crédit immobilier / travaux
 */
import { useState, useMemo } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, Calendar, TrendingUp, CreditCard,
  ChevronRight, Loader2, RefreshCw, AlertCircle, Check,
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

function fmtDateFR(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
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
  paid:      { dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100', label: 'Payé',      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> },
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
  const { events, loading, error, refresh, markPaid } = usePaymentEvents(chantierId, token);

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
          Les conditions de paiement de vos devis et factures analyseront ici automatiquement.
        </p>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

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
      {/* KPI en retard */}
      {(() => {
        const lateCount = events.filter(e => e.status === 'late').length;
        const lateTotal = events.filter(e => e.status === 'late').reduce((s, e) => s + (e.amount ?? 0), 0);
        const paidTotal = events.filter(e => e.status === 'paid').reduce((s, e) => s + (e.amount ?? 0), 0);
        if (!lateCount && !paidTotal) return null;
        return (
          <div className="grid grid-cols-2 gap-3">
            {paidTotal > 0 && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Payé</p>
                <p className="text-lg font-extrabold text-emerald-700">{fmtEur(paidTotal)}</p>
              </div>
            )}
            {lateCount > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">En retard</p>
                <p className="text-lg font-extrabold text-red-700">{fmtEur(lateTotal)}</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Liste groupée par mois */}
      {Object.entries(grouped).map(([month, evts]) => (
        <div key={month}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
            {month}
          </p>
          <div className="bg-white border border-gray-100 rounded-2xl divide-y divide-gray-50 overflow-hidden">
            {evts.map(ev => {
              const cfg = STATUS_CFG[ev.status] ?? STATUS_CFG.pending;
              const isLate = ev.status === 'late';
              return (
                <div key={ev.id}
                  className={`flex items-center gap-3 px-4 py-3.5 ${isLate ? 'bg-red-50/40' : ''}`}>
                  {/* Dot statut */}
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />

                  {/* Contenu */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate leading-tight">{ev.label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {ev.due_date && (
                        <span className={`text-xs ${isLate ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                          {fmtDateFR(ev.due_date)}
                          {isLate && ' — RETARD'}
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>

                  {/* Montant */}
                  <div className="flex items-center gap-2 shrink-0">
                    {ev.amount !== null && (
                      <span className={`text-sm font-bold tabular-nums ${isLate ? 'text-red-700' : 'text-gray-900'}`}>
                        {fmtEur(ev.amount)}
                      </span>
                    )}
                    {/* Bouton marquer payé */}
                    {(ev.status === 'pending' || ev.status === 'late') && (
                      <button
                        onClick={() => markPaid(ev.id)}
                        title="Marquer comme payé"
                        className="p-1.5 rounded-lg text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
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
}: {
  totalEngaged: number;
  totalPaid: number;
  budgetMax: number;
}) {
  const ref     = budgetMax > 0 ? budgetMax : (totalEngaged || 1);
  const paidPct = Math.min((totalPaid    / ref) * 100, 100);
  const engPct  = Math.min((totalEngaged / ref) * 100, 100);
  const isOver  = totalEngaged > ref && budgetMax > 0;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 text-sm">Budget engagé</h3>
        {budgetMax > 0 && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
            isOver
              ? 'bg-red-50 text-red-600 border-red-100'
              : 'bg-gray-50 text-gray-500 border-gray-100'
          }`}>
            Max · {fmtEur(budgetMax)}
          </span>
        )}
      </div>

      {/* Barre */}
      <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
        {/* Payé */}
        <div
          className="absolute left-0 h-full bg-emerald-400 rounded-full transition-all duration-700"
          style={{ width: `${paidPct}%` }}
        />
        {/* Engagé non payé */}
        {engPct > paidPct && (
          <div
            className={`absolute h-full rounded-full transition-all duration-700 ${isOver ? 'bg-red-400' : 'bg-blue-400'}`}
            style={{ left: `${paidPct}%`, width: `${engPct - paidPct}%` }}
          />
        )}
      </div>

      {/* Légende */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl py-2.5 px-3">
          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-0.5">Payé</p>
          <p className="text-base font-extrabold text-emerald-700">{totalPaid > 0 ? fmtEur(totalPaid) : '—'}</p>
        </div>
        <div className={`border rounded-xl py-2.5 px-3 ${isOver ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isOver ? 'text-red-500' : 'text-blue-500'}`}>
            Engagé
          </p>
          <p className={`text-base font-extrabold ${isOver ? 'text-red-700' : 'text-blue-700'}`}>
            {totalEngaged > 0 ? fmtEur(totalEngaged) : '—'}
          </p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl py-2.5 px-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Restant</p>
          <p className="text-base font-extrabold text-gray-700">
            {budgetMax > 0 ? fmtEur(Math.max(0, budgetMax - totalEngaged)) : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Projection cashflow ───────────────────────────────────────────────────────

function CashflowProjection({ next7, next30, next60 }: { next7: number; next30: number; next60: number }) {
  const max = Math.max(next7, next30, next60, 1);

  const rows: { label: string; days: string; value: number; color: string; bg: string }[] = [
    { label: '7 prochains jours',  days: 'J+7',  value: next7,  color: 'bg-red-400',    bg: 'bg-red-50'    },
    { label: '30 prochains jours', days: 'J+30', value: next30, color: 'bg-amber-400',  bg: 'bg-amber-50'  },
    { label: '60 prochains jours', days: 'J+60', value: next60, color: 'bg-blue-400',   bg: 'bg-blue-50'   },
  ];

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
      <h3 className="font-semibold text-gray-900 text-sm">Projection trésorerie</h3>
      {rows.map(row => (
        <div key={row.days} className={`${row.bg} rounded-xl px-4 py-3 space-y-1.5`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">{row.label}</span>
            <span className="text-sm font-extrabold text-gray-900 tabular-nums">
              {row.value > 0 ? fmtEur(row.value) : <span className="text-gray-300 font-normal text-xs">Rien</span>}
            </span>
          </div>
          {row.value > 0 && (
            <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
              <div
                className={`h-full ${row.color} rounded-full transition-all duration-700`}
                style={{ width: `${(row.value / max) * 100}%` }}
              />
            </div>
          )}
        </div>
      ))}
      {next30 === 0 && (
        <p className="text-xs text-gray-400 text-center pt-1">
          Aucun paiement à prévoir dans les 60 prochains jours
        </p>
      )}
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
      <BudgetGaugeReal totalEngaged={totalEngaged} totalPaid={totalPaid} budgetMax={budgetMax} />
      <CashflowProjection next7={cashflow.next7} next30={cashflow.next30} next60={cashflow.next60} />
    </div>
  );
}

// ── Simulateur de financement ─────────────────────────────────────────────────

function FinancingSimulator() {
  const [montant,  setMontant]  = useState('');
  const [duree,    setDuree]    = useState('120');
  const [taux,     setTaux]     = useState('3.5');

  const result = useMemo(() => {
    const M = parseFloat(montant);
    const n = parseInt(duree, 10);
    const t = parseFloat(taux) / 100;

    if (!M || M <= 0 || !n || n <= 0 || isNaN(t) || t < 0) return null;

    if (t === 0) {
      const mensualite = M / n;
      return { mensualite, coutTotal: M, interets: 0 };
    }

    const r = t / 12; // taux mensuel
    const mensualite = M * r / (1 - Math.pow(1 + r, -n));
    const coutTotal  = mensualite * n;
    const interets   = coutTotal - M;

    return { mensualite, coutTotal, interets };
  }, [montant, duree, taux]);

  const InputField = ({
    label, value, onChange, suffix, placeholder, min, max,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    suffix: string;
    placeholder: string;
    min?: string;
    max?: string;
  }) => (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          min={min}
          max={max}
          step="any"
          className="flex-1 bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-300 placeholder:font-normal"
        />
        <span className="text-xs font-bold text-gray-400 shrink-0">{suffix}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3.5">
        <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">Simulateur crédit travaux</p>
        <p className="text-xs text-blue-700 leading-relaxed">
          Estimez vos mensualités pour financer votre chantier par emprunt.
        </p>
      </div>

      {/* Inputs */}
      <div className="space-y-3">
        <InputField
          label="Montant à financer"
          value={montant}
          onChange={setMontant}
          suffix="€"
          placeholder="ex : 30 000"
          min="1000"
        />
        <InputField
          label="Durée de remboursement"
          value={duree}
          onChange={setDuree}
          suffix="mois"
          placeholder="ex : 120"
          min="6"
          max="360"
        />
        <InputField
          label="Taux annuel"
          value={taux}
          onChange={setTaux}
          suffix="%"
          placeholder="ex : 3,5"
          min="0"
          max="30"
        />
      </div>

      {/* Résultat */}
      {result ? (
        <div className="grid grid-cols-1 gap-3">
          {/* Mensualité — mise en avant */}
          <div className="bg-blue-600 rounded-2xl p-5 text-center text-white">
            <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">Mensualité estimée</p>
            <p className="text-4xl font-extrabold leading-none">{fmtEur(result.mensualite)}</p>
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
        </div>
      ) : (
        <div className="text-center py-6">
          <CreditCard className="h-8 w-8 text-gray-200 mx-auto mb-2" />
          <p className="text-xs text-gray-400">Renseignez les paramètres ci-dessus pour simuler votre emprunt</p>
        </div>
      )}

      {/* Disclaimer */}
      {result && (
        <p className="text-[10px] text-gray-400 text-center leading-relaxed border-t border-gray-50 pt-3">
          Simulation indicative. Consultez votre banque ou un courtier pour une offre personnalisée.
        </p>
      )}
    </div>
  );
}

// ── Composant principal exporté ───────────────────────────────────────────────

interface TresoreeriePanelProps {
  chantierId: string;
  token: string;
  budgetMax?: number;          // enveloppe max pour la jauge
}

export default function TresoreriePanel({ chantierId, token, budgetMax = 0 }: TresoreeriePanelProps) {
  const [tab, setTab] = useState<Tab>('timeline');

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-gray-50">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </div>
          <h2 className="font-bold text-gray-900 text-base">Budget & Trésorerie</h2>
        </div>
        <TabBar active={tab} onChange={setTab} />
      </div>

      {/* Contenu */}
      <div className="p-5">
        {tab === 'timeline'    && <PaymentTimeline    chantierId={chantierId} token={token} />}
        {tab === 'cashflow'    && <CashflowTab        chantierId={chantierId} token={token} budgetMax={budgetMax} />}
        {tab === 'financement' && <FinancingSimulator />}
      </div>
    </div>
  );
}
