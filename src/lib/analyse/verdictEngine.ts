/**
 * verdictEngine — source de vérité unique du verdict devis
 *
 * Règles déterministes, sans IA, sans état.
 * Utilisé côté client (AnalysisResult) ET côté serveur (conclusion.ts API route).
 *
 * Ordre de priorité :
 *   0. HARD BLOCK statut juridique entreprise (cessation, liquidation, redressement, radiée…)
 *      → verdict forcé REFUSER, indépendamment de tout autre critère
 *   1. hard_block autres (SIRET invalide, paiement cash, IBAN suspect…)
 *   2. prix
 *   3. risque
 *
 * V2 : seuils adaptatifs (dispersion marché + complexité chantier)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VerdictFlags {
  entreprise_radiee:         boolean;
  siret_invalide:            boolean;
  absence_assurance:         boolean;
  paiement_cash_suspect:     boolean;
  iban_suspect:              boolean;
  mentions_legales_manquantes: boolean;
  acompte_excessif:          boolean;
  incoherence_contractuelle: boolean;
}

/**
 * Résultat de l'analyse pondérée des anomalies par poste.
 *
 * Règle fondamentale : un devis ne doit jamais être jugé sur ses pires lignes,
 * mais sur l'impact RÉEL des postes aberrants dans le montant total.
 *
 * Calcul :
 *   - Pour chaque poste : delta_pct = (devis_price - market_median) / market_median
 *   - Surdévalué si delta_pct > +30%
 *   - poids_poste = devis_total_ht / total_devis
 *   - poids_anomalies = Σ poids des postes surdévalués
 *   - surcout_total  = Σ delta € des postes surdévalués
 */
export interface WeightedAnomaliesResult {
  /** Somme des poids (0–1) des postes surdévalués dans le total devis. */
  poids_anomalies:  number;
  /** Surplus € cumulé des postes surdévalués uniquement. */
  surcout_total:    number;
  /** surcout_total / total_devis — ratio d'impact réel. */
  surcout_pct:      number;
  /** Classification de l'impact global. */
  impact_anomalies: "faible" | "modéré" | "élevé";
  /** Nombre de postes surdévalués (> +30% vs médiane marché). */
  anomalies_count:  number;
  /** Nombre total de postes avec données marché analysés. */
  total_analyzed:   number;
}

export interface VerdictInput {
  total_amount:          number;   // total HT du devis
  market_estimate_min:   number;   // borne basse marché (0 si inconnu)
  market_estimate_max:   number;   // borne haute marché (0 si inconnu)
  anomalies_major_count: number;   // postes > 20% au-dessus du max catalogue
  anomalies_total_count: number;   // tous les postes avec anomalie prix
  company_risk:          "low" | "medium" | "high";
  flags:                 VerdictFlags;
  // V2 — optionnels, fallback automatique si absent
  market_dispersion_pct?: number;              // (max−min)/avg_market — calculé si absent
  chantier_complexity?:   "low" | "medium" | "high";
  /**
   * Statut juridique brut de l'entreprise (ex: "cessation", "liquidation judiciaire"…).
   * Normalisé par normalizeCompanyStatus() — si "risk", force verdict REFUSER immédiatement.
   * Règle priorité 0 : prime sur prix, anomalies, ancienneté, score global.
   */
  company_status?:        string;
  /**
   * V3 — Analyse pondérée des anomalies par poids réel dans le devis.
   * Calculée par computeWeightedAnomalies(priceData, totalDevis).
   * Si fournie, remplace la logique legacy (overprice_pct + anomalies_major_count).
   * Règle anti-bug : si surcout_pct > 30% MAIS poids_anomalies < 20% → verdict "signer"
   * (anomalie isolée sur un petit poste, ne pas pénaliser le verdict global).
   */
  weighted_anomalies?:    WeightedAnomaliesResult;
}

export type VerdictDecision = "signer" | "a_negocier" | "refuser";
export type VerdictColor    = "green"  | "orange"     | "red";

export interface VerdictResult {
  verdict:               VerdictDecision;
  color:                 VerdictColor;
  /** Couleur au format legacy VERT/ORANGE/ROUGE pour compatibilité getScoreBadge() */
  score_legacy:          "VERT" | "ORANGE" | "ROUGE";
  overprice:             number;         // € au-dessus de la moyenne marché (peut être négatif)
  overprice_pct:         number;         // ratio vs moyenne (0.10 = 10% au-dessus)
  anomalies_major_count: number;
  is_hard_block:         boolean;        // vrai si entreprise bloquante indépendamment du prix
  hard_block_reason?:    "company_status" | "flags";  // cause du hard block (priorité 0 vs 1)
  has_market_data:       boolean;        // faux si market_estimate_max === 0
  price_label:           string;         // libellé UX du positionnement prix
  // V2
  threshold_ok:          number;         // seuil "dans la norme" calculé (adaptatif)
  threshold_refuse:      number;         // seuil "refuser" (fixe : 0.20)
  market_dispersion_pct: number;         // dispersion effective utilisée
  chantier_complexity:   "low" | "medium" | "high";
  // V3 — analyse pondérée (pass-through pour LLM et UI)
  weighted_anomalies?:   WeightedAnomaliesResult;
}

