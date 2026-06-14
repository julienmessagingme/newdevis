import { defineConfig, configDefaults } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Tests unitaires (logique pure). Resout l'alias '@' -> src comme le tsconfig/astro.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [
      ...configDefaults.exclude,
      // Tests "standalone" historiques : harness maison (console.log + check()), lances via
      // `npx tsx <fichier>`, sans describe/it -> incompatibles vitest. A migrer un jour (TODO Etape 10).
      'src/lib/analyse/verdictEngine.test.ts',
      'src/lib/auth/advancedPlanningAccess.test.ts',
      'src/lib/chantier/planningUtils.subphases.test.ts',
    ],
  },
});
