/**
 * DashboardUnified — cockpit chantier avec sidebar premium.
 * Navigation claire, sections orientées décision, zéro complexité inutile.
 */
import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { createClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import {
  Plus, X, Loader2, CheckCircle2, AlertCircle, CloudUpload, FileText,
  Sparkles, Trash2, ArrowLeft, ChevronRight, Wrench, Wallet, Layers,
  FileSearch, Calendar, FolderOpen, Bot, Settings, Menu, ExternalLink,
  Receipt, Pencil, SlidersHorizontal, Users, MessageCircle, ArrowRight,
} from 'lucide-react';
import type {
  ChantierIAResult, DocumentChantier, DocumentType, LotChantier, StatutArtisan,
} from '@/types/chantier-ia';
import { useInsights, type InsightItem, type InsightsData } from './useInsights';
import BudgetTresorerie, { type BreakdownItem } from './BudgetTresorerie';
import TresoreriePanel from './TresoreriePanel';
import PlanningChantier from './PlanningChantier';
import ContactsSection from './ContactsSection';
import ScreenEditPrompt from '@/components/chantier/nouveau/ScreenEditPrompt';
import { ExpertAvatar } from '@/components/chantier/MATERIAL_IMAGES';
import { useChantierAssistant } from '@/hooks/useChantierAssistant';

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

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li style="margin-left:1rem;list-style:disc">$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

const SUGGESTED_QUESTIONS = [
  'Quelles démarches administratives sont nécessaires ?',
  'Quels travaux dois-je réaliser en premier ?',
  'Y a-t-il des économies possibles sur mon budget ?',
  'Suis-je éligible à des aides ou subventions (éco-PTZ, CEE, MaPrimeRénov…) ?',
  'Quel type de contrat demander à mes artisans ?',
  'Comment éviter les mauvaises surprises sur ce chantier ?',
];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
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

type Section = 'budget' | 'lots' | 'contacts' | 'analyse' | 'planning' | 'documents' | 'assistant' | 'diy' | 'settings' | 'tresorerie';
type UploadState = 'idle' | 'uploading' | 'analyzing' | 'success' | 'error';

// ── Chat Drawer ────────────────────────────────────────────────────────────────

function ChatDrawer({ isOpen, onClose, result, documents, lots, token }: {
  isOpen: boolean;
  onClose: () => void;
  result: ChantierIAResult;
  documents: DocumentChantier[];
  lots: LotChantier[];
  token: string | null | undefined;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLInputElement>(null);

  // Greeting on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `Bonjour\u00a0! Je suis votre ma\u00eetre d\u2019\u0153uvre pour le projet **${result.nom}**.\n\nComment puis-je vous aider\u00a0? Voici quelques questions fr\u00e9quentes, ou posez directement la v\u00f4tre ci-dessous.`,
      }]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput('');
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    const next: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setSending(true);
    try {
      const res = await fetch('/api/chantier/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: trimmed,
          history,
          context: {
            nom: result.nom,
            description: result.description,
            typeProjet: result.typeProjet,
            budgetTotal: result.budgetTotal,
            dureeEstimeeMois: result.dureeEstimeeMois,
            lignesBudget: result.lignesBudget?.map(l => ({ label: l.label, montant: l.montant })),
            lots: lots.map(l => ({ nom: l.nom, statut: l.statut, budget_min_ht: l.budget_min_ht, budget_avg_ht: l.budget_avg_ht, budget_max_ht: l.budget_max_ht })),
            formalites: result.formalites?.map(f => ({ nom: f.nom, detail: f.detail, obligatoire: f.obligatoire })),
            aides: result.aides?.map(a => ({ nom: a.nom, detail: a.detail, montant: a.montant, eligible: a.eligible })),
            roadmap: result.roadmap?.map(e => ({ nom: e.nom ?? '', detail: (e as any).detail ?? '', mois: (e as any).mois ?? '', isCurrent: (e as any).isCurrent ?? false })),
            prochaineAction: result.prochaineAction,
          },
          documents: documents.map(d => ({ name: d.nom, type: d.document_type })),
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply ?? 'Désolé, je n\u2019ai pas pu répondre.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Erreur de connexion. Veuillez réessayer.' }]);
    } finally {
      setSending(false);
    }
  }

  const showSuggestions = messages.filter(m => m.role === 'user').length === 0 && !sending;

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />}
      <div className={`fixed top-0 right-0 h-full w-full max-w-[420px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <ExpertAvatar size={40} showBadge />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm leading-tight">Maître d'œuvre</p>
            <p className="text-[11px] text-emerald-500 font-semibold">● En ligne</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              {msg.role === 'assistant' && (
                <div className="shrink-0 mt-0.5"><ExpertAvatar size={28} /></div>
              )}
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed break-words ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : 'bg-gray-50 border border-gray-100 text-gray-800 rounded-tl-sm'
              }`}>
                {msg.role === 'assistant'
                  ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  : msg.content
                }
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {sending && (
            <div className="flex gap-2.5">
              <div className="shrink-0 mt-0.5"><ExpertAvatar size={28} /></div>
              <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3.5 flex items-center gap-1">
                {[0, 150, 300].map(delay => (
                  <div key={delay} className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                ))}
              </div>
            </div>
          )}

          {/* Suggested questions */}
          {showSuggestions && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">Questions fréquentes</p>
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => send(q)}
                  className="w-full text-left px-4 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-blue-200 hover:bg-blue-50 text-sm text-gray-700 hover:text-blue-700 transition-all shadow-sm"
                >
                  {q} →
                </button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input ── */}
        <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Posez votre question…"
              disabled={sending}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 disabled:opacity-50"
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || sending}
              className="w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl transition-colors shrink-0"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

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
  { id: 'budget',     label: 'Vue d\'ensemble',     icon: Layers      },
  { id: 'tresorerie', label: 'Budget & Trésorerie', icon: Wallet      },
  { id: 'contacts',   label: 'Contacts',            icon: Users       },
  { id: 'analyse',    label: 'Analyse des devis',   icon: FileSearch  },
  { id: 'planning',   label: 'Planning',             icon: Calendar    },
  { id: 'documents',  label: 'Documents',            icon: FolderOpen  },
  { id: 'assistant',  label: 'Assistant chantier',  icon: Bot         },
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
        {/* Projet — logo seul, pas de doublon nom/budget */}
        <div className="px-4 py-4 border-b border-gray-50">
          <a href="/mon-chantier"
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-3 transition-colors">
            <ArrowLeft className="h-3 w-3" /> Mes chantiers
          </a>
          <button
            onClick={() => { onSelect('budget'); onCloseMobile(); }}
            className="flex items-center gap-2.5 w-full text-left hover:opacity-80 transition-opacity"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-lg shrink-0">
              {result.emoji}
            </div>
            <span className="text-xs text-gray-400 truncate">Vue d'ensemble</span>
          </button>
          {onAmeliorer && (
            <button
              onClick={onAmeliorer}
              className="mt-2.5 w-full flex items-center gap-2 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-xl px-3 py-2 transition-all"
            >
              <Pencil className="h-3 w-3 shrink-0" />
              Modifier le projet
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

// ── Budget Home Header (header premium section principale) ────────────────────

function BudgetHomeHeader({ onMenuToggle, onAddDoc }: {
  onMenuToggle: () => void;
  onAddDoc: () => void;
}) {
  return (
    <header className="bg-white border-b border-gray-100 px-5 py-4">
      <div className="flex items-center gap-3">
        {/* Bouton menu mobile */}
        <button onClick={onMenuToggle} className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 shrink-0">
          <Menu className="h-4 w-4" />
        </button>

        {/* CTA centré */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <button
            onClick={onAddDoc}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl px-5 py-2.5 transition-colors shadow-sm shadow-blue-200"
          >
            <Plus className="h-4 w-4" />
            Ajouter un document
          </button>
          <p className="text-[11px] text-gray-400">devis · facture · photo · plan · ou importer depuis votre espace</p>
        </div>
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

// ── Statuts devis ─────────────────────────────────────────────────────────────

import type { DevisStatut } from '@/types/chantier-ia';

const DEVIS_STATUT_OPTIONS: { value: DevisStatut; label: string }[] = [
  { value: 'en_cours',        label: 'En cours' },
  { value: 'a_relancer',      label: 'À relancer' },
  { value: 'valide',          label: '✓ Validé' },
  { value: 'attente_facture', label: 'En attente facture' },
];

const DEVIS_STATUT_STYLE: Record<DevisStatut, string> = {
  en_cours:        'bg-blue-50 border-blue-200 text-blue-700',
  a_relancer:      'bg-orange-50 border-orange-200 text-orange-700',
  valide:          'bg-emerald-50 border-emerald-200 text-emerald-700',
  attente_facture: 'bg-violet-50 border-violet-200 text-violet-700',
};

// ── Lot Detail ────────────────────────────────────────────────────────────────

function LotDetail({ lot, docs, onAddDoc, onDeleteDoc, onBack, chantierId, token }: {
  lot: LotChantier;
  docs: DocumentChantier[];
  onAddDoc: () => void;
  onDeleteDoc: (id: string) => void;
  onBack: () => void;
  chantierId: string | undefined;
  token: string | null | undefined;
}) {
  // ── Séparation par type ──────────────────────────────────────────────────
  const devisDocs = docs.filter(d => d.document_type === 'devis' || d.document_type === 'facture');
  const photoDocs = docs.filter(d => d.document_type === 'photo');

  // ── Statuts locaux (optimistic UI, persisté via PATCH) ───────────────────
  const [statutMap, setStatutMap] = useState<Record<string, DevisStatut>>(() => {
    const m: Record<string, DevisStatut> = {};
    devisDocs.forEach(d => { if (d.devis_statut) m[d.id] = d.devis_statut; });
    return m;
  });

  // Sync si docs changent (ex : reload)
  useEffect(() => {
    setStatutMap(prev => {
      const m = { ...prev };
      devisDocs.forEach(d => { if (d.devis_statut && !m[d.id]) m[d.id] = d.devis_statut; });
      return m;
    });
  }, [docs]);

  async function updateStatut(docId: string, statut: DevisStatut) {
    setStatutMap(prev => ({ ...prev, [docId]: statut }));
    if (!chantierId || !token) return;
    try {
      await fetch(`/api/chantier/${chantierId}/documents/${docId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ devisStatut: statut }),
      });
    } catch { /* silencieux */ }
  }

  // ── Jauge budget (devis validés vs fourchette estimée) ───────────────────
  const hasRange = (lot.budget_min_ht ?? 0) > 0 || (lot.budget_max_ht ?? 0) > 0;
  const budgetMax = (lot.budget_max_ht ?? lot.budget_avg_ht ?? 0) * 1.2; // HT → TTC approx

  // Montant validé = sum des devis en statut 'valide'
  // Pour l'instant on ne stocke pas le montant TTC dans le doc → on ne peut calculer que le nb validés
  const validatedCount = devisDocs.filter(d => (statutMap[d.id] ?? d.devis_statut ?? 'en_cours') === 'valide').length;
  const totalCount     = devisDocs.length;

  // ── Score analyse ─────────────────────────────────────────────────────────
  // Récupéré depuis analyse_id si présent (score stocké dans analyses.score)
  const [scoreMap, setScoreMap] = useState<Record<string, number | null>>({});
  useEffect(() => {
    const withAnalyse = devisDocs.filter(d => d.analyse_id);
    if (!withAnalyse.length) return;
    const ids = withAnalyse.map(d => d.analyse_id!);
    supabase.from('analyses').select('id, score').in('id', ids).then(({ data }) => {
      if (!data) return;
      const m: Record<string, number | null> = {};
      data.forEach(a => { m[a.id] = a.score != null ? Number(a.score) : null; });
      // Relier analyse_id → doc.id
      withAnalyse.forEach(d => { if (d.analyse_id && m[d.analyse_id] !== undefined) m[d.id] = m[d.analyse_id]; });
      setScoreMap(m);
    });
  }, [docs]);

  function ScoreBadge({ score }: { score: number | null | undefined }) {
    if (score == null) return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">— Pas analysé</span>;
    const cls = score >= 70 ? 'bg-emerald-50 text-emerald-700' : score >= 45 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600';
    const dot = score >= 70 ? 'bg-emerald-500' : score >= 45 ? 'bg-amber-500' : 'bg-red-500';
    const lbl = score >= 70 ? 'Bon' : score >= 45 ? 'Moyen' : 'Risqué';
    return (
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${cls}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {lbl} — {score}/100
      </span>
    );
  }

  return (
    <div className="px-5 py-6 space-y-5 max-w-5xl mx-auto">

      {/* ── Back + header ── */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-2xl leading-none">{lot.emoji ?? '🔧'}</span>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-gray-900 text-lg leading-tight">{lot.nom}</h2>
          {hasRange && (
            <p className="text-sm text-blue-700 font-semibold mt-0.5 tabular-nums">
              Fourchette estimée : {fmtK(lot.budget_min_ht ?? 0)} – {fmtK(lot.budget_max_ht ?? 0)} HT
            </p>
          )}
        </div>
        <button onClick={onAddDoc}
          className="shrink-0 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl px-4 py-2.5 transition-colors shadow-sm shadow-blue-200">
          <Plus className="h-4 w-4" /> Ajouter un devis
        </button>
      </div>

      {/* ── Jauge budget ── */}
      {hasRange && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Budget engagé — devis validés</p>
            <span className={`text-sm font-extrabold tabular-nums ${validatedCount === 0 ? 'text-gray-400' : 'text-emerald-600'}`}>
              {validatedCount} devis validé{validatedCount > 1 ? 's' : ''} / {totalCount} reçu{totalCount > 1 ? 's' : ''}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-blue-50 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-700"
              style={{ width: totalCount > 0 ? `${Math.min(100, (validatedCount / Math.max(totalCount, 1)) * 100)}%` : '2%' }}
            />
          </div>
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{validatedCount} validé{validatedCount > 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <span className="w-2 h-2 rounded-full bg-gray-200 inline-block" />{totalCount - validatedCount} en attente
            </span>
          </div>
        </div>
      )}

      {/* ── Tableau devis / factures ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-700">Devis & Factures</span>
            <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{devisDocs.length}</span>
          </div>
        </div>

        {devisDocs.length === 0 ? (
          <div className="py-14 flex flex-col items-center text-center">
            <FileText className="h-8 w-8 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-4">Aucun devis ajouté pour ce lot</p>
            <button onClick={onAddDoc} className="flex items-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-colors">
              <Plus className="h-4 w-4" /> Ajouter un devis
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-[22%]">Artisan / Société</th>
                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-[14%]">Type</th>
                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-[18%]">Analyse VMD</th>
                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-[20%]">Statut</th>
                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-[14%]">Date</th>
                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-[8%]">Doc</th>
                  <th className="w-[4%]" />
                </tr>
              </thead>
              <tbody>
                {devisDocs.map(doc => {
                  const statut = statutMap[doc.id] ?? doc.devis_statut ?? 'en_cours';
                  const score  = scoreMap[doc.id];
                  return (
                    <tr key={doc.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors group">
                      {/* Artisan */}
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-bold text-gray-900 truncate max-w-[160px]">{doc.nom}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{TYPE_LABELS[doc.document_type]}</p>
                      </td>
                      {/* Type */}
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ${doc.document_type === 'facture' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>
                          {doc.document_type === 'facture' ? '🧾 Facture' : '📄 Devis'}
                        </span>
                      </td>
                      {/* Score VMD */}
                      <td className="px-4 py-3.5">
                        {doc.analyse_id ? (
                          <ScoreBadge score={score} />
                        ) : (
                          <span className="text-[11px] text-gray-300 italic">Non analysé</span>
                        )}
                      </td>
                      {/* Statut */}
                      <td className="px-4 py-3.5">
                        <select
                          value={statut}
                          onChange={e => updateStatut(doc.id, e.target.value as DevisStatut)}
                          className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border appearance-none cursor-pointer outline-none transition-colors ${DEVIS_STATUT_STYLE[statut]}`}
                        >
                          {DEVIS_STATUT_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                      {/* Date */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-gray-400 whitespace-nowrap">{fmtDate(doc.created_at)}</span>
                      </td>
                      {/* Doc */}
                      <td className="px-4 py-3.5">
                        {doc.signedUrl ? (
                          <a href={doc.signedUrl} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                            <FileText className="h-3 w-3" /> Ouvrir
                          </a>
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </td>
                      {/* Supprimer */}
                      <td className="px-2 py-3.5">
                        <button onClick={() => onDeleteDoc(doc.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-200 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer tableau */}
        {devisDocs.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-400">{devisDocs.length} document{devisDocs.length > 1 ? 's' : ''} · {validatedCount} validé{validatedCount > 1 ? 's' : ''}</span>
            <button onClick={onAddDoc}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
              <Plus className="h-3 w-3" /> Ajouter
            </button>
          </div>
        )}
      </div>

      {/* ── Photos du lot ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-700">📷 Photos</span>
            <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{photoDocs.length}</span>
          </div>
          <button onClick={onAddDoc}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors">
            <Plus className="h-3 w-3" /> Ajouter
          </button>
        </div>

        {photoDocs.length === 0 ? (
          <div className="py-10 flex flex-col items-center text-center">
            <p className="text-3xl mb-2">📷</p>
            <p className="text-sm text-gray-400 mb-1">Aucune photo pour ce lot</p>
            <p className="text-xs text-gray-300">Avant travaux · Pendant · Après réception</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {photoDocs.map(doc => (
              <div key={doc.id} className="relative group aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-100">
                {doc.signedUrl ? (
                  <a href={doc.signedUrl} target="_blank" rel="noreferrer">
                    <img src={doc.signedUrl} alt={doc.nom} className="w-full h-full object-cover hover:scale-105 transition-transform duration-200" />
                  </a>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">📷</div>
                )}
                <button onClick={() => onDeleteDoc(doc.id)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">
                  <X className="h-3 w-3" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] text-white truncate">{doc.nom}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Autres documents (plans, autorisations…) ── */}
      {docs.filter(d => !['devis', 'facture', 'photo'].includes(d.document_type)).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-50">
            <span className="text-sm font-bold text-gray-700">Autres documents</span>
          </div>
          <div className="divide-y divide-gray-50">
            {docs.filter(d => !['devis', 'facture', 'photo'].includes(d.document_type)).map(doc => (
              <div key={doc.id} className="flex items-center gap-3 px-5 py-3.5 group">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                  <FileText className="h-3.5 w-3.5 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.nom}</p>
                  <p className="text-[11px] text-gray-400">{TYPE_LABELS[doc.document_type]} · {fmtDate(doc.created_at)}</p>
                </div>
                {doc.signedUrl && (
                  <a href={doc.signedUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Ouvrir</a>
                )}
                <button onClick={() => onDeleteDoc(doc.id)}
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-200 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Statut artisan ─────────────────────────────────────────────────────────────

const STATUT_STYLE: Record<string, { label: string; pill: string }> = {
  a_trouver:  { label: 'À trouver',  pill: 'text-gray-500 bg-gray-100'       },
  a_contacter:{ label: 'À contacter',pill: 'text-blue-700 bg-blue-100'       },
  ok:         { label: 'Validé ✓',   pill: 'text-emerald-700 bg-emerald-100' },
};

// ── Statut sémantique intervenant ──────────────────────────────────────────────

type LotStatusLevel = 'blocked' | 'insufficient' | 'ok';

function getLotStatusLevel(lot: LotChantier, docs: DocumentChantier[]): {
  level: LotStatusLevel;
  label: string;
  msg: string;
  dotColor: string;
  textColor: string;
  bgColor: string;
} {
  const statut   = lot.statut ?? 'a_trouver';
  const devisCnt = docs.filter(d => d.document_type === 'devis').length;

  if (['ok', 'termine', 'en_cours'].includes(statut)) {
    const msg = statut === 'en_cours' ? 'Travaux en cours' : 'Intervenant validé ✓';
    return { level: 'ok', label: 'OK', msg, dotColor: 'bg-emerald-400', textColor: 'text-emerald-700', bgColor: 'bg-emerald-50' };
  }
  if (statut === 'contrat_signe') {
    return { level: 'ok', label: 'Signé', msg: 'Contrat signé — en attente de démarrage', dotColor: 'bg-emerald-400', textColor: 'text-emerald-700', bgColor: 'bg-emerald-50' };
  }
  if (devisCnt >= 2) {
    return { level: 'ok', label: 'À comparer', msg: `${devisCnt} devis reçus — comparez les prix`, dotColor: 'bg-blue-400', textColor: 'text-blue-700', bgColor: 'bg-blue-50' };
  }
  if (devisCnt === 1) {
    return { level: 'insufficient', label: 'Insuffisant', msg: 'Obtenez au moins 1 devis supplémentaire', dotColor: 'bg-amber-400', textColor: 'text-amber-700', bgColor: 'bg-amber-50' };
  }
  if (statut === 'a_contacter') {
    return { level: 'insufficient', label: 'En attente', msg: 'Devis demandé, pas encore reçu', dotColor: 'bg-amber-400', textColor: 'text-amber-700', bgColor: 'bg-amber-50' };
  }
  return { level: 'blocked', label: 'Bloqué', msg: 'Aucun artisan contacté — action requise', dotColor: 'bg-red-400', textColor: 'text-red-700', bgColor: 'bg-red-50' };
}

// ── Lot Intervenant Card (home) ────────────────────────────────────────────────

function LotIntervenantCard({ lot, docs, onAddDevis, onAddDocument, onDetail, onDelete }: {
  lot: LotChantier;
  docs: DocumentChantier[];
  onAddDevis: () => void;
  onAddDocument: () => void;
  onDetail: () => void;
  onDelete: () => void;
}) {
  const devisCnt  = docs.filter(d => d.document_type === 'devis').length;
  const hasRef    = (lot.budget_min_ht ?? 0) > 0 || (lot.budget_max_ht ?? 0) > 0;
  const status    = getLotStatusLevel(lot, docs);
  const statut    = lot.statut ?? 'a_trouver';

  // Jauge
  const progress =
    statut === 'termine' || statut === 'ok' ? 100 :
    statut === 'en_cours'                   ? 85  :
    statut === 'contrat_signe'              ? 65  :
    devisCnt >= 2                           ? 50  :
    devisCnt === 1                          ? 35  :
    statut === 'a_contacter'                ? 15  : 5;

  const gaugeColor =
    progress >= 65  ? 'bg-emerald-400' :
    progress >= 35  ? 'bg-amber-400'   :
                      'bg-red-400';

  const gaugeLabel =
    progress >= 65  ? { text: '✓ OK',           cls: 'text-emerald-600' } :
    progress >= 35  ? { text: '⚠ À surveiller', cls: 'text-amber-600'   } :
                      { text: '✗ Action requise',cls: 'text-red-600'     };

  return (
    <div className="relative group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col">

      {/* Delete button */}
      <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="w-6 h-6 flex items-center justify-center rounded-lg bg-white shadow-sm border border-gray-100 text-gray-300 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all"
          title="Supprimer cet intervenant"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* ── Zone cliquable principale ──────────────────── */}
      <button onClick={onDetail} className="p-5 pb-3 flex items-start gap-3 text-left hover:bg-gray-50/60 transition-colors group">
        <span className="text-2xl leading-none pt-0.5 shrink-0">{lot.emoji ?? '🔧'}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 leading-tight truncate text-base">{lot.nom}</p>
          {/* Statut clair */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className={`w-2 h-2 rounded-full shrink-0 ${status.dotColor}`} />
            <span className={`text-[11px] font-bold ${status.textColor}`}>{status.label}</span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-gray-300 shrink-0 mt-1 group-hover:text-blue-400 transition-colors" />
      </button>

      {/* ── Message explicatif ─────────────────────────── */}
      <div className={`mx-5 mb-3 px-3 py-2 rounded-xl border ${status.bgColor} border-transparent`}>
        <p className={`text-xs leading-snug ${status.textColor} font-medium`}>{status.msg}</p>
      </div>

      {/* ── Budget fourchette ───────────────────────────── */}
      {hasRef ? (
        <div className="px-5 pb-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Budget observé</p>
          <p className="text-lg font-extrabold text-gray-900 tabular-nums">
            {fmtK(lot.budget_min_ht ?? 0)} – {fmtK(lot.budget_max_ht ?? 0)}
          </p>
        </div>
      ) : (
        <div className="px-5 pb-3">
          <p className="text-xs text-gray-300 italic">Budget à estimer</p>
        </div>
      )}

      {/* ── Compteur devis ──────────────────────────────── */}
      <div className="px-5 pb-3 flex items-center gap-2 flex-wrap min-h-[24px]">
        {devisCnt > 0 ? (
          <span className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
            <FileText className="h-3 w-3" /> {devisCnt} devis reçu{devisCnt > 1 ? 's' : ''}
          </span>
        ) : (
          <span className="text-xs text-gray-400 italic">Aucun devis reçu</span>
        )}
      </div>

      {/* ── Jauge + interprétation ──────────────────────── */}
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Avancement</span>
          <span className={`text-[10px] font-bold ${gaugeLabel.cls}`}>{gaugeLabel.text}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${gaugeColor}`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* ── 2 actions ───────────────────────────────────── */}
      <div className="border-t border-gray-50 grid grid-cols-2 divide-x divide-gray-50 mt-auto">
        <button onClick={onDetail}
          className="flex flex-col items-center gap-1 py-3.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 transition-colors">
          <ChevronRight className="h-3.5 w-3.5" />
          Voir détails
        </button>
        <button onClick={onAddDocument}
          className="flex flex-col items-center gap-1 py-3.5 text-[11px] font-semibold text-violet-600 hover:bg-violet-50 transition-colors">
          <Receipt className="h-3.5 w-3.5" />
          Photo/Facture
        </button>
      </div>
    </div>
  );
}

// ── État global du chantier ────────────────────────────────────────────────────

function EtatChantierBlock({ lots, documents }: { lots: LotChantier[]; documents: DocumentChantier[] }) {
  if (lots.length === 0) return null;

  const total     = lots.length;
  const validated = lots.filter(l => ['ok', 'termine', 'en_cours', 'contrat_signe'].includes(l.statut ?? '')).length;
  const withDevis = lots.filter(l => documents.some(d => d.lot_id === l.id && d.document_type === 'devis') && !['ok', 'termine', 'en_cours', 'contrat_signe'].includes(l.statut ?? '')).length;
  const blocked   = total - validated - withDevis;
  const pct       = Math.round((validated / total) * 100);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">État du chantier</p>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {/* Validés */}
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-3 text-center">
          <p className="text-xl font-extrabold text-emerald-700">{validated}</p>
          <p className="text-[10px] font-semibold text-emerald-600 mt-0.5">Validés</p>
        </div>
        {/* Avec devis */}
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-3 text-center">
          <p className="text-xl font-extrabold text-amber-700">{withDevis}</p>
          <p className="text-[10px] font-semibold text-amber-600 mt-0.5">Avec devis</p>
        </div>
        {/* Bloqués */}
        <div className={`rounded-xl px-3 py-3 text-center ${blocked > 0 ? 'bg-red-50 border border-red-100' : 'bg-gray-50 border border-gray-100'}`}>
          <p className={`text-xl font-extrabold ${blocked > 0 ? 'text-red-600' : 'text-gray-400'}`}>{blocked}</p>
          <p className={`text-[10px] font-semibold mt-0.5 ${blocked > 0 ? 'text-red-500' : 'text-gray-400'}`}>Manquants</p>
        </div>
      </div>
      {/* Barre de progression globale */}
      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden mb-1">
        <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">Progression globale</span>
        <span className="text-[10px] font-bold text-emerald-600">{pct}% validé</span>
      </div>
    </div>
  );
}

// ── Calcul prochaine étape ─────────────────────────────────────────────────────

function nextStepFromContext(lots: LotChantier[], docs: DocumentChantier[]): {
  icon: string;
  title: string;
  desc: string;
  cta: string;
  action: 'new_chantier' | 'add_devis' | 'go_analyse' | 'go_planning';
  lotId?: string;
} {
  if (lots.length === 0) {
    return {
      icon: '🏗', title: 'Créez votre plan de chantier',
      desc: "L'IA génère la liste des intervenants et une estimation de budget.",
      cta: "Créer avec l'IA", action: 'new_chantier',
    };
  }
  const lotsNoDev = lots.filter(l => !docs.some(d => d.lot_id === l.id && d.document_type === 'devis'));
  if (lotsNoDev.length > 0) {
    const l = lotsNoDev[0];
    return {
      icon: l.emoji ?? '📋',
      title: `Demandez un devis — ${l.nom}`,
      desc: `${lotsNoDev.length} intervenant${lotsNoDev.length > 1 ? 's' : ''} sans devis reçu.`,
      cta: 'Ajouter un devis', action: 'add_devis', lotId: l.id,
    };
  }
  const unanalyzed = docs.filter(d => d.document_type === 'devis' && !d.analyse_id && d.source !== 'verifier_mon_devis');
  if (unanalyzed.length > 0) {
    return {
      icon: '🔍', title: 'Analysez vos devis reçus',
      desc: `${unanalyzed.length} devis non encore analysé${unanalyzed.length > 1 ? 's' : ''}.`,
      cta: 'Analyser sur VerifierMonDevis', action: 'go_analyse',
    };
  }
  return {
    icon: '📅', title: 'Planifiez votre chantier',
    desc: 'Budget documenté — suivez les étapes et les paiements.',
    cta: 'Voir le planning', action: 'go_planning',
  };
}

// ── Assistant actif (remplace "Prochaine étape") ──────────────────────────────

function AssistantActiveBlock({ lots, documents, onAddDevisForLot, onGoToAnalyse, onGoToPlanning, onAddDoc, onGoToAssistant }: {
  lots: LotChantier[];
  documents: DocumentChantier[];
  onAddDevisForLot: (lotId: string) => void;
  onGoToAnalyse: () => void;
  onGoToPlanning: () => void;
  onAddDoc: () => void;
  onGoToAssistant: () => void;
}) {
  const step = nextStepFromContext(lots, documents);

  function handleCta() {
    switch (step.action) {
      case 'new_chantier': window.location.href = '/mon-chantier/nouveau'; break;
      case 'add_devis':    step.lotId ? onAddDevisForLot(step.lotId) : onAddDoc(); break;
      case 'go_analyse':   onGoToAnalyse(); break;
      case 'go_planning':  onGoToPlanning(); break;
    }
  }

  // Urgency level for border color
  const urgentBorder = step.action === 'new_chantier' || step.action === 'add_devis'
    ? 'border-l-4 border-l-blue-400'
    : 'border-l-4 border-l-emerald-400';

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${urgentBorder}`}>
      <div className="flex items-start gap-4 px-5 py-5">
        {/* Avatar actif */}
        <div className="shrink-0">
          <ExpertAvatar size={52} showBadge />
        </div>
        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Votre Maître d'œuvre</p>
          <p className="font-bold text-gray-900 leading-snug mb-1">{step.title}</p>
          <p className="text-sm text-gray-500 leading-relaxed mb-3">{step.desc}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleCta}
              className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl px-4 py-2 transition-colors shadow-sm shadow-blue-200"
            >
              {step.cta} →
            </button>
            <button
              onClick={onGoToAssistant}
              className="flex items-center gap-2 text-sm font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl px-4 py-2 transition-all shadow-sm"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Poser une question →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Intervenants preset ───────────────────────────────────────────────────────

const PRESET_INTERVENANTS = [
  { nom: 'Terrassement',             emoji: '🏗', jobType: 'terrassement' },
  { nom: 'Maçonnerie',               emoji: '🧱', jobType: 'maconnerie' },
  { nom: 'Charpente / Couverture',   emoji: '🏚', jobType: 'couverture' },
  { nom: 'Menuiserie extérieure',    emoji: '🪟', jobType: 'menuiserie_ext' },
  { nom: 'Menuiserie intérieure',    emoji: '🚪', jobType: 'menuiserie_int' },
  { nom: 'Électricité',              emoji: '⚡', jobType: 'electricite' },
  { nom: 'Plomberie',                emoji: '🚿', jobType: 'plomberie' },
  { nom: 'Chauffage / Climatisation',emoji: '🔥', jobType: 'chauffage' },
  { nom: 'Isolation',                emoji: '🧤', jobType: 'isolation' },
  { nom: 'Peinture',                 emoji: '🎨', jobType: 'peinture' },
  { nom: 'Carrelage / Faïence',      emoji: '🪟', jobType: 'carrelage' },
  { nom: 'Revêtements de sol',       emoji: '🪵', jobType: 'revetement_sol' },
  { nom: 'Agencement / Placards',    emoji: '🛋', jobType: 'agencement' },
  { nom: 'Étanchéité',               emoji: '🛡', jobType: 'etancheite' },
  { nom: 'Démolition',               emoji: '⛏', jobType: 'demolition' },
  { nom: 'Serrurerie / Métallerie',  emoji: '🔧', jobType: 'serrurerie' },
  { nom: 'Espaces verts',            emoji: '🌿', jobType: 'espaces_verts' },
];

function AddIntervenantModal({ chantierId, token, existingNoms, onClose, onAdded }: {
  chantierId: string;
  token: string;
  existingNoms: string[];
  onClose: () => void;
  onAdded: (lot: LotChantier) => void;
}) {
  const [customNom, setCustomNom] = useState('');
  const [adding, setAdding] = useState<string | null>(null);

  async function add(nom: string, emoji: string, jobType: string) {
    if (adding) return;
    setAdding(nom);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/lots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nom, emoji, jobType }),
      });
      const data = await res.json();
      if (res.ok && data.lot) {
        // Normalise le lot reçu pour qu'il soit compatible avec LotChantier
        const lot: LotChantier = {
          id: data.lot.id,
          nom: data.lot.nom,
          statut: 'a_trouver' as const,
          ordre: 999,
          emoji: data.lot.emoji ?? undefined,
          job_type: data.lot.job_type ?? undefined,
        };
        onAdded(lot);
        toast.success(`${emoji} ${nom} ajouté`);
        onClose();
      } else {
        const msg = data.error ?? `Erreur ${res.status}`;
        toast.error(`Impossible d'ajouter : ${msg}`);
      }
    } catch {
      toast.error('Erreur réseau, réessayez.');
    } finally {
      setAdding(null);
    }
  }

  const available = PRESET_INTERVENANTS.filter(p => !existingNoms.includes(p.nom));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Ajouter un intervenant</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-3">
          {/* Custom nom */}
          <div className="flex gap-2">
            <input
              value={customNom}
              onChange={e => setCustomNom(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && customNom.trim()) add(customNom.trim(), '🔧', 'autre'); }}
              placeholder="Ou tapez un nom personnalisé…"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            />
            <button
              onClick={() => { if (customNom.trim()) add(customNom.trim(), '🔧', 'autre'); }}
              disabled={!customNom.trim() || !!adding}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {adding === customNom.trim() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </div>
          {/* Preset list */}
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pt-2">Types courants</p>
          <div className="grid grid-cols-1 gap-1.5">
            {available.map(p => (
              <button
                key={p.jobType}
                onClick={() => add(p.nom, p.emoji, p.jobType)}
                disabled={!!adding}
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl hover:bg-blue-50 transition-colors text-left disabled:opacity-50 group"
              >
                <span className="text-lg w-7 text-center shrink-0">{p.emoji}</span>
                <span className="text-sm font-medium text-gray-800 group-hover:text-blue-700 transition-colors flex-1">{p.nom}</span>
                {adding === p.nom
                  ? <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />
                  : <Plus className="h-3.5 w-3.5 text-gray-300 group-hover:text-blue-500 shrink-0 transition-colors" />
                }
              </button>
            ))}
            {available.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Tous les types courants ont été ajoutés.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard Home ─────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, accent = 'gray', action }: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'gray' | 'emerald' | 'blue' | 'red' | 'amber';
  action?: ReactNode;
}) {
  const colors: Record<string, { bg: string; value: string; sub: string }> = {
    gray:    { bg: 'bg-gray-50',    value: 'text-gray-900',    sub: 'text-gray-400'   },
    emerald: { bg: 'bg-emerald-50', value: 'text-emerald-700', sub: 'text-emerald-500' },
    blue:    { bg: 'bg-blue-50',    value: 'text-blue-700',    sub: 'text-blue-400'   },
    red:     { bg: 'bg-red-50',     value: 'text-red-600',     sub: 'text-red-400'    },
    amber:   { bg: 'bg-amber-50',   value: 'text-amber-700',   sub: 'text-amber-500'  },
  };
  const c = colors[accent];
  return (
    <div className={`${c.bg} rounded-2xl px-4 py-4 flex items-start gap-3`}>
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

// ── Carte DIY — toujours présente dans la grille intervenants ─────────────────

function DiyCard({ onAddDoc }: { onAddDoc: () => void }) {
  return (
    <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-5 flex flex-col gap-3 hover:border-gray-300 hover:shadow-sm transition-all">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gray-50 flex items-center justify-center text-xl shrink-0">
          🔧
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-gray-800 truncate">Travaux par vous-même</p>
          <p className="text-[11px] text-gray-400">DIY · Auto-construction</p>
        </div>
      </div>
      {/* Description */}
      <p className="text-xs text-gray-500 leading-relaxed">
        Ajoutez vos factures de matériaux et photos pour calculer automatiquement vos économies réalisées.
      </p>
      {/* CTA */}
      <button
        onClick={onAddDoc}
        className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-xl px-4 py-2.5 transition-colors mt-auto"
      >
        <Plus className="h-3.5 w-3.5" /> Ajouter factures / photos
      </button>
    </div>
  );
}

function DashboardHome({ lots, documents, docsByLot, displayMin, displayMax, refinedBreakdown, onAffineBudget,
  onAddDevisForLot, onAddDocForLot, onGoToLot, onGoToAnalyse, onGoToPlanning, onAddDoc,
  onGoToAssistant, onAddIntervenant, onDeleteLot,
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
}) {
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
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Intervenants · {total}
          </p>
          <button
            onClick={onAddIntervenant}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-xl transition-colors"
          >
            <Plus className="h-3 w-3" /> Ajouter
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
        ) : (
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
              />
            ))}
            {/* Carte DIY — toujours présente, travaux réalisés par le client */}
            <DiyCard onAddDoc={onAddDoc} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({ chantierId, token, lots, defaultLotId, defaultType, onClose, onSuccess }: {
  chantierId: string; token: string; lots: LotChantier[];
  defaultLotId?: string | null;
  defaultType?: DocumentType;
  onClose: () => void;
  onSuccess: (doc: DocumentChantier) => void;
}) {
  const [tab, setTab]                   = useState<'file' | 'import'>('file');
  const [dragging, setDragging]         = useState(false);
  const [file, setFile]                 = useState<File | null>(null);
  const [docName, setDocName]           = useState('');
  const [docType, setDocType]           = useState<DocumentType>(defaultType ?? 'devis');
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
          let parsed: Record<string, any> = {};
          try {
            parsed = typeof a.raw_text === 'string' ? JSON.parse(a.raw_text) : (a.raw_text ?? {});
          } catch {}
          // raw_text structure : { extracted: { entreprise, totaux, dates, context, ... }, verified, scoring, ... }
          const extracted   = parsed?.extracted ?? parsed; // rétrocompat si structure plate
          const artisanNom  = extracted?.entreprise?.nom ?? null;
          const totalTtc    = extracted?.totaux?.ttc ?? null;
          const dateDevis   = extracted?.dates?.date_devis ?? null;
          const typeChantier = extracted?.context?.type_chantier ?? null;
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
      // Lire le body comme texte d'abord pour éviter un crash JSON si le serveur renvoie du HTML
      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(rawText); } catch { /* non-JSON : garder data vide */ }
      if (!res.ok) { setErrorMsg((data.error as string) ?? `Erreur ${res.status}`); setUploadState('error'); return; }
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
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur réseau.');
      setUploadState('error');
    }
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
      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(rawText); } catch { /* non-JSON */ }
      if (!res.ok) { setErrorMsg((data.error as string) ?? `Erreur ${res.status}`); setUploadState('error'); return; }
      setSavingsAmount(0); setUploadState('success'); onSuccess(data.document as DocumentChantier);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur réseau.');
      setUploadState('error');
    }
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

function DocumentsView({ documents, lots: lotsProp, chantierId, token, onAddDoc, onDeleteDoc, onDocUpdated }: {
  documents: DocumentChantier[]; lots: LotChantier[];
  chantierId: string; token: string;
  onAddDoc: () => void; onDeleteDoc: (id: string) => void; onDocUpdated: () => void;
}) {
  const byType: Record<DocumentType, DocumentChantier[]> = {} as never;
  for (const doc of documents) (byType[doc.document_type] ??= []).push(doc);
  const typesWithDocs = Object.entries(byType).filter(([, docs]) => docs.length > 0);

  // Lots réels fetchés depuis la DB (garantit la cohérence avec la validation PATCH)
  const [dbLots, setDbLots] = useState<LotChantier[]>([]);
  useEffect(() => {
    if (!chantierId || !token) return;
    fetch(`/api/chantier/${chantierId}/lots`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.lots) setDbLots(d.lots); })
      .catch(() => {});
  }, [chantierId, token]);

  // Fallback sur les lots de la prop si l'API n'a pas encore répondu
  const realLots = dbLots.length > 0
    ? dbLots
    : lotsProp.filter(l => !l.id.startsWith('fallback-'));

  // Optimistic update : map docId → lotId pour affichage immédiat
  const [lotOverrides, setLotOverrides] = useState<Record<string, string | null>>({});

  async function handleChangeLot(docId: string, lotId: string | null) {
    // Mise à jour visuelle immédiate
    setLotOverrides(prev => ({ ...prev, [docId]: lotId }));
    const res = await fetch(`/api/chantier/${chantierId}/documents/${docId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotId }),
    });
    if (res.ok) {
      onDocUpdated();
    } else {
      // Rollback si erreur
      setLotOverrides(prev => ({ ...prev, [docId]: undefined as unknown as null }));
    }
  }

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
                  const effectiveLotId = lotOverrides[doc.id] !== undefined ? lotOverrides[doc.id] : doc.lot_id;
                  const lot = realLots.find(l => l.id === effectiveLotId);
                  return (
                    <div key={doc.id} className="flex items-center gap-3 px-5 py-4 group">
                      <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{doc.nom}</p>
                        <p className="text-xs text-gray-400">{fmtDate(doc.created_at)}</p>
                      </div>
                      {/* Sélecteur intervenant — lots réels uniquement */}
                      {(doc.document_type === 'devis' || doc.document_type === 'facture') && realLots.length > 0 && (
                        <select
                          value={effectiveLotId ?? ''}
                          onChange={e => handleChangeLot(doc.id, e.target.value || null)}
                          className={`text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 max-w-[160px] truncate ${
                            lot ? 'border-purple-200 text-purple-700 font-medium' : 'border-gray-200 text-gray-400'
                          }`}
                        >
                          <option value="">Aucun intervenant</option>
                          {realLots.map(l => <option key={l.id} value={l.id}>{l.emoji} {l.nom}</option>)}
                        </select>
                      )}
                      {doc.signedUrl && (
                        <a href={doc.signedUrl} target="_blank" rel="noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          Ouvrir
                        </a>
                      )}
                      <button onClick={() => onDeleteDoc(doc.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0">
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

// ── Section Assistant chantier (Gemini 2.0-flash) ────────────────────────────

const ALERTE_STYLE: Record<string, { bg: string; border: string; text: string; accent: string; btn: string }> = {
  critique:     { bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-red-800',    accent: 'border-l-red-500',    btn: 'bg-red-600 hover:bg-red-700 text-white'     },
  risque:       { bg: 'bg-amber-50',  border: 'border-amber-100',  text: 'text-amber-800',  accent: 'border-l-amber-400',  btn: 'bg-amber-500 hover:bg-amber-600 text-white'  },
  opportunité:  { bg: 'bg-emerald-50',border: 'border-emerald-100',text: 'text-emerald-800',accent: 'border-l-emerald-400',btn: 'bg-emerald-600 hover:bg-emerald-700 text-white'},
};

const ALERTE_ICON: Record<string, string> = {
  critique: '🔴', risque: '⚠️', opportunité: '✅',
};

function AssistantChantierSection({ result, documents, lots, chantierId, token, onAddDoc, onGoToLots, onGoToAnalyse, onGoToBudget, onOpenChat }: {
  result: ChantierIAResult;
  documents: DocumentChantier[];
  lots: LotChantier[];
  chantierId: string | null;
  token: string | null | undefined;
  onAddDoc: () => void;
  onGoToLots: () => void;
  onGoToAnalyse: () => void;
  onGoToBudget: () => void;
  onOpenChat: () => void;
}) {
  const { data, loading, error, refresh } = useChantierAssistant({
    chantierId, token, result, documents, lots, enabled: true,
  });

  // Mapper le CTA texte → action réelle
  function resolveCtaAction(cta: string) {
    const c = cta.toLowerCase();
    if (c.includes('devis') && (c.includes('voir') || c.includes('lot'))) return onGoToLots;
    if (c.includes('analys') || c.includes('devis')) return onGoToAnalyse;
    if (c.includes('budget') || c.includes('affin')) return onGoToBudget;
    if (c.includes('import') || c.includes('ajout') || c.includes('factur') || c.includes('photo')) return onAddDoc;
    return onGoToLots;
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-7 space-y-4">

      {/* ── En-tête avatar ──────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <ExpertAvatar size={52} showBadge />
        <div>
          <h2 className="font-bold text-gray-900">Votre maître d'œuvre</h2>
          <p className="text-xs text-gray-400">Analyse propulsée par Gemini 2.0</p>
        </div>
        <button
          onClick={refresh}
          className="ml-auto text-xs text-gray-400 hover:text-blue-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-50"
        >
          Actualiser
        </button>
      </div>

      {/* ── Loading ─────────────────────────────────────────── */}
      {loading && !data && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-2xl bg-white border border-gray-100 animate-pulse" />
          ))}
          <p className="text-xs text-center text-gray-400">Analyse en cours…</p>
        </div>
      )}

      {/* ── Erreur ─────────────────────────────────────────── */}
      {error && !data && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-5 text-center">
          <Bot className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 mb-3">{error}</p>
          <button onClick={refresh} className="text-sm font-medium text-blue-600 hover:text-blue-700">
            Réessayer →
          </button>
        </div>
      )}

      {/* ── Résultat IA ─────────────────────────────────────── */}
      {data && (
        <>
          {/* Action prioritaire */}
          <div className="bg-white rounded-2xl border-l-4 border-l-blue-500 border border-blue-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-1">Action prioritaire</p>
              <p className="font-bold text-gray-900 leading-snug mb-1">{data.action_prioritaire.titre}</p>
              <p className="text-sm text-gray-500 leading-relaxed mb-3">{data.action_prioritaire.raison}</p>
              <button
                onClick={resolveCtaAction(data.action_prioritaire.cta)}
                className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl px-4 py-2 transition-colors"
              >
                {data.action_prioritaire.cta} →
              </button>
            </div>
          </div>

          {/* Alertes */}
          {data.alertes.length > 0 && (
            <div className="space-y-2">
              {data.alertes.map((alerte, i) => {
                const s = ALERTE_STYLE[alerte.type] ?? ALERTE_STYLE.risque;
                return (
                  <div key={i} className={`rounded-2xl border-l-4 ${s.accent} ${s.border} ${s.bg} overflow-hidden`}>
                    <div className="px-5 py-3.5 flex items-start gap-3">
                      <span className="text-sm leading-none shrink-0 mt-0.5">{ALERTE_ICON[alerte.type] ?? '⚠️'}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${s.text} leading-snug`}>{alerte.message}</p>
                      </div>
                      <button
                        onClick={resolveCtaAction(alerte.cta)}
                        className={`shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${s.btn}`}
                      >
                        {alerte.cta} →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Insights */}
          {data.insights.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Observations</p>
              <ul className="space-y-2">
                {data.insights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-400 shrink-0 mt-0.5">›</span>
                    <span className="text-sm text-gray-700 leading-snug">{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Conseil métier */}
          {data.conseil_metier && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 flex items-start gap-3">
              <span className="text-lg shrink-0">💡</span>
              <p className="text-sm text-blue-800 font-medium leading-relaxed">{data.conseil_metier}</p>
            </div>
          )}

          {/* Accès chat */}
          <div className="pt-2 flex justify-center">
            <button
              onClick={onOpenChat}
              className="flex items-center gap-2 text-sm font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl px-5 py-2.5 transition-all shadow-sm"
            >
              <MessageCircle className="h-4 w-4" />
              Poser une question au maître d'œuvre →
            </button>
          </div>
        </>
      )}
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
  const [showBudgetDetail, setShowBudgetDetail]   = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('budget');
  const [mobileOpen, setMobileOpen]       = useState(false);
  const [documents, setDocuments]         = useState<DocumentChantier[]>([]);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [uploadModal, setUploadModal]     = useState<{ open: boolean; lotId?: string; defaultType?: DocumentType }>({ open: false });
  const lots = result.lots ?? [];

  // Auto-sélection du premier lot quand on navigue vers 'lots' sans sélection explicite
  useEffect(() => {
    if (activeSection === 'lots' && !selectedLotId && lots.length > 0) {
      setSelectedLotId(lots[0].id);
    }
  }, [activeSection, selectedLotId, lots]);

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
  const [refinedBreakdown, setRefinedBreakdown] = useState<BreakdownItem[]>([]);
  const [affineBudgetModal, setAffineBudgetModal] = useState(false);
  const [showAddIntervenant, setShowAddIntervenant] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
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
    return {
      documents: documents.length > 0 ? { text: `${documents.length}`, style: 'bg-gray-100 text-gray-600' } : undefined,
    };
  }, [documents]);

  const selectedLot = lots.find(l => l.id === selectedLotId);
  const hasDiyOpportunity = lots.some(l => l.statut === 'a_trouver');

  // ── Navigation helpers ────────────────────────────────────────────────────
  function navigateTo(s: Section) {
    setActiveSection(s);
    setSelectedLotId(null);
    setShowBudgetDetail(false);
    setAffineBudgetModal(false);
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
            refinedBreakdown={refinedBreakdown}
            onAffineBudget={() => { setShowBudgetDetail(true); setAffineBudgetModal(true); }}
            onAddDevisForLot={(lotId) => setUploadModal({ open: true, lotId, defaultType: 'devis' })}
            onAddDocForLot={(lotId) => setUploadModal({ open: true, lotId })}
            onGoToLot={(lotId) => { setSelectedLotId(lotId); navigateTo('lots'); }}
            onGoToAnalyse={() => navigateTo('analyse')}
            onGoToPlanning={() => navigateTo('planning')}
            onAddDoc={() => setUploadModal({ open: true })}
            onGoToAssistant={() => setChatOpen(true)}
            onAddIntervenant={() => setShowAddIntervenant(true)}
            onDeleteLot={deleteLot}
          />
        );

      case 'lots':
        // Grille supprimée — l'useEffect auto-sélectionne le premier lot → LotDetail
        // Rendu vide pendant le cycle de rendu initial (rare)
        return null;

      case 'contacts':
        return chantierId && token ? (
          <ContactsSection chantierId={chantierId} token={token} />
        ) : null;

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
          <DocumentsView documents={documents} lots={lots} chantierId={chantierId!} token={token!} onAddDoc={() => setUploadModal({ open: true })} onDeleteDoc={handleDeleteDoc} onDocUpdated={loadDocuments} />
        );

      case 'assistant':
        return (
          <AssistantChantierSection
            result={result}
            documents={documents}
            lots={lots}
            chantierId={chantierId}
            token={token}
            onAddDoc={() => setUploadModal({ open: true })}
            onGoToLots={() => navigateTo('lots')}
            onGoToAnalyse={() => navigateTo('analyse')}
            onGoToBudget={() => navigateTo('budget')}
            onOpenChat={() => setChatOpen(true)}
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

      case 'tresorerie':
        return (
          <div className="max-w-3xl mx-auto px-4 py-7">
            {chantierId && token ? (
              <TresoreriePanel
                chantierId={chantierId}
                token={token}
                budgetMax={displayMax}
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
    lots: 'Intervenants', contacts: 'Contacts', analyse: 'Analyse des devis',
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
        {activeSection === 'budget' && !showBudgetDetail ? (
          <BudgetHomeHeader
            onMenuToggle={() => setMobileOpen(v => !v)}
            onAddDoc={() => setUploadModal({ open: true })}
          />
        ) : (
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
            onBack={
              (activeSection !== 'budget' || showBudgetDetail)
                ? () => { setShowBudgetDetail(false); if (activeSection !== 'budget') navigateTo('budget'); }
                : undefined
            }
          />
        )}

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
          defaultType={uploadModal.defaultType}
          onClose={() => setUploadModal({ open: false })}
          onSuccess={(doc) => {
            setDocuments(prev => [doc, ...prev]);
            refreshInsights();
          }}
        />
      )}

      {/* ── Add intervenant modal ─────────────────────────────────────────── */}
      {showAddIntervenant && chantierId && token && (
        <AddIntervenantModal
          chantierId={chantierId}
          token={token}
          existingNoms={lots.map(l => l.nom)}
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
