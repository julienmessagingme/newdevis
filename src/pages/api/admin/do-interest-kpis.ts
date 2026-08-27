export const prerender = false;

/**
 * GET /api/admin/do-interest-kpis
 *
 * Suivi du test « intérêt dommages-ouvrage » (ouvert le 2026-08-27, verdict à
 * 3 mois — décision Johan : aucun clic au bout de 3 mois = piste abandonnée).
 *
 * Le chiffre qui décide n'est pas le nombre de clics brut mais le TAUX DE CLIC
 * = clics / analyses éligibles (celles dont la conclusion porte le levier
 * `dommages_ouvrage`, soit ~25 % des devis). On calcule donc le dénominateur
 * réel depuis conclusion_ia plutôt que d'afficher un compteur hors-sol.
 *
 * Réservé aux admins (check user_roles).
 */

import type { APIRoute } from "astro";
import { jsonOk, jsonError, requireAuth, optionsResponse, createServiceClient } from "@/lib/api/apiHelpers";

/** Ouverture du test — sert à borner le dénominateur et à afficher l'échéance. */
const TEST_START = "2026-08-27T00:00:00.000Z";
const TEST_DAYS = 90;

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

  const [clicksRes, analysesRes] = await Promise.all([
    supabase.from("do_interest").select("analysis_id, user_id, montant_ht, created_at").order("created_at", { ascending: false }),
    supabase
      .from("analyses")
      .select("id, file_name, created_at, user_id, conclusion_ia")
      .eq("status", "completed")
      .gte("created_at", TEST_START),
  ]);
  if (clicksRes.error) return jsonError(`do_interest: ${clicksRes.error.message}`, 500);

  const clicks = clicksRes.data ?? [];
  const clickedIds = new Set(clicks.map((c) => c.analysis_id));

  // Dénominateur : analyses depuis l'ouverture du test dont la conclusion
  // contient le levier dommages_ouvrage (= le bloc a réellement été affiché).
  let eligibles = 0;
  const eligiblesUsers = new Set<string>();
  for (const a of analysesRes.data ?? []) {
    let leviers: Array<Record<string, unknown>> = [];
    try {
      const ci = typeof a.conclusion_ia === "string" ? JSON.parse(a.conclusion_ia) : a.conclusion_ia;
      leviers = Array.isArray(ci?.leviers) ? ci.leviers : [];
    } catch { /* conclusion illisible → non éligible */ }
    if (leviers.some((l) => l?.type === "dommages_ouvrage")) {
      eligibles++;
      if (a.user_id) eligiblesUsers.add(a.user_id);
    }
  }

  const montantCumule = clicks.reduce((s, c) => s + (Number(c.montant_ht) || 0), 0);
  const joursEcoules = Math.floor((Date.now() - new Date(TEST_START).getTime()) / 86_400_000);

  return jsonOk({
    test_start: TEST_START,
    jours_ecoules: joursEcoules,
    jours_restants: Math.max(0, TEST_DAYS - joursEcoules),
    clics: clicks.length,
    eligibles,
    utilisateurs_exposes: eligiblesUsers.size,
    taux_clic: eligibles > 0 ? Math.round((clicks.length / eligibles) * 1000) / 10 : null,
    montant_chantiers_cumule: Math.round(montantCumule),
    derniers_clics: clicks.slice(0, 10).map((c) => ({
      analysis_id: c.analysis_id,
      montant_ht: c.montant_ht,
      created_at: c.created_at,
    })),
  });
};

export const OPTIONS: APIRoute = () => optionsResponse("GET,OPTIONS");