// ─── Constantes de seuil ─────────────────────────────────────────────────────

/** Seuil de base "dans la norme" : surcoût ≤ 8% acceptable */
const THRESHOLD_OK_BASE    = 0.08;
/** Seuil de refus : surcoût > 20% → refuser */
const THRESHOLD_REFUSE     = 0.20;
/** Borne min du threshold_ok après ajustements */
const THRESHOLD_OK_MIN     = 0.06;
/** Borne max du threshold_ok après ajustements */
const THRESHOLD_OK_MAX     = 0.15;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Normalise un statut juridique brut en "ok" ou "risk".
 *
 * "risk" = entreprise qui ne peut pas légalement réaliser des travaux ou
 *           dont la situation juridique met en danger le client.
 *
 * Gère toutes les variations de casse et de libellé rencontrées en pratique :
 *   "cessation", "cessation d'activité", "en cessation", "cessation/pause"
 *   "radiation", "radiée", "radié"
 *   "redressement", "redressement judiciaire"
 *   "liquidation", "liquidation judiciaire"
 *   "inactive", "inactif"
 *
 * Tout statut ≠ "active" / "en activité" → "risk" par défaut de sécurité.
 */
export function normalizeCompanyStatus(status: string): "ok" | "risk" {
  if (!status || typeof status !== "string") return "ok";
  const s = status.toLowerCase().trim();

  // ── Statuts clairement actifs ──────────────────────────────────────────────
  if (
    s === "active"        ||
    s === "en activité"   ||
    s === "en activite"   ||
    s === "actif"         ||
    s === "actif (inscrit au rcs)"
  ) return "ok";

  // ── Statuts à risque explicites ────────────────────────────────────────────
  const RISK_KEYWORDS = [
    "cessation",
    "radiation",
    "radiée",
    "radiee",
    "radié",
    "radie",
    "liquidation",
    "redressement",
    "inactive",
    "inactif",
    "dissoute",
    "dissoute",
    "dissolution",
    "fermée",
    "ferme",
    "radiée du rcs",
    "procédure collective",
    "procedure collective",
  ];

  for (const keyword of RISK_KEYWORDS) {
    if (s.includes(keyword)) return "risk";
  }

  // ── Règle de sécurité : tout statut inconnu qui n'est pas "active" → risk ──
  // Commenté pour ne pas pénaliser les statuts vides / non renseignés :
  // return "risk";

  return "ok";
}

// ─── Moteur ───────────────────────────────────────────────────────────────────

