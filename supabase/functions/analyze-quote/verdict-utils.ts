/**
 * verdict-utils.ts — Deno-compatible duplicate of src/lib/verdictEngine.ts
 *
 * Copie intentionnelle — verdictEngine.ts est un module Node.js/React importé
 * côté client. Les edge functions Deno ne peuvent pas l'importer directement.
 *
 * RÈGLE : toute modification logique dans verdictEngine.ts DOIT être répercutée ici.
 * Fonctions exportées : computeVerdict, computeMarketBounds, countMajorAnomalies,
 *                       normalizeCompanyStatus, attributeGroupsToSegments,
 *                       computeGlobalFromSegments
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VerdictFlags {
  entreprise_radiee:           boolean;
  siret_invalide:              boolean;
  absence_assurance:           boolean;
  paiement_cash_suspect:       boolean;
  iban_suspect:                boolean;
  mentions_legales_manquantes: boolean;
  acompte_excessif:            boolean;
  incoherence_contractuelle:   boolean;
}

export interface VerdictInput {
  total_amount:           number;
  market_estimate_min:    number;
  market_estimate_max:    number;
  anomalies_major_count:  number;
  anomalies_total_count:  number;
  company_risk:           "low" | "medium" | "high";
  flags:                  VerdictFlags;
  market_dispersion_pct?: number;
  chantier_complexity?:   "low" | "medium" | "high";
  company_status?:        string;
}

export type VerdictDecision = "signer" | "a_negocier" | "refuser";
export type VerdictColor    = "green"  | "orange"     | "red";

export interface VerdictResult {
  verdict:               VerdictDecision;
  color:                 VerdictColor;
  score_legacy:          "VERT" | "ORANGE" | "ROUGE";
  overprice:             number;
  overprice_pct:         number;
  anomalies_major_count: number;
  is_hard_block:         boolean;
  hard_block_reason?:    "company_status" | "flags";
  has_market_data:       boolean;
  price_label:           string;
  threshold_ok:          number;
  threshold_refuse:      number;
  market_dispersion_pct: number;
  chantier_complexity:   "low" | "medium" | "high";
}

/** Résultat d'analyse par segment (artisan) */
export interface SegmentAnalysis {
  // Identité artisan
  lot_type:             string;
  entreprise_nom:       string;
  siret:                string | null;
  // Montants du devis
  total_ht:             number | null;
  total_ttc:            number | null;
  // Analyse marché
  market_min:           number;
  market_max:           number;
  market_avg:           number;
  // Verdict
  verdict:              VerdictDecision;
  score_legacy:         "VERT" | "ORANGE" | "ROUGE";
  overprice:            number;
  overprice_pct:        number;
  anomalies_count:      number;
  has_market_data:      boolean;
  // Groupes de prix marché attribués à ce segment
  market_groups:        unknown[];
}

/** Métriques globales agrégées de tous les segments */
export interface GlobalMetrics {
  verdict_global:    VerdictDecision;
  score_legacy:      "VERT" | "ORANGE" | "ROUGE";
  total_devis_ht:    number;
  total_marche_min:  number;
  total_marche_max:  number;
  total_marche_avg:  number;
  overprice_total:   number;
  overprice_pct:     number;
  segments_count:    number;
  segments_rouge:    number;
  segments_orange:   number;
  segments_vert:     number;
}

// ─── Constantes ────────────────────────────────────────────────────────────────

const THRESHOLD_OK_BASE  = 0.08;
const THRESHOLD_REFUSE   = 0.20;
const THRESHOLD_OK_MIN   = 0.06;
const THRESHOLD_OK_MAX   = 0.15;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalizeCompanyStatus(status: string): "ok" | "risk" {
  if (!status || typeof status !== "string") return "ok";
  const s = status.toLowerCase().trim();

  if (
    s === "active"       ||
    s === "en activité"  ||
    s === "en activite"  ||
    s === "actif"        ||
    s === "actif (inscrit au rcs)"
  ) return "ok";

  const RISK_KEYWORDS = [
    "cessation", "radiation", "radiée", "radiee", "radié", "radie",
    "liquidation", "redressement", "inactive", "inactif",
    "dissoute", "dissolution", "fermée", "ferme",
    "radiée du rcs", "procédure collective", "procedure collective",
  ];
  for (const keyword of RISK_KEYWORDS) {
    if (s.includes(keyword)) return "risk";
  }
  return "ok";
}

