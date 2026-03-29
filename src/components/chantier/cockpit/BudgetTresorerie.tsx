/**
 * BudgetTresorerie — écran financier premium du cockpit chantier.
 * Orchestrateur : sections budget, affinage, alertes, trésorerie.
 */
import { useState } from 'react';
import { Wallet, SlidersHorizontal, ChevronRight } from 'lucide-react';
import type { ChantierIAResult, DocumentChantier } from '@/types/chantier-ia';
import type { InsightsData } from './useInsights';
import TresoreriePanel from './TresoreriePanel';
import { fmtK } from '@/lib/budgetHelpers';
import { type BreakdownItem } from '@/lib/budgetAffinageData';
import KpiCard from './budget/BudgetKpiCard';
import BudgetGauge from './budget/BudgetGauge';
import LotBreakdown from './budget/LotBreakdown';
import AlertesIA from './budget/AlertesIA';
import TresoreriePhases from './budget/TresoreriePhases';
import FacturesPaiements from './budget/FacturesPaiements';
import QuickActions from './budget/QuickActions';
import ProjectHeader from './budget/ProjectHeader';
import ReliabilityBadge from './budget/ReliabilityBadge';
import BudgetComparaison from './budget/BudgetComparaison';
import BudgetExplication from './budget/BudgetExplication';
import BudgetAffinageModal, { ScoreBadge } from './budget/BudgetAffinageModal';

// Re-export for consumers (DashboardUnified imports BreakdownItem from here)
export type { BreakdownItem };

// ── Props & composant principal ───────────────────────────────────────────────

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
}

