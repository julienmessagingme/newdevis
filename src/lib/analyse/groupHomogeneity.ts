/**
 * groupHomogeneity.ts — Détection des groupes hétérogènes (V3.4 Niveaux 1 + 2)
 *
 * Module partagé serveur (conclusion.ts) + client (quoteGlobalAnalysis.ts).
 *
 * PROBLÈME : Gemini regroupe parfois des lignes hétérogènes sous un même
 * `job_type_label`. Exemple Kern : groupe "Carrelage (fourni+posé) 13.5 m²"
 * contient chape + primaire + dalle céramique + coupe + IP14 (acier).
 * Le prix unitaire calculé (4 422 / 13.5 = 327 €/m²) est aberrant vs la
 * fourchette marché du carrelage seul (46-94 €/m²) → faux positif.
 *
 * ARCHITECTURE EN CASCADE :
 *   - NIVEAU 2 (prioritaire) : score sémantique basé sur les descriptions de lignes.
 *     Si score < 0.5 → hétérogène confirmé. Si ≥ 0.7 → homogène confirmé.
 *   - NIVEAU 1 (fallback) : critère ratio prix unitaire calculé > 2× max marché.
 *     Utilisé quand le score Niveau 2 est en zone grise ou indisponible.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Interface minimale d'un groupe — agnostique du format précis (serveur ou client)
// ──────────────────────────────────────────────────────────────────────────────

export interface HomogeneityGroupInput {
  /** Libellé affiché du groupe (ex: "Carrelage (fourni+posé)"). */
  job_type_label?: string;
  /** Identifiant interne du job_type (ex: "carrelage_sol_fourniture_pose"). */
  job_type?: string;
  /** Quantité principale du groupe (m², ml, U…). */
  main_quantity?: number;
  /** Total HT du groupe (somme des lignes). */
  devis_total_ht?: number;
  /** Lignes individuelles du devis dans ce groupe. */
  devis_lines?: Array<{
    description?: string;
    amount_ht?: number;
    amountHT?: number; // alias côté client
  }>;
  /** Entrées catalogue marché matchant ce groupe (pour fallback Niveau 1). */
  prices?: Array<{
    price_max_unit_ht?: number;
  }>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Référentiel mots-clés par domaine BTP (V3.4 Niveau 2)
// ──────────────────────────────────────────────────────────────────────────────
//
// Conventions :
//   - Tous les mots-clés sont NORMALISÉS (minuscule, sans accents) — la fonction
//     `normalizeText` est appliquée AUTOMATIQUEMENT aux descriptions à la lecture.
//     Les keywords ici doivent donc être écrits SANS accents directement.
//   - Match par inclusion partielle (ex: "carrelage" matche "carrelages",
//     "carrelagiste").
//   - Les mots-clés ambigus présents dans plusieurs domaines (ex: "joint") doivent
//     apparaître dans tous les domaines concernés.
//
// Pour ajouter un domaine : créer une entrée + tester sur au moins 2-3 devis réels.