// ─── computeVerdict ────────────────────────────────────────────────────────────

export function computeVerdict(input: VerdictInput): VerdictResult {
  const {
    total_amount, market_estimate_min, market_estimate_max,
    anomalies_major_count, company_risk, flags,
    chantier_complexity = "medium",
    company_status,
  } = input;

  const has_market_data = market_estimate_max > 0;

  // 0. PRIORITÉ ABSOLUE — statut juridique
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

  const avg_market    = has_market_data ? (market_estimate_min + market_estimate_max) / 2 : 0;
  const overprice     = has_market_data ? total_amount - avg_market : 0;
  const overprice_pct = (has_market_data && avg_market > 0) ? overprice / avg_market : 0;

  const market_dispersion_pct = input.market_dispersion_pct !== undefined
    ? input.market_dispersion_pct
    : (has_market_data && avg_market > 0)
      ? (market_estimate_max - market_estimate_min) / avg_market
      : 0;

  let threshold_ok = THRESHOLD_OK_BASE;
  if (market_dispersion_pct > 0.40) threshold_ok += 0.03;
  if (market_dispersion_pct > 0.60) threshold_ok += 0.02;
  if (chantier_complexity === "high") threshold_ok += 0.03;
  if (chantier_complexity === "low")  threshold_ok -= 0.02;
  threshold_ok = clamp(threshold_ok, THRESHOLD_OK_MIN, THRESHOLD_OK_MAX);

  // 1. Hard block — sécurité absolue
  const is_hard_block = (
    flags.entreprise_radiee     ||
    flags.siret_invalide        ||
    flags.absence_assurance     ||
    flags.paiement_cash_suspect ||
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

  // 2. Verdict prix
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

  // 3. Verdict risque
  let risk_verdict: VerdictDecision = "signer";
  if (
    flags.mentions_legales_manquantes ||
    flags.acompte_excessif            ||
    flags.incoherence_contractuelle   ||
    company_risk === "high"
  ) {
    risk_verdict = "a_negocier";
  }

  // 4. Merge — gravité maximale
  const SEVERITY: Record<VerdictDecision, number> = { signer: 0, a_negocier: 1, refuser: 2 };
  let verdict: VerdictDecision =
    SEVERITY[price_verdict] >= SEVERITY[risk_verdict] ? price_verdict : risk_verdict;

  // 4b. Edge case anomalies multiples
  if (anomalies_major_count >= 2 && verdict === "signer") {
    verdict = "a_negocier";
  }

  // 5. Couleur
  const color: VerdictColor =
    verdict === "refuser"    ? "red"    :
    verdict === "a_negocier" ? "orange" : "green";
  const score_legacy =
    verdict === "refuser"    ? "ROUGE"  :
    verdict === "a_negocier" ? "ORANGE" : "VERT";

  // 6. Label prix
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

// ─── computeMarketBounds ───────────────────────────────────────────────────────

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
    if (FORFAIT_UNITS.has(unit)) continue;

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

// ─── countMajorAnomalies ───────────────────────────────────────────────────────

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

// ─── attributeGroupsToSegments ─────────────────────────────────────────────────
/**
 * RÈGLE 1 — Matching STRICT : attribue chaque groupe de prix marché au bon segment artisan.
 *
 * Algorithme (3 niveaux, par ordre de priorité) :
 *
 *   Niveau 1 — Exact description match :
 *     Chaque devis_line.description est comparée exactement (après normalisation) aux
 *     libellés du segment (seg.lignes[].libelle). Le segment avec le plus de matches
 *     stricts remporte le groupe.
 *
 *   Niveau 2 — Fallback lot_type (si 0 match au niveau 1) :
 *     Compare le job_type_label du groupe au lot_type de chaque segment.
 *     Attribution au premier segment dont le lot_type normalisé contient le job_type_label.
 *
 *   Niveau 3 — Fallback proportionnel (si toujours 0 match) :
 *     Distribue le groupe au segment ayant le plus de lignes (indicateur de volume).
 *     Log warning explicite.
 *
 * INTERDIT : scoring probabiliste / fuzzy. En cas d'ambiguïté stricte (ex-æquo),
 *   le premier segment gagne + warning loggé.
 *
 * @param priceGroups  — tableau n8nPriceDataForFrontend
 * @param segments     — tableau DevisSegment extrait
 * @returns Map segmentIndex → PriceGroup[]
 */
export function attributeGroupsToSegments(
  priceGroups: unknown[],
  segments: Array<{
    entreprise_nom: string;
    siret?: string | null;
    lot_type?: string;
    lignes: Array<{ libelle: string }>;
  }>
): Map<number, unknown[]> {
  const result = new Map<number, unknown[]>();
  for (let i = 0; i < segments.length; i++) result.set(i, []);

  if (segments.length === 0) return result;

  // Cas trivial : 1 seul artisan → tout lui appartient
  if (segments.length === 1) {
    for (const g of priceGroups) if (g) result.get(0)!.push(g);
    return result;
  }

  // ── Niveau 1 : index exact des libellés normalisés → Set d'indices de segments ──
  // Un même libellé peut apparaître chez 2 artisans (ex: "Dépose carrelage") → on note -1
  const libelleIndex = new Map<string, number>(); // clé normalisée → segIdx (-1 = ambiguë)
  for (let si = 0; si < segments.length; si++) {
    for (const ligne of segments[si].lignes) {
      const key = normalizeStrict(ligne.libelle);
      if (key.length < 3) continue;
      if (libelleIndex.has(key)) {
        if (libelleIndex.get(key) !== si) libelleIndex.set(key, -1); // collision inter-segments
      } else {
        libelleIndex.set(key, si);
      }
    }
  }

  // ── Niveau 2 : lot_type normalisé par segment (pour fallback) ─────────────────
  const segLotTypes: string[] = segments.map(
    (s) => normalizeStrict(s.lot_type ?? s.entreprise_nom)
  );

  for (const group of priceGroups) {
    if (!group || typeof group !== "object") continue;
    const g = group as Record<string, unknown>;
    const devisLines: unknown[] = Array.isArray(g.devis_lines) ? g.devis_lines : [];
    const groupLabel = typeof g.job_type_label === "string" ? g.job_type_label : "";

    // ── Niveau 1 : exact match description → libellé ──────────────────────────
    const matchCounts = new Array<number>(segments.length).fill(0);
    let totalLinesChecked = 0;

    for (const line of devisLines) {
      if (!line || typeof line !== "object") continue;
      const l = line as Record<string, unknown>;
      const desc = normalizeStrict(typeof l.description === "string" ? l.description : "");
      if (desc.length < 3) continue;
      totalLinesChecked++;
      const si = libelleIndex.get(desc);
      if (si !== undefined && si !== -1) matchCounts[si]++;
    }

    const maxMatches = Math.max(...matchCounts);

    if (maxMatches > 0) {
      // Au moins 1 match exact non-ambigu
      const winners = matchCounts.reduce<number[]>((acc, c, i) => c === maxMatches ? [...acc, i] : acc, []);
      if (winners.length > 1) {
        console.warn(
          `[MultiDevis] WARN group "${groupLabel}": ex-æquo exact match (${winners.map(i => segments[i].entreprise_nom).join(", ")}) — assigné à ${segments[winners[0]].entreprise_nom}`
        );
      }
      result.get(winners[0])!.push(group);
      continue;
    }

    // ── Niveau 2 : fallback lot_type ──────────────────────────────────────────
    const groupLabelNorm = normalizeStrict(groupLabel);
    if (groupLabelNorm.length >= 3) {
      let lotMatch = -1;
      for (let si = 0; si < segments.length; si++) {
        const lt = segLotTypes[si];
        if (lt.includes(groupLabelNorm) || groupLabelNorm.includes(lt)) {
          if (lotMatch === -1) {
            lotMatch = si;
          } else {
            lotMatch = -1; // plusieurs segments correspondent → ambiguë
            break;
          }
        }
      }
      if (lotMatch !== -1) {
        console.warn(
          `[MultiDevis] WARN group "${groupLabel}": 0 exact match — fallback lot_type → ${segments[lotMatch].entreprise_nom}`
        );
        result.get(lotMatch)!.push(group);
        continue;
      }
    }

    // ── Niveau 3 : fallback proportionnel (segment le plus volumineux) ────────
    let maxLignes = -1;
    let bestSi    = 0;
    for (let si = 0; si < segments.length; si++) {
      const n = segments[si].lignes.length;
      if (n > maxLignes) { maxLignes = n; bestSi = si; }
    }
    console.warn(
      `[MultiDevis] WARN group "${groupLabel}": aucun match (${totalLinesChecked} lignes vérifiées) — fallback proportionnel → ${segments[bestSi].entreprise_nom}`
    );
    result.get(bestSi)!.push(group);
  }

  return result;
}

/** Normalisation stricte : lowercase, sans accents, sans ponctuation, espaces normalisés */
function normalizeStrict(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── computeGlobalFromSegments ─────────────────────────────────────────────────
/**
 * RÈGLE 4 — Agrégation stricte :
 *   - verdict_global = worst verdict des segments (refuser > a_negocier > signer)
 *   - total_devis_ht = Σ ALL segments (pour information complète)
 *   - delta / overprice = calculé UNIQUEMENT sur les segments avec données marché
 *     → évite de gonfler le surcoût avec des artisans hors-catalogue
 */
const SEVERITY: Record<string, number> = { signer: 0, a_negocier: 1, refuser: 2 };

export function computeGlobalFromSegments(
  segmentAnalyses: SegmentAnalysis[]
): GlobalMetrics {
  let verdictGlobal: VerdictDecision = "signer";
  let totalDevisHT  = 0;
  let rouge = 0, orange = 0, vert = 0;

  // Delta (surcoût) uniquement sur segments avec données marché — RÈGLE 4
  let deltaDevisHT   = 0;
  let deltaMarcheMin = 0;
  let deltaMarcheMax = 0;
  let totalMarcheMin = 0;
  let totalMarcheMax = 0;

  for (const seg of segmentAnalyses) {
    // Worst verdict wins — RÈGLE 4
    if (SEVERITY[seg.verdict] > SEVERITY[verdictGlobal]) {
      verdictGlobal = seg.verdict;
    }

    // Total brut toutes segments
    totalDevisHT   += seg.total_ht ?? 0;
    totalMarcheMin += seg.market_min;
    totalMarcheMax += seg.market_max;

    // Delta : segments avec données marché uniquement
    if (seg.has_market_data) {
      deltaDevisHT   += seg.total_ht ?? 0;
      deltaMarcheMin += seg.market_min;
      deltaMarcheMax += seg.market_max;
    }

    if (seg.verdict === "refuser")    rouge++;
    else if (seg.verdict === "a_negocier") orange++;
    else vert++;
  }

  const deltaMarcheAvg  = (deltaMarcheMin + deltaMarcheMax) / 2;
  const overprice       = deltaMarcheAvg > 0 ? deltaDevisHT - deltaMarcheAvg : 0;
  const overprice_pct   = deltaMarcheAvg > 0 ? overprice / deltaMarcheAvg : 0;

  // score_legacy = dérivé strict de verdict_global (jamais calculé indépendamment)
  const score_legacy: "VERT" | "ORANGE" | "ROUGE" =
    verdictGlobal === "refuser"    ? "ROUGE"  :
    verdictGlobal === "a_negocier" ? "ORANGE" : "VERT";

  return {
    verdict_global:   verdictGlobal,
    score_legacy,
    total_devis_ht:   Math.round(totalDevisHT),
    total_marche_min: Math.round(totalMarcheMin),
    total_marche_max: Math.round(totalMarcheMax),
    total_marche_avg: Math.round((totalMarcheMin + totalMarcheMax) / 2),
    overprice_total:  Math.round(Math.max(0, overprice)),
    overprice_pct:    Math.round(overprice_pct * 1000) / 1000,
    segments_count:   segmentAnalyses.length,
    segments_rouge:   rouge,
    segments_orange:  orange,
    segments_vert:    vert,
  };
}
