/**
 * AgentActivityFeed — panneau droit de l'onglet Assistant chantier.
 *
 * Affiche un fil d'activité unifié des dernières 24h :
 *  - Décisions (tool_calls mutateurs du jour)
 *  - Alertes / changements / clarifications (agent_insights du jour)
 *
 * Reset visuel à minuit (filtre côté serveur). La mémoire long-terme
 * reste dans le Journal de chantier (digest quotidien 19h).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, RefreshCcw, Sparkles } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Decision {
  id: string;
  kind: 'decision';
  tool: string;
  args: Record<string, unknown>;
  result_preview: string | null;
  result_ok: boolean;
  created_at: string;
}

interface Insight {
  id: string;
  type: string;
  severity: string;
  title: string;
  body: string | null;
  needs_confirmation: boolean;
  read_by_user: boolean;
  created_at: string;
}

type Item =
  | (Decision & { _kind: 'decision' })
  | (Insight & { _kind: 'insight' });

// ── Présentation des tool_calls ──────────────────────────────────────────────

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

function formatInsight(i: Insight): { icon: string; cls: string } {
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
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ── Composant ────────────────────────────────────────────────────────────────

export default function AgentActivityFeed({
  chantierId,
  token,
  onOpenJournal,
}: {
  chantierId: string;
  token: string | null | undefined;
  onOpenJournal?: () => void;
}) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFeed = useCallback(async (silent = false) => {
    if (!chantierId || !token) { setLoading(false); return; }
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/assistant/activity-feed`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDecisions(data.decisions ?? []);
        setInsights(data.insights ?? []);
      }
    } catch { /* silent */ }
    setLoading(false);
    setRefreshing(false);
  }, [chantierId, token]);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);
  // Auto-refresh toutes les 20s pour capter les nouveaux tool_calls de l'agent
  useEffect(() => {
    const id = setInterval(() => fetchFeed(true), 20000);
    return () => clearInterval(id);
  }, [fetchFeed]);

  // Fusion + tri chronologique desc
  const items = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...decisions.map(d => ({ ...d, _kind: 'decision' as const })),
      ...insights.map(i => ({ ...i, _kind: 'insight' as const })),
    ];
    return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [decisions, insights]);

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-white to-gray-50/40 border-l border-gray-100">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-500" />
          <div>
            <p className="text-[13px] font-bold text-gray-800 leading-tight">Activité IA</p>
            <p className="text-[10px] text-gray-400">Aujourd'hui · reset à minuit</p>
          </div>
        </div>
        <button
          onClick={() => fetchFeed(true)}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          title="Rafraîchir"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-6 text-center text-[12px] text-gray-400">Chargement…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-xl mb-3">
              ✨
            </div>
            <p className="text-[12px] font-semibold text-gray-500">Aucune activité aujourd'hui</p>
            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed max-w-[220px]">
              Les décisions prises par l'IA, alertes et questions s'afficheront ici.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {items.map(item => {
              if (item._kind === 'decision') {
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
              }
              // insight
              const p = formatInsight(item);
              return (
                <div key={item.id} className="px-4 py-3 flex items-start gap-2.5 hover:bg-white transition-colors">
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
                  {!item.read_by_user && (
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500 mt-2" title="Non lu" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
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
