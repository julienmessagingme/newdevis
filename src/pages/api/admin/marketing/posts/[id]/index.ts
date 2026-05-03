export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, createServiceClient } from '@/lib/apiHelpers';
import { requireAdmin } from '@/lib/adminAuth';
import type { MarketingPost, MarketingAsset, MarketingPostDetail } from '@/types/marketing';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async ({ request, params }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const id = params.id;
  if (!id || !UUID_RE.test(id)) return jsonError('id invalide (UUID requis)', 400);

  const sb = createServiceClient();

  const { data: post, error: postErr } = await sb
    .schema('marketing' as never)
    .from('posts')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (postErr) {
    console.error('[admin/marketing/posts/:id] error:', postErr.message);
    return jsonError(`Erreur lecture post: ${postErr.message}`, 500);
  }
  if (!post) return jsonError('Post introuvable', 404);

  const { data: assets, error: assetsErr } = await sb
    .schema('marketing' as never)
    .from('assets')
    .select('*')
    .eq('post_id', id)
    .order('slide_index', { ascending: true, nullsFirst: false });

  if (assetsErr) {
    console.error('[admin/marketing/posts/:id] assets error:', assetsErr.message);
    // Non bloquant — on retourne le post sans assets
  }

  const detail: MarketingPostDetail = {
    ...(post as MarketingPost),
    assets: (assets ?? []) as MarketingAsset[],
  };

  return jsonOk(detail);
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
