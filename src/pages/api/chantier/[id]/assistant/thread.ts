/**
 * GET /api/chantier/[id]/assistant/thread
 * Retourne la conversation complète de l'assistant pour ce chantier.
 * Marque les messages agent_initiated comme lus (is_read = true).
 * Auth : JWT user uniquement.
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

const MESSAGES_LIMIT = 100;

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');

export const GET: APIRoute = async ({ request, params }) => {
  const chantierId = params.id as string;
  const ctx = await requireChantierAuth(request, chantierId);
  if (ctx instanceof Response) return ctx;

  const supabase = createServiceClient();

  // Fetch conversation (chronological order for display)
  const { data: messages, error } = await supabase
    .from('chantier_assistant_messages')
    .select('id, role, content, agent_initiated, is_read, created_at')
    .eq('chantier_id', chantierId)
    .order('created_at', { ascending: true })
    .limit(MESSAGES_LIMIT);

  if (error) {
    console.error('[assistant/thread] fetch error:', error.message);
    return jsonError('Erreur de base de données', 500);
  }

  // Count unread agent-initiated messages before marking them read
  const unreadCount = (messages ?? []).filter(
    (m: any) => m.agent_initiated && !m.is_read
  ).length;

  // Mark all agent-initiated messages as read (fire-and-forget)
  if (unreadCount > 0) {
    supabase
      .from('chantier_assistant_messages')
      .update({ is_read: true })
      .eq('chantier_id', chantierId)
      .eq('agent_initiated', true)
      .eq('is_read', false)
      .then(() => {})
      .catch(() => {});
  }

  return jsonOk({
    messages: messages ?? [],
    unread_count: unreadCount,
  });
};
