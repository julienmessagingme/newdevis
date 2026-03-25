import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://www.verifiermondevis.fr',
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }),
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
    build: {
      rollupOptions: {
        external: ['stripe', 'nodemailer'],
      },
    },
  },
});
