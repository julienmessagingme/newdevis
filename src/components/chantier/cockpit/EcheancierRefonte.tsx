/**
 * EcheancierRefonte — Dashboard trésorerie prédictif
 * Répond à : "Vais-je avoir des difficultés de trésorerie ? Ai-je oublié de relancer ma banque ?"
 *
 * Sections :
 *  1. 4 KPI cards : Solde disponible · À payer 30j · Financement attendu · Retards
 *  2. Bandeaux d'alerte IA (tension, retards, déblocage à relancer)
 *  3. Graphique Recharts : barres entrées/sorties + courbe solde prévisionnel (14 semaines)
 *  4. Deux colonnes : Sorties (échéances artisans) | Entrées (fonds déclarés)
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ComposedChart, Bar, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import {
  AlertTriangle, Check, X, Clock, Calendar, Plus,
  Loader2, RefreshCw, AlertCircle, RotateCcw,
  Info, Paperclip, Upload, ExternalLink,
  TrendingDown, TrendingUp, Zap, BellRing, Wallet,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { usePaymentEvents, type PaymentEvent } from '@/hooks/usePaymentEvents';
import { fmtEur, fmtDateFR, fmtDateShort, daysUntil } from '@/lib/financingUtils';

// ── Supabase (token frais pour upload justificatifs) ──────────────────────────

const _sb = createClient(
  (import.meta as any).env.PUBLIC_SUPABASE_URL,
  (import.meta as any).env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
async function freshToken(fallback: string) {
  const { data: { session } } = await _sb.auth.getSession();
  return session?.access_token ?? fallback;
}

// ── Types ──────────────────────────────────────────────────────────────────────

type SourceType =
  | 'deblocage_credit' | 'aide_maprime' | 'aide_cee'
  | 'eco_ptz' | 'apport_personnel' | 'remboursement' | 'autre';
type StatutEntree = 'recu' | 'attendu';

interface EntreeChantier {
  id: string;
  montant: number;
  label: string;
  source_type: SourceType;
  date_entree: string;
  statut: StatutEntree;
  notes: string | null;
  created_at: string;
}

interface WeekBucket {
  weekLabel: string;
  weekStartStr: string;
  isCurrentWeek: boolean;
  isPast: boolean;
  entrees: number;
  sortiesNeg: number;  // valeur négative pour Recharts
  balance: number | null; // null pour les semaines passées (pas de ligne solde)
}

// ── Config sources de financement ─────────────────────────────────────────────

const SOURCE_CFG: Record<SourceType, { label: string; emoji: string }> = {
  deblocage_credit:  { label: 'Déblocage crédit',  emoji: '🏦' },
  aide_maprime:      { label: "MaPrimeRénov'",      emoji: '🏠' },
  aide_cee:          { label: 'Prime CEE',          emoji: '⚡' },
  eco_ptz:           { label: 'Éco-PTZ',            emoji: '🌱' },
  apport_personnel:  { label: 'Apport personnel',   emoji: '💰' },
  remboursement:     { label: 'Remboursement',      emoji: '↩️' },
  autre:             { label: 'Autre entrée',       emoji: '📥' },
};

// ── Helpers chart ──────────────────────────────────────────────────────────────

function fmtK(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1000) return `${Math.round(n / 1000)}k€`;
  return `${Math.round(n)}€`;
}

function buildWeekBuckets(
  events: PaymentEvent[],
  entrees: EntreeChantier[],
): { buckets: WeekBucket[]; currentBalance: number } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  // Solde actuel = reçu - payé
  const received = entrees.filter(e => e.statut === 'recu').reduce((s, e) => s + e.montant, 0);
  const paid = events.filter(e => e.status === 'paid').reduce((s, e) => s + (e.amount ?? 0), 0);
  const currentBalance = received - paid;

  // Début : lundi de la semaine courante - 1 semaine
  const startDate = new Date(today);
  const dow = startDate.getDay();
  startDate.setDate(startDate.getDate() - (dow === 0 ? 6 : dow - 1) - 7);

  let balance = currentBalance;
  const buckets: WeekBucket[] = [];

  for (let i = 0; i < 14; i++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const ws = weekStart.toISOString().slice(0, 10);
    const we = weekEnd.toISOString().slice(0, 10);
    const isPast = we < todayStr;
    const isCurrentWeek = ws <= todayStr && todayStr <= we;

    const weekEvents = events.filter(e => e.due_date && e.due_date >= ws && e.due_date <= we);
    const weekEntrees = entrees.filter(e => e.date_entree >= ws && e.date_entree <= we);

    let sortiesSum: number;
    let entreesSum: number;

    if (isPast) {
      // Passé : ce qui s'est réellement passé (informatif, pas d'impact sur la balance)
      sortiesSum = weekEvents.filter(e => e.status === 'paid').reduce((s, e) => s + (e.amount ?? 0), 0);
      entreesSum = weekEntrees.filter(e => e.statut === 'recu').reduce((s, e) => s + e.montant, 0);
    } else {
      // Futur / présent : projection
      sortiesSum = weekEvents.filter(e => e.status !== 'paid' && e.status !== 'cancelled').reduce((s, e) => s + (e.amount ?? 0), 0);

      // AFFICHAGE des barres vertes : toutes les entrées de cette semaine (recu + attendu)
      entreesSum = weekEntrees.reduce((s, e) => s + e.montant, 0);

      // CALCUL SOLDE : seulement les "attendu" — les "recu" sont déjà dans currentBalance
      const entreesForBalance = weekEntrees.filter(e => e.statut === 'attendu').reduce((s, e) => s + e.montant, 0);
      balance += entreesForBalance - sortiesSum;
    }

    buckets.push({
      weekLabel:    weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      weekStartStr: ws,
      isCurrentWeek,
      isPast,
      entrees:    entreesSum,
      sortiesNeg: -sortiesSum,
      balance:    isPast ? null : Math.round(balance),
    });
  }

  return { buckets, currentBalance };
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────

function CashflowTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const entreesVal  = payload.find((p: any) => p.dataKey === 'entrees')?.value ?? 0;
  const sortiesAbs  = Math.abs(payload.find((p: any) => p.dataKey === 'sortiesNeg')?.value ?? 0);
  const balanceVal  = payload.find((p: any) => p.dataKey === 'balance')?.value;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-xs min-w-[160px]">
      <p className="font-extrabold text-gray-700 mb-2">{label}</p>
      {entreesVal > 0 && (
        <div className="flex justify-between gap-6 text-emerald-600 mb-0.5">
          <span>↑ Entrées</span>
          <span className="font-bold tabular-nums">{fmtEur(entreesVal)}</span>
        </div>
      )}
      {sortiesAbs > 0 && (
        <div className="flex justify-between gap-6 text-rose-500 mb-0.5">
          <span>↓ Sorties</span>
          <span className="font-bold tabular-nums">{fmtEur(sortiesAbs)}</span>
        </div>
      )}
      {balanceVal != null && (
        <div className={`flex justify-between gap-6 mt-1.5 pt-1.5 border-t border-gray-100 font-extrabold ${
          balanceVal < 0 ? 'text-rose-600' : 'text-indigo-600'
        }`}>
          <span>Solde projeté</span>
          <span className="tabular-nums">{fmtEur(balanceVal)}</span>
        </div>
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

type KpiColor = 'emerald' | 'blue' | 'amber' | 'violet' | 'red' | 'gray';

function KpiCard({ title, value, sub, color, icon }: {
  title: string; value: string; sub: string; color: KpiColor; icon: React.ReactNode;
}) {
  const bg: Record<KpiColor, string> = {
    emerald: 'bg-emerald-50 border-emerald-100',
    blue:    'bg-blue-50 border-blue-100',
    amber:   'bg-amber-50 border-amber-100',
    violet:  'bg-violet-50 border-violet-100',
    red:     'bg-red-50 border-red-100',
    gray:    'bg-gray-50 border-gray-100',
  };
  const ic: Record<KpiColor, string> = {
    emerald: 'text-emerald-500', blue: 'text-blue-500', amber: 'text-amber-500',
    violet: 'text-violet-500',  red:  'text-red-500',   gray:  'text-gray-400',
  };
  const val: Record<KpiColor, string> = {
    emerald: 'text-emerald-700', blue: 'text-blue-700', amber: 'text-amber-700',
    violet: 'text-violet-700',   red:  'text-red-700',  gray:  'text-gray-400',
  };
  return (
    <div className={`rounded-2xl border p-4 ${bg[color]}`}>
      <div className={`flex items-center gap-1.5 mb-2 ${ic[color]} opacity-80`}>
        {icon}
        <span className="text-[10px] font-extrabold uppercase tracking-wider">{title}</span>
      </div>
      <p className={`text-xl font-extrabold tabular-nums ${val[color]}`}>{value}</p>
      <p className={`text-[10px] mt-0.5 opacity-60 ${ic[color]}`}>{sub}</p>
    </div>
  );
}

// ── Alert Banner ──────────────────────────────────────────────────────────────

function AlertBanner({ type, msg }: { type: 'danger' | 'warning' | 'info'; msg: string }) {
  const cfg = {
    danger:  { bg: 'bg-red-50 border-red-200',     text: 'text-red-700',    icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-500" /> },
    warning: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800',  icon: <AlertCircle   className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" /> },
    info:    { bg: 'bg-blue-50 border-blue-100',   text: 'text-blue-700',   icon: <Info          className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-400" /> },
  }[type];
  return (
    <div className={`flex gap-2.5 px-4 py-2.5 rounded-xl border text-xs leading-relaxed ${cfg.bg} ${cfg.text}`}>
      {cfg.icon}<span>{msg}</span>
    </div>
  );
}

// ── Empty block ───────────────────────────────────────────────────────────────

function EmptyBlock({ icon, title, sub, cta }: {
  icon: React.ReactNode; title: string; sub: string;
  cta?: { label: string; onClick: () => void };
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl py-8 px-6 flex flex-col items-center text-center shadow-sm gap-2">
      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center mb-1">{icon}</div>
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <p className="text-xs text-gray-400 max-w-[220px] leading-relaxed">{sub}</p>
      {cta && (
        <button onClick={cta.onClick}
          className="mt-2 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors">
          {cta.label}
        </button>
      )}
    </div>
  );
}

// ── Modal ajout entrée ────────────────────────────────────────────────────────

function AddEntreeModal({ chantierId, token, onAdded, onClose }: {
  chantierId: string; token: string; onAdded: () => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    label: '',
    montant: '',
    source_type: 'deblocage_credit' as SourceType,
    date_entree: new Date().toISOString().slice(0, 10),
    statut: 'attendu' as StatutEntree,
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label || !form.montant) return;
    setSaving(true);
    try {
      const bearer = await freshToken(token);
      const res = await fetch(`/api/chantier/${chantierId}/entrees`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, montant: parseFloat(form.montant) }),
      });
      if (res.ok) { onAdded(); onClose(); }
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-gray-900">Ajouter une entrée de fonds</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          {/* Type */}
          <div>
            <label className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider block mb-2">
              Type de financement
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(SOURCE_CFG) as [SourceType, typeof SOURCE_CFG[SourceType]][]).map(([key, cfg]) => (
                <button key={key} type="button"
                  onClick={() => { set('source_type', key); set('label', cfg.label); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-semibold transition-all text-left ${
                    form.source_type === key
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}>
                  <span className="text-base">{cfg.emoji}</span>
                  <span className="truncate">{cfg.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider block mb-1.5">
              Libellé
            </label>
            <input value={form.label} onChange={e => set('label', e.target.value)}
              placeholder={`Ex : ${SOURCE_CFG[form.source_type].label}`}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-gray-300"
              required />
          </div>

          {/* Montant + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider block mb-1.5">
                Montant (€)
              </label>
              <input type="number" inputMode="decimal" min="1" step="0.01" value={form.montant}
                onChange={e => set('montant', e.target.value)}
                placeholder="0"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"
                required />
            </div>
            <div>
              <label className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider block mb-1.5">
                Date
              </label>
              <input type="date" value={form.date_entree}
                onChange={e => set('date_entree', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
          </div>

          {/* Statut */}
          <div>
            <label className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider block mb-1.5">
              Statut
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['attendu', 'recu'] as StatutEntree[]).map(s => (
                <button key={s} type="button" onClick={() => set('statut', s)}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                    form.statut === s
                      ? s === 'recu'
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-blue-600 border-blue-600 text-white'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  {s === 'recu' ? '✓ Déjà reçu' : '⏳ Attendu / à venir'}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" disabled={saving || !form.label || !form.montant}
            className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 hover:bg-indigo-700 transition-colors">
            {saving ? 'Enregistrement…' : "Ajouter l'entrée"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Entrée Row ────────────────────────────────────────────────────────────────

function EntreeRow({ entree, onToggle, onDelete, deleting }: {
  entree: EntreeChantier;
  onToggle: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const src = SOURCE_CFG[entree.source_type] ?? SOURCE_CFG.autre;
  const isRecu = entree.statut === 'recu';
  return (
    <div className={`bg-white border rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm ${
      isRecu ? 'border-emerald-100' : 'border-gray-100'
    }`}>
      <span className="text-xl shrink-0">{src.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{entree.label}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {fmtDateShort(entree.date_entree)} · {src.label}
        </p>
      </div>
      <div className="text-right shrink-0 mr-1">
        <p className={`text-sm font-extrabold tabular-nums ${isRecu ? 'text-emerald-700' : 'text-gray-700'}`}>
          +{fmtEur(entree.montant)}
        </p>
        <button onClick={onToggle}
          className={`text-[10px] font-bold mt-0.5 px-2 py-0.5 rounded-full border transition-colors ${
            isRecu
              ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
              : 'bg-blue-50 text-blue-500 border-blue-200 hover:bg-blue-100'
          }`}>
          {isRecu ? '✓ Reçu' : '⏳ Attendu'}
        </button>
      </div>
      <button onClick={onDelete} disabled={deleting}
        className="text-gray-200 hover:text-red-400 transition-colors p-1 rounded-lg shrink-0">
        {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ── Payment Event Row (réutilisé depuis PaymentTimeline) ─────────────────────

const STATUS_CFG = {
  paid:      { dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100', label: 'Payé ✓' },
  late:      { dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700 border-red-100',             label: 'En retard' },
  pending:   { dot: 'bg-blue-400',    badge: 'bg-blue-50 text-blue-700 border-blue-100',           label: 'À venir' },
  cancelled: { dot: 'bg-gray-300',    badge: 'bg-gray-50 text-gray-400 border-gray-100',           label: 'Annulé' },
};

// ── Wizard paiement (4 étapes guidées) ───────────────────────────────────────

type WizardStep = 'confirm' | 'facture' | 'financement' | 'preuve';

// Sources de fonds disponibles dans le wizard (sous-ensemble de SOURCE_CFG)
const WIZARD_SOURCES: SourceType[] = [
  'apport_personnel', 'deblocage_credit', 'aide_maprime',
  'aide_cee', 'eco_ptz', 'autre',
];

function PaymentWizard({ ev, chantierId, token, markPaid, proofInputRef, proofUploading, setProofUploading, onClose, onDone }: {
  ev: PaymentEvent;
  chantierId: string;
  token: string;
  markPaid: (id: string) => Promise<boolean>;
  proofInputRef: React.RefObject<HTMLInputElement>;
  proofUploading: boolean;
  setProofUploading: (v: boolean) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const [step,           setStep]           = useState<WizardStep>('confirm');
  const [paying,         setPaying]         = useState(false);
  const [errMsg,         setErrMsg]         = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<SourceType | null>(null);
  const [savingSource,   setSavingSource]   = useState(false);

  // Étape 1 — Confirmation + paiement effectif
  async function handleConfirm() {
    setPaying(true);
    setErrMsg(null);
    const ok = await markPaid(ev.id);
    setPaying(false);
    if (!ok) {
      setErrMsg('Le paiement n\'a pas pu être enregistré. Vérifiez votre connexion et réessayez.');
      return;
    }
    setStep('facture');
  }

  // Étape 3 — Enregistrer la source des fonds + passer à l'étape preuve
  async function handleFinancement() {
    if (!selectedSource) { setStep('preuve'); return; }
    setSavingSource(true);
    try {
      const cfg = SOURCE_CFG[selectedSource];
      const bearer = await freshToken(token);
      await fetch(`/api/chantier/${chantierId}/entrees`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label:       cfg.label,
          montant:     ev.amount ?? 0,
          source_type: selectedSource,
          date_entree: new Date().toISOString().slice(0, 10),
          statut:      'recu',
        }),
      });
    } finally {
      setSavingSource(false);
    }
    setStep('preuve');
  }

  // Étape 4 — Upload justificatif
  async function handleProofUpload(file: File) {
    setProofUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('nom', `Justificatif — ${ev.label}`);
      fd.append('documentType', 'preuve_paiement');
      fd.append('paymentEventId', ev.id);
      const bearer = await freshToken(token);
      const res = await fetch(`/api/chantier/${chantierId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}` },
        body: fd,
      });
      if (res.ok) onDone();
    } finally {
      setProofUploading(false);
      if (proofInputRef.current) proofInputRef.current.value = '';
    }
  }

  // ── Étape 1 : Confirmation ────────────────────────────────────────────────
  if (step === 'confirm') return (
    <div className="mt-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-3 space-y-2.5">
      <p className="text-xs font-bold text-emerald-800">
        Confirmer le paiement{ev.amount != null ? ` de ${fmtEur(ev.amount)}` : ''} ?
      </p>
      {errMsg && (
        <div className="flex items-start gap-1.5 text-[11px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-2">
          <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
          {errMsg}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={handleConfirm} disabled={paying}
          className="flex items-center gap-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50 transition-colors">
          {paying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {paying ? 'Enregistrement…' : 'Oui, payé'}
        </button>
        <button type="button" onClick={onClose}
          className="flex items-center gap-1 text-xs font-semibold text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-300 transition-colors">
          <X className="h-3 w-3" /> Annuler
        </button>
      </div>
    </div>
  );

  // ── Étape 2 : Facture présente ? ──────────────────────────────────────────
  if (step === 'facture') return (
    <div className="mt-2.5 bg-blue-50 border border-blue-100 rounded-xl px-3 py-3 space-y-2.5">
      <div className="flex items-start gap-2">
        <span className="text-base">🧾</span>
        <div>
          <p className="text-xs font-bold text-blue-900">Avez-vous reçu la facture ?</p>
          <p className="text-[11px] text-blue-600 mt-0.5">
            En cas de litige ou de garantie décennale, la facture acquittée est indispensable.
          </p>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => setStep('financement')}
          className="text-[11px] font-bold bg-blue-600 text-white rounded-lg px-2.5 py-1.5 hover:bg-blue-700 transition-colors">
          ✅ Oui, je l'ai
        </button>
        <button type="button" onClick={() => setStep('financement')}
          className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 hover:bg-amber-100 transition-colors">
          ⚠️ Pas encore — je la demande
        </button>
        <button type="button" onClick={() => setStep('financement')}
          className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1.5">
          Plus tard
        </button>
      </div>
    </div>
  );

  // ── Étape 3 : Source des fonds ────────────────────────────────────────────
  if (step === 'financement') return (
    <div className="mt-2.5 bg-violet-50 border border-violet-100 rounded-xl px-3 py-3 space-y-2.5">
      <div className="flex items-start gap-2">
        <span className="text-base">💰</span>
        <div>
          <p className="text-xs font-bold text-violet-900">D'où proviennent ces fonds ?</p>
          <p className="text-[11px] text-violet-600 mt-0.5">
            Cette information sera ajoutée à votre plan de financement automatiquement.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {WIZARD_SOURCES.map(key => {
          const cfg = SOURCE_CFG[key];
          const isSelected = selectedSource === key;
          return (
            <button key={key} type="button" onClick={() => setSelectedSource(isSelected ? null : key)}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-[11px] font-semibold transition-all text-left ${
                isSelected
                  ? 'bg-violet-600 border-violet-600 text-white'
                  : 'border-gray-200 text-gray-600 bg-white hover:border-violet-300 hover:bg-violet-50'
              }`}>
              <span className="text-sm shrink-0">{cfg.emoji}</span>
              <span className="truncate">{cfg.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={handleFinancement} disabled={savingSource}
          className="flex items-center gap-1.5 text-[11px] font-bold bg-violet-600 text-white rounded-lg px-3 py-1.5 hover:bg-violet-700 disabled:opacity-50 transition-colors">
          {savingSource ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {savingSource ? 'Enregistrement…' : selectedSource ? 'Enregistrer et continuer' : 'Passer cette étape'}
        </button>
      </div>
    </div>
  );

  // ── Étape 4 : Preuve de paiement ──────────────────────────────────────────
  return (
    <div className="mt-2.5 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-3 space-y-2.5">
      <div className="flex items-start gap-2">
        <span className="text-base">🏦</span>
        <div>
          <p className="text-xs font-bold text-indigo-900">Conservez votre preuve de paiement</p>
          <p className="text-[11px] text-indigo-600 mt-0.5">
            Virement, chèque, reçu — indispensable pour activer la garantie décennale et les aides (MPR, CEE).
          </p>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => proofInputRef.current?.click()} disabled={proofUploading}
          className="flex items-center gap-1.5 text-[11px] font-bold bg-indigo-600 text-white rounded-lg px-2.5 py-1.5 hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {proofUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {proofUploading ? 'Envoi…' : 'Joindre un justificatif'}
        </button>
        <button type="button" onClick={onDone}
          className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1.5">
          Terminer
        </button>
      </div>
      <input ref={proofInputRef} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleProofUpload(f); }}
      />
      <p className="text-[10px] text-indigo-400">
        💡 Les justificatifs déposés ici apparaissent aussi dans l'onglet Preuves de l'écheancier.
      </p>
    </div>
  );
}

function PaymentEventRow({ ev, chantierId, token, confirmingId, setConfirmingId,
  proofPromptId, setProofPromptId, proofInputRef, proofUploading, setProofUploading,
  markPaid, markUnpaid, refresh }: {
  ev: PaymentEvent;
  chantierId: string;
  token: string;
  confirmingId: string | null;
  setConfirmingId: (v: string | null) => void;
  proofPromptId: string | null;
  setProofPromptId: (v: string | null) => void;
  proofInputRef: React.RefObject<HTMLInputElement>;
  proofUploading: boolean;
  setProofUploading: (v: boolean) => void;
  markPaid: (id: string) => Promise<boolean>;
  markUnpaid: (id: string) => void;
  refresh: () => void;
}) {
  const cfg      = STATUS_CFG[ev.status] ?? STATUS_CFG.pending;
  const isPaid   = ev.status === 'paid';
  const isLate   = ev.status === 'late';
  const days     = ev.due_date ? daysUntil(ev.due_date) : null;
  const isConf   = confirmingId === ev.id;

  let delayLabel = '';
  if (ev.due_date && !isPaid) {
    if (isLate)              delayLabel = `En retard de ${Math.abs(days!)} j`;
    else if (days === 0)     delayLabel = "Aujourd'hui";
    else if (days === 1)     delayLabel = 'Demain';
    else if (days !== null && days <= 7) delayLabel = `Dans ${days} jours`;
  }

  return (
    <div className={`px-4 py-3.5 ${isLate ? 'bg-red-50/40' : isPaid ? 'bg-emerald-50/20' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${cfg.dot}`} />
        <div className="flex-1 min-w-0">
          {/* Ligne 1 : label + montant */}
          <div className="flex items-baseline justify-between gap-2">
            <p className={`text-sm font-semibold leading-snug ${isPaid ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
              {ev.label}
            </p>
            {ev.amount != null && (
              <span className={`text-sm font-extrabold tabular-nums shrink-0 ${
                isLate ? 'text-red-700' : isPaid ? 'text-gray-400' : 'text-gray-900'
              }`}>
                {fmtEur(ev.amount)}
              </span>
            )}
          </div>

          {/* Artisan + source */}
          {(ev.artisan_nom || ev.lot_nom) && (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {(ev.artisan_nom || ev.lot_nom) && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  isPaid ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-600'
                }`}>
                  🔧 {ev.artisan_nom ?? ev.lot_nom}
                </span>
              )}
              {ev.source_name && (
                <span className="text-[10px] text-gray-400 truncate max-w-[150px]">
                  {ev.source_name.replace(/\.(pdf|PDF)$/, '')}
                </span>
              )}
            </div>
          )}

          {/* Date + badge + délai */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
            {ev.due_date && (
              <span className={`text-[11px] font-medium ${isLate ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                {fmtDateFR(ev.due_date)}
              </span>
            )}
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cfg.badge}`}>
              {cfg.label}
            </span>
            {delayLabel && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                isLate ? 'bg-red-100 text-red-700'
                : days !== null && days <= 3 ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-500'
              }`}>
                {delayLabel}
              </span>
            )}
          </div>

          {/* CTA Marquer payé */}
          {(ev.status === 'pending' || ev.status === 'late') && !isConf && (
            <button type="button"
              onClick={() => setConfirmingId(ev.id)}
              className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors">
              <Check className="h-3 w-3" /> Marquer payé
            </button>
          )}

          {/* ── WIZARD PAIEMENT ─────────────────────────────────── */}
          {isConf && (
            <PaymentWizard
              ev={ev}
              chantierId={chantierId}
              token={token}
              markPaid={markPaid}
              proofInputRef={proofInputRef}
              proofUploading={proofUploading}
              setProofUploading={setProofUploading}
              onClose={() => setConfirmingId(null)}
              onDone={() => { setConfirmingId(null); refresh(); }}
            />
          )}

          {/* Lien justificatif */}
          {isPaid && ev.proof_doc_id && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <Paperclip className="h-3 w-3 text-gray-300 shrink-0" />
              {ev.proof_signed_url
                ? <a href={ev.proof_signed_url} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] text-blue-600 hover:underline flex items-center gap-1">
                    {ev.proof_doc_name ?? 'Justificatif'} <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                : <span className="text-[11px] text-gray-400">{ev.proof_doc_name ?? 'Justificatif joint'}</span>
              }
            </div>
          )}

          {/* Annuler paiement */}
          {isPaid && (
            <button type="button"
              onClick={() => markUnpaid(ev.id)}
              className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-amber-600 transition-colors">
              <RotateCcw className="h-3 w-3" /> Annuler ce paiement
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function EcheancierRefonte({
  chantierId,
  token,
}: {
  chantierId: string;
  token: string;
}) {
  const { events, loading: evLoading, error: evError, refresh: refreshEvents, markPaid, markUnpaid }
    = usePaymentEvents(chantierId, token);

  const [entrees,        setEntrees]        = useState<EntreeChantier[]>([]);
  const [entreesLoading, setEntreesLoading] = useState(true);
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [confirmingId,   setConfirmingId]   = useState<string | null>(null);
  const [proofPromptId,  setProofPromptId]  = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [deletingId,     setDeletingId]     = useState<string | null>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch entrées ──────────────────────────────────────────────────────────

  const fetchEntrees = useCallback(async () => {
    if (!chantierId || !token) return;
    setEntreesLoading(true);
    try {
      const bearer = await freshToken(token);
      const res = await fetch(`/api/chantier/${chantierId}/entrees`, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (res.ok) {
        const d = await res.json();
        setEntrees(d.entrees ?? []);
      }
    } finally { setEntreesLoading(false); }
  }, [chantierId, token]);

  useEffect(() => { fetchEntrees(); }, [fetchEntrees]);

  // ── Actions entrées ────────────────────────────────────────────────────────

  const toggleEntreeStatut = useCallback(async (id: string, cur: StatutEntree) => {
    const bearer = await freshToken(token);
    const res = await fetch(`/api/chantier/${chantierId}/entrees`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, statut: cur === 'recu' ? 'attendu' : 'recu' }),
    });
    if (res.ok) fetchEntrees();
  }, [chantierId, token, fetchEntrees]);

  const deleteEntree = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      const bearer = await freshToken(token);
      const res = await fetch(`/api/chantier/${chantierId}/entrees?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (res.ok) fetchEntrees();
    } finally { setDeletingId(null); }
  }, [chantierId, token, fetchEntrees]);

  // ── Données dérivées ───────────────────────────────────────────────────────

  const { buckets, currentBalance } = useMemo(
    () => buildWeekBuckets(events, entrees),
    [events, entrees],
  );

  const kpis = useMemo(() => {
    const today  = new Date().toISOString().slice(0, 10);
    const in30   = new Date(); in30.setDate(in30.getDate() + 30);
    const in30s  = in30.toISOString().slice(0, 10);

    const aPayer30   = events
      .filter(e => e.status !== 'paid' && e.status !== 'cancelled' && e.due_date && e.due_date <= in30s)
      .reduce((s, e) => s + (e.amount ?? 0), 0);

    const aDebloquer = entrees
      .filter(e => e.statut === 'attendu')
      .reduce((s, e) => s + e.montant, 0);

    const tensionBucket = buckets.find(b => !b.isPast && b.balance !== null && b.balance < 0);
    const lateCount     = events.filter(e => e.status === 'late').length;
    const lateTotal     = events.filter(e => e.status === 'late').reduce((s, e) => s + (e.amount ?? 0), 0);

    return { aPayer30, aDebloquer, tensionBucket, lateCount, lateTotal };
  }, [events, entrees, buckets]);

  const alerts = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const in7   = new Date(); in7.setDate(in7.getDate() + 7);
    const in7s  = in7.toISOString().slice(0, 10);
    const list: { type: 'danger' | 'warning' | 'info'; msg: string }[] = [];

    if (kpis.lateCount > 0) {
      list.push({ type: 'danger', msg: `${kpis.lateCount} paiement${kpis.lateCount > 1 ? 's' : ''} en retard — ${fmtEur(kpis.lateTotal)} à régulariser` });
    }

    const soon = events.filter(e => e.status === 'pending' && e.due_date && e.due_date <= in7s && e.due_date >= today);
    if (soon.length > 0) {
      const total = soon.reduce((s, e) => s + (e.amount ?? 0), 0);
      list.push({ type: 'warning', msg: `${soon.length} paiement${soon.length > 1 ? 's' : ''} à effectuer cette semaine — ${fmtEur(total)}` });
    }

    if (kpis.tensionBucket) {
      list.push({ type: 'warning', msg: `Solde projeté insuffisant à partir de la semaine du ${fmtDateShort(kpis.tensionBucket.weekStartStr)} — pensez à enregistrer vos déblocages de financement` });
    }

    if (kpis.aDebloquer > 0 && kpis.aPayer30 > 0 && entrees.filter(e => e.statut === 'attendu').length > 0) {
      list.push({ type: 'info', msg: `${fmtEur(kpis.aDebloquer)} de financement attendu non reçu — avez-vous relancé votre banque ou les organismes d'aide ?` });
    }

    return list;
  }, [events, entrees, kpis]);

  // ── Groupage pour les listes ───────────────────────────────────────────────

  const futureEvents = events.filter(e => e.status !== 'paid' && e.status !== 'cancelled');
  const paidEvents   = events.filter(e => e.status === 'paid');

  const groupedFuture = futureEvents.reduce<Record<string, PaymentEvent[]>>((acc, ev) => {
    const key = ev.due_date
      ? new Date(ev.due_date + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      : 'Sans date';
    acc[key] = [...(acc[key] ?? []), ev];
    return acc;
  }, {});

  const todayBucket = buckets.find(b => b.isCurrentWeek);

  // ── Loader initial ─────────────────────────────────────────────────────────

  if (evLoading && entreesLoading && events.length === 0 && entrees.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Chargement de la trésorerie…</span>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 pb-10">

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          title="Solde disponible"
          value={currentBalance !== 0 ? fmtEur(currentBalance) : '—'}
          sub={currentBalance > 0 ? 'Fonds reçus nets' : currentBalance < 0 ? 'Déficit actuel' : 'Aucune entrée déclarée'}
          color={currentBalance < 0 ? 'red' : currentBalance === 0 ? 'gray' : 'emerald'}
          icon={<Wallet className="h-3.5 w-3.5" />}
        />
        <KpiCard
          title="À payer (30j)"
          value={kpis.aPayer30 > 0 ? fmtEur(kpis.aPayer30) : '—'}
          sub="Sorties prévues"
          color={kpis.aPayer30 > 0 && currentBalance > 0 && kpis.aPayer30 > currentBalance ? 'amber' : kpis.aPayer30 > 0 ? 'blue' : 'gray'}
          icon={<TrendingDown className="h-3.5 w-3.5" />}
        />
        <KpiCard
          title="À débloquer"
          value={kpis.aDebloquer > 0 ? fmtEur(kpis.aDebloquer) : '—'}
          sub={kpis.aDebloquer > 0 ? 'Financement attendu' : 'Tout reçu'}
          color={kpis.aDebloquer > 0 ? 'violet' : 'gray'}
          icon={<Zap className="h-3.5 w-3.5" />}
        />
        <KpiCard
          title="Retards"
          value={kpis.lateCount > 0 ? `${kpis.lateCount} éch.` : '—'}
          sub={kpis.lateCount > 0 ? `${fmtEur(kpis.lateTotal)} à régler` : 'Aucun retard'}
          color={kpis.lateCount > 0 ? 'red' : 'emerald'}
          icon={<BellRing className="h-3.5 w-3.5" />}
        />
      </div>

      {/* ── Alertes ── */}
      {alerts.map((a, i) => <AlertBanner key={i} type={a.type} msg={a.msg} />)}

      {/* ── Graphique ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
          <div>
            <p className="text-sm font-extrabold text-gray-900">Projection trésorerie — 14 semaines</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {entrees.filter(e => e.statut === 'recu').length === 0
                ? 'Enregistrez vos entrées (section droite) pour voir votre solde réel'
                : 'Basé sur vos fonds déclarés et vos échéances artisans'}
            </p>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-gray-400 shrink-0">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block" />Entrées
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-rose-400 inline-block" />Sorties
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-8 h-0.5 bg-indigo-400 inline-block rounded-full" />Solde
            </span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={buckets} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="35%">
            <defs>
              <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#6366f1" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="weekLabel"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              axisLine={false} tickLine={false}
              interval={1}
            />
            <YAxis
              tickFormatter={v => v === 0 ? '0' : fmtK(v)}
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              axisLine={false} tickLine={false}
              width={52}
            />
            <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1.5} />
            {todayBucket && (
              <ReferenceLine
                x={todayBucket.weekLabel}
                stroke="#6366f1"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                label={{ value: "Auj.", position: 'insideTopLeft', fontSize: 9, fill: '#6366f1', dy: -6 }}
              />
            )}
            <Tooltip content={<CashflowTooltip />} cursor={{ fill: '#f8fafc' }} />
            <Bar dataKey="entrees"    name="Entrées" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={16} />
            <Bar dataKey="sortiesNeg" name="Sorties" fill="#f43f5e" radius={[0, 0, 3, 3]} maxBarSize={16} />
            <Area
              type="monotone"
              dataKey="balance"
              name="Solde projeté"
              stroke="#6366f1"
              strokeWidth={2.5}
              fill="url(#balGrad)"
              dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#6366f1', strokeWidth: 0 }}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Deux colonnes : Sorties | Entrées ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* Sorties */}
        <div>
          <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-3 px-1">
            Sorties — échéances artisans
          </p>

          {futureEvents.length === 0 && paidEvents.length === 0 ? (
            <EmptyBlock
              icon={<Calendar className="h-5 w-5 text-blue-400" />}
              title="Aucune échéance"
              sub="Les conditions de paiement de vos devis validés apparaîtront ici automatiquement."
            />
          ) : (
            <div className="space-y-3">
              {Object.entries(groupedFuture).map(([month, evts]) => (
                <div key={month}>
                  <p className="text-[10px] font-bold text-gray-300 uppercase tracking-wider mb-2 px-1">{month}</p>
                  <div className="bg-white border border-gray-100 rounded-2xl divide-y divide-gray-50 overflow-hidden shadow-sm">
                    {evts.map(ev => (
                      <PaymentEventRow key={ev.id} ev={ev} chantierId={chantierId} token={token}
                        confirmingId={confirmingId} setConfirmingId={setConfirmingId}
                        proofPromptId={proofPromptId} setProofPromptId={setProofPromptId}
                        proofInputRef={proofInputRef} proofUploading={proofUploading} setProofUploading={setProofUploading}
                        markPaid={markPaid} markUnpaid={markUnpaid} refresh={refreshEvents}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {paidEvents.length > 0 && (
                <details className="group">
                  <summary className="flex items-center gap-1.5 text-[10px] font-bold text-gray-300 uppercase tracking-wider cursor-pointer hover:text-gray-500 px-1 list-none select-none">
                    <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                    {paidEvents.length} paiement{paidEvents.length > 1 ? 's' : ''} effectué{paidEvents.length > 1 ? 's' : ''}
                  </summary>
                  <div className="mt-2 bg-white border border-gray-100 rounded-2xl divide-y divide-gray-50 overflow-hidden shadow-sm opacity-60">
                    {paidEvents.map(ev => (
                      <PaymentEventRow key={ev.id} ev={ev} chantierId={chantierId} token={token}
                        confirmingId={confirmingId} setConfirmingId={setConfirmingId}
                        proofPromptId={proofPromptId} setProofPromptId={setProofPromptId}
                        proofInputRef={proofInputRef} proofUploading={proofUploading} setProofUploading={setProofUploading}
                        markPaid={markPaid} markUnpaid={markUnpaid} refresh={refreshEvents}
                      />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Entrées */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
              Entrées — financement &amp; remboursements
            </p>
            <button onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-colors">
              <Plus className="h-3 w-3" /> Ajouter
            </button>
          </div>

          {entrees.length === 0 ? (
            <EmptyBlock
              icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
              title="Aucune entrée déclarée"
              sub="Enregistrez vos déblocages de crédit, aides reçues, apports personnels pour voir votre solde réel dans le graphique."
              cta={{ label: '+ Ajouter une entrée', onClick: () => setShowAddModal(true) }}
            />
          ) : (
            <div className="space-y-2">
              {/* Reçues d'abord, attendues ensuite */}
              {[...entrees].sort((a, b) => {
                if (a.statut === b.statut) return a.date_entree.localeCompare(b.date_entree);
                return a.statut === 'recu' ? -1 : 1;
              }).map(e => (
                <EntreeRow key={e.id} entree={e}
                  onToggle={() => toggleEntreeStatut(e.id, e.statut)}
                  onDelete={() => deleteEntree(e.id)}
                  deleting={deletingId === e.id}
                />
              ))}
              <button onClick={() => setShowAddModal(true)}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 border border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl py-3 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Ajouter une entrée
              </button>
            </div>
          )}

          {/* Résumé entrées */}
          {entrees.length > 0 && (
            <div className="mt-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Reçu</p>
                <p className="text-base font-extrabold text-emerald-700 tabular-nums">
                  {fmtEur(entrees.filter(e => e.statut === 'recu').reduce((s, e) => s + e.montant, 0))}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Attendu</p>
                <p className="text-base font-extrabold text-indigo-600 tabular-nums">
                  {fmtEur(entrees.filter(e => e.statut === 'attendu').reduce((s, e) => s + e.montant, 0))}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Refresh ── */}
      <button type="button" onClick={() => { refreshEvents(); fetchEntrees(); }}
        className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 py-2 transition-colors">
        <RefreshCw className="h-3 w-3" /> Actualiser
      </button>

      {showAddModal && (
        <AddEntreeModal
          chantierId={chantierId}
          token={token}
          onAdded={fetchEntrees}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
