import { useState, useEffect, useRef } from 'react';
import { Plus, SlidersHorizontal, HelpCircle, X } from 'lucide-react';
import type { DocumentChantier, LotChantier } from '@/types/chantier-ia';
import { KpiCard, ViewToggle, DiyCard, RDV_EMOJI } from './DashboardWidgets';
import LotIntervenantCard from './LotIntervenantCard';
import IntervenantsListView from '@/components/chantier/cockpit/IntervenantsListView';
import ComparateurDevisModal from '@/components/chantier/cockpit/ComparateurDevisModal';
import { fmtK } from '@/lib/dashboardHelpers';
import type { BreakdownItem } from './BudgetTresorerie';

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

// ── DashboardHome ─────────────────────────────────────────────────────────────

function DashboardHome({ lots, documents, docsByLot, displayMin, displayMax, refinedBreakdown, onAffineBudget,
  onAddDevisForLot, onAddDocForLot, onGoToLot, onGoToAnalyse, onGoToPlanning, onAddDoc,
  onGoToAssistant, onAddIntervenant, onDeleteLot, onDeleteDoc, onGoToDiy, chantierId, token,
  viewMode, onViewModeChange, onDocStatutUpdated, onDocMoved,
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
  onDocMoved?: (docId: string, newLotId: string) => void;
}) {

  const [comparingLot, setComparingLot] = useState<{ lot: LotChantier; docs: DocumentChantier[] } | null>(null);

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
    return (docsByLot[l.id] ?? []).some(
      d => d.document_type === 'devis' && d.devis_statut === 'valide',
    );
  }).length;
  const withDevis = lots.filter(l => {
    if (STATUTS_VALIDES.includes(l.statut ?? '')) return false;
    const docs = docsByLot[l.id] ?? [];
    const hasValidated = docs.some(d => d.document_type === 'devis' && d.devis_statut === 'valide');
    if (hasValidated) return false;
    return docs.some(d => d.document_type === 'devis');
  }).length;
  const blocked   = Math.max(0, total - validated - withDevis);
  const totalDocs = documents.length;

  return (
    <div className="px-5 py-5 space-y-5">

      {/* ── KPI cards ──────────────────────────────────────────── */}
      <div className={`grid grid-cols-2 gap-3 ${nextRdv ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>

        {/* Budget estimé + tooltip breakdown */}
        <KpiCard
          icon="💰" label="Budget estimé"
          value={displayMin > 0 ? `${fmtK(displayMin)}–${fmtK(displayMax)}` : '—'}
          sub={displayMin > 0 ? 'fourchette estimée' : 'à estimer'}
          accent="blue"
          action={
            <div className="flex items-center gap-1.5">
              {refinedBreakdown.length > 0 && (
                <BudgetBreakdownPopover items={refinedBreakdown} />
              )}
              <button
                onClick={onAffineBudget}
                className="flex items-center gap-1 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1 transition-colors"
              >
                <SlidersHorizontal className="h-3 w-3" />
                {refinedBreakdown.length > 0 ? 'Recalculer' : 'Affiner'}
              </button>
            </div>
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
  );
}

export default DashboardHome;
