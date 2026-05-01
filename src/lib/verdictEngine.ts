/**
 * verdictEngine — source de vérité unique du verdict devis
 *
 * Règles déterministes, sans IA, sans état.
 * Utilisé côté client (AnalysisResult) ET côté serveur (conclusion.ts API route).
 *
 * Ordre de priorité : hard_block > prix > risque
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

export interface VerdictInput {
  total_amount:          number;   // total HT du devis
  market_estimate_min:   number;   // borne basse marché (0 si inconnu)
  market_estimate_max:   number;   // borne haute marché (0 si inconnu)
  anomalies_major_count: number;   // postes > 20% au-dessus du max catalogue
  anomalies_total_count: number;   // tous les postes avec anomalie prix
  company_risk:          "low" | "medium" | "high";
  flags:                 VerdictFlags;
}

export type VerdictDecision = "signer" | "a_negocier" | "refuser";
export type VerdictColor    = "green"  | "orange"     | "red";

export interface VerdictResult {
  verdict:               VerdictDecision;
  color:                 VerdictColor;
  /** Couleur au format legacy VERT/ORANGE/ROUGE pour compatibilité getScoreBadge() */
  score_legacy:          "VERT" | "ORANGE" | "ROUGE";
  overprice:             number;   // € au-dessus de la moyenne marché (peut être négatif)
  overprice_pct:         number;   // ratio vs moyenne (0.10 = 10% au-dessus)
  anomalies_major_count: number;
  is_hard_block:         boolean;  // vrai si entreprise bloquante indépendamment du prix
  has_market_data:       boolean;  // faux si market_estimate_max === 0
  /** Libellé court pour le label de prix (évite "signer" quand prix élevé) */
  price_label:           string;
}

// ─── Constantes de seuil ─────────────────────────────────────────────────────

/** Surcoût ≤ 5% : dans la norme, pas d'alerte prix */
const THRESHOLD_NORMAL   = 0.05;
/** Surcoût ≤ 15% : négociable */
const THRESHOLD_NEGOCIER = 0.15;

// ─── Moteur ───────────────────────────────────────────────────────────────────

export function computeVerdict(input: VerdictInput): VerdictResult {
  const { total_amount, market_estimate_min, market_estimate_max,
          anomalies_major_count, company_risk, flags } = input;

  const has_market_data = market_estimate_max > 0;

  // Calcul prix
  const avg_market   = has_market_data ? (market_estimate_min + market_estimate_max) / 2 : 0;
  const overprice    = has_market_data ? total_amount - avg_market : 0;
  const overprice_pct = (has_market_data && avg_market > 0) ? overprice / avg_market : 0;

  // ── 1. Hard block — sécurité absolue ────────────────────────────────────────
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
      is_hard_block: true, has_market_data,
      price_label: "Risque entreprise critique",
    };
  }

  // ── 2. Verdict prix ──────────────────────────────────────────────────────────
  let price_verdict: VerdictDecision;

  if (!has_market_data) {
    // Pas de données marché → on ne peut pas condamner sur le prix
    price_verdict = "signer";
  } else if (overprice_pct <= THRESHOLD_NORMAL && anomalies_major_count === 0) {
    price_verdict = "signer";
  } else if (overprice_pct <= THRESHOLD_NEGOCIER && anomalies_major_count <= 1) {
    price_verdict = "a_negocier";
  } else {
    price_verdict = "refuser";
  }

  // ── 3. Verdict risque ────────────────────────────────────────────────────────
  let risk_verdict: VerdictDecision = "signer";

  if (
    flags.mentions_legales_manquantes ||
    flags.acompte_excessif            ||
    flags.incoherence_contractuelle   ||
    company_risk === "high"
  ) {
    risk_verdict = "a_negocier";
  }

  // ── 4. Merge — gravité maximale ──────────────────────────────────────────────
  const SEVERITY: Record<VerdictDecision, number> = { signer: 0, a_negocier: 1, refuser: 2 };
  const verdict: VerdictDecision =
    SEVERITY[price_verdict] >= SEVERITY[risk_verdict] ? price_verdict : risk_verdict;

  // ── 5. Couleur ───────────────────────────────────────────────────────────────
  const color: VerdictColor =
    verdict === "refuser"   ? "red"    :
    verdict === "a_negocier" ? "orange" : "green";

  const score_legacy =
    verdict === "refuser"    ? "ROUGE"  :
    verdict === "a_negocier" ? "ORANGE" : "VERT";

  // ── 6. Label prix (règle UX critique) ────────────────────────────────────────
  // INTERDIT d'afficher "Vous pouvez signer" si prix > 5% au-dessus
  const price_label = (verdict === "signer" && overprice_pct > THRESHOLD_NORMAL && has_market_data)
    ? "Prix légèrement au-dessus du marché — à vérifier"
    : verdict === "signer"    ? "Prix dans la norme"
    : verdict === "a_negocier" ? "Prix à négocier"
    : "Prix trop élevé";

  return {
    verdict, color, score_legacy,
    overprice, overprice_pct, anomalies_major_count,
    is_hard_block: false, has_market_data, price_label,
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
    entreprise_radiee:           rouge.includes("radié") || rouge.includes("radiee"),
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
