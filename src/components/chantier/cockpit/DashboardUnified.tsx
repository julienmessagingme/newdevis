/**
 * DashboardUnified — cockpit chantier avec sidebar premium.
 * Orchestrateur : routing entre sections, state management, modals.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { ArrowLeft, Menu } from 'lucide-react';
import type {
  ChantierIAResult, DocumentChantier, DocumentType, LotChantier, StatutArtisan,
} from '@/types/chantier-ia';
import { useInsights } from './useInsights';
import BudgetTresorerie, { type BreakdownItem } from './BudgetTresorerie';
import TresoreriePanel from './TresoreriePanel';
import PlanningChantier from './PlanningChantier';
import ContactsSection from './ContactsSection';
import ScreenEditPrompt from '@/components/chantier/nouveau/ScreenEditPrompt';
import MessagerieSection from './MessagerieSection';
import { useConversations } from '@/hooks/useConversations';
import UploadDocumentModal from '@/components/chantier/cockpit/UploadDocumentModal';
import AddIntervenantModal from '@/components/chantier/cockpit/AddIntervenantModal';
import ChatDrawer from '@/components/chantier/cockpit/ChatDrawer';
import DocumentsView from '@/components/chantier/cockpit/DocumentsView';
import { fmtK } from '@/lib/dashboardHelpers';
import Sidebar, { type Section, type NavBadge } from './Sidebar';
import LotDetail from './LotDetail';
import DashboardHome from './DashboardHome';
import AnalyseDevisSection from './AnalyseDevisSection';
import TravauxDIYSection from './TravauxDIYSection';
import ChantierAssistantChat from '@/components/chantier/ChantierAssistantChat';
import AgentActivityFeed from './AgentActivityFeed';
import JournalChantierSection from './JournalChantierSection';
import UserCoordonnees from './UserCoordonnees';
import { useAgentInsights } from '@/hooks/useAgentInsights';
import { useAnalysisScores } from '@/hooks/useAnalysisScores';

// ── Supabase ──────────────────────────────────────────────────────────────────

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

// ── Props & composant principal ───────────────────────────────────────────────

interface Props {
  result: ChantierIAResult;
  chantierId: string | null;
  token?: string | null;
  onLotStatutChange?: (lotId: string, statut: StatutArtisan) => void;
  initialBudgetAffine?: { min: number; max: number; breakdown: unknown[] } | null;
  initialFinancing?: Record<string, unknown> | null;
  initialEnveloppePrevue?: number | null;
}

export default function DashboardUnified({ result: resultProp, chantierId, token, initialBudgetAffine, initialFinancing, initialEnveloppePrevue }: Props) {
  const [result, setResult]               = useState(resultProp);
  const [showAmelioration, setShowAmelioration] = useState(false);
  const [showBudgetDetail, setShowBudgetDetail]   = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('budget');
  const [homeViewMode, setHomeViewMode]   = useState<'cards' | 'list'>('cards');
  const [mobileOpen, setMobileOpen]       = useState(false);
  const [documents, setDocuments]         = useState<DocumentChantier[]>([]);
  const [pendingDescribeIds, setPendingDescribeIds] = useState<string[]>([]);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [uploadModal, setUploadModal]     = useState<{ open: boolean; lotId?: string; defaultType?: DocumentType }>({ open: false });
  const lots = result.lots ?? [];

  // Persist last visited chantier for header link
  useEffect(() => {
    if (chantierId) localStorage.setItem('lastChantierId', chantierId);
  }, [chantierId]);

  // Messagerie: unread count for sidebar badge
  const { totalUnread: msgUnread } = useConversations(chantierId);

  // ── Insights ──────────────────────────────────────────────────────────────
  const { insights, loading: insightsLoading, refresh: refreshInsights } = useInsights(
    chantierId, token, documents.length,
  );

  // ── Budget — source unique de vérité ──────────────────────────────────────
  const hasLotBudget   = lots.some(l => (l.budget_min_ht ?? 0) > 0 || (l.budget_max_ht ?? 0) > 0);
  const hasBudgetTotal = (result.budgetTotal ?? 0) > 5000;
  const baseRangeMin = hasLotBudget
    ? lots.reduce((s, l) => s + (l.budget_min_ht ?? 0), 0)
    : hasBudgetTotal ? Math.round(result.budgetTotal * 0.88) : 0;
  const baseRangeMax = hasLotBudget
    ? lots.reduce((s, l) => s + (l.budget_max_ht ?? 0), 0)
    : hasBudgetTotal ? Math.round(result.budgetTotal * 1.15) : 0;
  const [refinedRangeMin, setRefinedRangeMin] = useState<number | null>(initialBudgetAffine?.min ?? null);
  const [refinedRangeMax, setRefinedRangeMax] = useState<number | null>(initialBudgetAffine?.max ?? null);
  const [refinedBreakdown, setRefinedBreakdown] = useState<BreakdownItem[]>((initialBudgetAffine?.breakdown ?? []) as BreakdownItem[]);
  const [affineBudgetModal, setAffineBudgetModal] = useState(false);
  const [showAddIntervenant, setShowAddIntervenant] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const displayMin = refinedRangeMin ?? baseRangeMin;
  const displayMax = refinedRangeMax ?? baseRangeMax;

  // ── Budget réel (synchronisé avec BudgetTab via custom event) ────────────
  const [budgetReel, setBudgetReel] = useState<number | null>(() => {
    if (!chantierId) return null;
    try { const s = localStorage.getItem(`budget_reel_${chantierId}`); return s ? parseFloat(s) : null; }
    catch { return null; }
  });
  useEffect(() => {
    function handler(e: Event) {
      const { chantierId: cid, value } = (e as CustomEvent).detail;
      if (cid === chantierId) setBudgetReel(value);
    }
    window.addEventListener('budgetReelChanged', handler);
    return () => window.removeEventListener('budgetReelChanged', handler);
  }, [chantierId]);

  // ── Documents ─────────────────────────────────────────────────────────────
  const loadDocuments = useCallback(async () => {
    if (!chantierId || !token) return;
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { const d = await res.json(); setDocuments(d.documents ?? []); }
    } catch {}
  }, [chantierId, token]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  // ── Analysis scores (TTC depuis les analyses) ─────────────────────────────
  const allDevisForScores = useMemo(() => documents.filter(d => d.document_type === 'devis'), [documents]);
  const { data: docAnalysisData } = useAnalysisScores(allDevisForScores);

  async function handleDeleteDoc(docId: string) {
    if (!chantierId || !token) return;
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents/${docId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== docId));
        toast.success('Document supprimé');
      } else {
        toast.error('Impossible de supprimer ce document');
      }
    } catch {
      toast.error('Erreur réseau');
    }
  }

  function handleDocMoved(docId: string, newLotId: string) {
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, lot_id: newLotId } : d));
  }

  // ── Index docs par lot ────────────────────────────────────────────────────
  const docsByLot = useMemo(() => {
    const idx: Record<string, DocumentChantier[]> = {};
    for (const doc of documents) (idx[doc.lot_id ?? '__none__'] ??= []).push(doc);
    return idx;
  }, [documents]);

  // ── Agent insights — badge sidebar (alertes IA proactives) ────────────────
  const agentInsights = useAgentInsights(chantierId, token);
  const hasCriticalInsight = agentInsights.insights.some(i => !i.read_by_user && i.severity === 'critical');

  // ── Chat assistant unread count ────────────────────────────────────────────
  const [chatUnread, setChatUnread] = useState(0);
  useEffect(() => {
    if (!chantierId || !token) return;
    fetch(`/api/chantier/${chantierId}/assistant/thread`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.unread_count) setChatUnread(d.unread_count); })
      .catch(() => {});
  }, [chantierId, token]);

  const totalAlertCount = agentInsights.unreadCount + chatUnread;

  // ── Toast notifications for recent agent alerts (not historical) ──────────
  const toastedIds = useRef(new Set<string>());
  useEffect(() => {
    if (!agentInsights.insights.length) return;
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const recent = agentInsights.insights.filter(
      i => !i.read_by_user
        && (i.severity === 'warning' || i.severity === 'critical')
        && new Date(i.created_at).getTime() > fiveMinAgo
        && !toastedIds.current.has(i.id)
    );
    if (recent.length === 0) return;
    const toShow = recent.slice(0, 3);
    for (const ins of toShow) {
      toastedIds.current.add(ins.id);
      if (ins.severity === 'critical') {
        toast.error(ins.title, { duration: 8000 });
      } else {
        toast.warning(ins.title, { duration: 6000 });
      }
    }
    if (recent.length > 3) {
      toast.info(`+ ${recent.length - 3} alertes dans l'onglet Assistant`, { duration: 5000 });
    }
  }, [agentInsights.insights]);

  // ── Badges sidebar ────────────────────────────────────────────────────────
  const navBadges = useMemo<Partial<Record<Section, NavBadge>>>(() => {
    return {
      documents:  documents.length > 0
        ? { text: `${documents.length}`, style: 'bg-gray-100 text-gray-600' }
        : undefined,
      messagerie: msgUnread > 0
        ? { text: `${msgUnread}`, style: 'bg-blue-100 text-blue-700' }
        : undefined,
      assistant:  totalAlertCount > 0
        ? {
            text: `${totalAlertCount}`,
            style: hasCriticalInsight
              ? 'bg-red-500 text-white'
              : 'bg-amber-400 text-white',
          }
        : undefined,
    };
  }, [documents, msgUnread, totalAlertCount, hasCriticalInsight]);

  const selectedLot = lots.find(l => l.id === selectedLotId);
  const hasDiyOpportunity = lots.some(l => l.statut === 'a_trouver');

  // ── Navigation helpers ────────────────────────────────────────────────────
  function navigateTo(s: Section) {
    setActiveSection(s);
    if (s !== 'lots') setSelectedLotId(null);
    setShowBudgetDetail(false);
    setAffineBudgetModal(false);
    // Reset chat unread badge when opening the assistant tab
    if (s === 'assistant') setChatUnread(0);
  }

  // ── Lot mutations ─────────────────────────────────────────────────────────
  const deleteLot = useCallback(async (lotId: string) => {
    if (!chantierId || !token) return;
    try {
      await fetch(`/api/chantier/${chantierId}/lots/${lotId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setResult(prev => ({ ...prev, lots: (prev.lots ?? []).filter(l => l.id !== lotId) }));
    } catch {}
  }, [chantierId, token]);

  const addLot = useCallback((lot: LotChantier) => {
    setResult(prev => ({ ...prev, lots: [...(prev.lots ?? []), lot] }));
  }, []);

  // ── Rendu du contenu ──────────────────────────────────────────────────────
  function renderContent() {
    // Lots — vue détail lot
    if (activeSection === 'lots' && selectedLotId && selectedLot) {
      return (
        <LotDetail
          lot={selectedLot}
          docs={docsByLot[selectedLot.id] ?? []}
          onAddDoc={() => setUploadModal({ open: true, lotId: selectedLot.id.startsWith('fallback-') ? undefined : selectedLot.id })}
          onDeleteDoc={handleDeleteDoc}
          onBack={() => { setSelectedLotId(null); navigateTo('budget'); }}
          chantierId={chantierId}
          token={token}
          onDocStatutUpdated={(docId, statut) =>
            setDocuments(prev => prev.map(d => d.id === docId ? { ...d, devis_statut: statut as any } : d))
          }
        />
      );
    }

    switch (activeSection) {
      case 'budget':
        if (showBudgetDetail) {
          return (
            <BudgetTresorerie
              result={result}
              documents={documents}
              chantierId={chantierId}
              token={token}
              insights={insights}
              insightsLoading={insightsLoading}
              baseRangeMin={baseRangeMin}
              baseRangeMax={baseRangeMax}
              onAddDoc={() => setUploadModal({ open: true })}
              onGoToAnalyse={() => navigateTo('analyse')}
              onGoToLots={() => navigateTo('lots')}
              onGoToLot={(lotId) => { setSelectedLotId(lotId); navigateTo('lots'); }}
              onRangeRefined={(min, max, breakdown) => {
                setRefinedRangeMin(min);
                setRefinedRangeMax(max);
                setRefinedBreakdown(breakdown ?? []);
                setShowBudgetDetail(false);
                setAffineBudgetModal(false);
                if (chantierId && token) {
                  fetch(`/api/chantier/${chantierId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ budgetAffine: { min, max, breakdown: breakdown ?? [] } }),
                  }).catch(() => {});
                }
              }}
              onModalClose={() => {
                setShowBudgetDetail(false);
                setAffineBudgetModal(false);
              }}
              onAmeliorer={() => setShowAmelioration(true)}
              autoOpenModal={affineBudgetModal}
            />
          );
        }
        return (
          <DashboardHome
            lots={lots}
            documents={documents}
            docsByLot={docsByLot}
            displayMin={displayMin}
            displayMax={displayMax}
            budgetReel={budgetReel}
            refinedBreakdown={refinedBreakdown}
            onAffineBudget={() => { setShowBudgetDetail(true); setAffineBudgetModal(true); }}
            onAddDevisForLot={(lotId) => setUploadModal({ open: true, lotId, defaultType: 'devis' })}
            onAddDocForLot={(lotId) => setUploadModal({ open: true, lotId, defaultType: 'photo' })}
            onGoToLot={(lotId) => { setSelectedLotId(lotId); navigateTo('lots'); }}
            onGoToAnalyse={() => navigateTo('analyse')}
            onGoToPlanning={() => navigateTo('planning')}
            onAddDoc={() => setUploadModal({ open: true })}
            onGoToAssistant={() => setChatOpen(true)}
            onAddIntervenant={() => setShowAddIntervenant(true)}
            onDeleteLot={deleteLot}
            onDeleteDoc={handleDeleteDoc}
            onGoToDiy={() => navigateTo('diy')}
            chantierId={chantierId!}
            token={token}
            viewMode={homeViewMode}
            onViewModeChange={setHomeViewMode}
            onDocStatutUpdated={(docId, statut) =>
              setDocuments(prev => prev.map(d => {
                if (d.id !== docId) return d;
                return d.document_type === 'facture'
                  ? { ...d, facture_statut: statut as any }
                  : { ...d, devis_statut: statut as any };
              }))
            }
            onDocMoved={handleDocMoved}
          />
        );

      case 'lots': {
        const targetId  = selectedLotId ?? lots[0]?.id ?? null;
        const targetLot = targetId ? lots.find(l => l.id === targetId) : null;
        if (!targetLot) return null;
        return (
          <LotDetail
            lot={targetLot}
            docs={docsByLot[targetLot.id] ?? []}
            onAddDoc={() => setUploadModal({ open: true, lotId: targetLot.id.startsWith('fallback-') ? undefined : targetLot.id })}
            onDeleteDoc={handleDeleteDoc}
            onBack={() => { setSelectedLotId(null); navigateTo('budget'); }}
            chantierId={chantierId}
            token={token}
            onDocStatutUpdated={(docId, statut) =>
              setDocuments(prev => prev.map(d => {
                if (d.id !== docId) return d;
                return d.document_type === 'facture'
                  ? { ...d, facture_statut: statut as any }
                  : { ...d, devis_statut: statut as any };
              }))
            }
            onDurationChange={chantierId && token ? async (dureeJours) => {
              const res = await fetch(`/api/chantier/${chantierId}/planning`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ lots: [{ id: targetLot.id, duree_jours: dureeJours }] }),
              });
              if (!res.ok) return;
              // Refresh lots depuis la réponse du serveur (cascade recalculée)
              const data = await res.json();
              if (Array.isArray(data.lots)) {
                setResult(prev => ({ ...prev, lots: data.lots }));
              }
            } : undefined}
          />
        );
      }

      case 'contacts':
        return chantierId && token ? (
          <ContactsSection chantierId={chantierId} token={token} />
        ) : null;

      case 'messagerie':
        return chantierId && token ? (
          <MessagerieSection chantierId={chantierId} chantierNom={result.nom} token={token} />
        ) : null;

      case 'analyse':
        return (
          <AnalyseDevisSection
            documents={documents}
            lots={lots}
            insights={insights}
            insightsLoading={insightsLoading}
            onAddDoc={() => setUploadModal({ open: true, defaultType: 'devis' })}
            chantierId={chantierId}
            token={token}
          />
        );

      case 'planning':
        return (
          <PlanningChantier
            result={result}
            chantierId={chantierId ?? null}
            token={token ?? null}
          />
        );

      case 'documents':
        return (
          <DocumentsView
            documents={documents}
            lots={lots}
            chantierId={chantierId!}
            token={token!}
            onAddDoc={() => setUploadModal({ open: true })}
            onDeleteDoc={handleDeleteDoc}
            onDocUpdated={loadDocuments}
            pendingDescribeIds={pendingDescribeIds}
            onDocNomUpdated={(docId, nom) =>
              setDocuments(prev => prev.map(d => d.id === docId ? { ...d, nom } : d))
            }
            onDocLotUpdated={(docId, lotId) =>
              setDocuments(prev => prev.map(d => d.id === docId ? { ...d, lot_id: lotId } : d))
            }
            onDocStatutUpdated={(docId, statut) =>
              setDocuments(prev => prev.map(d => {
                if (d.id !== docId) return d;
                return d.document_type === 'facture'
                  ? { ...d, facture_statut: statut as any }
                  : { ...d, devis_statut: statut as any };
              }))
            }
            onDocMontantPayeUpdated={(docId, montantPaye) =>
              setDocuments(prev => prev.map(d => d.id === docId ? { ...d, montant_paye: montantPaye } : d))
            }
          />
        );

      case 'journal':
        return (
          <JournalChantierSection
            chantierId={chantierId}
            token={token}
            onGoToAssistant={() => navigateTo('assistant')}
          />
        );

      case 'assistant': {
        // Layout 2-col : chat à gauche (flex-1), feed d'activité à droite (360px).
        // Le bandeau d'alertes du haut est supprimé — tout est centralisé dans le feed.
        // Mobile : stack vertical (chat full puis feed dessous).
        return (
          <div className="flex flex-col lg:flex-row h-full min-h-0">
            <div className="flex-1 min-h-0 min-w-0 lg:border-r lg:border-gray-100">
              <ChantierAssistantChat
                chantierId={chantierId ?? ''}
                token={token}
                size="full"
              />
            </div>
            <div className="w-full lg:w-[360px] shrink-0 h-[60vh] lg:h-full border-t lg:border-t-0 border-gray-100">
              <AgentActivityFeed
                chantierId={chantierId ?? ''}
                token={token}
                onOpenJournal={() => navigateTo('journal')}
              />
            </div>
          </div>
        );
      }

      case 'diy':
        return (
          <TravauxDIYSection
            documents={documents}
            onAddDoc={() => setUploadModal({ open: true })}
          />
        );

      case 'settings':
        return (
          <div className="max-w-xl mx-auto px-6 py-7 space-y-6">
            {/* Infos chantier */}
            <div>
              <h2 className="font-semibold text-gray-900 mb-3">Paramètres du chantier</h2>
              <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
                {[
                  { label: 'Nom du projet', value: result.nom },
                  { label: 'Budget observé', value: `${fmtK(displayMin)} – ${fmtK(displayMax)}` },
                  { label: 'Durée estimée', value: result.dureeEstimee ?? '—' },
                  { label: 'Nombre de lots', value: `${lots.length} lot${lots.length > 1 ? 's' : ''}` },
                  { label: 'Documents', value: `${documents.length}` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between px-5 py-4">
                    <span className="text-sm text-gray-500">{label}</span>
                    <span className="text-sm font-semibold text-gray-900">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Coordonnées personnelles */}
            <UserCoordonnees supabase={supabase} />

            <a href="/mon-chantier" className="flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-gray-600 py-3 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Retour à tous mes chantiers
            </a>
          </div>
        );

      case 'tresorerie':
        return (
          <div className="h-full flex flex-col">
            {chantierId && token ? (
              <TresoreriePanel
                chantierId={chantierId}
                token={token}
                budgetMax={displayMax}
                rangeMin={displayMin}
                rangeMax={displayMax}
                initialFinancing={initialFinancing}
                initialEnveloppePrevue={initialEnveloppePrevue}
              />
            ) : (
              <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
                Chantier non identifié — impossible de charger la trésorerie.
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  }

  const SECTION_TITLES: Record<Section, string> = {
    budget: showBudgetDetail ? 'Affinage du budget' : result.nom,
    tresorerie: 'Budget & Trésorerie',
    lots: 'Intervenants', contacts: 'Contacts', messagerie: 'Messagerie', analyse: 'Intervenants & Devis',
    planning: 'Planning', documents: 'Documents', journal: 'Journal de chantier', assistant: 'Assistant chantier',
    diy: 'Travaux réalisés par vous', settings: 'Paramètres',
  };

  // ── Écran modification du prompt (plein écran) ───────────────────────────
  if (showAmelioration && chantierId && token) {
    return (
      <ScreenEditPrompt
        result={result}
        chantierId={chantierId}
        token={token}
        onBack={() => setShowAmelioration(false)}
        onUpdate={(updated) => { setResult(updated); setShowAmelioration(false); }}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f7f8fc]">

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <Sidebar
        result={result}
        activeSection={activeSection}
        onSelect={navigateTo}
        rangeMin={displayMin}
        rangeMax={displayMax}
        badges={navBadges}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onAmeliorer={chantierId && token ? () => setShowAmelioration(true) : undefined}
      />

      {/* ── Contenu principal ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ── Header minimal : nom chantier + menu mobile ─────────────────── */}
        <header className="bg-white border-b border-gray-100 px-5 py-3 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(v => !v)}
              className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 shrink-0">
              <Menu className="h-4 w-4" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center text-lg shrink-0">
              {result.emoji ?? '🏗️'}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Mon chantier</p>
              <h1 className="font-bold text-gray-900 text-sm leading-tight truncate">{result.nom}</h1>
            </div>
          </div>
        </header>

        <main className={`flex-1 ${activeSection === 'tresorerie' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {renderContent()}
        </main>
      </div>

      {/* ── Upload modal ──────────────────────────────────────────────────── */}
      {uploadModal.open && chantierId && token && (
        <UploadDocumentModal
          chantierId={chantierId}
          token={token}
          lots={lots}
          defaultLotId={uploadModal.lotId}
          defaultType={uploadModal.defaultType}
          onClose={() => setUploadModal({ open: false })}
          onSuccess={(doc) => {
            setDocuments(prev => [doc, ...prev]);
            refreshInsights();
            // Refresh agent insights after upload (mismatch detection may have created one)
            setTimeout(() => agentInsights.refresh(), 2000);
            // Auto-analyse for devis: already triggered by UploadDocumentModal (line 167)
            // which sets doc.analyse_id before calling onSuccess. No need to call again.
            if (doc.document_type === 'devis' && doc.analyse_id) {
              toast.success('Analyse VMD en cours…', { id: `analyse-${doc.id}`, duration: 30_000 });
            }
            // 🧾 Auto-extraction montant pour les factures
            if (doc.document_type === 'facture' && doc.bucket_path) {
              toast.loading('Lecture de la facture…', { id: `invoice-${doc.id}` });
              fetch(`/api/chantier/${chantierId}/documents/${doc.id}/extract-invoice`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token ?? ''}` },
              })
                .then(r => r.json())
                .then(({ montant, nom }) => {
                  if (montant != null || nom) {
                    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, montant: montant ?? d.montant, nom: nom ?? d.nom, facture_statut: 'recue' as const } : d));
                    toast.success(`✨ Facture lue : ${montant ? montant.toLocaleString('fr-FR') + ' €' : 'montant non détecté'}`, { id: `invoice-${doc.id}`, duration: 5000 });
                  } else {
                    toast.dismiss(`invoice-${doc.id}`);
                  }
                })
                .catch(() => toast.dismiss(`invoice-${doc.id}`));
            }
            // 🤖 Auto-description IA pour photos et documents non-devis
            const isVisual = doc.document_type === 'photo' ||
              ['plan', 'autorisation', 'assurance', 'autre'].includes(doc.document_type);
            if (isVisual && doc.bucket_path) {
              setPendingDescribeIds(prev => [...prev, doc.id]);
              fetch(`/api/chantier/${chantierId}/documents/${doc.id}/describe`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token ?? ''}` },
              })
                .then(r => r.json())
                .then(({ nom }) => {
                  if (nom) {
                    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, nom } : d));
                    toast.success(`✨ Titre généré : "${nom}"`, { duration: 4000 });
                  }
                })
                .catch(() => {})
                .finally(() => setPendingDescribeIds(prev => prev.filter(id => id !== doc.id)));
            }
          }}
        />
      )}

      {/* ── Add intervenant modal ─────────────────────────────────────────── */}
      {showAddIntervenant && chantierId && token && (
        <AddIntervenantModal
          chantierId={chantierId}
          token={token}
          existingNoms={lots.map(l => l.nom)}
          existingJobTypes={lots.map(l => l.job_type).filter(Boolean) as string[]}
          projectName={result.nom ?? ''}
          onClose={() => setShowAddIntervenant(false)}
          onAdded={addLot}
        />
      )}

      {/* ── Chat Drawer ── */}
      <ChatDrawer
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        result={result}
        documents={documents}
        lots={lots}
        token={token}
      />
    </div>
  );
}
