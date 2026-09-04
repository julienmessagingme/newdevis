export const prerender = false;

/**
 * POST /api/track/visit
 *
 * Mesure d'audience first-party. Appelée par le beacon de `BaseLayout.astro`
 * à chaque chargement de page.
 *
 * Pourquoi elle existe (demande Johan, 2026-09-04) : GA4 ne compte que les
 * visiteurs qui ont accepté les cookies. Rapporter nos analyses — comptées à
 * 100 % en base — à ce dénominateur amputé donnerait un taux de conversion
 * faussement flatteur. Pour un funnel, les deux bouts doivent être mesurés de
 * la même façon.
 *
 * RGPD : aucun cookie, aucun identifiant persistant. L'empreinte du visiteur
 * est un SHA-256 de (IP + user-agent + sel + JOUR) : elle CHANGE chaque jour,
 * ne permet aucun suivi dans le temps, et ni l'IP ni le user-agent ne sont
 * conservés. C'est la méthode « analytics sans cookie » reconnue par la CNIL
 * comme exemptée de consentement pour la seule mesure d'audience.
 */

import type { APIRoute } from "astro";
import { createServiceClient, optionsResponse } from "@/lib/api/apiHelpers";

/** Le sel empêche de reconstituer une IP par force brute depuis un hash. */
const SEL = import.meta.env.AGENT_SECRET_KEY ?? "vmd-audience";

/** Chemins jamais comptés : l'équipe, et les routes techniques. */
const EXCLUS = [/^\/admin/, /^\/api\//, /^\/auth\//];

async function empreinteDuJour(ip: string, ua: string): Promise<string> {
  const jour = new Date().toISOString().slice(0, 10);
  const donnees = new TextEncoder().encode(`${ip}|${ua}|${SEL}|${jour}`);
  const digest = await crypto.subtle.digest("SHA-256", donnees);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const POST: APIRoute = async ({ request }) => {
  // Une mesure d'audience ne doit JAMAIS faire échouer une page : toute erreur
  // est avalée et répond 204.
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const rawPath = String(body?.path ?? "/");
    // On coupe la query string : elle peut porter des données personnelles
    // (utm, email en clair dans un lien mal formé…).
    const path = rawPath.split("?")[0].split("#")[0].slice(0, 200) || "/";

    if (EXCLUS.some((re) => re.test(path))) {
      return new Response(null, { status: 204 });
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "inconnue";
    const ua = request.headers.get("user-agent") ?? "";

    // Les robots déclarés ne sont pas des visiteurs.
    if (/bot|crawl|spider|slurp|headless|preview|monitor|curl|wget/i.test(ua)) {
      return new Response(null, { status: 204 });
    }

    const site = String(body?.site ?? "vmd") === "gmc" ? "gmc" : "vmd";

    const supabase = createServiceClient();
    await supabase.from("site_visits").insert({
      visitor_hash: await empreinteDuJour(ip, ua),
      path,
      site,
    });
  } catch (e) {
    console.error("[track/visit]", e instanceof Error ? e.message : e);
  }
  return new Response(null, { status: 204 });
};

export const OPTIONS: APIRoute = () => optionsResponse("POST,OPTIONS");
