/**
 * supabase/functions/analyze-quote/market-matcher-vectorial.ts
 *
 * V3.5.0 PHASE C — Matcher catalogue PAR LIGNE via similarity search vectorielle.
 *
 * Remplace le pipeline V3.6 (groupement Gemini Phase 2 + matching 3 couches) par :
 *   1. Pour chaque ligne devis → embed via Gemini gemini-embedding-001
 *      (taskType=RETRIEVAL_QUERY, outputDimensionality=768).
 *   2. RPC `search_market_prices_v2(embedding, threshold, count)` → top-N catalogue.
 *   3. Classification confidence (high/medium/low/no_match) selon similarity.
 *   4. Retour au shape `JobTypePriceResult[]` (1 ligne devis = 1 résultat) avec
 *      méta vectorielle attachée pour transparence UI.
 *
 * AUCUN GROUPEMENT GEMINI. Plus de regroupements aberrants type PH VISION
 * "Pose extracteur/WC = 3900€" qui cumulait tout le bloc Sanitaires.
 *
 * Ce fichier est isolé (Phase C.1) — le wiring dans `market-prices.ts` arrive
 * en Phase C.2 derrière le feature flag `MARKET_MATCHER_VECTORIAL=true`.
 *
 * COÛT Gemini :
 *   gemini-embedding-001 ≈ $0.000025 / 1k tokens (pricing fin 2025).
 *   Devis moyen ~30 lignes × ~30 tokens = 900 tokens → < 0.0001 € par analyse.
 *   À comparer aux ~5000 tokens du groupement Gemini V3.6 actuel → coût divisé
 *   par ~5 ET pipeline déterministe (pas de regroupement halluciné).
 *
 * LATENCE :
 *   30 lignes × ~250ms (embed + RPC) ≈ 7-8s en séquentiel. Acceptable vs les
 *   ~6s du groupement V3.6 actuel. Si besoin d'optimiser plus tard : batch
 *   embed (Gemini accepte `requests: [...]` jusqu'à 100/call) + Promise.all
 *   sur les RPC.
 */

import { fetchGeminiWithRetry } from "../_shared/gemini-fetch.ts";
import type {
  WorkItemFull,
  DevisLineDetail,
  JobTypePriceResult,
} from "./market-prices.ts";

// ── Constantes ──────────────────────────────────────────────────────────────

const EMBEDDING_MODEL = "models/gemini-embedding-001";
const EMBEDDING_DIM = 768;

/**
 * Seuils de classification confidence (cosine similarity, [0, 1]).
 *
 * Calibrés à dire d'expert lors du design Phase C. À ré-évaluer après Phase E
 * (shadow run sur 50 devis) — si trop de "low" sur des vrais matchs, baisser
 * MEDIUM. Si trop de "high" sur des matchs douteux, monter HIGH.
 *
 *   ≥ 0.85 → "high"     : match très fiable (synonyme catalogue quasi-exact)
 *   0.70-0.85 → "medium": match plausible, à valider visuellement
 *   0.50-0.70 → "low"   : match incertain, badge rouge "match imprécis"
 *   < 0.50 → "no_match" : on ne renvoie aucun match, carte "Non comparable"
 */
const CONFIDENCE_HIGH = 0.85;
const CONFIDENCE_MEDIUM = 0.70;
const NO_MATCH_THRESHOLD = 0.50;

/**
 * Combien de candidats catalogue on demande à la RPC.
 *
 * On garde top-1 pour l'affichage principal, mais on stocke le top-5 dans
 * `vectorial.all_matches` pour la transparence (UI Phase D pourra exposer
 * un "voir 4 autres correspondances possibles" en menu déroulant si besoin).
 */
const MATCH_COUNT = 5;

/**
 * Throttle entre requêtes Gemini.
 *
 * Gemini gemini-embedding-001 = 1500 req/min en free tier (25 req/s).
 * 50ms = 20 req/s = marge confortable. Sur un devis 30 lignes : 30 × 50ms
 * = 1.5s de delay cumulé, négligeable vs la latence d'embed elle-même.
 */
