import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import { urlCanonique } from './src/lib/seo/urlCanonique.mjs';

export default defineConfig({
  site: 'https://www.verifiermondevis.fr',
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }),
    sitemap({
      // Toute URL référencée ici doit être indexable (sans balise noindex).
      // Search Console remonte sinon des alertes « Exclue par la balise noindex »
      // sur les URLs du sitemap — voir CLAUDE.md piège SEO 2026-07-19.
      filter: (page) => {
        // Zones fonctionnelles internes ou d'auth (jamais indexables)
        if (page.includes('/admin/') ||
            page.includes('/auth/') ||
            page.includes('/api/') ||
            page.includes('/parametres') ||
            page.includes('/connexion') ||
            page.includes('/inscription') ||
            page.includes('/reset-password') ||
            page.includes('/mot-de-passe-oublie') ||
            page.includes('/tableau-de-bord') ||
            // 2026-09-21 — `/mon-chantier` est en `Disallow` dans robots.txt.
            // Le déclarer au sitemap revenait à demander à Google d'indexer ce
            // qu'on lui interdit de lire : c'est NOUS qui fabriquions la ligne
            // « Bloquée par le fichier robots.txt » de Search Console (4 URLs
            // mesurées dans le sitemap servi le 21/09).
            // ⚠️ Toute nouvelle règle `Disallow` dans public/robots.txt doit
            // avoir son pendant ICI — les deux fichiers disent la même chose à
            // Google et ne peuvent pas se contredire.
            page.includes('/mon-chantier') ||
            page.includes('/nouvelle-analyse') ||
            page.includes('/analyse/') ||
            page.includes('/comparateur/') ||
            page.includes('/espace-artisan/')) {
          return false;
        }
        // Pages avec noindex explicite (utilitaires, prototypes, transactionnelles)
        // 2026-07-19 — Google Search Console remontait « Exclue par la balise
        // noindex » sur ces URLs qui étaient dans le sitemap.
        // Regex avec `\/?$` pour matcher AVEC ou SANS trailing slash (Astro
        // génère les URLs avec `/` final).
        // 2026-09-21 — `suivi-budget` ajouté. La page porte `noindex={true}`
        // depuis toujours ET figurait au sitemap : nous demandions l'indexation
        // d'une page à laquelle nous interdisons l'indexation. C'est nous qui
        // fabriquions une ligne « Exclue par la balise noindex » de Search
        // Console — le défaut même que le commentaire en tête de ce filtre
        // décrit depuis le 19/07.
        // ⚠️ Mesuré sur les 98 URLs servies : c'était la SEULE contradiction
        // de ce type ; les 29 autres pages `noindex` du projet sont déjà
        // exclues plus haut. Un `noindex` ajouté à une page du sitemap doit
        // s'accompagner d'une entrée ICI.
        // ⚠️ `\/?$` garde `/suivi-budget-travaux` — page publique distincte —
        // hors de cette exclusion.
        if (/\/(avis|beta|desinscription|gmc-abonnement|gmc-prototype|suivi-budget)\/?$/.test(page)) {
          return false;
        }
        // Catégories du centre d'aide en statut « coming_soon » — noindex tant
        // que les articles ne sont pas rédigés. Seul « artisans » est live.
        if (/\/centre-aide\/(budget|planning|documents|litiges|reception|devis|tresorerie)\/?$/.test(page)) {
          return false;
        }
        return true;
      },
      // 🔴 2026-09-21 — LE SITEMAP DÉCLARAIT UNE FORME QUE LES PAGES DÉSAVOUAIENT.
      //
      // `@astrojs/sitemap` écrit les URLs avec un slash final (`/faq/`), alors
      // que le canonical de chaque page dit `/faq` et que nos 325 liens internes
      // pointent tous vers cette même forme. Mesuré sur les 98 URLs servies :
      // **97 pages sur 97** répondaient 200 dans les DEUX formes, avec un
      // contenu identique à l'octet près et AUCUNE redirection — une duplication
      // que nous fabriquions nous-mêmes, et qui alimentait les lignes
      // « Page en double » et « Autre page avec balise canonique correcte » de
      // Search Console.
      //
      // ⚠️ On ne touche PAS à `trailingSlash` d'Astro : le routage sert
      // aujourd'hui les deux formes en 200 et le changer aurait un effet bien
      // au-delà du sitemap. Ici on corrige la seule chose qui était fausse —
      // la liste qu'on soumet à Google.
      //
      // ⚠️ La règle est IMPORTÉE, jamais recopiée : c'est sa duplication entre
      // `BaseLayout` et ce fichier qui a produit le défaut.
      serialize: (item) => ({ ...item, url: urlCanonique(item.url) }),
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
    }),
  ],
  output: 'static',
  adapter: vercel(),
  security: {
    checkOrigin: false, // Required for external webhooks (SendGrid Inbound Parse, Stripe)
  },
  vite: {
    resolve: {
      alias: {
        '@': '/src',
      },
    },
    ssr: {
      external: ['stripe', 'nodemailer'],
    },
    optimizeDeps: {
      include: ['lucide-react'],
    },
    build: {
      rollupOptions: {
        external: ['stripe', 'nodemailer'],
      },
    },
  },
});
