/**
 * BudgetTresorerie — écran financier premium du cockpit chantier.
 * Orchestrateur : budget estimé → devis validés → dépenses & paiements → trésorerie.
 */
import { useState, useCallback } from 'react';
import { Wallet, SlidersHorizontal, ChevronRight, FileCheck, Receipt, ExternalLink } from 'lucide-react';
import type { ChantierIAResult, DocumentChantier, FactureStatut } from '@/types/chantier-ia';
import type { InsightsData } from './useInsights';
import TresoreriePanel from './TresoreriePanel';
import { fmtK, fmtFull } from '@/lib/budgetHelpers';
import { type BreakdownItem } from '@/lib/budgetAffinageData';
import KpiCard from './budget/BudgetKpiCard';
import BudgetGauge from './budget/BudgetGauge';
import LotBreakdown from './budget/LotBreakdown';
import AlertesIA from './budget/AlertesIA';
import TresoreriePhases from './budget/TresoreriePhases';
import FacturesPaiements from './budget/FacturesPaiements';
import DepenseRapideModal from './budget/DepenseRapideModal';
import ProjectHeader from './budget/ProjectHeader';
import ReliabilityBadge from './budget/ReliabilityBadge';
import BudgetComparaison from './budget/BudgetComparaison';
import BudgetExplication from './budget/BudgetExplication';
import BudgetAffinageModal, { ScoreBadge } from './budget/BudgetAffinageModal';

// Re-export for consumers (DashboardUnified imports BreakdownItem from here)
export type { BreakdownItem };

// ── Config statuts devis ──────────────────────────────────────────────────────

const DEVIS_STATUT_CFG = {
  valide:          { label: 'Validé',         pill: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  attente_facture: { label: 'Attente facture', pill: 'bg-blue-50 text-blue-700 border-blue-100' },
} as const;

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  result: ChantierIAResult;
  documents: DocumentChantier[];
  chantierId?: string | null;
  token?: string | null;
  insights: InsightsData | null;
  insightsLoading: boolean;
  baseRangeMin: number;
  baseRangeMax: number;
  onAddDoc: () => void;
  onGoToAnalyse: () => void;
  onGoToLots: () => void;
  onGoToLot?: (lotId: string) => void;
  onRangeRefined?: (min: number, max: number, breakdown: BreakdownItem[]) => void;
  onAmeliorer?: () => void;
  autoOpenModal?: boolean;
  onModalClose?: () => void;
  onDocumentsRefresh?: () => void;
}

