import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Plus, SlidersHorizontal, HelpCircle, X, Check, AlertTriangle, Loader2, ChevronRight } from 'lucide-react';
import type { DocumentChantier, LotChantier } from '@/types/chantier-ia';
import { KpiCard, ViewToggle, DiyCard, RDV_EMOJI } from './DashboardWidgets';
import LotIntervenantCard from './LotIntervenantCard';
import IntervenantsListView from '@/components/chantier/cockpit/IntervenantsListView';
import PlanningWidget from '@/components/chantier/cockpit/planning/PlanningWidget';
import ComparateurDevisModal from '@/components/chantier/cockpit/ComparateurDevisModal';
import { fmtK } from '@/lib/dashboardHelpers';
import type { BreakdownItem } from './BudgetTresorerie';
import { useAnalysisScores } from '@/hooks/useAnalysisScores';

// ── Barre d'onboarding ────────────────────────────────────────────────────────

interface OnboardingStep {
  id:       string;
  label:    string;
  done:     boolean;
  cta?:     string;
  onCta?:   () => void;
}

function OnboardingBar({ steps }: { steps: OnboardingStep[] }) {
  const [dismissed, setDismissed] = useState(false);
  const allDone = steps.every(s => s.done);

  // Disparaît automatiquement si tout est fait, ou si l'utilisateur ferme
  if (allDone || dismissed) return null;

  const doneCount = steps.filter(s => s.done).length;
  const pct       = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="bg-white border border-indigo-100 rounded-2xl px-5 py-4 shadow-sm relative overflow-hidden">
      {/* Barre de fond */}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-gray-100">
        <div
          className="h-full bg-indigo-400 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🚀</span>
          <p className="text-[13px] font-bold text-gray-800">
            Démarrez votre suivi de chantier
          </p>
          <span className="text-[11px] font-semibold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
            {doneCount}/{steps.length}
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-gray-300 hover:text-gray-500 transition-colors p-1"
          title="Masquer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Étapes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {steps.map((step, i) => (
          <div
            key={step.id}
            className={`flex items-start gap-2 rounded-xl px-3 py-2.5 transition-all ${
              step.done
                ? 'bg-emerald-50 border border-emerald-100'
                : 'bg-gray-50 border border-gray-100'
            }`}
          >
            {/* Numéro / check */}
            <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 ${
              step.done
                ? 'bg-emerald-500 text-white'
                : 'bg-white border-2 border-gray-200 text-gray-400'
            }`}>
              {step.done ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[11px] font-semibold leading-tight ${step.done ? 'text-emerald-700' : 'text-gray-600'}`}>
                {step.label}
              </p>
              {!step.done && step.cta && step.onCta && (
                <button
                  onClick={step.onCta}
                  className="mt-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                >
                  <Plus className="h-3 w-3" />{step.cta}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tooltip breakdown budget ──────────────────────────────────────────────────

function BudgetBreakdownPopover({ items }: { items: BreakdownItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function handleOpen() {
    if (open) { setOpen(false); return; }
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 8, left: r.left });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="flex items-center gap-0.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg px-2 py-1 transition-colors"
        title="Détail par poste"
      >
        <HelpCircle className="h-3 w-3" />
      </button>

      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-72 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Estimation par poste</p>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
            {items.map(item => {
              const rel =
                item.reliability === 'haute'   ? { dot: 'bg-emerald-400', text: 'text-emerald-600', label: 'Haute'  } :
                item.reliability === 'moyenne' ? { dot: 'bg-amber-400',   text: 'text-amber-600',   label: 'Moy.'   } :
                                                 { dot: 'bg-gray-300',    text: 'text-gray-400',    label: 'Faible' };
              return (
                <li key={item.id} className="px-4 py-2.5 flex items-center gap-2">
                  <span className="text-sm leading-none shrink-0">{item.emoji}</span>
                  <span className="flex-1 min-w-0 text-xs text-gray-700 truncate">{item.label}</span>
                  <span className="shrink-0 tabular-nums text-xs font-bold text-gray-900 whitespace-nowrap">
                    {fmtK(item.min)}–{fmtK(item.max)}
                  </span>
                  <span className={`shrink-0 flex items-center gap-0.5 text-[10px] font-bold ${rel.text}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${rel.dot}`} />
                    {rel.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

const fmtEurShort = (n: number) => n >= 1000 ? `${fmtK(n)}` : `${n} €`;

// ── Bloc actions prioritaires mobile (ÉTAPE 3) ────────────────────────────────

function NextActionsMobile({
  aRegler, nbARegler, nbDevisAValider, blocked, onAction,
}: {
  aRegler: number;
  nbARegler: number;
  nbDevisAValider: number;
  blocked: number;
  onAction: () => void;
}) {
  const actions: { emoji: string; label: string; urgent?: boolean }[] = [];
  if (aRegler > 0) actions.push({ emoji: '💸', label: `${fmtEurShort(aRegler)} à régler (${nbARegler} facture${nbARegler > 1 ? 's' : ''})`, urgent: true });
  if (nbDevisAValider > 0) actions.push({ emoji: '⚠️', label: `${nbDevisAValider} devis à valider`, urgent: true });
  if (blocked > 0) actions.push({ emoji: '⚠️', label: `${blocked} intervenant${blocked > 1 ? 's' : ''} sans devis` });

  if (actions.length === 0) return null;

  return (
    <div className="sm:hidden bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-2">À faire</p>
      <div className="space-y-1.5">
        {actions.map((a, i) => (
          <div key={i} className={`flex items-center gap-2 text-sm font-medium ${a.urgent ? 'text-amber-800' : 'text-amber-700'}`}>
            <span>{a.emoji}</span>
            <span className="flex-1 min-w-0">{a.label}</span>
          </div>
        ))}
      </div>
      <button
        onClick={onAction}
        className="mt-3 w-full flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl py-2.5 min-h-[44px] touch-manipulation transition-colors"
      >
        👉 Voir mes actions
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Info label avec tooltip ───────────────────────────────────────────────────

function InfoLabel({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="group relative flex items-center gap-1 shrink-0">
      <span className="text-[10px] text-gray-400">{label}</span>
      <HelpCircle className="h-3 w-3 text-gray-300 hover:text-gray-500 cursor-help transition-colors" />
      <span className="pointer-events-none absolute top-full left-0 mt-1.5 w-48 rounded-xl bg-gray-900 px-3 py-2 text-[11px] leading-snug text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
        {tip}
      </span>
    </span>
  );
}

// ── Budget donut card ─────────────────────────────────────────────────────────

function BudgetDonutCard({
  budgetReel, budgetEngage, totalPaye, iaMin, iaMax, refinedBreakdown, onAffineBudget, hasRefinedBreakdown,
}: {
  budgetReel?: number | null;
  budgetEngage: number;
  totalPaye: number;
  iaMin: number;
  iaMax: number;
  refinedBreakdown: BreakdownItem[];
  onAffineBudget: () => void;
  hasRefinedBreakdown: boolean;
}) {
  const size = 68;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  const ref = (budgetReel && budgetReel > 0) ? budgetReel : iaMax;
  const pct = ref > 0 && budgetEngage > 0 ? Math.min((budgetEngage / ref) * 100, 100) : 0;
  const displayPct = ref > 0 && budgetEngage > 0 ? Math.round((budgetEngage / ref) * 100) : 0;
  const filled = (pct / 100) * circ;

  // Arrondi à l'euro entier pour éviter les résidus flottants (ex: 1.599999... €)
  const overAmount = Math.round(budgetEngage - ref);
  const isOver = overAmount > 0 && ref > 0;
  const isNear = !isOver && ref > 0 && budgetEngage > ref * 0.85;
  const color = budgetEngage === 0 ? '#cbd5e1' : isOver ? '#ef4444' : isNear ? '#f59e0b' : '#6366f1';

  const statusLabel = budgetEngage === 0 ? null
    : isOver  ? `dépassement +${fmtEurShort(overAmount)}`
    : isNear  ? 'proche du plafond'
    : 'dans le budget';
  const statusCls = isOver ? 'text-red-500' : isNear ? 'text-amber-500' : 'text-indigo-500';

  const hasBudgetRef = ref > 0;

  return (
    <div className="bg-blue-50 rounded-2xl px-4 py-4 flex items-center gap-3 col-span-2 xl:col-span-1">
      {/* Donut */}
      {hasBudgetRef && (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
               style={{ transform: 'rotate(-90deg)', display: 'block' }}>
            <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#dbeafe" strokeWidth={stroke} />
            {budgetEngage > 0 && (
              <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
                strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 0.65s ease' }}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] font-extrabold" style={{ color: budgetEngage > 0 ? color : '#94a3b8' }}>
              {budgetEngage > 0 ? `${displayPct}%` : '—'}
            </span>
          </div>
        </div>
      )}

      {/* 3 lignes */}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Budget chantier</p>
        <div className="space-y-1">

          {/* Budget cible */}
          <div className="flex items-center justify-between gap-2">
            <InfoLabel label="Budget cible" tip="Montant maximum que vous souhaitez ne pas dépasser pour ce chantier. Modifiable dans l'onglet Budget." />
            <span className="text-sm font-extrabold text-gray-900 tabular-nums">
              {budgetReel && budgetReel > 0 ? fmtEurShort(budgetReel) : (iaMin > 0 ? `${fmtK(iaMin)}–${fmtK(iaMax)}` : '—')}
            </span>
          </div>

          {/* Engagé */}
          <div className="flex items-start justify-between gap-2">
            <InfoLabel label="Engagé" tip="Devis validés + factures d'artisans sans devis associé. Représente votre engagement financier total." />
            <div className="text-right">
              <span className={`text-sm font-bold tabular-nums ${budgetEngage > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                {budgetEngage > 0 ? fmtEurShort(budgetEngage) : '—'}
              </span>
              {statusLabel && (
                <p className={`text-[10px] font-semibold ${statusCls}`}>{statusLabel}</p>
              )}
            </div>
          </div>

          {/* Payé */}
          <div className="flex items-center justify-between gap-2">
            <InfoLabel label="Payé" tip="Somme des factures déjà réglées (virements, chèques…). Ce qui est sorti de votre compte." />
            <span className={`text-sm font-bold tabular-nums ${totalPaye > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
              {totalPaye > 0 ? fmtEurShort(totalPaye) : '—'}
            </span>
          </div>

        </div>

        <div className="mt-2">
          <button onClick={onAffineBudget}
            className="flex items-center gap-1 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1 transition-colors">
            <SlidersHorizontal className="h-3 w-3" />
            {hasRefinedBreakdown ? 'Recalculer' : 'Affiner'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Budget progress bars (mobile only) ────────────────────────────────────────

function BudgetProgressBars({
  budgetReel, budgetEngage, totalPaye, iaMin, iaMax, refinedBreakdown, onAffineBudget, hasRefinedBreakdown,
}: {
  budgetReel?: number | null;
  budgetEngage: number;
  totalPaye: number;
  iaMin: number;
  iaMax: number;
  refinedBreakdown?: BreakdownItem[];
  onAffineBudget?: () => void;
  hasRefinedBreakdown?: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const ref = (budgetReel && budgetReel > 0) ? budgetReel : iaMax;

  const bars = [
    {
      label: 'Budget cible',
      value: ref,
      pct: 100,
      color: 'bg-indigo-500',
      bg: 'bg-indigo-100',
      text: ref > 0 ? fmtEurShort(ref) : '—',
    },
    {
      label: 'Engagé',
      value: budgetEngage,
      pct: ref > 0 ? Math.min((budgetEngage / ref) * 100, 100) : 0,
      color: budgetEngage > ref * 0.85 ? (budgetEngage > ref ? 'bg-red-500' : 'bg-amber-500') : 'bg-blue-500',
      bg: 'bg-blue-100',
      text: budgetEngage > 0 ? fmtEurShort(budgetEngage) : '—',
    },
    {
      label: 'Payé',
      value: totalPaye,
      pct: ref > 0 ? Math.min((totalPaye / ref) * 100, 100) : 0,
      color: 'bg-emerald-500',
      bg: 'bg-emerald-100',
      text: totalPaye > 0 ? fmtEurShort(totalPaye) : '—',
    },
  ];

  return (
    <>
      <div className="bg-blue-50 rounded-2xl px-4 py-4 space-y-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Budget chantier</p>
        {bars.map(b => (
          <div key={b.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-gray-500">{b.label}</span>
              <span className="text-[13px] font-bold text-gray-800 tabular-nums">{b.text}</span>
            </div>
            <div className={`h-2 rounded-full ${b.bg} overflow-hidden`}>
              <div
                className={`h-full rounded-full ${b.color} transition-all duration-500`}
                style={{ width: `${b.pct}%` }}
              />
            </div>
          </div>
        ))}
        {onAffineBudget && (
          <button
            onClick={() => refinedBreakdown && refinedBreakdown.length > 0 ? setSheetOpen(true) : onAffineBudget()}
            className="flex items-center gap-1 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 touch-manipulation transition-colors"
          >
            <SlidersHorizontal className="h-3 w-3" />
            {hasRefinedBreakdown ? 'Voir le détail' : 'Affiner le budget'}
          </button>
        )}
      </div>

      {/* Bottom sheet détail (ÉTAPE 8) */}
      {sheetOpen && refinedBreakdown && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSheetOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <p className="text-sm font-bold text-gray-900">Estimation par poste</p>
              <button onClick={() => setSheetOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 touch-manipulation">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
              {refinedBreakdown.map(item => {
                const rel =
                  item.reliability === 'haute'   ? { dot: 'bg-emerald-400', text: 'text-emerald-600', label: 'Haute'  } :
                  item.reliability === 'moyenne' ? { dot: 'bg-amber-400',   text: 'text-amber-600',   label: 'Moy.'   } :
                                                   { dot: 'bg-gray-300',    text: 'text-gray-400',    label: 'Faible' };
                return (
                  <li key={item.id} className="px-5 py-3 flex items-center gap-3">
                    <span className="text-lg shrink-0">{item.emoji}</span>
                    <span className="flex-1 min-w-0 text-sm text-gray-700">{item.label}</span>
                    <span className="shrink-0 tabular-nums text-sm font-bold text-gray-900 whitespace-nowrap">
                      {fmtK(item.min)}–{fmtK(item.max)}
                    </span>
                    <span className={`shrink-0 flex items-center gap-0.5 text-[11px] font-bold ${rel.text}`}>
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${rel.dot}`} />
                      {rel.label}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="px-5 pt-3">
              <button
                onClick={() => { setSheetOpen(false); onAffineBudget?.(); }}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white text-sm font-bold rounded-xl py-3 min-h-[44px] touch-manipulation"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Recalculer le budget
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── DashboardHome ─────────────────────────────────────────────────────────────

function DashboardHome({ lots, documents, docsByLot, displayMin, displayMax, budgetReel, refinedBreakdown, onAffineBudget,
  onAddDevisForLot, onAddDocForLot, onGoToLot, onGoToAnalyse, onGoToPlanning, onAddDoc,
  onGoToAssistant, onAddIntervenant, onDeleteLot, onDeleteDoc, onGoToDiy, chantierId, token,
  viewMode, onViewModeChange, onDocStatutUpdated, onDocMoved,
}: {
  lots: LotChantier[];
  documents: DocumentChantier[];
  docsByLot: Record<string, DocumentChantier[]>;
  displayMin: number;
  displayMax: number;
  budgetReel?: number | null;
  refinedBreakdown: BreakdownItem[];
  onAffineBudget: () => void;
  onAddDevisForLot: (lotId: string) => void;
  onAddDocForLot: (lotId: string) => void;
  onGoToLot: (lotId: string) => void;
  onGoToAnalyse: () => void;
  onGoToPlanning: () => void;
  onAddDoc: () => void;
  onGoToAssistant: () => void;
  onAddIntervenant: () => void;
  onDeleteLot: (lotId: string) => void;
  onDeleteDoc: (docId: string) => void;
  onGoToDiy: () => void;
  chantierId: string;
  token: string | null | undefined;
  viewMode: 'cards' | 'list';
  onViewModeChange: (v: 'cards' | 'list') => void;
  onDocStatutUpdated?: (docId: string, statut: string) => void;
  onDocMoved?: (docId: string, newLotId: string) => void;
}) {

  const [comparingLot, setComparingLot] = useState<{ lot: LotChantier; docs: DocumentChantier[] } | null>(null);

  // ── Dépense rapide ─────────────────────────────────────────────────────────
  const [depenseOpen, setDepenseOpen]   = useState(false);
  const [depenseForm, setDepenseForm]   = useState({
    label: '', amount: '', depense_type: 'achat_materiaux' as 'achat_materiaux' | 'frais' | 'ticket_caisse',
    lot_id: '', note: '', date: new Date().toISOString().slice(0, 10),
  });
  const [depenseError,  setDepenseError]  = useState<string | null>(null);
  const [savingDepense, setSavingDepense] = useState(false);

  const saveDepense = useCallback(async () => {
    const amount = parseFloat(depenseForm.amount.replace(',', '.'));
    if (!depenseForm.label.trim() || isNaN(amount) || amount <= 0) {
      setDepenseError('Libellé et montant requis'); return;
    }
    setSavingDepense(true); setDepenseError(null);
    try {
      const bearer = token ?? '';
      const res = await fetch(`/api/chantier/${chantierId}/quick-expense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({
          label:        depenseForm.label.trim(),
          amount,
          depense_type: depenseForm.depense_type,
          lot_id:       depenseForm.lot_id || null,
          note:         depenseForm.note.trim() || null,
          date:         depenseForm.date,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setDepenseError(j.error ?? 'Erreur lors de l\'enregistrement');
        setSavingDepense(false); return;
      }
      setDepenseOpen(false);
      setDepenseForm({ label: '', amount: '', depense_type: 'achat_materiaux', lot_id: '', note: '', date: new Date().toISOString().slice(0, 10) });
    } catch { setDepenseError('Erreur réseau. Réessayez.'); }
    setSavingDepense(false);
  }, [chantierId, token, depenseForm]);

  // Date de début globale du planning (lot le plus tôt avec date_debut)
  const planningStartDate = useMemo(() => {
    const dates = lots
      .filter(l => l.date_debut)
      .map(l => new Date(l.date_debut!).getTime());
    return dates.length > 0 ? new Date(Math.min(...dates)) : null;
  }, [lots]);

  const allDevis = useMemo(() => documents.filter(d => d.document_type === 'devis'), [documents]);
  const { data: analysisData } = useAnalysisScores(allDevis);

  // Devis validés uniquement (engagé = budget réellement signé)
  const devisValides = useMemo(() =>
    allDevis.filter(d => d.devis_statut === 'valide' || d.devis_statut === 'attente_facture'),
    [allDevis],
  );
  const budgetEngageDevis = useMemo(() =>
    devisValides.reduce((sum, d) => {
      const ttc = analysisData[d.id]?.ttc;
      return sum + (ttc != null && ttc > 0 ? ttc : (d.montant ?? 0));
    }, 0),
    [devisValides, analysisData],
  );
  // Factures d'artisans sans devis validé : lots (ou sans lot) sans aucun devis validé
  const budgetEngage = useMemo(() => {
    const lotsWithDevis = new Set(devisValides.map(d => d.lot_id ?? '__sans_lot__'));
    const factures = documents.filter(d => d.document_type === 'facture');
    const facturesSansDevis = factures.filter(f => !lotsWithDevis.has(f.lot_id ?? '__sans_lot__'));
    const totalFacturesSansDevis = facturesSansDevis.reduce((s, f) => s + (f.montant ?? 0), 0);
    return budgetEngageDevis + totalFacturesSansDevis;
  }, [budgetEngageDevis, devisValides, documents]);
  const totalPaye = useMemo(() =>
    documents
      .filter(d => d.document_type === 'facture' && (d.facture_statut === 'payee' || d.facture_statut === 'payee_partiellement'))
      .reduce((sum, d) => sum + (d.facture_statut === 'payee_partiellement' ? (d.montant_paye ?? 0) : (d.montant ?? 0)), 0),
    [documents],
  );

  // ── Prochain RDV depuis localStorage ──────────────────────────────────────
  const [nextRdv, setNextRdv] = useState<{ titre: string; date: string; time?: string; type: string } | null>(null);
  useEffect(() => {
    if (!chantierId) return;
    try {
      const raw = localStorage.getItem(`rdvs_${chantierId}`);
      if (!raw) return;
      const todayStr = new Date().toISOString().slice(0, 10);
      const all = JSON.parse(raw) as { titre: string; date: string; time?: string; type: string }[];
      const upcoming = all
        .filter(r => r.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
      setNextRdv(upcoming[0] ?? null);
    } catch { /* ignore */ }
  }, [chantierId]);

  function fmtRdvDate(iso: string): string {
    const todayStr    = new Date().toISOString().slice(0, 10);
    const tomorrowStr = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    if (iso === todayStr)    return "Aujourd'hui";
    if (iso === tomorrowStr) return 'Demain';
    return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  const STATUTS_VALIDES = ['ok', 'termine', 'en_cours', 'contrat_signe'];

  const total     = lots.length;
  const validated = lots.filter(l => {
    if (STATUTS_VALIDES.includes(l.statut ?? '')) return true;
    const docs = docsByLot[l.id] ?? [];
    // Devis signé ou en attente de facture
    if (docs.some(d => d.document_type === 'devis' && (d.devis_statut === 'valide' || d.devis_statut === 'attente_facture'))) return true;
    // Facture reçue avec au moins un paiement = artisan engagé même sans devis "valide"
    if (docs.some(d => d.document_type === 'facture' && (d.facture_statut === 'payee' || d.facture_statut === 'payee_partiellement'))) return true;
    return false;
  }).length;
  const withDevis = lots.filter(l => {
    if (STATUTS_VALIDES.includes(l.statut ?? '')) return false;
    const docs = docsByLot[l.id] ?? [];
    const hasValidated = docs.some(d => d.document_type === 'devis' && (d.devis_statut === 'valide' || d.devis_statut === 'attente_facture'));
    if (hasValidated) return false;
    return docs.some(d => d.document_type === 'devis');
  }).length;
  const blocked   = Math.max(0, total - validated - withDevis);

  // Devis reçus mais pas encore validés
  const nbDevisAValider = useMemo(() =>
    documents.filter(d => d.document_type === 'devis' && d.devis_statut === 'recu').length,
    [documents],
  );

  // Montant total restant à régler (factures reçues + partiellement payées)
  const { aRegler, nbARegler } = useMemo(() => {
    let sum = 0;
    let nb  = 0;
    for (const d of documents) {
      if (d.document_type !== 'facture') continue;
      if (d.facture_statut === 'recue') {
        sum += d.montant ?? 0;
        nb++;
      } else if (d.facture_statut === 'payee_partiellement') {
        sum += Math.max(0, (d.montant ?? 0) - (d.montant_paye ?? 0));
        nb++;
      }
    }
    return { aRegler: sum, nbARegler: nb };
  }, [documents]);

  // Étapes d'onboarding
  const hasDevis    = documents.some(d => d.document_type === 'devis');
  const hasFacture  = documents.some(d => d.document_type === 'facture');
  const hasBudget   = !!(budgetReel && budgetReel > 0);
  const onboardingSteps: OnboardingStep[] = [
    { id: 'chantier', label: 'Chantier créé',       done: true },
    { id: 'artisan',  label: '1er artisan ajouté',   done: lots.length > 0, cta: 'Ajouter',  onCta: onAddIntervenant },
    { id: 'devis',    label: '1er devis importé',    done: hasDevis,        cta: 'Importer', onCta: onAddDoc },
    { id: 'budget',   label: 'Budget défini',         done: hasBudget,       cta: 'Définir',  onCta: onAffineBudget },
  ];

  return (
    <>
    <div className="px-5 py-5 space-y-5">

      {/* ── Bloc actions prioritaires mobile (ÉTAPE 3) ─────────────────── */}
      <NextActionsMobile
        aRegler={aRegler}
        nbARegler={nbARegler}
        nbDevisAValider={nbDevisAValider}
        blocked={blocked}
        onAction={onGoToAssistant}
      />

      {/* ── Onboarding (masqué dès que les 4 étapes sont complètes) ── */}
      <OnboardingBar steps={onboardingSteps} />

      {/* ── KPI cards ──────────────────────────────────────────── */}
      <div className={`grid grid-cols-2 gap-3 ${nextRdv ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>

        {/* Budget chantier — donut desktop, progress bars mobile */}
        <div className="hidden sm:block col-span-2 xl:col-span-1">
          <BudgetDonutCard
            budgetReel={budgetReel}
            budgetEngage={budgetEngage}
            totalPaye={totalPaye}
            iaMin={displayMin}
            iaMax={displayMax}
            refinedBreakdown={refinedBreakdown}
            onAffineBudget={onAffineBudget}
            hasRefinedBreakdown={refinedBreakdown.length > 0}
          />
        </div>
        <div className="sm:hidden col-span-2">
          <BudgetProgressBars
            budgetReel={budgetReel}
            budgetEngage={budgetEngage}
            totalPaye={totalPaye}
            iaMin={displayMin}
            iaMax={displayMax}
            refinedBreakdown={refinedBreakdown}
            onAffineBudget={onAffineBudget}
            hasRefinedBreakdown={refinedBreakdown.length > 0}
          />
        </div>

        {/* ÉTAPE 6 — Intervenants masqué sur mobile (gardé sur sm+) */}
        <div className="hidden sm:block">
          <KpiCard
            icon={validated === total && total > 0 ? '✅' : '👷'}
            label="Intervenants"
            value={total > 0 ? `${validated}/${total}` : '0'}
            sub={
              total === 0          ? 'aucun intervenant' :
              validated === total  ? 'tous engagés' :
              blocked > 0          ? `${blocked} sans devis` :
                                     `${total - validated} en cours`
            }
            accent={validated === total && total > 0 ? 'emerald' : blocked > 0 ? 'amber' : 'gray'}
            onClick={onGoToPlanning}
          />
        </div>

        <KpiCard
          icon={aRegler > 0 ? '💸' : '✓'}
          label="À régler"
          value={aRegler > 0 ? fmtEurShort(aRegler) : '0 €'}
          sub={
            nbARegler === 0 ? 'aucune facture en attente' :
            nbARegler === 1 ? '1 facture à régler' :
                              `${nbARegler} factures à régler`
          }
          accent={aRegler > 0 ? 'orange' : 'emerald'}
        />
        <KpiCard
          icon="⚡" label="À traiter"
          value={blocked}
          sub={blocked > 0 ? `intervenant${blocked > 1 ? 's' : ''} sans devis` : 'tout est suivi'}
          accent={blocked > 0 ? 'red' : 'emerald'}
          onClick={onGoToAssistant}
        />

        {/* Prochain RDV — uniquement si planifié */}
        {nextRdv && (
          <KpiCard
            icon={RDV_EMOJI[nextRdv.type as keyof typeof RDV_EMOJI] ?? '📅'}
            label="Prochain RDV"
            value={fmtRdvDate(nextRdv.date)}
            sub={nextRdv.titre + (nextRdv.time ? ` · ${nextRdv.time}` : '')}
            accent={nextRdv.date <= new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) ? 'amber' : 'blue'}
            action={
              <button
                onClick={onGoToPlanning}
                className="flex items-center gap-1 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1 transition-colors"
              >
                Voir planning →
              </button>
            }
          />
        )}
      </div>

      {/* ── Actions rapides ──────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setDepenseForm(f => ({ ...f, date: new Date().toISOString().slice(0, 10) })); setDepenseOpen(true); }}
          className="flex items-center gap-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors"
        >
          🧾 Dépense rapide
        </button>
        <button
          onClick={onAddDoc}
          className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus className="h-4 w-4" /> Importer un document
        </button>
        {aRegler > 0 && (
          <button
            onClick={onGoToAssistant}
            className="flex items-center gap-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors"
          >
            💸 {nbARegler} facture{nbARegler > 1 ? 's' : ''} à régler
          </button>
        )}
      </div>

      {/* ── Planning mini-résumé ────────────────────────────── */}
      <PlanningWidget
        lots={lots}
        startDate={planningStartDate}
        onGoToPlanning={onGoToPlanning}
      />

      {/* ── Intervenants (pleine largeur) ────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Intervenants · {total}
            </p>
            {total > 0 && <ViewToggle value={viewMode} onChange={onViewModeChange} />}
          </div>
          <button
            onClick={onAddIntervenant}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-xl transition-colors"
          >
            <Plus className="h-3 w-3" /> Ajouter un intervenant
          </button>
        </div>

        {total === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 py-14 flex flex-col items-center text-center">
            <p className="text-4xl mb-4">🏗</p>
            <p className="font-bold text-gray-900 mb-2">Aucun intervenant défini</p>
            <p className="text-sm text-gray-400 mb-6 max-w-xs leading-relaxed">
              Décrivez votre projet et l'IA génère la liste des intervenants et une estimation de budget.
            </p>
            <a href="/mon-chantier/nouveau"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
              <Plus className="h-4 w-4" /> Créer avec l'IA
            </a>
          </div>
        ) : viewMode === 'list' ? (
          <IntervenantsListView
            lots={lots}
            docsByLot={docsByLot}
            documents={documents}
            onAddDevisForLot={onAddDevisForLot}
            onDeleteDoc={onDeleteDoc}
            onDeleteLot={onDeleteLot}
            onGoToLot={onGoToLot}
            onGoToDiy={onGoToDiy}
            chantierId={chantierId}
            token={token}
            onDocStatutUpdated={onDocStatutUpdated}
            onDocMoved={onDocMoved}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {lots.map(lot => (
                <LotIntervenantCard
                  key={lot.id}
                  lot={lot}
                  docs={docsByLot[lot.id] ?? []}
                  planningStartDate={planningStartDate}
                  onAddDevis={() => onAddDevisForLot(lot.id)}
                  onAddDocument={() => onAddDocForLot(lot.id)}
                  onDetail={() => onGoToLot(lot.id)}
                  onDelete={() => onDeleteLot(lot.id)}
                  onCompare={(l, d) => setComparingLot({ lot: l, docs: d })}
                />
              ))}
              <DiyCard onAddDoc={onAddDoc} onGoToDiy={onGoToDiy} />
            </div>
            {comparingLot && (
              <ComparateurDevisModal
                lot={comparingLot.lot}
                docs={comparingLot.docs}
                onClose={() => setComparingLot(null)}
              />
            )}
          </>
        )}
      </div>
    </div>

      {/* ── Drawer dépense rapide (portal-like, position fixed) ──────────── */}
      {depenseOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setDepenseOpen(false)} />
          <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[400px] bg-white shadow-2xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Budget</p>
                <h3 className="text-[15px] font-bold text-gray-900">Enregistrer une dépense</h3>
                <p className="text-[10px] text-orange-500 mt-0.5">Achat matériaux, paiement liquide, frais annexes…</p>
              </div>
              <button onClick={() => setDepenseOpen(false)} className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Formulaire */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Libellé *</label>
                <input
                  autoFocus type="text" value={depenseForm.label}
                  onChange={e => setDepenseForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="ex : Carrelage chez Brico, Paiement plombier…"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Montant (€) *</label>
                  <input
                    type="number" inputMode="decimal" value={depenseForm.amount}
                    onChange={e => setDepenseForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:border-orange-400"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Date</label>
                  <input
                    type="date" value={depenseForm.date}
                    onChange={e => setDepenseForm(f => ({ ...f, date: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Type de dépense</label>
                <select
                  value={depenseForm.depense_type}
                  onChange={e => setDepenseForm(f => ({ ...f, depense_type: e.target.value as any }))}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                >
                  <option value="achat_materiaux">Achat matériaux</option>
                  <option value="frais">Frais annexes</option>
                  <option value="ticket_caisse">Ticket de caisse</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Lot / poste</label>
                <select
                  value={depenseForm.lot_id}
                  onChange={e => setDepenseForm(f => ({ ...f, lot_id: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                >
                  <option value="">— Aucun lot spécifique —</option>
                  {lots.map(l => (
                    <option key={l.id} value={l.id}>{(l as any).emoji ? `${(l as any).emoji} ` : ''}{l.nom}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Note (optionnel)</label>
                <input
                  type="text" value={depenseForm.note}
                  onChange={e => setDepenseForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="ex : Ticket gardé en poche"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                />
              </div>

              {depenseError && (
                <p className="text-[11px] text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {depenseError}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setDepenseOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  onClick={saveDepense}
                  disabled={savingDepense || !depenseForm.label.trim() || !depenseForm.amount}
                  className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {savingDepense ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default DashboardHome;
