export const prerender = false;

/**
 * GET /api/admin/visits-kpis?days=30
 *
 * Le funnel demandé par Johan (2026-09-04) : combien de visiteurs, combien
 * d'analyses, et quel taux de conversion entre les deux.
 *
 * Les deux bouts sont mesurés de la même façon — en base, chez nous. C'est
 * tout l'intérêt : GA4 ne compte que les visiteurs ayant accepté les cookies,
 * un taux calculé sur ce dénominateur serait faussement flatteur.
 *
 * Le trafic de l'équipe est exclu à la SOURCE : le beacon ne part pas depuis
 * un navigateur marqué `vmd_internal` (posé dès la première visite d'`/admin`),
 * et la route de collecte ignore de toute façon les chemins `/admin`.
 */

import type { APIRoute } from "astro";
import { jsonOk, jsonError, requireAuth, optionsResponse, createServiceClient } from "@/lib/api/apiHelpers";

interface JourKpi {
  jour: string;
  visiteurs: number;
  pages_vues: number;
  analyses: number;
}

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

  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 7), 180);

  const supabase = createServiceClient();

  const { data: visites, error: errVisites } = await supabase.rpc("admin_visits_daily", { p_days: days });
  if (errVisites) return jsonError(`Lecture des visites impossible : ${errVisites.message}`, 500);

  // Analyses créées sur la même fenêtre, agrégées par jour UTC — même
  // découpage que les visites, sinon le rapport n'a pas de sens.
  const debut = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data: analyses } = await supabase
    .from("analyses")
    .select("created_at")
    .gte("created_at", `${debut}T00:00:00.000Z`)
    .limit(5000);

  const analysesParJour = new Map<string, number>();
  for (const a of analyses ?? []) {
    const j = String(a.created_at).slice(0, 10);
    analysesParJour.set(j, (analysesParJour.get(j) ?? 0) + 1);
  }

  // Une journée sans visite mais avec des analyses doit apparaître : on part
  // de l'union des deux séries, pas des seules visites.
  const jours = new Set<string>([
    ...(visites ?? []).map((v: Record<string, unknown>) => String(v.jour)),
    ...analysesParJour.keys(),
  ]);
  const parJour = new Map((visites ?? []).map((v: Record<string, unknown>) => [String(v.jour), v]));

  const serie: JourKpi[] = [...jours].sort().map((jour) => {
    const v = parJour.get(jour) as Record<string, unknown> | undefined;
    return {
      jour,
      visiteurs: Number(v?.visiteurs ?? 0),
      pages_vues: Number(v?.pages_vues ?? 0),
      analyses: analysesParJour.get(jour) ?? 0,
    };
  });

  const totalVisiteurs = serie.reduce((s, j) => s + j.visiteurs, 0);
  const totalAnalyses = serie.reduce((s, j) => s + j.analyses, 0);

  return jsonOk({
    days,
    serie,
    totaux: {
      visiteurs: totalVisiteurs,
      pages_vues: serie.reduce((s, j) => s + j.pages_vues, 0),
      analyses: totalAnalyses,
      // null tant qu'aucune visite n'est enregistrée : afficher « 0 % » quand
      // on n'a pas encore de données ferait croire à une conversion nulle.
      taux_conversion_pct: totalVisiteurs > 0
        ? Math.round((totalAnalyses / totalVisiteurs) * 1000) / 10
        : null,
    },
    // Le compteur démarre le jour du déploiement : avant, aucune visite n'était
    // enregistrée. L'UI doit le dire plutôt que d'afficher un historique vide.
    collecte_depuis: serie.length > 0 ? serie[0].jour : null,
  });
};

export const OPTIONS: APIRoute = () => optionsResponse("GET,OPTIONS");
