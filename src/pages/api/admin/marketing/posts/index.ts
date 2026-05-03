export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, createServiceClient } from '@/lib/apiHelpers';
import { requireAdmin } from '@/lib/adminAuth';
import type {
  MarketingPostListItem,
  MarketingPostStatus,
  MarketingPersonaCode,
  MarketingPlatform,
} from '@/types/marketing';

const VALID_STATUSES: MarketingPostStatus[] = [
  'draft', 'pending_review', 'approved', 'scheduled',
  'publishing', 'published', 'failed', 'rejected', 'archived',
];
const VALID_PERSONAS: MarketingPersonaCode[] = [
  'particulier_travaux', 'conducteur_travaux', 'maitre_oeuvre',
  'artisan_solo', 'dirigeant_pme_btp',
];
const VALID_PLATFORMS: MarketingPlatform[] = ['facebook', 'instagram', 'tiktok', 'linkedin'];

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

function isISODate(s: string): boolean {
  // Accepte YYYY-MM-DD ou ISO 8601 complet
  return /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(s);
}

interface RawPostRow {
  id: string;
  platform: MarketingPlatform;
  persona_target: MarketingPersonaCode;
  hook: string;
  status: MarketingPostStatus;
  quality_score: number | null;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  slides: unknown;
}

interface RawCoverRow {
  post_id: string | null;
  public_url: string | null;
}

export const GET: APIRoute = async ({ request, url }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const status = url.searchParams.get('status');
  const persona = url.searchParams.get('persona');
  const platform = url.searchParams.get('platform');
  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');
  const limitRaw = url.searchParams.get('limit');

  // Validation
  if (status && !VALID_STATUSES.includes(status as MarketingPostStatus)) {
    return jsonError(`status invalide. Valeurs autorisées: ${VALID_STATUSES.join(', ')}`, 400);
  }
  if (persona && !VALID_PERSONAS.includes(persona as MarketingPersonaCode)) {
    return jsonError(`persona invalide. Valeurs autorisées: ${VALID_PERSONAS.join(', ')}`, 400);
  }
  if (platform && !VALID_PLATFORMS.includes(platform as MarketingPlatform)) {
    return jsonError(`platform invalide. Valeurs autorisées: ${VALID_PLATFORMS.join(', ')}`, 400);
  }
  if (dateFrom && !isISODate(dateFrom)) return jsonError('date_from doit être YYYY-MM-DD', 400);
  if (dateTo && !isISODate(dateTo)) return jsonError('date_to doit être YYYY-MM-DD', 400);

  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(limitRaw ?? '', 10) || DEFAULT_LIMIT));

  // service_role client + schema marketing
  const sb = createServiceClient();

  let q = sb
    .schema('marketing' as never)
    .from('posts')
    .select(
      'id, platform, persona_target, hook, status, quality_score, scheduled_at, published_at, created_at, slides',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) q = q.eq('status', status);
  if (persona) q = q.eq('persona_target', persona);
  if (platform) q = q.eq('platform', platform);
  if (dateFrom) q = q.gte('created_at', dateFrom);
  if (dateTo) {
    // Inclure toute la journée
    const inclusiveEnd = dateTo.length === 10 ? `${dateTo}T23:59:59.999Z` : dateTo;
    q = q.lte('created_at', inclusiveEnd);
  }

  const { data: posts, error } = await q;

  if (error) {
    console.error('[admin/marketing/posts] Supabase error:', error.message);
    return jsonError(`Erreur lecture posts: ${error.message}`, 500);
  }

  const rows = (posts ?? []) as RawPostRow[];

  // Récupérer les covers en un seul batch
  let coverByPostId = new Map<string, string>();
  if (rows.length > 0) {
    const ids = rows.map(r => r.id);
    const { data: covers, error: coverErr } = await sb
      .schema('marketing' as never)
      .from('assets')
      .select('post_id, public_url')
      .in('post_id', ids)
      .eq('asset_type', 'carousel_cover');

    if (coverErr) {
      console.error('[admin/marketing/posts] cover fetch error:', coverErr.message);
      // Non bloquant — on retourne sans covers
    } else {
      const coverRows = (covers ?? []) as RawCoverRow[];
      coverByPostId = new Map(
        coverRows
          .filter((c): c is RawCoverRow & { post_id: string; public_url: string } =>
            !!c.post_id && !!c.public_url,
          )
          .map(c => [c.post_id, c.public_url]),
      );
    }
  }

  const items: MarketingPostListItem[] = rows.map(p => ({
    id: p.id,
    platform: p.platform,
    persona_target: p.persona_target,
    hook: p.hook,
    status: p.status,
    quality_score: p.quality_score,
    scheduled_at: p.scheduled_at,
    published_at: p.published_at,
    created_at: p.created_at,
    cover_url: coverByPostId.get(p.id) ?? null,
    slide_count: Array.isArray(p.slides) ? p.slides.length : 0,
  }));

  return jsonOk({ posts: items, total: items.length, limit });
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
