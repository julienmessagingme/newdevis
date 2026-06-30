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
 * Calibrage v1 (2026-05-22, design Phase C) : HIGH=0.85, MEDIUM=0.70.
 * Mauvaise calibration : sur 941 matchings réels analysés 2026-06-30
 * (scripts/tune-vectorial-thresholds.ts), 0 matching n'atteignait HIGH=0.85.
 * Max observé : 0.8496. Médiane : 0.7642. Asymétrie inhérente "texte court
 * (catalogue) vs texte long (devis)" qui empêche structurellement d'atteindre 0.85.
 *
 * Recalibrage v2 (2026-06-30) : HIGH=0.77 (40.7% de l'historique bascule en HIGH,
 * 383 obs au lieu de 0). MEDIUM=0.70 inchangé (seul 2.8% des obs en dessous,
 * c'est cohérent avec "vraiment incertain"). NO_MATCH inchangé.
 *
 *   ≥ 0.77 → "high"     : match très fiable (synonyme catalogue quasi-exact)
 *   0.70-0.77 → "medium": match plausible, à valider visuellement
 *   0.50-0.70 → "low"   : match incertain, badge rouge "match imprécis"
 *   < 0.50 → "no_match" : on ne renvoie aucun match, carte "Non comparable"
 */
const CONFIDENCE_HIGH = 0.77;
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

// ── V3.5.9 — Gardes sémantiques anti-faux-match ─────────────────────────────
//
// Le matcher vectoriel V3.5.0 garde aveuglément le top-1 cosine dès que
// similarity ≥ 0.50. En pratique, à des seuils medium (0.70-0.85), les
// embeddings peuvent faire matcher des paires sémantiquement opposées
// (fourniture vs pose) ou totalement étrangères (logistique vs échafaudage).
// Ces gardes filtrent ces faux positifs APRÈS le matching vectoriel.

const FRENCH_STOPWORDS = new Set([
  "de", "du", "des", "le", "la", "les", "un", "une", "et", "ou", "à", "au",
  "aux", "pour", "par", "sur", "avec", "sans", "dans", "en", "se", "ce", "qui",
  "que", "dont", "où", "ne", "pas", "plus", "moins", "entre", "vers", "chez",
  "type", "sorte", "kind", "ml", "ht", "ttc", "tva", "eur", "euro", "euros",
]);

/** Tokenise + filtre stopwords + garde tokens ≥ 4 lettres. */
function significantTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // accents
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !FRENCH_STOPWORDS.has(t)),
  );
}

/**
 * Garde 1 — overlap lexical.
 * Si AUCUN token significatif du label catalogue n'est présent dans la
 * description devis, le matching est probablement halluciné par cosine pure.
 *
 * Cas type : "Logistique livraison matériel nettoyage" matché à "Échafaudage
 * location + montage/démontage" — 0 token en commun, on rejette.
 */
export function hasLexicalOverlap(devisDesc: string, catalogLabel: string): boolean {
  const descTokens = significantTokens(devisDesc);
  const labelTokens = significantTokens(catalogLabel);
  if (descTokens.size === 0 || labelTokens.size === 0) return true; // garde permissive
  for (const t of labelTokens) {
    if (descTokens.has(t)) return true;
  }
  return false;
}

const SUPPLY_TOKENS = new Set([
  "fourniture", "fournitures", "fournir", "materiau", "materiaux",
  "achat", "approvisionnement", "approvisionnements",
]);
const LABOR_ONLY_TOKENS = new Set([
  "pose", "poser", "installation", "main", "oeuvre", "moeuvre",
  "manoeuvre", "depose", "deposer",
]);
const HORS_FOURNITURE_PATTERN = /hors\s+fourniture/i;

/**
 * Garde 2 — antonymes fourniture vs pose.
 *
 * Si la description devis indique CLAIREMENT "fourniture seule" (matériaux
 * uniquement, à l'achat) et que le label catalogue indique CLAIREMENT "pose
 * seule" (hors fourniture, MO uniquement) — ou inversement — c'est un
 * mismatch sémantique malgré une similarity cosine élevée.
 *
 * Cas type : devis "Fourniture de carrelage de sol à 25€ le m² à l'achat"
 * matché à "Pose carrelage sol (hors fourniture)" — antonymes parfaits.
 */
