/**
 * test-waituntil/index.ts — Validation EdgeRuntime.waitUntil
 *
 * Endpoint de test minimaliste pour valider que EdgeRuntime.waitUntil()
 * exécute fiablement une tâche background APRÈS envoi de la réponse HTTP.
 *
 * PROTOCOLE DE TEST :
 *   1. Déployer cette function : npx supabase functions deploy test-waituntil --no-verify-jwt
 *   2. Appeler 10 fois :
 *      for i in 1..10:
 *        curl -X POST https://<project>.supabase.co/functions/v1/test-waituntil \
 *             -H "Authorization: Bearer <anon-key>"
 *   3. Observer les logs (Dashboard → Functions → test-waituntil → Logs)
 *   4. Vérifier que pour CHAQUE appel on a :
 *      - [WAITUNTIL_TEST] request_start id=...
 *      - [WAITUNTIL_TEST] response_sent id=... (envoi de la réponse HTTP)
 *      - [WAITUNTIL_TEST] background_started id=...
 *      - [WAITUNTIL_TEST] background_completed id=... (après ~10s)
 *
 * Si 10/10 → ✅ waitUntil fiable sur Supabase Edge Functions
 * Si <10/10 → ❌ besoin alternative (table queue, etc.)
 */

// Catch global pour les unhandled rejections (doc Supabase recommande)
addEventListener("unhandledrejection", (ev) => {
  // @ts-expect-error - ev.preventDefault disponible sur Deno
  console.warn("[WAITUNTIL_TEST] unhandledrejection:", ev.reason);
  // @ts-expect-error
  if (typeof ev.preventDefault === "function") ev.preventDefault();
});

interface EdgeRuntimeInterface {
  waitUntil?: (promise: Promise<unknown>) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const testId = url.searchParams.get("id") || crypto.randomUUID().slice(0, 8);
  const sleepMs = Number(url.searchParams.get("sleep_ms")) || 10_000;

  const requestStart = Date.now();
  console.log(`[WAITUNTIL_TEST] request_start id=${testId} sleep_ms=${sleepMs}`);

  // ─── Tâche background ────────────────────────────────────────────────────
  const backgroundTask = async () => {
    const bgStart = Date.now();
    console.log(`[WAITUNTIL_TEST] background_started id=${testId} delay_after_request_start=${bgStart - requestStart}ms`);
    try {
      await sleep(sleepMs);
      console.log(`[WAITUNTIL_TEST] background_completed id=${testId} actual_duration=${Date.now() - bgStart}ms`);
    } catch (err) {
      console.warn(`[WAITUNTIL_TEST] background_error id=${testId} err=${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ─── Enregistrer via EdgeRuntime.waitUntil si disponible ────────────────
  const er = (globalThis as { EdgeRuntime?: EdgeRuntimeInterface }).EdgeRuntime;
  const waitUntilAvailable = !!(er && typeof er.waitUntil === "function");

  if (waitUntilAvailable && er?.waitUntil) {
    er.waitUntil(backgroundTask());
    console.log(`[WAITUNTIL_TEST] registered_via_waituntil id=${testId}`);
  } else {
    // Fallback fire-and-forget (test du worst case sans waitUntil)
    backgroundTask().catch(err => console.warn(`[WAITUNTIL_TEST] fire_and_forget_err id=${testId} err=${err}`));
    console.log(`[WAITUNTIL_TEST] registered_via_fire_and_forget id=${testId} (EdgeRuntime.waitUntil NOT available)`);
  }

  // ─── Réponse HTTP immédiate ──────────────────────────────────────────────
  const responseBody = JSON.stringify({
    test_id: testId,
    sleep_ms: sleepMs,
    wait_until_available: waitUntilAvailable,
    instructions: "Check Supabase Functions Logs for [WAITUNTIL_TEST] background_completed id=" + testId,
  });

  const responseTime = Date.now() - requestStart;
  console.log(`[WAITUNTIL_TEST] response_sent id=${testId} response_time_ms=${responseTime}`);

  return new Response(responseBody, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
