import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { Plus, SlidersHorizontal, HelpCircle, X, Check, LayoutGrid, List } from 'lucide-react';
import type { DocumentChantier, LotChantier } from '@/types/chantier-ia';
import PaiementDrawer from './tresorerie/PaiementDrawer';
import LotIntervenantCard from './lots/LotIntervenantCard';
import IntervenantsListView from './lots/IntervenantsListView';
import PlanningWidget from './planning/PlanningWidget';
import ComparateurDevisModal from './ComparateurDevisModal';
import { fmtK } from '@/lib/chantier/dashboardHelpers';
import type { BreakdownItem } from './tresorerie/BudgetTresorerie';
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

// ── Centre d'actions ──────────────────────────────────────────────────────────

function ActionCenter({ onPaiement, onDocument, onArtisan }: {
  onPaiement: () => void;
  onDocument: () => void;
  onArtisan:  () => void;
}) {
  const actions = [
    {
      icon: '💸',
      label: 'Enregistrer un paiement',
      sub: 'Facture, acompte, dépense…',
      onClick: onPaiement,
      cls: 'bg-orange-50 border-orange-100 hover:bg-orange-100 text-orange-800 hover:shadow-orange-100',
    },
    {
      icon: '📄',
      label: 'Ajouter un devis ou facture',
      sub: 'Importer un document artisan',
      onClick: onDocument,
      cls: 'bg-indigo-50 border-indigo-100 hover:bg-indigo-100 text-indigo-800 hover:shadow-indigo-100',
    },
    {
      icon: '👷',
      label: 'Ajouter un artisan',
      sub: 'Nouveau lot / intervenant',
      onClick: onArtisan,
      cls: 'bg-blue-50 border-blue-100 hover:bg-blue-100 text-blue-800 hover:shadow-blue-100',
    },
  ];
  return (
    <div>
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">🧭 Vos prochaines actions</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {actions.map(a => (
          <button
            key={a.label}
            onClick={a.onClick}
            className={`flex items-center gap-4 sm:flex-col sm:items-start rounded-2xl border px-5 py-4 sm:py-5 text-left transition-all hover:shadow-md active:scale-[0.98] touch-manipulation ${a.cls}`}
          >
            <span className="text-[28px] sm:text-[32px] shrink-0 leading-none">{a.icon}</span>
            <div>
              <p className="text-[13px] font-bold leading-snug">{a.label}</p>
              <p className="text-[11px] opacity-60 mt-0.5">{a.sub}</p>
            </div>
          </button>
        ))}
      </div>
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
  budgetReel, totalPaye, decaisse, aPayer30j, iaMin, iaMax, refinedBreakdown, onAffineBudget, hasRefinedBreakdown,
}: {
  budgetReel?: number | null;
  totalPaye: number;
  decaisse?: number;
  aPayer30j?: number;
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

  const displayDecaisse   = decaisse ?? totalPaye;
  const displayAPayer     = aPayer30j ?? 0;
  const fluxCertains      = displayDecaisse + displayAPayer;
  const fluxGap           = ref > 0 ? fluxCertains - ref : 0;
  const fluxOver          = fluxGap > 100;

  // Donut : flux certains vs budget cible
  const pctFlux = ref > 0 && fluxCertains > 0 ? Math.min((fluxCertains / ref) * 100, 100) : 0;
  const displayPctFlux = ref > 0 && fluxCertains > 0 ? Math.round((fluxCertains / ref) * 100) : 0;
  const filled = (pctFlux / 100) * circ;
  const color = fluxOver ? '#ef4444' : pctFlux > 85 ? '#f59e0b' : '#6366f1';

  const statusLabel = fluxCertains === 0 ? null
    : fluxOver  ? `dépassement +${fmtEurShort(fluxGap)}`
    : pctFlux > 85 ? 'proche du plafond'
    : 'dans le budget';
  const statusCls = fluxOver ? 'text-red-500' : pctFlux > 85 ? 'text-amber-500' : 'text-indigo-500';

  const hasBudgetRef = ref > 0;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden col-span-2 xl:col-span-1 shadow-sm">

      {/* ── En-tête avec donut ── */}
      <div className="bg-blue-50 px-4 py-3 flex items-center gap-3">
        {hasBudgetRef && (
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
                 style={{ transform: 'rotate(-90deg)', display: 'block' }}>
              <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#dbeafe" strokeWidth={stroke} />
              {fluxCertains > 0 && (
                <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
                  strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
                  style={{ transition: 'stroke-dasharray 0.65s ease' }}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[11px] font-extrabold" style={{ color: fluxCertains > 0 ? color : '#94a3b8' }}>
                {fluxCertains > 0 ? `${displayPctFlux}%` : '—'}
              </span>
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Budget chantier</p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-[17px] font-extrabold text-gray-900 leading-none">
              {budgetReel && budgetReel > 0 ? fmtEurShort(budgetReel) : (iaMin > 0 ? `${fmtK(iaMin)}–${fmtK(iaMax)}` : '—')}
            </span>
            <span className="text-[10px] text-gray-400">cible</span>
          </div>
          {statusLabel && <p className={`text-[10px] font-semibold mt-0.5 ${statusCls}`}>{statusLabel}</p>}
        </div>
      </div>

      {/* ── Section Trésorerie → onglet Trésorerie ── */}
      <div className="px-4 pt-2 pb-3 space-y-1.5">
        <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 mb-1.5">
          Trésorerie réelle · <span className="normal-case font-normal">onglet Trésorerie</span>
        </p>

        {/* Décaissé */}
        <div className="flex items-center justify-between">
          <InfoLabel label="Décaissé" tip="Sorti de votre compte : acomptes versés + factures réglées." />
          <span className={`text-[13px] font-extrabold tabular-nums ${displayDecaisse > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
            {displayDecaisse > 0 ? fmtEurShort(displayDecaisse) : '—'}
          </span>
        </div>

        {/* À payer */}
        {displayAPayer > 0 && (
          <div className="flex items-center justify-between">
            <InfoLabel label="À payer (certain)" tip="Devis signés sans facture + factures reçues non réglées. Ces sorties sont inévitables." />
            <span className="text-[13px] font-extrabold tabular-nums text-orange-500">
              {fmtEurShort(displayAPayer)}
            </span>
          </div>
        )}

        {/* Flux certains = total */}
        {(displayDecaisse > 0 || displayAPayer > 0) && (
          <div className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 mt-1 ${fluxOver ? 'bg-red-50' : 'bg-gray-50'}`}>
            <span className={`text-[11px] font-bold ${fluxOver ? 'text-red-700' : 'text-gray-600'}`}>
              {fluxOver ? '⚠️ ' : '= '}Flux certains
            </span>
            <div className="text-right">
              <span className={`text-[13px] font-extrabold tabular-nums ${fluxOver ? 'text-red-600' : 'text-gray-700'}`}>
                {fmtEurShort(fluxCertains)}
              </span>
              {fluxOver && ref > 0 && (
                <span className="ml-1.5 text-[10px] font-bold text-red-500">+{fmtEurShort(fluxGap)}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Footer action ── */}
      <div className="px-4 pb-3">
        <button onClick={onAffineBudget}
          className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-2.5 py-1.5 transition-colors w-full justify-center">
          <SlidersHorizontal className="h-3 w-3" />
          {hasRefinedBreakdown ? 'Recalculer le budget' : 'Affiner le budget'}
        </button>
      </div>

    </div>
  );
}

// ── Budget progress bars (mobile only) ────────────────────────────────────────

function BudgetProgressBars({
  budgetReel, totalPaye, decaisse, aPayer30j, iaMin, iaMax, refinedBreakdown, onAffineBudget, hasRefinedBreakdown,
}: {
  budgetReel?: number | null;
  totalPaye: number;
  decaisse?: number;
  aPayer30j?: number;
  iaMin: number;
  iaMax: number;
  refinedBreakdown?: BreakdownItem[];
  onAffineBudget?: () => void;
  hasRefinedBreakdown?: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const ref = (budgetReel && budgetReel > 0) ? budgetReel : iaMax;
  const displayDecaisse = decaisse ?? totalPaye;
  const displayAPayer  = aPayer30j ?? 0;

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
      label: 'Décaissé',
      value: displayDecaisse,
      pct: ref > 0 ? Math.min((displayDecaisse / ref) * 100, 100) : 0,
      color: 'bg-emerald-500',
      bg: 'bg-emerald-100',
      text: displayDecaisse > 0 ? fmtEurShort(displayDecaisse) : '—',
    },
    ...(displayAPayer > 0 ? [{
      label: 'À payer',
      value: displayAPayer,
      pct: ref > 0 ? Math.min((displayAPayer / ref) * 100, 100) : 0,
      color: 'bg-orange-500',
      bg: 'bg-orange-100',
      text: fmtEurShort(displayAPayer),
    }] : []),
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

// ── NextActionsBlock ──────────────────────────────────────────────────────────

type QuickAction = { priority: number; icon: string; label: string; sub?: string; onClick: () => void };

function NextActionsBlock({ documents, lots, onGoToTresorerie, onGoToDocuments, onGoToPlanning, onAddDoc, highlight }: {
  documents: DocumentChantier[];
  lots: LotChantier[];
  onGoToTresorerie: () => void;
  onGoToDocuments:  () => void;
  onGoToPlanning:   () => void;
  onAddDoc:         () => void;
  /** Flash 1.5s background pour signaler "voilà la liste" au scroll-to depuis le KPI. */
  highlight?:       boolean;
}) {
  const actions = useMemo<QuickAction[]>(() => {
    const list: QuickAction[] = [];

    // P1 — Factures en retard (statut recue, montant dû)
    const facturesRecues = documents.filter(
      d => d.document_type === 'facture' && d.facture_statut === 'recue',
    );
    for (const f of facturesRecues.slice(0, 2)) {
      const artisan = f.nom?.split(' – ')[0] ?? f.nom ?? '';
      const montant = f.montant ? ` (${fmtEurShort(f.montant)})` : '';
      list.push({
        priority: 1,
        icon: '💸',
        label: `Régler la facture — ${artisan}${montant}`,
        sub: 'Facture reçue non soldée',
        onClick: onGoToTresorerie,
      });
    }

    // P1 — Partiellement payées
    const facturesPartielles = documents.filter(
      d => d.document_type === 'facture' && d.facture_statut === 'payee_partiellement',
    );
    for (const f of facturesPartielles.slice(0, 1)) {
      const reste = (f.montant ?? 0) - (f.montant_paye ?? 0);
      list.push({
        priority: 1,
        icon: '💸',
        label: `Solde restant — ${f.nom ?? ''}${reste > 0 ? ` (${fmtEurShort(reste)})` : ''}`,
        sub: 'Paiement partiel enregistré',
        onClick: onGoToTresorerie,
      });
    }

    // P2 — Devis à valider
    const devisAValider = documents.filter(
      d => d.document_type === 'devis' && d.devis_statut === 'recu',
    );
    for (const d of devisAValider.slice(0, 2)) {
      const montant = d.montant ? ` (${fmtEurShort(d.montant)})` : '';
      list.push({
        priority: 2,
        icon: '📋',
        label: `Valider le devis — ${d.nom ?? ''}${montant}`,
        sub: 'En attente de signature',
        onClick: onGoToDocuments,
      });
    }

    // P3 — Lots sans devis (bloqués)
    const STATUTS_VALIDES = ['en_cours', 'termine', 'valide', 'signe'];
    const lotsBloqués = lots.filter(l =>
      !STATUTS_VALIDES.includes(l.statut ?? '') &&
      !documents.some(d => d.lot_id === l.id && d.document_type === 'devis'),
    );
    for (const l of lotsBloqués.slice(0, 1)) {
      list.push({
        priority: 3,
        icon: '📄',
        label: `Ajouter un devis — ${l.emoji ?? ''} ${l.nom}`,
        sub: 'Aucun devis reçu',
        onClick: onAddDoc,
      });
    }

    // P4 — Devis validés sans facture
    const devisValides = documents.filter(
      d => d.document_type === 'devis' &&
           (d.devis_statut === 'signe' || d.devis_statut === 'valide' || d.devis_statut === 'attente_facture'),
    );
    for (const d of devisValides) {
      const hasFacture = documents.some(f => f.document_type === 'facture' && f.lot_id === d.lot_id);
      if (!hasFacture) {
        list.push({
          priority: 4,
          icon: '🧾',
          label: `Facture manquante — ${d.nom ?? ''}`,
          sub: 'Devis signé, facture non reçue',
          onClick: onAddDoc,
        });
        break;
      }
    }

    return list.sort((a, b) => a.priority - b.priority).slice(0, 3);
  }, [documents, lots]);

  if (actions.length === 0) {
    return (
      <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3.5">
        <span className="text-[22px] shrink-0">✅</span>
        <div>
          <p className="text-[13px] font-black text-emerald-800">Tout est sous contrôle</p>
          <p className="text-[11px] text-emerald-600 mt-0.5">Aucune action en attente sur ce chantier</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden shadow-sm transition-all duration-300 ${highlight ? 'border-amber-400 ring-4 ring-amber-200/60' : 'border-gray-100'}`}>
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <p className="text-[11px] font-black text-gray-700 uppercase tracking-wider">🧠 Prochaines étapes</p>
        <button
          onClick={onGoToTresorerie}
          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          Tout voir →
        </button>
      </div>
      <div className="divide-y divide-gray-50">
        {actions.map((action, i) => (
          <button
            key={i}
            onClick={action.onClick}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
          >
            <span className="text-[20px] shrink-0 w-7 text-center">{action.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-gray-800 truncate">{action.label}</p>
              {action.sub && <p className="text-[10px] text-gray-400 mt-0.5">{action.sub}</p>}
            </div>
            <span className="text-gray-300 shrink-0">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── DashboardHome ─────────────────────────────────────────────────────────────

function DashboardHome({ lots, documents, docsByLot, displayMin, displayMax, budgetReel, refinedBreakdown, onAffineBudget,
  onAddDevisForLot, onAddDocForLot, onGoToLot, onGoToAnalyse, onGoToPlanning, onAddDoc,
  onGoToAssistant, onGoToTresorerie, onGoToDocuments, onAddIntervenant, onDeleteLot, onDeleteDoc, onGoToDiy, chantierId, token,
  viewMode, onViewModeChange, onDocStatutUpdated, onDocMoved, urgentActions,
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
  onGoToTresorerie: () => void;
  onGoToDocuments: () => void;
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
  urgentActions?: number;
}) {

  const [comparingLot, setComparingLot] = useState<{ lot: LotChantier; docs: DocumentChantier[] } | null>(null);

  // ── Scroll vers NextActionsBlock + flash highlight quand l'user clique le KPI "À traiter"
  const nextActionsRef = useRef<HTMLDivElement>(null);
  const [actionsHighlight, setActionsHighlight] = useState(false);
  function scrollToActions() {
    nextActionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setActionsHighlight(true);
    setTimeout(() => setActionsHighlight(false), 1500);
  }

  // ── PaiementDrawer (mode libre) ────────────────────────────────────────────
  const [paiementOpen, setPaiementOpen] = useState(false);

  // ── Budget réel décaissé + à payer (API budget) ───────────────────────────
  const [budgetTotaux, setBudgetTotaux] = useState<{ paye: number; acompte: number; a_payer: number } | null>(null);
  useEffect(() => {
    if (!chantierId || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/chantier/${chantierId}/budget`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && !cancelled) {
          const d = await res.json();
          setBudgetTotaux({ paye: d.totaux?.paye ?? 0, acompte: d.totaux?.acompte ?? 0, a_payer: d.totaux?.a_payer ?? 0 });
        }
      } catch { /* non-bloquant */ }
    })();
    return () => { cancelled = true; };
  }, [chantierId, token]);

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
  // Décaissé réel = paye (factures) + acompte (échéancier) depuis l'API budget
  const decaisse  = budgetTotaux ? (budgetTotaux.paye + budgetTotaux.acompte) : totalPaye;
  const aPayer30j = budgetTotaux?.a_payer ?? 0;
  // Flux certains sortants = ce qui est sorti + ce qui va sortir de façon certaine
  const fluxCertains = decaisse + aPayer30j;

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

      {/* ── Centre d'actions ──────────────────────────────────────────── */}
      <ActionCenter
        onPaiement={() => setPaiementOpen(true)}
        onDocument={onAddDoc}
        onArtisan={onAddIntervenant}
      />

      {/* ── Onboarding (masqué dès que les 4 étapes sont complètes) ── */}
      <OnboardingBar steps={onboardingSteps} />

      {/* ── KPI cards ──────────────────────────────────────────── */}
      <div className={`grid grid-cols-2 gap-3 ${nextRdv ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>

        {/* Budget chantier — donut desktop, progress bars mobile */}
        <div className="hidden sm:block col-span-2 xl:col-span-1">
          <BudgetDonutCard
            budgetReel={budgetReel}
            totalPaye={totalPaye}
            decaisse={decaisse}
            aPayer30j={aPayer30j}
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
            totalPaye={totalPaye}
            decaisse={decaisse}
            aPayer30j={aPayer30j}
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
          icon={urgentActions ? '⚡' : '✓'}
          label="À traiter"
          value={urgentActions ? `${urgentActions} action${urgentActions > 1 ? 's' : ''}` : '—'}
          sub={urgentActions ? 'voir la liste ↓' : 'Tout est sous contrôle'}
          accent={urgentActions ? 'amber' : 'emerald'}
          onClick={urgentActions ? scrollToActions : undefined}
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

      {/* ── Alerte flux certains ─────────────────────────────── */}
      {budgetReel && budgetReel > 0 && fluxCertains > budgetReel * 1.01 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 flex items-start gap-3">
          <span className="text-lg shrink-0 mt-0.5">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-red-800">
              Dépassement de budget certain : {fmtEurShort(fluxCertains - budgetReel)} de plus que prévu
            </p>
            <p className="text-[11px] text-red-700 mt-1 leading-relaxed">
              Décaissé <strong>{fmtEurShort(decaisse)}</strong> + à payer <strong>{fmtEurShort(aPayer30j)}</strong> = <strong>{fmtEurShort(fluxCertains)}</strong> de flux certains,{' '}
              contre un budget cible de <strong>{fmtEurShort(budgetReel)}</strong>.{' '}
              Ajustez votre budget ou votre plan de financement dans l'onglet Trésorerie.
            </p>
          </div>
        </div>
      )}

      {/* ── Prochaines étapes recommandées (cible du scroll depuis KPI "À traiter") ─── */}
      <div ref={nextActionsRef}>
        <NextActionsBlock
          documents={documents}
          lots={lots}
          onGoToTresorerie={onGoToTresorerie}
          onGoToDocuments={onGoToDocuments}
          onGoToPlanning={onGoToPlanning}
          onAddDoc={onAddDoc}
          highlight={actionsHighlight}
        />
      </div>

      {/* ── Planning mini-résumé ────────────────────────────── */}
      <PlanningWidget
        lots={lots}
        startDate={planningStartDate}
        onGoToPlanning={onGoToPlanning}
      />

      {/* ── Intervenants (pleine largeur) ────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Intervenants · {total}
          </p>
          {total > 0 && <ViewToggle value={viewMode} onChange={onViewModeChange} />}
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

      {/* ── PaiementDrawer (mode libre) ──────────────────────────────────── */}
      {paiementOpen && (
        <PaiementDrawer
          chantierId={chantierId}
          token={token}
          lots={lots}
          onClose={() => setPaiementOpen(false)}
          onSuccess={() => {}}
        />
      )}
    </>
  );
}

export default DashboardHome;

// ── Composants utilitaires (inlinés depuis DashboardWidgets le 2026-05-08) ──

function KpiCard({ icon, label, value, sub, accent = 'gray', action, onClick }: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'gray' | 'emerald' | 'blue' | 'red' | 'amber' | 'orange';
  action?: ReactNode;
  onClick?: () => void;
}) {
  const colors: Record<string, { bg: string; value: string; sub: string; ring: string }> = {
    gray:    { bg: 'bg-gray-50',    value: 'text-gray-900',    sub: 'text-gray-400',    ring: 'hover:ring-gray-200'    },
    emerald: { bg: 'bg-emerald-50', value: 'text-emerald-700', sub: 'text-emerald-500', ring: 'hover:ring-emerald-200' },
    blue:    { bg: 'bg-blue-50',    value: 'text-blue-700',    sub: 'text-blue-400',    ring: 'hover:ring-blue-200'    },
    red:     { bg: 'bg-red-50',     value: 'text-red-600',     sub: 'text-red-400',     ring: 'hover:ring-red-200'     },
    amber:   { bg: 'bg-amber-50',   value: 'text-amber-700',   sub: 'text-amber-500',   ring: 'hover:ring-amber-200'   },
    orange:  { bg: 'bg-orange-50',  value: 'text-orange-700',  sub: 'text-orange-500',  ring: 'hover:ring-orange-200'  },
  };
  const c = colors[accent] ?? colors.gray;
  return (
    <div
      onClick={onClick}
      className={`${c.bg} rounded-2xl px-4 py-4 flex items-start gap-3 transition-all ${onClick ? `cursor-pointer ring-1 ring-transparent ${c.ring}` : ''}`}
    >
      <span className="text-2xl leading-none mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
        <p className={`text-2xl font-extrabold tabular-nums leading-none ${c.value}`}>{value}</p>
        {sub && <p className={`text-xs font-medium mt-1 ${c.sub}`}>{sub}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

function ViewToggle({ value, onChange }: { value: 'cards' | 'list'; onChange: (v: 'cards' | 'list') => void }) {
  return (
    <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
      <button
        onClick={() => onChange('cards')}
        className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all ${value === 'cards' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <LayoutGrid className="h-3 w-3" /> Cartes
      </button>
      <button
        onClick={() => onChange('list')}
        className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all ${value === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <List className="h-3 w-3" /> Liste
      </button>
    </div>
  );
}

const RDV_EMOJI: Record<'artisan' | 'visite' | 'signature' | 'autre', string> = {
  artisan: '👷', visite: '🏠', signature: '✍️', autre: '📅',
};
