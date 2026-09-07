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

interface OutilKpi {
  cle: string;
  libelle: string;
  /** Chemin de la page, `null` quand l'outil n'en a pas (fenêtre modale). */
  path: string | null;
  /** Visiteurs uniques de la page — `null` si l'outil n'a pas de page à lui. */
  visiteurs: number | null;
  /** Calculs effectivement produits sur la période. */
  calculs: number;
  /** Personnes distinctes ayant produit au moins un calcul. */
  personnes: number;
}

/** Les trois outils en observation, avec le chemin qui leur correspond. */
const OUTILS: Array<{ cle: string; libelle: string; path: string | null; event: string }> = [
  {
    cle: "calculette",
    libelle: "Calculette de travaux",
    path: "/calculette-travaux",
    event: "calculette_travaux_calcul",
  },
  {
    cle: "valorisation",
    libelle: "Simulateur de valorisation",
    path: "/simulateur-valorisation-travaux",
    event: "simulateur_valorisation_calcul",
  },
  {
    cle: "aides",
    libelle: "Simulateur d'aides",
    path: null, // carte de la page d'accueil, pas de page dédiée
    event: "simulateur_aides_calcul",
  },
];

/**
 * Usage des calculettes : visiteurs de la page ET calculs aboutis.
 *
 * Best-effort : tant que la migration `20260907220000_site_events.sql` n'est
 * pas appliquée, les RPC sont absentes — on renvoie des zéros plutôt que de
 * faire échouer tout l'écran des KPI pour une section secondaire.
 */
async function lireUsageOutils(
  supabase: ReturnType<typeof createServiceClient>,
  days: number,
): Promise<OutilKpi[]> {
  const paths = OUTILS.map((o) => o.path).filter((p): p is string => p !== null);

  const [usage, visites] = await Promise.all([
    supabase.rpc("admin_events_usage", { p_days: days }),
    supabase.rpc("admin_visits_by_path", { p_days: days, p_paths: paths }),
  ]);

  const parEvent = new Map(
    (usage.data ?? []).map((r: Record<string, unknown>) => [String(r.event), r]),
  );
  const parPath = new Map(
    (visites.data ?? []).map((r: Record<string, unknown>) => [String(r.path), r]),
  );

  return OUTILS.map((o) => {
    const u = parEvent.get(o.event) as Record<string, unknown> | undefined;
    const v = o.path ? (parPath.get(o.path) as Record<string, unknown> | undefined) : undefined;
    return {
      cle: o.cle,
      libelle: o.libelle,
      path: o.path,
      visiteurs: o.path ? Number(v?.visiteurs ?? 0) : null,
      calculs: Number(u?.occurrences ?? 0),
      personnes: Number(u?.personnes ?? 0),
    };
  });
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

  // ── Usage des calculettes (2026-09-07, décision Johan) ────────────────────
  //
  // On garde les calculettes 30 jours et on tranche sur ce tableau. Deux
  // chiffres par outil, et il FAUT les deux : les visiteurs de la page disent
  // si on y arrive, les calculs disent si on s'en sert. Une page très visitée
  // sans aucun calcul et une page jamais atteinte appellent des décisions
  // opposées — la première déçoit, la seconde est mal exposée.
  //
  // Le simulateur d'aides n'a pas de page à lui : c'est une carte de la page
  // d'accueil qui ouvre une fenêtre. Son nombre de visiteurs est donc `null`,
  // pas zéro — on ne l'a pas mesuré, il n'est pas nul.
  const outils = await lireUsageOutils(supabase, days);

  return jsonOk({
    days,
    serie,
    outils,
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