export default function BudgetTresorerie({
  result, documents, chantierId, token, insights, insightsLoading,
  baseRangeMin, baseRangeMax, onAddDoc, onGoToAnalyse, onGoToLots, onGoToLot,
  onRangeRefined, onAmeliorer, autoOpenModal, onModalClose, onDocumentsRefresh,
}: Props) {
  const lots = result.lots ?? [];

  // ── État modal affinage ────────────────────────────────────────────────────
  const [modalOpen,         setModalOpen]         = useState(autoOpenModal ?? false);
  const [refinedMin,        setRefinedMin]         = useState<number | null>(null);
  const [refinedMax,        setRefinedMax]         = useState<number | null>(null);
  const [affinageScore,     setAffinageScore]      = useState(0);
  const [refinedBreakdown,  setRefinedBreakdown]   = useState<BreakdownItem[]>([]);
  const [showDepenseModal,  setShowDepenseModal]   = useState(false);

  // État local des statuts factures (optimistic updates)
  const [statutOverrides, setStatutOverrides] = useState<Record<string, FactureStatut>>({});

  const isImmeuble = (result.nom + ' ' + result.description).toLowerCase().includes('immeuble');

  // ── Budget ────────────────────────────────────────────────────────────────
  const hasLotBudget   = lots.some(l => (l.budget_min_ht ?? 0) > 0 || (l.budget_max_ht ?? 0) > 0);
  const hasBudgetTotal = (result.budgetTotal ?? 0) > 5000;
  const hasAnyBudget   = hasLotBudget || hasBudgetTotal || baseRangeMin > 0;

  const rangeMin  = refinedMin ?? baseRangeMin;
  const rangeMax  = refinedMax ?? baseRangeMax;
  const hasRange  = rangeMin > 0 || rangeMax > 0;
  const isRefined = refinedMin !== null;

  // ── Documents filtrés ─────────────────────────────────────────────────────
  const devisValides = documents.filter(d =>
    d.document_type === 'devis' &&
    (d.devis_statut === 'valide' || d.devis_statut === 'attente_facture')
  );
  const factures = documents.filter(d => d.document_type === 'facture');

  // Documents enrichis avec overrides locaux
  const documentsEnriched = documents.map(d =>
    statutOverrides[d.id] ? { ...d, facture_statut: statutOverrides[d.id] } : d
  );

  const devisCount    = devisValides.length;
  const factureCount  = factures.length;
  const lotsAvecDevis = lots.filter(l => devisValides.some(d => d.lot_id === l.id)).length;
  const lotsManquants = lots.length - lotsAvecDevis;
  const alertsCount   = insights?.global.filter(i => i.type === 'alert' || i.type === 'warning').length ?? 0;

  const totalDevisValides = devisValides.reduce((s, d) => s + (d.montant ?? 0), 0);
  const totalPaye         = factures.filter(d => {
    const s = statutOverrides[d.id] ?? d.facture_statut;
    return s === 'payee';
  }).reduce((s, d) => s + (d.montant ?? 0), 0);

  function handleValidate(min: number, max: number, breakdown: BreakdownItem[]) {
    setRefinedMin(min); setRefinedMax(max); setAffinageScore(6); setModalOpen(false);
    setRefinedBreakdown(breakdown);
    onRangeRefined?.(min, max, breakdown);
  }

  const handleStatusChange = useCallback((docId: string, statut: FactureStatut) => {
    setStatutOverrides(prev => ({ ...prev, [docId]: statut }));
    onDocumentsRefresh?.();
  }, [onDocumentsRefresh]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-7 space-y-5">

      {/* ── Header projet ─────────────────────────────────────────────────── */}
      <ProjectHeader emoji={result.emoji} nom={result.nom} hasAnyBudget={hasAnyBudget} onAmeliorer={onAmeliorer} />

      {/* ── Prochaine action ──────────────────────────────────────────────── */}
      <NextActionBanner
        lots={lots} documents={documents} hasAnyBudget={hasAnyBudget} devisCount={devisCount}
        onAddDoc={onAddDoc} onGoToAnalyse={onGoToAnalyse} onOpenModal={() => setModalOpen(true)}
      />

      {/* ── État : aucun budget ───────────────────────────────────────────── */}
      {!hasAnyBudget && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center">
            <Wallet className="h-7 w-7 text-gray-300" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-lg mb-1">Votre budget n'est pas encore estimé</h3>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Créez votre plan de chantier avec l'IA pour obtenir une estimation basée sur les prix du marché réels.
            </p>
          </div>
          <a href="/mon-chantier/nouveau"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-6 py-3 text-sm transition-colors">
            Construire mon budget
          </a>
        </div>
      )}

      {/* ── Fourchette budget cliquable ───────────────────────────────────── */}
      {hasAnyBudget && hasRange && (
        <button onClick={() => setModalOpen(true)}
          className="w-full bg-white rounded-2xl border border-gray-100 p-5 text-left hover:shadow-md hover:scale-[1.01] transition-all duration-200 cursor-pointer group">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                {isRefined ? '✅ Budget affiné' : 'Fourchette estimée'}
              </p>
              <p className="text-3xl font-extrabold text-gray-900 leading-none">
                {fmtK(rangeMin)} – {fmtK(rangeMax)}
              </p>
            </div>
            {isRefined
              ? <ScoreBadge score={affinageScore} />
              : <ReliabilityBadge signaux={result.estimationSignaux} />}
          </div>
          <p className="text-xs text-gray-400">Basé sur les prix du marché réels. Cliquez pour affiner.</p>
          <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-2 text-blue-600 group-hover:text-blue-700 transition-colors">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">Affiner mon estimation</span>
            <ChevronRight className="h-3.5 w-3.5 ml-auto" />
          </div>
        </button>
      )}

      {/* ── Modal affinage ────────────────────────────────────────────────── */}
      {modalOpen && (
        <BudgetAffinageModal
          baseMin={baseRangeMin} baseMax={baseRangeMax}
          resultNom={result.nom} isImmeuble={isImmeuble}
          resultDescription={result.description ?? ''}
          resultLots={lots}
          onClose={() => { setModalOpen(false); onModalClose?.(); }}
          onValidate={handleValidate}
        />
      )}

      {/* ── Détail par poste (après affinage) ────────────────────────────── */}
      {isRefined && refinedBreakdown.length > 0 && (
        <div className="bg-white rounded-2xl border border-emerald-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Détail par intervenant</p>
          </div>
          <div className="divide-y divide-gray-50 px-5">
            {refinedBreakdown.map(item => (
              <div key={item.id} className="flex items-center gap-3 py-3">
                <span className="text-base w-8 text-center shrink-0">{item.emoji}</span>
                <span className="flex-1 text-sm font-medium text-gray-700 truncate">{item.label}</span>
                <span className="text-sm font-bold text-gray-900 shrink-0 tabular-nums">
                  {fmtK(item.min)} – {fmtK(item.max)}
                </span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-emerald-100 bg-emerald-50 flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Total estimé</span>
            <span className="text-base font-extrabold text-emerald-800">{fmtK(rangeMin)} – {fmtK(rangeMax)}</span>
          </div>
        </div>
      )}

      {/* ── KPI Row ───────────────────────────────────────────────────────── */}
      {hasAnyBudget && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Devis validés"
            value={devisCount > 0 ? fmtK(totalDevisValides) : '—'}
            sub={devisCount > 0 ? `${devisCount} devis accepté${devisCount > 1 ? 's' : ''}` : 'Aucun devis validé'}
            color={devisCount > 0 ? 'green' : 'default'}
          />
          <KpiCard
            label="Payé"
            value={totalPaye > 0 ? fmtK(totalPaye) : '—'}
            sub={factureCount > 0 ? `${factureCount} dépense${factureCount > 1 ? 's' : ''} enregistrée${factureCount > 1 ? 's' : ''}` : 'Aucune dépense'}
            color={totalPaye > 0 ? 'green' : 'default'}
          />
          <KpiCard
            label="Alertes actives"
            value={insightsLoading ? '…' : alertsCount > 0 ? `${alertsCount}` : '✓'}
            sub={alertsCount > 0 ? 'points à surveiller' : 'Tout est sous contrôle'}
            color={alertsCount > 0 ? 'red' : 'green'}
            trend={alertsCount > 0 ? 'down' : 'up'}
          />
          <KpiCard
            label="Lots"
            value={`${lots.length}`}
            sub={lotsManquants > 0 ? `${lotsManquants} sans devis validé` : 'Tous couverts'}
            color={lotsManquants > 0 ? 'amber' : 'green'}
          />
        </div>
      )}

      {/* ── Gauge avec montants réels ─────────────────────────────────────── */}
      {hasAnyBudget && hasRange && (
        <BudgetGauge rangeMin={rangeMin} rangeMax={rangeMax} documents={documentsEnriched} />
      )}

      {/* ── Section devis validés ─────────────────────────────────────────── */}
      {hasAnyBudget && (
        <DevisValidesSection
          devisValides={devisValides}
          lots={lots}
          rangeMax={rangeMax}
          onAddDoc={onAddDoc}
          onGoToAnalyse={onGoToAnalyse}
        />
      )}

      {/* ── Dépenses & paiements ─────────────────────────────────────────── */}
      {(chantierId && token) ? (
        <FacturesPaiements
          documents={documentsEnriched}
          chantierId={chantierId}
          token={token}
          onAddDepense={() => setShowDepenseModal(true)}
          onStatusChange={handleStatusChange}
        />
      ) : (
        <FacturesPaiements
          documents={documentsEnriched}
          chantierId=""
          token=""
          onAddDepense={onAddDoc}
        />
      )}

      {/* ── Modal dépense rapide ──────────────────────────────────────────── */}
      {showDepenseModal && chantierId && token && (
        <DepenseRapideModal
          chantierId={chantierId}
          token={token}
          lots={lots}
          onClose={() => setShowDepenseModal(false)}
          onSaved={() => { setShowDepenseModal(false); onDocumentsRefresh?.(); }}
        />
      )}

      {/* ── Comparaison estimation / devis (si utile) ────────────────────── */}
      {hasAnyBudget && devisCount > 0 && hasRange && (
        <BudgetComparaison rangeMin={rangeMin} rangeMax={rangeMax} documents={documents} />
      )}

      {/* ── Grille lots + alertes ─────────────────────────────────────────── */}
      {hasAnyBudget && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3">
            <LotBreakdown result={result} documents={documents} rangeMin={rangeMin} rangeMax={rangeMax} onGoToLot={onGoToLot} onAddDoc={onAddDoc} />
          </div>
          <div className="lg:col-span-2">
            <AlertesIA lots={lots} documents={documents} onAddDoc={onAddDoc} onGoToLot={onGoToLot} />
          </div>
        </div>
      )}

      {/* ── Explication MO / Matériaux ────────────────────────────────────── */}
      {hasAnyBudget && <BudgetExplication lots={lots} />}

      {/* ── Trésorerie par phase ──────────────────────────────────────────── */}
      {hasAnyBudget && <TresoreriePhases result={result} />}

      {/* ── Module payment_events (trésorerie réelle) ────────────────────── */}
      {chantierId && token && (
        <TresoreriePanel chantierId={chantierId} token={token} budgetMax={rangeMax} />
      )}
    </div>
  );
}

