/**
 * market-matcher.ts — V3.6 (2026-05-12)
 *
 * ARCHITECTURE V3.6 — DÉTERMINISTE BACKEND
 *
 * Avant V3.6, Gemini recevait le catalogue complet et choisissait LUI-MÊME
 * l'identifiant `job_type` canonique. Cela conduisait régulièrement à des
 * hallucinations :
 *   - "raccordements_electricite_cuisine" choisi sur un devis qui ne parle
 *     PAS de cuisine (cas Thouret Elec)
 *   - "monte_escalier" choisi pour du carrelage sur escalier (cas Kern)
 *   - Préfixes inventés ("pose_X") absents du catalogue
 *
 * V3.6 inverse la responsabilité :
 *   - Gemini extrait UNIQUEMENT une "signature sémantique" neutre
 *     (domain + subcategory + room + unit + keywords)
 *   - Le backend TypeScript applique un matching DÉTERMINISTE basé sur
 *     des règles strictes
 *   - Auditabilité totale : chaque décision (match, fallback, rejet) est
 *     loggée avec la raison
 *
 * RÈGLES DE MATCHING (par ordre de priorité) :
 *   1. Hard block ROOM MISMATCH : si l'entrée catalogue requiert une room
 *      (room_specific=true) ET que la signature ne mentionne pas cette room
 *      → REJET sans fallback (préserve l'honnêteté).
 *   2. Exact match : (domain, subcategory, room, unit) tous identiques.
 *   3. Match partiel sans room : (domain, subcategory, unit) identiques,
 *      room absente de la signature → uniquement si entrée catalogue n'est
 *      PAS room-specific.
 *   4. Match par generic_family : si entrée catalogue spécifie une
 *      generic_family et signature correspond → match avec note "fallback".
 *   5. Match sémantique fuzzy via keywords vs label du catalogue.
 *   6. Aucun match → NO_MATCH (job_type vide, comparaison indicative).
 *
 * NE JAMAIS :
 *   - Inventer un job_type qui n'existe pas dans le catalogue.
 *   - Ignorer un room mismatch.
 *   - Fallbacker silencieusement (toujours logger le `fallback_reason`).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Signature sémantique neutre extraite par Gemini. Aucune référence au
 * catalogue — uniquement des descripteurs métier que le backend transforme
 * en match catalogue déterministe.
 */
export interface SemanticSignature {
  /** Domaine BTP principal (ex: "electricite", "carrelage", "peinture"). */
  domain: string;
  /** Sous-catégorie métier (ex: "raccordement", "fourniture_pose", "depose"). */
  subcategory: string;
  /** Pièce mentionnée explicitement dans le devis (ex: "cuisine") ou null. */
  room: string | null;
  /** Unité principale du groupe (m2, ml, U, forfait...). */
  unit: string;
  /** Mots-clés extraits des descriptions du groupe (5-10 max). */
  keywords: string[];
}

/** Ligne du catalogue `market_prices` enrichie avec les colonnes V3.6. */
export interface MarketCatalogRow {
  job_type: string;
  label: string;
  unit: string;
  price_min_unit_ht: number;
  price_avg_unit_ht: number;
  price_max_unit_ht: number;
  fixed_min_ht: number;
  fixed_avg_ht: number;
  fixed_max_ht: number;
  zip_scope: string | null;
  notes: string | null;
  // V3.6 — nouvelles colonnes (nullable pour rétrocompat avant migration SQL)
  /** true si ce job_type ne peut être matché QUE si la signature mentionne sa room. */
  room_specific?: boolean | null;
  /** Liste des rooms acceptées (ex: ["cuisine"]). Null si pas de contrainte room. */
  required_room?: string[] | null;
  /** Famille générique partagée par tous les variants par pièce (ex: "raccordements_electricite"). */
  generic_family?: string | null;
}

/** Résultat d'un match — toujours retourné, même en cas d'échec. */
export interface MatchResult {
  /** true si un job_type catalogue a été retenu. */
  matched: boolean;
  /** Identifiant du catalogue retenu, null si NO_MATCH. */
  job_type: string | null;
  /** Label affichable depuis le catalogue, null si NO_MATCH. */
  label: string | null;
  /** Raison du match (audit). */
  match_reason: MatchReason;
  /** Si fallback, raison spécifique (audit). */
  fallback_reason?: string;
  /** Si rejet, raison spécifique (audit). */
  mismatch_reason?: string;
  /** Signature originale (auditabilité). */
  signature: SemanticSignature;
}