export function computeVerdict(input: VerdictInput): VerdictResult {
  const {
    total_amount, market_estimate_min, market_estimate_max,
    anomalies_major_count, company_risk, flags,
    chantier_complexity = "medium",
    company_status,
  } = input;

  const has_market_data = market_estimate_max > 0;

  // ── 0. PRIORITÉ ABSOLUE — Statut juridique entreprise ────────────────────────
  // Une entreprise en cessation, liquidation, redressement ou radiée force
  // un verdict REFUSER immédiatement, sans exception.
  // Cette règle est prioritaire sur TOUT : prix, anomalies, score, dispersion.
  if (company_status && normalizeCompanyStatus(company_status) === "risk") {
    return {
      verdict: "refuser", color: "red", score_legacy: "ROUGE",
      overprice: 0, overprice_pct: 0, anomalies_major_count,
      is_hard_block: true, hard_block_reason: "company_status", has_market_data,
      price_label: "🛑 Entreprise juridiquement à risque — ne signez pas",
      threshold_ok: THRESHOLD_OK_BASE, threshold_refuse: THRESHOLD_REFUSE,
      market_dispersion_pct: 0, chantier_complexity,
    };
  }

  // ── Calcul prix ───────────────────────────────────────────────────────────────
  const avg_market    = has_market_data ? (market_estimate_min + market_estimate_max) / 2 : 0;
  const overprice     = has_market_data ? total_amount - avg_market : 0;
  const overprice_pct = (has_market_data && avg_market > 0) ? overprice / avg_market : 0;

  // ── Dispersion marché — fallback auto ─────────────────────────────────────────
  const market_dispersion_pct = input.market_dispersion_pct !== undefined
    ? input.market_dispersion_pct
    : (has_market_data && avg_market > 0)
      ? (market_estimate_max - market_estimate_min) / avg_market
      : 0;

  // ── Seuils adaptatifs ─────────────────────────────────────────────────────────
  // Plus le marché est large (dispersion élevée), plus on tolère un surcoût apparent
  // Plus le chantier est complexe, plus on tolère un surcoût apparent
  let threshold_ok = THRESHOLD_OK_BASE;

  if (market_dispersion_pct > 0.40) threshold_ok += 0.03;
  if (market_dispersion_pct > 0.60) threshold_ok += 0.02;

  if (chantier_complexity === "high") threshold_ok += 0.03;
  if (chantier_complexity === "low")  threshold_ok -= 0.02;

  threshold_ok = clamp(threshold_ok, THRESHOLD_OK_MIN, THRESHOLD_OK_MAX);

  // ── 1. Hard block — sécurité absolue ─────────────────────────────────────────
  const is_hard_block = (
    flags.entreprise_radiee      ||
    flags.siret_invalide         ||
    flags.absence_assurance      ||
    flags.paiement_cash_suspect  ||
    flags.iban_suspect
  );

  if (is_hard_block) {
    return {
      verdict: "refuser", color: "red", score_legacy: "ROUGE",
      overprice, overprice_pct, anomalies_major_count,
      is_hard_block: true, hard_block_reason: "flags", has_market_data,
      price_label: "🛑 Devis anormal — ne signez pas",
      threshold_ok, threshold_refuse: THRESHOLD_REFUSE,
      market_dispersion_pct, chantier_complexity,
    };
  }

  // ── 2. Verdict prix ───────────────────────────────────────────────────────────
  let price_verdict: VerdictDecision;

  if (!has_market_data) {
    price_verdict = "signer";
  } else if (input.weighted_anomalies) {
    // ── V3.1 : décision basée sur le POIDS RÉEL des anomalies + leur NOMBRE ──
    // Règle fondamentale : un devis ne doit jamais être jugé sur ses pires lignes,
    // mais sur l'impact réel des anomalies dans le montant total.
    //
    // Évolution V3.1 (2026-05-11) : ajout escalade par nombre d'anomalies pour
    // éviter le bug Kern Terrassement (3 postes carrelage à 3,5-16× le marché
    // sortaient en "signer" parce que le poids cumulé restait sous le seuil).
    // Seuils également abaissés (10/30% au lieu de 20/50%) — un poids de 30%
    // = un tiers du devis surfacturé, c'est déjà sévère.
    const { poids_anomalies, surcout_pct, anomalies_count, surcout_total } = input.weighted_anomalies;

    // ── CAS 2bis — escalade "multiples anomalies" avec triple garde anti-faux-positifs ──
    // Une anomalie n'a de sens que si elle est matérielle :
    //   - en NOMBRE : au moins 2 postes problématiques (pas 1 isolé)
    //   - en VALEUR ABSOLUE : surcoût > 1 000 € (sinon ça ne vaut pas la peine de renégocier)
    //   - en PROPORTION : poids > 5% du devis (matérialité relative)
    //
    // Sans ces garde-fous, on aurait un faux positif sur un devis 50 000 € avec
    // 2 petits postes à +50 € chacun (surcout total 100 € < 1000 €) : déclencher
    // "à négocier" dans ce cas serait absurde et briserait la crédibilité.
    const SEUIL_SURCOUT_ABSOLU = 1000;   // €
    const SEUIL_POIDS_MIN = 0.05;        // 5% du devis
    const isMaterialMultipleAnomalies =
      anomalies_count >= 2 &&
      surcout_total > SEUIL_SURCOUT_ABSOLU &&
      poids_anomalies > SEUIL_POIDS_MIN;

    if (poids_anomalies >= 0.30) {
      // CAS 3 — anomalies fortes (≥ 30% du total) : trop cher
      price_verdict = "refuser";
    } else if (poids_anomalies >= 0.10) {
      // CAS 2 — anomalies modérées (10-30% du total) : à négocier
      price_verdict = "a_negocier";
    } else if (isMaterialMultipleAnomalies) {
      // CAS 2bis — multiples anomalies matérielles (≥2 postes, surcoût > 1k€, ≥5% du devis)
      // Évite qu'on dise "signer" sur un devis style Kern (3 carrelages à 3-16× le marché
      // avec poids cumulé sub-10% mais surcoût total significatif).
      price_verdict = "a_negocier";
    } else {
      // CAS 1 — anomalie isolée, ou multiples anomalies non matérielles : devis OK
      price_verdict = "signer";
    }

    // Log debug (utile en cas de litige) — inclut les valeurs de la triple garde
    console.log(`[verdictEngine V3.1] poids=${Math.round(poids_anomalies * 100)}% | surcout_pct=${Math.round(surcout_pct * 100)}% | surcout_total=${Math.round(surcout_total)}€ | anomalies=${anomalies_count}/${input.weighted_anomalies.total_analyzed} | material_multi=${isMaterialMultipleAnomalies} | verdict=${price_verdict}`);
  } else {
    // ── Legacy (sans données pondérées) — backward compat ────────────────────
    if (overprice_pct <= threshold_ok && anomalies_major_count === 0) {
      price_verdict = "signer";
    } else if (overprice_pct <= THRESHOLD_REFUSE && anomalies_major_count <= 1) {
      price_verdict = "a_negocier";
    } else {
      price_verdict = "refuser";
    }
  }

  // ── 3. Verdict risque ─────────────────────────────────────────────────────────
  let risk_verdict: VerdictDecision = "signer";

  if (
    flags.mentions_legales_manquantes ||
    flags.acompte_excessif            ||
    flags.incoherence_contractuelle   ||
    company_risk === "high"
  ) {
    risk_verdict = "a_negocier";
  }

  // ── 4. Merge — gravité maximale ───────────────────────────────────────────────
  const SEVERITY: Record<VerdictDecision, number> = { signer: 0, a_negocier: 1, refuser: 2 };
  let verdict: VerdictDecision =
    SEVERITY[price_verdict] >= SEVERITY[risk_verdict] ? price_verdict : risk_verdict;

  // ── 4b. Edge case anomalies multiples (legacy uniquement) ────────────────────
  // Avec pondération V3, le poids réel est déjà intégré dans price_verdict.
  // En mode legacy : si plusieurs postes anormaux mais prix global dans la norme,
  // monter à "a_negocier".
  if (!input.weighted_anomalies && anomalies_major_count >= 2 && verdict === "signer") {
    verdict = "a_negocier";
  }

  // ── 5. Couleur ────────────────────────────────────────────────────────────────
  const color: VerdictColor =
    verdict === "refuser"    ? "red"    :
    verdict === "a_negocier" ? "orange" : "green";

  const score_legacy =
    verdict === "refuser"    ? "ROUGE"  :
    verdict === "a_negocier" ? "ORANGE" : "VERT";

  // ── 6. Label prix (règle UX critique) ────────────────────────────────────────
  // INTERDIT d'afficher "juste prix" si prix > threshold_ok et données marché disponibles
  const price_label =
    verdict === "refuser"
      ? "🛑 Devis anormal — ne signez pas"
    : verdict === "a_negocier"
      ? (overprice_pct <= threshold_ok
          ? "⚠️ Prix légèrement au-dessus du marché"
          : "⚠️ À négocier — prix au-dessus du marché")
    : (has_market_data && overprice_pct > threshold_ok)
      ? "⚠️ Prix légèrement au-dessus du marché"
      : "✅ Ce devis est au juste prix";

  return {
    verdict, color, score_legacy,
    overprice, overprice_pct, anomalies_major_count,
    is_hard_block: false, has_market_data, price_label,
    threshold_ok, threshold_refuse: THRESHOLD_REFUSE,
    market_dispersion_pct, chantier_complexity,
    weighted_anomalies: input.weighted_anomalies,
  };
}