export const DOMAIN_KEYWORDS: Record<string, string[]> = {
  carrelage:    ["carrelage", "dalle", "ceramique", "faience", "carreau", "joint", "colle", "carrelagiste"],
  chape:        ["chape", "ciment", "mortier", "ragreage", "ragreement", "lissage"],
  primaire:     ["primaire", "accrochage", "fond dur", "sous-couche"],
  peinture:     ["peinture", "lasure", "vernis", "enduit de lissage", "rebouchage", "poncage", "peintre"],
  terrassement: ["terrassement", "excavation", "deblai", "remblai", "fond de forme", "concasse", "compactage", "fouille", "decapage", "decaissement"],
  pavage:       ["pave", "pavage", "bordure", "sablage", "joint sable"],
  vrd:          ["vrd", "evacuation eaux", "regard", "caniveau", "drain"],
  maconnerie:   ["maconnerie", "parpaing", "brique", "agglomere", "elevation", "mur", "chainage", "linteau", "raidisseur"],
  plomberie:    ["plomberie", "robinet", "mitigeur", "sanitaire", "douche", "baignoire", "lavabo", "wc", "tuyau", "evacuation pvc", "raccord plymouth", "cumulus", "ballon", "per", "ec/ef"],
  electricite:  ["electricite", "prise", "interrupteur", "va et vient", "telerupteur", "tableau electrique", "disjoncteur", "fil", "cable", "consuel", "parafoudre", "celiane", "legrand"],
  menuiserie:   ["menuiserie", "fenetre", "porte", "volet", "vitrage", "baie", "chassis", "gond"],
  platrerie:    ["platrerie", "placo", "cloison", "doublage", "plafond", "ba13", "placostyl", "hourdis"],
  charpente:    ["charpente", "fermette", "lambourde", "solive", "chevron", "panne", "sablieres"],
  couverture:   ["couverture", "tuile", "ardoise", "faitage", "closoir", "ecran sous-toiture"],
  zinguerie:    ["zinguerie", "gouttiere", "descente eaux", "naissance", "tuyau de descente", "boite a eau"],
  isolation:    ["isolation", "isolant", "laine de verre", "laine de roche", "polystyrene", "vermiculite", "ouate"],
  etancheite:   ["etancheite", "membrane", "sopralene", "bitume", "styrbase", "efigreen", "couvertine", "trop plein"],
  enduit:       ["enduit", "crepi", "facade", "monocouche", "weber", "parex", "tableau gratte"],
  escalier:     ["escalier", "marche", "contremarche", "habillage escalier", "garde-corps", "rampe"],
  // Métaux & accessoires structurels — souvent mal groupés dans les groupes principaux
  acier:        ["ipn", "ipe", "ip14", "ip6", "ip8", "ip10", "ip12", "poutre acier", "linteau acier"],
  // Coupe / découpe — légitime en accompagnement de plusieurs domaines (carrelage)
  coupe:        ["coupe", "decoupe", "scie"],
};

// Domaines adjacents — autorisés en accompagnement d'un domaine principal.
// Ex: "Coupe des dalles" est légitime dans un groupe "Carrelage".
const ADJACENT_DOMAINS: Record<string, string[]> = {
  carrelage:    ["coupe"],
  pavage:       ["coupe", "terrassement"],
  terrassement: ["pavage"],
  couverture:   ["zinguerie"],
  zinguerie:    ["couverture"],
};

// ──────────────────────────────────────────────────────────────────────────────
// Seuils de décision
// ──────────────────────────────────────────────────────────────────────────────

/** Score < ce seuil → groupe hétérogène confirmé (action prudente). */
export const HETEROGENEOUS_CONFIRMED_THRESHOLD = 0.5;
/** Score ≥ ce seuil → groupe homogène confirmé (ne pas flagger même si ratio prix élevé). */
export const HOMOGENEOUS_CONFIRMED_THRESHOLD   = 0.7;
/** Niveau 1 fallback — ratio prix unitaire calculé vs max marché unitaire. */
export const HETEROGENEOUS_PRICE_RATIO         = 2;

// ──────────────────────────────────────────────────────────────────────────────
// V3.4.5 — Détection des mismatches "pièce" dans le job_type_label
// ──────────────────────────────────────────────────────────────────────────────
//
// Problème observé sur le devis Thouret Elec :
// Gemini a choisi un job_type catalogue "raccordements_electricite_cuisine"
// pour grouper 18 lignes de fournitures électriques (moulures, prises,
// disjoncteurs, fils...) alors qu'AUCUNE ligne du devis ne mentionne "cuisine"
// (la seule pièce mentionnée est "chambre").
//
// Conséquences :
//   - Label affiché à l'utilisateur trompeur : "Raccordements électricité cuisine"
//   - Fourchette marché potentiellement fausse (celle de la cuisine, qui a typiquement
//     plus de prises et circuits) → comparaison vs marché peut être faussée.
//
// Solution Niveau 2 :
//   1. Détecter quand un job_type_label contient un mot-pièce qui n'apparaît dans
//      AUCUNE description des lignes du groupe → "room mismatch".
//   2. Marquer ces groupes comme hétérogènes → ils sont exclus des calculs
//      surcout/anomalies (réutilise l'infrastructure V3.4.1).
//   3. Nettoyer le label affiché à l'utilisateur via `cleanJobTypeLabel`.

