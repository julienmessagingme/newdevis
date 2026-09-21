/**
 * UN BUILD, DEUX DOMAINES, DEUX SITEMAPS — répartis par le CANONICAL des pages.
 *
 * 🔴 POURQUOI (2026-09-21, mesuré en production)
 *
 * Le même build Vercel sert `verifiermondevis.fr` et `gerermonchantier.fr`, et
 * `@astrojs/sitemap` ne connaît qu'un seul `site`. Conséquences mesurées :
 *
 *   • le sitemap de VMD déclarait **18 pages dont le canonical pointe vers GMC** :
 *     on soumettait, dans la propriété VMD, des pages qui disent appartenir
 *     ailleurs — budget de crawl dépensé pour rien ;
 *   • le fichier servi sur `gerermonchantier.fr/sitemap-0.xml` contenait
 *     **97 URLs, toutes sur verifiermondevis.fr** (c'est le même fichier), donc
 *     **aucune page GMC n'était déclarée sur son propre domaine**.
 *
 * 🔴 LA RÉPARTITION SE FAIT SUR LE CANONICAL RENDU, ET C'EST MESURÉ.
 *
 * Deux signaux plus simples ont été essayés et écartés :
 *   • « la page importe `gmc-landing/Header` » → **rate les 10 pages
 *     `/centre-aide`** et prend `/gmc-abonnement` (noindex) en trop ;
 *   • une liste de routes écrite à la main → c'est exactement ce que le
 *     sitemap manuel supprimé le même jour faisait, avec ses `lastmod` figés
 *     depuis avril.
 *
 * Le canonical, lui, est la déclaration que la page fait d'elle-même : c'est
 * ce que Google lit, et c'est donc le seul arbitre non arbitraire.
 *
 * ⚠️ UNE PAGE DONT LE CANONICAL N'EST PAS LISIBLE RESTE CÔTÉ VMD. Les pages en
 * `prerender = false` n'existent pas dans le build : on ne devine pas leur
 * domaine. Le défaut va dans le sens sûr — elles restent là où elles étaient.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const HOTE_GMC = "https://www.gerermonchantier.fr";
const NOM_SITEMAP_GMC = "sitemap-gmc.xml";

const canonicalDe = (html) =>
  html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null;

/**
 * Trouve le fichier HTML généré pour une URL du sitemap.
 * `https://site.fr/faq` → `<dist>/faq/index.html` ; la racine → `<dist>/index.html`.
 */
function fichierDe(dist, url, origine) {
  const chemin = url.replace(origine, "").replace(/^\//, "").replace(/\/$/, "");
  const f = chemin === "" ? join(dist, "index.html") : join(dist, chemin, "index.html");
  return existsSync(f) ? f : null;
}

const bloc = (url) =>
  `  <url>\n    <loc>${url}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`;

const enveloppe = (urls) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(bloc)
    .join("\n")}\n</urlset>\n`;

/**
 * @param {{ origine: string }} options `origine` = le `site` d'Astro (domaine VMD).
 * @returns {import('astro').AstroIntegration}
 */
export function sitemapDeuxDomaines({ origine }) {
  return {
    name: "sitemap-deux-domaines",
    hooks: {
      // ⚠️ Doit s'exécuter APRÈS `@astrojs/sitemap` : placer cette intégration
      // après elle dans `integrations`. Les hooks suivent l'ordre du tableau.
      "astro:build:done": ({ dir, logger }) => {
        const dist = fileURLToPath(dir);
        const fichierVmd = join(dist, "sitemap-0.xml");

        if (!existsSync(fichierVmd)) {
          // Le sitemap n'a pas été produit : on ne fabrique rien à sa place.
          logger.warn("sitemap-0.xml introuvable — répartition ignorée");
          return;
        }

        const xml = readFileSync(fichierVmd, "utf8");
        const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

        const vmd = [];
        const gmc = [];
        let sansCanonical = 0;

        for (const url of urls) {
          const f = fichierDe(dist, url, origine);
          if (!f) {
            // Page SSR : absente du build, domaine indevinable → on la laisse
            // où elle était plutôt que de la faire disparaître.
            sansCanonical++;
            vmd.push(url);
            continue;
          }
          const c = canonicalDe(readFileSync(f, "utf8"));
          if (!c) {
            sansCanonical++;
            vmd.push(url);
          } else if (c.startsWith(HOTE_GMC)) {
            // On déclare l'URL **canonique** de la page, pas celle sous laquelle
            // le build l'a rangée : c'est l'adresse que la page revendique.
            gmc.push(c);
          } else {
            vmd.push(url);
          }
        }

        // ⚠️ On ne réécrit RIEN si la répartition ne trouve aucune page GMC :
        // soit il n'y en a pas, soit la lecture des canonicals a échoué — dans
        // les deux cas, le sitemap existant est meilleur qu'un sitemap refait
        // sur une mesure vide.
        if (gmc.length === 0) {
          logger.info("aucune page d'un autre domaine — sitemap inchangé");
          return;
        }

        // Le sitemap VMD garde sa structure d'origine : on retire les blocs
        // <url> des pages qui ne lui appartiennent pas, sans toucher au reste
        // (lastmod, en-tête, namespace) que `@astrojs/sitemap` a écrit.
        const gardees = new Set(vmd);
        const xmlVmd = xml.replace(
          /[ \t]*<url>[\s\S]*?<\/url>\n?/g,
          (b) => (gardees.has(b.match(/<loc>([^<]+)<\/loc>/)?.[1]) ? b : "")
        );
        writeFileSync(fichierVmd, xmlVmd, "utf8");
        writeFileSync(join(dist, NOM_SITEMAP_GMC), enveloppe(gmc), "utf8");

        logger.info(
          `réparti : ${vmd.length} URLs pour ${origine.replace("https://www.", "")}, ` +
            `${gmc.length} pour gerermonchantier.fr` +
            (sansCanonical ? ` (${sansCanonical} sans canonical lisible, laissées côté VMD)` : "")
        );
      },
    },
  };
}