// ─── Helpers d'extraction ─────────────────────────────────────────────────────

/**
 * Calcule les bornes marché min/max depuis les groupes n8n_price_data.
 * Exclut forfaits et mismatches unité (comparaison non fiable).
 * Compatible serveur (conclusion.ts) et client (AnalysisResult.tsx).
 */
export function computeMarketBounds(
  priceData: unknown[]
): { min: number; max: number; avg: number } {
  if (!Array.isArray(priceData)) return { min: 0, max: 0, avg: 0 };

  const FORFAIT_UNITS = new Set(["f", "fft", "ff", "ens", "forfait", "global", "prestation", "ensemble"]);
  const M2_UNITS      = ["m2", "m²", "m3", "m³"];
  const UNIT_LIKE     = ["u", "unité", "unite", "pce", "piece", "pièce"];

  let totalMin = 0;
  let totalMax = 0;
  let hasData  = false;

  for (const g of priceData) {
    if (!g || typeof g !== "object") continue;
    const group = g as Record<string, unknown>;
    if (group.job_type_label === "Autre") continue;

    const unit   = ((group.main_unit as string) || "").toLowerCase().trim();
    const prices: unknown[] = Array.isArray(group.prices) ? group.prices : [];
    if (prices.length === 0) continue;

    // Skip forfaits
    if (FORFAIT_UNITS.has(unit)) continue;

    // Skip mismatch surface/unité (unité type U mais catalogue en m²)
    const isUnitLike = UNIT_LIKE.some((u) => unit === u || unit.startsWith(u + " "));
    const isM2       = M2_UNITS.some((u)  => unit.includes(u));
    if (isUnitLike && !isM2) continue;

    const qty = typeof group.main_quantity === "number" && (group.main_quantity as number) > 0
      ? (group.main_quantity as number) : 1;

    let groupMin = 0;
    let groupMax = 0;
    for (const p of prices) {
      if (!p || typeof p !== "object") continue;
      const pr = p as Record<string, unknown>;
      groupMin += (typeof pr.price_min_unit_ht === "number" ? pr.price_min_unit_ht : 0) * qty
                + (typeof pr.fixed_min_ht       === "number" ? pr.fixed_min_ht       : 0);
      groupMax += (typeof pr.price_max_unit_ht === "number" ? pr.price_max_unit_ht : 0) * qty
                + (typeof pr.fixed_max_ht       === "number" ? pr.fixed_max_ht       : 0);
    }
    if (groupMax <= 0) continue;

    totalMin += groupMin;
    totalMax += groupMax;
    hasData   = true;
  }

  if (!hasData) return { min: 0, max: 0, avg: 0 };
  return { min: Math.round(totalMin), max: Math.round(totalMax), avg: Math.round((totalMin + totalMax) / 2) };
}

/**
 * Compte les anomalies "majeures" : postes dont le devis dépasse de >20% le max catalogue.
 */