export default function BudgetTresorerie({ result, documents, chantierId, token, insights, insightsLoading, baseRangeMin, baseRangeMax, onAddDoc, onGoToAnalyse, onGoToLots, onGoToLot, onRangeRefined, onAmeliorer, autoOpenModal, onModalClose }: Props) {
  const lots = result.lots ?? [];

  // ── État modal affinage ────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]       = useState(autoOpenModal ?? false);
  const [refinedMin, setRefinedMin]         = useState<number | null>(null);
  const [refinedMax, setRefinedMax]         = useState<number | null>(null);
  const [affinageScore, setAffinageScore]   = useState(0);
  const [refinedBreakdown, setRefinedBreakdown] = useState<BreakdownItem[]>([]);
  const isImmeuble = (result.nom + ' ' + result.description).toLowerCase().includes('immeuble');

  // ── Budget — utilise la source unique passée en props ─────────────────────
  const hasLotBudget   = lots.some(l => (l.budget_min_ht ?? 0) > 0 || (l.budget_max_ht ?? 0) > 0);
  const hasBudgetTotal = (result.budgetTotal ?? 0) > 5000;
  const hasAnyBudget   = hasLotBudget || hasBudgetTotal || baseRangeMin > 0;
  const hasDevis       = documents.some(d => d.document_type === 'devis');

  const rangeMin  = refinedMin ?? baseRangeMin;
  const rangeMax  = refinedMax ?? baseRangeMax;
  const hasRange  = rangeMin > 0 || rangeMax > 0;
  const isRefined = refinedMin !== null;

  const devisCount    = documents.filter(d => d.document_type === 'devis').length;
  const factureCount  = documents.filter(d => d.document_type === 'facture').length;
  const lotsAvecDevis = lots.filter(l => documents.some(d => d.lot_id === l.id && d.document_type === 'devis')).length;
  const lotsManquants = lots.length - lotsAvecDevis;
  const alertsCount   = insights?.global.filter(i => i.type === 'alert' || i.type === 'warning').length ?? 0;

  function handleValidate(min: number, max: number, breakdown: BreakdownItem[]) {
    setRefinedMin(min); setRefinedMax(max); setAffinageScore(6); setModalOpen(false);
    setRefinedBreakdown(breakdown);
    onRangeRefined?.(min, max, breakdown);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-7 space-y-5">

      {/* ── Header projet ─────────────────────────────────────────────────── */}
      <ProjectHeader emoji={result.emoji} nom={result.nom} hasAnyBudget={hasAnyBudget} onAmeliorer={onAmeliorer} />

      {/* ── 🎯 Prochaine action recommandée ──────────────────────────────── */}
      <NextActionBanner
        lots={lots} documents={documents} hasAnyBudget={hasAnyBudget} devisCount={devisCount}
        onAddDoc={onAddDoc} onGoToAnalyse={onGoToAnalyse} onOpenModal={() => setModalOpen(true)}
      />

      {/* ── État 1 : aucun budget ────────────────────────────────────────── */}
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

      {/* ── État 2+ : fourchette cliquable ───────────────────────────────── */}
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
          <p className="text-xs text-gray-400">
            Basé sur les prix du marché réels. Affinez pour plus de précision.
          </p>
          <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-2 text-blue-600 group-hover:text-blue-700 transition-colors">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">Affiner mon estimation</span>
            <ChevronRight className="h-3.5 w-3.5 ml-auto" />
          </div>
        </button>
      )}

      {/* ── Modal affinage budget ─────────────────────────────────────────── */}
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

      {/* ── Détail par poste (affiché après affinage) ─────────────────────── */}
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
            <span className="text-base font-extrabold text-emerald-800">
              {fmtK(rangeMin)} – {fmtK(rangeMax)}
            </span>
          </div>
        </div>
      )}

      {/* ── Comparaison estimation / devis ─────────────────────────────────── */}
      {hasAnyBudget && hasDevis && hasRange && (
        <BudgetComparaison rangeMin={rangeMin} rangeMax={rangeMax} documents={documents} />
      )}

      {/* ── KPI Row ────────────────────────────────────────────────────────── */}
      {hasAnyBudget && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Devis reçus" value={devisCount > 0 ? `${devisCount}` : '—'}
            sub={devisCount > 0 ? `${lotsManquants} lot${lotsManquants !== 1 ? 's' : ''} sans devis` : 'Aucun devis ajouté'}
            color={lotsManquants > 0 ? 'amber' : devisCount > 0 ? 'green' : 'default'}
            trend={lotsManquants > 0 ? 'down' : devisCount > 0 ? 'up' : 'neutral'} />
          <KpiCard label="Factures enregistrées" value={factureCount > 0 ? `${factureCount}` : '—'}
            sub={factureCount > 0 ? 'paiements suivis' : 'Aucune facture'}
            color={factureCount > 0 ? 'green' : 'default'} />
          <KpiCard label="Alertes actives" value={insightsLoading ? '…' : alertsCount > 0 ? `${alertsCount}` : '✓'}
            sub={alertsCount > 0 ? 'points à surveiller' : 'Tout est sous contrôle'}
            color={alertsCount > 0 ? 'red' : 'green'} trend={alertsCount > 0 ? 'down' : 'up'} />
          <KpiCard label="Lots" value={`${lots.length}`}
            sub={lotsManquants > 0 ? `${lotsManquants} sans devis` : 'Tous documentés'}
            color={lotsManquants > 0 ? 'amber' : 'green'} />
        </div>
      )}

      {/* ── Budget gauge ───────────────────────────────────────────────────── */}
      {hasAnyBudget && hasDevis && hasRange && (
        <BudgetGauge rangeMin={rangeMin} rangeMax={rangeMax} documents={documents} />
      )}

      {/* ── Grille lots + alertes ──────────────────────────────────────────── */}
      {hasAnyBudget && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3"><LotBreakdown result={result} documents={documents} rangeMin={rangeMin} rangeMax={rangeMax} onGoToLot={onGoToLot} onAddDoc={onAddDoc} /></div>
          <div className="lg:col-span-2"><AlertesIA lots={lots} documents={documents} onAddDoc={onAddDoc} onGoToLot={onGoToLot} /></div>
        </div>
      )}

      {/* ── Explication MO / Matériaux ─────────────────────────────────────── */}
      {hasAnyBudget && <BudgetExplication lots={lots} />}

      {/* ── Trésorerie par phase ────────────────────────────────────────────── */}
      {hasAnyBudget && <TresoreriePhases result={result} />}

      {/* ── Factures & paiements ────────────────────────────────────────────── */}
      <FacturesPaiements documents={documents} onAddFacture={onAddDoc} />

      {/* ── Module Budget & Trésorerie (payment_events réels) ──────────────── */}
      {chantierId && token && (
        <TresoreriePanel chantierId={chantierId} token={token} budgetMax={rangeMax} />
      )}

      {/* ── Quick actions ───────────────────────────────────────────────────── */}
      <QuickActions onAddDoc={onAddDoc} onGoToAnalyse={onGoToAnalyse} onGoToLots={onGoToLots} />
    </div>
  );
}

