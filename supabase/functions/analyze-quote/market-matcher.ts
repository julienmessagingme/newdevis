/**
 * market-matcher.ts — V3.6 HARDENED (2026-05-12)
 *
 * ARCHITECTURE V3.6 — DÉTERMINISTE BACKEND avec enums stricts + scoring explicite
 *
 * Responsabilités :
 *   1. Définir les enums STRICTS attendus dans la signature Gemini (PHASE 2)
 *   2. Valider la signature reçue (reject si hors enum)
 *   3. Matcher déterministe avec scoring 40+30+20+10 (PHASE 3)
 *   4. Logging détaillé des candidats / scores / décisions
 *
 * NE JAMAIS :
 *   - Inventer un job_type qui n'existe pas dans le catalogue.
 *   - Ignorer un room mismatch.
 *   - Fallbacker silencieusement (toujours logger le `fallback_reason`).
 *   - Accepter une signature avec un champ hors enum.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 — Enums stricts
// ─────────────────────────────────────────────────────────────────────────────
//
// Toute valeur retournée par Gemini doit appartenir à ces enums. Sinon la
// signature est rejetée (PHASE 2 — pas de texte libre dangereux).

export const ALLOWED_DOMAINS = [
  "electricite",
  "plomberie",
  "chauffage",
  "climatisation",
  "carrelage",
  "chape",
  "peinture",
  "primaire",
  "isolation",
  "toiture",
  "menuiserie",
  "maconnerie",
  "terrassement",
  "pavage",
  "facade",
  "enduit",
  "serrurerie",
  "ventilation",
  "platrerie",
  "charpente",
  "couverture",
  "zinguerie",
  "etancheite",
  "escalier",
  "acier",
  "salle_de_bain",
  "cuisine",
  "exterieur",
  "piscine",
  "energies_renouvelables",
  "autre",
] as const;
export type AllowedDomain = typeof ALLOWED_DOMAINS[number];

export const ALLOWED_ROOMS = [
  "cuisine",
  "salle_de_bain",
  "chambre",
  "salon",
  "garage",
  "exterieur",
  "local_technique",
  "bureau",
  "couloir",
  "entree",
  "wc",
  "cellier",
  "cave",
  "combles",
] as const;
export type AllowedRoom = typeof ALLOWED_ROOMS[number];

export const ALLOWED_UNITS = [
  "m2",
  "ml",
  "u",
  "forfait",
  "kw",
  "lot",
  "pce",
  "m3",
] as const;
export type AllowedUnit = typeof ALLOWED_UNITS[number];

/**
 * Subcategories autorisées par domaine. Contrainte pour limiter le texte
 * libre de Gemini et faciliter le matching catalogue.
 */
