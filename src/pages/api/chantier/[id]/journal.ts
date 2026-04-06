export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

// ── GET — journal entries for a chantier ────────────────────────────────────
// ?date=2026-04-07         → single page (or latest if omitted)
// ?from=2026-04-01&to=2026-04-07 → range (for calendar dots)

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  // Range mode — return compact entries for calendar
  if (from && to) {
    const { data, error } = await ctx.supabase
      .from('chantier_journal')
      .select('journal_date, alerts_count, max_severity')
      .eq('chantier_id', params.id!)
      .gte('journal_date', from)
      .lte('journal_date', to)
      .order('journal_date', { ascending: true });

    if (error) return jsonError(error.message, 500);
    return jsonOk({ entries: data ?? [] });
  }

  // Single date mode
  if (date) {
    const { data, error } = await ctx.supabase
      .from('chantier_journal')
      .select('id, journal_date, body, alerts_count, max_severity, created_at, updated_at')
      .eq('chantier_id', params.id!)
      .eq('journal_date', date)
      .single();

    if (error && error.code !== 'PGRST116') return jsonError(error.message, 500);
    return jsonOk({ entry: data ?? null });
  }

  // Default — latest entry
  const { data, error } = await ctx.supabase
    .from('chantier_journal')
    .select('id, journal_date, body, alerts_count, max_severity, created_at, updated_at')
    .eq('chantier_id', params.id!)
    .order('journal_date', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') return jsonError(error.message, 500);
  return jsonOk({ entry: data ?? null });
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