export type MatchReason =
  | "exact"           // (domain, subcategory, room, unit) tous identiques
  | "partial_no_room" // (domain, subcategory, unit) match, room absente → ok si catalogue !room_specific
  | "generic_family"  // fallback sur family générique
  | "fuzzy_keywords"  // match sémantique par mots-clés label/keywords
  | "no_match"        // aucun match trouvé
  | "rejected_room_mismatch"; // entrée catalogue requiert room absente du devis

// ─────────────────────────────────────────────────────────────────────────────
// Constants — referentiel pièces (dupliqué depuis groupHomogeneity.ts côté client)
// ─────────────────────────────────────────────────────────────────────────────
//
// Note : on dupliqué ici car Deno (edge function) ne peut pas importer de
// `src/lib/*`. Toute modification doit être répliquée des deux côtés.

/** Mots-pièce reconnus dans les labels catalogue + leur forme canonique. */
const ROOM_CANONICAL: Record<string, string[]> = {
  cuisine:   ["cuisine"],
  sdb:       ["sdb", "salle_de_bain", "salle_de_bains", "salle de bain", "salle de bains", "salle d'eau"],
  wc:        ["wc", "toilettes", "toilette"],
  chambre:   ["chambre"],
  salon:     ["salon", "sejour", "séjour", "salle a manger", "salle à manger"],
  bureau:    ["bureau"],
  garage:    ["garage"],
  cellier:   ["cellier", "buanderie", "lingerie"],
  entree:    ["entree", "entrée", "hall", "vestibule"],
  couloir:   ["couloir", "degagement", "dégagement", "circulation"],
  exterieur: ["terrasse", "balcon", "jardin", "exterieur", "extérieur"],
  cave:      ["cave", "sous-sol", "sous_sol", "sous sol"],
  combles:   ["combles", "grenier"],
};

/** Normalise une chaîne pour comparaison : minuscule + retrait des accents. */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/**
 * Extrait la room canonique présente dans un texte (label catalogue ou description).
 * Retourne null si aucune room détectée.
 *
 * @example
 * extractRoomFromText("raccordements_electricite_cuisine") // → "cuisine"
 * extractRoomFromText("Carrelage salle de bain 5m²")        // → "sdb"
 * extractRoomFromText("Prise de courant")                   // → null
 */
export function extractRoomFromText(text: string): string | null {
  const n = normalize(text);
  for (const [canonical, variants] of Object.entries(ROOM_CANONICAL)) {
    if (variants.some(v => n.includes(normalize(v)))) return canonical;
  }
  return null;
}

/**
 * Heuristique de fallback : si une entrée catalogue n'a pas de colonne
 * room_specific en base (rétrocompat), on infère depuis son `job_type`.
 * Si le `job_type` contient un mot-pièce → room_specific = true.
 */
function inferRoomSpecific(row: MarketCatalogRow): { isRoomSpecific: boolean; room: string | null } {
  // Priorité aux colonnes V3.6 explicites si présentes
  if (row.room_specific === true && Array.isArray(row.required_room) && row.required_room.length > 0) {
    return { isRoomSpecific: true, room: row.required_room[0] };
  }
  if (row.room_specific === false) {
    return { isRoomSpecific: false, room: null };
  }
  // Fallback : inférence depuis le job_type
  const detected = extractRoomFromText(row.job_type);
  return { isRoomSpecific: detected !== null, room: detected };
}

/**
 * Calcule la famille générique d'une entrée catalogue.
 * Si `generic_family` est explicite → utilisée. Sinon inférée en retirant
 * le suffixe pièce du job_type.
 *
 * @example
 * computeGenericFamily({ job_type: "raccordements_electricite_cuisine", generic_family: null })
 *   // → "raccordements_electricite"
 * computeGenericFamily({ job_type: "raccordements_electricite_cuisine", generic_family: "raccordements_electricite" })
 *   // → "raccordements_electricite" (utilise la colonne explicite)
 */
