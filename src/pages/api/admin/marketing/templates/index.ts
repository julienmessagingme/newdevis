export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, createServiceClient } from '@/lib/api/apiHelpers';
import { requireAdmin } from '@/lib/auth/adminAuth';

export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const product = url.searchParams.get('product');
  const narrativeType = url.searchParams.get('narrative_type');
  const macroFormat = url.searchParams.get('macro_format');
  const platform = url.searchParams.get('platform');
  const mood = url.searchParams.get('mood');

  try {
    const sb = createServiceClient();

    // V3 : on bascule sur un SELECT direct au lieu du RPC get_marketing_templates
    // pour récupérer les nouveaux champs macro_format + platform (cf. plan §5).
    // Le RPC peut rester pour la compat ascendante mais ne connaît pas ces colonnes.
    const { data, error } = await sb
      .schema('marketing')
      .from('script_templates')
      .select(
        'id, product, narrative_type, macro_format, platform, format_size, ' +
        'title, mood, is_active, total_uses, slides, preview_urls, preview_regen_at'
      )
      .order('id', { ascending: false });

    if (error) {
      console.error('[marketing/templates] select error:', error.message, error.code, error.details);
      return jsonError(error.message || 'Erreur Supabase', 500);
    }

    let templates = ((data as unknown as Record<string, unknown>[] | null) ?? []).map((t) => ({
      id: t.id,
      product: t.product,
      narrative_type: t.narrative_type,
      macro_format: t.macro_format ?? null,
      platform: t.platform ?? null,
      format_size: t.format_size,
      title: t.title,
      mood: t.mood,
      is_active: t.is_active,
      total_uses: (t.total_uses as number) ?? 0,
      slides: t.slides,
      preview_urls: t.preview_urls ?? null,
      preview_regen_at: t.preview_regen_at ?? null,
      last_usage: null,
      cooldown_until: {},
    }));

    // Le dashboard ne montre que les carrousels V3 (macro_format renseigné).
    // Les ~100 anciens templates pré-V3 restent en base mais sont masqués
    // de la liste — ils ne sont ni rendus ni utilisés par le pipeline actuel.
    templates = templates.filter((t) => t.macro_format !== null);

    if (product) templates = templates.filter((t) => t.product === product);
    if (narrativeType) templates = templates.filter((t) => t.narrative_type === narrativeType);
    if (mood) templates = templates.filter((t) => t.mood === mood);
    if (macroFormat) {
      if (macroFormat === 'any') {
        templates = templates.filter((t) => t.macro_format !== null);
      } else {
        templates = templates.filter((t) => t.macro_format === macroFormat);
      }
    }
    if (platform) templates = templates.filter((t) => t.platform === platform);

    return jsonOk({ templates });
  } catch (err) {
    const msg = err instanceof Error ? err.message
      : (typeof err === 'object' && err && 'message' in err) ? String((err as { message: unknown }).message)
      : 'Erreur inconnue';
    console.error('[marketing/templates] catch:', msg);
    return jsonError(msg, 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
