/**
 * verdictEngine — source de vérité unique du verdict devis
 *
 * Règles déterministes, sans IA, sans état.
 * Utilisé côté client (AnalysisResult) ET côté serveur (conclusion.ts API route).
 *
 * Ordre de priorité : hard_block > prix > risque
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
  has_market_data:       boolean;        // faux si market_estimate_max === 0
  price_label:           string;         // libellé UX du positionnement prix
  // V2
  threshold_ok:          number;         // seuil "dans la norme" calculé (adaptatif)
  threshold_refuse:      number;         // seuil "refuser" (fixe : 0.20)
  market_dispersion_pct: number;         // dispersion effective utilisée
  chantier_complexity:   "low" | "medium" | "high";
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

// ─── Moteur ───────────────────────────────────────────────────────────────────

export function computeVerdict(input: VerdictInput): VerdictResult {
  const {
    total_amount, market_estimate_min, market_estimate_max,
    anomalies_major_count, company_risk, flags,
    chantier_complexity = "medium",
  } = input;

  const has_market_data = market_estimate_max > 0;

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
      is_hard_block: true, has_market_data,
      price_label: "🛑 Devis anormal — ne signez pas",
      threshold_ok, threshold_refuse: THRESHOLD_REFUSE,
      market_dispersion_pct, chantier_complexity,
    };
  }

  // ── 2. Verdict prix ───────────────────────────────────────────────────────────
  let price_verdict: VerdictDecision;

  if (!has_market_data) {
    price_verdict = "signer";
  } else if (overprice_pct <= threshold_ok && anomalies_major_count === 0) {
    price_verdict = "signer";
  } else if (overprice_pct <= THRESHOLD_REFUSE && anomalies_major_count <= 1) {
    price_verdict = "a_negocier";
  } else {
    price_verdict = "refuser";
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

  // ── 4b. Edge case anomalies multiples ────────────────────────────────────────
  // Si plusieurs postes sont anormaux (≥2) mais le prix global reste dans la norme,
  // on monte à "a_negocier" : plusieurs anomalies isolées constituent un signal fort.
  if (anomalies_major_count >= 2 && verdict === "signer") {
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
 * Génère 1 à 3 raisons courtes expliquant le verdict au particulier.
 * Aucun jargon, 1 chiffre si possible, cohérent avec computeVerdict().
 * Utilisé dans la section UI "Pourquoi ce verdict ?".
 */
export function generateVerdictReasons(input: VerdictReasonsInput): string[] {
  const {
    verdict, overprice, overprice_pct, anomalies_major_count,
    company_risk, flags, has_market_data,
    market_dispersion_pct, chantier_complexity, threshold_ok,
  } = input;

  const reasons: string[] = [];

  // ── 1. Hard blocks — priorité absolue ────────────────────────────────────────
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

  // Si hard block détecté, les raisons suivantes ne sont pas utiles
  if (reasons.length > 0) return reasons.slice(0, 3);

  // ── 2. Prix ───────────────────────────────────────────────────────────────────
  if (has_market_data) {
    if (verdict === "signer") {
      if (overprice_pct <= threshold_ok && overprice_pct >= -0.05) {
        reasons.push("✅ Prix conforme au marché");
      } else if (overprice_pct < -0.05) {
        reasons.push(`✅ Prix attractif — environ ${fmtEur(-overprice)} sous la moyenne du marché`);
      }
    } else if (verdict === "a_negocier") {
      reasons.push(
        overprice_pct <= threshold_ok
          ? `⚠️ Prix légèrement au-dessus du marché (${fmtPct(overprice_pct)})`
          : `⚠️ Vous payez environ ${fmtEur(overprice)} au-dessus du marché (${fmtPct(overprice_pct)})`
      );
    } else {
      // refuser
      reasons.push(`🛑 Prix fortement au-dessus du marché — surcoût estimé ${fmtEur(overprice)} (${fmtPct(overprice_pct)})`);
    }
  } else if (verdict === "signer") {
    // Pas de données marché et verdict OK → rassurer sans chiffre
    reasons.push("✅ Aucune anomalie de prix détectée");
  }

  // ── 3. Anomalies ──────────────────────────────────────────────────────────────
  if (anomalies_major_count >= 2) {
    reasons.push(`⚠️ ${anomalies_major_count} postes présentent des prix anormalement élevés`);
  } else if (anomalies_major_count === 1) {
    if (verdict !== "signer") {
      reasons.push("⚠️ 1 poste présente un prix anormalement élevé");
    }
  } else if (verdict === "signer") {
    reasons.push("✅ Aucune anomalie détectée sur les postes de travaux");
  }

  // ── 4. Risque contractuel / entreprise ───────────────────────────────────────
  if (flags.mentions_legales_manquantes) {
    reasons.push("⚠️ Informations légales incomplètes sur le devis");
  } else if (flags.acompte_excessif) {
    reasons.push("⚠️ Acompte demandé trop élevé (risque financier)");
  } else if (flags.incoherence_contractuelle) {
    reasons.push("⚠️ Incohérences dans les clauses contractuelles");
  } else if (company_risk === "high" && reasons.length < 3) {
    reasons.push("⚠️ Signaux d'alerte sur la situation de l'entreprise");
  }

  // ── 5. Contexte intelligent (marché + complexité) ─────────────────────────────
  // Ajouté uniquement si on a encore de la place et que c'est pertinent
  if (reasons.length < 3) {
    if (market_dispersion_pct > 0.4) {
      reasons.push("ℹ️ Les prix varient fortement selon les artisans — comparez plusieurs devis");
    } else if (chantier_complexity === "high" && verdict !== "signer") {
      reasons.push("ℹ️ Travaux complexes — des écarts de prix sont possibles");
    }
  }

  // ── Cas signer sans raison générée (très rare) ────────────────────────────────
  if (reasons.length === 0) {
    reasons.push("✅ Prix dans la norme, aucune anomalie, entreprise identifiable");
  }

  return reasons.slice(0, 3);
}