// ── Sous-composant interne : bannière prochaine action ────────────────────────

function NextActionBanner({ lots, documents, hasAnyBudget, devisCount, onAddDoc, onGoToAnalyse, onOpenModal }: {
  lots: import('@/types/chantier-ia').LotChantier[];
  documents: DocumentChantier[];
  hasAnyBudget: boolean;
  devisCount: number;
  onAddDoc: () => void;
  onGoToAnalyse: () => void;
  onOpenModal: () => void;
}) {
  const sortedLots  = [...lots].sort((a, b) => (b.budget_max_ht ?? 0) - (a.budget_max_ht ?? 0));
  const lotsNoDocs  = sortedLots.filter(l => !documents.some(d => d.lot_id === l.id && d.document_type === 'devis'));
  const lotsOneDevis = sortedLots.filter(l => documents.filter(d => d.lot_id === l.id && d.document_type === 'devis').length === 1);
  const allCovered  = lots.length > 0 && lotsNoDocs.length === 0;

  type Action = { icon: string; label: string; message: string; btn: string; btnColor: string; onClick: () => void };
  let action: Action;

  if (!hasAnyBudget) {
    action = { icon: '📐', label: 'Prochaine action recommandée', message: 'Affinez votre estimation pour débloquer le suivi budgétaire par intervenant.', btn: 'Affiner mon budget', btnColor: 'bg-blue-600 hover:bg-blue-700 text-white', onClick: onOpenModal };
  } else if (devisCount === 0 && lotsNoDocs[0]) {
    action = { icon: '📋', label: 'Prochaine action recommandée', message: `Demandez un devis à votre ${lotsNoDocs[0].nom.toLowerCase()} pour valider ce poste budgétaire.`, btn: '+ Ajouter un devis', btnColor: 'bg-blue-600 hover:bg-blue-700 text-white', onClick: onAddDoc };
  } else if (lotsOneDevis[0]) {
    action = { icon: '⚖️', label: 'Prochaine action recommandée', message: `Comparez votre ${lotsOneDevis[0].nom.toLowerCase()} avec un 2e devis — les prix peuvent varier de 30 %.`, btn: '+ Ajouter un devis', btnColor: 'bg-blue-600 hover:bg-blue-700 text-white', onClick: onAddDoc };
  } else if (lotsNoDocs[0]) {
    action = { icon: '📋', label: 'Prochaine action recommandée', message: `Il manque un devis pour votre ${lotsNoDocs[0].nom.toLowerCase()}.`, btn: '+ Ajouter un devis', btnColor: 'bg-blue-600 hover:bg-blue-700 text-white', onClick: onAddDoc };
  } else if (allCovered) {
    action = { icon: '🎉', label: 'Dossier complet', message: 'Tous vos intervenants ont au moins 2 devis. Vous pouvez analyser et comparer les offres.', btn: 'Voir l\u2019analyse', btnColor: 'bg-emerald-600 hover:bg-emerald-700 text-white', onClick: onGoToAnalyse };
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
