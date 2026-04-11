import { useState } from 'react';
import {
  Bot, MessageCircle, Loader2, CheckSquare, Square, Plus,
  Calendar, Wallet, Clock, AlertTriangle, RefreshCw, ChevronRight,
  BookOpen, Lightbulb, Bell,
} from 'lucide-react';
import type { ChantierIAResult, DocumentChantier, LotChantier } from '@/types/chantier-ia';
import { ExpertAvatar } from '@/components/chantier/MATERIAL_IMAGES';
import { useTaches } from '@/hooks/useTaches';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentInsightsData {
  insights: Array<{
    id: string; type: string; severity: string; title: string; body: string;
    actions_taken: Array<{ tool: string; summary: string }>;
    needs_confirmation: boolean; read_by_user: boolean; created_at: string;
  }>;
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

interface Props {
  result: ChantierIAResult;
  documents: DocumentChantier[];
  lots: LotChantier[];
  chantierId: string | null;
  token: string | null | undefined;
  agentInsights?: AgentInsightsData;
  assistantData?: { action_prioritaire?: any; alertes?: any[]; synthese?: string; insights?: string[]; conseil_metier?: string } | null;
  assistantLoading?: boolean;
  assistantError?: string | null;
  assistantRefresh?: () => void;
  onAddDoc: () => void;
  onGoToLots: () => void;
  onGoToContacts: () => void;
  onGoToPlanning: () => void;
  onGoToAnalyse: () => void;
  onGoToBudget: () => void;
  onGoToJournal?: () => void;
  onOpenChat: () => void;
}

// ── Unified alert item ────────────────────────────────────────────────────────

interface UnifiedAlert {
  id: string;
  source: 'gemini' | 'agent';
  severity: 'critical' | 'warning' | 'info' | 'success';
  icon: React.ReactNode;
  title: string;
  detail?: string;
  cta?: { label: string; action: () => void };
  aiActions?: Array<{ tool: string; summary: string }>;
  onDismiss?: () => void;
}

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-400',
  info: 'bg-blue-400',
  success: 'bg-emerald-400',
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  planning_impact: <Calendar className="h-3.5 w-3.5 text-blue-500" />,
  budget_alert: <Wallet className="h-3.5 w-3.5 text-amber-500" />,
  payment_overdue: <Clock className="h-3.5 w-3.5 text-red-500" />,
  risk_detected: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
  lot_status_change: <RefreshCw className="h-3.5 w-3.5 text-blue-500" />,
  conversation_summary: <MessageCircle className="h-3.5 w-3.5 text-gray-400" />,
  needs_clarification: <Bell className="h-3.5 w-3.5 text-orange-500" />,
  digest: <BookOpen className="h-3.5 w-3.5 text-primary" />,
};

// ── Main component ────────────────────────────────────────────────────────────

