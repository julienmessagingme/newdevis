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
  vite: {
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  },
});
