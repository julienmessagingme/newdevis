export const prerender = false;

/**
 * POST /api/track/event
 *
 * 2026-09-07 (décision Johan) — mesurer l'USAGE des calculettes, pas seulement
 * les visites de leur page, pour trancher dans 30 jours.
 *
 * Une calculette qu'on ouvre et qu'on referme sans rien calculer n'a aucune
 * valeur : c'est exactement la question posée. `site_visits` compte les
 * arrivées, cette route compte les résultats effectivement produits.
 *
 * ⚠️ ALLOWLIST OBLIGATOIRE. La route est publique et non authentifiée : sans
 * liste fermée de noms d'événements, elle deviendrait un journal ouvert où
 * n'importe qui écrit ce qu'il veut. Ajouter un événement ici est un acte
 * délibéré, pas un effet de bord.
 *
 * RGPD : même régime que /api/track/visit — aucun cookie, empreinte serveur
 * rotative quotidienne, ni IP ni user-agent conservés. Et surtout : AUCUNE
 * donnée saisie dans la calculette n'est transmise (ni code postal, ni surface,
 * ni type de travaux), seulement le fait qu'un calcul a eu lieu.
 */

import type { APIRoute } from "astro";
import { createServiceClient, optionsResponse } from "@/lib/api/apiHelpers";

/** Le sel empêche de reconstituer une IP par force brute depuis un hash. */
const SEL = import.meta.env.AGENT_SECRET_KEY ?? "vmd-audience";

/**
 * Les seuls événements acceptés. Chaque entrée doit correspondre à un geste
 * utilisateur qui produit un résultat visible — pas à une ouverture de page,
 * que `site_visits` mesure déjà.
 */
const EVENEMENTS_AUTORISES = new Set([
  "calculette_travaux_calcul",
  "simulateur_valorisation_calcul",
  "simulateur_aides_calcul",
  // 2026-09-13 — AFFICHAGES des sondages d'intérêt. Ce sont les seules
  // entrées de cette liste qui ne correspondent pas à un geste de
  // l'utilisateur, et c'est délibéré : sans elles, le taux de réponse n'a
  // pas de DÉNOMINATEUR. Le test ouvert le 29/08 comptait ses clics sans
  // savoir combien de personnes avaient vu la question — le seuil de
  // décision de 15 % était donc incalculable.
  "sondage_do_vu",
  "sondage_credit_vu",
  // 2026-09-13 — « a commencé à remplir le formulaire d'inscription ». Sans
  // lui, on sait qui ARRIVE sur /inscription et qui TERMINE, jamais qui
  // essaie : impossible de separer « reparti devant le mur » de « a renoncé
  // devant les champs », donc impossible de savoir s'il faut toucher aux
  // champs. Mesuré le 13/09 : 51 arrivées, 22 comptes créés.
  "inscription_formulaire_commence",
]);

async function empreinteDuJour(ip: string, ua: string): Promise<string> {
  const jour = new Date().toISOString().slice(0, 10);
  const donnees = new TextEncoder().encode(`${ip}|${ua}|${SEL}|${jour}`);
  const digest = await crypto.subtle.digest("SHA-256", donnees);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const POST: APIRoute = async ({ request }) => {
  // Une mesure ne doit JAMAIS faire échouer une interaction : toute erreur est
  // avalée et la route répond 204.
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const event = String(body?.event ?? "");
    if (!EVENEMENTS_AUTORISES.has(event)) {
      return new Response(null, { status: 204 });
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "inconnue";
    const ua = request.headers.get("user-agent") ?? "";

    // Les robots déclarés ne sont pas des utilisateurs.
    if (/bot|crawl|spider|slurp|headless|preview|monitor|curl|wget/i.test(ua)) {
      return new Response(null, { status: 204 });
    }

    const site = String(body?.site ?? "vmd") === "gmc" ? "gmc" : "vmd";

    const supabase = createServiceClient();
    await supabase.from("site_events").insert({
      visitor_hash: await empreinteDuJour(ip, ua),
      event,
      site,
    });
  } catch (e) {
    console.error("[track/event]", e instanceof Error ? e.message : e);
  }
  return new Response(null, { status: 204 });
};

export const OPTIONS: APIRoute = () => optionsResponse("POST,OPTIONS");
