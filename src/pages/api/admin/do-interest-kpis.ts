export const prerender = false;

/**
 * GET /api/admin/do-interest-kpis
 *
 * Suivi des TESTS D'INTÉRÊT (dommages-ouvrage ouvert le 2026-08-27, crédit
 * travaux ouvert le 2026-08-29 — verdict à 3 mois chacun, règle Johan :
 * aucun clic au bout de 3 mois = piste abandonnée).
 *
 * Le chiffre qui décide n'est pas le nombre de clics brut mais le TAUX DE CLIC
 * = clics / affichages RÉELS. Les dénominateurs sont donc calculés :
 *   - dommages-ouvrage : analyses dont la conclusion porte le levier
 *     `dommages_ouvrage` (~25 % des devis, gros œuvre) ;
 *   - crédit : analyses ≥ 5 000 € HT portant des leviers (le bloc n'apparaît
 *     que si la section Phase 4 est rendue).
 *
 * Réservé aux admins (check user_roles).
 */

import type { APIRoute } from "astro";
import { jsonOk, jsonError, requireAuth, optionsResponse, createServiceClient } from "@/lib/api/apiHelpers";

const TESTS = {
  dommages_ouvrage: { label: "Dommages-ouvrage", start: "2026-08-27T00:00:00.000Z" },
  credit: { label: "Financement travaux", start: "2026-08-29T00:00:00.000Z" },
} as const;
const TEST_DAYS = 90;
const CREDIT_MIN_HT = 5000;

type Topic = keyof typeof TESTS;

export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;

  const { data: roleData } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleData) return jsonError("Accès refusé", 403);

  const supabase = createServiceClient();
  const oldestStart = TESTS.dommages_ouvrage.start;

  const [clicksRes, analysesRes] = await Promise.all([
    supabase.from("lead_interest").select("topic, analysis_id, user_id, montant_ht, created_at").order("created_at", { ascending: false }),
    supabase
      .from("analyses")
      .select("id, created_at, user_id, conclusion_ia, raw_text")
      .eq("status", "completed")
      .gte("created_at", oldestStart),
  ]);
  if (clicksRes.error) return jsonError(`lead_interest: ${clicksRes.error.message}`, 500);
  const clicks = clicksRes.data ?? [];

  // Dénominateurs : ce qui a RÉELLEMENT été affiché, par sujet.
  const eligibles: Record<Topic, number> = { dommages_ouvrage: 0, credit: 0 };
  const exposes: Record<Topic, Set<string>> = { dommages_ouvrage: new Set(), credit: new Set() };

  for (const a of analysesRes.data ?? []) {
    let leviers: Array<Record<string, unknown>> = [];
    try {
      const ci = typeof a.conclusion_ia === "string" ? JSON.parse(a.conclusion_ia) : a.conclusion_ia;
      leviers = Array.isArray(ci?.leviers) ? ci.leviers : [];
    } catch { /* conclusion illisible → non éligible */ }
    if (leviers.length === 0) continue;

    if (leviers.some((l) => l?.type === "dommages_ouvrage")) {
      eligibles.dommages_ouvrage++;
      if (a.user_id) exposes.dommages_ouvrage.add(a.user_id);
    }
    if (a.created_at >= TESTS.credit.start) {
      let ht = 0;
      try {
        const raw = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : a.raw_text;
        ht = Number(raw?.extracted?.totaux?.ht ?? raw?.extracted_data?.totaux?.ht ?? 0);
      } catch { /* montant inconnu → non éligible */ }
      if (ht >= CREDIT_MIN_HT) {
        eligibles.credit++;
        if (a.user_id) exposes.credit.add(a.user_id);
      }
    }
  }

  const tests = (Object.keys(TESTS) as Topic[]).map((topic) => {
    const mine = clicks.filter((c) => c.topic === topic);
    const start = TESTS[topic].start;
    const joursEcoules = Math.floor((Date.now() - new Date(start).getTime()) / 86_400_000);
    return {
      topic,
      label: TESTS[topic].label,
      test_start: start,
      jours_ecoules: joursEcoules,
      jours_restants: Math.max(0, TEST_DAYS - joursEcoules),
      clics: mine.length,
      eligibles: eligibles[topic],
      utilisateurs_exposes: exposes[topic].size,
      taux_clic: eligibles[topic] > 0 ? Math.round((mine.length / eligibles[topic]) * 1000) / 10 : null,
      montant_chantiers_cumule: Math.round(mine.reduce((s, c) => s + (Number(c.montant_ht) || 0), 0)),
      derniers_clics: mine.slice(0, 5).map((c) => ({
        analysis_id: c.analysis_id,
        montant_ht: c.montant_ht,
        created_at: c.created_at,
      })),
    };
  });

  return jsonOk({ tests });
};

export const OPTIONS: APIRoute = () => optionsResponse("GET,OPTIONS");
