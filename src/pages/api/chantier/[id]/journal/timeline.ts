/**
 * GET /api/chantier/[id]/journal/timeline?from=<ISO>&to=<ISO>
 *
 * Timeline horodatée du Journal de chantier : agrège, pour la fenêtre [from, to[,
 * tous les événements datés d'un chantier — SANS les messages WhatsApp individuels.
 *
 * Sources agrégées :
 *  - chantier_activity        → changements de statut (devis / facture / lot)
 *  - documents_chantier       → dépôts de documents (created_at)
 *  - agent_insights           → alertes émises (types actionnables uniquement)
 *  - chantier_assistant_messages → décisions prises par l'agent IA (tool_calls),
 *                                 hors tools de changement de statut (déjà tracés
 *                                 par chantier_activity → évite le doublon).
 *
 * `from`/`to` sont des timestamps ISO (le client les calcule depuis la date
 * affichée à minuit locale → pas de calcul de fuseau côté serveur).
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/api/apiHelpers';

// Tools agent qui changent un statut — déjà tracés dans chantier_activity via
// l'instrumentation des routes PATCH. Exclus de l'extraction "décisions IA".
const STATUS_TOOLS = new Set(['update_lot_status', 'update_devis_statut', 'mark_lot_completed']);

// Tools non pertinents pour la timeline (produisent un insight, ou lecture seule).
const SKIP_TOOLS = new Set(['log_insight', 'request_clarification']);

const TOOL_LABELS: Record<string, string> = {
  shift_lot:                    'Lot décalé dans le planning',
  update_planning:              'Planning modifié',
  arrange_lot:                  'Lot réorganisé dans le planning',
  update_lot_dates:             'Dates de lot modifiées',
  create_task:                  'Tâche créée',
  complete_task:                'Tâche clôturée',
  register_expense:             'Dépense déclarée',
  register_payment:             'Paiement enregistré',
  register_avenant:             'Avenant créé',
  add_payment_event:            'Échéance ajoutée',
  send_whatsapp_message:        'Message WhatsApp envoyé',
  send_whatsapp_to_contact:     'Message WhatsApp envoyé à un contact',
  send_email:                   'Email envoyé',
  move_document_to_lot:         'Document réaffecté à un lot',
  update_contact:               'Contact mis à jour',
  schedule_reminder:            'Rappel programmé',
  cancel_reminder:              'Rappel annulé',
  notify_owner_for_decision:    'Décision soumise pour validation',
  create_owner_whatsapp_channel:'Canal WhatsApp privé créé',
};

const DOC_TYPE_LABEL: Record<string, string> = {
  devis: 'Devis', facture: 'Facture', photo: 'Photo', plan: 'Plan', autre: 'Document',
};

interface TimelineEvent {
  occurred_at: string;
  category: 'status_change' | 'document' | 'alert' | 'decision';
  actor: 'user' | 'agent' | 'system';
  label: string;
  detail: string | null;
}

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from || !to) return jsonError('Paramètres from et to (ISO) requis', 400);

  const cid = params.id!;
  const sb = ctx.supabase;

  const [chantierRes, activityRes, docsRes, insightsRes, msgsRes] = await Promise.all([
    sb.from('chantiers').select('nom, emoji').eq('id', cid).single(),
    sb.from('chantier_activity')
      .select('occurred_at, category, actor, summary, detail')
      .eq('chantier_id', cid)
      .gte('occurred_at', from).lt('occurred_at', to)
      .order('occurred_at', { ascending: true }).limit(1000),
    sb.from('documents_chantier')
      .select('nom, document_type, source, created_at')
      .eq('chantier_id', cid)
      .gte('created_at', from).lt('created_at', to)
      .order('created_at', { ascending: true }).limit(1000),
    sb.from('agent_insights')
      .select('title, severity, created_at')
      .eq('chantier_id', cid)
      .gte('created_at', from).lt('created_at', to)
      .not('type', 'in', '(digest,conversation_summary,lot_status_change)')
      .order('created_at', { ascending: true }).limit(1000),
    sb.from('chantier_assistant_messages')
      .select('tool_calls, created_at')
      .eq('chantier_id', cid)
      .eq('role', 'assistant')
      .not('tool_calls', 'is', null)
      .gte('created_at', from).lt('created_at', to)
      .order('created_at', { ascending: true }).limit(500),
  ]);

  if (activityRes.error) return jsonError(activityRes.error.message, 500);

  const events: TimelineEvent[] = [];

  // 1. Changements de statut
  for (const a of activityRes.data ?? []) {
    events.push({
      occurred_at: a.occurred_at,
      category: 'status_change',
      actor: (['user', 'agent', 'system'].includes(a.actor) ? a.actor : 'user') as TimelineEvent['actor'],
      label: a.summary,
      detail: a.detail ?? null,
    });
  }

  // 2. Dépôts de documents
  for (const d of docsRes.data ?? []) {
    const typeLabel = DOC_TYPE_LABEL[d.document_type as string] ?? 'Document';
    events.push({
      occurred_at: d.created_at,
      category: 'document',
      actor: d.source === 'whatsapp' ? 'system' : 'user',
      label: `${typeLabel} ajouté : « ${d.nom} »`,
      detail: d.source === 'whatsapp' ? 'Reçu via WhatsApp' : null,
    });
  }

  // 3. Alertes émises
  for (const i of insightsRes.data ?? []) {
    events.push({
      occurred_at: i.created_at,
      category: 'alert',
      actor: 'agent',
      label: i.title,
      detail: i.severity === 'critical' ? 'Alerte critique'
        : i.severity === 'warning' ? 'Alerte' : 'Information',
    });
  }

  // 4. Décisions prises par l'agent IA (hors changements de statut — déjà tracés)
  for (const m of msgsRes.data ?? []) {
    const calls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
    for (const call of calls) {
      if (!call || typeof call !== 'object') continue;
      const tool = String((call as Record<string, unknown>).tool ?? '');
      if (!tool || STATUS_TOOLS.has(tool) || SKIP_TOOLS.has(tool)) continue;
      if (tool.startsWith('get_') || tool.startsWith('list_')) continue;
      if ((call as Record<string, unknown>).result_ok === false) continue;
      const args = (call as Record<string, unknown>).args as Record<string, unknown> | undefined;
      const raison = args && typeof args.raison === 'string' ? args.raison : null;
      events.push({
        occurred_at: m.created_at,
        category: 'decision',
        actor: 'agent',
        label: TOOL_LABELS[tool] ?? `Action : ${tool}`,
        detail: raison,
      });
    }
  }

  // Tri chronologique ascendant
  events.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  return jsonOk({
    events,
    count: events.length,
    chantier_nom: chantierRes.data?.nom ?? 'Chantier',
    chantier_emoji: chantierRes.data?.emoji ?? '',
  });
};
