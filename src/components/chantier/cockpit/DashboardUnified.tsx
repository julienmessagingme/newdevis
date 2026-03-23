/**
 * DashboardUnified — cockpit chantier avec sidebar premium.
 * Navigation claire, sections orientées décision, zéro complexité inutile.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Plus, X, Loader2, CheckCircle2, AlertCircle, CloudUpload, FileText,
  Sparkles, Trash2, ArrowLeft, ChevronRight, Wrench, Wallet, Layers,
  FileSearch, Calendar, FolderOpen, Bot, Settings, Menu, ExternalLink, Receipt, Pencil,
} from 'lucide-react';
import type {
  ChantierIAResult, DocumentChantier, DocumentType, LotChantier, StatutArtisan,
} from '@/types/chantier-ia';
import { useInsights, type InsightItem, type InsightsData } from './useInsights';
import BudgetTresorerie from './BudgetTresorerie';
import PlanningChantier from './PlanningChantier';
import ScreenEditPrompt from '@/components/chantier/nouveau/ScreenEditPrompt';

// ── Supabase ──────────────────────────────────────────────────────────────────

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)} k€`;
  return `${n} €`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

const TYPE_LABELS: Record<DocumentType, string> = {
  devis: 'Devis', facture: 'Facture', photo: 'Photo',
  plan: 'Plan', autorisation: 'Autorisation', assurance: 'Assurance', autre: 'Autre',
};

const IS: Record<InsightItem['type'], { bg: string; text: string; border: string; accent: string }> = {
  success: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-100', accent: 'border-l-emerald-400' },
  warning: { bg: 'bg-amber-50',   text: 'text-amber-800',   border: 'border-amber-100',   accent: 'border-l-amber-400'   },
  alert:   { bg: 'bg-red-50',     text: 'text-red-800',     border: 'border-red-100',     accent: 'border-l-red-400'     },
  info:    { bg: 'bg-blue-50',    text: 'text-blue-800',    border: 'border-blue-100',     accent: 'border-l-blue-400'    },
};

type Section = 'budget' | 'lots' | 'analyse' | 'planning' | 'documents' | 'assistant' | 'diy' | 'settings';
type UploadState = 'idle' | 'uploading' | 'analyzing' | 'success' | 'error';

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface NavBadge { text: string; style: string }

interface SidebarProps {
  result: ChantierIAResult;
  activeSection: Section;
  onSelect: (s: Section) => void;
  rangeMin: number;
  rangeMax: number;
  badges: Partial<Record<Section, NavBadge>>;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onAmeliorer?: () => void;
}

const NAV_ITEMS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'budget',    label: 'Budget & trésorerie', icon: Wallet      },
  { id: 'lots',      label: 'Intervenants',         icon: Layers      },
  { id: 'analyse',   label: 'Analyse des devis',   icon: FileSearch  },
  { id: 'planning',  label: 'Planning',             icon: Calendar    },
  { id: 'documents', label: 'Documents',            icon: FolderOpen  },
  { id: 'assistant', label: 'Assistant chantier',  icon: Bot         },
  { id: 'diy',       label: 'Travaux réalisés par vous', icon: Wrench },
];

function Sidebar({ result, activeSection, onSelect, rangeMin, rangeMax, badges, mobileOpen, onCloseMobile, onAmeliorer }: SidebarProps) {
  return (
    <>
      {/* Overlay mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/20 z-30 lg:hidden" onClick={onCloseMobile} />
      )}

      <aside className={`
        fixed top-0 left-0 h-full w-[240px] bg-white border-r border-gray-100 z-40 flex flex-col
        transition-transform duration-300 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0 lg:z-auto lg:flex-none
      `}>
        {/* Projet */}
        <div className="px-4 py-5 border-b border-gray-50">
          <a href="/mon-chantier"
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4 transition-colors">
            <ArrowLeft className="h-3 w-3" /> Mes chantiers
          </a>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-xl shrink-0">
              {result.emoji}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm text-gray-900 leading-tight truncate">{result.nom}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {rangeMin > 0 ? `${fmtK(rangeMin)} – ${fmtK(rangeMax)}` : 'Budget en cours d\u2019estimation'}
              </p>
            </div>
          </div>
          {onAmeliorer && (
            <button
              onClick={onAmeliorer}
              className="mt-3 w-full flex items-center gap-2 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-xl px-3 py-2 transition-all"
            >
              <Pencil className="h-3 w-3 shrink-0" />
              Revoir / modifier mon projet
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider px-2 mb-2">Navigation</p>
          {NAV_ITEMS.map(item => {
            const active = activeSection === item.id;
            const badge  = badges[item.id];
            return (
              <button key={item.id}
                onClick={() => { onSelect(item.id); onCloseMobile(); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium mb-0.5 transition-all text-left group ${
                  active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}>
                <item.icon className={`h-4 w-4 shrink-0 transition-colors ${active ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                <span className="flex-1 truncate">{item.label}</span>
                {badge && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${badge.style}`}>
                    {badge.text}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Paramètres (bas) */}
        <div className="px-3 pb-4 pt-3 border-t border-gray-50">
          <button
            onClick={() => { onSelect('settings'); onCloseMobile(); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeSection === 'settings' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}>
            <Settings className={`h-4 w-4 ${activeSection === 'settings' ? 'text-blue-600' : 'text-gray-400'}`} />
            Paramètres
          </button>
        </div>
      </aside>
    </>
  );
}

// ── Page header (inside main) ─────────────────────────────────────────────────

function PageHeader({ title, sub, action, onMenuToggle, onBack }: {
  title: string; sub?: string; action?: React.ReactNode; onMenuToggle: () => void; onBack?: () => void;
}) {
  return (
    <header className="bg-white border-b border-gray-100 px-6 py-4">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-blue-600 transition-colors mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Tableau de bord
        </button>
      )}
      <div className="flex items-center gap-3">
        <button onClick={onMenuToggle} className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-900">{title}</h1>
          {sub && <p className="text-sm text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

// ── Lot card ──────────────────────────────────────────────────────────────────

function LotCard({ lot, docs, insight, onAdd, onDetail }: {
  lot: LotChantier; docs: DocumentChantier[];
  insight?: InsightItem; onAdd: () => void; onDetail: () => void;
}) {
  const devisCount   = docs.filter(d => d.document_type === 'devis').length;
  const factureCount = docs.filter(d => d.document_type === 'facture').length;
  const hasRef       = (lot.budget_min_ht ?? 0) > 0 || (lot.budget_max_ht ?? 0) > 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col">
      <div className="p-5 flex-1 space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl shrink-0 leading-none">{lot.emoji ?? '🔧'}</span>
          <h3 className="font-bold text-gray-900 text-sm leading-tight truncate">{lot.nom}</h3>
        </div>
        {docs.length === 0 ? (
          <div className="space-y-2">
            <span className="inline-flex text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full">Aucun devis ajouté</span>
            {hasRef && (
              <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Prix observé</p>
                <p className="text-sm font-bold text-gray-700">{fmtK(lot.budget_min_ht ?? 0)} – {fmtK(lot.budget_max_ht ?? 0)}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {devisCount   > 0 && <span className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full"><FileText className="h-3 w-3" />{devisCount} devis</span>}
              {factureCount > 0 && <span className="flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full"><FileText className="h-3 w-3" />{factureCount} facture{factureCount > 1 ? 's' : ''}</span>}
            </div>
            {hasRef && <p className="text-xs text-gray-400">Réf. marché · {fmtK(lot.budget_min_ht ?? 0)} – {fmtK(lot.budget_max_ht ?? 0)}</p>}
          </div>
        )}
      </div>
      {/* Insight band */}
      {insight && (
        <div className={`px-4 py-2 border-t border-l-4 ${IS[insight.type].accent} ${IS[insight.type].border} ${IS[insight.type].bg} flex items-center gap-1.5`}>
          {insight.icon && <span className="text-[11px]">{insight.icon}</span>}
          <span className={`text-[11px] font-semibold ${IS[insight.type].text}`}>{insight.text}</span>
        </div>
      )}
      <div className="flex border-t border-gray-50">
        <button onClick={onDetail} className="flex-1 flex items-center justify-center gap-1 py-3 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors">Voir <ChevronRight className="h-3 w-3" /></button>
        <div className="w-px bg-gray-50" />
        <button onClick={onAdd} className="flex-1 flex items-center justify-center gap-1 py-3 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"><Plus className="h-3 w-3" /> Ajouter</button>
      </div>
    </div>
  );
}

// ── Lot Detail ────────────────────────────────────────────────────────────────

function LotDetail({ lot, docs, insight, onAddDoc, onDeleteDoc, onBack }: {
  lot: LotChantier; docs: DocumentChantier[];
  insight?: InsightItem; onAddDoc: () => void; onDeleteDoc: (id: string) => void; onBack: () => void;
}) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-7">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-5 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Retour aux intervenants
      </button>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-5 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none">{lot.emoji ?? '🔧'}</span>
            <div>
              <h2 className="font-bold text-gray-900">{lot.nom}</h2>
              {(lot.budget_min_ht || lot.budget_max_ht) && (
                <p className="text-sm text-gray-400 mt-0.5">Prix observé · {fmtK(lot.budget_min_ht ?? 0)} – {fmtK(lot.budget_max_ht ?? 0)}</p>
              )}
            </div>
          </div>
          <button onClick={onAddDoc} className="flex items-center gap-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl transition-colors">
            <Plus className="h-3.5 w-3.5" /> Ajouter
          </button>
        </div>
        {insight && (
          <div className={`px-5 py-3 border-b ${IS[insight.type].border} ${IS[insight.type].bg} flex items-center gap-2`}>
            {insight.icon && <span>{insight.icon}</span>}
            <span className={`text-sm font-semibold ${IS[insight.type].text}`}>{insight.text}</span>
          </div>
        )}
        {docs.length === 0 ? (
          <div className="py-14 text-center">
            <FileText className="h-8 w-8 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-4">Aucun document pour ce lot</p>
            <button onClick={onAddDoc} className="flex items-center gap-2 mx-auto text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-xl transition-colors">
              <CloudUpload className="h-4 w-4" /> Ajouter un devis
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {docs.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 px-5 py-4 group">
                <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.nom}</p>
                  <p className="text-xs text-gray-400">{TYPE_LABELS[doc.document_type]} · {fmtDate(doc.created_at)}</p>
                </div>
                {doc.signedUrl && (
                  <a href={doc.signedUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-blue-600 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity">
                    Ouvrir
                  </a>
                )}
                <button onClick={() => onDeleteDoc(doc.id)}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="p-5 border-t border-gray-50">
          <button onClick={onAddDoc} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all">
            <Plus className="h-4 w-4" /> Ajouter un document
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({ chantierId, token, lots, defaultLotId, onClose, onSuccess }: {
  chantierId: string; token: string; lots: LotChantier[];
  defaultLotId?: string | null; onClose: () => void;
  onSuccess: (doc: DocumentChantier) => void;
}) {
  const [tab, setTab]                   = useState<'file' | 'import'>('file');
  const [dragging, setDragging]         = useState(false);
  const [file, setFile]                 = useState<File | null>(null);
  const [docName, setDocName]           = useState('');
  const [docType, setDocType]           = useState<DocumentType>('devis');
  const [lotId, setLotId]               = useState(defaultLotId ?? '');
  const [uploadState, setUploadState]   = useState<UploadState>('idle');
  const [errorMsg, setErrorMsg]         = useState('');
  const [savingsAmount, setSavingsAmount] = useState(0);
  const [analyses, setAnalyses]         = useState<{
    id: string; created_at: string; titre: string;
    artisanNom: string | null; totalTtc: number | null; dateDevis: string | null;
  }[]>([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab !== 'import') return;
    setLoadingAnalyses(true);
    supabase.from('analyses').select('id, created_at, raw_text').eq('status', 'completed')
      .order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => {
        setAnalyses((data ?? []).map(a => {
          const artisanNom = a.raw_text?.entreprise?.nom ?? null;
          const totalTtc   = a.raw_text?.totaux?.ttc ?? null;
          const dateDevis  = a.raw_text?.dates?.date_devis ?? null;
          const typeChantier = a.raw_text?.context?.type_chantier ?? null;
          const titre = artisanNom
            ? artisanNom
            : typeChantier ?? `Analyse du ${fmtDate(a.created_at)}`;
          return { id: a.id, created_at: a.created_at, titre, artisanNom, totalTtc, dateDevis };
        }));
      }).finally(() => setLoadingAnalyses(false));
  }, [tab]);

  function handleFile(f: File) {
    setFile(f); setDocName(f.name.replace(/\.[^.]+$/, ''));
    const lower = f.name.toLowerCase();
    if (lower.includes('devis') || lower.includes('quote')) setDocType('devis');
    else if (lower.includes('facture') || lower.includes('invoice')) setDocType('facture');
    else if (/\.(jpg|jpeg|png|webp|heic)$/i.test(f.name)) setDocType('photo');
  }

  async function handleUpload() {
    if (!file || !docName.trim()) return;
    setUploadState('uploading'); setErrorMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('nom', docName.trim());
      fd.append('documentType', docType);
      if (lotId) fd.append('lotId', lotId);
      const res = await fetch(`/api/chantier/${chantierId}/documents`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error ?? 'Erreur upload'); setUploadState('error'); return; }
      const doc: DocumentChantier = data.document;
      if (docType === 'devis') {
        setUploadState('analyzing');
        try {
          const aRes = await fetch(`/api/chantier/${chantierId}/documents/${doc.id}/analyser`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          });
          if (aRes.ok) {
            const aData = await aRes.json().catch(() => ({}));
            setSavingsAmount(aData?.result?.economics?.savings ?? 0);
          } else { setSavingsAmount(0); }
        } catch { setSavingsAmount(0); }
      } else { setSavingsAmount(0); }
      setUploadState('success');
      onSuccess(doc);
    } catch { setErrorMsg('Erreur réseau.'); setUploadState('error'); }
  }

  async function handleImportAnalyse(analyseId: string, titre: string) {
    setUploadState('uploading');
    try {
      const fd = new FormData();
      fd.append('nom', titre); fd.append('documentType', 'devis');
      fd.append('source', 'verifier_mon_devis'); fd.append('analyseId', analyseId);
      if (lotId) fd.append('lotId', lotId);
      const res = await fetch(`/api/chantier/${chantierId}/documents`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error ?? 'Erreur'); setUploadState('error'); return; }
      setSavingsAmount(0); setUploadState('success'); onSuccess(data.document);
    } catch { setErrorMsg('Erreur réseau.'); setUploadState('error'); }
  }

  const isUploading = uploadState === 'uploading' || uploadState === 'analyzing';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={!isUploading ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Ajouter un document</h2>
          {!isUploading && (
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
              <X className="h-4 w-4 text-gray-500" />
            </button>
          )}
        </div>
        {uploadState === 'uploading' && (
          <div className="px-6 py-12 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
              <Loader2 className="h-7 w-7 text-blue-600 animate-spin" />
            </div>
            <p className="font-semibold text-gray-900">Téléversement en cours…</p>
            <p className="text-sm text-gray-400">Ne fermez pas cette fenêtre</p>
          </div>
        )}
        {uploadState === 'analyzing' && (
          <div className="px-6 py-12 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-violet-600 animate-pulse" />
            </div>
            <p className="font-semibold text-gray-900">Analyse IA en cours…</p>
            <p className="text-sm text-gray-400">Détection des surcoûts et économies</p>
          </div>
        )}
        {uploadState === 'success' && (
          <div className="px-6 py-8 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="font-bold text-gray-900 text-lg">
              {docType === 'devis' ? '✔ Devis analysé' : `${TYPE_LABELS[docType]} ajouté ✓`}
            </p>
            {savingsAmount > 0 && (
              <div className="w-full bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-4">
                <p className="text-3xl font-extrabold text-emerald-600">+{fmtK(savingsAmount)}</p>
                <p className="text-xs font-medium text-emerald-600 mt-1">détectés vs prix du marché 🎉</p>
              </div>
            )}
            <div className="flex flex-col gap-2 w-full">
              <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 text-sm transition-colors">Parfait</button>
              {docType === 'devis' && (
                <button onClick={() => { setFile(null); setDocName(''); setSavingsAmount(0); setUploadState('idle'); }}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 py-2">
                  Ajouter un autre devis pour comparer →
                </button>
              )}
            </div>
          </div>
        )}
        {uploadState === 'error' && (
          <div className="px-6 py-10 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <p className="font-semibold text-gray-900">Erreur</p>
            <p className="text-sm text-red-600">{errorMsg}</p>
            <button onClick={() => setUploadState('idle')} className="text-sm font-medium text-blue-600">Réessayer</button>
          </div>
        )}
        {uploadState === 'idle' && (
          <div className="px-6 py-5">
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
              {[{ id: 'file' as const, label: 'Importer un fichier' }, { id: 'import' as const, label: 'Depuis VerifierMonDevis' }].map(({ id, label }) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>
            {tab === 'file' && (
              <div className="space-y-4">
                <div
                  onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onClick={() => inputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${dragging ? 'border-blue-400 bg-blue-50' : file ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}>
                  <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                  {file ? (
                    <><CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" /><p className="font-semibold text-emerald-800 text-sm">{file.name}</p></>
                  ) : (
                    <><CloudUpload className="h-8 w-8 text-gray-300 mx-auto mb-2" /><p className="text-sm font-medium text-gray-700">Glissez votre fichier ici</p><p className="text-xs text-gray-400 mt-1">ou cliquez pour parcourir</p></>
                  )}
                </div>
                {file && (
                  <div className="space-y-3">
                    <input value={docName} onChange={e => setDocName(e.target.value)} placeholder="Nom du document"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
                    <div className="grid grid-cols-2 gap-3">
                      <select value={docType} onChange={e => setDocType(e.target.value as DocumentType)}
                        className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100">
                        {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <select value={lotId} onChange={e => setLotId(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100">
                        <option value="">— Aucun lot —</option>
                        {lots.filter(l => !l.id.startsWith('fallback-')).map(l => <option key={l.id} value={l.id}>{l.emoji ?? '🔧'} {l.nom}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                <button onClick={handleUpload} disabled={!file || !docName.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-30 text-white font-semibold rounded-xl py-3 text-sm transition-colors">
                  Importer
                </button>
              </div>
            )}
            {tab === 'import' && (
              <div className="space-y-3">
                <select value={lotId} onChange={e => setLotId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 mb-1">
                  <option value="">— Aucun lot —</option>
                  {lots.filter(l => !l.id.startsWith('fallback-')).map(l => <option key={l.id} value={l.id}>{l.emoji ?? '🔧'} {l.nom}</option>)}
                </select>
                {loadingAnalyses ? (
                  <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 text-gray-300 animate-spin" /></div>
                ) : analyses.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-gray-400 mb-2">Aucune analyse disponible</p>
                    <a href="/nouvelle-analyse" className="text-sm font-medium text-blue-600">Analyser un devis →</a>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 border border-gray-100 rounded-2xl overflow-hidden max-h-80 overflow-y-auto">
                    {analyses.map(a => (
                      <button key={a.id}
                        onClick={() => handleImportAnalyse(a.id, a.titre ?? fmtDate(a.created_at))}
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-blue-50 transition-colors text-left group">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                          <FileText className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {/* Nom artisan */}
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {a.artisanNom ?? '—'}
                          </p>
                          {/* Montant TTC + date */}
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {a.totalTtc != null && a.totalTtc > 0 && (
                              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full">
                                {fmtK(a.totalTtc)} TTC
                              </span>
                            )}
                            <span className="text-xs text-gray-400">
                              Devis du {a.dateDevis
                                ? new Date(a.dateDevis).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
                                : fmtDate(a.created_at)}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 shrink-0 group-hover:text-blue-400 transition-colors" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Placeholder "bientôt disponible" ─────────────────────────────────────────

function ComingSoon({ section, icon: Icon, description, cta }: {
  section: string; icon: React.ElementType;
  description: string; cta?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <div className="max-w-md mx-auto px-6 py-20 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-6">
        <Icon className="h-8 w-8 text-blue-400" />
      </div>
      <h2 className="font-bold text-gray-900 text-lg mb-2">{section}</h2>
      <p className="text-sm text-gray-400 leading-relaxed mb-7">{description}</p>
      {cta && (
        cta.href
          ? <a href={cta.href} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
              {cta.label} <ExternalLink className="h-4 w-4" />
            </a>
          : <button onClick={cta.onClick} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
              {cta.label}
            </button>
      )}
    </div>
  );
}

// ── Section Documents (all docs) ──────────────────────────────────────────────

function DocumentsView({ documents, lots, onAddDoc, onDeleteDoc }: {
  documents: DocumentChantier[]; lots: LotChantier[];
  onAddDoc: () => void; onDeleteDoc: (id: string) => void;
}) {
  const byType: Record<DocumentType, DocumentChantier[]> = {} as never;
  for (const doc of documents) (byType[doc.document_type] ??= []).push(doc);
  const typesWithDocs = Object.entries(byType).filter(([, docs]) => docs.length > 0);

  return (
    <div className="max-w-3xl mx-auto px-6 py-7">
      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen className="h-10 w-10 text-gray-200 mx-auto mb-4" />
          <p className="font-bold text-gray-900 mb-1">Aucun document</p>
          <p className="text-sm text-gray-400 mb-6">Importez vos devis, factures et photos de chantier</p>
          <button onClick={onAddDoc} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
            <Plus className="h-4 w-4" /> Ajouter un document
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {typesWithDocs.map(([type, docs]) => (
            <div key={type} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                <p className="font-semibold text-gray-900 text-sm">{TYPE_LABELS[type as DocumentType]} ({docs.length})</p>
              </div>
              <div className="divide-y divide-gray-50">
                {docs.map(doc => {
                  const lot = lots.find(l => l.id === doc.lot_id);
                  return (
                    <div key={doc.id} className="flex items-center gap-3 px-5 py-4 group">
                      <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{doc.nom}</p>
                        <p className="text-xs text-gray-400">
                          {fmtDate(doc.created_at)}
                          {lot && <span> · {lot.emoji} {lot.nom}</span>}
                        </p>
                      </div>
                      {doc.signedUrl && (
                        <a href={doc.signedUrl} target="_blank" rel="noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity">
                          Ouvrir
                        </a>
                      )}
                      <button onClick={() => onDeleteDoc(doc.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <button onClick={onAddDoc}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-2xl py-4 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all">
            <Plus className="h-4 w-4" /> Ajouter un document
          </button>
        </div>
      )}
    </div>
  );
}

// ── Section Analyse des devis ─────────────────────────────────────────────────

function DevisCard({ doc, lot, insight, onDelete }: {
  doc: DocumentChantier;
  lot?: LotChantier;
  insight?: InsightItem;
  onDelete: () => void;
}) {
  const isFromVerifier = doc.source === 'verifier_mon_devis';
  const isAnalysed     = !!doc.analyse_id || isFromVerifier;
  const s = insight ? IS[insight.type] : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="px-5 py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{doc.nom}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-gray-400">{fmtDate(doc.created_at)}</span>
            {lot && (
              <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                {lot.emoji ?? '🔧'} {lot.nom}
              </span>
            )}
            {isAnalysed ? (
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">✓ Analysé</span>
            ) : (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">Non analysé</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isFromVerifier && doc.analyse_id && (
            <a href={`/analyse/${doc.analyse_id}`}
              className="text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-colors">
              Voir l'analyse →
            </a>
          )}
          {!isAnalysed && (
            <a href="/nouvelle-analyse"
              className="text-xs font-medium text-gray-500 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-xl transition-colors">
              Analyser
            </a>
          )}
          <button onClick={onDelete}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {lot && ((lot.budget_min_ht ?? 0) > 0 || (lot.budget_max_ht ?? 0) > 0) && (
        <div className="px-5 pb-4">
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Prix marché observé</p>
              <p className="text-sm font-bold text-gray-700">{fmtK(lot.budget_min_ht ?? 0)} – {fmtK(lot.budget_max_ht ?? 0)}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
          </div>
        </div>
      )}
      {s && insight && (
        <div className={`px-5 py-3 border-t border-l-4 ${s.accent} ${s.border} ${s.bg} flex items-center gap-2`}>
          {insight.icon && <span className="text-sm shrink-0">{insight.icon}</span>}
          <p className={`text-xs font-semibold ${s.text}`}>{insight.text}</p>
        </div>
      )}
    </div>
  );
}

function AnalyseDevisSection({ documents, lots, insights, insightsLoading, onAddDoc }: {
  documents: DocumentChantier[];
  lots: LotChantier[];
  insights: InsightsData | null;
  insightsLoading: boolean;
  onAddDoc: () => void;
}) {
  const devis = documents.filter(d => d.document_type === 'devis');
  const analyses = devis.filter(d => !!d.analyse_id || d.source === 'verifier_mon_devis').length;

  return (
    <div className="max-w-3xl mx-auto px-6 py-7">
      {devis.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4 text-center">
            <p className="text-2xl font-extrabold text-gray-900">{devis.length}</p>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">Devis</p>
          </div>
          <div className="bg-emerald-50 rounded-2xl border border-emerald-100 px-4 py-4 text-center">
            <p className="text-2xl font-extrabold text-emerald-700">{analyses}</p>
            <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mt-0.5">Analysés</p>
          </div>
          <div className="bg-amber-50 rounded-2xl border border-amber-100 px-4 py-4 text-center">
            <p className="text-2xl font-extrabold text-amber-700">{devis.length - analyses}</p>
            <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mt-0.5">À analyser</p>
          </div>
        </div>
      )}
      {devis.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-6">
            <FileSearch className="h-8 w-8 text-blue-400" />
          </div>
          <h2 className="font-bold text-gray-900 text-lg mb-2">Aucun devis à analyser</h2>
          <p className="text-sm text-gray-400 leading-relaxed mb-7 max-w-sm">
            Importez vos devis pour les comparer aux prix du marché et détecter les surcoûts.
          </p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <a href="/nouvelle-analyse"
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
              <Sparkles className="h-4 w-4" /> Analyser un devis maintenant
            </a>
            <button onClick={onAddDoc}
              className="flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
              <Plus className="h-4 w-4" /> Importer un devis
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {devis.map(doc => {
            const lot = lots.find(l => l.id === doc.lot_id);
            const lotInsight = lot ? insights?.lots?.[lot.id] : undefined;
            return (
              <DevisCard key={doc.id} doc={doc} lot={lot} insight={lotInsight} onDelete={() => {}} />
            );
          })}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a href="/nouvelle-analyse"
              className="flex items-center justify-center gap-2 flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-3 text-sm transition-colors">
              <Sparkles className="h-4 w-4" /> Analyser un nouveau devis
            </a>
            <button onClick={onAddDoc}
              className="flex items-center justify-center gap-2 flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl px-5 py-3 text-sm transition-colors">
              <Plus className="h-4 w-4" /> Importer un devis
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section Travaux réalisés par vous ─────────────────────────────────────────

function TravauxDIYSection({ documents, onAddDoc }: {
  documents: DocumentChantier[];
  onAddDoc: () => void;
}) {
  const factures = documents.filter(d => d.document_type === 'facture');
  const photos   = documents.filter(d => d.document_type === 'photo');

  return (
    <div className="max-w-3xl mx-auto px-6 py-7">
      <p className="text-sm text-gray-400 mb-6 leading-relaxed">
        Ajoutez vos factures de matériaux et photos de réalisation pour estimer les économies réalisées en faisant vous-même certains travaux.
      </p>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4 text-center">
          <p className="text-2xl font-extrabold text-gray-900">{factures.length}</p>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">Factures</p>
          <p className="text-[10px] text-gray-400 mt-0.5">matériaux</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4 text-center">
          <p className="text-2xl font-extrabold text-gray-900">{photos.length}</p>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">Photos</p>
          <p className="text-[10px] text-gray-400 mt-0.5">réalisation</p>
        </div>
        <div className="bg-emerald-50 rounded-2xl border border-emerald-100 px-4 py-4 text-center">
          <p className="text-2xl font-extrabold text-emerald-700">—</p>
          <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mt-0.5">Économie</p>
          <p className="text-[10px] text-emerald-400 mt-0.5">estimée</p>
        </div>
      </div>
      {factures.length === 0 && photos.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-2xl p-10 flex flex-col items-center text-center">
          <Wrench className="h-8 w-8 text-gray-300 mb-3" />
          <p className="font-semibold text-gray-700 mb-1">Aucun travail DIY enregistré</p>
          <p className="text-xs text-gray-400 mb-5 max-w-xs leading-relaxed">
            Factures matériaux (peinture, carrelage, bois…) + photos → calcul automatique des économies réalisées.
          </p>
          <button onClick={onAddDoc}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
            <Plus className="h-4 w-4" /> Ajouter une facture matériaux
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4">
            <p className="text-xs font-semibold text-blue-700 mb-1">💡 Comment fonctionne le calcul</p>
            <p className="text-xs text-blue-600 leading-relaxed">
              Nous comparons le coût de vos matériaux aux prix TTC observés sur des devis d'artisans. La différence représente votre économie main d'œuvre.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            {[...factures, ...photos].map(doc => (
              <div key={doc.id} className="flex items-center gap-3 px-5 py-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${doc.document_type === 'photo' ? 'bg-violet-50' : 'bg-emerald-50'}`}>
                  {doc.document_type === 'photo'
                    ? <span className="text-sm">📸</span>
                    : <Receipt className="h-4 w-4 text-emerald-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.nom}</p>
                  <p className="text-xs text-gray-400">{fmtDate(doc.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
          <button onClick={onAddDoc}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-2xl py-4 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all">
            <Plus className="h-4 w-4" /> Ajouter une facture ou une photo
          </button>
        </div>
      )}
    </div>
  );
}

// ── Section Assistant chantier ────────────────────────────────────────────────

function AssistantChantierSection({ result, documents, lots, insights, insightsLoading, onAddDoc, onGoToLots, onGoToAnalyse, onGoToBudget }: {
  result: ChantierIAResult;
  documents: DocumentChantier[];
  lots: LotChantier[];
  insights: InsightsData | null;
  insightsLoading: boolean;
  onAddDoc: () => void;
  onGoToLots: () => void;
  onGoToAnalyse: () => void;
  onGoToBudget: () => void;
}) {
  const contextActions = useMemo(() => {
    const actions: Array<{
      type: 'alert' | 'warning' | 'info' | 'success';
      icon: string;
      text: string;
      sub?: string;
      cta: { label: string; onClick: () => void };
    }> = [];

    const devisCount   = documents.filter(d => d.document_type === 'devis').length;
    const factureCount = documents.filter(d => d.document_type === 'facture').length;
    const lotsNoDocs   = lots.filter(l => documents.every(d => d.lot_id !== l.id)).length;
    const hasLotBudget = lots.some(l => (l.budget_min_ht ?? 0) > 0);

    if (lotsNoDocs > 0 && lots.length > 0) {
      actions.push({
        type: 'alert', icon: '📋',
        text: `${lotsNoDocs} lot${lotsNoDocs > 1 ? 's' : ''} sans devis`,
        sub: 'Obtenez au minimum 3 devis par lot pour comparer les prix.',
        cta: { label: 'Voir les lots', onClick: onGoToLots },
      });
    }
    if (devisCount === 1) {
      actions.push({
        type: 'warning', icon: '⚠️',
        text: '1 seul devis — insuffisant pour comparer',
        sub: 'Un seul devis ne permet pas de négocier. Obtenez-en au moins 2 de plus.',
        cta: { label: 'Analyser un nouveau devis', onClick: onGoToAnalyse },
      });
    }
    if (devisCount === 0 && lots.length > 0) {
      actions.push({
        type: 'warning', icon: '📩',
        text: 'Aucun devis reçu — relancez vos artisans',
        sub: 'Ajoutez vos devis pour valider votre budget et comparer les prix.',
        cta: { label: 'Importer un devis', onClick: onAddDoc },
      });
    }
    if (insights?.global) {
      insights.global.filter(i => i.type === 'alert' || i.type === 'warning').slice(0, 2).forEach(insight => {
        actions.push({
          type: insight.type as 'alert' | 'warning', icon: insight.icon ?? '🔔',
          text: insight.text,
          cta: { label: 'Voir le budget', onClick: onGoToBudget },
        });
      });
    }
    if (devisCount > 0 && factureCount === 0) {
      actions.push({
        type: 'info', icon: '🧾',
        text: 'Aucune facture enregistrée',
        sub: 'Suivez vos paiements en ajoutant vos factures.',
        cta: { label: 'Ajouter une facture', onClick: onAddDoc },
      });
    }
    if (devisCount >= 2 && hasLotBudget && actions.length === 0) {
      actions.push({
        type: 'success', icon: '✅',
        text: 'Budget bien documenté',
        sub: 'Vous avez plusieurs devis. Comparez-les pour optimiser votre budget.',
        cta: { label: 'Analyser les devis', onClick: onGoToAnalyse },
      });
    }
    if (insights?.lots) {
      Object.values(insights.lots).filter(i => i.type === 'alert' || i.type === 'warning').slice(0, 2).forEach(insight => {
        actions.push({
          type: insight.type as 'alert' | 'warning', icon: insight.icon ?? '⚠️',
          text: insight.text,
          cta: { label: 'Voir les lots', onClick: onGoToLots },
        });
      });
    }
    return actions;
  }, [documents, lots, insights, onAddDoc, onGoToLots, onGoToAnalyse, onGoToBudget]);

  return (
    <div className="max-w-2xl mx-auto px-6 py-7">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
          <Bot className="h-5 w-5 text-violet-500" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900">Votre maître d'œuvre digital</h2>
          <p className="text-xs text-gray-400">Priorités et actions pour votre chantier</p>
        </div>
      </div>
      {insightsLoading && contextActions.length === 0 ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-white border border-gray-100 animate-pulse" />)}</div>
      ) : contextActions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-4" />
          <p className="font-bold text-gray-900 mb-2">Tout est sous contrôle 🎉</p>
          <p className="text-sm text-gray-400 leading-relaxed max-w-xs">Aucune action urgente. Continuez à alimenter votre chantier avec vos devis et factures.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contextActions.map((action, i) => {
            const s = IS[action.type];
            return (
              <div key={i} className={`rounded-2xl border border-l-4 ${s.accent} ${s.border} ${s.bg} overflow-hidden`}>
                <div className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="text-base leading-none shrink-0 mt-0.5">{action.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${s.text} leading-snug`}>{action.text}</p>
                      {action.sub && <p className={`text-xs ${s.text} opacity-70 mt-1 leading-relaxed`}>{action.sub}</p>}
                    </div>
                  </div>
                  <div className="mt-3">
                    <button onClick={action.cta.onClick}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                        action.type === 'success' ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : action.type === 'alert' ? 'bg-red-600 hover:bg-red-700 text-white'
                        : action.type === 'warning' ? 'bg-amber-500 hover:bg-amber-600 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}>
                      {action.cta.label} →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-6 bg-white rounded-2xl border border-gray-100 px-5 py-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Prochaine étape recommandée</p>
        <p className="text-sm font-medium text-gray-800 mb-3">
          {result.roadmap && result.roadmap.length > 0
            ? result.roadmap[0]?.titre ?? 'Démarrer la planification'
            : 'Obtenir vos premiers devis artisans'}
        </p>
        <div className="flex gap-2">
          <button onClick={onGoToLots} className="text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors">Voir les lots →</button>
          <button onClick={onGoToAnalyse} className="text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors">Analyser un devis →</button>
        </div>
      </div>
    </div>
  );
}

// ── Props & composant principal ───────────────────────────────────────────────

interface Props {
  result: ChantierIAResult;
  chantierId: string | null;
  token?: string | null;
  onLotStatutChange?: (lotId: string, statut: StatutArtisan) => void;
}

export default function DashboardUnified({ result: resultProp, chantierId, token }: Props) {
  const [result, setResult]               = useState(resultProp);
  const [showAmelioration, setShowAmelioration] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('budget');
  const [mobileOpen, setMobileOpen]       = useState(false);
  const [documents, setDocuments]         = useState<DocumentChantier[]>([]);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [uploadModal, setUploadModal]     = useState<{ open: boolean; lotId?: string }>({ open: false });
  const lots = result.lots ?? [];

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
  const [refinedRangeMin, setRefinedRangeMin] = useState<number | null>(null);
  const [refinedRangeMax, setRefinedRangeMax] = useState<number | null>(null);
  const displayMin = refinedRangeMin ?? baseRangeMin;
  const displayMax = refinedRangeMax ?? baseRangeMax;

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

  async function handleDeleteDoc(docId: string) {
    if (!chantierId || !token) return;
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents/${docId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch {}
  }

  // ── Index docs par lot ────────────────────────────────────────────────────
  const docsByLot = useMemo(() => {
    const idx: Record<string, DocumentChantier[]> = {};
    for (const doc of documents) (idx[doc.lot_id ?? '__none__'] ??= []).push(doc);
    return idx;
  }, [documents]);

  // ── Badges sidebar ────────────────────────────────────────────────────────
  const navBadges = useMemo<Partial<Record<Section, NavBadge>>>(() => {
    const lotsNoDocs = lots.filter(l => (docsByLot[l.id] ?? []).length === 0).length;
    const alerts     = insights?.global.filter(i => i.type === 'alert' || i.type === 'warning') ?? [];
    const devisCount = documents.filter(d => d.document_type === 'devis').length;
    return {
      budget:    alerts.length  > 0 ? { text: `${alerts.length} alerte${alerts.length > 1 ? 's' : ''}`, style: 'bg-red-100 text-red-600' } : undefined,
      lots:      lotsNoDocs     > 0 ? { text: `${lotsNoDocs} incomplet${lotsNoDocs > 1 ? 's' : ''}`, style: 'bg-amber-100 text-amber-700' } : undefined,
      analyse:   devisCount     > 0 ? { text: `${devisCount} devis`, style: 'bg-blue-100 text-blue-700' } : undefined,
      documents: documents.length > 0 ? { text: `${documents.length}`, style: 'bg-gray-100 text-gray-600' } : undefined,
    };
  }, [lots, docsByLot, insights, documents]);

  const selectedLot = lots.find(l => l.id === selectedLotId);
  const hasDiyOpportunity = lots.some(l => l.statut === 'a_trouver');

  // ── Navigation helpers ────────────────────────────────────────────────────
  function navigateTo(s: Section) {
    setActiveSection(s);
    setSelectedLotId(null);
  }

  // ── Rendu du contenu ──────────────────────────────────────────────────────
  function renderContent() {
    // Lots — vue détail lot
    if (activeSection === 'lots' && selectedLotId && selectedLot) {
      return (
        <LotDetail
          lot={selectedLot}
          docs={docsByLot[selectedLot.id] ?? []}
          insight={insights?.lots?.[selectedLot.id]}
          onAddDoc={() => setUploadModal({ open: true, lotId: selectedLot.id.startsWith('fallback-') ? undefined : selectedLot.id })}
          onDeleteDoc={handleDeleteDoc}
          onBack={() => setSelectedLotId(null)}
        />
      );
    }

    switch (activeSection) {
      case 'budget':
        return (
          <BudgetTresorerie
            result={result}
            documents={documents}
            insights={insights}
            insightsLoading={insightsLoading}
            baseRangeMin={baseRangeMin}
            baseRangeMax={baseRangeMax}
            onAddDoc={() => setUploadModal({ open: true })}
            onGoToAnalyse={() => navigateTo('analyse')}
            onGoToLots={() => navigateTo('lots')}
            onGoToLot={(lotId) => { setSelectedLotId(lotId); navigateTo('lots'); }}
            onRangeRefined={(min, max) => { setRefinedRangeMin(min); setRefinedRangeMax(max); }}
            onAmeliorer={() => setShowAmelioration(true)}
          />
        );

      case 'lots':
        return (
          <div className="max-w-5xl mx-auto px-6 py-7">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-gray-900">
                Intervenants nécessaires <span className="ml-1.5 text-xs font-normal text-gray-400">{lots.length} intervenant{lots.length > 1 ? 's' : ''}</span>
              </h2>
              <button onClick={() => setUploadModal({ open: true })}
                className="flex items-center gap-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl transition-colors">
                <Plus className="h-3.5 w-3.5" /> Ajouter un document
              </button>
            </div>
            {lots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <CloudUpload className="h-10 w-10 text-gray-200 mx-auto mb-4" />
                <p className="font-bold text-gray-900 mb-1">Aucun lot de travaux</p>
                <p className="text-sm text-gray-400 mb-6 max-w-xs leading-relaxed">Votre plan de chantier ne contient pas encore de lots. Créez un nouveau chantier avec l'IA.</p>
                <a href="/mon-chantier/nouveau" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
                  <Plus className="h-4 w-4" /> Nouveau chantier
                </a>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {lots.map(lot => (
                  <LotCard
                    key={lot.id} lot={lot}
                    docs={docsByLot[lot.id] ?? []}
                    insight={insights?.lots?.[lot.id]}
                    onAdd={() => setUploadModal({ open: true, lotId: lot.id.startsWith('fallback-') ? undefined : lot.id })}
                    onDetail={() => setSelectedLotId(lot.id)}
                  />
                ))}
              </div>
            )}
            {hasDiyOpportunity && (
              <div className="mt-8">
                <div className="flex items-center gap-2.5 mb-4">
                  <Wrench className="h-4 w-4 text-gray-400" />
                  <h2 className="font-semibold text-gray-700 text-sm">Travaux réalisés par vous-même</h2>
                </div>
                <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 mb-1">Estimez vos économies DIY</p>
                    <p className="text-xs text-gray-400 leading-relaxed">Factures matériaux + photos → calcul automatique des économies réalisées</p>
                  </div>
                  <button onClick={() => setUploadModal({ open: true })}
                    className="shrink-0 flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-xl px-4 py-2.5 transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Ajouter
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      case 'analyse':
        return (
          <AnalyseDevisSection
            documents={documents}
            lots={lots}
            insights={insights}
            insightsLoading={insightsLoading}
            onAddDoc={() => setUploadModal({ open: true })}
          />
        );

      case 'planning':
        return (
          <PlanningChantier
            result={result}
            chantierId={chantierId ?? null}
            token={token ?? null}
            initialTaches={result.taches ?? []}
          />
        );

      case 'documents':
        return (
          <DocumentsView documents={documents} lots={lots} onAddDoc={() => setUploadModal({ open: true })} onDeleteDoc={handleDeleteDoc} />
        );

      case 'assistant':
        return (
          <AssistantChantierSection
            result={result}
            documents={documents}
            lots={lots}
            insights={insights}
            insightsLoading={insightsLoading}
            onAddDoc={() => setUploadModal({ open: true })}
            onGoToLots={() => navigateTo('lots')}
            onGoToAnalyse={() => navigateTo('analyse')}
            onGoToBudget={() => navigateTo('budget')}
          />
        );

      case 'diy':
        return (
          <TravauxDIYSection
            documents={documents}
            onAddDoc={() => setUploadModal({ open: true })}
          />
        );

      case 'settings':
        return (
          <div className="max-w-xl mx-auto px-6 py-7">
            <h2 className="font-semibold text-gray-900 mb-5">Paramètres du chantier</h2>
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
            <div className="mt-5">
              <a href="/mon-chantier" className="flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-gray-600 py-3 transition-colors">
                <ArrowLeft className="h-4 w-4" /> Retour à tous mes chantiers
              </a>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  const SECTION_TITLES: Record<Section, string> = {
    budget: 'Budget & trésorerie', lots: 'Intervenants nécessaires', analyse: 'Analyse des devis',
    planning: 'Planning', documents: 'Documents', assistant: 'Assistant chantier',
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
        <PageHeader
          title={SECTION_TITLES[activeSection]}
          action={
            <button
              onClick={() => setUploadModal({ open: true })}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors shadow-sm shadow-blue-200">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Ajouter un document</span>
              <span className="sm:hidden">Ajouter</span>
            </button>
          }
          onMenuToggle={() => setMobileOpen(v => !v)}
          onBack={activeSection !== 'budget' ? () => navigateTo('budget') : undefined}
        />

        <main className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>

      {/* ── Upload modal ──────────────────────────────────────────────────── */}
      {uploadModal.open && chantierId && token && (
        <UploadModal
          chantierId={chantierId}
          token={token}
          lots={lots}
          defaultLotId={uploadModal.lotId}
          onClose={() => setUploadModal({ open: false })}
          onSuccess={(doc) => {
            setDocuments(prev => [doc, ...prev]);
            refreshInsights();
          }}
        />
      )}
    </div>
  );
}
