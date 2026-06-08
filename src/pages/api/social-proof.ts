export const prerender = false;

import type { APIRoute } from 'astro';
import { CORS, createServiceClient } from '@/lib/api/apiHelpers';

/**
 * GET /api/social-proof
 *
 * Endpoint public anonymisé qui alimente le widget social proof de la home VMD.
 * Aucune authentification requise — données déjà anonymisées (zéro PII).
 *
 * Retour :
 *   {
 *     total_count: 312,
 *     recent: [
 *       { minutes_ago: 12, work_type: "Rénovation salle de bain", verdict: "VERT" },
 *       { minutes_ago: 87, work_type: "Cuisine équipée", verdict: "ORANGE" },
 *       ...
 *     ]
 *   }
 *
 * Données RGPD-safe :
 *   - Pas de user_id, pas d'email, pas de nom artisan, pas de montant exact
 *   - work_type = catégorie générique sélectionnée par l'user à l'upload
 *   - verdict = VERT / ORANGE / ROUGE (3 buckets, pas le verdict détaillé)
 *   - minutes_ago = arrondi à la minute, max affiché "il y a 7 jours"
 *
 * Cache : Cache-Control public 60s + s-maxage=60 pour ne pas marteler la DB.
 * Une analyse créée maintenant apparaît dans le widget dans ≤ 60s.
 *
 * Performance : 1 COUNT + 1 SELECT LIMIT 8 sur index `created_at DESC` → < 30 ms.
 */

const RECENT_LIMIT = 8;
const FRESHNESS_DAYS = 7;

// Mapping verdict_global (V3.3+) → bucket UI 3 couleurs.
// Couvre les 2 sets de valeurs (mono-devis + multi-devis) cf. CLAUDE.md piège
// "2 jeux de valeurs distincts pour verdict_global".
function mapVerdict(verdictGlobal: string | null | undefined): 'VERT' | 'ORANGE' | 'ROUGE' | null {
  if (!verdictGlobal) return null;
  const v = verdictGlobal.toLowerCase();
  // Set #1 — mono-devis (conclusion_ia.verdict_global)
  if (v === 'dans_la_norme') return 'VERT';
  if (v === 'eleve_justifie' || v === 'a_negocier') return 'ORANGE';
  if (v === 'a_risque') return 'ROUGE';
  // Set #2 — multi-devis (global_metrics.verdict_global)
  if (v === 'signer') return 'VERT';
  if (v === 'refuser') return 'ROUGE';
  return null;
}

// Normalisation work_type → libellé public lisible.
// L'user saisit en text libre, on garde tel quel mais on tronque.
function normalizeWorkType(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return 'Travaux de rénovation';
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 'Travaux de rénovation';
  // Cap à 60 chars + capitalize première lettre
  const truncated = trimmed.length > 60 ? trimmed.slice(0, 57) + '…' : trimmed;
  return truncated.charAt(0).toUpperCase() + truncated.slice(1);
}

export const GET: APIRoute = async () => {
  const sb = createServiceClient();

  // 1. Compteur total (analyses complétées historiquement)
  const { count: totalCount, error: countErr } = await sb
    .from('analyses')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed');

  if (countErr) {
    console.error('[social-proof] count error:', countErr.message);
  }

  // 2. Récentes (7 derniers jours, top 8)
  const sinceIso = new Date(Date.now() - FRESHNESS_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: rows, error: rowsErr } = await sb
    .from('analyses')
    .select('created_at, work_type, conclusion_ia')
    .eq('status', 'completed')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(RECENT_LIMIT);

  if (rowsErr) {
    console.error('[social-proof] recent error:', rowsErr.message);
  }

  const now = Date.now();
  const recent = (rows ?? [])
    .map((r) => {
      const createdMs = new Date(r.created_at).getTime();
      const minutesAgo = Math.max(1, Math.floor((now - createdMs) / 60000));

      // Extraction verdict depuis conclusion_ia JSONB (peut être string ou objet)
      let verdictGlobal: string | null = null;
      const ci = r.conclusion_ia as unknown;
      if (ci && typeof ci === 'object') {
        verdictGlobal = (ci as { verdict_global?: string }).verdict_global ?? null;
      }

      const verdict = mapVerdict(verdictGlobal);
      if (!verdict) return null; // Skip si verdict non parsable

      return {
        minutes_ago: minutesAgo,
        work_type: normalizeWorkType(r.work_type),
        verdict,
      };
    })
    .filter((r): r is { minutes_ago: number; work_type: string; verdict: 'VERT' | 'ORANGE' | 'ROUGE' } => r !== null);

  return new Response(
    JSON.stringify({
      total_count: totalCount ?? 0,
      recent,
    }),
    {
      status: 200,
      headers: {
        ...CORS,
        'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=120',
      },
    },
  );
};
