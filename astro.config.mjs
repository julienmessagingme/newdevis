import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

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
        if (/\/(avis|beta|desinscription|gmc-abonnement|gmc-prototype)\/?$/.test(page)) {
          return false;
        }
        // Catégories du centre d'aide en statut « coming_soon » — noindex tant
        // que les articles ne sont pas rédigés. Seul « artisans » est live.
        if (/\/centre-aide\/(budget|planning|documents|litiges|reception|devis|tresorerie)\/?$/.test(page)) {
          return false;
        }
        return true;
      },
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
