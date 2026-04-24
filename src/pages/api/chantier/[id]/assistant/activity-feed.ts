/**
 * GET /api/chantier/[id]/assistant/activity-feed
 *
 * Retourne l'activité agent du jour (00h00 local → maintenant) :
 *  - tool_calls exécutés (décisions qui ont muté l'état)
 *  - agent_insights créés (alertes / clarifications / changements)
 *
 * Le panneau droit de l'onglet Assistant s'affiche sur cette base.
 * À minuit l'endpoint renvoie un set vide (reset visuel).
 *
 * Auth : JWT user.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import {
  requireChantierAuth,
  optionsResponse,
  jsonOk,
  jsonError,
  createServiceClient,
} from '@/lib/apiHelpers';

// Tools qui RÉELLEMENT mutent l'état (exclus les GET passifs)
const MUTATION_TOOLS = new Set([
  'update_planning', 'shift_lot', 'arrange_lot', 'update_lot_dates',
  'update_lot_status', 'mark_lot_completed',
  'create_task', 'complete_task',
  'register_expense',
  'send_whatsapp_message',
  'log_insight',
  'request_clarification',
]);

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');

export const GET: APIRoute = async ({ request, params }) => {
  const chantierId = params.id as string;
  const ctx = await requireChantierAuth(request, chantierId);
  if (ctx instanceof Response) return ctx;

  const supabase = createServiceClient();

  // "Aujourd'hui" en heure Paris — les events avec created_at >= ce repère UTC.
  // On prend minuit Paris ≈ 22h ou 23h UTC la veille. Approximation simple :
  // date courante 00:00 local du navigateur n'est pas dispo côté serveur,
  // on utilise UTC-1h pour couvrir (Paris = UTC+1/+2). Perte acceptable.
  const now = new Date();
  const parisOffset = 2; // DST → UTC+2 ; hors DST UTC+1. Sans mal si 1h de décalage.
  const parisNow = new Date(now.getTime() + parisOffset * 3600 * 1000);
  const startOfDayParis = new Date(Date.UTC(
    parisNow.getUTCFullYear(),
    parisNow.getUTCMonth(),
    parisNow.getUTCDate(),
    0, 0, 0,
  ));
  // On retire l'offset Paris → équivalent UTC du début du jour Paris
  const sinceIso = new Date(startOfDayParis.getTime() - parisOffset * 3600 * 1000).toISOString();

  // ── 1. Décisions (tool_calls action) ───────────────────────────────────────
  const { data: msgs, error: msgErr } = await supabase
    .from('chantier_assistant_messages')
    .select('id, role, content, tool_calls, created_at')
    .eq('chantier_id', chantierId)
    .eq('role', 'assistant')
    .not('tool_calls', 'is', null)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false });

  if (msgErr) {
    console.error('[activity-feed] messages error:', msgErr.message);
  }

  const decisions: Array<{
    id: string;
    kind: 'decision';
    tool: string;
    args: Record<string, unknown>;
    result_preview: string | null;
    result_ok: boolean;
    created_at: string;
  }> = [];

  for (const msg of (msgs ?? [])) {
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    for (const call of calls) {
      if (!call || typeof call !== 'object') continue;
      const toolName = String((call as any).tool ?? '');
      if (!MUTATION_TOOLS.has(toolName)) continue; // filtre lectures
      decisions.push({
        id: `${msg.id}-${toolName}`,
        kind: 'decision',
        tool: toolName,
        args: (call as any).args ?? {},
        result_preview: (call as any).result_preview ?? null,
        result_ok: (call as any).result_ok !== false,
        created_at: msg.created_at,
      });
    }
  }

  // ── 2. Insights (alertes, clarifications, changements statut) ──────────────
  const { data: insights, error: insErr } = await supabase
    .from('agent_insights')
    .select('id, type, severity, title, body, read_by_user, needs_confirmation, created_at')
    .eq('chantier_id', chantierId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false });

  if (insErr) {
    console.error('[activity-feed] insights error:', insErr.message);
  }

  return jsonOk({
    since: sinceIso,
    decisions,
    insights: insights ?? [],
  });
};