export function countMajorAnomalies(priceData: unknown[]): number {
  if (!Array.isArray(priceData)) return 0;
  const FORFAIT_UNITS = new Set(["f", "fft", "ff", "ens", "forfait", "global", "prestation", "ensemble"]);

  let count = 0;
  for (const g of priceData) {
    if (!g || typeof g !== "object") continue;
    const group = g as Record<string, unknown>;
    if (group.job_type_label === "Autre") continue;

    const unit   = ((group.main_unit as string) || "").toLowerCase().trim();
    const prices = Array.isArray(group.prices) ? group.prices : [];
    if (prices.length === 0) continue;
    if (FORFAIT_UNITS.has(unit)) continue;

    const devisTotal = typeof group.devis_total_ht === "number" ? group.devis_total_ht : 0;
    if (devisTotal <= 0) continue;

    const qty = typeof group.main_quantity === "number" && (group.main_quantity as number) > 0
      ? (group.main_quantity as number) : 1;

    let maxHT = 0;
    for (const p of prices) {
      if (!p || typeof p !== "object") continue;
      const pr = p as Record<string, unknown>;
      maxHT += (typeof pr.price_max_unit_ht === "number" ? pr.price_max_unit_ht : 0) * qty
             + (typeof pr.fixed_max_ht       === "number" ? pr.fixed_max_ht       : 0);
    }
    if (maxHT <= 0) continue;

    if (devisTotal > maxHT * 1.20) count++;
  }
  return count;
}

/**
 * Analyse pondérée des anomalies par poste — V3.
 *
 * Pour chaque poste avec données marché :
 *   market_median = (price_min + price_max) / 2 × qty
 *   delta_pct     = (devis_total_ht - market_median) / market_median
 *   → surdévalué si delta_pct > +30%
 *   poids_poste   = devis_total_ht / totalDevis
 *
 * Règle anti-bug : un poste à +200% qui représente 2% du devis
 * contribue 2% au poids_anomalies, pas au surcoût global.
 *
 * @param priceData  Tableau n8n_price_data (groupes de postes)
 * @param totalDevis Total HT du devis (pour calculer les poids relatifs)
 */
export function computeWeightedAnomalies(
  priceData: unknown[],
  totalDevis: number,
): WeightedAnomaliesResult {
  const empty: WeightedAnomaliesResult = {
    poids_anomalies: 0, surcout_total: 0, surcout_pct: 0,
    impact_anomalies: "faible", anomalies_count: 0, total_analyzed: 0,
  };

  if (!Array.isArray(priceData) || totalDevis <= 0) return empty;

  const FORFAIT_UNITS = new Set(["f", "fft", "ff", "ens", "forfait", "global", "prestation", "ensemble"]);
  const M2_UNITS      = ["m2", "m²", "m3", "m³"];
  const UNIT_LIKE     = ["u", "unité", "unite", "pce", "piece", "pièce"];

  let poids_anomalies = 0;
  let surcout_total   = 0;
  let anomalies_count = 0;
  let total_analyzed  = 0;

  for (const g of priceData) {
    if (!g || typeof g !== "object") continue;
    const group = g as Record<string, unknown>;
    if (group.job_type_label === "Autre") continue;

    const unit   = ((group.main_unit as string) || "").toLowerCase().trim();
    const prices = Array.isArray(group.prices) ? group.prices : [];
    if (prices.length === 0) continue;

    // Skip forfaits (comparaison par unité non fiable)
    if (FORFAIT_UNITS.has(unit)) continue;

    // Skip mismatch surface/unité
    const isUnitLike = UNIT_LIKE.some((u) => unit === u || unit.startsWith(u + " "));
    const isM2       = M2_UNITS.some((u)  => unit.includes(u));
    if (isUnitLike && !isM2) continue;

    const devisTotal = typeof group.devis_total_ht === "number" ? group.devis_total_ht : 0;
    if (devisTotal <= 0) continue;

    const qty = typeof group.main_quantity === "number" && (group.main_quantity as number) > 0
      ? (group.main_quantity as number) : 1;

    // Médiane marché = (min + max) / 2
    let medMin = 0;
    let medMax = 0;
    for (const p of prices) {
      if (!p || typeof p !== "object") continue;
      const pr = p as Record<string, unknown>;
      medMin += (typeof pr.price_min_unit_ht === "number" ? pr.price_min_unit_ht : 0) * qty
              + (typeof pr.fixed_min_ht       === "number" ? pr.fixed_min_ht       : 0);
      medMax += (typeof pr.price_max_unit_ht === "number" ? pr.price_max_unit_ht : 0) * qty
              + (typeof pr.fixed_max_ht       === "number" ? pr.fixed_max_ht       : 0);
    }
    if (medMax <= 0) continue;

    total_analyzed++;

    const marketMedian = (medMin + medMax) / 2;
    const delta        = devisTotal - marketMedian;
    const delta_pct    = marketMedian > 0 ? delta / marketMedian : 0;
    const poids_poste  = devisTotal / totalDevis;

    // Seuil surdévaluation : +30% au-dessus de la médiane
    if (delta_pct > 0.30) {
      anomalies_count++;
      poids_anomalies += poids_poste;
      surcout_total   += delta;
    }
  }

  const surcout_pct = totalDevis > 0 ? surcout_total / totalDevis : 0;

  // V3.1 (2026-05-11) : seuils alignés sur computeVerdict (≥30% élevé, ≥10% modéré).
  // Avant : ≥50% élevé, ≥20% modéré — trop laxiste, faisait sortir des devis avec
  // 49% d'anomalies en "modéré" / "signer" (cf. Kern Terrassement).
  const impact_anomalies: WeightedAnomaliesResult["impact_anomalies"] =
    poids_anomalies >= 0.30 ? "élevé"  :
    poids_anomalies >= 0.10 ? "modéré" : "faible";

  return {
    poids_anomalies: Math.round(poids_anomalies * 1000) / 1000,
    surcout_total:   Math.round(surcout_total),
    surcout_pct:     Math.round(surcout_pct * 1000) / 1000,
    impact_anomalies,
    anomalies_count,
    total_analyzed,
  };
}