// ── DevisValidesSection ───────────────────────────────────────────────────────

function DevisValidesSection({
  devisValides, lots, rangeMax, onAddDoc, onGoToAnalyse,
}: {
  devisValides: DocumentChantier[];
  lots: import('@/types/chantier-ia').LotChantier[];
  rangeMax: number;
  onAddDoc: () => void;
  onGoToAnalyse: () => void;
}) {
  const total = devisValides.reduce((s, d) => s + (d.montant ?? 0), 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-emerald-500" />
          <h3 className="font-semibold text-gray-900">Devis acceptés</h3>
          {devisValides.length > 0 && (
            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider ml-1">
              {devisValides.length}
            </span>
          )}
        </div>
        {total > 0 && (
          <span className="text-sm font-extrabold text-emerald-700 tabular-nums">{fmtFull(total)}</span>
        )}
      </div>

      {devisValides.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <FileCheck className="h-8 w-8 text-gray-100 mx-auto mb-3" />
          <p className="text-sm text-gray-400 mb-1">Aucun devis validé pour l'instant</p>
          <p className="text-xs text-gray-300 mb-4">
            Validez un devis depuis la vue d'ensemble pour le faire apparaître ici
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={onAddDoc}
              className="text-sm font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-xl transition-colors"
            >
              + Ajouter un devis
            </button>
            <button
              onClick={onGoToAnalyse}
              className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
            >
              Voir mes analyses <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {devisValides.map(doc => {
            const statut = doc.devis_statut as keyof typeof DEVIS_STATUT_CFG;
            const cfg = DEVIS_STATUT_CFG[statut];
            const lot = lots.find(l => l.id === doc.lot_id);
            const pct = rangeMax > 0 && doc.montant ? Math.round((doc.montant / rangeMax) * 100) : null;

            return (
              <div key={doc.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-lg shrink-0">
                  {lot?.emoji ?? '📋'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.nom}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {lot ? lot.nom : 'Sans lot'} · {new Date(doc.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    {pct !== null && <span className="text-gray-300 ml-1">({pct}% du budget)</span>}
                  </p>
                </div>
                {doc.montant != null && (
                  <span className="text-sm font-bold text-gray-900 shrink-0 tabular-nums">
                    {fmtFull(doc.montant)}
                  </span>
                )}
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.pill}`}>
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer totaux vs budget */}
      {devisValides.length > 0 && rangeMax > 0 && (
        <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {total <= rangeMax
              ? `${fmtFull(rangeMax - total)} disponible sur le budget`
              : `⚠️ Dépassement de ${fmtFull(total - rangeMax)}`}
          </span>
          <span className={`text-xs font-bold ${total > rangeMax ? 'text-red-600' : 'text-gray-500'}`}>
            {fmtFull(total)} / {fmtK(rangeMax)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── NextActionBanner ──────────────────────────────────────────────────────────

function NextActionBanner({ lots, documents, hasAnyBudget, devisCount, onAddDoc, onGoToAnalyse, onOpenModal }: {
  lots: import('@/types/chantier-ia').LotChantier[];
  documents: DocumentChantier[];
  hasAnyBudget: boolean;
  devisCount: number;
  onAddDoc: () => void;
  onGoToAnalyse: () => void;
  onOpenModal: () => void;
}) {
  const sortedLots   = [...lots].sort((a, b) => (b.budget_max_ht ?? 0) - (a.budget_max_ht ?? 0));
  const lotsNoDocs   = sortedLots.filter(l => !documents.some(d => d.lot_id === l.id && (d.devis_statut === 'valide' || d.devis_statut === 'attente_facture')));
  const lotsOneDevis = sortedLots.filter(l => documents.filter(d => d.lot_id === l.id && d.document_type === 'devis').length === 1);
  const allCovered   = lots.length > 0 && lotsNoDocs.length === 0;

  type Action = { icon: string; label: string; message: string; btn: string; btnColor: string; onClick: () => void };
  let action: Action;

  if (!hasAnyBudget) {
    action = { icon: '📐', label: 'Prochaine action recommandée', message: 'Affinez votre estimation pour débloquer le suivi budgétaire par intervenant.', btn: 'Affiner mon budget', btnColor: 'bg-blue-600 hover:bg-blue-700 text-white', onClick: onOpenModal };
  } else if (devisCount === 0 && lotsNoDocs[0]) {
    action = { icon: '📋', label: 'Prochaine action recommandée', message: `Ajoutez et validez un devis pour votre ${lotsNoDocs[0].nom.toLowerCase()} pour suivre vos engagements.`, btn: '+ Ajouter un devis', btnColor: 'bg-blue-600 hover:bg-blue-700 text-white', onClick: onAddDoc };
  } else if (lotsOneDevis[0] && devisCount < 2) {
    action = { icon: '⚖️', label: 'Prochaine action recommandée', message: `Comparez votre ${lotsOneDevis[0].nom.toLowerCase()} avec un 2e devis — les prix peuvent varier de 30 %.`, btn: '+ Ajouter un devis', btnColor: 'bg-blue-600 hover:bg-blue-700 text-white', onClick: onAddDoc };
  } else if (lotsNoDocs[0]) {
    action = { icon: '📋', label: 'Prochaine action recommandée', message: `Il manque un devis validé pour : ${lotsNoDocs[0].nom}.`, btn: '+ Ajouter un devis', btnColor: 'bg-blue-600 hover:bg-blue-700 text-white', onClick: onAddDoc };
  } else if (allCovered) {
    action = { icon: '🎉', label: 'Dossier complet', message: 'Tous vos intervenants ont un devis validé. Vous pouvez analyser les offres et démarrer le suivi des paiements.', btn: 'Voir l\'analyse', btnColor: 'bg-emerald-600 hover:bg-emerald-700 text-white', onClick: onGoToAnalyse };
  } else {
    return null;
  }

  return (
    <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3.5">
      <span className="text-xl shrink-0 mt-0.5">{action.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-blue-500 uppercase tracking-wider mb-1">{action.label}</p>
        <p className="text-sm font-medium text-blue-900 leading-snug">{action.message}</p>
      </div>
      <button onClick={action.onClick}
        className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap ${action.btnColor}`}>
        {action.btn}
      </button>
    </div>
  );
}
