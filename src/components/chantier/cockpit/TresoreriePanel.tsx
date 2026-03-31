/**
 * TresoreriePanel — cockpit financier premium du chantier.
 *
 * ① Hero    — situation globale en 3 secondes (computed from real payment events)
 * ② Onglets — Échéancier · Trésorerie · Financement
 */
import { useState, useRef, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Calendar, TrendingUp, CreditCard, Check, Zap } from 'lucide-react';
import PaymentTimeline from './PaymentTimeline';
import CashflowTab from './CashflowTab';
import FinancementTab from './financing/FinancementTab';
import type { SourceKey } from './FinancingSources';
import type { SimulationData } from './financing/AidesTravaux';
import {
  usePaymentEvents,
  computeAlerts,
  type PaymentEvent,
} from '@/hooks/usePaymentEvents';
import { fmtEur, daysUntil } from '@/lib/financingUtils';

// ── Supabase (token refresh) ──────────────────────────────────────────────────

const _supabase = createClient(
  (import.meta as any).env.PUBLIC_SUPABASE_URL,
  (import.meta as any).env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
async function getFreshBearerToken(fallback: string): Promise<string> {
  try {
    const { data: { session } } = await _supabase.auth.getSession();
    return session?.access_token ?? fallback;
  } catch {
    return fallback;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeHeroStatus(events: PaymentEvent[], budgetMax: number): {
  level: 'ok' | 'warn' | 'danger';
  label: string;
  message: string;
} {
  const today = new Date().toISOString().slice(0, 10);
  const in7   = new Date(); in7.setDate(in7.getDate() + 7);
  const in7S  = in7.toISOString().slice(0, 10);

  const active = events.filter(e => e.status !== 'cancelled');
  const lateEvts = active.filter(e => e.status === 'late');
  const soonEvts = active.filter(
    e => e.status === 'pending' && e.due_date && e.due_date >= today && e.due_date <= in7S,
  );

  if (lateEvts.length > 0) {
    const total = lateEvts.reduce((s, e) => s + (e.amount ?? 0), 0);
    return {
      level: 'danger',
      label: 'Paiement en retard',
      message: `${lateEvts.length} paiement${lateEvts.length > 1 ? 's' : ''} en retard — ${fmtEur(total)} à régulariser`,
    };
  }
  if (soonEvts.length > 0) {
    const next = soonEvts.sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))[0];
    const days = next.due_date ? daysUntil(next.due_date) : null;
    const dayLabel = days === 0 ? "aujourd'hui" : days === 1 ? 'demain' : `dans ${days} jours`;
    return {
      level: 'warn',
      label: `Échéance ${dayLabel}`,
      message: `${soonEvts.length} paiement${soonEvts.length > 1 ? 's' : ''} à venir dans les 7 jours`,
    };
  }
  const totalEngaged = active.filter(e => e.status !== 'paid').reduce((s, e) => s + (e.amount ?? 0), 0);
  if (budgetMax > 0 && totalEngaged > budgetMax * 0.9) {
    return { level: 'warn', label: 'Budget sous surveillance', message: 'Vous avez engagé plus de 90 % de votre enveloppe' };
  }
  return { level: 'ok', label: 'Tout est sous contrôle', message: 'Aucun retard ni tension de trésorerie détectés' };
}

function nextDueEvent(events: PaymentEvent[]): PaymentEvent | null {
  const today = new Date().toISOString().slice(0, 10);
  const pending = events
    .filter(e => (e.status === 'pending' || e.status === 'late') && e.due_date)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
  // late first, otherwise nearest
  return pending[0] ?? null;
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

type Tab = 'timeline' | 'cashflow' | 'financement';

function TabBar({ active, onChange, lateCount }: {
  active: Tab;
  onChange: (t: Tab) => void;
  lateCount: number;
}) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'timeline',    label: 'Échéancier',  icon: <Calendar className="h-3.5 w-3.5" /> },
    { id: 'cashflow',    label: 'Trésorerie',  icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { id: 'financement', label: 'Financement', icon: <CreditCard className="h-3.5 w-3.5" /> },
  ];
  return (
    <div className="flex gap-0 px-5 border-b border-gray-100">
      {tabs.map(t => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)}
          className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            active === t.id
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}>
          {t.icon}
          {t.label}
          {t.id === 'timeline' && lateCount > 0 && (
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
              {lateCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function HeroSituation({
  events,
  budgetMax,
  loading,
}: {
  events: PaymentEvent[];
  budgetMax: number;
  loading: boolean;
}) {
  const status = useMemo(() => computeHeroStatus(events, budgetMax), [events, budgetMax]);
  const next   = useMemo(() => nextDueEvent(events), [events]);

  const totalPaid      = useMemo(() => events.filter(e => e.status === 'paid').reduce((s, e) => s + (e.amount ?? 0), 0), [events]);
  const totalRemaining = useMemo(() => events.filter(e => e.status === 'pending' || e.status === 'late').reduce((s, e) => s + (e.amount ?? 0), 0), [events]);
  const lateAmount     = useMemo(() => events.filter(e => e.status === 'late').reduce((s, e) => s + (e.amount ?? 0), 0), [events]);
  const lateCount      = useMemo(() => events.filter(e => e.status === 'late').length, [events]);

  // Progression globale (0-100)
  const total    = totalPaid + totalRemaining;
  const progress = total > 0 ? Math.round((totalPaid / total) * 100) : 0;

  const nextLabel = next
    ? (next.artisan_nom ?? next.lot_nom ?? next.label)
    : null;
  const nextAmt   = next?.amount ?? null;
  const nextDate  = next?.due_date
    ? new Date(next.due_date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    : null;

  // Couleurs status
  const statusColors = {
    ok:     { pill: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
    warn:   { pill: 'bg-amber-500/20 text-amber-300 border-amber-500/30',       dot: 'bg-amber-400' },
    danger: { pill: 'bg-red-500/20 text-red-300 border-red-500/30',             dot: 'bg-red-400' },
  };
  const sc = statusColors[status.level];

  return (
    <div className="relative overflow-hidden rounded-none" style={{
      background: 'linear-gradient(135deg, #0c1421 0%, #162236 55%, #0c1d30 100%)',
    }}>
      {/* Glow décoratif */}
      <div className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(0,180,120,.16) 0%, transparent 65%)' }} />

      <div className="px-5 pt-5 pb-4 space-y-4">

        {/* Pill statut */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${sc.pill}`}>
          <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${sc.dot}`} />
          {loading ? 'Chargement…' : status.label}
        </div>

        {/* KPIs */}
        {loading ? (
          <div className="grid grid-cols-3 gap-3">
            {[0,1,2].map(i => (
              <div key={i} className="bg-white/6 rounded-xl p-3 animate-pulse">
                <div className="h-2 bg-white/10 rounded mb-2 w-16" />
                <div className="h-5 bg-white/15 rounded w-20" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/[.07] border border-white/10 rounded-xl p-3">
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Déjà payé</p>
              <p className={`text-lg font-black tracking-tight ${totalPaid > 0 ? 'text-emerald-300' : 'text-white/40'}`}>
                {totalPaid > 0 ? fmtEur(totalPaid) : '—'}
              </p>
            </div>
            <div className="bg-white/[.07] border border-white/10 rounded-xl p-3">
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Reste à payer</p>
              <p className={`text-lg font-black tracking-tight ${lateAmount > 0 ? 'text-red-300' : totalRemaining > 0 ? 'text-amber-200' : 'text-white/40'}`}>
                {totalRemaining > 0 ? fmtEur(totalRemaining) : '—'}
              </p>
            </div>
            <div className="bg-white/[.07] border border-white/10 rounded-xl p-3">
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Prochaine éch.</p>
              {next ? (
                <>
                  <p className={`text-lg font-black tracking-tight ${next.status === 'late' ? 'text-red-300' : 'text-white'}`}>
                    {nextAmt ? fmtEur(nextAmt) : '—'}
                  </p>
                  {nextDate && <p className="text-[9px] text-white/35 mt-0.5 truncate">{nextLabel} · {nextDate}</p>}
                </>
              ) : (
                <p className="text-lg font-black tracking-tight text-white/40">—</p>
              )}
            </div>
          </div>
        )}

        {/* Barre de progression */}
        {!loading && total > 0 && (
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-white/35 font-semibold">Avancement paiements</span>
              <span className="text-[10px] text-white/50 font-bold">{progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #4ade80, #00bf8e)',
                }}
              />
            </div>
          </div>
        )}

        {/* Alerte retard */}
        {!loading && lateCount > 0 && (
          <div className="flex items-center gap-2.5 bg-red-500/15 border border-red-500/25 rounded-xl px-3 py-2.5">
            <Zap className="h-3.5 w-3.5 text-red-300 shrink-0" />
            <p className="text-xs text-red-200 font-medium flex-1">
              <span className="font-bold">{lateCount} paiement{lateCount > 1 ? 's' : ''} en retard</span>
              {lateAmount > 0 && ` — ${fmtEur(lateAmount)} à régulariser`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

interface TresoreeriePanelProps {
  chantierId: string;
  token: string;
  budgetMax?: number;
  initialFinancing?: Record<string, unknown> | null;
}

export default function TresoreriePanel({
  chantierId,
  token,
  budgetMax: budgetMaxProp = 0,
  initialFinancing,
}: TresoreeriePanelProps) {
  const [tab, setTab]                       = useState<Tab>('timeline');
  const [budgetOverride, setBudgetOverride] = useState<number | null>(null);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectiveBudget = budgetOverride ?? budgetMaxProp;

  // Données pour le Hero (appel léger, partagé avec les onglets enfants)
  const { events, loading: heroLoading } = usePaymentEvents(chantierId, token);
  const lateCount = useMemo(() => events.filter(e => e.status === 'late').length, [events]);

  // Financement
  const initAmounts = (initialFinancing?.amounts as Partial<Record<SourceKey, string>> | undefined) ?? {};
  const [financingAmounts, setFinancingAmounts] = useState<Record<SourceKey, string>>({
    apport:  initAmounts.apport  ?? '',
    credit:  initAmounts.credit  ?? '',
    maprime: initAmounts.maprime ?? '',
    cee:     initAmounts.cee     ?? '',
    eco_ptz: initAmounts.eco_ptz ?? '',
  });
  const [simulationData, setSimulationData] = useState<SimulationData | null>(
    (initialFinancing?.simulation as SimulationData | null | undefined) ?? null,
  );

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function persistFinancing(amounts: Record<SourceKey, string>, simulation: SimulationData | null) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const t = await getFreshBearerToken(token);
        const res = await fetch(`/api/chantier/${chantierId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ financing: { amounts, simulation } }),
        });
        if (res.ok) {
          setSavedIndicator(true);
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          savedTimerRef.current = setTimeout(() => setSavedIndicator(false), 2500);
        }
      } catch { /* non-bloquant */ }
    }, 300);
  }

  function handleSetFinancingAmounts(updater: React.SetStateAction<Record<SourceKey, string>>) {
    setFinancingAmounts(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persistFinancing(next, simulationData);
      return next;
    });
  }

  function handleImportAides(values: Partial<Record<SourceKey, string>>) {
    setFinancingAmounts(prev => {
      const next = { ...prev, ...values };
      persistFinancing(next, simulationData);
      return next;
    });
    setTab('cashflow');
  }

  function handleSimulationSave(data: SimulationData | null) {
    setSimulationData(data);
    persistFinancing(financingAmounts, data);
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">

      {/* ① Hero situation */}
      <HeroSituation events={events} budgetMax={effectiveBudget} loading={heroLoading} />

      {/* Header titre + badge sauvegarde */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Budget & Trésorerie</span>
        {savedIndicator && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
            <Check className="h-3 w-3" /> Sauvegardé
          </span>
        )}
      </div>

      {/* ② Tab bar */}
      <TabBar active={tab} onChange={setTab} lateCount={lateCount} />

      {/* ③ Contenu onglets */}
      <div className="p-5">
        {tab === 'timeline' && (
          <PaymentTimeline chantierId={chantierId} token={token} />
        )}
        {tab === 'cashflow' && (
          <CashflowTab
            chantierId={chantierId}
            token={token}
            budgetMax={effectiveBudget}
            onBudgetOverride={setBudgetOverride}
            financingAmounts={financingAmounts}
            setFinancingAmounts={handleSetFinancingAmounts}
          />
        )}
        {tab === 'financement' && (
          <FinancementTab
            onImportAides={handleImportAides}
            initialSimulation={simulationData}
            onSimulationSave={handleSimulationSave}
          />
        )}
      </div>
    </div>
  );
}