/**
 * Extrait les VerdictFlags depuis les tableaux criteres_rouges / criteres_oranges
 * produits par score.ts. Compatible serveur et client.
 */
export function extractFlagsFromCriteria(
  criteres_rouges: string[],
  criteres_oranges: string[],
): VerdictFlags {
  const join = [...criteres_rouges, ...criteres_oranges].map((s) => s.toLowerCase()).join(" | ");
  const rouge = criteres_rouges.map((s) => s.toLowerCase()).join(" | ");

  return {
    entreprise_radiee: (
      rouge.includes("radié")      || rouge.includes("radiee")     ||
      rouge.includes("cessation")  || rouge.includes("liquidation") ||
      rouge.includes("redressement") || rouge.includes("inactive") ||
      rouge.includes("inactif")    || rouge.includes("dissoute")   ||
      rouge.includes("dissolution")
    ),
    siret_invalide:              rouge.includes("siret") && (rouge.includes("invalid") || rouge.includes("inconnu")),
    absence_assurance:           rouge.includes("assurance") && rouge.includes("absente"),
    paiement_cash_suspect:       rouge.includes("espèces") || rouge.includes("especes") || rouge.includes("cash"),
    iban_suspect:                join.includes("iban") && (join.includes("étranger") || join.includes("invalide")),
    mentions_legales_manquantes: join.includes("mentions légales") || join.includes("mentions legales"),
    acompte_excessif:            join.includes("acompte") && (join.includes("50%") || join.includes("excessif") || join.includes("30%")),
    incoherence_contractuelle:   join.includes("incohér") || join.includes("incoher") || join.includes("contractuelle"),
  };
}

/**
 * Extrait le statut juridique brut de l'entreprise depuis les critères produits par score.ts.
 * Retourne la chaîne brute à passer dans VerdictInput.company_status (normalisée par normalizeCompanyStatus).
 * Retourne null si aucun statut détectable.
 */
export function extractCompanyStatusFromCriteria(criteres_rouges: string[]): string | null {
  const COMPANY_STATUS_PATTERNS: Array<{ pattern: RegExp; status: string }> = [
    { pattern: /cessation\s*d.activit/i,      status: "cessation d'activité" },
    { pattern: /en\s+cessation/i,             status: "cessation" },
    { pattern: /cessation/i,                  status: "cessation" },
    { pattern: /liquidation\s+judiciaire/i,   status: "liquidation judiciaire" },
    { pattern: /liquidation/i,                status: "liquidation" },
    { pattern: /redressement\s+judiciaire/i,  status: "redressement judiciaire" },
    { pattern: /redressement/i,               status: "redressement" },
    { pattern: /radi[eé]{1,2}/i,              status: "radiée" },
    { pattern: /radiation/i,                  status: "radiation" },
    { pattern: /inactif|inactive/i,           status: "inactive" },
    { pattern: /dissout[e]?|dissolution/i,    status: "dissoute" },
    { pattern: /procédure\s+collective/i,     status: "procédure collective" },
    { pattern: /procedure\s+collective/i,     status: "procédure collective" },
  ];

  for (const crit of criteres_rouges) {
    for (const { pattern, status } of COMPANY_STATUS_PATTERNS) {
      if (pattern.test(crit)) return status;
    }
  }
  return null;
}

/**
 * Dérive le company_risk depuis les critères.
 */
export function extractCompanyRisk(
  criteres_rouges: string[],
  criteres_oranges: string[],
): "low" | "medium" | "high" {
  if (criteres_rouges.some((r) =>
    r.toLowerCase().includes("radié") ||
    r.toLowerCase().includes("procédure") ||
    r.toLowerCase().includes("endettement") ||
    r.toLowerCase().includes("pertes")
  )) return "high";

  if (criteres_oranges.length > 0) return "medium";
  return "low";
}

// ─── Raisons du verdict (UI "Pourquoi ce verdict ?") ──────────────────────────