/** Mots-pièce qui peuvent apparaître dans les job_type_label du catalogue marché. */
export const ROOM_KEYWORDS: Record<string, string[]> = {
  // Forme normalisée canonique → variantes acceptées dans labels/descriptions
  cuisine:       ["cuisine"],
  sdb:           ["sdb", "salle de bain", "salle de bains", "salle d'eau"],
  wc:            ["wc", "toilettes"],
  chambre:       ["chambre"],
  salon:         ["salon", "sejour", "salle a manger", "salle de sejour", "piece a vivre"],
  bureau:        ["bureau"],
  garage:        ["garage"],
  cellier:       ["cellier", "buanderie", "lingerie"],
  entree:        ["entree", "hall", "vestibule"],
  couloir:       ["couloir", "degagement", "circulation"],
  exterieur:     ["terrasse", "balcon", "jardin", "exterieur"],
  cave:          ["cave", "sous-sol", "sous sol"],
  combles:       ["combles", "grenier"],
};

/**
 * Extrait la pièce mentionnée dans un texte (label ou description).
 * Retourne le nom canonique (clé de ROOM_KEYWORDS) si une variante matche, sinon null.
 *
 * @example
 * extractRoom("Raccordements électricité cuisine") // → "cuisine"
 * extractRoom("Carrelage salle de bain 5m²")        // → "sdb"
 * extractRoom("Prise de courant blanc")             // → null
 */
export function extractRoom(text: string): string | null {
  const normalized = normalizeText(text);
  for (const [canonical, variants] of Object.entries(ROOM_KEYWORDS)) {
    if (variants.some(v => normalized.includes(v))) return canonical;
  }
  return null;
}

/**
 * Détecte si le `job_type_label` d'un groupe mentionne une pièce qui n'apparaît
 * dans AUCUNE description des lignes du devis → mismatch confirmé.
 *
 * Retourne :
 *   - null si pas de pièce dans le label (cas normal)
 *   - room name si pièce détectée dans label mais absente des descriptions
 *
 * Exemple Thouret Elec :
 *   - label "Raccordements électricité cuisine" → room "cuisine"
 *   - descriptions = "Prise de courant", "Disjoncteur P+N 20A", "FIL 2,5MM",
 *     "Prestation déplacement... plafonnier chambre" → aucune mention "cuisine"
 *   - → retourne "cuisine" (mismatch confirmé)
 */
export function detectRoomMismatch(g: HomogeneityGroupInput): string | null {
  const label = String(g.job_type_label || "");
  const labelRoom = extractRoom(label);
  if (!labelRoom) return null; // pas de pièce dans le label = pas de mismatch possible

  // Vérifier les descriptions des lignes du devis
  const lines = g.devis_lines || [];
  for (const line of lines) {
    const lineRoom = extractRoom(String(line.description || ""));
    if (lineRoom === labelRoom) return null; // pièce confirmée par au moins 1 ligne
  }
  // Pièce dans le label mais aucune ligne ne la mentionne → mismatch
  return labelRoom;
}

/**
 * Nettoie un job_type_label en retirant le mot-pièce si mismatch détecté.
 * Utilisé à l'AFFICHAGE pour ne pas tromper l'utilisateur avec une pièce
 * qui n'apparaît pas dans son devis.
 *
 * @example
 * cleanJobTypeLabel("Raccordements électricité cuisine", linesAboutChambre)
 *   // → "Raccordements électricité"
 *
 * Si pas de mismatch ou pas de pièce → retourne le label inchangé.
 */