const THROTTLE_MS = 50;

// ── Types exportés ──────────────────────────────────────────────────────────

export type ConfidenceTier = "high" | "medium" | "low" | "no_match";

export interface VectorialCandidate {
  job_type: string;
  label: string;
  similarity: number;
}

export interface VectorialMatchMeta {
  /** Similarity du top-1 (0-1). null si aucun candidat (no_match). */
  top_similarity: number | null;
  /** Classification UI : badge couleur dérivé du top_similarity. */
  confidence: ConfidenceTier;
  /** Top-5 candidats catalogue pour transparence (top-1 inclus si confidence ≠ no_match). */
  all_candidates: VectorialCandidate[];
}

/**
 * JobTypePriceResult enrichi avec la méta vectorielle.
 *
 * Le champ `vectorial` est optionnel pour rester compat avec le pipeline V3.6
 * qui ne le set jamais. Quand `MARKET_MATCHER_VECTORIAL=true`, ce champ est
 * toujours présent (même en no_match où il vaut { top_similarity: null, ... }).
 */
export interface VectorialJobTypePriceResult extends JobTypePriceResult {
  vectorial?: VectorialMatchMeta;
}

// ── RPC return type (from search_market_prices_v2) ─────────────────────────

interface SearchRpcRow {
  id: number;
  job_type: string;
  label: string;
  unit: string;
  price_min_unit_ht: number | null;
  price_avg_unit_ht: number | null;
  price_max_unit_ht: number | null;
  fixed_min_ht: number | null;
  fixed_avg_ht: number | null;
  fixed_max_ht: number | null;
  domain: string;
  notes: string | null;
  similarity: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Classifie une similarity en tier UI.
 *
 * Exporté pour pouvoir être testé unitairement (Phase C.4) sans avoir à
 * mocker Gemini ni Supabase.
 */
export function classifyConfidence(similarity: number | null): ConfidenceTier {
  if (similarity === null || !Number.isFinite(similarity)) return "no_match";
  if (similarity < NO_MATCH_THRESHOLD) return "no_match";
  if (similarity < CONFIDENCE_MEDIUM) return "low";
  if (similarity < CONFIDENCE_HIGH) return "medium";
  return "high";
}

/**
 * Construit le texte à embed pour une ligne devis.
 *
 * Format aligné avec ce que le seed catalogue produit (`buildEmbeddingText` dans
 * `scripts/seed_market_prices_embeddings.mjs`) pour maximiser la cohérence
 * sémantique entre les vecteurs catalogue et les vecteurs requête.
 *
 * Différences nécessaires avec le seed :
 *   - Le devis n'a pas de job_type ni de domain (c'est ce qu'on cherche).
 *   - Le devis a `category` (du parsing extract.ts) qui sert d'indication.
 *   - Le devis a un `amount_ht` qui n'est PAS inclus (un embedding sémantique
 *     ne doit pas être contaminé par le prix — on veut matcher la NATURE du
 *     travail, le prix est jugé après via le catalogue).
 */
export function buildQueryEmbeddingText(item: WorkItemFull): string {
  const parts: string[] = [item.description.trim()];
  if (item.category && item.category.trim() && item.category.toLowerCase() !== "autre") {
    parts.push(`Catégorie : ${item.category.trim()}`);
  }
  if (item.unit && item.unit.trim()) {
    parts.push(`Unité : ${item.unit.trim()}`);
  }
  return parts.join(". ");
}

/**
 * Embed un texte de requête (côté devis) via Gemini.
 *
 * taskType="RETRIEVAL_QUERY" est crucial : il optimise l'embedding pour le
 * MATCHING contre des documents indexés. Le seed catalogue utilise
 * "RETRIEVAL_DOCUMENT" → les deux task types sont complémentaires et
 * améliorent la qualité du match vs un même task type des 2 côtés.
 *
 * outputDimensionality=768 : gemini-embedding-001 produit nativement 3072 dim
 * mais la colonne pgvector est vector(768). Le paramètre demande au modèle
 * de réduire la dimensionalité côté serveur (pas un PCA local — c'est une
 * projection apprise par Google).
 */
export async function embedQueryText(text: string, googleApiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/${EMBEDDING_MODEL}:embedContent?key=${googleApiKey}`;
  const resp = await fetchGeminiWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: EMBEDDING_DIM,
      }),
    },
    { timeoutMs: 8000, maxAttempts: 2, logPrefix: "[Vectorial]" },
  );

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Gemini embedContent ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding malformé : attendu ${EMBEDDING_DIM} dim, reçu ${values?.length}`,
    );
  }
  return values as number[];
}