export interface VerdictReasonsInput {
  verdict:               VerdictDecision;
  overprice:             number;
  overprice_pct:         number;
  anomalies_major_count: number;
  company_risk:          "low" | "medium" | "high";
  flags:                 VerdictFlags;
  has_market_data:       boolean;
  market_dispersion_pct: number;
  chantier_complexity:   "low" | "medium" | "high";
  threshold_ok:          number;
  /** Cause du hard block si applicable ("company_status" | "flags"). */
  hard_block_reason?:    "company_status" | "flags";
  /** Statut brut de l'entreprise (ex: "cessation d'activité"). Affiché dans le reason. */
  company_status?:       string;
  /** V3 — analyse pondérée (si disponible, module le wording prix). */
  weighted_anomalies?:   WeightedAnomaliesResult;
}

export interface VerdictReasonsResult {
  /** Résumé 1 ligne — impact immédiat, affiché en tête. */
  summary: string;
  /** Problèmes : prix, anomalies, risque. Max 3. Jamais dispersion ni complexité. */
  reasons: string[];
  /** Contexte secondaire : dispersion marché, complexité chantier. Max 2. */
  context: string[];
}

/** Formatte un montant en k€ si ≥ 1 000, sinon en € entiers. */
function fmtEur(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return `${Math.round(abs / 100) / 10} k€`;
  return `${Math.round(abs)} €`;
}

