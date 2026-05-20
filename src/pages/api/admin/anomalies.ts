export const prerender = false;

/**
 * GET /api/admin/anomalies?days=30
 *
 * V3.4.20+ (2026-05-20) — Compteurs des "anomalies bloquantes" détectées par
 * le pipeline d'analyse, pour le dashboard admin de surveillance des bugs
 * structurels et faux positifs.
 *
 * Catégories suivies :
 *   - foreign_quote        : devis étranger détecté (V3.4.14)
 *   - estimation_courtier  : estimation courtier travaux (V3.4.20)
 *   - lookup_ambiguous     : fallback nom avec homonymes (V3.4.19)
 *   - comparison_indicative: catalogue marché sous-couvrant
 *   - radiee_confirmed     : vraie radiation via SIRET direct match (≠ fausse via fallback nom)
 *   - hard_block_refuser   : verdict refuser hard block (toutes raisons confondues)
 *   - feedback_negative    : feedbacks utilisateur négatifs (signal externe)
 *
 * Auth : Bearer JWT obligatoire + rôle admin.
 *
 * Réponse : {
 *   period: { days, since, until },
 *   total_analyses: number,
 *   anomalies: { [category]: { count, pct: number } },
 *   recent_negative_feedback_tags: { [tag]: number },  // top 7 tags V3.4.20+
 * }
 */

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireAuth } from '@/lib/api/apiHelpers';

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

export const GET: APIRoute = async ({ request, url }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  // Vérifier rôle admin
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();
  if (!roleData) return jsonError('Accès refusé', 403);

  // Période
  const daysRaw = parseInt(url.searchParams.get('days') || '', 10);
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), MAX_DAYS) : DEFAULT_DAYS;
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const since = sinceDate.toISOString();
  const until = new Date().toISOString();

  // ─── 1. Pull analyses sur la période ───────────────────────────────────────
  // On lit conclusion_ia (TEXT) + raw_text (TEXT) qui contiennent le JSON
  // sérialisé. Pour rester rapide, on ne fait pas de JSONB cast côté SQL —
  // on parse côté Node en limitant à ~5000 lignes (cap protectif).
  const { data: analyses, error: analysesError } = await (supabase as any)
    .from('analyses')
    .select('id, status, conclusion_ia, raw_text, created_at')
    .gte('created_at', since)
    .lte('created_at', until)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(5000);

  if (analysesError) {
    console.error('[api/admin/anomalies] analyses error:', analysesError.message);
    return jsonError('Erreur lors du chargement des analyses', 500);
  }

  const counters = {
    foreign_quote: 0,
    estimation_courtier: 0,
    lookup_ambiguous: 0,
    comparison_indicative: 0,
    radiee_confirmed: 0,
    hard_block_refuser: 0,
  };

  // Pour chaque analyse on parse les 2 JSON et incrémente
  for (const a of (analyses ?? []) as Array<{ conclusion_ia: string | null; raw_text: string | null }>) {
    // conclusion_ia : foreign_quote, estimation_courtier, comparison_indicative, verdict_decisionnel
    if (a.conclusion_ia) {
      try {
        const c = JSON.parse(a.conclusion_ia);
        if (c.foreign_quote) counters.foreign_quote++;
        if (c.estimation_courtier) counters.estimation_courtier++;
        if (c.comparison_indicative === true) counters.comparison_indicative++;
        if (c.verdict_decisionnel === 'refuser' || c.verdict_decisionnel === 'ne_pas_signer') {
          counters.hard_block_refuser++;
        }
      } catch { /* JSON cassé, skip */ }
    }
    // raw_text : verified.lookup_status, verified.entreprise_radiee
    if (a.raw_text) {
      try {
        const r = JSON.parse(a.raw_text);
        const verified = r.verified ?? {};
        if (verified.lookup_status === 'ambiguous') counters.lookup_ambiguous++;
        // Radiation CONFIRMÉE = entreprise_radiee=true ET lookup_status=ok
        // (sinon c'est un faux positif via fallback nom non désambigué)
        if (verified.entreprise_radiee === true && verified.lookup_status === 'ok') {
          counters.radiee_confirmed++;
        }
      } catch { /* JSON cassé, skip */ }
    }
  }

  const total = analyses?.length ?? 0;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

  // ─── 2. Tags feedback négatif sur la même période ──────────────────────────
  // Permet de croiser les pic d'anomalies tech avec les retours utilisateur.
  const { data: feedbacks } = await (supabase as any)
    .from('analysis_feedback')
    .select('tags')
    .eq('choice', 'negative')
    .gte('created_at', since)
    .lte('created_at', until);

  const tagCounts: Record<string, number> = {};
  for (const f of (feedbacks ?? []) as Array<{ tags: string[] | null }>) {
    for (const tag of f.tags ?? []) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }

  return jsonOk({
    period: { days, since, until },
    total_analyses: total,
    anomalies: {
      foreign_quote:         { count: counters.foreign_quote,         pct: pct(counters.foreign_quote) },
      estimation_courtier:   { count: counters.estimation_courtier,   pct: pct(counters.estimation_courtier) },
      lookup_ambiguous:      { count: counters.lookup_ambiguous,      pct: pct(counters.lookup_ambiguous) },
      comparison_indicative: { count: counters.comparison_indicative, pct: pct(counters.comparison_indicative) },
      radiee_confirmed:      { count: counters.radiee_confirmed,      pct: pct(counters.radiee_confirmed) },
      hard_block_refuser:    { count: counters.hard_block_refuser,    pct: pct(counters.hard_block_refuser) },
    },
    recent_negative_feedback_tags: tagCounts,
  });
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
