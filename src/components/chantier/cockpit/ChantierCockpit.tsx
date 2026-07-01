/**
 * ChantierCockpit — cockpit chantier avec sidebar premium.
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
import BudgetTresorerie, { type BreakdownItem } from './tresorerie/BudgetTresorerie';
import TresoreriePanel from './tresorerie/TresoreriePanel';
import PlanningChantier from './PlanningChantier';
import ContactsSection from './contacts/ContactsSection';
import ScreenEditPrompt from '@/components/chantier/nouveau/ScreenEditPrompt';
import MessagerieSection from './messagerie/MessagerieSection';
import { useConversations } from '@/hooks/useConversations';
import UploadDocumentModal from './documents/UploadDocumentModal';
import AddIntervenantModal from './contacts/AddIntervenantModal';
import AssistantWidget from './assistant/AssistantWidget';
import DocumentsView from './documents/DocumentsView';
import { fmtK } from '@/lib/chantier/dashboardHelpers';
import Sidebar, { type Section, type NavBadge } from './Sidebar';
import BottomNav from './BottomNav';
import LotDetail from './lots/LotDetail';
import DashboardHome, { type BudgetSnapshot, type BudgetFactureLite } from './DashboardHome';
import AnalyseDevisSection from './AnalyseDevisSection';
import TravauxDIYSection from './TravauxDIYSection';
import AssistantTriPane from './assistant/AssistantTriPane';
import JournalChantierSection from './assistant/JournalChantierSection';
import UserCoordonnees from './UserCoordonnees';
import OwnerChannelToggle from './OwnerChannelToggle';
import GmcSubscriptionCard from './GmcSubscriptionCard';
import GmcTrialBanner from '@/components/chantier/shared/GmcTrialBanner';
import InsightsBanner from '@/components/chantier/shared/InsightsBanner';
import { useAgentInsights } from '@/hooks/useAgentInsights';
import { useAnalysisScores } from '@/hooks/useAnalysisScores';
import '@/styles/cockpit-refonte.css';

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

export default function ChantierCockpit({ result: resultProp, chantierId, token, initialBudgetAffine, initialFinancing, initialEnveloppePrevue }: Props) {
  const [result, setResult]               = useState(resultProp);
  const [showAmelioration, setShowAmelioration] = useState(false);
  const [showBudgetDetail, setShowBudgetDetail]   = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('budget');
  const [mobileOpen, setMobileOpen]       = useState(false);
  const [isMulti, setIsMulti]             = useState(false);
  const [documents, setDocuments]         = useState<DocumentChantier[]>([]);
  const [pendingDescribeIds, setPendingDescribeIds] = useState<string[]>([]);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [uploadModal, setUploadModal]     = useState<{ open: boolean; lotId?: string; defaultType?: DocumentType }>({ open: false });
  const lots = result.lots ?? [];

  // Persist last visited chantier for header link
  useEffect(() => {
    if (chantierId) localStorage.setItem('lastChantierId', chantierId);
  }, [chantierId]);

  // Statut d'abonnement → débloque l'entrée "Multi-chantier" du picker (cosmétique :
  // le vrai gate est serveur sur /api/portfolio/summary).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch('/api/gmc/status', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (!cancelled && s) setIsMulti(!!s.isMulti); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  // Ouverture auto de l'éditeur de projet via ?edit=1 (lien "Modifier avec l'IA" du hub)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    let consumed = false;
    // ?edit=1 — éditeur de projet (lien "Modifier avec l'IA" du hub)
    if (params.get('edit') === '1') { setShowAmelioration(true); consumed = true; }
    // ?upload=1 — ouvre l'upload de documents (onboarding "j'ai déjà des devis")
    if (params.get('upload') === '1') { setUploadModal({ open: true }); consumed = true; }
    if (consumed) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  // Messagerie: unread count for sidebar badge
  const { totalUnread: msgUnread } = useConversations(chantierId);

  // ── Insights ──────────────────────────────────────────────────────────────
  const { insights, loading: insightsLoading, refresh: refreshInsights } = useInsights(
    chantierId, token, documents.length,
  );

  // ── Budget — source unique de vérité ──────────────────────────────────────
  const hasLotBudget   = lots.some(l => (l.budget_min_ht ?? 0) > 0 || (l.budget_max_ht ?? 0) > 0);
  const hasBudgetTotal = (result.budgetTotal ?? 0) > 0;
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
  const [contactsAutoOpen, setContactsAutoOpen] = useState(false);
  const displayMin = refinedRangeMin ?? baseRangeMin;
  const displayMax = refinedRangeMax ?? baseRangeMax;

  // ── Budget réel (synchronisé avec BudgetTab via custom event) ────────────
  // localStorage = couche optimiste locale ; fallback serveur (initialEnveloppePrevue
  // = chantiers.budget) pour rester cohérent cross-device — sinon le stepper de
  // démarrage "Budget défini" repasse à non-fait sur un appareil au localStorage vide.
  const [budgetReel, setBudgetReel] = useState<number | null>(() => {
    if (chantierId) {
      try {
        const s = localStorage.getItem(`budget_reel_${chantierId}`);
        if (s) { const n = parseFloat(s); if (!Number.isNaN(n) && n > 0) return n; }
      } catch { /* ignore */ }
    }
    return (initialEnveloppePrevue && initialEnveloppePrevue > 0) ? initialEnveloppePrevue : null;
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

  // ── Contacts (carnet) — signal "Saisir les artisans" du stepper de démarrage ──
  // Vide à la création (les lots IA ne comptent pas) ; > 0 dès qu'un vrai artisan
  // est ajouté (contact manuel) ou extrait d'un devis uploadé.
  const [contactsCount, setContactsCount] = useState(0);
  useEffect(() => {
    if (!chantierId || !token) return;
    let cancelled = false;
    fetch('/api/chantier/' + chantierId + '/contacts', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d) setContactsCount((d.contacts ?? []).length); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [chantierId, token, documents.length]);

  // ── Budget réconcilié (API) — source unique des compteurs "à régler" ──────
  // L'API budget déduit les paiements Échéancier : une facture 'recue' soldée
  // via l'échéancier a a_payer = 0. Évite l'incohérence accueil ↔ Trésorerie.
  const [budgetData, setBudgetData] = useState<BudgetSnapshot | null>(null);
  const loadBudget = useCallback(async () => {
    if (!chantierId || !token) return;
    try {
      const res = await fetch(`/api/chantier/${chantierId}/budget`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const d = await res.json();
      const factures: BudgetFactureLite[] = [
        ...((d.lots ?? []) as { factures?: BudgetFactureLite[] }[]).flatMap(l => l.factures ?? []),
        ...((d.sans_lot?.factures ?? []) as BudgetFactureLite[]),
      ];
      setBudgetData({ totaux: d.totaux, factures });
    } catch { /* non-bloquant */ }
  }, [chantierId, token]);
  useEffect(() => { loadBudget(); }, [loadBudget, documents.length]);
  // Re-sync quand le budget bouge ailleurs (paiement, dépense — event partagé)
  useEffect(() => {
    const h = () => loadBudget();
    window.addEventListener('chantierBudgetChanged', h);
    return () => window.removeEventListener('chantierBudgetChanged', h);
  }, [loadBudget]);

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

  // ── Actions à traiter par onglet (source de vérité badges sidebar + KPI home) ──
  // Chaque compteur pointe vers l'onglet où l'action se résout réellement, pour que
  // le badge sidebar et le contenu de la page soient cohérents.
  // Factures réellement à régler : reste à payer réconcilié > 0 (paiements
  // Échéancier déduits). Tant que le budget n'est pas chargé → 0.
  const factureActions = useMemo(
    () => (budgetData?.factures ?? []).filter(f => f.a_payer > 0).length,
    [budgetData],
  );
  const devisActions = useMemo(
    () => documents.filter(d => d.document_type === 'devis' && d.devis_statut === 'recu').length,
    [documents],
  );
  // urgentActions : KPI global "actions en attente" sur DashboardHome — total documentaire
  const urgentActions = factureActions + devisActions;

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
  // Règle : chaque badge pointe vers le contenu de l'onglet qu'il décore.
  //  - documents : nombre total de documents présents
  //  - tresorerie: factures à régler (facture_statut = 'recue' / 'payee_partiellement')
  //  - messagerie: messages non lus
  //  - assistant : alertes IA non lues + clarifications en attente (agent_insights)
  const navBadges = useMemo<Partial<Record<Section, NavBadge>>>(() => {
    return {
      documents: documents.length > 0
        ? { text: `${documents.length}`, style: 'bg-gray-100 text-gray-600' }
        : undefined,
      tresorerie: factureActions > 0
        ? { text: `⚠ ${factureActions}`, style: 'bg-amber-100 text-amber-700 border border-amber-200' }
        : undefined,
      messagerie: msgUnread > 0
        ? { text: `${msgUnread}`, style: 'bg-blue-100 text-blue-700' }
        : undefined,
      assistant: agentInsights.unreadCount > 0
        ? {
            text: `⚠ ${agentInsights.unreadCount} alerte${agentInsights.unreadCount > 1 ? 's' : ''}`,
            style: hasCriticalInsight
              ? 'bg-red-100 text-red-700 border border-red-200'
              : 'bg-amber-100 text-amber-700 border border-amber-200',
          }
        : { text: '✓ OK', style: 'bg-emerald-100 text-emerald-700' },
    };
  }, [documents.length, factureActions, msgUnread, agentInsights.unreadCount, hasCriticalInsight]);

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
      const res = await fetch(`/api/chantier/${chantierId}/lots/${lotId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      // Cohérence avec handleDeleteDoc : on ne met à jour l'UI que si le serveur a accepté.
      // Sinon (403 read-only/abonnement, 500…) on évite le faux succès "l'intervenant disparaît
      // puis revient au refresh".
      if (!res.ok) {
        toast.error(res.status === 403 ? 'Action indisponible (abonnement requis).' : "Impossible de supprimer l'intervenant.");
        return;
      }
      setResult(prev => ({ ...prev, lots: (prev.lots ?? []).filter(l => l.id !== lotId) }));
      // Le serveur fait SET NULL (FK) sur les documents/devis/contacts du lot : on reflète
      // localement (lot_id -> null) pour qu'ils apparaissent en "non affectés" et que le budget
      // reste coherent sans refetch. (Cote DB, lot_dependencies/subphases sont en CASCADE.)
      setDocuments(prev => prev.map(d => d.lot_id === lotId ? { ...d, lot_id: null } : d));
      toast.success('Intervenant supprimé');
    } catch {
      toast.error('Erreur réseau');
    }
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
            chantierNom={result.nom}
            chantierEmoji={result.emoji}
            budget={budgetData}
            lots={lots}
            documents={documents}
            docsByLot={docsByLot}
            displayMin={displayMin}
            displayMax={displayMax}
            budgetReel={budgetReel}
            contactsCount={contactsCount}
            refinedBreakdown={refinedBreakdown}
            onAffineBudget={() => { setShowBudgetDetail(true); setAffineBudgetModal(true); }}
            onAddDevisForLot={(lotId) => setUploadModal({ open: true, lotId, defaultType: 'devis' })}
            onAddDocForLot={(lotId) => setUploadModal({ open: true, lotId, defaultType: 'photo' })}
            onGoToLot={(lotId) => { setSelectedLotId(lotId); navigateTo('lots'); }}
            onGoToAnalyse={() => navigateTo('analyse')}
            onGoToPlanning={() => navigateTo('planning')}
            onAddDoc={() => setUploadModal({ open: true })}
            onGoToAssistant={() => navigateTo('assistant')}
            onGoToTresorerie={() => navigateTo('tresorerie')}
            onGoToDocuments={() => navigateTo('documents')}
            onAddIntervenant={() => setShowAddIntervenant(true)}
            onDeleteLot={deleteLot}
            onDeleteDoc={handleDeleteDoc}
            onGoToDiy={() => navigateTo('diy')}
            chantierId={chantierId!}
            token={token}
            onDocStatutUpdated={(docId, statut) =>
              setDocuments(prev => prev.map(d => {
                if (d.id !== docId) return d;
                return d.document_type === 'facture'
                  ? { ...d, facture_statut: statut as any }
                  : { ...d, devis_statut: statut as any };
              }))
            }
            onDocMoved={handleDocMoved}
            urgentActions={urgentActions}
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
          <ContactsSection
            chantierId={chantierId}
            token={token}
            autoOpenAdd={contactsAutoOpen}
            onAutoOpenConsumed={() => setContactsAutoOpen(false)}
            onLotCreated={(lot) => {
              // Un lot a été auto-créé depuis Contacts (artisan/architecte/MOE/BET sans lot).
              // On l'injecte dans le state parent pour qu'il apparaisse immédiatement
              // dans la home cockpit (panneau Intervenants) sans refetch complet.
              addLot({
                id: lot.id,
                nom: lot.nom,
                statut: 'a_trouver' as const,
                ordre: 999,
              });
            }}
          />
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
        // Layout 3-col desktop : Alertes (300px) | Chat (flex-1) | Décisions IA (300px)
        // Mobile : tabs en haut, un seul panel visible.
        return (
          <AssistantTriPane
            chantierId={chantierId ?? ''}
            token={token}
            insights={agentInsights.insights}
            unreadCount={agentInsights.unreadCount}
            insightsLoading={agentInsights.loading}
            markAsRead={agentInsights.markAsRead}
            markAllRead={agentInsights.markAllRead}
            refreshInsights={agentInsights.refresh}
            onOpenJournal={() => navigateTo('journal')}
          />
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

            {/* Mon abonnement GMC */}
            {token && <GmcSubscriptionCard token={token} />}

            {/* Notifications WhatsApp IA — canal owner privé */}
            {chantierId && token && (
              <OwnerChannelToggle chantierId={chantierId} token={token} />
            )}

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
    <div className="gmc-cockpit flex h-screen overflow-hidden">

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
        isMulti={isMulti}
      />

      {/* ── Contenu principal ──────────────────────────────────────────────── */}
      <div className="cr-main flex-1 flex flex-col overflow-hidden">
        {/* ── Header chantier — commun à TOUS les onglets (titre du chantier) ── */}
        <div className="cr-project-header shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger — tablette uniquement (768-1024px), ouvre la sidebar */}
            <button onClick={() => setMobileOpen(v => !v)}
              aria-label="Ouvrir le menu"
              className="hidden md:flex lg:hidden w-10 h-10 items-center justify-center rounded-lg text-gray-500 hover:bg-black/5 shrink-0 touch-manipulation">
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="cr-ph-title">
              <span className="emoji">{result.emoji ?? '🏠'}</span>
              {result.nom}
            </h1>
          </div>
        </div>

        {/* Bandeau essai / lecture seule (essai terminé = écritures bloquées) */}
        {token && (
          <div className="shrink-0 px-4 sm:px-6 pt-3">
            <GmcTrialBanner token={token} />
          </div>
        )}

        {/* Bandeau persistant alertes IA (desktop) — surface l'agent_insights non lu sur
            toutes les pages. Mobile : la bannière basse au-dessus du BottomNav s'en charge. */}
        {activeSection !== 'assistant' && agentInsights.unreadCount > 0 && (
          <div className="hidden lg:block shrink-0 px-4 sm:px-6 pt-3">
            <InsightsBanner
              unreadCount={agentInsights.unreadCount}
              hasCritical={hasCriticalInsight}
              onOpen={() => navigateTo('assistant')}
            />
          </div>
        )}

        {/* pb-32 : zone tampon en bas pour que le FAB Assistant (fixed bottom-24)
            n'intercepte plus les clics sur les éléments en bas de page (accordéons,
            filtres, dropdowns du Registre des paiements, etc.).
            Trésorerie + Assistant + Messagerie : layouts pleine hauteur, type appli,
            qui gèrent leur propre scroll interne → overflow-hidden, pas de pb-32.
            (overflow-y-auto sur <main> force aussi overflow-x en auto → si un
            sous-composant déborde, la page entière scrolle et la sidebar sort
            de l'écran. C'est ce qui cassait la Messagerie.) */}
        <main className={`flex-1 ${activeSection === 'tresorerie' || activeSection === 'assistant' || activeSection === 'messagerie' ? 'overflow-hidden' : 'overflow-y-auto pb-32'}`}>
          {renderContent()}
        </main>

        {/* ── Bandeau assistant mobile (au-dessus du BottomNav) ─────────────── */}
        {totalAlertCount > 0 && (
          <button
            onClick={() => navigateTo('assistant')}
            className="lg:hidden shrink-0 border-t border-gray-100 bg-amber-50 w-full flex items-center gap-2 px-4 py-2 text-left touch-manipulation active:bg-amber-100"
          >
            <span className="flex-1 text-[12px] font-semibold text-amber-700">
              💬 L'assistant a {totalAlertCount} recommandation{totalAlertCount > 1 ? 's' : ''} →
            </span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${hasCriticalInsight ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
              {totalAlertCount}
            </span>
          </button>
        )}
      </div>

      {/* ── Bottom Navigation mobile (M4 — refonte mobile cockpit GMC) ────── */}
      <BottomNav
        activeSection={activeSection}
        onSelect={navigateTo}
        badges={navBadges}
      />

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
            // L'endpoint /analyser tourne en fire-and-forget après le register
            // → analyse_id n'est pas encore set sur le doc renvoyé. On reload
            // le doc list à 4s + 12s pour récupérer analyse_id + score VMD + TTC
            // sans que l'user ait à actualiser la page.
            if (doc.document_type === 'devis' && !doc.analyse_id) {
              setTimeout(() => loadDocuments(), 4000);
              setTimeout(() => loadDocuments(), 12000);
            }
            // Devis non rattaché → toast pour rediriger l'user vers Documents (sinon invisible sur l'Accueil).
            if (doc.document_type === 'devis' && !doc.lot_id && lots.filter(l => !l.id.startsWith('fallback-')).length > 0) {
              toast('Devis non rattaché à un intervenant', {
                description: 'Rends-toi dans Documents pour l\'attribuer.',
                action: { label: 'Documents', onClick: () => navigateTo('documents') },
                duration: 8000,
              });
            }
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
          onContactAdded={() => {
            // Refetch contacts pour mettre à jour contactsCount (stepper "Saisir les artisans")
            // + refresh de la liste dans l'onglet Contacts au prochain affichage.
            fetch('/api/chantier/' + chantierId + '/contacts', { headers: { Authorization: 'Bearer ' + token } })
              .then(r => (r.ok ? r.json() : null))
              .then(d => { if (d) setContactsCount((d.contacts ?? []).length); })
              .catch(() => {});
          }}
        />
      )}

      {/* ── Assistant Widget — FAB + bulle (caché sur l'onglet Assistant) ─ */}
      <AssistantWidget
        chantierId={chantierId ?? ''}
        token={token}
        hidden={activeSection === 'assistant' || !chantierId}
        onOpenFull={() => navigateTo('assistant')}
      />
    </div>
  );
}
