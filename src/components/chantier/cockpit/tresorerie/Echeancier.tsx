/**
 * Echeancier — Dashboard trésorerie prédictif
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
  ChevronDown,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { usePaymentEvents, type PaymentEvent } from '@/hooks/usePaymentEvents';
import { fmtEur, fmtDateFR, fmtDateShort, daysUntil } from '@/lib/chantier/financingUtils';
import DepenseRapideModal from '../budget/DepenseRapideModal';
import type { LotChantier } from '@/types/chantier-ia';
import { useIsMobile } from '@/hooks/useIsMobile';
import EcheancierMobile from './EcheancierMobile';

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

// ── Mapping source → catégorie (dupliqué depuis TresorerieView pour cohérence) ─
const SRC_TO_CAT_LOCAL: Record<string, 'apport' | 'credit' | 'aides'> = {
  apport_personnel: 'apport', remboursement: 'apport', autre: 'apport',
  deblocage_credit: 'credit', eco_ptz: 'credit',
  aide_maprime: 'aides', aide_cee: 'aides',
};

interface CoherenceAlert {
  cat: 'credit' | 'aides';
  catLabel: string;
  newTotal: number;
  planAmount: number;
}

export function AddEntreeModal({ chantierId, token, onAdded, onClose }: {
  chantierId: string; token: string; onAdded: () => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    label: SOURCE_CFG['deblocage_credit'].label,
    montant: '',
    source_type: 'deblocage_credit' as SourceType,
    date_entree: new Date().toISOString().slice(0, 10),
    statut: 'attendu' as StatutEntree,
  });
  const [saving, setSaving] = useState(false);
  const [coherenceAlert, setCoherenceAlert] = useState<CoherenceAlert | null>(null);
  const [updatingPlan, setUpdatingPlan] = useState(false);

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.montant) return;
    const effectiveLabel = form.label.trim() || SOURCE_CFG[form.source_type].label;
    setSaving(true);
    try {
      const bearer = await freshToken(token);
      const res = await fetch(`/api/chantier/${chantierId}/entrees`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, label: effectiveLabel, montant: parseFloat(form.montant) }),
      });
      if (!res.ok) return;

      // Entrée sauvegardée → notifier le parent (rafraîchit la liste)
      onAdded();

      // ── Vérification cohérence avec le plan de financement ──────────────────
      const cat = SRC_TO_CAT_LOCAL[form.source_type];
      if (cat === 'credit' || cat === 'aides') {
        try {
          // Re-fetch toutes les entrées pour avoir le nouveau total
          const entrRes = await fetch(`/api/chantier/${chantierId}/entrees`, {
            headers: { Authorization: `Bearer ${bearer}` },
          });
          if (entrRes.ok) {
            const { entrees } = await entrRes.json() as { entrees: { source_type: string; montant: number }[] };
            const newTotal = entrees
              .filter(e => SRC_TO_CAT_LOCAL[e.source_type] === cat)
              .reduce((s, e) => s + e.montant, 0);

            // Lire le plan depuis localStorage
            const planKey  = `tresorerie_v3_${chantierId}`;
            const planSaved = localStorage.getItem(planKey);
            const plan = planSaved ? JSON.parse(planSaved) : {};
            const planAmount = cat === 'credit'
              ? (plan.creditMontant ?? 0)
              : ((plan.maprimeOn ? (plan.maprime ?? 0) : 0)
               + (plan.ceeOn    ? (plan.cee    ?? 0) : 0)
               + (plan.ecoptzOn ? (plan.ecoptz ?? 0) : 0));

            if (planAmount > 0 && newTotal > planAmount * 1.01) {
              // Montrer la confirmation AVANT de fermer
              setCoherenceAlert({
                cat,
                catLabel: cat === 'credit' ? 'crédit bancaire' : 'aides & subventions',
                newTotal,
                planAmount,
              });
              setSaving(false);
              return; // ne pas fermer encore
            }
          }
        } catch { /* non-bloquant — fermeture normale */ }
      }

      onClose();
    } finally { setSaving(false); }
  }

  async function confirmUpdatePlan() {
    if (!coherenceAlert) return;
    setUpdatingPlan(true);
    try {
      const bearer = await freshToken(token);
      const planKey = `tresorerie_v3_${chantierId}`;
      const planSaved = localStorage.getItem(planKey);
      const current = planSaved ? JSON.parse(planSaved) : {};
      const updated = coherenceAlert.cat === 'credit'
        ? { ...current, creditMontant: coherenceAlert.newTotal }
        : current; // pour les aides, on ne modifie pas auto (trop complexe, renvoi vers onglet)
      localStorage.setItem(planKey, JSON.stringify(updated));
      // Sync serveur
      await fetch(`/api/chantier/${chantierId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadonnees: { tresoreieFinancing: updated } }),
      });
    } catch { /* non-bloquant */ } finally { setUpdatingPlan(false); }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-gray-900">
            {coherenceAlert ? '⚠️ Plan de financement à mettre à jour' : 'Ajouter une entrée de fonds'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Étape de confirmation cohérence ──────────────────── */}
        {coherenceAlert && (
          <div className="p-5 space-y-4">
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 space-y-1.5">
              <p className="text-[12px] font-bold text-amber-800">
                Vos entrées {coherenceAlert.catLabel} ({fmtEur(coherenceAlert.newTotal)}) dépassent le montant configuré dans votre plan ({fmtEur(coherenceAlert.planAmount)}).
              </p>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                Souhaitez-vous mettre à jour le plan de financement avec le montant réel ?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={confirmUpdatePlan} disabled={updatingPlan}
                className="py-2.5 rounded-xl bg-amber-600 text-white text-[12px] font-bold hover:bg-amber-700 transition-colors disabled:opacity-50">
                {updatingPlan ? 'Mise à jour…' : `✓ Oui, mettre à jour → ${fmtEur(coherenceAlert.newTotal)}`}
              </button>
              <button onClick={onClose}
                className="py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[12px] font-semibold hover:bg-gray-50 transition-colors">
                Garder le plan actuel
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center">
              L'entrée a bien été enregistrée. Cette question concerne uniquement votre plan prévisionnel.
            </p>
          </div>
        )}

        {/* ── Formulaire principal ──────────────────────────────── */}
        {!coherenceAlert && <form onSubmit={submit} className="p-5 space-y-4">
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
              placeholder={SOURCE_CFG[form.source_type].label}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-gray-300" />
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

          <button type="submit" disabled={saving || !form.montant}
            className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 hover:bg-indigo-700 transition-colors">
            {saving ? 'Enregistrement…' : "Ajouter l'entrée"}
          </button>
        </form>}
      </div>
    </div>
  );
}

// ── Entrée Row ────────────────────────────────────────────────────────────────

function EntreeRow({ entree, onToggle, onDelete, onSave, deleting }: {
  entree: EntreeChantier;
  onToggle: () => void;
  onDelete: () => void;
  onSave: (patch: Partial<EntreeChantier>) => Promise<void>;
  deleting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [draft, setDraft] = useState({
    label:       entree.label,
    montant:     String(entree.montant),
    date_entree: entree.date_entree,
    source_type: entree.source_type,
    statut:      entree.statut,
  });

  // Sync draft quand l'entrée change depuis l'extérieur
  useEffect(() => {
    setDraft({
      label:       entree.label,
      montant:     String(entree.montant),
      date_entree: entree.date_entree,
      source_type: entree.source_type,
      statut:      entree.statut,
    });
  }, [entree]);

  function openEdit(e: React.MouseEvent) {
    // Ne pas ouvrir si clic sur toggle statut ou delete
    if ((e.target as HTMLElement).closest('[data-no-edit]')) return;
    setEditing(true);
  }

  async function handleSave() {
    const montantNum = parseFloat(draft.montant.replace(/\s/g, '').replace(',', '.'));
    if (isNaN(montantNum) || montantNum <= 0) return;
    const effectiveLabel = draft.label.trim() || SOURCE_CFG[draft.source_type as SourceType]?.label || entree.label;
    setSaving(true);
    try {
      await onSave({
        label:       effectiveLabel,
        montant:     montantNum,
        date_entree: draft.date_entree,
        source_type: draft.source_type,
        statut:      draft.statut,
      });
      setEditing(false);
    } finally { setSaving(false); }
  }

  function handleCancel() {
    setDraft({
      label:       entree.label,
      montant:     String(entree.montant),
      date_entree: entree.date_entree,
      source_type: entree.source_type,
      statut:      entree.statut,
    });
    setEditing(false);
  }

  const src    = SOURCE_CFG[entree.source_type] ?? SOURCE_CFG.autre;
  const isRecu = entree.statut === 'recu';

  /* ── Mode édition ── */
  if (editing) {
    return (
      <div className="bg-white border-2 border-indigo-200 rounded-xl p-4 shadow-sm space-y-3">
        {/* Type */}
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.entries(SOURCE_CFG) as [SourceType, typeof SOURCE_CFG[SourceType]][]).map(([key, cfg]) => (
            <button key={key} type="button"
              onClick={() => setDraft(d => ({
                ...d,
                source_type: key,
                label: d.label === SOURCE_CFG[d.source_type as SourceType]?.label ? cfg.label : d.label,
              }))}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold transition-all ${
                draft.source_type === key
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
              }`}>
              <span>{cfg.emoji}</span>
              <span className="truncate">{cfg.label}</span>
            </button>
          ))}
        </div>

        {/* Libellé */}
        <input
          value={draft.label}
          onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
          placeholder={SOURCE_CFG[draft.source_type as SourceType]?.label}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"
        />

        {/* Montant + Date */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[9px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Montant (€)</label>
            <input
              value={draft.montant}
              onChange={e => setDraft(d => ({ ...d, montant: e.target.value }))}
              inputMode="decimal"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div className="flex-1">
            <label className="text-[9px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Date</label>
            <input
              type="date"
              value={draft.date_entree}
              onChange={e => setDraft(d => ({ ...d, date_entree: e.target.value }))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
        </div>

        {/* Statut */}
        <div className="flex gap-2">
          {(['attendu', 'recu'] as StatutEntree[]).map(s => (
            <button key={s} type="button"
              onClick={() => setDraft(d => ({ ...d, statut: s }))}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                draft.statut === s
                  ? s === 'recu' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-indigo-600 border-indigo-600 text-white'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}>
              {s === 'recu' ? '✓ Déjà reçu' : '⏳ Attendu / à venir'}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-[12px] font-bold disabled:opacity-50 hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Sauvegarder
          </button>
          <button onClick={handleCancel}
            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-500 text-[12px] font-semibold hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button data-no-edit onClick={onDelete} disabled={deleting}
            className="p-2 rounded-lg border border-red-100 text-red-300 hover:text-red-500 hover:border-red-300 transition-colors">
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    );
  }

  /* ── Mode lecture — clic sur la ligne pour éditer ── */
  return (
    <div
      onClick={openEdit}
      className={`bg-white border rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all group ${
        isRecu ? 'border-emerald-100' : 'border-gray-100'
      }`}>
      <span className="text-xl shrink-0">{src.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-indigo-700 transition-colors">{entree.label}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {fmtDateShort(entree.date_entree)} · {src.label}
        </p>
      </div>
      <div className="text-right shrink-0 mr-1">
        <p className={`text-sm font-extrabold tabular-nums ${isRecu ? 'text-emerald-700' : 'text-gray-700'}`}>
          +{fmtEur(entree.montant)}
        </p>
        <button data-no-edit onClick={e => { e.stopPropagation(); onToggle(); }}
          className={`text-[10px] font-bold mt-0.5 px-2 py-0.5 rounded-full border transition-colors ${
            isRecu
              ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
              : 'bg-blue-50 text-blue-500 border-blue-200 hover:bg-blue-100'
          }`}>
          {isRecu ? '✓ Reçu' : '⏳ Attendu'}
        </button>
      </div>
      <button data-no-edit onClick={e => { e.stopPropagation(); onDelete(); }} disabled={deleting}
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

// ── Payment Detail Panel — détail + édition + split d'une échéance ────────────

function PaymentDetailPanel({ ev, allEvents, chantierId, token, onClose, onRefresh, onMarkPaid }: {
  ev:         PaymentEvent;
  allEvents:  PaymentEvent[];
  chantierId: string;
  token:      string;
  onClose:    () => void;
  onRefresh:  () => void;
  onMarkPaid: () => void;  // ouvre le wizard existant
}) {
  const originalAmount = ev.amount ?? ev.amount_estimate ?? 0;

  const [label,         setLabel]         = useState(ev.label);
  const [amount,        setAmount]        = useState(String(Math.round(originalAmount)));
  const [dueDate,       setDueDate]       = useState(ev.due_date ?? '');
  const [remainDate,    setRemainDate]    = useState('');
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');

  // ── Context : autres termes du même document ──
  const siblings = allEvents.filter(
    e => e.source_id && e.source_id === ev.source_id && e.id !== ev.id && e.status !== 'cancelled',
  );
  const alreadyPaid = siblings.filter(e => e.status === 'paid').reduce((s, e) => s + (e.amount ?? 0), 0);
  const otherPending = siblings.filter(e => e.status !== 'paid').reduce((s, e) => s + (e.amount ?? e.amount_estimate ?? 0), 0);
  const docTotal    = alreadyPaid + otherPending + originalAmount;

  // ── Calcul du reste si split ──
  const newAmount   = parseFloat(amount.replace(/\s/g, '').replace(',', '.'));
  const isValidAmt  = !isNaN(newAmount) && newAmount > 0;
  const remainder   = isValidAmt ? Math.round((originalAmount - newAmount) * 100) / 100 : 0;
  const hasSplit    = isValidAmt && remainder > 1 && newAmount < originalAmount * 0.99;

  async function handleSave() {
    if (!isValidAmt) { setError('Montant invalide'); return; }
    if (hasSplit && !remainDate) { setError('Indiquez la date du solde restant'); return; }
    setError('');
    setSaving(true);
    try {
      const bearer = await freshToken(token);

      // 1. Modifier l'échéance courante
      const patch: Record<string, unknown> = {
        id: ev.id,
        label: label.trim() || ev.label,
        amount: newAmount,
      };
      if (dueDate) patch.due_date = dueDate;

      const r1 = await fetch(`/api/chantier/${chantierId}/payment-events`, {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      });
      if (!r1.ok) { setError('Erreur lors de la modification'); setSaving(false); return; }

      // 2. Si split → créer un nouveau terme pour le solde restant
      if (hasSplit && ev.source_id && ev.origin === 'document') {
        const splitLabel = `Solde restant — ${label.trim() || ev.label}`;
        await fetch(`/api/chantier/${chantierId}/payment-events`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            addToDocument: true,
            documentId:    ev.source_id,
            label:         splitLabel,
            amount:        remainder,
            dueDate:       remainDate,
          }),
        });
      }

      onRefresh();
      onClose();
    } finally { setSaving(false); }
  }

  const isPaid = ev.status === 'paid';

  return (
    <div className="mt-2 rounded-xl border-2 border-indigo-100 bg-indigo-50/30 p-4 space-y-4">

      {/* ── Contexte document ── */}
      {docTotal > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Total facture',  val: docTotal,       color: 'text-gray-700' },
            { label: 'Déjà payé',      val: alreadyPaid,    color: 'text-emerald-700' },
            { label: 'Cette échéance', val: originalAmount, color: 'text-indigo-700' },
          ].map(({ label: l, val, color }) => (
            <div key={l} className="bg-white rounded-lg px-3 py-2 text-center border border-gray-100">
              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{l}</p>
              <p className={`text-sm font-extrabold tabular-nums ${color}`}>{fmtEur(val)}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Autres échéances ── */}
      {siblings.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Autres échéances</p>
          {siblings.map(s => (
            <div key={s.id} className="flex items-center justify-between text-[11px] bg-white rounded-lg px-3 py-1.5 border border-gray-100">
              <span className={`truncate flex-1 ${s.status === 'paid' ? 'line-through text-gray-400' : 'text-gray-700'}`}>{s.label}</span>
              <span className="text-gray-400 mx-2">{s.due_date ? fmtDateShort(s.due_date) : '—'}</span>
              <span className={`font-bold tabular-nums shrink-0 ${s.status === 'paid' ? 'text-emerald-600' : 'text-gray-700'}`}>
                {s.status === 'paid' ? '✓ ' : ''}{fmtEur(s.amount ?? s.amount_estimate ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Formulaire édition ── */}
      {!isPaid && (
        <div className="space-y-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Modifier cette échéance</p>

          {/* Libellé */}
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Libellé"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-indigo-200"
          />

          {/* Montant + Date */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                Montant (€)
                {docTotal > 0 && isValidAmt && (
                  <span className="ml-1 normal-case font-normal text-gray-400">
                    = {Math.round((newAmount / docTotal) * 100)}% du total
                  </span>
                )}
              </label>
              <input
                value={amount}
                onChange={e => setAmount(e.target.value)}
                inputMode="decimal"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="flex-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Date prévue</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>

          {/* Solde restant — affiché si montant réduit */}
          {hasSplit && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-base">📋</span>
                <p className="text-[11px] font-bold text-amber-800">
                  Solde restant : {fmtEur(remainder)} — une nouvelle échéance sera créée
                </p>
              </div>
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-amber-600 block mb-1">
                  Date du solde restant <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={remainDate}
                  onChange={e => setRemainDate(e.target.value)}
                  className="w-full text-sm border border-amber-300 rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>
            </div>
          )}

          {error && <p className="text-[11px] text-red-500 font-semibold">{error}</p>}

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-[12px] font-bold disabled:opacity-50 hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {hasSplit ? 'Modifier + créer solde restant' : 'Sauvegarder'}
            </button>
            <button onClick={onMarkPaid} data-no-detail
              className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-[12px] font-bold hover:bg-emerald-700 transition-colors whitespace-nowrap flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" /> Payé
            </button>
          </div>
        </div>
      )}

      {/* ── Fermer ── */}
      <button onClick={onClose}
        className="w-full text-[11px] text-gray-400 hover:text-gray-600 py-1 transition-colors">
        Fermer ↑
      </button>
    </div>
  );
}

// ── Wizard paiement (4 étapes guidées) ───────────────────────────────────────

type WizardStep = 'confirm' | 'facture' | 'financement' | 'preuve';

function PaymentWizard({ ev, chantierId, token, markPaid, proofInputRef, proofUploading, setProofUploading,
  onClose, onDone, entrees, allEvents }: {
  ev: PaymentEvent;
  chantierId: string;
  token: string;
  markPaid: (id: string, amount?: number) => Promise<boolean>;
  proofInputRef: React.RefObject<HTMLInputElement>;
  proofUploading: boolean;
  setProofUploading: (v: boolean) => void;
  onClose: () => void;
  onDone: () => void;
  entrees: EntreeChantier[];
  allEvents: PaymentEvent[];
}) {
  const [step,              setStep]            = useState<WizardStep>('confirm');
  const [paying,            setPaying]          = useState(false);
  const [errMsg,            setErrMsg]          = useState<string | null>(null);
  const [selectedEntreeId,  setSelectedEntreeId]= useState<string | null>(null);
  const [savingSource,      setSavingSource]    = useState(false);
  // Montant modifiable — pré-rempli avec le montant prévu, éditable par l'utilisateur
  const [editedAmount,      setEditedAmount]    = useState<string>(
    ev.amount != null ? String(ev.amount) : '',
  );

  // Solde restant par entrée = montant - somme des paiements déjà liés à cette entrée (autres que cet event)
  const consumedById = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const e of allEvents) {
      if (e.status === 'paid' && e.funding_source_id && e.id !== ev.id) {
        acc[e.funding_source_id] = (acc[e.funding_source_id] ?? 0) + (e.amount ?? 0);
      }
    }
    return acc;
  }, [allEvents, ev.id]);

  const entreesWithRemaining = useMemo(() =>
    entrees.map(e => ({ ...e, remaining: Math.max(0, e.montant - (consumedById[e.id] ?? 0)) })),
  [entrees, consumedById]);

  // Étape 1 — Confirmation + paiement effectif
  async function handleConfirm() {
    setPaying(true);
    setErrMsg(null);
    // Montant réellement payé (peut différer du montant prévu)
    const parsedAmount = editedAmount !== ''
      ? parseFloat(editedAmount.replace(',', '.'))
      : undefined;
    const ok = await markPaid(ev.id, parsedAmount && !isNaN(parsedAmount) ? parsedAmount : undefined);
    setPaying(false);
    if (!ok) {
      setErrMsg('Le paiement n\'a pas pu être enregistré. Vérifiez votre connexion et réessayez.');
      return;
    }
    setStep('facture');
  }

  // Étape 3 — Lier le paiement à une entrée de financement existante
  async function handleFinancement() {
    if (!selectedEntreeId) { setStep('preuve'); return; }
    setSavingSource(true);
    try {
      const bearer = await freshToken(token);
      await fetch(`/api/chantier/${chantierId}/payment-events`, {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: ev.id, funding_source_id: selectedEntreeId }),
      });
    } finally {
      setSavingSource(false);
    }
    setStep('preuve');
  }

  // Étape 2 — "Pas encore de facture" → crée un conseil agent non bloquant
  function handlePasEncoreFacture() {
    const amtStr = ev.amount != null ? ` (${fmtEur(ev.amount)})` : '';
    const artisan = ev.artisan_nom ?? ev.lot_nom ?? 'l\'artisan';
    freshToken(token).then(bearer =>
      fetch(`/api/chantier/${chantierId}/agent-insights`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type:     'risk_detected',
          severity: 'warning',
          title:    `Facture manquante — ${ev.artisan_nom ?? ev.lot_nom ?? ev.label}`,
          content:  `Le paiement${amtStr} pour « ${ev.label} » a été enregistré mais aucune facture n'a encore été reçue. Demandez la facture acquittée à ${artisan} pour activer la garantie décennale et les aides (MPR, CEE).`,
        }),
      }).catch(() => {})
    );
    setStep('financement');
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
      <p className="text-xs font-bold text-emerald-800">Confirmer le paiement</p>

      {/* Montant éditable */}
      <div className="flex items-center gap-2">
        <label className="text-[11px] text-emerald-700 font-medium shrink-0">Montant payé :</label>
        <div className="flex items-center gap-1 bg-white border border-emerald-200 rounded-lg px-2.5 py-1.5 focus-within:border-emerald-400 transition-colors">
          <input
            type="number"
            inputMode="decimal"
            value={editedAmount}
            onChange={e => setEditedAmount(e.target.value)}
            placeholder="0"
            className="w-24 text-sm font-bold text-gray-900 bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-xs text-gray-400 font-medium">€</span>
        </div>
        {ev.amount != null && editedAmount !== '' && parseFloat(editedAmount.replace(',', '.')) !== ev.amount && (
          <span className="text-[10px] text-amber-600 font-semibold">
            prévu : {fmtEur(ev.amount)}
          </span>
        )}
      </div>

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
          {paying ? 'Enregistrement…' : 'Confirmer le paiement'}
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
        <button type="button" onClick={handlePasEncoreFacture}
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
          <p className="text-xs font-bold text-violet-900">Sur quelle enveloppe ce paiement s'impute ?</p>
          <p className="text-[11px] text-violet-600 mt-0.5">
            Vos jauges de financement seront mises à jour automatiquement.
          </p>
        </div>
      </div>

      {entreesWithRemaining.length === 0 ? (
        <p className="text-[11px] text-gray-400 italic">
          Aucune source de financement déclarée — ajoutez-en une dans l'onglet Entrées pour suivre la consommation par enveloppe.
        </p>
      ) : (
        <div className="space-y-1.5">
          {entreesWithRemaining.map(e => {
            const src = SOURCE_CFG[e.source_type] ?? SOURCE_CFG.autre;
            const isSelected = selectedEntreeId === e.id;
            const pctUsed = e.montant > 0 ? Math.min(100, Math.round(((e.montant - e.remaining) / e.montant) * 100)) : 0;
            return (
              <button key={e.id} type="button"
                onClick={() => setSelectedEntreeId(isSelected ? null : e.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'bg-violet-600 border-violet-600 text-white'
                    : 'border-gray-200 bg-white hover:border-violet-300 hover:bg-violet-50 text-gray-700'
                }`}>
                <span className="text-base shrink-0">{src.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-[11px] font-semibold truncate ${isSelected ? 'text-white' : 'text-gray-700'}`}>{e.label}</p>
                  <div className={`flex items-center gap-1.5 mt-0.5 ${isSelected ? 'text-violet-200' : 'text-gray-400'}`}>
                    <div className={`h-1 flex-1 rounded-full overflow-hidden ${isSelected ? 'bg-violet-400' : 'bg-gray-100'}`}>
                      <div className={`h-full rounded-full ${isSelected ? 'bg-violet-200' : 'bg-violet-300'}`}
                        style={{ width: `${pctUsed}%` }} />
                    </div>
                    <span className="text-[10px] shrink-0">{pctUsed}% utilisé</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-extrabold tabular-nums ${
                    isSelected ? 'text-white' : e.remaining > 0 ? 'text-violet-700' : 'text-gray-300'
                  }`}>
                    {fmtEur(e.remaining)}
                  </p>
                  <p className={`text-[9px] ${isSelected ? 'text-violet-200' : 'text-gray-400'}`}>
                    restant / {fmtEur(e.montant)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={handleFinancement} disabled={savingSource}
          className="flex items-center gap-1.5 text-[11px] font-bold bg-violet-600 text-white rounded-lg px-3 py-1.5 hover:bg-violet-700 disabled:opacity-50 transition-colors">
          {savingSource ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {savingSource ? 'Enregistrement…' : selectedEntreeId ? 'Lier et continuer' : 'Passer cette étape'}
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
  markPaid, markUnpaid, refresh, entrees, allEvents }: {
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
  markPaid: (id: string, amount?: number) => Promise<boolean>;
  markUnpaid: (id: string) => void;
  refresh: () => void;
  entrees: EntreeChantier[];
  allEvents: PaymentEvent[];
}) {
  const [detailOpen, setDetailOpen] = useState(false);

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

  function handleRowClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-no-detail]')) return;
    setDetailOpen(d => !d);
    // Fermer le wizard si ouvert
    if (confirmingId === ev.id) setConfirmingId(null);
  }

  return (
    <div className={`${isLate ? 'bg-red-50/40' : isPaid ? 'bg-emerald-50/20' : ''}`}>
      {/* ── Ligne principale — cliquable ── */}
      <div
        className={`group px-4 py-3.5 cursor-pointer transition-colors ${detailOpen ? 'bg-indigo-50/40' : 'hover:bg-gray-50/60'}`}
        onClick={handleRowClick}
        title="Cliquer pour modifier ou splitter cette échéance"
      >
        <div className="flex items-start gap-3">
          <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${cfg.dot}`} />
          <div className="flex-1 min-w-0">
            {/* Ligne 1 : label + montant + chevron */}
            <div className="flex items-baseline justify-between gap-2">
              <p className={`text-sm font-semibold leading-snug ${isPaid ? 'text-gray-400 line-through' : detailOpen ? 'text-indigo-700' : 'text-gray-800'}`}>
                {ev.label}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                {ev.amount != null ? (
                  <span className={`text-sm font-extrabold tabular-nums ${
                    isLate ? 'text-red-700' : isPaid ? 'text-gray-400' : 'text-gray-900'
                  }`}>
                    {fmtEur(ev.amount)}
                  </span>
                ) : ev.amount_estimate != null ? (
                  <span className="flex items-center gap-1" title="Solde estimé = montant total − acomptes">
                    <span className="text-sm font-extrabold tabular-nums text-amber-600">
                      {fmtEur(ev.amount_estimate)}
                    </span>
                    <span className="text-[9px] font-bold text-amber-400 bg-amber-50 border border-amber-100 rounded px-1 py-0.5 leading-none">
                      estimé
                    </span>
                  </span>
                ) : null}
                <ChevronDown className={`h-3.5 w-3.5 transition-all ${detailOpen ? 'rotate-180 text-indigo-500' : 'text-gray-400 group-hover:text-indigo-400'}`} />
              </div>
            </div>

            {/* Artisan + source */}
            {(ev.artisan_nom || ev.lot_nom) && (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  isPaid ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-600'
                }`}>
                  🔧 {ev.artisan_nom ?? ev.lot_nom}
                </span>
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

            {/* CTA Marquer payé — masqué si detail ouvert (bouton dans le panel) */}
            {(ev.status === 'pending' || ev.status === 'late') && !isConf && !detailOpen && (
              <button type="button" data-no-detail
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
                onDone={() => { setConfirmingId(null); setDetailOpen(false); refresh(); }}
                entrees={entrees}
                allEvents={allEvents}
              />
            )}

            {/* Lien justificatif */}
            {isPaid && ev.proof_doc_id && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <Paperclip className="h-3 w-3 text-gray-300 shrink-0" />
                {ev.proof_signed_url
                  ? <a href={ev.proof_signed_url} target="_blank" rel="noopener noreferrer" data-no-detail
                      className="text-[11px] text-blue-600 hover:underline flex items-center gap-1">
                      {ev.proof_doc_name ?? 'Justificatif'} <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  : <span className="text-[11px] text-gray-400">{ev.proof_doc_name ?? 'Justificatif joint'}</span>
                }
              </div>
            )}

            {/* Annuler paiement */}
            {isPaid && (
              <button type="button" data-no-detail
                onClick={() => markUnpaid(ev.id)}
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-amber-200 text-amber-600 bg-amber-50 hover:bg-amber-100 transition-colors">
                <RotateCcw className="h-3 w-3" /> Remettre en attente
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Panel détail / édition ── */}
      {detailOpen && (
        <div className="px-4 pb-4">
          <PaymentDetailPanel
            ev={ev}
            allEvents={allEvents}
            chantierId={chantierId}
            token={token}
            onClose={() => setDetailOpen(false)}
            onRefresh={() => { refresh(); setDetailOpen(false); }}
            onMarkPaid={() => { setDetailOpen(false); setConfirmingId(ev.id); }}
          />
        </div>
      )}
    </div>
  );
}

// ── Registre paiements — accordéon + filtres ─────────────────────────────────

type PaidSort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

function PaidEventsAccordion({
  paidEvents, chantierId, token,
  confirmingId, setConfirmingId,
  proofPromptId, setProofPromptId,
  proofInputRef, proofUploading, setProofUploading,
  markPaid, markUnpaid, refreshEvents,
  entrees, allEvents,
}: {
  paidEvents: PaymentEvent[];
  chantierId: string;
  token: string;
  confirmingId: string | null;
  setConfirmingId: (v: string | null) => void;
  proofPromptId: string | null;
  setProofPromptId: (v: string | null) => void;
  proofInputRef: React.RefObject<HTMLInputElement>;
  proofUploading: boolean;
  setProofUploading: (v: boolean) => void;
  markPaid: (id: string) => void;
  markUnpaid: (id: string) => void;
  refreshEvents: () => void;
  entrees: EntreeChantier[];
  allEvents: PaymentEvent[];
}) {
  const [open,        setOpen]        = useState(false);
  const [sort,        setSort]        = useState<PaidSort>('date_desc');
  const [filterArtisan, setFilterArtisan] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const artisans = useMemo(() => {
    const names = [...new Set(paidEvents.map(e => e.artisan_nom ?? e.lot_nom ?? '—'))].filter(Boolean);
    return names.sort();
  }, [paidEvents]);

  const filtered = useMemo(() => {
    let list = [...paidEvents];
    if (filterArtisan) list = list.filter(e => (e.artisan_nom ?? e.lot_nom) === filterArtisan);
    list.sort((a, b) => {
      if (sort === 'date_desc')   return (b.due_date ?? '').localeCompare(a.due_date ?? '');
      if (sort === 'date_asc')    return (a.due_date ?? '').localeCompare(b.due_date ?? '');
      if (sort === 'amount_desc') return (b.amount ?? 0) - (a.amount ?? 0);
      return (a.amount ?? 0) - (b.amount ?? 0);
    });
    return list;
  }, [paidEvents, sort, filterArtisan]);

  const total = paidEvents.reduce((s, e) => s + (e.amount ?? 0), 0);

  return (
    <div className="border border-emerald-100 rounded-2xl overflow-hidden bg-white shadow-sm">
      {/* En-tête accordéon */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-emerald-50/60 transition-colors"
      >
        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1.5">
          <Check className="h-3 w-3" />
          Registre des paiements effectués
          <span className="bg-emerald-100 text-emerald-700 rounded-full px-1.5 py-0.5 font-bold">
            {paidEvents.length}
          </span>
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs font-extrabold text-emerald-700 tabular-nums">{fmtEur(total)}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-emerald-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="border-t border-emerald-50">
          {/* Barre filtres */}
          <div className="px-3 py-2 border-b border-gray-50 flex items-center gap-2 flex-wrap">
            {/* Filtre artisan */}
            <select
              value={filterArtisan}
              onChange={e => setFilterArtisan(e.target.value)}
              className="text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400 flex-1 min-w-0"
            >
              <option value="">Tous les artisans</option>
              {artisans.map(a => <option key={a} value={a}>{a}</option>)}
            </select>

            {/* Tri */}
            <select
              value={sort}
              onChange={e => setSort(e.target.value as PaidSort)}
              className="text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400 shrink-0"
            >
              <option value="date_desc">Date ↓</option>
              <option value="date_asc">Date ↑</option>
              <option value="amount_desc">Montant ↓</option>
              <option value="amount_asc">Montant ↑</option>
            </select>
          </div>

          {/* Liste filtrée */}
          {filtered.length === 0 ? (
            <p className="text-[11px] text-gray-400 text-center py-6">Aucun paiement pour ce filtre</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map(ev => (
                <PaymentEventRow key={ev.id} ev={ev} chantierId={chantierId} token={token}
                  confirmingId={confirmingId} setConfirmingId={setConfirmingId}
                  proofPromptId={proofPromptId} setProofPromptId={setProofPromptId}
                  proofInputRef={proofInputRef} proofUploading={proofUploading} setProofUploading={setProofUploading}
                  markPaid={markPaid} markUnpaid={markUnpaid} refresh={refreshEvents}
                  entrees={entrees} allEvents={allEvents}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

// ── Wrapper routing mobile/desktop (M3 — refonte mobile cockpit GMC) ────────
// Sur mobile, vue timeline verticale épurée + FAB pour ajout rapide.
// On wrap pour éviter de mélanger les hooks de la version desktop avec ceux
// de la version mobile (chacun a ses propres hooks → Rules of Hooks respectées).
// Cf. CLAUDE.md § "Composants mobile dédiés via useIsMobile()".
export default function Echeancier(props: { chantierId: string; token: string }) {
  const isMobile = useIsMobile();
  const [forceDesktop, setForceDesktop] = useState(false);

  if (isMobile && !forceDesktop) {
    return (
      <div className="flex flex-col h-full">
        <EcheancierMobile chantierId={props.chantierId} token={props.token} />
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-center">
          <button
            onClick={() => setForceDesktop(true)}
            className="text-[11px] text-gray-400 hover:text-indigo-600 underline"
          >
            Voir version complète (graphique + statistiques)
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {isMobile && forceDesktop && (
        <button
          onClick={() => setForceDesktop(false)}
          className="md:hidden flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border-b border-indigo-200 text-indigo-700 text-sm font-semibold active:bg-indigo-100"
        >
          ← Retour à la vue mobile
        </button>
      )}
      <EcheancierDesktop {...props} />
    </>
  );
}

// ── Composant desktop (renommé depuis l'ancien `Echeancier`) ─────────────────
function EcheancierDesktop({
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
  const [lots,           setLots]           = useState<LotChantier[]>([]);
  const [showAddModal,        setShowAddModal]        = useState(false);
  const [showAddDepenseModal, setShowAddDepenseModal] = useState(false);

  // Fetch lots pour le DepenseRapideModal (lazy : seulement la première fois qu'on ouvre la modal)
  useEffect(() => {
    if (!showAddDepenseModal || lots.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const bearer = await freshToken(token);
        const res = await fetch(`/api/chantier/${chantierId}/lots`, {
          headers: { Authorization: `Bearer ${bearer}` },
        });
        if (!res.ok || cancelled) return;
        const d = await res.json();
        if (!cancelled) setLots(d.lots ?? []);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [showAddDepenseModal, chantierId, token, lots.length]);
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

  // Synchro inter-écran : si une dépense est créée/modifiée depuis Budget ou Accueil,
  // l'Échéancier recharge ses payment_events + entrées.
  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.chantierId !== chantierId) return;
      refreshEvents();
      fetchEntrees();
    }
    window.addEventListener('chantierBudgetChanged', onChange);
    return () => window.removeEventListener('chantierBudgetChanged', onChange);
  }, [chantierId, refreshEvents, fetchEntrees]);

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

  const saveEntree = useCallback(async (id: string, patch: Partial<EntreeChantier>) => {
    const bearer = await freshToken(token);
    const res = await fetch(`/api/chantier/${chantierId}/entrees`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    if (res.ok) fetchEntrees();
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
          <div className="flex items-center justify-between mb-3 bg-rose-50 border border-rose-100 rounded-xl px-3.5 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-rose-100 rounded-lg flex items-center justify-center shrink-0">
                <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-rose-800 leading-none">Sorties</p>
                <p className="text-[10px] text-rose-400 mt-0.5">Échéances artisans</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {futureEvents.length > 0 && (
                <div className="text-right">
                  <p className="text-sm font-extrabold text-rose-700 tabular-nums leading-none">
                    {fmtEur(futureEvents.reduce((s, e) => s + (e.amount ?? 0), 0))}
                  </p>
                  <p className="text-[10px] text-rose-400 mt-0.5">à décaisser</p>
                </div>
              )}
              <button onClick={() => setShowAddDepenseModal(true)}
                className="flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 border border-rose-200 px-2.5 py-1 rounded-lg transition-colors shrink-0">
                <Plus className="h-3 w-3" /> Dépense
              </button>
            </div>
          </div>

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
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-300 shrink-0" />
                    <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">{month}</p>
                  </div>
                  <div className="bg-white border border-gray-100 rounded-2xl divide-y divide-gray-50 overflow-hidden shadow-sm">
                    {evts.map(ev => (
                      <PaymentEventRow key={ev.id} ev={ev} chantierId={chantierId} token={token}
                        confirmingId={confirmingId} setConfirmingId={setConfirmingId}
                        proofPromptId={proofPromptId} setProofPromptId={setProofPromptId}
                        proofInputRef={proofInputRef} proofUploading={proofUploading} setProofUploading={setProofUploading}
                        markPaid={markPaid} markUnpaid={markUnpaid} refresh={refreshEvents}
                        entrees={entrees} allEvents={events}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {paidEvents.length > 0 && (
                <PaidEventsAccordion
                  paidEvents={paidEvents}
                  chantierId={chantierId}
                  token={token}
                  confirmingId={confirmingId} setConfirmingId={setConfirmingId}
                  proofPromptId={proofPromptId} setProofPromptId={setProofPromptId}
                  proofInputRef={proofInputRef} proofUploading={proofUploading} setProofUploading={setProofUploading}
                  markPaid={markPaid} markUnpaid={markUnpaid} refreshEvents={refreshEvents}
                  entrees={entrees} allEvents={events}
                />
              )}
            </div>
          )}
        </div>

        {/* Entrées */}
        <div>
          <div className="flex items-center justify-between mb-3 bg-emerald-50 border border-emerald-100 rounded-xl px-3.5 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-800 leading-none">Entrées</p>
                <p className="text-[10px] text-emerald-400 mt-0.5">Financement &amp; remboursements</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {entrees.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-extrabold text-emerald-700 tabular-nums leading-none">
                      {fmtEur(entrees.filter(e => e.statut === 'recu').reduce((s, e) => s + e.montant, 0))}
                    </p>
                    <p className="text-[10px] text-emerald-400 mt-0.5">reçu</p>
                  </div>
                  {entrees.some(e => e.statut === 'attendu') && (
                    <div className="text-right border-l border-emerald-200 pl-3">
                      <p className="text-sm font-extrabold text-indigo-600 tabular-nums leading-none">
                        {fmtEur(entrees.filter(e => e.statut === 'attendu').reduce((s, e) => s + e.montant, 0))}
                      </p>
                      <p className="text-[10px] text-indigo-400 mt-0.5">attendu</p>
                    </div>
                  )}
                </div>
              )}
              <button onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 border border-emerald-200 px-2.5 py-1 rounded-lg transition-colors shrink-0">
                <Plus className="h-3 w-3" /> Ajouter
              </button>
            </div>
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
                  onSave={patch => saveEntree(e.id, patch)}
                  deleting={deletingId === e.id}
                />
              ))}
              <button onClick={() => setShowAddModal(true)}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 border border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl py-3 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Ajouter une entrée
              </button>
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

      {showAddDepenseModal && (
        <DepenseRapideModal
          chantierId={chantierId}
          token={token}
          lots={lots}
          onClose={() => setShowAddDepenseModal(false)}
          onSaved={() => {
            // Rafraîchit l'Échéancier ET notifie le reste du cockpit (Budget, Accueil)
            // pour que la dépense apparaisse partout immédiatement.
            refreshEvents();
            window.dispatchEvent(new CustomEvent('chantierBudgetChanged', { detail: { chantierId } }));
          }}
        />
      )}
    </div>
  );
}

// ── Note : l'ancienne AddDepenseModal (cashflow_extras orphelins) a été
// remplacée par DepenseRapideModal (Budget) le 2026-05-09 — toutes les
// dépenses passent désormais par /documents/depense-rapide qui crée une
// vraie facture dans documents_chantier, visible dans Budget + Échéancier.