function computeGenericFamily(row: MarketCatalogRow): string {
  if (typeof row.generic_family === "string" && row.generic_family.length > 0) {
    return row.generic_family;
  }
  // Inférence : retirer suffixe pièce
  const allVariants = Object.values(ROOM_CANONICAL).flat();
  let base = row.job_type;
  for (const v of allVariants) {
    const suffix = `_${v.replace(/\s+/g, "_")}`;
    if (base.toLowerCase().endsWith(suffix)) {
      base = base.slice(0, base.length - suffix.length);
      break;
    }
  }
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * V3.6 — Matche une signature sémantique avec une entrée du catalogue.
 *
 * Procédure en cascade :
 *   1. Filtre les entrées catalogue par domain (préfixe du job_type).
 *   2. Pour chaque candidat, applique les règles d'éligibilité :
 *      - Room mismatch hard block (priorité 1)
 *      - Exact match (priorité 2)
 *      - Partial match sans room (priorité 3)
 *      - Generic family (priorité 4)
 *      - Fuzzy keywords (priorité 5)
 *   3. Retourne le meilleur match OU NO_MATCH avec raison loggée.
 */
export function matchMarketCategory(
  signature: SemanticSignature,
  catalog: MarketCatalogRow[],
): MatchResult {
  const sigDomain = normalize(signature.domain);
  const sigSub = normalize(signature.subcategory);
  const sigRoom = signature.room ? normalize(signature.room) : null;
  const sigUnit = normalize(signature.unit);
  const sigKeywords = signature.keywords.map(k => normalize(k));

  // ── 1. Filtrer les candidats par domain (préfixe du job_type) ─────────────
  // Convention : les job_types commencent par le domain (ex: "carrelage_sol_fourniture_pose",
  // "raccordements_electricite_cuisine"). On accepte aussi les matches sur le label.
  const candidates = catalog.filter(row => {
    const jt = normalize(row.job_type);
    const lbl = normalize(row.label);
    return jt.includes(sigDomain) || lbl.includes(sigDomain);
  });

  if (candidates.length === 0) {
    return {
      matched: false,
      job_type: null,
      label: null,
      match_reason: "no_match",
      mismatch_reason: `no candidates for domain="${sigDomain}" in catalog (${catalog.length} entries scanned)`,
      signature,
    };
  }

  // ── 2. Hard block ROOM MISMATCH ───────────────────────────────────────────
  // Si TOUS les candidats sont room_specific ET aucun ne matche la room de
  // la signature → REJECT explicit.
  const eligibleCandidates: MarketCatalogRow[] = [];
  const rejectedByRoom: Array<{ row: MarketCatalogRow; reason: string }> = [];

  for (const row of candidates) {
    const { isRoomSpecific, room } = inferRoomSpecific(row);
    if (isRoomSpecific) {
      // Cette entrée ne peut matcher QUE si la signature mentionne sa room
      if (sigRoom === null) {
        rejectedByRoom.push({
          row,
          reason: `catalog entry is room-specific (room="${room}") but signature has no room`,
        });
        continue;
      }
      if (sigRoom !== room) {
        rejectedByRoom.push({
          row,
          reason: `catalog entry room="${room}" ≠ signature room="${sigRoom}"`,
        });
        continue;
      }
    }
    eligibleCandidates.push(row);
  }

  if (eligibleCandidates.length === 0) {
    const rejReason = rejectedByRoom.length > 0
      ? `all ${rejectedByRoom.length} candidates rejected by room mismatch (sample: ${rejectedByRoom[0].reason})`
      : "no eligible candidates after room filter";
    return {
      matched: false,
      job_type: null,
      label: null,
      match_reason: "rejected_room_mismatch",
      mismatch_reason: rejReason,
      signature,
    };
  }

  // ── 3. Exact match : (domain, subcategory, room, unit) tous présents ──────
  // Stratégie : on cherche dans les eligibleCandidates celui qui maximise
  // les correspondances {sub_match × unit_match × keyword_overlap}.
  let best: { row: MarketCatalogRow; score: number; reason: MatchReason; details: string } | null = null;

  for (const row of eligibleCandidates) {
    const jt = normalize(row.job_type);
    const lbl = normalize(row.label);
    const rowUnit = normalize(row.unit);
    let score = 0;
    const reasons: string[] = [];

    // Subcategory match (poids fort)
    if (sigSub && (jt.includes(sigSub) || lbl.includes(sigSub))) {
      score += 50;
      reasons.push("sub");
    }
    // Unit match (poids moyen)
    if (sigUnit && (rowUnit === sigUnit || rowUnit.includes(sigUnit) || sigUnit.includes(rowUnit))) {
      score += 20;
      reasons.push("unit");
    }
    // Keywords overlap (poids variable, jusqu'à 30)
    let kwHits = 0;
    for (const kw of sigKeywords) {
      if (kw.length < 3) continue;
      if (jt.includes(kw) || lbl.includes(kw)) kwHits++;
    }
    const kwScore = Math.min(30, kwHits * 6);
    score += kwScore;
    if (kwHits > 0) reasons.push(`kw:${kwHits}`);
    // Room match exact (poids fort)
    if (sigRoom) {
      const { room: rowRoom } = inferRoomSpecific(row);
      if (rowRoom === sigRoom) {
        score += 40;
        reasons.push("room");
      }
    }

    if (score === 0) continue;

    if (!best || score > best.score) {
      const matchReason: MatchReason = (() => {
        if (reasons.includes("sub") && reasons.includes("unit") && (sigRoom === null || reasons.includes("room"))) {
          return sigRoom === null ? "partial_no_room" : "exact";
        }
        if (reasons.includes("sub")) return "partial_no_room";
        return "fuzzy_keywords";
      })();
      best = { row, score, reason: matchReason, details: reasons.join("+") };
    }
  }

  if (best) {
    return {
      matched: true,
      job_type: best.row.job_type,
      label: best.row.label,
      match_reason: best.reason,
      fallback_reason: best.reason === "fuzzy_keywords"
        ? `weak match via keywords only (score=${best.score}, ${best.details})`
        : undefined,
      signature,
    };
  }

  // ── 4. Generic family fallback ────────────────────────────────────────────
  // Si la signature a une famille déductible et qu'un catalogue générique
  // existe (room_specific=false avec generic_family matching) → utiliser.
  for (const row of eligibleCandidates) {
    const family = computeGenericFamily(row);
    const { isRoomSpecific } = inferRoomSpecific(row);
    if (!isRoomSpecific && (family.includes(sigDomain) || family.includes(sigSub))) {
      return {
        matched: true,
        job_type: row.job_type,
        label: row.label,
        match_reason: "generic_family",
        fallback_reason: `matched via generic_family="${family}" (no exact match, no room available)`,
        signature,
      };
    }
  }

  // ── 5. No match — admis honnêtement ───────────────────────────────────────
  return {
    matched: false,
    job_type: null,
    label: null,
    match_reason: "no_match",
    mismatch_reason: `${eligibleCandidates.length} eligible candidates after room filter, but none scored > 0`,
    signature,
  };
}

/**
 * Logger formaté pour debug et audit. Préfixe `[MatchV36]`.
 * Toujours appelé après matchMarketCategory pour traçabilité.
 */
export function logMatchResult(result: MatchResult, context?: { groupLabel?: string }): void {
  const sig = result.signature;
  const prefix = `[MatchV36]${context?.groupLabel ? ` "${context.groupLabel}"` : ""}`;
  const sigStr = `domain=${sig.domain} sub=${sig.subcategory} room=${sig.room ?? "null"} unit=${sig.unit} kw=[${sig.keywords.slice(0, 5).join(",")}]`;

  if (result.matched) {
    const fbStr = result.fallback_reason ? ` | fallback: ${result.fallback_reason}` : "";
    console.log(`${prefix} MATCH ${result.match_reason} → ${result.job_type} ("${result.label}") | sig: ${sigStr}${fbStr}`);
  } else {
    console.warn(`${prefix} ${result.match_reason.toUpperCase()} | sig: ${sigStr} | reason: ${result.mismatch_reason}`);
  }
}
