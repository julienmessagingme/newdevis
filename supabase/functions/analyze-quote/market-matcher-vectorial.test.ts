/**
 * market-matcher-vectorial.test.ts — Tests Phase C.4 du chantier vectorisation.
 *
 * Couverture :
 *   - classifyConfidence : seuils 0.50 / 0.70 / 0.85
 *   - buildQueryEmbeddingText : format à embedder (sans amount_ht)
 *   - toPgVector : format pgvector "[v1,v2,...]"
 *   - matchSingleLineVectorial : 3 scenarios (high / low / no_match)
 *   - lookupMarketPricesVectorial : end-to-end avec mocks
 *
 * Exécution :
 *   npx tsx supabase/functions/analyze-quote/market-matcher-vectorial.test.ts
 *
 * Note : les tests d'intégration réelle (vrai Gemini + vraie RPC) sont en
 * Phase E (shadow run sur 50 devis), pas ici.
 */

import {
  classifyConfidence,
  buildQueryEmbeddingText,
  toPgVector,
  matchSingleLineVectorial,
  lookupMarketPricesVectorial,
  type VectorialJobTypePriceResult,
} from "./market-matcher-vectorial.ts";
import type { WorkItemFull } from "./market-prices.ts";

let passed = 0, failed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  const result = fn();
  if (result instanceof Promise) {
    return result.then(
      () => { console.log(`  ✓ ${name}`); passed++; },
      (e) => { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); failed++; },
    );
  }
  try { console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); failed++; }
}
function assertEq<T>(actual: T, expected: T, msg = "") {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${msg}\n      expected: ${JSON.stringify(expected)}\n      got:      ${JSON.stringify(actual)}`);
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

console.log("\n[market-matcher-vectorial.test.ts — V3.5.0 Phase C.4]\n");

// ─────────────────────────────────────────────────────────────────────────────
// classifyConfidence — seuils
// ─────────────────────────────────────────────────────────────────────────────
console.log("[classifyConfidence]");

test("0.95 → high", () => assertEq(classifyConfidence(0.95), "high"));
test("0.85 → high (limite inférieure)", () => assertEq(classifyConfidence(0.85), "high"));
test("0.84 → medium", () => assertEq(classifyConfidence(0.84), "medium"));
test("0.70 → medium (limite inférieure)", () => assertEq(classifyConfidence(0.70), "medium"));
test("0.69 → low", () => assertEq(classifyConfidence(0.69), "low"));
test("0.50 → low (limite inférieure)", () => assertEq(classifyConfidence(0.50), "low"));
test("0.49 → no_match", () => assertEq(classifyConfidence(0.49), "no_match"));
test("null → no_match", () => assertEq(classifyConfidence(null), "no_match"));
test("NaN → no_match", () => assertEq(classifyConfidence(Number.NaN), "no_match"));

// ─────────────────────────────────────────────────────────────────────────────
// buildQueryEmbeddingText
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[buildQueryEmbeddingText]");

test("description seule", () => {
  const t = buildQueryEmbeddingText({
    description: "Pose carrelage sol",
    category: null,
    amount_ht: 500,
    quantity: 10,
    unit: null,
  });
  assertEq(t, "Pose carrelage sol");
});

test("description + catégorie + unité", () => {
  const t = buildQueryEmbeddingText({
    description: "Pose carrelage sol",
    category: "carrelage",
    amount_ht: 500,
    quantity: 10,
    unit: "m²",
  });
  assertEq(t, "Pose carrelage sol. Catégorie : carrelage. Unité : m²");
});

test("catégorie 'autre' ignorée (n'apporte rien à la sémantique)", () => {
  const t = buildQueryEmbeddingText({
    description: "Divers travaux",
    category: "autre",
    amount_ht: 200,
    quantity: 1,
    unit: "u",
  });
  assertEq(t, "Divers travaux. Unité : u");
});

test("amount_ht jamais inclus (contamination prix)", () => {
  const t = buildQueryEmbeddingText({
    description: "Peinture",
    category: "peinture",
    amount_ht: 99999,
    quantity: 1,
    unit: null,
  });
  assert(!t.includes("99999"), "amount ne doit pas apparaître dans le texte embed");
  assert(!t.includes("€"), "symbole euro ne doit pas apparaître");
});

// ─────────────────────────────────────────────────────────────────────────────
// toPgVector
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[toPgVector]");

test("array 3 floats → '[v1,v2,v3]'", () => {
  assertEq(toPgVector([0.1, -0.45, 0.99]), "[0.1,-0.45,0.99]");
});

test("array vide → '[]'", () => {
  assertEq(toPgVector([]), "[]");
});

// ─────────────────────────────────────────────────────────────────────────────
// matchSingleLineVectorial — mocked supabase + globals fetch
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[matchSingleLineVectorial]");

/** Mock fetch global pour le call Gemini embedContent. */
function mockGeminiEmbed(values: number[] | "error") {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    if (values === "error") {
      return new Response(JSON.stringify({ error: { code: 500 } }), { status: 500 });
    }
    return new Response(JSON.stringify({ embedding: { values } }), { status: 200 });
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

/** Mock supabase.rpc(...) qui retourne les rows passées. */
function mockSupabase(rpcResponse: { data?: unknown[]; error?: { message: string } | null }) {
  return {
    rpc: async (_name: string, _params: unknown) => rpcResponse,
  };
}

const workItemCarrelage: WorkItemFull = {
  description: "Fourniture et pose de carrelage 60x60 sol",
  category: "carrelage",
  amount_ht: 1200,
  quantity: 15,
  unit: "m²",
};

await test("high confidence — similarity 0.92, top-3 candidates", async () => {
  const restore = mockGeminiEmbed(new Array(768).fill(0.1));
  const supabase = mockSupabase({
    data: [
      { id: 1, job_type: "carrelage_sol_fourniture_pose", label: "Carrelage sol (F+P)", unit: "m2",
        price_min_unit_ht: 60, price_avg_unit_ht: 85, price_max_unit_ht: 120,
        fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, domain: "carrelage", notes: "", similarity: 0.92 },
      { id: 2, job_type: "carrelage_standard", label: "Carrelage std", unit: "m2",
        price_min_unit_ht: 55, price_avg_unit_ht: 80, price_max_unit_ht: 110,
        fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, domain: "carrelage", notes: "", similarity: 0.81 },
      { id: 3, job_type: "carrelage_grand_format", label: "Carrelage grand format", unit: "m2",
        price_min_unit_ht: 80, price_avg_unit_ht: 110, price_max_unit_ht: 160,
        fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, domain: "carrelage", notes: "", similarity: 0.78 },
    ],
    error: null,
  });
  try {
    const r = await matchSingleLineVectorial(supabase, workItemCarrelage, 0, "fake-key");
    assertEq(r.error, undefined);
    assertEq(r.result.vectorial?.confidence, "high");
    assertEq(r.result.vectorial?.top_similarity, 0.92);
    assertEq(r.result.catalog_job_types, ["carrelage_sol_fourniture_pose"]);
    assertEq(r.result.vectorial?.all_candidates.length, 3);
    assertEq(r.result.prices.length, 1, "prices[0] = top-1");
    assertEq(r.result.prices[0].job_type, "carrelage_sol_fourniture_pose");
  } finally { restore(); }
});

await test("low confidence — similarity 0.55", async () => {
  // V3.5.9 — label doit partager AU MOINS un token significatif avec la
  // description devis (workItemCarrelage = "Fourniture et pose de carrelage
  // 60x60 sol") pour passer la garde overlap lexical. Sans ça, la garde
  // V3.5.9 reclasse en no_match — comportement voulu (cf. bug "échafaudage
  // sur logistique"). On garde "carrelage" dans le label pour tester la
  // classification "low" sur une vraie similarité tiède.
  const restore = mockGeminiEmbed(new Array(768).fill(0.1));
  const supabase = mockSupabase({
    data: [
      { id: 9, job_type: "carrelage_finition_divers", label: "Carrelage finition divers", unit: "u",
        price_min_unit_ht: 50, price_avg_unit_ht: 90, price_max_unit_ht: 200,
        fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, domain: "autre", notes: "", similarity: 0.55 },
    ],
    error: null,
  });
  try {
    const r = await matchSingleLineVectorial(supabase, workItemCarrelage, 0, "fake-key");
    assertEq(r.result.vectorial?.confidence, "low");
    assertEq(r.result.vectorial?.top_similarity, 0.55);
    assertEq(r.result.prices.length, 1, "prices[0] toujours présent même en low");
  } finally { restore(); }
});

await test("no_match — RPC retourne 0 row", async () => {
  const restore = mockGeminiEmbed(new Array(768).fill(0.1));
  const supabase = mockSupabase({ data: [], error: null });
  try {
    const r = await matchSingleLineVectorial(supabase, workItemCarrelage, 0, "fake-key");
    assertEq(r.result.vectorial?.confidence, "no_match");
    assertEq(r.result.vectorial?.top_similarity, null);
    assertEq(r.result.prices, [], "prices[] vide en no_match");
    assertEq(r.result.catalog_job_types, []);
    assertEq(r.result.job_type_label, "Non comparable");
  } finally { restore(); }
});

await test("embed_failed — Gemini 500 → no_match propre", async () => {
  const restore = mockGeminiEmbed("error");
  const supabase = mockSupabase({ data: [], error: null });
  try {
    const r = await matchSingleLineVectorial(supabase, workItemCarrelage, 0, "fake-key");
    assertEq(r.result.vectorial?.confidence, "no_match");
    assert(typeof r.error === "string" && r.error.startsWith("embed_failed"), "error doit signaler embed_failed");
    assertEq(r.result.prices, []);
  } finally { restore(); }
});

await test("rpc_failed → no_match avec error rpc_failed", async () => {
  const restore = mockGeminiEmbed(new Array(768).fill(0.1));
  const supabase = mockSupabase({ data: null, error: { message: "RPC timeout" } });
  try {
    const r = await matchSingleLineVectorial(supabase, workItemCarrelage, 0, "fake-key");
    assertEq(r.result.vectorial?.confidence, "no_match");
    assert(typeof r.error === "string" && r.error.startsWith("rpc_failed"), "error doit signaler rpc_failed");
  } finally { restore(); }
});

// ─────────────────────────────────────────────────────────────────────────────
// lookupMarketPricesVectorial — bout-en-bout
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[lookupMarketPricesVectorial — end-to-end]");

await test("3 lignes hétérogènes → mix confidence (high + medium + no_match)", async () => {
  // On reproduit Gemini + RPC qui retournent un mix
  let callIndex = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ embedding: { values: new Array(768).fill(0.1) } }), { status: 200 })
  ) as typeof fetch;

  const responses = [
    // Ligne 1 : high
    { data: [{ id: 1, job_type: "carrelage_sol", label: "Carrelage sol", unit: "m2",
      price_min_unit_ht: 60, price_avg_unit_ht: 85, price_max_unit_ht: 120,
      fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, domain: "carrelage", notes: "", similarity: 0.91 }], error: null },
    // Ligne 2 : medium
    { data: [{ id: 2, job_type: "peinture_murale", label: "Peinture murale", unit: "m2",
      price_min_unit_ht: 25, price_avg_unit_ht: 35, price_max_unit_ht: 50,
      fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, domain: "peinture", notes: "", similarity: 0.75 }], error: null },
    // Ligne 3 : no_match
    { data: [], error: null },
  ];

  const supabase = {
    rpc: async () => responses[callIndex++],
  };

  const workItems: WorkItemFull[] = [
    { description: "Pose carrelage sol cuisine", category: "carrelage", amount_ht: 1500, quantity: 18, unit: "m²" },
    { description: "Peinture murs blanc", category: "peinture", amount_ht: 800, quantity: 30, unit: "m²" },
    { description: "Honoraires gestion projet", category: "autre", amount_ht: 1200, quantity: 1, unit: "forfait" },
  ];

  try {
    const results = await lookupMarketPricesVectorial(supabase, workItems, "fake-key");
    assertEq(results.length, 3);
    assertEq(results[0].vectorial?.confidence, "high");
    assertEq(results[1].vectorial?.confidence, "medium");
    assertEq(results[2].vectorial?.confidence, "no_match");
    assertEq(results[2].prices, []);
    // chaque résultat a exactement 1 ligne devis (1 ligne devis = 1 groupe en vectoriel)
    for (const r of results) {
      assertEq(r.devis_lines.length, 1);
      assertEq(r.workItemIndices.length, 1);
    }
  } finally {
    globalThis.fetch = original;
  }
});

await test("workItems vide → [] vide (pas de crash)", async () => {
  const supabase = { rpc: async () => ({ data: [], error: null }) };
  const results = await lookupMarketPricesVectorial(supabase, [], "fake-key");
  assertEq(results, []);
});

await test("ligne avec description vide → skip silencieux (pas embeddée)", async () => {
  const restore = mockGeminiEmbed(new Array(768).fill(0.1));
  let rpcCalls = 0;
  const supabase = {
    rpc: async () => { rpcCalls++; return { data: [], error: null }; },
  };
  const workItems: WorkItemFull[] = [
    { description: "", category: null, amount_ht: 100, quantity: 1, unit: null },
    { description: "  ", category: null, amount_ht: 100, quantity: 1, unit: null },
    { description: "Vraie ligne", category: null, amount_ht: 500, quantity: 1, unit: "u" },
  ];
  try {
    const results = await lookupMarketPricesVectorial(supabase, workItems, "fake-key");
    assertEq(results.length, 1, "seule la 3e ligne (non vide) est traitée");
    assertEq(rpcCalls, 1, "1 seul appel RPC");
  } finally { restore(); }
});

// ─────────────────────────────────────────────────────────────────────────────
// V3.5.9 — Gardes sémantiques anti-faux-match
// Issue audit Côte Maison Travaux 2026-06-08 — 3 faux matchs typiques :
//   - logistique → échafaudage (no lexical overlap)
//   - fourniture seule → pose seule (antonymes sémantiques)
//   - chauffe-eau VELIS → groupe sécurité (ratio prix devis >> marché)
// ─────────────────────────────────────────────────────────────────────────────
import {
  hasLexicalOverlap,
  isSupplyVsLaborMismatch,
  isImplausiblyHighRatio,
} from "./market-matcher-vectorial.ts";

console.log("\n[V3.5.9 — gardes sémantiques]");

await test("hasLexicalOverlap — logistique vs échafaudage = false (rejet)", () => {
  assertEq(
    hasLexicalOverlap(
      "Logistique ; Avec livraison du matériel, outillage, nettoyage",
      "Échafaudage location + montage/démontage",
    ),
    false,
  );
});
await test("hasLexicalOverlap — carrelage vs carrelage = true (accept)", () => {
  assertEq(
    hasLexicalOverlap(
      "Fourniture de carrelage de sol à 25€ le m²",
      "Pose carrelage sol (hors fourniture)",
    ),
    true,
  );
});
await test("hasLexicalOverlap — desc vide = true (permissif)", () => {
  assertEq(hasLexicalOverlap("", "Échafaudage location"), true);
});

await test("isSupplyVsLaborMismatch — fourniture seule vs pose hors fourniture = true", () => {
  assertEq(
    isSupplyVsLaborMismatch(
      "Fourniture de carrelage de sol à 25€ le m² à l'achat",
      "Pose carrelage sol (hors fourniture)",
    ),
    true,
  );
});
await test("isSupplyVsLaborMismatch — fourniture+pose vs pose+fourniture = false", () => {
  assertEq(
    isSupplyVsLaborMismatch(
      "Fourniture et pose de carrelage 60x60",
      "Fourniture et pose carrelage sol",
    ),
    false,
  );
});
await test("isSupplyVsLaborMismatch — pose seule (hors fourniture) vs fourniture seule = true", () => {
  // "hors fourniture" force Cas B même si la description mentionne fourniture
  // entre parenthèses (cas réel : "Pose carrelage 60x60 sol (hors fourniture)")
  assertEq(
    isSupplyVsLaborMismatch(
      "Pose carrelage 60x60 sol (hors fourniture)",
      "Fourniture matériau carrelage achat",
    ),
    true,
  );
});

await test("isImplausiblyHighRatio — chauffe-eau 538€/u vs groupe sécurité max 60€/u = true", () => {
  assertEq(
    isImplausiblyHighRatio(538, "u", 1, 60, "u"),
    true,
  );
});
await test("isImplausiblyHighRatio — surcoût classique 1.5× = false", () => {
  assertEq(
    isImplausiblyHighRatio(150, "u", 1, 100, "u"),
    false,
  );
});
await test("isImplausiblyHighRatio — unités incohérentes (m² vs u) = false (garde permissive)", () => {
  assertEq(
    isImplausiblyHighRatio(1000, "m2", 5, 50, "u"),
    false,
  );
});
await test("isImplausiblyHighRatio — devis < 100€ skip", () => {
  assertEq(
    isImplausiblyHighRatio(50, "u", 1, 5, "u"),
    false,
  );
});
await test("isImplausiblyHighRatio — forfait = skip (non comparable)", () => {
  assertEq(
    isImplausiblyHighRatio(2000, "forfait", 1, 100, "u"),
    false,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${passed} ✓ / ${failed} ✗\n`);
if (failed > 0) {
  // deno-lint-ignore no-process-exit
  (globalThis as any).process?.exit?.(1);
}
