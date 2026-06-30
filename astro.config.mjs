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
      filter: (page) =>
        !page.includes('/admin/') &&
        !page.includes('/auth/') &&
        !page.includes('/api/') &&
        !page.includes('/parametres') &&
        !page.includes('/connexion') &&
        !page.includes('/inscription') &&
        !page.includes('/reset-password') &&
        !page.includes('/mot-de-passe-oublie') &&
        !page.includes('/tableau-de-bord') &&
        !page.includes('/nouvelle-analyse') &&
        !page.includes('/analyse/') &&
        !page.includes('/comparateur/') &&
        !page.includes('/espace-artisan/'),
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
