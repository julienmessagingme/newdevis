/**
 * AssistantTriPane — onglet Assistant chantier en 3 colonnes.
 *
 *  ┌── Alertes ───┬── Chat ────┬── Décisions IA ──┐
 *  │ insights non │ ChantierAs │ tool_calls jour  │
 *  │ lus + cls.   │ sistantCh. │ (reset minuit)   │
 *  └──────────────┴────────────┴──────────────────┘
 *
 * Mobile : tabs en haut (Alertes / Chat / Décisions) — un seul panel visible.
 *
 * Sources de données :
 *  - Alertes  : prop `agentInsights` (hook useAgentInsights, partagé avec
 *               toasts + badge sidebar)
 *  - Décisions: GET /api/chantier/[id]/assistant/activity-feed (refresh 20s)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, BookOpen, Bot, Check, CheckCheck, MessageSquare,
  RefreshCcw, Sparkles,
} from 'lucide-react';
import ChantierAssistantChat from '@/components/chantier/ChantierAssistantChat';
import type { AgentInsight } from '@/hooks/useAgentInsights';

// ── Types ────────────────────────────────────────────────────────────────────

interface Decision {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result_preview: string | null;
  result_ok: boolean;
  created_at: string;
}

// ── Présentation ─────────────────────────────────────────────────────────────

function formatDecision(d: Decision): { icon: string; title: string; subtitle: string; cls: string } {
  const reason = typeof d.args.raison === 'string' ? d.args.raison : null;
  switch (d.tool) {
    case 'shift_lot': {
      const jours = Number(d.args.jours ?? 0);
      const cascade = Boolean(d.args.cascade);
      const signe = jours > 0 ? '+' : '';
      return {
        icon: '📅',
        title: `Lot décalé de ${signe}${jours}j${cascade ? ' (cascade)' : ' (détaché)'}`,
        subtitle: reason ?? '',
        cls: 'bg-blue-50 text-blue-700',
      };
    }
    case 'update_planning': {
      const parts: string[] = [];
      if (typeof d.args.duree_jours === 'number') parts.push(`durée ${d.args.duree_jours}j`);
      if (typeof d.args.delai_avant_jours === 'number') parts.push(`délai ${d.args.delai_avant_jours}j`);
      if (Array.isArray(d.args.depends_on_ids)) parts.push(`${d.args.depends_on_ids.length} prédécesseurs`);
      return {
        icon: '📅',
        title: `Planning modifié (${parts.join(', ') || 'recalc'})`,
        subtitle: reason ?? '',
        cls: 'bg-blue-50 text-blue-700',
      };
    }
    case 'arrange_lot': {
      const mode = String(d.args.mode ?? '');
      return {
        icon: '📅',
        title: mode === 'chain_after' ? 'Lot chaîné après un autre' : 'Lots mis en parallèle',
        subtitle: reason ?? '',
        cls: 'bg-blue-50 text-blue-700',
      };
    }
    case 'update_lot_dates':
      return {
        icon: '📅',
        title: `Date lot → ${d.args.new_start_date ?? '?'}`,
        subtitle: reason ?? '',
        cls: 'bg-blue-50 text-blue-700',
      };
    case 'update_lot_status':
    case 'mark_lot_completed':
      return {
        icon: '✅',
        title: d.tool === 'mark_lot_completed' ? 'Lot marqué terminé' : 'Statut lot changé',
        subtitle: reason ?? '',
        cls: 'bg-emerald-50 text-emerald-700',
      };
    case 'register_expense': {
      const montant = Number(d.args.amount ?? 0);
      const label = String(d.args.label ?? '');
      return {
        icon: '💰',
        title: `Frais ${montant.toFixed(0)}€ déclaré`,
        subtitle: label,
        cls: 'bg-amber-50 text-amber-700',
      };
    }
    case 'send_whatsapp_message':
      return {
        icon: '💬',
        title: 'Message WhatsApp envoyé',
        subtitle: typeof d.args.to === 'string' ? `→ ${d.args.to}` : '',
        cls: 'bg-green-50 text-green-700',
      };
    case 'create_task':
    case 'complete_task':
      return {
        icon: '☑️',
        title: d.tool === 'create_task' ? 'Tâche créée' : 'Tâche clôturée',
        subtitle: typeof d.args.title === 'string' ? d.args.title : (reason ?? ''),
        cls: 'bg-indigo-50 text-indigo-700',
      };
    case 'log_insight':
      return {
        icon: '💡',
        title: 'Insight journalisé',
        subtitle: typeof d.args.title === 'string' ? d.args.title : '',
        cls: 'bg-purple-50 text-purple-700',
      };
    case 'request_clarification':
      return {
        icon: '❓',
        title: 'Clarification demandée',
        subtitle: typeof d.args.question === 'string' ? d.args.question : '',
        cls: 'bg-orange-50 text-orange-700',
      };
    default:
      return {
        icon: '⚙️',
        title: d.tool,
        subtitle: reason ?? '',
        cls: 'bg-gray-50 text-gray-700',
      };
  }
}

function formatInsight(i: AgentInsight): { icon: string; cls: string } {
  if (i.type === 'needs_clarification') return { icon: '🔔', cls: 'bg-orange-50 text-orange-700' };
  if (i.severity === 'critical') return { icon: '🔴', cls: 'bg-red-50 text-red-700' };
  if (i.type === 'budget_alert') return { icon: '💰', cls: 'bg-amber-50 text-amber-700' };
  if (i.type === 'planning_impact') return { icon: '📅', cls: 'bg-blue-50 text-blue-700' };
  if (i.type === 'payment_overdue') return { icon: '⏰', cls: 'bg-red-50 text-red-700' };
  if (i.type === 'lot_status_change') return { icon: '🔄', cls: 'bg-indigo-50 text-indigo-700' };
  if (i.type === 'risk_detected') return { icon: '⚠️', cls: 'bg-amber-50 text-amber-700' };
  if (i.type === 'conversation_summary') return { icon: '💭', cls: 'bg-gray-50 text-gray-600' };
  return { icon: '📌', cls: 'bg-gray-50 text-gray-700' };
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ── Sous-panneaux ────────────────────────────────────────────────────────────

function AlertsPane({
  insights, unreadCount, loading, markAsRead, markAllRead, onRefresh,
}: {
  insights: AgentInsight[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };
  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-white to-amber-50/20">
      <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <div>
            <p className="text-[13px] font-bold text-gray-800 leading-tight">
              Alertes
              {unreadCount > 0 && (
                <span className="ml-1.5 text-[10px] font-semibold text-amber-600">
                  ({unreadCount} non lue{unreadCount > 1 ? 's' : ''})
                </span>
              )}
            </p>
            <p className="text-[10px] text-gray-400">{insights.length} sur 30 jours</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead()}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Tout marquer comme lu"
            >
              <CheckCheck className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            title="Rafraîchir"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-6 text-center text-[12px] text-gray-400">Chargement…</div>
        ) : insights.length === 0 ? (
          <div className="px-4 py-10 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-xl mb-3">
              ✓
            </div>
            <p className="text-[12px] font-semibold text-gray-500">Aucune alerte active</p>
            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed max-w-[220px]">
              Tout est sous contrôle — l'IA n'a rien détecté qui demande ton attention.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {insights.map(item => {
              const p = formatInsight(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { if (!item.read_by_user) markAsRead(item.id); }}
                  className="w-full text-left px-4 py-3 flex items-start gap-2.5 hover:bg-white transition-colors"
                >
                  <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-sm shrink-0 ${p.cls}`}>
                    {p.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] font-semibold leading-snug ${item.read_by_user ? 'text-gray-600' : 'text-gray-800'}`}>
                      {item.title}
                    </p>
                    {item.body && (
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug line-clamp-2">{item.body}</p>
                    )}
                    <p className="text-[10px] text-gray-300 mt-1 font-medium tabular-nums">{fmtTime(item.created_at)}</p>
                  </div>
                  {!item.read_by_user
                    ? <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500 mt-2" title="Non lu" />
                    : <Check className="shrink-0 h-3 w-3 text-gray-300 mt-1.5" aria-label="Lu" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DecisionsPane({
  decisions, loading, refreshing, onRefresh, onOpenJournal,
}: {
  decisions: Decision[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenJournal?: () => void;
}) {
  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-white to-blue-50/20">
      <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-500" />
          <div>
            <p className="text-[13px] font-bold text-gray-800 leading-tight">Décisions IA</p>
            <p className="text-[10px] text-gray-400">Aujourd'hui · reset à minuit</p>
          </div>
        </div>
        <button
          onClick={onRefresh}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          title="Rafraîchir"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-6 text-center text-[12px] text-gray-400">Chargement…</div>
        ) : decisions.length === 0 ? (
          <div className="px-4 py-10 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-xl mb-3">
              ✨
            </div>
            <p className="text-[12px] font-semibold text-gray-500">Aucune action aujourd'hui</p>
            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed max-w-[220px]">
              Les décisions prises par l'IA apparaîtront ici (planning, frais, messages…).
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {decisions.map(item => {
              const p = formatDecision(item);
              return (
                <div key={item.id} className="px-4 py-3 flex items-start gap-2.5 hover:bg-white transition-colors">
                  <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-sm shrink-0 ${p.cls}`}>
                    {p.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-gray-800 leading-snug">{p.title}</p>
                    {p.subtitle && (
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug line-clamp-2">{p.subtitle}</p>
                    )}
                    <p className="text-[10px] text-gray-300 mt-1 font-medium tabular-nums">{fmtTime(item.created_at)}</p>
                  </div>
                  {!item.result_ok && (
                    <span className="shrink-0 text-[9px] font-bold text-red-500 uppercase tracking-wider" title={item.result_preview ?? ''}>
                      échec
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="px-4 py-3 border-t border-gray-100 bg-white">
        <button
          onClick={onOpenJournal}
          className="w-full flex items-center justify-center gap-2 text-[12px] font-semibold text-gray-500 hover:text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-xl transition-colors"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Voir journal complet
        </button>
      </div>
    </div>
  );
}

// ── Composant principal ──────────────────────────────────────────────────────

export default function AssistantTriPane({
  chantierId,
  token,
  insights,
  unreadCount,
  insightsLoading,
  markAsRead,
  markAllRead,
  refreshInsights,
  onOpenJournal,
}: {
  chantierId: string;
  token: string | null | undefined;
  insights: AgentInsight[];
  unreadCount: number;
  insightsLoading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refreshInsights: () => Promise<void>;
  onOpenJournal?: () => void;
}) {
  const [mobileTab, setMobileTab] = useState<'alerts' | 'chat' | 'decisions'>('chat');

  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [decisionsLoading, setDecisionsLoading] = useState(true);
  const [decisionsRefreshing, setDecisionsRefreshing] = useState(false);

  const fetchDecisions = useCallback(async (silent = false) => {
    if (!chantierId || !token) { setDecisionsLoading(false); return; }
    if (!silent) setDecisionsLoading(true); else setDecisionsRefreshing(true);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/assistant/activity-feed`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDecisions(data.decisions ?? []);
      }
    } catch { /* silent */ }
    setDecisionsLoading(false);
    setDecisionsRefreshing(false);
  }, [chantierId, token]);

  useEffect(() => { fetchDecisions(); }, [fetchDecisions]);

  // useRef pour tracker l'interval id de manière stable entre re-runs du useEffect.
  // Avec un `let` en scope, deux visibilitychange rapprochés pendant un re-run
  // pouvaient créer un double-interval (race subtile, accélération du polling).
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    // Auto-refresh 20s, sauf quand l'onglet est en background (économise les
    // fetch inutiles quand le user n'est pas devant l'écran). Un visibilitychange
    // → visible déclenche un fetch immédiat pour rattraper.
    function start() {
      if (intervalIdRef.current !== null) return;
      intervalIdRef.current = setInterval(() => fetchDecisions(true), 20000);
    }
    function stop() {
      if (intervalIdRef.current === null) return;
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
    function onVisibility() {
      if (document.hidden) {
        stop();
      } else {
        fetchDecisions(true); // rattrapage immédiat
        start();
      }
    }
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchDecisions]);

  // Décisions = nb du jour ; sert juste au compteur du tab mobile
  const decisionsCount = decisions.length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tabs mobile (lg:hidden) */}
      <div className="lg:hidden flex border-b border-gray-100 bg-white shrink-0">
        <MobileTabButton
          active={mobileTab === 'alerts'}
          onClick={() => setMobileTab('alerts')}
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Alertes"
          count={unreadCount}
          accent="amber"
        />
        <MobileTabButton
          active={mobileTab === 'chat'}
          onClick={() => setMobileTab('chat')}
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          label="Chat"
          accent="blue"
        />
        <MobileTabButton
          active={mobileTab === 'decisions'}
          onClick={() => setMobileTab('decisions')}
          icon={<Bot className="h-3.5 w-3.5" />}
          label="Décisions"
          count={decisionsCount}
          accent="blue"
        />
      </div>

      {/* 3 colonnes */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Alertes (gauche) */}
        <div className={`${mobileTab !== 'alerts' ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-[300px] shrink-0 lg:border-r border-gray-100 min-h-0`}>
          <AlertsPane
            insights={insights}
            unreadCount={unreadCount}
            loading={insightsLoading}
            markAsRead={markAsRead}
            markAllRead={markAllRead}
            onRefresh={refreshInsights}
          />
        </div>

        {/* Chat (centre) */}
        <div className={`${mobileTab !== 'chat' ? 'hidden lg:flex' : 'flex'} flex-1 min-h-0 min-w-0 lg:border-r border-gray-100`}>
          <ChantierAssistantChat
            chantierId={chantierId ?? ''}
            token={token}
            size="full"
          />
        </div>

        {/* Décisions IA (droite) */}
        <div className={`${mobileTab !== 'decisions' ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-[300px] shrink-0 min-h-0`}>
          <DecisionsPane
            decisions={decisions}
            loading={decisionsLoading}
            refreshing={decisionsRefreshing}
            onRefresh={() => fetchDecisions(true)}
            onOpenJournal={onOpenJournal}
          />
        </div>
      </div>
    </div>
  );
}

// ── Bouton tab mobile ────────────────────────────────────────────────────────

function MobileTabButton({
  active, onClick, icon, label, count, accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
  accent: 'amber' | 'blue';
}) {
  const accentCls = accent === 'amber'
    ? 'border-amber-500 text-amber-700'
    : 'border-blue-500 text-blue-700';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-2 text-[12px] font-semibold border-b-2 transition-colors touch-manipulation ${
        active ? accentCls : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {icon}
      <span>{label}</span>
      {count != null && count > 0 && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
          accent === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}