/** Formatte un pourcentage en entier avec signe. */
function fmtPct(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${Math.round(pct * 100)} %`;
}

/**
 * Génère le bloc "Pourquoi ce verdict ?" structuré en 3 parties :
 *   - summary : résumé 1 ligne (impact immédiat)
 *   - reasons : problèmes réels (prix, anomalies, risque) — max 3
 *   - context : informations secondaires (dispersion, complexité) — max 2, séparés visuellement
 */
export function generateVerdictReasons(input: VerdictReasonsInput): VerdictReasonsResult {
  const {
    verdict, overprice, overprice_pct, anomalies_major_count,
    company_risk, flags, has_market_data,
    market_dispersion_pct, chantier_complexity, threshold_ok,
    hard_block_reason, company_status, weighted_anomalies,
  } = input;

  const wa = weighted_anomalies;

  // ── Summary — 1 ligne, toujours présent ──────────────────────────────────────
  // V3.1 : le wording du summary doit toujours être cohérent avec le verdict.
  // Avant : si verdict="a_negocier" + impact="faible" → "Devis globalement cohérent"
  // → contradiction visible avec le bandeau "À renégocier" affiché par-dessus.
  const summary =
    hard_block_reason === "company_status"
      ? "🛑 Ne signez pas ce devis — entreprise juridiquement à risque"
    : verdict === "refuser"
      ? "Ce devis présente un risque élevé — ne signez pas"
    : verdict === "a_negocier"
      ? "Ce devis présente des postes à renégocier avant signature"
    : "Ce devis est cohérent avec les prix du marché";

  const reasons: string[] = [];

  // ── 0. Hard block priorité absolue — statut juridique ────────────────────────
  // RÈGLE : une entreprise à risque juridique force REFUSER, sans exception.
  if (hard_block_reason === "company_status") {
    const statusLabel = company_status ? ` (${company_status})` : "";
    reasons.push(`⛔ Situation juridique à risque${statusLabel} — ne signez pas sans vérification approfondie`);
    reasons.push("⛔ Une entreprise en cessation, liquidation ou redressement ne peut pas garantir l'achèvement des travaux");
    return { summary, reasons, context: [] };
  }

  // ── 1. Hard blocks (flags) ────────────────────────────────────────────────────
  if (flags.entreprise_radiee) {
    reasons.push("⛔ Cette entreprise est radiée — elle ne peut pas légalement réaliser les travaux");
  }
  if (flags.siret_invalide) {
    reasons.push("⛔ Numéro SIRET invalide ou inconnu — entreprise non identifiable");
  }
  if (flags.absence_assurance) {
    reasons.push("⛔ Aucune assurance décennale mentionnée — risque juridique majeur");
  }
  if (flags.paiement_cash_suspect) {
    reasons.push("⛔ Paiement en espèces demandé — pratique illégale au-delà de 1 000 €");
  }
  if (flags.iban_suspect) {
    reasons.push("⛔ IBAN étranger ou invalide — risque de fraude");
  }

  // Hard block : on retourne immédiatement, sans contexte (pas pertinent ici)
  if (reasons.length > 0) {
    return { summary, reasons: reasons.slice(0, 3), context: [] };
  }

  // ── 2. Prix ───────────────────────────────────────────────────────────────────
  if (has_market_data) {
    // GARDE STRICTE — toute narration positive ("prix attractif", "conforme") est interdite
    // dès qu'au moins un poste est en anomalie marché. Un devis qui se compense globalement
    // (gros sur-prix carrelage + bonne affaire terrassement) n'est PAS "attractif" : il est
    // mal ventilé. Sans cette garde, on a vu Kern Terrassement sortir
    // "+5 900€ trop cher" + "Prix attractif sous la moyenne" sur la même page.
    //
    // V3.2 (2026-05-11) : on prend le MAX des deux signaux (wa et legacy) au lieu d'un ?? :
    // - wa.anomalies_count peut renvoyer 0 si la fonction `computeWeightedAnomalies` filtre
    //   les postes (forfaits, mismatch unité…) alors que `anomalies_major_count` les compte.
    // - L'inverse est aussi possible. On veut le signal le plus défensif → MAX.
    const hasAnomalies = Math.max(wa?.anomalies_count ?? 0, anomalies_major_count) > 0;

    if (verdict === "signer") {
      if (hasAnomalies) {
        const n = wa?.anomalies_count ?? anomalies_major_count;
        const surcoutPostes = wa?.surcout_total ?? 0;
        reasons.push(
          surcoutPostes > 0
            ? `⚠️ ${n} poste${n > 1 ? "s" : ""} au-dessus du marché — surcoût ${fmtEur(surcoutPostes)} à renégocier`
            : `⚠️ ${n} poste${n > 1 ? "s" : ""} à vérifier avant signature`
        );
      } else if (overprice_pct < -0.05) {
        reasons.push(`✅ Prix attractif — environ ${fmtEur(-overprice)} sous la moyenne du marché`);
      } else {
        reasons.push("✅ Prix conforme au marché");
      }
    } else if (verdict === "a_negocier") {
      if (wa && wa.impact_anomalies === "faible") {
        // Impact faible : ne pas alarmer avec un gros montant global
        reasons.push(`⚠️ Certains postes présentent des prix élevés — impact sur le total : ${fmtPct(wa.surcout_pct)}`);
      } else if (wa) {
        reasons.push(`⚠️ Postes trop élevés représentant ${Math.round(wa.poids_anomalies * 100)}% du devis (surcoût estimé : ${fmtEur(wa.surcout_total)})`);
      } else {
        reasons.push(
          overprice_pct <= threshold_ok
            ? `⚠️ Prix légèrement au-dessus du marché (${fmtPct(overprice_pct)})`
            : `⚠️ Vous payez environ ${fmtEur(overprice)} au-dessus du marché (${fmtPct(overprice_pct)})`
        );
      }
    } else {
      // refuser — prix fortement dépassé
      if (wa) {
        reasons.push(`🛑 Postes trop élevés représentant ${Math.round(wa.poids_anomalies * 100)}% du devis — surcoût estimé ${fmtEur(wa.surcout_total)}`);
      } else {
        reasons.push(`🛑 Prix fortement au-dessus du marché — surcoût estimé ${fmtEur(overprice)} (${fmtPct(overprice_pct)})`);
      }
    }
  }

  // ── 3. Anomalies ──────────────────────────────────────────────────────────────
  if (verdict === "signer") {
    // Cas signer : ton positif ou neutre, max 2 raisons.
    // Note : si des anomalies existent, on a DÉJÀ ajouté une alerte dans la section Prix ci-dessus
    // (via la garde stricte). On ne réécrit pas un message pédagogique séparé qui pourrait
    // adoucir l'alerte précédente.
    // V3.2 — même garde que section Prix : MAX des 2 signaux (cf. commentaire ci-dessus)
    const hasAnomaliesHere = Math.max(wa?.anomalies_count ?? 0, anomalies_major_count) > 0;
    if (!hasAnomaliesHere) {
      reasons.push("✅ Aucun écart significatif détecté sur les postes");
    }
    // Cap à 2 pour le cas signer
    return { summary, reasons: reasons.slice(0, 2), context: [] };
  }

  // Cas a_negocier ou refuser
  const effectiveAnomaliesCount = wa ? wa.anomalies_count : anomalies_major_count;
  if (effectiveAnomaliesCount >= 2) {
    reasons.push(`⚠️ ${effectiveAnomaliesCount} postes présentent des prix anormalement élevés`);
  } else if (effectiveAnomaliesCount === 1) {
    reasons.push("⚠️ 1 poste présente un prix anormalement élevé");
  }

  // ── 4. Risque contractuel ─────────────────────────────────────────────────────
  if (reasons.length < 3) {
    if (flags.mentions_legales_manquantes) {
      reasons.push("⚠️ Informations légales incomplètes sur le devis");
    } else if (flags.acompte_excessif) {
      reasons.push("⚠️ Acompte demandé trop élevé (risque financier)");
    } else if (flags.incoherence_contractuelle) {
      reasons.push("⚠️ Incohérences dans les clauses contractuelles");
    } else if (company_risk === "high") {
      reasons.push("⚠️ Signaux d'alerte sur la situation de l'entreprise");
    }
  }

  // ── 5. Contexte (séparé des raisons — jamais mélangé) ────────────────────────
  const context: string[] = [];
  if (market_dispersion_pct > 0.4) {
    context.push("📊 Marché très variable — les prix peuvent fortement différer selon les artisans");
  }
  if (chantier_complexity === "high") {
    context.push("🔧 Travaux complexes — des écarts de prix sont possibles");
  }

  return { summary, reasons: reasons.slice(0, 3), context: context.slice(0, 2) };
}
