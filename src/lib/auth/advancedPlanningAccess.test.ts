/**
 * Tests — habilitation planning avancé (étape 1bis).
 * Exécuter : npx tsx src/lib/auth/advancedPlanningAccess.test.ts
 */
import { getAdvancedPlanningAccess } from './advancedPlanningAccess';

let passed = 0, failed = 0;
function eq(a: unknown, b: unknown, msg: string) {
  if (a === b) passed++;
  else { failed++; console.error(`  FAIL: ${msg} (got ${String(a)} / expected ${String(b)})`); }
}

/** Faux client : pilote le rôle admin et l'email renvoyé par auth.admin.getUserById. */
function fakeSupabase(opts: { adminRole?: boolean; email?: string | null }) {
  const result = { data: opts.adminRole ? { role: 'admin' } : null, error: null };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => result,
  };
  return {
    from: () => chain,
    auth: { admin: { getUserById: async () => ({ data: { user: { email: opts.email ?? null } }, error: null }) } },
  } as unknown as Parameters<typeof getAdvancedPlanningAccess>[0];
}

(async () => {
  // Admin → toujours allowed, peu importe l'email
  {
    const r = await getAdvancedPlanningAccess(fakeSupabase({ adminRole: true, email: 'rand@x.fr' }), 'u1');
    eq(r.allowed, true, 'admin allowed'); eq(r.reason, 'admin', 'admin reason');
  }
  // Allowlist via getUserById (email non passé en argument)
  {
    const r = await getAdvancedPlanningAccess(fakeSupabase({ adminRole: false, email: 'julien@messagingme.fr' }), 'u2');
    eq(r.allowed, true, 'beta (via getUserById) allowed'); eq(r.reason, 'beta', 'beta reason');
  }
  // Allowlist via email passé en argument (getUserById non sollicité)
  {
    const r = await getAdvancedPlanningAccess(fakeSupabase({ adminRole: false, email: null }), 'u3', 'bridey.johan@gmail.com');
    eq(r.allowed, true, 'beta (email arg) allowed'); eq(r.reason, 'beta', 'beta reason arg');
  }
  // Allowlist insensible à la casse
  {
    const r = await getAdvancedPlanningAccess(fakeSupabase({ adminRole: false, email: null }), 'u4', 'Julien@MessagingMe.FR');
    eq(r.allowed, true, 'beta casse-insensible allowed');
  }
  // Non habilité (email aléatoire, pas admin)
  {
    const r = await getAdvancedPlanningAccess(fakeSupabase({ adminRole: false, email: 'random@example.com' }), 'u5');
    eq(r.allowed, false, 'denied allowed=false'); eq(r.reason, 'denied', 'denied reason');
  }
  // Non habilité avec email argument aléatoire
  {
    const r = await getAdvancedPlanningAccess(fakeSupabase({ adminRole: false, email: null }), 'u6', 'nope@nope.com');
    eq(r.allowed, false, 'denied (email arg) allowed=false');
  }

  console.log(`\nadvancedPlanningAccess.test — ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
