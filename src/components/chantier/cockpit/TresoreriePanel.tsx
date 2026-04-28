/**
 * TresoreriePanel v3 — cockpit financier orienté décision.
 *
 * Onglet 1 (Trésorerie)  : Hero · Graph 60j · Capacité mensuelle · Actions · Artisans + Drawer
 * Onglet 2 (Échéancier)  : PaymentTimeline réel
 * Onglet 3 (Financement) : Sources budget + Simulateur crédit
 */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  TrendingUp, Calendar, CreditCard,
  AlertTriangle, CheckCircle2, Clock,
  ChevronRight, X, Check, Loader2, Paperclip,
  ArrowRight, Shield, Info, TrendingDown, Pencil, FileText, Download, UploadCloud,
} from 'lucide-react';
import PVReceptionModal from './PVReceptionModal';
import EcheancierRefonte from './EcheancierRefonte';
import BudgetTab from './BudgetTab';
import TresorerieView from './TresorerieView';
import type { SourceKey } from './FinancingSources';
import type { SimulationData } from './financing/AidesTravaux';
import {
  usePaymentEvents,
  type PaymentEvent,
} from '@/hooks/usePaymentEvents';
import { fmtEur, fmtDateShort, daysUntil } from '@/lib/financingUtils';

// ── Supabase ──────────────────────────────────────────────────────────────────