export function cleanJobTypeLabel(label: string, g: HomogeneityGroupInput): string {
  const mismatchRoom = detectRoomMismatch(g);
  if (!mismatchRoom) return label;

  // Retirer toutes les variantes du mot-pièce du label (case-insensitive)
  const variants = ROOM_KEYWORDS[mismatchRoom] || [];
  let cleaned = label;
  for (const v of variants) {
    // Regex case-insensitive, mot-frontière approximatif
    const re = new RegExp(`\\s*\\b${v.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "gi");
    cleaned = cleaned.replace(re, "");
  }
  // Nettoyer espaces multiples et trim
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  // Si le label devient vide ou ne contient plus que des stop-words, fallback
  if (cleaned.length < 3) return label;
  return cleaned;
}

// ──────────────────────────────────────────────────────────────────────────────
// Utilitaires
// ──────────────────────────────────────────────────────────────────────────────

/** Normalise une chaîne pour comparaison : minuscule + retrait des accents. */
export function normalizeText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Détecte le domaine BTP principal d'un groupe à partir de son `job_type_label`
 * (et éventuellement `job_type` interne). Retourne null si aucun domaine matché.
 *
 * L'ordre des entrées de DOMAIN_KEYWORDS est important : domaines spécifiques
 * d'abord (ex: "escalier" avant "acier" qui pourrait sinon capter "escalier acier").
 */
export function detectGroupDomain(g: HomogeneityGroupInput): string | null {
  const haystack = normalizeText(
    String(g.job_type_label || "") + " " + String(g.job_type || "")
  );
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some(kw => haystack.includes(kw))) return domain;
  }
  return null;
}

/**
 * V3.4 Niveau 2 — Score d'homogénéité sémantique d'un groupe.
 *
 * @returns Score dans [0, 1] :
 *   - 1.0 si le groupe est parfaitement homogène (toutes les lignes parlent du même métier)
 *   - 0.0 si totalement hétérogène (aucune ligne ne matche le domaine)
 *   - -1 si le domaine n'a pas pu être détecté (impossible de calculer le score)
 *
 * Méthode défensive : on prend le MIN entre :
 *   - le poids monétaire des lignes matchant le domaine (par montant)
 *   - le ratio de lignes matchant le domaine (par count)
 *
 * Le MIN protège contre les cas où 1 grosse ligne légitime masque 4 petites
 * lignes étrangères.
 *
 * Exemple Kern - "Carrelage (fourni+posé) 13.5 m²" :
 *   - 5 lignes, domaine "carrelage" détecté (+ adjacent "coupe")
 *   - Lignes matchées : "Dalle céramique" (2160€) + "Coupe des dalles" (1000€)
 *   - Non-matched : chape (500€), primaire (162€), ip14 (600€) = 3 lignes
 *   - Weighted score = 3160 / 4422 = 0.71
 *   - Count ratio   = 2 / 5 = 0.40
 *   - MIN(0.71, 0.40) = 0.40 → HÉTÉROGÈNE confirmé ✓
 */
export function groupHomogeneityScore(g: HomogeneityGroupInput): number {
  const lines = g.devis_lines || [];
  if (lines.length <= 1) return 1; // single line = trivialement homogène

  const domain = detectGroupDomain(g);
  if (!domain) return -1; // domaine inconnu → fallback Niveau 1

  // Enrichir avec keywords des domaines adjacents
  const allowedKeywords = new Set<string>(DOMAIN_KEYWORDS[domain] || []);
  for (const adjDomain of (ADJACENT_DOMAINS[domain] || [])) {
    for (const kw of (DOMAIN_KEYWORDS[adjDomain] || [])) allowedKeywords.add(kw);
  }
  const keywordsList = Array.from(allowedKeywords);

  let totalAmount = 0;
  let matchedAmount = 0;
  let totalLines = 0;
  let matchedLines = 0;

  for (const line of lines) {
    const desc = normalizeText(String(line.description || ""));
    // Support des 2 conventions de nommage : snake_case (serveur) et camelCase (client)
    const amt = typeof line.amount_ht === "number" ? line.amount_ht
              : typeof line.amountHT === "number" ? line.amountHT : 0;
    if (amt <= 0) continue;

    totalAmount += amt;
    totalLines++;

    const matched = keywordsList.some(kw => desc.includes(kw));
    if (matched) {
      matchedAmount += amt;
      matchedLines++;
    }
  }

  if (totalAmount <= 0 || totalLines === 0) return -1;

  const weightedScore = matchedAmount / totalAmount;
  const countRatio    = matchedLines / totalLines;
  return Math.min(weightedScore, countRatio);
}

/**
 * Détecte si un groupe est probablement hétérogène (mal regroupé par Gemini) OU
 * mal matché au catalogue (room mismatch).
 *
 * Architecture en cascade :
 *   0. Room mismatch (V3.4.5) : label mentionne une pièce absente des descriptions → true.
 *      Match catalogue suspect → fourchette marché potentiellement fausse → exclure.
 *   1. Niveau 2 prioritaire : si score sémantique < 0.5 → true.
 *   2. Niveau 2 confirmation positive : si score ≥ 0.7 → false (peu importe le ratio prix).
 *   3. Niveau 1 fallback : sinon, on regarde si prix unitaire > 2× max marché unitaire.
 *
 * @param g Groupe à analyser (format serveur ou client compatible).
 * @returns true si le groupe doit être traité comme hétérogène (pas d'anomalie).
 */
export function isLikelyHeterogeneousGroup(g: HomogeneityGroupInput): boolean {
  // ── NIVEAU 2bis (V3.4.5) — Room mismatch : catalogue mal matché ──────────
  // Si le label catalogue mentionne une pièce (cuisine, sdb, chambre...) qui
  // n'apparaît dans aucune description, c'est que Gemini a choisi un job_type
  // catalogue spécifique à une pièce alors que le devis ne concerne pas cette
  // pièce. La fourchette marché est probablement fausse → exclure.
  if (detectRoomMismatch(g) !== null) return true;

  // ── NIVEAU 2 (prioritaire) — scoring sémantique ──────────────────────────
  const score = groupHomogeneityScore(g);
  if (score >= 0) {
    if (score < HETEROGENEOUS_CONFIRMED_THRESHOLD) return true;
    if (score >= HOMOGENEOUS_CONFIRMED_THRESHOLD) return false;
    // Zone grise (0.5 - 0.7) : on continue vers Niveau 1 pour décider
  }

  // ── NIVEAU 1 (fallback) — critère ratio prix unitaire ────────────────────
  const lines = g.devis_lines || [];
  if (lines.length < 3) return false;

  const mainQty = typeof g.main_quantity === "number" && g.main_quantity > 0 ? g.main_quantity : 0;
  const devisTotal = typeof g.devis_total_ht === "number" ? g.devis_total_ht : 0;
  if (mainQty <= 0 || devisTotal <= 0) return false;

  const prices = Array.isArray(g.prices) ? g.prices : [];
  if (prices.length === 0) return false;

  let unitMaxMarket = 0;
  for (const p of prices) {
    if (!p || typeof p !== "object") continue;
    unitMaxMarket += (typeof p.price_max_unit_ht === "number" ? p.price_max_unit_ht : 0);
  }
  if (unitMaxMarket <= 0) return false;

  const unitDevis = devisTotal / mainQty;
  return unitDevis > unitMaxMarket * HETEROGENEOUS_PRICE_RATIO;
}