export const ALLOWED_SUBCATEGORIES_BY_DOMAIN: Record<AllowedDomain, readonly string[]> = {
  electricite: ["raccordement", "tableau", "moulure", "fil", "depose", "mise_aux_normes", "luminaire", "domotique"],
  plomberie:   ["sanitaire", "tuyauterie", "evacuation", "robinetterie", "chauffe_eau", "depose"],
  chauffage:   ["chaudiere", "radiateur", "plancher_chauffant", "pompe_a_chaleur", "depose"],
  climatisation: ["mono_split", "multi_split", "gainable", "vrv", "accessoires", "maintenance"],
  carrelage:   ["fourniture_pose", "pose_seule", "depose", "faience", "plinthe", "joint"],
  chape:       ["liquide", "ciment", "ragreage", "lissage"],
  peinture:    ["fourniture_pose", "pose_seule", "lasure", "vernis", "rebouchage", "sous_couche"],
  primaire:    ["fourniture_pose", "fond_dur", "accrochage"],
  isolation:   ["combles", "mur", "sol", "interieur", "exterieur"],
  toiture:     ["couverture", "etancheite", "zinguerie", "reparation"],
  menuiserie:  ["fenetre", "porte", "volet", "baie_vitree", "porte_fenetre", "depose", "fourniture_pose"],
  maconnerie:  ["fondation", "elevation", "dallage", "linteau", "chainage", "demolition"],
  terrassement: ["excavation", "remblai", "fond_de_forme", "compactage", "decaissement"],
  pavage:      ["fourniture_pose", "bordure", "sablage", "depose"],
  facade:      ["enduit", "ravalement", "isolation_ite", "nettoyage", "peinture_facade"],
  enduit:      ["monocouche", "traditionnel", "decoratif", "facade"],
  serrurerie:  ["porte_blindee", "cylindre", "garde_corps", "grille"],
  ventilation: ["vmc_simple", "vmc_double_flux", "extraction", "maintenance"],
  platrerie:   ["cloison", "doublage", "plafond", "ba13", "carreaux_platre"],
  charpente:   ["fermette", "traditionnelle", "lamelle_colle"],
  couverture:  ["tuile", "ardoise", "zinc", "bac_acier", "reparation"],
  zinguerie:   ["gouttiere", "descente", "abergement", "noue"],
  etancheite:  ["membrane", "bitume", "epdm", "couvertine"],
  escalier:    ["bois", "metal", "beton", "garde_corps", "habillage"],
  acier:       ["ipn", "ipe", "ip14", "poutre", "linteau"],
  salle_de_bain: ["renovation_complete", "douche_italienne", "baignoire", "lavabo"],
  cuisine:     ["renovation_complete", "ilot", "meuble", "plan_travail"],
  exterieur:   ["terrasse", "cloture", "portail", "amenagement"],
  piscine:     ["construction", "renovation", "liner", "filtration", "margelle"],
  energies_renouvelables: ["photovoltaique", "solaire_thermique", "eolien", "geothermie"],
  autre:       ["divers", "fournitures", "main_oeuvre", "deplacement", "forfait"],
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Signature sémantique neutre extraite par Gemini. Validée contre les enums
 * stricts à la réception (cf. validateSignature).
 */
export interface SemanticSignature {
  domain: AllowedDomain;
  subcategory: string; // contrôlé par ALLOWED_SUBCATEGORIES_BY_DOMAIN[domain]
  room: AllowedRoom | null;
  unit: AllowedUnit;
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
  room_specific?: boolean | null;
  required_room?: string[] | null;
  generic_family?: string | null;
}

/** Score breakdown — auditabilité. */
export interface MatchScoreBreakdown {
  domain: number;       // /40
  subcategory: number;  // /30
  room: number;         // /20
  unit: number;         // /10
  total: number;        // /100
}

/** Candidat évalué — toujours présent dans les logs détaillés. */
export interface MatchCandidate {
  job_type: string;
  label: string;
  score: MatchScoreBreakdown;
  selected: boolean;
  rejected_reason?: string;
}

/** Résultat d'un match — toujours retourné, même en cas d'échec. */
export interface MatchResult {
  matched: boolean;
  job_type: string | null;
  label: string | null;
  /** Stratégie de match employée — auditabilité. */
  match_strategy: MatchStrategy;
  /** Score de confiance [0, 100] basé sur 40+30+20+10. */
  confidence: number;
  /** Liste des candidats évalués (top 5) avec leur score, pour audit. */
  candidates?: MatchCandidate[];
  fallback_reason?: string;
  mismatch_reason?: string;
  signature: SemanticSignature;
}

export type MatchStrategy =
  | "exact"                  // score ≥ 80 — usable directement
  | "indicative"             // score 60-79 — comparaison indicative uniquement
  | "fuzzy_fallback"         // score 40-59 — fuzzy avec warning
  | "no_match"               // score < 40 — NO_MATCH
  | "rejected_room_mismatch" // catalogue room_specific + signature sans room (ou room ≠)
  | "invalid_signature";     // signature hors enum (rejet en amont)

// ─────────────────────────────────────────────────────────────────────────────
// Validation de signature (PHASE 2)
// ─────────────────────────────────────────────────────────────────────────────

export interface SignatureValidationResult {
  valid: boolean;
  signature: SemanticSignature | null;
  errors: string[];
}

/**
 * Valide une signature reçue de Gemini contre les enums stricts.
 * Refuse si :
 *   - domain n'est pas dans ALLOWED_DOMAINS
 *   - room non null et pas dans ALLOWED_ROOMS
 *   - unit n'est pas dans ALLOWED_UNITS
 *   - subcategory n'est pas dans ALLOWED_SUBCATEGORIES_BY_DOMAIN[domain]
 *
 * En cas de rejet : log [V36_INVALID_SIGNATURE] + retour valid=false.
 * Le caller doit fallbacker sur V3.5 ou NO_MATCH.
 */
export function validateSignature(raw: unknown): SignatureValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    errors.push("signature is not an object");
    return { valid: false, signature: null, errors };
  }

  const obj = raw as Record<string, unknown>;
  const rawDomain = typeof obj.domain === "string" ? obj.domain.toLowerCase().trim() : "";
  const rawSub = typeof obj.subcategory === "string" ? obj.subcategory.toLowerCase().trim() : "";
  const rawRoom = typeof obj.room === "string" && obj.room.trim().length > 0
    ? obj.room.toLowerCase().trim()
    : null;
  const rawUnit = typeof obj.unit === "string" ? obj.unit.toLowerCase().trim() : "";
  const rawKeywords = Array.isArray(obj.keywords)
    ? (obj.keywords as unknown[])
        .filter((k): k is string => typeof k === "string" && k.length > 0)
        .map(k => k.toLowerCase().trim())
    : [];

  // Domain
  if (!(ALLOWED_DOMAINS as readonly string[]).includes(rawDomain)) {
    errors.push(`domain="${rawDomain}" not in ALLOWED_DOMAINS`);
  }

  // Room (null OK, sinon dans enum)
  if (rawRoom !== null && !(ALLOWED_ROOMS as readonly string[]).includes(rawRoom)) {
    errors.push(`room="${rawRoom}" not in ALLOWED_ROOMS (must be null or one of: ${ALLOWED_ROOMS.join(", ")})`);
  }

  // Unit
  if (!(ALLOWED_UNITS as readonly string[]).includes(rawUnit)) {
    errors.push(`unit="${rawUnit}" not in ALLOWED_UNITS`);
  }

  // Subcategory — contrôlé par le domain (uniquement si domain valide)
  if (errors.length === 0) {
    const allowedSubs = ALLOWED_SUBCATEGORIES_BY_DOMAIN[rawDomain as AllowedDomain] ?? [];
    if (rawSub.length > 0 && !allowedSubs.includes(rawSub)) {
      errors.push(`subcategory="${rawSub}" not in ALLOWED_SUBCATEGORIES for domain="${rawDomain}" (allowed: ${allowedSubs.join(", ")})`);
    }
  }

  if (errors.length > 0) {
    console.warn(`[V36_INVALID_SIGNATURE] errors: ${errors.join(" | ")} | raw: ${JSON.stringify(raw).substring(0, 200)}`);
    return { valid: false, signature: null, errors };
  }

  return {
    valid: true,
    signature: {
      domain:      rawDomain as AllowedDomain,
      subcategory: rawSub,
      room:        rawRoom as AllowedRoom | null,
      unit:        rawUnit as AllowedUnit,
      keywords:    rawKeywords.slice(0, 10),
    },
    errors: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitaires room/family
// ─────────────────────────────────────────────────────────────────────────────

/** Mots-pièce reconnus dans les labels catalogue + leur forme canonique. */
const ROOM_TEXT_VARIANTS: Record<AllowedRoom, string[]> = {
  cuisine:        ["cuisine"],
  salle_de_bain:  ["sdb", "salle_de_bain", "salle_de_bains", "salle de bain", "salle de bains", "salle d'eau"],
  wc:             ["wc", "toilettes", "toilette"],
  chambre:        ["chambre"],
  salon:          ["salon", "sejour", "séjour", "salle a manger", "salle à manger"],
  bureau:         ["bureau"],
  garage:         ["garage"],
  cellier:        ["cellier", "buanderie", "lingerie"],
  entree:         ["entree", "entrée", "hall", "vestibule"],
  couloir:        ["couloir", "degagement", "dégagement", "circulation"],
  exterieur:      ["terrasse", "balcon", "jardin", "exterieur", "extérieur"],
  cave:           ["cave", "sous-sol", "sous_sol", "sous sol"],
  combles:        ["combles", "grenier"],
  local_technique: ["local_technique", "local technique", "buanderie", "chaufferie"],
};

/** Normalise une chaîne pour comparaison : minuscule + retrait des accents. */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

export function extractRoomFromText(text: string): AllowedRoom | null {
  const n = normalize(text);
  for (const canonical of ALLOWED_ROOMS) {
    const variants = ROOM_TEXT_VARIANTS[canonical] || [];
    if (variants.some(v => n.includes(normalize(v)))) return canonical;
  }
  return null;
}

function inferRoomSpecific(row: MarketCatalogRow): { isRoomSpecific: boolean; room: AllowedRoom | null } {
  if (row.room_specific === true && Array.isArray(row.required_room) && row.required_room.length > 0) {
    const required = row.required_room[0];
    if ((ALLOWED_ROOMS as readonly string[]).includes(required)) {
      return { isRoomSpecific: true, room: required as AllowedRoom };
    }
  }
  if (row.room_specific === false) {
    return { isRoomSpecific: false, room: null };
  }
  // Fallback : inférence depuis le job_type
  const detected = extractRoomFromText(row.job_type);
  return { isRoomSpecific: detected !== null, room: detected };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 — Scoring explicite : 40 domain + 30 subcategory + 20 room + 10 unit
// ─────────────────────────────────────────────────────────────────────────────

const SCORE_THRESHOLD_EXACT = 80;       // ≥80 → match exact usable
const SCORE_THRESHOLD_INDICATIVE = 60;  // 60-79 → comparaison indicative
const SCORE_THRESHOLD_FUZZY = 40;       // 40-59 → fuzzy fallback (warning)
                                        // <40 → no_match

/**
 * Calcule le breakdown du score pour un candidat catalogue donné.
 * Cf. PHASE 3 du cahier des charges : 40+30+20+10 = 100.
 */
function scoreCandidate(signature: SemanticSignature, row: MarketCatalogRow): MatchScoreBreakdown {
  const jt = normalize(row.job_type);
  const lbl = normalize(row.label);
  const rowUnit = normalize(row.unit);

  // 40 points — domain match (préfixe job_type ou label contient le domain)
  let domainScore = 0;
  if (jt.includes(signature.domain) || lbl.includes(signature.domain)) {
    domainScore = 40;
  } else {
    // Domain partiel : on cherche un alias (ex: signature "salle_de_bain" matche "sdb" dans catalogue)
    if (signature.domain === "salle_de_bain" && (jt.includes("sdb") || lbl.includes("salle"))) domainScore = 32;
    if (signature.domain === "climatisation" && (jt.includes("clim") || lbl.includes("clim"))) domainScore = 32;
  }

  // 30 points — subcategory match
  let subScore = 0;
  if (signature.subcategory.length > 0 && (jt.includes(signature.subcategory) || lbl.includes(signature.subcategory))) {
    subScore = 30;
  } else if (signature.subcategory.length > 0) {
    // Match partiel via keywords du subcategory
    const subParts = signature.subcategory.split("_").filter(p => p.length >= 3);
    const hits = subParts.filter(p => jt.includes(p) || lbl.includes(p)).length;
    if (subParts.length > 0) subScore = Math.round(15 * (hits / subParts.length));
  }

  // 20 points — room match
  const { room: rowRoom, isRoomSpecific } = inferRoomSpecific(row);
  let roomScore = 0;
  if (signature.room && rowRoom === signature.room) {
    roomScore = 20;
  } else if (signature.room === null && !isRoomSpecific) {
    // Catalogue générique + signature sans room → match neutre OK
    roomScore = 15;
  }
  // Si signature.room null mais catalogue room_specific → 0 (rejet géré ailleurs)

  // 10 points — unit match
  let unitScore = 0;
  if (rowUnit === signature.unit || rowUnit.includes(signature.unit) || signature.unit.includes(rowUnit)) {
    unitScore = 10;
  } else if (rowUnit.length > 0 && signature.unit.length > 0) {
    // Bonus partiel pour unités proches (m2 vs m, ml vs ml…)
    if (rowUnit.startsWith(signature.unit) || signature.unit.startsWith(rowUnit)) unitScore = 5;
  }

  return {
    domain: domainScore,
    subcategory: subScore,
    room: roomScore,
    unit: unitScore,
    total: domainScore + subScore + roomScore + unitScore,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching principal — version hardened
// ─────────────────────────────────────────────────────────────────────────────

export function matchMarketCategory(
  signature: SemanticSignature,
  catalog: MarketCatalogRow[],
): MatchResult {
  // ── 1. Filtrer les candidats par domain (préfixe job_type ou label) ──────
  const candidates = catalog.filter(row => {
    const jt = normalize(row.job_type);
    const lbl = normalize(row.label);
    return jt.includes(signature.domain) || lbl.includes(signature.domain)
      // Aliases connus
      || (signature.domain === "salle_de_bain" && (jt.includes("sdb") || lbl.includes("salle")))
      || (signature.domain === "climatisation" && (jt.includes("clim") || lbl.includes("clim")));
  });

  if (candidates.length === 0) {
    return {
      matched: false,
      job_type: null,
      label: null,
      match_strategy: "no_match",
      confidence: 0,
      candidates: [],
      mismatch_reason: `no candidates for domain="${signature.domain}" in catalog (${catalog.length} entries scanned)`,
      signature,
    };
  }

  // ── 2. Hard block ROOM MISMATCH ───────────────────────────────────────────
  const eligible: MarketCatalogRow[] = [];
  const rejectedRoom: Array<{ row: MarketCatalogRow; reason: string }> = [];

  for (const row of candidates) {
    const { isRoomSpecific, room } = inferRoomSpecific(row);
    if (isRoomSpecific) {
      if (signature.room === null) {
        rejectedRoom.push({ row, reason: `catalog room_specific (room="${room}") but signature.room=null` });
        continue;
      }
      if (signature.room !== room) {
        rejectedRoom.push({ row, reason: `catalog room="${room}" ≠ signature.room="${signature.room}"` });
        continue;
      }
    }
    eligible.push(row);
  }

  if (eligible.length === 0) {
    const sample = rejectedRoom[0]?.reason ?? "no eligible candidates";
    return {
      matched: false,
      job_type: null,
      label: null,
      match_strategy: "rejected_room_mismatch",
      confidence: 0,
      candidates: rejectedRoom.slice(0, 5).map(r => ({
        job_type: r.row.job_type,
        label: r.row.label,
        score: { domain: 0, subcategory: 0, room: 0, unit: 0, total: 0 },
        selected: false,
        rejected_reason: r.reason,
      })),
      mismatch_reason: `${rejectedRoom.length} candidates rejected by room mismatch (sample: ${sample})`,
      signature,
    };
  }

  // ── 3. Scoring de chaque candidat éligible ────────────────────────────────
  const scored = eligible.map(row => ({ row, score: scoreCandidate(signature, row) }));
  scored.sort((a, b) => b.score.total - a.score.total);

  // Top 5 pour audit log
  const top5: MatchCandidate[] = scored.slice(0, 5).map((s, i) => ({
    job_type: s.row.job_type,
    label: s.row.label,
    score: s.score,
    selected: i === 0,
  }));

  const best = scored[0];

  // ── 4. Détermination de la stratégie selon le seuil de score ─────────────
  let strategy: MatchStrategy;
  let matched: boolean;
  let fallbackReason: string | undefined;

  if (best.score.total >= SCORE_THRESHOLD_EXACT) {
    strategy = "exact";
    matched = true;
  } else if (best.score.total >= SCORE_THRESHOLD_INDICATIVE) {
    // 60-79 — usage indicatif uniquement. On retourne le match mais avec
    // confidence basse. La couche scoring downstream doit considérer ça comme
    // "Comparaison indicative" et NE PAS générer d'anomalie prix forte.
    strategy = "indicative";
    matched = true;
    fallbackReason = `score=${best.score.total}/100 (60-79 range) — comparaison indicative uniquement`;
  } else if (best.score.total >= SCORE_THRESHOLD_FUZZY) {
    // 40-59 — fuzzy fallback. Interdit sur catégories room_specific (hard block déjà passé)
    // mais ici on peut imposer une garde supplémentaire : si le best candidat est
    // room_specific et qu'on est arrivé par fuzzy → REJECT.
    const { isRoomSpecific } = inferRoomSpecific(best.row);
    if (isRoomSpecific) {
      return {
        matched: false,
        job_type: null,
        label: null,
        match_strategy: "rejected_room_mismatch",
        confidence: best.score.total,
        candidates: top5,
        mismatch_reason: `fuzzy fallback rejected: best candidate "${best.row.job_type}" is room_specific (cannot fuzzy-match a room-locked entry)`,
        signature,
      };
    }
    strategy = "fuzzy_fallback";
    matched = true;
    fallbackReason = `score=${best.score.total}/100 (40-59) — fuzzy fallback (warning)`;
  } else {
    strategy = "no_match";
    matched = false;
  }

  if (!matched) {
    return {
      matched: false,
      job_type: null,
      label: null,
      match_strategy: strategy,
      confidence: best.score.total,
      candidates: top5,
      mismatch_reason: `best score=${best.score.total}/100 below NO_MATCH threshold (40)`,
      signature,
    };
  }

  return {
    matched: true,
    job_type: best.row.job_type,
    label: best.row.label,
    match_strategy: strategy,
    confidence: best.score.total,
    candidates: top5,
    fallback_reason: fallbackReason,
    signature,
  };
}

/**
 * Logger formaté pour audit. Préfixe `[V36_MATCH]` (cf. PHASE 3 spec).
 * Toujours appelé après matchMarketCategory pour traçabilité complète.
 */
export function logMatchResult(result: MatchResult, context?: { groupLabel?: string; analysisId?: string }): void {
  const sig = result.signature;
  const prefix = `[V36_MATCH]${context?.analysisId ? `[${context.analysisId}]` : ""}${context?.groupLabel ? ` "${context.groupLabel}"` : ""}`;

  const sigStr = `domain=${sig.domain} sub=${sig.subcategory} room=${sig.room ?? "null"} unit=${sig.unit}`;

  if (result.matched && result.job_type) {
    const cand = result.candidates?.[0];
    const breakdown = cand
      ? `domain=${cand.score.domain}/40 sub=${cand.score.subcategory}/30 room=${cand.score.room}/20 unit=${cand.score.unit}/10`
      : "";
    const fb = result.fallback_reason ? ` | ${result.fallback_reason}` : "";
    console.log(`${prefix} ${result.match_strategy.toUpperCase()} → ${result.job_type} (score=${result.confidence}/100, ${breakdown})${fb} | sig: ${sigStr}`);
  } else {
    console.warn(`${prefix} ${result.match_strategy.toUpperCase()} | confidence=${result.confidence} | sig: ${sigStr} | reason: ${result.mismatch_reason}`);
  }

  // Log les top candidats avec leur score complet (verbose mode pour debug)
  if (result.candidates && result.candidates.length > 0) {
    const topStr = result.candidates.slice(0, 3).map(c =>
      `${c.job_type}[${c.score.total}=${c.score.domain}+${c.score.subcategory}+${c.score.room}+${c.score.unit}]${c.selected ? "*" : ""}${c.rejected_reason ? ` rejected:${c.rejected_reason}` : ""}`
    ).join(" | ");
    console.log(`${prefix} candidates: ${topStr}`);
  }
}