/**
 * Formate un array JS en littéral pgvector ("[v1,v2,...]") — requis pour
 * passer l'embedding à la RPC `search_market_prices_v2` qui attend un type
 * `vector(768)`.
 */
export function toPgVector(arr: number[]): string {
  return `[${arr.join(",")}]`;
}

// ── Main ───────────────────────────────────────────────────────────────────

/**
 * Result d'un match pour une ligne (helper interne, agrégé par main).
 */
interface LineMatchResult {
  workItemIndex: number;
  result: VectorialJobTypePriceResult;
  error?: string;
}

/**
 * Match une ligne devis individuelle au catalogue via similarity search.
 *
 * Exporté pour les tests unitaires (mocking embed + RPC). N'a pas vocation à
 * être appelé hors de `lookupMarketPricesVectorial` en production.
 */
export async function matchSingleLineVectorial(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  workItem: WorkItemFull,
  workItemIndex: number,
  googleApiKey: string,
): Promise<LineMatchResult> {
  const text = buildQueryEmbeddingText(workItem);

  // 1. Embed la ligne devis
  let embedding: number[];
  try {
    embedding = await embedQueryText(text, googleApiKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      workItemIndex,
      error: `embed_failed: ${msg}`,
      result: buildNoMatchResult(workItem, workItemIndex, "embed_failed"),
    };
  }

  // 2. Similarity search via RPC (SECURITY DEFINER, bypass RLS depuis edge fn)
  const { data, error } = await supabase.rpc("search_market_prices_v2", {
    query_embedding: toPgVector(embedding),
    match_threshold: NO_MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
  });

  if (error) {
    return {
      workItemIndex,
      error: `rpc_failed: ${error.message}`,
      result: buildNoMatchResult(workItem, workItemIndex, "rpc_failed"),
    };
  }

  const rows = (data ?? []) as SearchRpcRow[];
  if (rows.length === 0) {
    return {
      workItemIndex,
      result: buildNoMatchResult(workItem, workItemIndex, "no_candidates"),
    };
  }

  // 3. Top-1 + candidats secondaires
  const top = rows[0];
  const confidence = classifyConfidence(top.similarity);
  const allCandidates: VectorialCandidate[] = rows.map((r) => ({
    job_type: r.job_type,
    label: r.label,
    similarity: r.similarity,
  }));

  // 4. Construire le JobTypePriceResult enrichi
  //    - 1 ligne devis = 1 "groupe" virtuel
  //    - prices contient le top-1 catalogue (V3.6 shape compat)
  const devisLine: DevisLineDetail = {
    index: workItemIndex,
    description: workItem.description,
    amount_ht: workItem.amount_ht,
    quantity: workItem.quantity,
    unit: workItem.unit,
  };

  const result: VectorialJobTypePriceResult = {
    job_type_label: top.label,
    catalog_job_types: [top.job_type],
    main_unit: workItem.unit ?? top.unit ?? "u",
    main_quantity: workItem.quantity ?? 1,
    devis_lines: [devisLine],
    devis_total_ht: workItem.amount_ht,
    prices: [
      {
        job_type: top.job_type,
        label: top.label,
        unit: top.unit,
        price_min_unit_ht: top.price_min_unit_ht ?? 0,
        price_avg_unit_ht: top.price_avg_unit_ht ?? 0,
        price_max_unit_ht: top.price_max_unit_ht ?? 0,
        fixed_min_ht: top.fixed_min_ht ?? 0,
        fixed_avg_ht: top.fixed_avg_ht ?? 0,
        fixed_max_ht: top.fixed_max_ht ?? 0,
        zip_scope: "national", // RPC ne retourne pas zip_scope, on default
        notes: top.notes ?? "",
      },
    ],
    workItemIndices: [workItemIndex],
    vectorial: {
      top_similarity: top.similarity,
      confidence,
      all_candidates: allCandidates,
    },
  };

  return { workItemIndex, result };
}