export function isSupplyVsLaborMismatch(
  devisDesc: string,
  catalogLabel: string,
): boolean {
  const descTokens = significantTokens(devisDesc);
  const labelTokens = significantTokens(catalogLabel);

  const descHasSupply = [...descTokens].some((t) => SUPPLY_TOKENS.has(t));
  const descHasLabor = [...descTokens].some((t) => LABOR_ONLY_TOKENS.has(t));
  const labelHasSupply = [...labelTokens].some((t) => SUPPLY_TOKENS.has(t));
  const labelHasLabor = [...labelTokens].some((t) => LABOR_ONLY_TOKENS.has(t));
  const labelHorsFourniture = HORS_FOURNITURE_PATTERN.test(catalogLabel);
  const descHorsFourniture = HORS_FOURNITURE_PATTERN.test(devisDesc);

  // Cas A : devis = "fourniture seule" + label = "pose seule"
  // descHasSupply=true, descHasLabor=false, label=labor sans supply (ou hors fourniture)
  if (descHasSupply && !descHasLabor) {
    if (labelHasLabor && (!labelHasSupply || labelHorsFourniture)) return true;
  }

  // Cas B : devis = "pose seule" + label = "fourniture seule"
  // descHasLabor=true, descHasSupply=false ou descHorsFourniture, label=supply sans labor
  if ((descHasLabor && !descHasSupply) || descHorsFourniture) {
    if (labelHasSupply && !labelHasLabor) return true;
  }

  return false;
}

/**
 * Garde 3 — plausibilité prix (devis >> marché_max).
 *
 * Si le montant unitaire devis dépasse > 8× le maximum marché du label
 * catalogue (sur une unité comparable, hors forfait), c'est presque toujours
 * que le matcher catalogue a accroché un sous-élément accessoire (groupe de
 * sécurité, raccord, etc.) plutôt que l'équipement principal nommé dans la
 * description (chauffe-eau complet, PAC, chaudière, etc.).
 *
 * Cas type : "Fourniture chauffe-eau VELIS 65L avec groupe de secours" 538€
 * matché à "Groupe de sécurité chauffe-eau" (marché 30-80€) → ratio ~7-18×.
 *
 * Seuil 8× volontairement conservateur (un vrai surcoût atteint 1.5-3×,
 * jamais 8×). Inspiré de V3.4.24 mais adapté au pipeline vectoriel
 * (1 ligne = 1 groupe, donc pas de garde `length >= 5`).
 */
