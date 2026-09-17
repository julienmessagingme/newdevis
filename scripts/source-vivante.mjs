/**
 * scripts/source-vivante.mjs
 *
 * 🔴 2026-09-17 — « UNE SOURCE NOMMABLE » N'EST PAS « UNE CHAÎNE QUI COMMENCE
 *    PAR HTTP ». La règle du 15/09 (vertical clim) dit qu'une source qu'on ne
 *    peut pas citer ne compte pas. Les deux sourceurs IA la faisaient respecter
 *    par un test de FORME :
 *
 *        sources.filter(s => s.url && s.url.startsWith("http")).length >= 2
 *
 *    Vérification faite le 17/09 sur un lot complet : **21 URL citées sur 21 ne
 *    répondaient pas**. Des 404 sur des domaines réels (le modèle invente un
 *    chemin plausible), et jusqu'à `www.vertex-ai.fr` — un domaine qui n'existe
 *    pas, le modèle ayant recraché le nom du produit Google qui sert de relais
 *    à sa propre recherche. Le contrôle validait des preuves imaginaires.
 *
 *    C'est la famille d'erreur la plus fréquente de ce projet : l'indicateur
 *    mesure la forme de la chose plutôt que la chose. On interroge donc
 *    réellement chaque URL.
 *
 * ⚠️ LE 403 COMPTE, ET C'EST DÉLIBÉRÉ. Les guides de prix les plus sérieux du
 * domaine (travaux.com, ootravaux.fr) sont derrière un anti-robot et rendent
 * 403 à tout script. Les recaler ne garderait que les sites qu'on sait
 * scraper — pas ceux qui ont raison. Ce qu'on refuse, c'est le 404 (chemin
 * inventé sur un domaine réel) et le domaine introuvable (domaine inventé).
 *
 * ⚠️ ET UNE URL VIVANTE NE PROUVE PAS QUE LA VALEUR CITÉE S'Y TROUVE. Ce module
 * ferme la porte la plus grande, pas toutes : pour une valeur qu'on inscrit au
 * catalogue, la page se lit à la main. Cf. la migration du 17/09.
 */

/** Trois issues possibles pour une URL citée par un modèle. */
export async function verifierUrl(url, { timeoutMs = 15000 } = {}) {
  if (!url || !String(url).startsWith("http")) return { vivante: false, etat: "aucune URL" };
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    });
    if (res.status === 404 || res.status === 410) return { vivante: false, etat: `${res.status} — chemin inexistant` };
    return { vivante: true, etat: res.status === 200 ? "200" : `${res.status} (site protégé)` };
  } catch (err) {
    const code = err?.cause?.code ?? err?.code ?? "";
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { vivante: false, etat: "domaine INEXISTANT" };
    return { vivante: false, etat: `injoignable (${String(err.message).slice(0, 40)})` };
  }
}

/**
 * Annote chaque source sur place et rend le nombre de sources RÉELLEMENT
 * vivantes. Annoter sur place est voulu : le rapport doit pouvoir montrer
 * laquelle est morte, sinon on ne saurait pas laquelle croire.
 */
export async function compterSourcesVivantes(sources) {
  const liste = Array.isArray(sources) ? sources : [];
  for (const s of liste) Object.assign(s, await verifierUrl(s?.url));
  return liste.filter((s) => s.vivante).length;
}