/**
 * Construit un "no match" propre — la ligne devis est affichée en bloc
 * "Non comparable" côté UI (Phase D), sans prix marché.
 *
 * `reason` est uniquement pour le log debug — pas exposé au front.
 */
function buildNoMatchResult(
  workItem: WorkItemFull,
  workItemIndex: number,
  _reason: "no_candidates" | "embed_failed" | "rpc_failed",
): VectorialJobTypePriceResult {
  const devisLine: DevisLineDetail = {
    index: workItemIndex,
    description: workItem.description,
    amount_ht: workItem.amount_ht,
    quantity: workItem.quantity,
    unit: workItem.unit,
  };

  return {
    job_type_label: "Non comparable",
    catalog_job_types: [],
    main_unit: workItem.unit ?? "u",
    main_quantity: workItem.quantity ?? 1,
    devis_lines: [devisLine],
    devis_total_ht: workItem.amount_ht,
    prices: [], // ← clé : prices vide signale au front "pas de fourchette marché"
    workItemIndices: [workItemIndex],
    vectorial: {
      top_similarity: null,
      confidence: "no_match",
      all_candidates: [],
    },
  };
}

/**
 * Point d'entrée public — équivalent vectoriel de `lookupMarketPrices`.
 *
 * Signature identique au pipeline V3.6 (modulo `config` qui n'est plus
 * nécessaire — pas de filtrage de domaine, c'est le vecteur qui décide).
 * Retourne le même shape `JobTypePriceResult[]` (étendu avec `vectorial?`)
 * → drop-in remplaçable dans `index.ts`.
 *
 * Mode séquentiel avec throttle 50ms entre lignes (anti rate-limit Gemini).
 * Si une ligne fail (embed ou RPC), on continue avec les autres et on log
 * le détail — pas de short-circuit qui ferait tomber l'analyse entière.
 */
export async function lookupMarketPricesVectorial(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  workItems: WorkItemFull[],
  googleApiKey: string,
): Promise<VectorialJobTypePriceResult[]> {
  if (!workItems || workItems.length === 0) {
    return [];
  }

  const startTs = Date.now();
  const results: VectorialJobTypePriceResult[] = [];
  const tierCounts: Record<ConfidenceTier, number> = {
    high: 0,
    medium: 0,
    low: 0,
    no_match: 0,
  };
  let errors = 0;

  for (let i = 0; i < workItems.length; i++) {
    const item = workItems[i];

    // Skip silencieux des lignes vides (l'extraction Gemini peut occasionnellement
    // produire des entrées avec description vide — pas la peine de les embedder).
    if (!item.description || item.description.trim().length < 2) {
      console.warn(`[Vectorial] skip empty workItem index=${i}`);
      continue;
    }

    const { result, error } = await matchSingleLineVectorial(supabase, item, i, googleApiKey);
    results.push(result);

    const tier = result.vectorial?.confidence ?? "no_match";
    tierCounts[tier]++;
    if (error) errors++;

    // Throttle anti rate-limit Gemini (sauf après la dernière)
    if (i < workItems.length - 1) {
      await new Promise((r) => setTimeout(r, THROTTLE_MS));
    }
  }

  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  console.log(
    `[Vectorial] done — ${workItems.length} lines in ${elapsed}s | ` +
      `high=${tierCounts.high} medium=${tierCounts.medium} low=${tierCounts.low} ` +
      `no_match=${tierCounts.no_match} errors=${errors}`,
  );

  return results;
}