function AssistantChantierSection({
  result, documents, lots, chantierId, token,
  agentInsights, assistantData: data, assistantLoading: loading, assistantError: error, assistantRefresh: refresh,
  onAddDoc, onGoToLots, onGoToContacts, onGoToPlanning, onGoToAnalyse, onGoToBudget, onGoToJournal, onOpenChat,
}: Props) {
  const taches = useTaches(chantierId, token);
  const [newTask, setNewTask] = useState('');
  const [showAllTasks, setShowAllTasks] = useState(false);

  // ── Build unified alerts (merge Gemini + Agent) ───────────────
  const unifiedAlerts: UnifiedAlert[] = [];

  // 1. Gemini action_prioritaire → first alert
  if (data?.action_prioritaire) {
    const ap = data.action_prioritaire;
    unifiedAlerts.push({
      id: 'gemini-action',
      source: 'gemini',
      severity: 'critical',
      icon: <AlertTriangle className="h-3.5 w-3.5 text-red-500" />,
      title: ap.titre,
      detail: ap.raison,
      cta: { label: ap.cta, action: resolveCtaAction(ap.cta, ap.cta_type) },
    });
  }

  // 2. Agent insights (unread, non-clarification)
  if (agentInsights && !agentInsights.loading) {
    for (const ins of agentInsights.insights.filter(i => !i.read_by_user && !i.needs_confirmation)) {
      const sev = ins.severity === 'critical' ? 'critical' : ins.severity === 'warning' ? 'warning' : 'info';
      unifiedAlerts.push({
        id: ins.id,
        source: 'agent',
        severity: sev,
        icon: TYPE_ICON[ins.type] ?? <Bot className="h-3.5 w-3.5 text-gray-400" />,
        title: ins.title,
        detail: ins.body,
        aiActions: ins.actions_taken.length > 0 ? ins.actions_taken : undefined,
        onDismiss: () => agentInsights.markAsRead(ins.id),
      });
    }
  }

  // 3. Gemini alertes
  const extractKeywords = (s: string) => new Set(
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
     .split(/\s+/).filter(w => w.length > 3)
  );
  if (data?.alertes) {
    for (const alerte of data.alertes) {
      const sev = alerte.type === 'critique' ? 'critical' : alerte.type === 'risque' ? 'warning' : 'success';
      // Deduplicate: skip if agent already has an insight with similar keywords (60% overlap)
      const alerteKw = extractKeywords(alerte.message);
      const isDuplicate = unifiedAlerts.some(a => {
        const existingKw = extractKeywords(a.title);
        if (existingKw.size === 0 || alerteKw.size === 0) return false;
        const common = [...alerteKw].filter(w => existingKw.has(w)).length;
        return common >= Math.min(existingKw.size, alerteKw.size) * 0.6;
      });
      if (!isDuplicate) {
        unifiedAlerts.push({
          id: `gemini-${alerte.type}-${alerte.message.slice(0, 20)}`,
          source: 'gemini',
          severity: sev,
          icon: sev === 'critical' ? <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> : sev === 'warning' ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> : <Lightbulb className="h-3.5 w-3.5 text-emerald-500" />,
          title: alerte.message,
          cta: alerte.cta ? { label: alerte.cta, action: resolveCtaAction(alerte.cta, alerte.cta_type) } : undefined,
        });
      }
    }
  }

  // Sort: critical first, then warning, then info
  const SORDER: Record<string, number> = { critical: 0, warning: 1, info: 2, success: 3 };
  unifiedAlerts.sort((a, b) => (SORDER[a.severity] ?? 2) - (SORDER[b.severity] ?? 2));

  // ── CTA resolver — by cta_type (structured) or cta label (fallback) ──
  function resolveCtaAction(cta: string, ctaType?: string) {
    if (ctaType) {
      if (ctaType === 'contacts') return onGoToContacts;
      if (ctaType === 'planning') return onGoToPlanning;
      if (ctaType === 'lots') return onGoToLots;
      if (ctaType === 'analyse') return onGoToAnalyse;
      if (ctaType === 'budget') return onGoToBudget;
      if (ctaType === 'documents') return onAddDoc;
    }
    // Fallback: keyword matching on label
    const c = cta.toLowerCase();
    if (c.includes('contact') || c.includes('artisan') || c.includes('trouver')) return onGoToContacts;
    if (c.includes('planning') || c.includes('planning')) return onGoToPlanning;
    if (c.includes('budget') || c.includes('affin')) return onGoToBudget;
    if (c.includes('analys') || c.includes('devis') || c.includes('score')) return onGoToAnalyse;
    if (c.includes('import') || c.includes('ajout') || c.includes('factur') || c.includes('photo') || c.includes('document')) return onAddDoc;
    return onGoToLots;
  }

  // ── Synthèse experte (nouveau) + compat legacy insights ──────────
  const synthese: string | null = data?.synthese
    ?? (data?.insights?.length ? data.insights.join(' ') : null)
    ?? data?.conseil_metier
    ?? null;

  // ── Clarifications (agent) ────────────────────────────────────
  const clarifications = agentInsights?.insights.filter(i => i.needs_confirmation && !i.read_by_user) ?? [];

  // ── Tasks display ─────────────────────────────────────────────
  const displayTasks = showAllTasks ? taches.pending : taches.pending.slice(0, 8);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-6 py-7 space-y-5">

      {/* ── Section 1 : En-tête ──────────────────────────────── */}
      <div className="flex items-center gap-3">
        <ExpertAvatar size={44} showBadge />
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-gray-900 text-[15px]">Pilote de chantier</h2>
          <p className="text-xs text-gray-400">Votre assistant IA</p>
        </div>
        <button
          onClick={() => { refresh?.(); taches.refresh(); }}
          className="text-xs text-gray-400 hover:text-primary transition-colors px-2.5 py-1.5 rounded-lg hover:bg-primary/5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Loading ──────────────────────────────────────────── */}
      {loading && !data && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-xl bg-gray-50 animate-pulse" />
          ))}
          <p className="text-xs text-center text-gray-400">Analyse en cours...</p>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────── */}
      {error && !data && (
        <div className="bg-gray-50 rounded-xl px-5 py-5 text-center">
          <Bot className="h-7 w-7 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 mb-2">{error}</p>
          <button onClick={() => refresh?.()} className="text-sm font-medium text-primary hover:underline">Réessayer</button>
        </div>
      )}

      {/* ── Section 2 : Clarifications urgentes ──────────────── */}
      {clarifications.length > 0 && (
        <div className="space-y-2">
          {clarifications.map(c => (
            <div key={c.id} className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3.5">
              <div className="flex items-start gap-2.5">
                <Bell className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400 mb-0.5">Clarification</p>
                  <p className="text-sm font-semibold text-gray-900">{c.title}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{c.body}</p>
                  <div className="flex gap-2 mt-2.5">
                    <button onClick={onGoToLots} className="text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg px-3 py-1.5 transition-colors">
                      Affecter à un lot
                    </button>
                    <button onClick={() => agentInsights?.markAsRead(c.id)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5">
                      Ignorer
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Section 3 : Tâches à faire ──────────────────────── */}
      {!taches.loading && taches.pending.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50">
            <div className="flex items-center gap-1.5">
              <CheckSquare className="h-3.5 w-3.5 text-gray-400" />
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                À faire ({taches.pending.length})
              </p>
            </div>
            {taches.pending.length > 8 && (
              <button onClick={() => setShowAllTasks(!showAllTasks)} className="text-[10px] text-primary hover:underline">
                {showAllTasks ? 'Réduire' : `Voir tout (${taches.pending.length})`}
              </button>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {displayTasks.map(t => (
              <button
                key={t.id}
                onClick={() => taches.toggleDone(t.id, true)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/50 transition-colors text-left group"
              >
                <Square className="h-4 w-4 text-gray-300 group-hover:text-primary transition-colors shrink-0" />
                <span className="flex-1 text-sm text-gray-800 min-w-0 truncate">{t.titre}</span>
                {t.priorite === 'urgent' && (
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-600 shrink-0">urgent</span>
                )}
                {t.priorite === 'important' && (
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 shrink-0">important</span>
                )}
              </button>
            ))}
          </div>
          {/* Add task inline */}
          <form
            onSubmit={e => { e.preventDefault(); if (newTask.trim()) { taches.addTask(newTask.trim()); setNewTask(''); } }}
            className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-50"
          >
            <Plus className="h-3.5 w-3.5 text-gray-300 shrink-0" />
            <input
              type="text"
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              placeholder="Ajouter une tâche..."
              className="flex-1 text-sm text-gray-600 placeholder:text-gray-300 outline-none bg-transparent"
            />
          </form>
        </div>
      )}

      {/* ── Section 4 : Alertes & insights unifiés ──────────── */}
      {unifiedAlerts.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-50 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Alertes ({unifiedAlerts.length})
            </p>
            {agentInsights && agentInsights.unreadCount > 0 && (
              <button onClick={agentInsights.markAllRead} className="text-[10px] text-gray-400 hover:text-primary">
                Tout vu
              </button>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {unifiedAlerts.slice(0, 8).map(alert => (
              <div key={alert.id} className="px-4 py-3 hover:bg-gray-50/30 transition-colors">
                <div className="flex items-start gap-2.5">
                  {/* Severity dot */}
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${SEVERITY_DOT[alert.severity]}`} />
                  {/* Icon */}
                  <span className="mt-0.5 shrink-0">{alert.icon}</span>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                    {alert.detail && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{alert.detail}</p>}
                    {/* AI actions */}
                    {alert.aiActions && (
                      <div className="mt-1 space-y-0.5">
                        {alert.aiActions.map((a, j) => (
                          <p key={j} className="text-[10px] text-primary/70 flex items-center gap-1">
                            <Bot className="h-3 w-3" /> {a.summary}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* CTA or dismiss */}
                  {alert.cta && (
                    <button onClick={alert.cta.action} className="text-[10px] font-semibold text-primary hover:underline shrink-0 mt-0.5">
                      {alert.cta.label} <ChevronRight className="h-3 w-3 inline" />
                    </button>
                  )}
                  {alert.onDismiss && !alert.cta && (
                    <button onClick={alert.onDismiss} className="text-[10px] text-gray-300 hover:text-gray-500 shrink-0 mt-0.5">
                      vu
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 5 : Recommandations ──────────────────────── */}
      {synthese && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <Lightbulb className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1.5">Analyse du pilote</p>
              <p className="text-[13px] text-indigo-900 leading-relaxed">{synthese}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 6 : Journal + Chat ──────────────────────── */}
      <div className="flex items-center gap-3">
        {onGoToJournal && (
          <button onClick={onGoToJournal} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-primary hover:bg-primary/5 rounded-xl transition-colors border border-primary/10">
            <BookOpen className="h-3.5 w-3.5" />
            Journal du jour
          </button>
        )}
        <button onClick={onOpenChat} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-gray-500 hover:bg-gray-50 rounded-xl transition-colors border border-gray-100">
          <MessageCircle className="h-3.5 w-3.5" />
          Poser une question
        </button>
      </div>
    </div>
  );
}

export default AssistantChantierSection;
