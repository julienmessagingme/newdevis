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

/**
 * Normalise un hôte pour la COMPARAISON : minuscules, sans `www.`, **et sans
 * le port**.
 *
 * ⚠️ Le `www.` d'abord — sinon notre propre site se compte comme un référent
 * externe une fois sur deux. Le PORT ensuite, et ce n'est pas théorique : le
 * header `Host` le porte (`localhost:4321`) alors que `new URL(ref).hostname`
 * ne le porte jamais. Sans cette coupe, toute navigation interne en
 * développement ressort en référent externe « localhost » — défaut vu au
 * témoin du 14/09, pas à la relecture.
 */
const hoteNormalise = (h: string) => h.toLowerCase().replace(/^www\./, "").split(":")[0];

/**
 * 2026-09-14 — PROVENANCE : l'HÔTE du référent, jamais l'URL complète.
 *
 * Une URL de référent porte régulièrement la requête de recherche tapée par
 * la personne, et parfois pire sur un lien mal formé. L'hôte seul répond à la
 * question posée (« ce trafic vient d'où ? ») sans rien en dire de plus.
 *
 * Trois valeurs particulières, et elles comptent :
 *   · `(interne)` — navigation depuis nos propres pages. Écarté du calcul de
 *     provenance à la lecture : une fois entré, le visiteur se référence
 *     lui-même à chaque clic et écraserait sa vraie source.
 *   · `(aucun)` — referrer vide. ⚠️ Ce N'EST PAS « accès direct » : ça mélange
 *     le direct, les applications, les clients mail et les navigateurs qui
 *     suppriment le référent. Ne jamais l'étiqueter autrement.
 *   · `null` — rien n'a été transmis (vieux navigateur, beacon tronqué).
 */
function hoteDuReferent(brut: unknown, hoteDuSite: string | null): string | null {
  if (typeof brut !== "string") return null;
  if (brut.trim() === "") return "(aucun)";
  try {
    const hote = new URL(brut).hostname;
    if (!hote) return "(aucun)";
    if (hoteDuSite && hoteNormalise(hote) === hoteNormalise(hoteDuSite)) return "(interne)";
    return hoteNormalise(hote).slice(0, 120);
  } catch {
    // Un référent illisible n'est pas une provenance : on ne devine pas.
    return null;
  }
}

/**
 * `utm_source` SEUL, extrait de la query string — qui reste par ailleurs
 * intégralement écartée (elle peut porter des données personnelles).
 * C'est le seul moyen de reconnaître le trafic payant : aucun référent ne
 * distingue un clic d'annonce d'un clic organique.
 */
function sourceDeCampagne(url: unknown): string | null {
  if (typeof url !== "string" || !url.includes("utm_source")) return null;
  const brut = new URLSearchParams(url.slice(url.indexOf("?") + 1)).get("utm_source");
  const valeur = brut?.trim().toLowerCase().slice(0, 60);
  return valeur ? valeur : null;
}

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
      // ⚠️ La provenance vient du CORPS, pas de l'en-tête `Referer` : celui-ci
      // porte notre propre page, celle qui émet le beacon. Seul
      // `document.referrer`, lu côté navigateur, donne la page précédente.
      referrer_host: hoteDuReferent(body?.ref, request.headers.get("host")),
      utm_source: sourceDeCampagne(body?.url),
    });
  } catch (e) {
    console.error("[track/visit]", e instanceof Error ? e.message : e);
  }
  return new Response(null, { status: 204 });
};

export const OPTIONS: APIRoute = () => optionsResponse("POST,OPTIONS");