export function isImplausiblyHighRatio(
  devisAmountHt: number | null,
  devisUnit: string | null,
  devisQuantity: number | null,
  catalogPriceMaxUnit: number | null,
  catalogUnit: string | null,
): boolean {
  if (!devisAmountHt || devisAmountHt < 100) return false;
  if (!catalogPriceMaxUnit || catalogPriceMaxUnit <= 0) return false;

  // Garde unité forfait — pas comparable
  const FORFAIT_RE = /^(forfait|f|ff|fft|ens|ensemble)$/i;
  if (devisUnit && FORFAIT_RE.test(devisUnit.trim())) return false;
  if (catalogUnit && FORFAIT_RE.test(catalogUnit.trim())) return false;

  // Prix unitaire devis (amount / quantity)
  const qty = devisQuantity && devisQuantity > 0 ? devisQuantity : 1;
  const devisPriceUnit = devisAmountHt / qty;

  // Garde unités cohérentes (au moins même nature) : on évite les false-positive
  // type "m²" vs "ml" qui n'ont aucune cohérence. On compare uniquement quand
  // l'unité devis matche celle du catalogue OU les 2 sont en "u/U/unité/pce".
  const PIECE_RE = /^(u|u\.|pce|pcs|piece|piè?ce|unité|unite|unit)$/i;
  const devisIsPiece = devisUnit ? PIECE_RE.test(devisUnit.trim()) : false;
  const catalogIsPiece = catalogUnit ? PIECE_RE.test(catalogUnit.trim()) : false;
  const sameUnit = devisUnit && catalogUnit &&
    devisUnit.trim().toLowerCase() === catalogUnit.trim().toLowerCase();
  if (!sameUnit && !(devisIsPiece && catalogIsPiece)) return false;

  return devisPriceUnit > catalogPriceMaxUnit * 8;
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
 * V3.5.11 Phase 1 (2026-06-09) — Contexte pour le fire-and-forget audit log.
 *
 * Permet d'enrichir l'écriture dans `match_audit_log` avec l'analysis_id
 * (pour rétrocrosser les matchs d'une analyse précise) et la version du
 * moteur (pour ne pas mélanger les calibrations entre 2 versions).
 *
 * Optionnel — si non fourni, on logue quand même mais avec NULL.
 */
export interface MatchAuditContext {
  analysis_id?: string;
  engine_version?: string;
}

/**
 * Fire-and-forget write dans `match_audit_log`. Aucune Promise retournée —
 * si l'insert échoue, on ne bloque pas le pipeline d'analyse (l'audit est
 * du nice-to-have, pas critique).
 *
 * Edge functions Supabase : `EdgeRuntime.waitUntil` garantit que la promesse
 * tourne jusqu'à terminaison même si la response a déjà été envoyée. Sans
 * ça, Deno coupe le worker dès le `return new Response(...)`.
 */
function logMatchAudit(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  workItem: WorkItemFull,
  workItemIndex: number,
  top: SearchRpcRow | null,
  confidence: ConfidenceTier,
  allCandidates: VectorialCandidate[],
  rejectedReasons: string[],
  auditCtx?: MatchAuditContext,
): void {
  // deno-lint-ignore no-explicit-any
  const globalAny = globalThis as any;
  // Garde tests : mocks unitaires fournissent uniquement `rpc`, pas `from`.
  // En prod le client Supabase a toujours `from` — pas de risque silencieux.
  if (typeof supabase?.from !== "function") return;
  const promise = supabase
    .from("match_audit_log")
    .insert({
      analysis_id: auditCtx?.analysis_id ?? null,
      line_index: workItemIndex,
      description: workItem.description.slice(0, 500),
      unit: workItem.unit ?? null,
      quantity: workItem.quantity ?? null,
      amount_ht: workItem.amount_ht ?? null,
      top_job_type: top?.job_type ?? null,
      top_label: top?.label ?? null,
      top_similarity: top?.similarity ?? null,
      confidence,
      all_candidates: allCandidates.slice(0, 5),
      rejected_reasons: rejectedReasons.length > 0 ? rejectedReasons : null,
      engine_version: auditCtx?.engine_version ?? null,
    })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.warn(`[Vectorial] audit log insert failed: ${error.message}`);
    });
  // Laisse Supabase tourner en arrière-plan sans bloquer la response
  if (typeof globalAny.EdgeRuntime?.waitUntil === "function") {
    globalAny.EdgeRuntime.waitUntil(promise);
  }
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
  auditCtx?: MatchAuditContext,
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

  // 3. V3.5.9 — Gardes sémantiques anti-faux-match
  //
  // On parcourt les top-N dans l'ordre et on garde le PREMIER qui passe les 3
  // gardes. Si AUCUN candidat ne passe, on retourne no_match — meilleur que
  // d'afficher une "Anomalie marché" rouge sur un match fantôme.
  //
  // L'audit (cas Côte Maison Travaux 2026-06-08) montre 4 types de faux match :
  //   - description "logistique" matché à "échafaudage" (no overlap)
  //   - description "fourniture seule" matché à "pose seule" (antonyme)
  //   - description "chauffe-eau complet" matché à "groupe sécurité" (ratio 8×+)
  //   - description "démolition surface" matché à "démolition unité" (acceptable)
  let top: SearchRpcRow | null = null;
  let rejectedReasons: string[] = [];

  for (const candidate of rows) {
    const reasons: string[] = [];

    // Garde 1 — overlap lexical
    if (!hasLexicalOverlap(workItem.description, candidate.label)) {
      reasons.push("no_lexical_overlap");
    }
    // Garde 2 — antonymes fourniture vs pose
    if (isSupplyVsLaborMismatch(workItem.description, candidate.label)) {
      reasons.push("supply_vs_labor_mismatch");
    }
    // Garde 3 — plausibilité prix (devis >> marché_max)
    if (
      isImplausiblyHighRatio(
        workItem.amount_ht,
        workItem.unit,
        workItem.quantity,
        candidate.price_max_unit_ht,
        candidate.unit,
      )
    ) {
      reasons.push("implausible_high_ratio");
    }

    if (reasons.length === 0) {
      top = candidate;
      break;
    }
    rejectedReasons.push(
      `${candidate.job_type} sim=${candidate.similarity.toFixed(3)} rej=${reasons.join("|")}`,
    );
  }

  if (!top) {
    console.warn(
      `[Vectorial] V3.5.9 all candidates rejected for "${workItem.description.slice(0, 60)}" — ` +
      rejectedReasons.slice(0, 3).join(" ; "),
    );
    // V3.5.11 Phase 1 — logger aussi les rejets pour pouvoir mesurer la
    // distribution des causes en prod (Phase 2 calibration des gardes)
    logMatchAudit(
      supabase, workItem, workItemIndex,
      null, "no_match",
      rows.map((r) => ({ job_type: r.job_type, label: r.label, similarity: r.similarity })),
      rejectedReasons, auditCtx,
    );
    return {
      workItemIndex,
      result: buildNoMatchResult(workItem, workItemIndex, "no_candidates"),
    };
  }

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

  // V3.5.11 Phase 1 — fire-and-forget audit log pour analyse ex-post + Phase 2
  logMatchAudit(supabase, workItem, workItemIndex, top, confidence, allCandidates, rejectedReasons, auditCtx);

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
  auditCtx?: MatchAuditContext,
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

    const { result, error } = await matchSingleLineVectorial(supabase, item, i, googleApiKey, auditCtx);
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
