export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, createServiceClient } from '@/lib/api/apiHelpers';
import { requireAdmin } from '@/lib/auth/adminAuth';

/**
 * POST /api/admin/marketing/templates/{id}/mark-regen
 *
 * Marque un template pour régénération de ses previews carousels.
 * Set `marketing.script_templates.preview_regen_at = now()`.
 *
 * Le script `scripts/regen_pending.mjs` côté gerermonchantier-marketing
 * scan tous les templates avec preview_regen_at IS NOT NULL, les re-render,
 * uploade les PNGs sur B2 et clear le flag.
 */
export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const id = params.id;
  if (!id) return jsonError('Missing template id', 400);
  const numId = parseInt(id, 10);
  if (Number.isNaN(numId)) return jsonError('Invalid template id', 400);

  try {
    const sb = createServiceClient();
    const { data, error } = await (sb as unknown as { schema: (s: string) => { from: (t: string) => { update: (u: Record<string, unknown>) => { eq: (k: string, v: unknown) => { select: (cols: string) => { single: () => Promise<{ data: unknown; error: unknown }> } } } } } })
      .schema('marketing')
      .from('script_templates')
      .update({ preview_regen_at: new Date().toISOString() })
      .eq('id', numId)
      .select('id, title, preview_regen_at')
      .single();

    if (error) {
      const err = error as { message?: string; code?: string };
      console.error('[mark-regen] error:', err.message, err.code);
      return jsonError(err.message || 'Erreur Supabase', 500);
    }
    if (!data) return jsonError('Template non trouvé', 404);

    return jsonOk({ template: data, message: 'Marqué pour régénération' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error('[mark-regen] catch:', msg);
    return jsonError(msg, 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
