import { useState } from 'react';
import {
  Plus, SlidersHorizontal,
} from 'lucide-react';
import type { DocumentChantier, LotChantier } from '@/types/chantier-ia';
import { KpiCard, ViewToggle, DiyCard, EtatChantierBlock, AssistantActiveBlock, RdvReminder } from './DashboardWidgets';
import LotIntervenantCard from './LotIntervenantCard';
import IntervenantsListView from '@/components/chantier/cockpit/IntervenantsListView';
import ComparateurDevisModal from '@/components/chantier/cockpit/ComparateurDevisModal';
import { fmtK } from '@/lib/dashboardHelpers';
import type { BreakdownItem } from './BudgetTresorerie';
import PlanningWidget from './planning/PlanningWidget';
import { parseDate } from '@/lib/planningUtils';

function DashboardHome({ lots, documents, docsByLot, displayMin, displayMax, refinedBreakdown, onAffineBudget,
  onAddDevisForLot, onAddDocForLot, onGoToLot, onGoToAnalyse, onGoToPlanning, onAddDoc,
  onGoToAssistant, onAddIntervenant, onDeleteLot, onDeleteDoc, onGoToDiy, chantierId, token,
  viewMode, onViewModeChange, onDocStatutUpdated,
}: {
  lots: LotChantier[];
  documents: DocumentChantier[];
  docsByLot: Record<string, DocumentChantier[]>;
  displayMin: number;
  displayMax: number;
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
}) {

  const [comparingLot, setComparingLot] = useState<{ lot: LotChantier; docs: DocumentChantier[] } | null>(null);

  const total     = lots.length;
  const validated = lots.filter(l => ['ok', 'termine', 'en_cours', 'contrat_signe'].includes(l.statut ?? '')).length;
  const withDevis = lots.filter(l =>
    (docsByLot[l.id] ?? []).some(d => d.document_type === 'devis') &&
    !['ok', 'termine', 'en_cours', 'contrat_signe'].includes(l.statut ?? ''),
  ).length;
  const blocked   = Math.max(0, total - validated - withDevis);
  const pct       = total > 0 ? Math.round((validated / total) * 100) : 0;
  const totalDocs = documents.length;

  return (
    <div className="px-5 py-5 space-y-5">

      {/* ── 4 KPI cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          icon="💰" label="Budget estimé"
          value={displayMin > 0 ? `${fmtK(displayMin)}–${fmtK(displayMax)}` : '—'}
          sub={displayMin > 0 ? 'fourchette estimée' : 'à estimer'}
          accent="blue"
          action={
            <button
              onClick={onAffineBudget}
              className="flex items-center gap-1 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1 transition-colors"
            >
              <SlidersHorizontal className="h-3 w-3" />
              {refinedBreakdown.length > 0 ? 'Recalculer' : 'Affiner'}
            </button>
          }
        />
        <KpiCard
          icon="✅" label="Intervenants"
          value={total > 0 ? `${validated}/${total}` : '0'}
          sub={total > 0 ? 'validés' : 'aucun intervenant'}
          accent={validated === total && total > 0 ? 'emerald' : 'gray'}
        />
        <KpiCard
          icon="📄" label="Documents"
          value={totalDocs}
          sub={totalDocs > 0 ? `devis, factures, photos` : 'aucun document'}
          accent={totalDocs > 0 ? 'blue' : 'gray'}
        />
        <KpiCard
          icon="⚡" label="À traiter"
          value={blocked}
          sub={blocked > 0 ? `intervenant${blocked > 1 ? 's' : ''} sans devis` : 'tout est suivi'}
          accent={blocked > 0 ? 'red' : 'emerald'}
        />
      </div>

      {/* ── Barre de progression globale ────────────────────── */}
      {total > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-sm font-semibold text-gray-700">Progression du projet</p>
            <span className={`text-sm font-extrabold ${pct >= 80 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
              {pct}% validé
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${pct >= 80 ? 'bg-emerald-400' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'}`}
              style={{ width: `${Math.max(pct, 2)}%` }}
            />
          </div>
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{validated} validés
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{withDevis} avec devis
            </span>
            {blocked > 0 && (
              <span className="flex items-center gap-1.5 text-[11px] text-red-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />{blocked} à traiter
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Détail budget par poste (pleine largeur, visible si affiné) ── */}
      {refinedBreakdown.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-1.5 bg-gray-50 flex items-center justify-between border-b border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Postes affinés</p>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Fiabilité</p>
          </div>
          <ul className="divide-y divide-gray-50">
            {refinedBreakdown.map(item => {
              const rel =
                item.reliability === 'haute'   ? { dot: 'bg-emerald-400', label: 'Haute',  text: 'text-emerald-600' } :
                item.reliability === 'moyenne' ? { dot: 'bg-amber-400',   label: 'Moy.',   text: 'text-amber-600'  } :
                                                 { dot: 'bg-gray-300',    label: 'Faible', text: 'text-gray-400'   };
              return (
                <li key={item.id} className="px-5 py-2.5 flex items-center gap-2">
                  <span className="text-base leading-none shrink-0">{item.emoji}</span>
                  <span className="flex-1 min-w-0 text-xs font-medium text-gray-700 truncate">{item.label}</span>
                  <span className="shrink-0 tabular-nums text-xs font-bold text-gray-900 whitespace-nowrap">
                    {fmtK(item.min)}–{fmtK(item.max)}
                  </span>
                  <span className={`shrink-0 flex items-center gap-1 text-[10px] font-bold ${rel.text}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${rel.dot}`} />
                    {rel.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Planning résumé ───────────────────────────────────── */}
      <PlanningWidget lots={lots} startDate={parseDate(lots[0]?.date_debut)} onGoToPlanning={onGoToPlanning} />

      {/* ── RDV à venir ─────────────────────────────────────── */}
      <RdvReminder chantierId={chantierId} onGoToPlanning={onGoToPlanning} />

      {/* ── Recommandation IA (pleine largeur) ──────────────── */}
      <AssistantActiveBlock
        lots={lots}
        documents={documents}
        onAddDevisForLot={onAddDevisForLot}
        onGoToAnalyse={onGoToAnalyse}
        onGoToPlanning={onGoToPlanning}
        onAddDoc={onAddDoc}
        onGoToAssistant={onGoToAssistant}
      />

      {/* ── Intervenants (pleine largeur, 3 colonnes) ────────── */}
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
            onGoToLot={onGoToLot}
            onGoToDiy={onGoToDiy}
            chantierId={chantierId}
            token={token}
            onDocStatutUpdated={onDocStatutUpdated}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {lots.map(lot => (
                <LotIntervenantCard
                  key={lot.id}
                  lot={lot}
                  docs={docsByLot[lot.id] ?? []}
                  onAddDevis={() => onAddDevisForLot(lot.id)}
                  onAddDocument={() => onAddDocForLot(lot.id)}
                  onDetail={() => onGoToLot(lot.id)}
                  onDelete={() => onDeleteLot(lot.id)}
                  onCompare={(l, d) => setComparingLot({ lot: l, docs: d })}
                />
              ))}
              {/* Carte DIY — toujours présente, travaux réalisés par le client */}
              <DiyCard onAddDoc={onAddDoc} onGoToDiy={onGoToDiy} />
            </div>
            {/* Modal comparateur — rendu hors de la grille pour éviter les problèmes de stacking context */}
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
  );
}

export default DashboardHome;