const _supabase = createClient(
  (import.meta as any).env.PUBLIC_SUPABASE_URL,
  (import.meta as any).env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface ArtisanSummary {
  nom: string;
  paid: number;
  late: number;
  pending: number;
  total: number;
  events: PaymentEvent[];
}

interface MonthlyData {
  revenus: number;
  charges: number;
}

type StatusLevel = 'equilibre' | 'tension' | 'risque';
type MensuelStatus = 'safe' | 'tension' | 'critique';

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByArtisan(events: PaymentEvent[]): ArtisanSummary[] {
  const map = new Map<string, ArtisanSummary>();
  for (const ev of events.filter(e => e.status !== 'cancelled')) {
    const key = ev.artisan_nom ?? ev.lot_nom ?? '—';
    if (!map.has(key)) map.set(key, { nom: key, paid: 0, late: 0, pending: 0, total: 0, events: [] });
    const a = map.get(key)!;
    const amt = ev.amount ?? 0;
    a.events.push(ev);
    a.total += amt;
    if (ev.status === 'paid')        a.paid    += amt;
    else if (ev.status === 'late')   { a.late += amt; a.pending += amt; }
    else if (ev.status === 'pending') a.pending += amt;
  }
  return [...map.values()]
    .filter(a => a.total > 0)
    .sort((a, b) => b.late - a.late || b.pending - a.pending || b.total - a.total);
}

function artisanStatusConfig(a: ArtisanSummary): { level: 'danger' | 'warn' | 'ok'; label: string } {
  if (a.late > 0) return { level: 'danger', label: 'En retard' };
  const today = new Date().toISOString().slice(0, 10);
  const in7   = new Date(); in7.setDate(in7.getDate() + 7);
  const soon  = a.events.some(
    e => e.status === 'pending' && e.due_date && e.due_date >= today && e.due_date <= in7.toISOString().slice(0, 10),
  );
  return soon ? { level: 'warn', label: 'A surveiller' } : { level: 'ok', label: 'OK' };
}

function buildProjection(
  events: PaymentEvent[],
  startBalance: number,
): { day: number; date: string; balance: number; evts: PaymentEvent[] }[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const pending = events.filter(e => (e.status === 'pending' || e.status === 'late') && e.due_date);
  let balance = startBalance;
  const points = [];
  for (let d = 0; d <= 60; d++) {
    const dt = new Date(today.getTime() + d * 86_400_000);
    const ds = dt.toISOString().slice(0, 10);
    const due = pending.filter(e => e.due_date === ds);
    balance -= due.reduce((s, e) => s + (e.amount ?? 0), 0);
    points.push({ day: d, date: ds, balance, evts: due });
  }
  return points;
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB BAR
// ══════════════════════════════════════════════════════════════════════════════

type Tab = 'budget' | 'cockpit' | 'timeline' | 'financement';

function TabBar({ active, onChange, lateCount }: { active: Tab; onChange: (t: Tab) => void; lateCount: number }) {
  const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'budget',      icon: <CreditCard className="h-3.5 w-3.5" />, label: 'Budget' },
    { id: 'cockpit',     icon: <TrendingUp className="h-3.5 w-3.5" />, label: 'Tresorerie' },
    { id: 'timeline',   icon: <Calendar className="h-3.5 w-3.5" />,   label: 'Echeancier' },
    { id: 'financement', icon: <Shield className="h-3.5 w-3.5" />,     label: 'Preuves' },
  ];
  return (
    <div className="flex border-b border-gray-100 bg-white px-2 sticky top-0 z-10">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`flex items-center gap-1.5 px-4 py-3.5 text-[12px] font-semibold border-b-2 transition-all whitespace-nowrap ${
            active === t.id
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}>
          {t.icon}{t.label}
          {t.id === 'timeline' && lateCount > 0 && (
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">{lateCount}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HERO CARD — statut · solde · reste à payer · prochaine échéance · jauge · reco
// ══════════════════════════════════════════════════════════════════════════════

function HeroCard({ events, budgetMax, loading }: { events: PaymentEvent[]; budgetMax: number; loading: boolean }) {
  const totalPaid = useMemo(() =>
    events.filter(e => e.status === 'paid').reduce((s, e) => s + (e.amount ?? 0), 0), [events]);
  const totalRemaining = useMemo(() =>
    events.filter(e => e.status === 'pending' || e.status === 'late').reduce((s, e) => s + (e.amount ?? 0), 0), [events]);
  const lateAmount = useMemo(() =>
    events.filter(e => e.status === 'late').reduce((s, e) => s + (e.amount ?? 0), 0), [events]);

  const next = useMemo(() => {
    const active = events.filter(e => (e.status === 'pending' || e.status === 'late') && e.due_date);
    return active.sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))[0] ?? null;
  }, [events]);

  // Solde restant = budget projet - déjà payé
  const solde = budgetMax > 0 ? budgetMax - totalPaid : null;
  const progress = budgetMax > 0
    ? Math.min(Math.round((totalPaid / budgetMax) * 100), 100)
    : (totalPaid + totalRemaining > 0
      ? Math.round((totalPaid / (totalPaid + totalRemaining)) * 100)
      : 0);

  const status: StatusLevel = lateAmount > 0
    ? 'risque'
    : (() => {
      const today = new Date().toISOString().slice(0, 10);
      const in14  = new Date(); in14.setDate(in14.getDate() + 14);
      const hasSoon = events.some(
        e => e.status === 'pending' && e.due_date
          && e.due_date >= today && e.due_date <= in14.toISOString().slice(0, 10),
      );
      return hasSoon ? 'tension' : 'equilibre';
    })();

  const nextDays = next?.due_date ? daysUntil(next.due_date) : null;

  type StatusConfig = { bar: string; pill: string; pillText: string; dot: string; label: string; icon: React.ReactNode; reco: string };
  const statusMap: Record<StatusLevel, StatusConfig> = {
    equilibre: {
      bar: 'bg-emerald-500',
      pill: 'bg-emerald-50 border border-emerald-200',
      pillText: 'text-emerald-700',
      dot: 'bg-emerald-500',
      label: 'Equilibre',
      icon: <Shield className="h-3.5 w-3.5" />,
      reco: 'Votre situation financiere est saine. Continuez a valider vos paiements au fil des etapes.',
    },
    tension: {
      bar: 'bg-amber-400',
      pill: 'bg-amber-50 border border-amber-200',
      pillText: 'text-amber-700',
      dot: 'bg-amber-400',
      label: 'Tension',
      icon: <Clock className="h-3.5 w-3.5" />,
      reco: next
        ? `Prochain paiement le ${fmtDateShort(next.due_date!)} — preparez le virement maintenant.`
        : 'Des echeances arrivent dans les 14 jours. Anticipez vos virements.',
    },
    risque: {
      bar: 'bg-red-500',
      pill: 'bg-red-50 border border-red-200',
      pillText: 'text-red-700',
      dot: 'bg-red-500',
      label: 'Risque',
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      reco: lateAmount > 0
        ? `${fmtEur(lateAmount)} en retard — regularisez rapidement pour debloquer la suite des travaux.`
        : 'Votre solde ne couvre pas toutes les echeances restantes.',
    },
  };
  const s = statusMap[status];

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Bande de couleur statut */}
      <div className={`h-1.5 w-full ${s.bar}`} />

      <div className="p-5 space-y-4">
        {/* Pill statut */}
        <div className="flex items-center justify-between">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold ${s.pill} ${s.pillText}`}>
            {s.icon}
            {loading ? 'Chargement...' : s.label}
            <span className={`w-2 h-2 rounded-full ${s.dot} ${status !== 'equilibre' ? 'animate-pulse' : ''}`} />
          </div>
          {!loading && budgetMax > 0 && (
            <span className="text-[10px] text-gray-400">Budget projet : {fmtEur(budgetMax)}</span>
          )}
        </div>

        {/* Metriques */}
        {loading ? (
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="space-y-2 animate-pulse">
                <div className="h-2.5 bg-gray-100 rounded w-16" />
                <div className="h-7 bg-gray-100 rounded w-24" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {/* Solde restant */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Solde restant</p>
              <p className={`text-[22px] font-black tracking-tight leading-none ${
                solde !== null && solde < 0 ? 'text-red-600' : status === 'risque' ? 'text-red-600' : status === 'tension' ? 'text-amber-600' : 'text-gray-900'
              }`}>
                {solde !== null ? fmtEur(solde) : '—'}
              </p>
              {solde !== null && <p className="text-[9px] text-gray-400 mt-0.5">{fmtEur(totalPaid)} deja regle</p>}
            </div>

            {/* Reste a payer */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Reste a payer</p>
              <p className={`text-[22px] font-black tracking-tight leading-none ${
                lateAmount > 0 ? 'text-red-600' : totalRemaining > 0 ? 'text-gray-900' : 'text-gray-300'
              }`}>
                {totalRemaining > 0 ? fmtEur(totalRemaining) : '—'}
              </p>
              {lateAmount > 0 && (
                <p className="text-[9px] text-red-500 font-semibold mt-0.5">{fmtEur(lateAmount)} en retard</p>
              )}
            </div>

            {/* Prochaine echeance */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Prochaine ech.</p>
              {next ? (
                <>
                  <p className={`text-[18px] font-black tracking-tight leading-none ${
                    nextDays !== null && nextDays < 0
                      ? 'text-red-600'
                      : nextDays !== null && nextDays <= 7
                      ? 'text-amber-600'
                      : 'text-gray-900'
                  }`}>
                    {fmtDateShort(next.due_date!)}
                  </p>
                  <p className="text-[9px] text-gray-400 mt-0.5 truncate max-w-[90px]">
                    {next.artisan_nom ?? next.lot_nom ?? next.label}
                  </p>
                </>
              ) : (
                <p className="text-[22px] font-black text-gray-300">—</p>
              )}
            </div>
          </div>
        )}

        {/* Jauge d'avancement */}
        {!loading && (totalPaid > 0 || totalRemaining > 0) && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>Avancement des paiements</span>
              <span className="font-bold text-gray-700">{progress}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  progress >= 80 ? 'bg-emerald-500' : progress >= 40 ? 'bg-indigo-500' : 'bg-gray-400'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Recommandation */}
        {!loading && (
          <div className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl text-[11px] leading-relaxed ${s.pill} ${s.pillText}`}>
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{s.reco}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CASHFLOW GRAPH — courbe SVG 60j · zones couleur · point minimum · insight
// ══════════════════════════════════════════════════════════════════════════════

function CashflowGraph({ events, budgetMax, loading }: { events: PaymentEvent[]; budgetMax: number; loading: boolean }) {
  const totalPaid = events.filter(e => e.status === 'paid').reduce((s, e) => s + (e.amount ?? 0), 0);
  const totalRemaining = events.filter(e => e.status !== 'cancelled').reduce((s, e) => s + (e.amount ?? 0), 0) - totalPaid;
  const startBalance = budgetMax > 0 ? budgetMax - totalPaid : totalRemaining;

  const points = useMemo(() => buildProjection(events, startBalance), [events, startBalance]);

  const minPt      = useMemo(() => points.reduce((a, b) => b.balance < a.balance ? b : a, points[0]), [points]);
  const maxBalance = Math.max(...points.map(p => p.balance), 1);
  const minBalance = Math.min(...points.map(p => p.balance), 0);
  const range      = maxBalance - minBalance || 1;

  const W = 560; const H = 120;
  const PAD_T = 10; const PAD_B = 20;
  const gH = H - PAD_T - PAD_B;

  const xOf = (d: number) => (d / 60) * W;
  const yOf = (b: number) => PAD_T + ((maxBalance - b) / range) * gH;
  const zeroY = yOf(0);
  const isNegative = minBalance < 0;

  const pathD = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${xOf(p.day).toFixed(1)},${yOf(p.balance).toFixed(1)}`
  ).join(' ');
  const fillD = pathD
    + ` L${xOf(60).toFixed(1)},${H} L${xOf(0).toFixed(1)},${H} Z`;

  const daysUntilNeg = isNegative ? (points.find(p => p.balance < 0)?.day ?? null) : null;

  if (loading) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
        <div className="h-2.5 bg-gray-100 rounded w-40 mb-4 animate-pulse" />
        <div className="h-[120px] bg-gray-50 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (events.filter(e => e.status !== 'cancelled').length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 text-center py-10">
        <TrendingDown className="h-8 w-8 text-gray-200 mx-auto mb-2" />
        <p className="text-sm font-semibold text-gray-400">Aucun flux a projeter</p>
        <p className="text-xs text-gray-300 mt-1">Ajoutez des echeances pour voir la courbe</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
          Projection tresorerie · 60 jours
        </p>
        {daysUntilNeg !== null && (
          <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full animate-pulse">
            Deficit dans {daysUntilNeg}j
          </span>
        )}
      </div>

      <div className="px-4 pb-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 120 }}>
          <defs>
            <linearGradient id="cfGradPos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="cfGradNeg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Zone verte (au-dessus zero) */}
          {maxBalance > 0 && (
            <rect x="0" y={PAD_T} width={W} height={Math.max(0, zeroY - PAD_T)} fill="#f0fdf4" opacity="0.6" />
          )}
          {/* Zone rouge (en-dessous zero) */}
          {isNegative && (
            <rect x="0" y={zeroY} width={W} height={H - zeroY - PAD_B} fill="#fef2f2" opacity="0.7" />
          )}
          {/* Ligne zero */}
          {isNegative && (
            <line x1="0" y1={zeroY} x2={W} y2={zeroY}
              stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
          )}

          {/* Fill gradient sous la courbe */}
          <path d={fillD} fill={isNegative ? 'url(#cfGradNeg)' : 'url(#cfGradPos)'} />
          {/* Courbe */}
          <path d={pathD} fill="none"
            stroke={isNegative ? '#ef4444' : '#6366f1'}
            strokeWidth="2.5" strokeLinejoin="round" />

          {/* Points aux jours avec echeances */}
          {points.filter(p => p.evts.length > 0).map(p => (
            <circle key={p.day}
              cx={xOf(p.day)} cy={yOf(p.balance)}
              r="4" fill="white"
              stroke={p.balance < 0 ? '#ef4444' : '#6366f1'}
              strokeWidth="2" />
          ))}

          {/* Point minimum */}
          <circle cx={xOf(minPt.day)} cy={yOf(minPt.balance)} r="5.5"
            fill={minPt.balance < 0 ? '#ef4444' : '#6366f1'} />
          <line
            x1={xOf(minPt.day)} y1={yOf(minPt.balance) + 7}
            x2={xOf(minPt.day)} y2={H - PAD_B}
            stroke={minPt.balance < 0 ? '#ef4444' : '#6366f1'}
            strokeWidth="1" strokeDasharray="2 2" opacity="0.4" />

          {/* Labels axe X */}
          {[0, 15, 30, 45, 60].map(d => (
            <text key={d} x={xOf(d)} y={H - 4}
              textAnchor={d === 0 ? 'start' : d === 60 ? 'end' : 'middle'}
              fontSize="8" fill="#9ca3af">
              {d === 0 ? 'Auj.' : `J+${d}`}
            </text>
          ))}
        </svg>
      </div>

      {/* Insight strip */}
      <div className={`mx-4 mb-4 px-3.5 py-2.5 rounded-xl flex items-center gap-2 text-[11px] font-medium ${
        daysUntilNeg !== null
          ? 'bg-red-50 border border-red-100 text-red-700'
          : minPt.balance < maxBalance * 0.15
          ? 'bg-amber-50 border border-amber-100 text-amber-700'
          : 'bg-emerald-50 border border-emerald-100 text-emerald-700'
      }`}>
        <span className="text-base shrink-0">
          {daysUntilNeg !== null ? '⚠️' : minPt.balance < maxBalance * 0.15 ? '📊' : '✅'}
        </span>
        <span>
          {daysUntilNeg !== null
            ? `Vous passez en negatif dans ${daysUntilNeg} jours — ${fmtEur(Math.abs(minPt.balance))} de decouvert estime`
            : minPt.balance < maxBalance * 0.15
            ? `Solde minimum projete : ${fmtEur(minPt.balance)} a J+${minPt.day} — marge limitee`
            : `Solde minimum projete a ${fmtEur(minPt.balance)} (J+${minPt.day}) — situation confortable`}
        </span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CAPACITÉ MENSUELLE — revenus · charges · travaux du mois · reste · projection
// ══════════════════════════════════════════════════════════════════════════════

function CapaciteMensuelle({ events, chantierId }: { events: PaymentEvent[]; chantierId: string }) {
  const storageKey = `tresorerie_monthly_${chantierId}`;

  const [data, setData] = useState<MonthlyData>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : { revenus: 0, charges: 0 };
    } catch { return { revenus: 0, charges: 0 }; }
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MonthlyData>(data);

  // Travaux du mois courant (echeances pending/late dues ce mois)
  const travauxMois = useMemo(() => {
    const monthStr = new Date().toISOString().slice(0, 7);
    return events
      .filter(e => (e.status === 'pending' || e.status === 'late') && e.due_date?.startsWith(monthStr))
      .reduce((s, e) => s + (e.amount ?? 0), 0);
  }, [events]);

  // Travaux mois suivant
  const travauxMoisSuivant = useMemo(() => {
    const now  = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthStr = next.toISOString().slice(0, 7);
    return events
      .filter(e => (e.status === 'pending' || e.status === 'late') && e.due_date?.startsWith(monthStr))
      .reduce((s, e) => s + (e.amount ?? 0), 0);
  }, [events]);

  const resteMois       = data.revenus - data.charges - travauxMois;
  const resteMoisSuivant = data.revenus - data.charges - travauxMoisSuivant;

  const mensuelStatus: MensuelStatus = resteMois < 0
    ? 'critique'
    : resteMois < data.revenus * 0.1
    ? 'tension'
    : 'safe';

  const mensuelStatusMap: Record<MensuelStatus, { label: string; cls: string; dot: string }> = {
    safe:     { label: 'Confortable', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    tension:  { label: 'Tension',     cls: 'bg-amber-50 text-amber-700 border-amber-100',      dot: 'bg-amber-400' },
    critique: { label: 'Critique',    cls: 'bg-red-50 text-red-700 border-red-100',            dot: 'bg-red-500' },
  };
  const sm = mensuelStatusMap[mensuelStatus];

  function save() {
    setData(draft);
    localStorage.setItem(storageKey, JSON.stringify(draft));
    setEditing(false);
  }

  const hasData = data.revenus > 0 || data.charges > 0;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-gray-50">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Capacite mensuelle</p>
        <button
          onClick={() => { setDraft(data); setEditing(!editing); }}
          className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
          <Pencil className="h-3 w-3" />
          {editing ? 'Annuler' : hasData ? 'Modifier' : 'Renseigner'}
        </button>
      </div>

      {editing ? (
        <div className="px-5 py-4 space-y-3">
          <p className="text-[11px] text-gray-500">
            Entrez vos revenus et charges mensuels pour calculer votre capacite reelle de financement.
          </p>
          {([
            { label: 'Revenus nets mensuels', key: 'revenus' as const },
            { label: 'Charges fixes mensuelles', key: 'charges' as const },
          ] as { label: string; key: keyof MonthlyData }[]).map(f => (
            <div key={f.key}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{f.label} (€)</p>
              <input
                type="number" inputMode="decimal" min="0" step="100"
                value={draft[f.key] || ''}
                onChange={e => setDraft(prev => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))}
                className="w-full text-right text-[16px] font-bold px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-indigo-400 outline-none transition-colors font-mono"
                placeholder="0"
              />
            </div>
          ))}
          <button
            onClick={save}
            className="w-full py-2.5 bg-indigo-600 text-white text-[12px] font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
            <Check className="h-4 w-4" /> Enregistrer
          </button>
        </div>
      ) : !hasData ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm font-semibold text-gray-400">Donnees non renseignees</p>
          <p className="text-xs text-gray-300 mt-1">Cliquez sur "Renseigner" pour calculer votre capacite</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {[
            { label: 'Revenus nets',     value:  data.revenus,  color: 'text-emerald-600' },
            { label: 'Charges fixes',    value: -data.charges,  color: 'text-gray-700' },
            { label: 'Travaux ce mois',  value: -travauxMois,   color: travauxMois > 0 ? 'text-indigo-700' : 'text-gray-400' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between px-5 py-2.5">
              <span className="text-[12px] text-gray-500">{row.label}</span>
              <span className={`text-[13px] font-bold font-mono ${row.color}`}>
                {row.value >= 0 ? '+' : ''}{fmtEur(row.value)}
              </span>
            </div>
          ))}

          {/* Reste mensuel */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-black text-gray-900">Reste mensuel</span>
              <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold ${sm.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                {sm.label}
              </div>
            </div>
            <span className={`text-[18px] font-black font-mono ${
              resteMois < 0 ? 'text-red-600' : resteMois < data.revenus * 0.1 ? 'text-amber-600' : 'text-emerald-600'
            }`}>
              {resteMois >= 0 ? '+' : ''}{fmtEur(resteMois)}
            </span>
          </div>

          {/* Projection mois suivant */}
          <div className="flex items-center justify-between px-5 py-2.5">
            <div>
              <span className="text-[11px] font-semibold text-gray-400">Projection mois suivant</span>
              {travauxMoisSuivant > 0 && (
                <span className="ml-1.5 text-[10px] text-gray-400">({fmtEur(travauxMoisSuivant)} de travaux)</span>
              )}
            </div>
            <span className={`text-[13px] font-bold font-mono ${resteMoisSuivant < 0 ? 'text-red-500' : 'text-gray-600'}`}>
              {resteMoisSuivant >= 0 ? '+' : ''}{fmtEur(resteMoisSuivant)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ACTIONS PRIORITAIRES — triées par urgence, avec CTA marquer payé
// ══════════════════════════════════════════════════════════════════════════════

interface ActionItem {
  id: string;
  priority: 0 | 1 | 2;
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  amount?: number;
  cta: string;
  ctaCls: string;
  canPay: boolean;
  ev: PaymentEvent;
}

function ActionsPrioritaires({ events, markPaid }: { events: PaymentEvent[]; markPaid: (id: string) => Promise<boolean> }) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [doneIds,   setDoneIds]   = useState<Set<string>>(new Set());

  const actions = useMemo<ActionItem[]>(() => {
    const result: ActionItem[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const in7   = new Date(); in7.setDate(in7.getDate() + 7);
    const in7s  = in7.toISOString().slice(0, 10);

    for (const ev of events) {
      if (doneIds.has(ev.id)) continue;

      if (ev.status === 'late') {
        result.push({
          id: ev.id, priority: 0, canPay: true,
          icon: <AlertTriangle className="h-3.5 w-3.5" />,
          label: ev.label,
          sublabel: ev.artisan_nom ?? ev.lot_nom ?? undefined,
          amount: ev.amount ?? undefined,
          cta: 'Payer maintenant',
          ctaCls: 'bg-red-600 text-white hover:bg-red-700',
          ev,
        });
      } else if (ev.status === 'pending' && ev.due_date && ev.due_date >= today && ev.due_date <= in7s) {
        result.push({
          id: ev.id, priority: 1, canPay: true,
          icon: <Clock className="h-3.5 w-3.5" />,
          label: ev.label,
          sublabel: `Avant le ${fmtDateShort(ev.due_date)}${ev.artisan_nom ? ` · ${ev.artisan_nom}` : ''}`,
          amount: ev.amount ?? undefined,
          cta: 'Regler',
          ctaCls: 'bg-amber-500 text-white hover:bg-amber-600',
          ev,
        });
      } else if (ev.status === 'paid' && !ev.proof_doc_id) {
        result.push({
          id: ev.id, priority: 2, canPay: false,
          icon: <Paperclip className="h-3.5 w-3.5" />,
          label: ev.label,
          sublabel: 'Justificatif manquant',
          cta: 'Verifier',
          ctaCls: 'bg-gray-100 text-gray-700',
          ev,
        });
      }
    }
    return result.sort((a, b) => a.priority - b.priority).slice(0, 6);
  }, [events, doneIds]);

  const priorityCls: Record<0 | 1 | 2, { border: string; icon: string }> = {
    0: { border: 'border-l-red-500',   icon: 'text-red-500' },
    1: { border: 'border-l-amber-400', icon: 'text-amber-500' },
    2: { border: 'border-l-gray-300',  icon: 'text-gray-400' },
  };

  if (actions.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-5 py-5 flex items-center gap-3">
        <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        </div>
        <div>
          <p className="text-[13px] font-bold text-gray-700">Aucune action urgente</p>
          <p className="text-[11px] text-gray-400">Tous vos paiements sont a jour</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
          Actions prioritaires · {actions.length}
        </p>
      </div>
      <div className="divide-y divide-gray-50">
        {actions.map(action => {
          const pcls      = priorityCls[action.priority];
          const isLoading = loadingId === action.id;
          return (
            <div key={action.id}
              className={`flex items-center gap-3 px-5 py-3.5 border-l-[3px] ${pcls.border}`}>
              <div className={`shrink-0 ${pcls.icon}`}>{action.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-gray-900 truncate">{action.label}</p>
                {action.sublabel && (
                  <p className="text-[10px] text-gray-400 mt-0.5">{action.sublabel}</p>
                )}
                {action.amount && (
                  <p className="text-[11px] font-bold text-gray-600 mt-0.5">{fmtEur(action.amount)}</p>
                )}
              </div>
              {action.canPay ? (
                <button
                  onClick={async () => {
                    setLoadingId(action.id);
                    const ok = await markPaid(action.id);
                    setLoadingId(null);
                    if (ok) setDoneIds(prev => new Set([...prev, action.id]));
                  }}
                  disabled={isLoading}
                  className={`shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-full transition-colors flex items-center gap-1 ${action.ctaCls} disabled:opacity-50`}>
                  {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                  {action.cta}
                </button>
              ) : (
                <span className="shrink-0 text-[10px] font-semibold text-gray-500 bg-gray-50 border border-gray-100 px-2 py-1 rounded-full">
                  {action.cta}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ARTISAN DRAWER — slide-in avec detail echeances + marquer paye
// ══════════════════════════════════════════════════════════════════════════════

function ArtisanDrawer({
  artisan, markPaid, markUnpaid, onClose,
}: {
  artisan: ArtisanSummary;
  markPaid: (id: string) => Promise<boolean>;
  markUnpaid: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const evCfg = (status: PaymentEvent['status']) => {
    if (status === 'paid')    return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', badge: 'Paye' };
    if (status === 'late')    return { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     badge: 'En retard' };
    if (status === 'pending') return { bg: 'bg-gray-50',    text: 'text-gray-600',    border: 'border-gray-200',    badge: 'A venir' };
    return { bg: 'bg-gray-50', text: 'text-gray-400', border: 'border-gray-100', badge: '—' };
  };

  const progress = artisan.total > 0 ? Math.round((artisan.paid / artisan.total) * 100) : 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed inset-y-0 right-0 w-full max-w-[420px] bg-white shadow-2xl z-50 flex flex-col"
        style={{ animation: 'slideInRight 0.22s ease-out' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-xl">🔧</div>
            <div>
              <p className="text-[14px] font-black text-gray-900 leading-tight">{artisan.nom}</p>
              <p className="text-[10px] text-gray-400">{artisan.events.length} echeance{artisan.events.length > 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* KPIs + jauge */}
        <div className="px-5 py-4 border-b border-gray-50 bg-gray-50 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Total',  value: fmtEur(artisan.total),           cls: 'text-gray-900' },
              { label: 'Paye',   value: fmtEur(artisan.paid),            cls: 'text-emerald-600' },
              { label: 'Reste',  value: fmtEur(artisan.pending),         cls: artisan.late > 0 ? 'text-red-600' : 'text-gray-700' },
            ].map(m => (
              <div key={m.label}>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{m.label}</p>
                <p className={`text-[15px] font-black mt-0.5 ${m.cls}`}>{m.value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>Avancement</span><span className="font-bold">{progress}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden flex">
              <div className="bg-emerald-400 rounded-full" style={{ width: `${progress}%` }} />
              {artisan.late > 0 && (
                <div className="bg-red-400"
                  style={{ width: `${Math.round((artisan.late / artisan.total) * 100)}%` }} />
              )}
            </div>
          </div>
        </div>

        {/* Liste echeances */}
        <div className="flex-1 overflow-y-auto py-1">
          {artisan.events
            .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
            .map(ev => {
              const cfg        = evCfg(ev.status);
              const isConf     = confirmId === ev.id;
              const isLoading  = loadingId === ev.id;
              return (
                <div key={ev.id} className="px-5 py-3 border-b border-gray-50 last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-gray-800 leading-snug truncate">{ev.label}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-[11px] font-black text-gray-700">{fmtEur(ev.amount ?? 0)}</p>
                        {ev.due_date && <p className="text-[10px] text-gray-400">{fmtDateShort(ev.due_date)}</p>}
                      </div>
                    </div>
                    <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                      {cfg.badge}
                    </span>
                  </div>

                  {/* CTA */}
                  {(ev.status === 'pending' || ev.status === 'late') && !isConf && (
                    <button onClick={() => setConfirmId(ev.id)}
                      className="mt-2 flex items-center gap-1.5 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-3 py-1.5 rounded-full transition-colors">
                      <Check className="h-3 w-3" /> Marquer paye
                    </button>
                  )}
                  {ev.status === 'paid' && !isConf && (
                    <button onClick={() => setConfirmId(ev.id)}
                      className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors">
                      <X className="h-3 w-3" /> Annuler paiement
                    </button>
                  )}

                  {isConf && (
                    <div className="mt-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                      <p className="text-[11px] font-semibold text-gray-700 mb-2">Confirmer ?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            setConfirmId(null); setLoadingId(ev.id);
                            if (ev.status === 'paid') await markUnpaid(ev.id);
                            else await markPaid(ev.id);
                            setLoadingId(null);
                          }}
                          disabled={isLoading}
                          className={`flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                            ev.status === 'paid' ? 'bg-gray-700 text-white' : 'bg-emerald-600 text-white'
                          }`}>
                          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Confirmer
                        </button>
                        <button onClick={() => setConfirmId(null)}
                          className="text-[11px] font-semibold text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}

                  {ev.status === 'paid' && ev.proof_signed_url && (
                    <a href={ev.proof_signed_url} target="_blank" rel="noopener noreferrer"
                      className="mt-1.5 flex items-center gap-1 text-[10px] text-blue-600 hover:underline">
                      <Paperclip className="h-3 w-3" /> {ev.proof_doc_name ?? 'Justificatif'}
                    </a>
                  )}
                </div>
              );
            })}
        </div>

        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-gray-100 text-[12px] font-bold text-gray-700 hover:bg-gray-200 transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LISTE ARTISANS — cartes avec statut · impact · progression · reste · action
// ══════════════════════════════════════════════════════════════════════════════

function ArtisanList({ events, onSelect }: { events: PaymentEvent[]; onSelect: (a: ArtisanSummary) => void }) {
  const artisans = useMemo(() => groupByArtisan(events), [events]);

  if (artisans.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-5 py-8 text-center">
        <p className="text-sm font-semibold text-gray-500">Aucun artisan detecte</p>
        <p className="text-xs text-gray-400 mt-1">Ajoutez des devis valides pour voir le suivi par artisan</p>
      </div>
    );
  }

  const levelBorder = { ok: 'border-l-emerald-400', warn: 'border-l-orange-400', danger: 'border-l-red-500' };
  const levelBadge  = { ok: 'bg-emerald-50 text-emerald-700', warn: 'bg-orange-50 text-orange-700', danger: 'bg-red-50 text-red-700' };
  const levelAvatar = { ok: 'bg-indigo-50', warn: 'bg-orange-50', danger: 'bg-red-50' };
  const impactOf    = (a: ArtisanSummary) =>
    a.total > 5000 ? { label: 'Impact eleve', cls: 'bg-red-50 text-red-600 border-red-100' } :
    a.total > 2000 ? { label: 'Impact moyen', cls: 'bg-amber-50 text-amber-600 border-amber-100' } :
                     { label: 'Impact faible', cls: 'bg-emerald-50 text-emerald-600 border-emerald-100' };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
          Artisans · {artisans.length} intervenant{artisans.length > 1 ? 's' : ''}
        </p>
        <p className="text-[10px] text-gray-400">Cliquez pour le detail</p>
      </div>
      <div className="divide-y divide-gray-50">
        {artisans.map(a => {
          const { level, label } = artisanStatusConfig(a);
          const imp     = impactOf(a);
          const progress = a.total > 0 ? Math.round((a.paid / a.total) * 100) : 0;
          const nextEv  = a.events
            .filter(e => e.status === 'pending' || e.status === 'late')
            .sort((x, y) => (x.due_date ?? '').localeCompare(y.due_date ?? ''))[0];
          return (
            <button key={a.nom} onClick={() => onSelect(a)}
              className={`w-full flex items-start gap-3 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors border-l-[3px] ${levelBorder[level]}`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${levelAvatar[level]}`}>
                🔧
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                  <span className="text-[13px] font-black text-gray-900 truncate">{a.nom}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${levelBadge[level]}`}>{label}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${imp.cls}`}>{imp.label}</span>
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                  <span>{progress}% regle</span>
                  <span className="font-bold text-gray-600">{fmtEur(a.total - a.paid)} restant</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                  <div className="bg-emerald-400 rounded-full" style={{ width: `${progress}%` }} />
                  {a.late > 0 && (
                    <div className="bg-red-400"
                      style={{ width: `${Math.round((a.late / a.total) * 100)}%` }} />
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {a.late > 0 && (
                  <span className="text-[10px] font-bold text-red-600 bg-red-50 rounded-full px-2 py-0.5">Retard</span>
                )}
                {nextEv?.due_date && !a.late && (
                  <span className="text-[10px] text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">
                    Ech. {fmtDateShort(nextEv.due_date)}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-gray-300 mt-1" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FINANCEMENT PANEL — sources de budget + simulateur de pret
// ══════════════════════════════════════════════════════════════════════════════

function FinancementPanel({
  budgetMax,
  financingAmounts,
  setFinancingAmounts,
  simulationData,
  setSimulationData,
  onPersist,
}: {
  budgetMax: number;
  financingAmounts: Record<SourceKey, string>;
  setFinancingAmounts: React.Dispatch<React.SetStateAction<Record<SourceKey, string>>>;
  simulationData: SimulationData | null;
  setSimulationData: (d: SimulationData | null) => void;
  onPersist: (amounts: Record<SourceKey, string>, sim: SimulationData | null) => void;
}) {
  const apport  = parseFloat(financingAmounts.apport)  || 0;
  const credit  = parseFloat(financingAmounts.credit)  || 0;
  const maprime = parseFloat(financingAmounts.maprime) || 0;
  const cee     = parseFloat(financingAmounts.cee)     || 0;
  const eco_ptz = parseFloat(financingAmounts.eco_ptz) || 0;
  const totalFin = apport + credit + maprime + cee + eco_ptz;
  const reste    = Math.max(budgetMax - totalFin, 0);
  const couv     = budgetMax > 0 ? Math.min(Math.round((totalFin / budgetMax) * 100), 100) : 0;

  function update(key: SourceKey, val: string) {
    setFinancingAmounts(prev => {
      const next = { ...prev, [key]: val };
      onPersist(next, simulationData);
      return next;
    });
  }

  const [simMontant, setSimMontant] = useState(String(simulationData?.amount ?? ''));
  const [simDuree,   setSimDuree]   = useState(String(simulationData?.months ?? '60'));
  const [simTaux,    setSimTaux]    = useState(String(simulationData?.rate   ?? '4.2'));

  const simResult = useMemo(() => {
    const m = parseFloat(simMontant) || 0;
    const n = parseFloat(simDuree)   || 1;
    const r = (parseFloat(simTaux)   || 0) / 100 / 12;
    if (m <= 0) return null;
    const men = r === 0 ? m / n : m * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const tot = men * n;
    return { men: Math.round(men), tot: Math.round(tot), int: Math.round(tot - m) };
  }, [simMontant, simDuree, simTaux]);

  const sources: { key: SourceKey; label: string; icon: string; color: string; bg: string }[] = [
    { key: 'apport',  label: 'Apport personnel',  icon: '💰', color: 'bg-emerald-400', bg: 'bg-emerald-50' },
    { key: 'credit',  label: 'Pret travaux',       icon: '🏦', color: 'bg-blue-400',    bg: 'bg-blue-50' },
    { key: 'maprime', label: "MaPrimeRenov'",      icon: '🌿', color: 'bg-orange-400',  bg: 'bg-orange-50' },
    { key: 'cee',     label: 'CEE',                icon: '⚡', color: 'bg-purple-400',  bg: 'bg-purple-50' },
    { key: 'eco_ptz', label: 'Eco-PTZ',            icon: '🏠', color: 'bg-teal-400',    bg: 'bg-teal-50' },
  ];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { l: 'Budget total',     v: budgetMax > 0 ? fmtEur(budgetMax) : '—', cls: '' },
          { l: 'Finance',          v: totalFin > 0  ? fmtEur(totalFin)  : '—', cls: totalFin > 0 ? 'bg-emerald-50 border-emerald-100' : '' },
          { l: 'Reste a financer', v: budgetMax > 0 && reste > 0 ? fmtEur(reste) : reste > 0 ? fmtEur(reste) : '—', cls: reste > 0 ? 'bg-orange-50 border-orange-100' : '' },
          { l: 'Couverture',       v: totalFin > 0  ? `${couv} %` : '—', cls: couv >= 100 ? 'bg-emerald-50 border-emerald-100' : '' },
        ].map(k => (
          <div key={k.l} className={`border rounded-xl px-4 py-3 bg-white ${k.cls || 'border-gray-100'}`}>
            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">{k.l}</p>
            <p className="text-[17px] font-black tracking-tight leading-none">{k.v}</p>
          </div>
        ))}
      </div>

      {/* Barre couverture */}
      {budgetMax > 0 && totalFin > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">
          <div className="flex justify-between mb-2">
            <span className="text-[11px] font-semibold text-gray-600">Taux de couverture</span>
            <span className="text-[13px] font-black text-emerald-600">{couv} %</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${couv}%`, background: 'linear-gradient(90deg,#4ade80,#00bf8e)' }} />
          </div>
          {reste > 0 && (
            <p className="text-[11px] text-orange-600 font-medium mt-2">
              Il vous manque {fmtEur(reste)} pour couvrir l'integralite du projet
            </p>
          )}
        </div>
      )}

      {/* Sources */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-5 pt-4 pb-2">
          Sources de financement
        </p>
        <div className="divide-y divide-gray-50">
          {sources.map(s => {
            const val = parseFloat(financingAmounts[s.key]) || 0;
            const pct = totalFin > 0 ? Math.round((val / totalFin) * 100) : 0;
            return (
              <div key={s.key} className="flex items-center gap-3 px-5 py-3.5">
                <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center text-base shrink-0`}>
                  {s.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-gray-800">{s.label}</p>
                  {val > 0 && (
                    <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${s.color}`} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
                <input
                  type="number" inputMode="decimal" min="0" placeholder="0"
                  value={financingAmounts[s.key]}
                  onChange={e => update(s.key, e.target.value)}
                  className="w-28 text-right text-[13px] font-bold px-3 py-1.5 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-gray-400 outline-none transition-colors"
                />
                <span className="text-[11px] text-gray-400 w-4">€</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Simulateur credit */}
      <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-4">Simulateur de pret travaux</p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Montant (€)',     val: simMontant, set: setSimMontant, step: '500' },
            { label: 'Duree (mois)',    val: simDuree,   set: setSimDuree,   step: '6' },
            { label: 'Taux annuel (%)', val: simTaux,    set: setSimTaux,    step: '0.1' },
          ].map(f => (
            <div key={f.label}>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">{f.label}</p>
              <input type="number" inputMode="decimal" min="0" step={f.step} value={f.val}
                onChange={e => f.set(e.target.value)}
                className="w-full text-right text-[14px] font-bold px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-gray-400 outline-none transition-colors font-mono"
              />
            </div>
          ))}
        </div>
        {simResult && (
          <div className="grid grid-cols-3 gap-2 bg-gray-50 rounded-xl p-3">
            {[
              { l: 'Mensualite', v: fmtEur(simResult.men), accent: true },
              { l: 'Cout total', v: fmtEur(simResult.tot) },
              { l: 'Interets',   v: fmtEur(simResult.int) },
            ].map(r => (
              <div key={r.l} className="text-center">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{r.l}</p>
                <p className={`text-[16px] font-black mt-1 ${r.accent ? 'text-emerald-600' : 'text-gray-900'}`}>{r.v}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// PREUVES TAB — preuves de paiement + PV de réception par artisan
// ══════════════════════════════════════════════════════════════════════════════

const PROOF_TYPE_CFG: Record<string, { label: string; icon: string; accept: string }> = {
  virement:  { label: 'Extrait bancaire / virement',  icon: '🏦', accept: '.pdf,.jpg,.jpeg,.png' },
  cheque:    { label: 'Copie chèque',                 icon: '📄', accept: '.pdf,.jpg,.jpeg,.png' },
  especes:   { label: 'Reçu de paiement',             icon: '🧾', accept: '.pdf,.jpg,.jpeg,.png' },
  autre:     { label: 'Autre document',               icon: '📎', accept: '.pdf,.jpg,.jpeg,.png,.docx' },
};

interface ProofDoc {
  id: string;
  nom: string | null;
  nom_fichier: string | null;
  signedUrl: string | null;
  created_at: string;
}

function PreuvesTab({ events, chantierId, token }: {
  events: PaymentEvent[];
  chantierId: string;
  token: string;
}) {
  const [pvArtisan, setPvArtisan] = useState<{ nom: string; lots: string[] } | null>(null);
  const artisans = useMemo(() => groupByArtisan(events), [events]);

  // ── Justificatifs déposés ──────────────────────────────────────────────────
  const [proofDocs,  setProofDocs]  = useState<ProofDoc[]>([]);
  const [dragOver,   setDragOver]   = useState<string | null>(null);
  const [uploading,  setUploading]  = useState<string | null>(null); // category key
  const [analyzing,  setAnalyzing]  = useState<string | null>(null); // doc id
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Charger les preuve_paiement existantes au montage
  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await _supabase.auth.getSession();
      const bearer = session?.access_token ?? token;
      try {
        const res = await fetch(`/api/chantier/${chantierId}/documents`, {
          headers: { Authorization: `Bearer ${bearer}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const proofs: ProofDoc[] = (data.documents ?? [])
          .filter((d: any) => d.document_type === 'preuve_paiement')
          .map((d: any) => ({
            id: d.id,
            nom: d.nom ?? d.nom_fichier ?? null,
            nom_fichier: d.nom_fichier ?? null,
            signedUrl: d.signedUrl ?? null,
            created_at: d.created_at,
          }));
        setProofDocs(proofs);
      } catch { /* silencieux */ }
    };
    load();
  }, [chantierId, token]);

  const uploadProof = useCallback(async (file: File, category: string) => {
    if (uploading || analyzing) return;
    setUploading(category);
    try {
      const { data: { session } } = await _supabase.auth.getSession();
      const bearer = session?.access_token ?? token;

      // 1. Upload du fichier
      const fd = new FormData();
      fd.append('file', file);
      fd.append('nom', PROOF_TYPE_CFG[category]?.label ?? 'Justificatif');
      fd.append('documentType', 'preuve_paiement');
      fd.append('source', 'manual_upload');

      const uploadRes = await fetch(`/api/chantier/${chantierId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}` },
        body: fd,
      });
      if (!uploadRes.ok) { setUploading(null); return; }
      const { document: doc } = await uploadRes.json();
      if (!doc?.id) { setUploading(null); return; }

      // 2. Affichage immédiat avec nom temporaire
      const tempDoc: ProofDoc = {
        id: doc.id,
        nom: PROOF_TYPE_CFG[category]?.label ?? 'Justificatif',
        nom_fichier: doc.nom_fichier ?? null,
        signedUrl: doc.signedUrl ?? null,
        created_at: doc.created_at ?? new Date().toISOString(),
      };
      setProofDocs(prev => [tempDoc, ...prev]);
      setUploading(null);

      // 3. IA auto-nommage (avec catégorie comme indice)
      setAnalyzing(doc.id);
      try {
        const descRes = await fetch(
          `/api/chantier/${chantierId}/documents/${doc.id}/describe`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ proofCategory: category }),
          },
        );
        if (descRes.ok) {
          const { nom: aiNom } = await descRes.json();
          if (aiNom) setProofDocs(prev => prev.map(d => d.id === doc.id ? { ...d, nom: aiNom } : d));
        }
      } catch { /* silencieux — nom temporaire conservé */ }
      setAnalyzing(null);

    } catch {
      setUploading(null);
      setAnalyzing(null);
    }
  }, [chantierId, token, uploading, analyzing]);

  const allArtisans = artisans;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 pb-8 space-y-5">

        {/* Rappel légal */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-4">
          <p className="text-[13px] font-black text-indigo-900 mb-2">Pourquoi conserver ses preuves ?</p>
          {[
            { icon: '⚖️', text: 'En cas de litige avec un artisan — le virement fait foi' },
            { icon: '🏠', text: 'Pour activer la garantie décennale (valable 10 ans après réception)' },
            { icon: '💰', text: 'Pour débloquer des aides (MaPrimeRenov, CEE) — elles exigent la facture acquittée' },
            { icon: '📈', text: 'En cas de revente — prouver la valeur des travaux réalisés' },
          ].map(r => (
            <div key={r.icon} className="flex items-start gap-2 mt-2">
              <span className="text-base shrink-0">{r.icon}</span>
              <p className="text-[11px] text-indigo-800 leading-relaxed">{r.text}</p>
            </div>
          ))}
        </div>

        {/* Preuves de paiement — drop zones */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 pt-4 pb-2">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Preuves de paiement
            </p>
            <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
              Glissez votre justificatif dans la bonne catégorie — l'IA le nomme automatiquement.
            </p>
          </div>

          {/* 4 drop zones */}
          <div className="px-5 pb-4 grid grid-cols-2 gap-3 mt-2">
            {Object.entries(PROOF_TYPE_CFG).map(([key, cfg]) => (
              <div key={key}>
                <input
                  ref={el => { fileRefs.current[key] = el; }}
                  type="file"
                  accept={cfg.accept}
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) uploadProof(f, key);
                    e.target.value = '';
                  }}
                />
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(key); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOver(null);
                    const f = e.dataTransfer.files[0];
                    if (f) uploadProof(f, key);
                  }}
                  onClick={() => { if (!uploading && !analyzing) fileRefs.current[key]?.click(); }}
                  className={[
                    'flex flex-col items-center justify-center gap-1.5 rounded-xl px-3 py-4 cursor-pointer border-2 border-dashed transition-all duration-150 select-none text-center',
                    dragOver === key
                      ? 'bg-blue-50 border-blue-400 scale-[1.02] shadow-sm'
                      : 'bg-gray-50 border-gray-200 hover:border-blue-300 hover:bg-blue-50',
                    uploading === key ? 'opacity-60 pointer-events-none' : '',
                  ].join(' ')}
                >
                  <span className="text-xl">{cfg.icon}</span>
                  {uploading === key ? (
                    <span className="flex items-center gap-1 text-[10px] text-blue-600">
                      <Loader2 className="h-3 w-3 animate-spin shrink-0" /> Envoi…
                    </span>
                  ) : (
                    <>
                      <span className="text-[11px] text-gray-700 font-semibold leading-tight">{cfg.label}</span>
                      <span className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5">
                        <UploadCloud className="h-3 w-3" /> Glisser ou cliquer
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Justificatifs déposés ici */}
          {proofDocs.length > 0 && (
            <div className="border-t border-gray-50">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-5 pt-3 pb-2">
                Justificatifs déposés ({proofDocs.length})
              </p>
              <div className="divide-y divide-gray-50 pb-2">
                {proofDocs.map(d => (
                  <div key={d.id} className="flex items-center gap-3 px-5 py-2.5">
                    <Paperclip className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      {analyzing === d.id ? (
                        <div className="flex items-center gap-1.5">
                          <Loader2 className="h-3 w-3 text-indigo-400 animate-spin shrink-0" />
                          <span className="text-[11px] text-indigo-500 italic">Lecture IA en cours…</span>
                        </div>
                      ) : (
                        <p className="text-[11px] font-medium text-gray-700 truncate">
                          {d.nom ?? d.nom_fichier ?? 'Justificatif'}
                        </p>
                      )}
                      <p className="text-[10px] text-gray-400">
                        {new Date(d.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    {d.signedUrl ? (
                      <a
                        href={d.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Télécharger"
                        className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 shrink-0 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="text-[10px] text-gray-300 shrink-0">Lien expiré</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Justificatifs liés à l'échéancier (proof_doc_id sur payment_events) */}
          {events.filter(e => e.proof_signed_url).length > 0 && (
            <div className="border-t border-gray-50">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-5 pt-3 pb-2">
                Justificatifs liés à l'échéancier
              </p>
              <div className="divide-y divide-gray-50 pb-2">
                {events.filter(e => e.proof_signed_url).map(e => (
                  <div key={e.id} className="flex items-center gap-3 px-5 py-2.5">
                    <Paperclip className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-gray-700 truncate">
                        {e.proof_doc_name ?? 'Justificatif'}
                      </p>
                      <p className="text-[10px] text-gray-400">{e.artisan_nom ?? e.lot_nom ?? '—'}</p>
                    </div>
                    <a
                      href={e.proof_signed_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Télécharger"
                      className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 shrink-0 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* PV de réception par artisan */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 pt-4 pb-2">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Procès-Verbaux de réception
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              Générez un PV officiel par artisan — document légal à signer en fin de chantier.
            </p>
          </div>

          {allArtisans.length === 0 ? (
            <div className="px-5 pb-5 pt-2 text-center">
              <p className="text-[12px] text-gray-400 italic">
                Aucun artisan détecté — ajoutez des devis validés pour activer cette fonctionnalité.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {allArtisans.map(a => {
                const lots = [...new Set(a.events.map(e => e.lot_nom).filter(Boolean))] as string[];
                const isPaid = a.paid >= a.total && a.total > 0;
                const isPending = a.pending > 0 || a.late > 0;
                return (
                  <div key={a.nom} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-base shrink-0">
                      🔧
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-gray-800 truncate">{a.nom}</p>
                      <p className="text-[10px] text-gray-400 truncate">{lots.join(' · ') || '—'}</p>
                      <div className="mt-1">
                        {isPaid && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Soldé — PV recommandé
                          </span>
                        )}
                        {!isPaid && isPending && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">
                            <Clock className="h-2.5 w-2.5" /> En cours
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setPvArtisan({ nom: a.nom, lots })}
                      className="flex items-center gap-1.5 text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap shrink-0">
                      <FileText className="h-3.5 w-3.5" />
                      Générer PV
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Info légale */}
          <div className="mx-5 mb-4 mt-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-[10px] text-gray-500 leading-relaxed">
            📋 <strong>Mentions obligatoires du PV :</strong> identité des parties, assurance décennale + n° de police,
            référence au devis signé, date de visite, date de réception, adresse du chantier, nature des travaux,
            réserves éventuelles avec délai de levée, signatures des deux parties.
          </div>
        </div>

      </div>

      {/* Modal PV */}
      {pvArtisan && (
        <PVReceptionModal
          artisanNom={pvArtisan.nom}
          lotNoms={pvArtisan.lots}
          chantierId={chantierId}
          token={token}
          onClose={() => setPvArtisan(null)}
        />
      )}
    </div>
  );
}

interface TresoreeriePanelProps {
  chantierId: string;
  token: string;
  budgetMax?: number;
  rangeMin?: number;
  rangeMax?: number;
  initialFinancing?: Record<string, unknown> | null;
  initialEnveloppePrevue?: number | null;
}

export default function TresoreriePanel({
  chantierId,
  token,
  budgetMax: budgetMaxProp = 0,
  rangeMin,
  rangeMax,
  initialFinancing,
  initialEnveloppePrevue,
}: TresoreeriePanelProps) {
  const [tab,              setTab]              = useState<Tab>('budget');
  // On stocke le NOM (clé) plutôt qu'un snapshot → le drawer reçoit toujours les données fraîches
  const [selectedArtisanNom, setSelectedArtisanNom] = useState<string | null>(null);

  const [financingAmounts, setFinancingAmounts] = useState<Record<SourceKey, string>>(() => ({
    apport:  String((initialFinancing as any)?.apport  ?? ''),
    credit:  String((initialFinancing as any)?.credit  ?? ''),
    maprime: String((initialFinancing as any)?.maprime ?? ''),
    cee:     String((initialFinancing as any)?.cee     ?? ''),
    eco_ptz: String((initialFinancing as any)?.eco_ptz ?? ''),
  }));
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null);

  const { events, loading, error, markPaid, markUnpaid } = usePaymentEvents(chantierId, token);
  const lateCount = useMemo(() => events.filter(e => e.status === 'late').length, [events]);
  // Artisan sélectionné calculé LIVE depuis events (pas un snapshot figé)
  const artisansLive = useMemo(() => groupByArtisan(events), [events]);
  const selectedArtisan = useMemo(
    () => selectedArtisanNom ? artisansLive.find(a => a.nom === selectedArtisanNom) ?? null : null,
    [selectedArtisanNom, artisansLive],
  );

  async function persistFinancing(amounts: Record<SourceKey, string>, sim: SimulationData | null) {
    try {
      const { data: { session } } = await _supabase.auth.getSession();
      const bearerToken = session?.access_token ?? token;
      await fetch(`/api/chantier/${chantierId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearerToken}` },
        body: JSON.stringify({ metadonnees: { financing: amounts, simulation: sim } }),
      });
    } catch { /* silencieux */ }
  }

  return (
    <div className="flex flex-col h-full">
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>

      <TabBar active={tab} onChange={setTab} lateCount={lateCount} />

      {/* ── Budget ──────────────────────────────────────────────────────────── */}
      {tab === 'budget' && (
        <div className="flex-1 overflow-y-auto">
          <BudgetTab chantierId={chantierId} token={token} rangeMin={rangeMin} rangeMax={rangeMax} initialEnveloppePrevue={initialEnveloppePrevue} />
        </div>
      )}

      {/* ── Trésorerie (nouveau) ─────────────────────────────────────────────── */}
      {tab === 'cockpit' && (
        <div className="flex-1 overflow-y-auto">
          <TresorerieView
            chantierId={chantierId}
            token={token}
            rangeMin={rangeMin}
            rangeMax={rangeMax}
            initialFinancing={initialFinancing as Record<string, unknown> | null}
          />
        </div>
      )}

      {/* ── Echeancier ──────────────────────────────────────────────────────── */}
      {tab === 'timeline' && (
        <div className="flex-1 overflow-y-auto p-4">
          <EcheancierRefonte chantierId={chantierId} token={token} />
        </div>
      )}

      {/* ── Preuves ──────────────────────────────────────────────────────────── */}
      {tab === 'financement' && (
        <PreuvesTab
          events={events}
          chantierId={chantierId}
          token={token}
        />
      )}

      {/* ── Artisan Drawer ──────────────────────────────────────────────────── */}
      {selectedArtisan && (
        <ArtisanDrawer
          artisan={selectedArtisan}
          markPaid={markPaid}
          markUnpaid={markUnpaid}
          onClose={() => setSelectedArtisanNom(null)}
        />
      )}
    </div>
  );
}
