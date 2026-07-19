/**
 * src/lib/analyse/preparationBuilder.ts
 *
 * Reformate les données produites par le moteur (ConclusionData + points_ok +
 * alertes) en trois sections narratives pour la fiche « Préparez votre
 * rendez-vous avec votre artisan ».
 *
 * IMPORTANT — Ce module n'invente aucune donnée, ne modifie aucun scoring,
 * ne change aucun seuil. Il redistribue et reformule ce qui existe déjà,
 * suivant la Bible Produit VMD.
 *
 * Section 1 — « Ce que vous pouvez rappeler pour ouvrir la discussion »
 *   Construite à partir de 1 à 2 points_ok positifs + phrase d'ancrage.
 *
 * Section 2 — « Ce que vous pouvez lui demander »
 *   Actions à discuter (négocier, clarifier, préciser). Chaque item se voit
 *   attribuer un contexte court et une question prononçable.
 *
 * Section 3 — « Ce qu'il ne faut pas oublier »
 *   Actions de type standard métier (assurance décennale, planning, etc.)
 *   + alertes graves remontées depuis les blocs sécurité / entreprise.
 */

import type { ConclusionData } from "./conclusionTypes";

export interface PreparationSections {
  /** Phrase courte d'ouverture (null si aucun point_ok pertinent). */
  rappelPourOuvrir: string | null;
  /** Points à discuter — un contexte + une question prononçable. */
  aDemander: Array<{ context: string; question: string }>;
  /** Standards du métier à ne pas oublier avant signature. */
  aNePasOublier: string[];
}

const CLARIFIER_KEYWORDS = [
  "clarif", "précis", "detail", "détail", "surface", "quantit", "quantité",
  "unit", "unité", "spécif", "descript",
];

const NEGOCIER_KEYWORDS = [
  "négoc", "negoc", "ajust", "revoir", "réduc", "reduc", "baiss",
  "prix", "tarif", "revoyez", "comparez",
];

const STANDARD_KEYWORDS = [
  "attestation", "assurance", "décennale", "decennale", "rc pro",
  "planning", "délai", "delai", "garantie", "acompte", "iban",
  "cerfa", "permis", "urbanisme", "certification", "rge", "qualib",
];

const DEMANDER_PREFIXES = /^(demand(?:ez|er)|exig(?:ez|er)|clarif(?:iez|ier)|précis(?:ez|er)|preciez|precisez|invit(?:ez|er)|fait(?:es|re)\s+préciser|obtenez|réclam(?:ez|er)|reclamez)/i;

/** Verbes impératifs qui deviennent « Pouvez-vous me confirmer … ? » */
const CONFIRMER_PREFIXES = /^(v[eé]rifi(?:ez|er)|confirm(?:ez|er)|contrôl(?:ez|er)|controlez|valid(?:ez|er))/i;
/** Verbes impératifs qui deviennent « Pouvez-vous me préciser … ? »
 *  Couvre les contractions « que » / « qu' » après « Assurez-vous ». */
const PRECISER_PREFIXES = /^(assurez[\s-]?vous(?:\s+(?:que|qu['']|de))?|assurer[\s-]?vous(?:\s+(?:que|qu['']|de))?)/i;
/** Verbes impératifs qui deviennent « Pouvez-vous me transmettre … ? » */
const TRANSMETTRE_PREFIXES = /^(demand(?:ez|er)|obtenez|obtenir|r[eé]clam(?:ez|er)|reclamez)\s+(?:(?:une|un|des|le|la|les|l['']))/i;

/**
 * Retire les scories rédactionnelles injectées par le moteur qui n'ont pas
 * leur place dans un message à envoyer à un artisan.
 * - « mentionné/indiqué/figurant sur le devis »
 * - « en cours de validité » (courant mais redondant dans une question)
 * - « notamment » (charge sans apport)
 * - Espaces multiples.
 */
function stripDevisFluff(s: string): string {
  return s
    .replace(/\s+(?:mentionn[ée]|indiqu[ée]|figurant|pr[eé]sent[ée])\s+sur\s+le\s+devis/gi, "")
    .replace(/\s+en\s+cours\s+de\s+validit[ée]/gi, "")
    .replace(/\s+notamment\b/gi, "")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Coupe un item au premier marqueur d'auto-conseil qui n'a rien à faire
 * dans un message à l'artisan (« et assurez-vous que… », « n'oubliez pas
 * de… », « en veillant à… »).
 */
function truncateAtSelfGuidance(s: string): string {
  const markers = [
    /\s+et\s+assurez[\s-]?vous\s+(?:que|qu['']|de)/i,
    /\s+en\s+veillant\s+[àa]\s+ce\s+que/i,
    /\s+en\s+veillant\s+[àa]/i,
    /\s+n[''']?oubliez\s+pas\s+(?:de|d[''])/i,
    /\s+pens(?:ez|er)\s+[àa]/i,
  ];
  let cut = s;
  for (const rx of markers) {
    const m = cut.match(rx);
    if (m && m.index !== undefined) {
      cut = cut.slice(0, m.index).replace(/[,\s]+$/, "");
    }
  }
  return cut.trim();
}

function isStandardAction(action: string): boolean {
  const lower = action.toLowerCase();
  return STANDARD_KEYWORDS.some((kw) => lower.includes(kw));
}

function isClarificationOrNegotiation(action: string): boolean {
  const lower = action.toLowerCase();
  return (
    CLARIFIER_KEYWORDS.some((kw) => lower.includes(kw)) ||
    NEGOCIER_KEYWORDS.some((kw) => lower.includes(kw))
  );
}

/**
 * Nettoie une chaîne des scories de wording admin qui peuvent traîner dans
 * points_ok / alertes / actions_avant_signature :
 *   - Emojis 🔴 🟠 🟡 🟢 🔵 (ronds de sévérité)
 *   - Emojis ⚠ ⚡ ❗ ‼ (avertissements)
 *   - Puces • ● en tête
 *   - « Un point à faire préciser : à l'artisan / à l'entreprise / au professionnel »
 *   - Espaces multiples
 */
function stripAdminScoriae(s: string): string {
  return s
    // Emojis colorés / symboles à couleur (blocs Unicode « Miscellaneous Symbols » et « Supplemental Symbols » + variation selector)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2100}-\u{214F}\u{FE0F}\u{20E3}]/gu, "")
    .replace(/^[\s•●▪▫◦→›»]+/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Détecte les items purement informatifs (ne demandent aucune action) qui
 * n'ont rien à faire dans la section « Ce qu'il ne faut pas oublier ».
 * Exemples : « Acompte modéré (50%). Cela reste une pratique courante. »
 */
const INFORMATIF_MARKERS = [
  "généralement recommandé",
  "pratique courante",
  "reste une pratique",
  "à titre indicatif",
  "cela reste",
  "à titre informatif",
  "reste dans la norme",
  "sans particularité",
  "reste standard",
];
function isPurelyInformative(s: string): boolean {
  const lower = s.toLowerCase();
  return INFORMATIF_MARKERS.some((kw) => lower.includes(kw));
}

/**
 * Enlève le préfixe verbal + la référence à l'artisan/entreprise/etc. pour
 * garder uniquement le contenu utile. Convertit une action impérative
 * ("Demandez à l'artisan de préciser X") en groupe nominal courant
 * ("préciser X" / "la surface de peinture" / etc.).
 */
function stripImperativePrefix(action: string): string {
  let rest = action.trim().replace(/\s+/g, " ");
  // 1. Retire le verbe impératif au début (Demandez / Exigez / etc.)
  rest = rest.replace(DEMANDER_PREFIXES, "").trim();
  // 2. Retire la mention du destinataire de l'action
  rest = rest.replace(/^(?:à\s+l[''`]?(?:artisan|artisane|entreprise|entrepreneur|professionnel)|au\s+(?:professionnel|prestataire|maître\s+d[''`]?œuvre))\s*/i, "").trim();
  // 3. Retire "de" ou "d'" résiduel après le retrait du destinataire
  rest = rest.replace(/^d[e']\s*/i, "").trim();
  return rest;
}

/**
 * Transforme une action impérative en « contexte factuel » + « question
 * spécifique » prête à être copiée telle quelle dans un mail à l'artisan.
 *
 * La question était auparavant générique (« Pouvez-vous me préciser ce
 * point ? ») ; elle intègre désormais le sujet de la question pour être
 * réellement utilisable en copier-coller.
 *
 * Exemples :
 *   « Vérifiez la validité du numéro QualiPAC mentionné sur le devis »
 *      → context : « La validité du numéro QualiPAC »
 *      → question : « Pouvez-vous me confirmer la validité du numéro QualiPAC ? »
 *
 *   « Assurez-vous qu'un acompte est prévu »
 *      → context : « Un acompte est prévu »
 *      → question : « Pouvez-vous me préciser les modalités de l'acompte ? »
 */
function reformulateAsQuestion(action: string): { context: string; question: string } {
  const cleaned = stripDevisFluff(truncateAtSelfGuidance(stripAdminScoriae(action)));

  // Cas : « Négociez X »
  if (/^négoc|^negoc/i.test(cleaned)) {
    const rest = cleaned
      .replace(/^négoc(?:iez|ier)\s*/i, "")
      .replace(/^negoc(?:iez|ier)\s*/i, "")
      .trim();
    return {
      context: rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : "Poste à ouvrir à la discussion.",
      question: `« Est-ce que ce poste peut être ajusté ? »`,
    };
  }

  // Cas : « Vérifiez X », « Confirmez X », « Contrôlez X », « Validez X »
  if (CONFIRMER_PREFIXES.test(cleaned)) {
    const rest = cleaned.replace(CONFIRMER_PREFIXES, "").trim().replace(/^d[e']\s*/i, "");
    if (!rest) return { context: "Point à confirmer.", question: `« Pouvez-vous me confirmer ce point ? »` };
    const lower = rest.charAt(0).toLowerCase() + rest.slice(1);
    return {
      context: rest.charAt(0).toUpperCase() + rest.slice(1),
      question: `« Pouvez-vous me confirmer ${lower} ? »`,
    };
  }

  // Cas : « Assurez-vous que … » (auto-conseil transformé en question)
  if (PRECISER_PREFIXES.test(cleaned)) {
    let rest = cleaned.replace(PRECISER_PREFIXES, "").trim();
    // Retire un « qu' » / « que » / « d' » / « de » résiduels si le regex
    // n'a pas capturé la contraction (« Assurez-vous qu'un … »).
    rest = rest.replace(/^(?:qu['e]\s*|d[e']\s*)/i, "").trim();
    if (!rest) return { context: "Point à préciser.", question: `« Pouvez-vous me préciser ce point ? »` };
    const lower = rest.charAt(0).toLowerCase() + rest.slice(1);
    return {
      context: rest.charAt(0).toUpperCase() + rest.slice(1),
      question: `« Pouvez-vous me préciser ${lower} ? »`,
    };
  }

  // Cas : « Demandez à l'artisan de préciser X » / « Demandez l'attestation X »
  const demanderMatch = cleaned.match(DEMANDER_PREFIXES);
  if (demanderMatch) {
    const rest = stripImperativePrefix(cleaned);
    if (!rest) return { context: "Point à clarifier.", question: `« Pouvez-vous me préciser ce point ? »` };
    const lower = rest.charAt(0).toLowerCase() + rest.slice(1);
    // Si le sujet ressemble à un document / une pièce à obtenir → « transmettre »
    const looksLikeDoc = /^(l[e']|la\s|les\s|un\s|une\s|des\s|vos\s|votre\s)/i.test(rest) &&
                        /\b(attestation|certificat|justificatif|copie|planning|éch[ée]ancier|assurance|kbis|siret)\b/i.test(rest);
    const verb = looksLikeDoc ? "me transmettre" : "me préciser";
    return {
      context: rest.charAt(0).toUpperCase() + rest.slice(1),
      question: `« Pouvez-vous ${verb} ${lower} ? »`,
    };
  }

  // Cas générique : garde l'action nettoyée en contexte, question courte
  return {
    context: cleaned.charAt(0).toUpperCase() + cleaned.slice(1),
    question: `« Pouvez-vous m'en dire un peu plus sur ce point ? »`,
  };
}

/**
 * Simplifie un point_ok pour l'intégrer dans une phrase d'ouverture SOBRE.
 * Retourne { key, text } — la clé sert à dédupliquer sémantiquement (éviter
 * plusieurs phrases « l'entreprise ... l'entreprise ... »).
 *
 * Les textes NE commencent PAS tous par « l'entreprise » pour permettre une
 * fusion élégante (« établie depuis longtemps et bien notée » plutôt que
 * « l'entreprise est établie depuis longtemps et l'entreprise est bien notée »).
 */
function simplifyPointOk(point: string): { key: string; short: string } | null {
  const lower = point.toLowerCase();
  if (lower.includes("assurance") || lower.includes("décennale") || lower.includes("decennale") || lower.includes("rge") || lower.includes("qualib")) {
    return { key: "cert", short: "certifications et assurances en règle" };
  }
  if (lower.includes("avis") || lower.includes("note") || lower.includes("google")) {
    return { key: "avis", short: "bien notée par ses clients" };
  }
  if (lower.includes("ancien") || lower.includes("depuis") || lower.includes("siret") || lower.includes("actif")) {
    return { key: "anciennete", short: "établie depuis longtemps" };
  }
  if (lower.includes("paiement") || lower.includes("acompte") || lower.includes("iban")) {
    return { key: "paiement", short: "conditions de paiement classiques" };
  }
  return null;
}

export function buildPreparationSections(
  conclusion: ConclusionData,
  pointsOk: string[],
  alertes: string[],
): PreparationSections {
  const actions = conclusion.actions_avant_signature ?? [];

  // ── Section 1 — Rappel d'ouverture ─────────────────────────────────────
  // Une phrase courte et factuelle. AUCUN méta-conseil de type « c'est une
  // bonne base de conversation, mieux vaut le lui dire ». On ne scénarise
  // pas la conversation du user avec son artisan — on lui donne un fait
  // rassurant, il en fait ce qu'il veut. Section masquée s'il n'y a rien
  // de tangible à mettre en avant (silence assumé, cf. Bible §11 principe #4).
  const positivesMap = new Map<string, string>();
  for (const p of pointsOk) {
    const simp = simplifyPointOk(p);
    if (simp && !positivesMap.has(simp.key)) positivesMap.set(simp.key, simp.short);
  }
  const uniquePositives = [...positivesMap.values()].slice(0, 2);

  let rappelPourOuvrir: string | null = null;
  if (uniquePositives.length >= 2) {
    rappelPourOuvrir = `L'entreprise est ${uniquePositives.join(" et ")}.`;
  } else if (uniquePositives.length === 1) {
    rappelPourOuvrir = `L'entreprise est ${uniquePositives[0]}.`;
  }
  // Silence si aucun positif tangible — même en cas de verdict « signer ».
  // Une phrase générique inventée ne rassure personne.

  // ── Section 2 — Ce que vous pouvez lui demander ────────────────────────
  // Un item va en section 2 s'il est :
  //   (a) formulé comme une VÉRIFICATION / CONFIRMATION à demander à l'artisan
  //       (« Vérifiez X », « Assurez-vous que Y ») — même s'il contient un mot
  //       standard (« acompte », « planning »…) : ces actions sont des questions
  //       à poser, pas des pièces à obtenir ;
  //   (b) ou une clarification / négociation classique ;
  //   (c) ou une action non-standard (autre demande de précision).
  const inSection2 = new Set<string>();
  const aDemander = actions
    .filter((a) => {
      const isCheckOrConfirm = CONFIRMER_PREFIXES.test(a) || PRECISER_PREFIXES.test(a);
      const isNegoOrClarif = isClarificationOrNegotiation(a);
      const nonStandard = !isStandardAction(a);
      if (isCheckOrConfirm || isNegoOrClarif || nonStandard) {
        inSection2.add(a);
        return true;
      }
      return false;
    })
    .slice(0, 4)
    .map(reformulateAsQuestion);

  // ── Section 3 — Ce qu'il ne faut pas oublier ───────────────────────────
  // Ne garde QUE des pièces à obtenir (attestations, planning, etc.). Les
  // items déjà remontés en section 2 sont retirés pour éviter le doublon.
  const standardActions = actions
    .filter((a) => isStandardAction(a) && !inSection2.has(a) && !isPurelyInformative(a));
  const alertesStandards = alertes.filter((a) => isStandardAction(a)).filter((a) => !isPurelyInformative(a));
  const combined = Array.from(new Set([...standardActions, ...alertesStandards]));
  const aNePasOublier = combined
    .slice(0, 3)
    .map((raw) => reformulateStandardItem(raw))
    .filter((s) => s.length > 0 && !isPurelyInformative(s));

  return {
    rappelPourOuvrir,
    aDemander,
    aNePasOublier,
  };
}

/**
 * Reformule un item "standard" (attestation, planning, assurance…) pour la
 * section « Ce qu'il ne faut pas oublier ». Enlève les emojis, les préfixes
 * « Demandez à l'artisan… » et convertit en groupe nominal court.
 *
 * Exemples :
 *   "🔴 Comptes non accessibles publiquement (dernier exercice…)"
 *      → "Comptes non accessibles publiquement"
 *   "Demandez à l'entreprise de justifier l'absence de publication…"
 *      → "Une justification de l'absence de publication…"
 *   "Demandez l'attestation d'assurance décennale valide pour 2026"
 *      → "L'attestation d'assurance décennale valide pour 2026"
 */
function reformulateStandardItem(raw: string): string {
  let s = stripAdminScoriae(raw);
  // Coupe au premier auto-conseil (« et assurez-vous que … », « n'oubliez pas
  // de … », « en veillant à … ») qui n'a rien à faire dans un mail à l'artisan.
  s = truncateAtSelfGuidance(s);
  // Nettoie les scories rédactionnelles (« mentionné sur le devis »,
  // « en cours de validité » redondant, « notamment »).
  s = stripDevisFluff(s);
  // Retire les parenthèses de contexte historique (« dernier exercice… »)
  // qui alourdissent le mail. On garde 1 seule idée par item.
  const parenIdx = s.indexOf(" (");
  if (parenIdx > 20) s = s.slice(0, parenIdx);
  // Retire l'impératif + destinataire (« Demandez à l'entreprise l'attestation
  // décennale » → « L'attestation décennale »)
  const demanderMatch = s.match(DEMANDER_PREFIXES);
  if (demanderMatch) {
    const rest = stripImperativePrefix(s);
    if (rest) return rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  // Idem pour Vérifiez/Confirmez → nettoie le verbe pour donner un groupe nominal
  if (CONFIRMER_PREFIXES.test(s)) {
    const rest = s.replace(CONFIRMER_PREFIXES, "").trim().replace(/^d[e']\s*/i, "");
    if (rest) return rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return s;
}

/**
 * Extrait un prénom exploitable depuis le nom d'entreprise, ou null.
 * Filtre strict : rejette les raisons sociales (SARL, SAS, etc.) et les
 * noms génériques (Entreprise, Ent.).
 */
export function extractArtisanFirstName(entrepriseName: string | null | undefined): string | null {
  if (!entrepriseName) return null;
  const trimmed = entrepriseName.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  const REJECT = ["SARL", "SAS", "SASU", "EURL", "SA ", "SCI", "SNC", "SCOP", "ENTREPRISE", "ENT.", "ENT ", "CIE", "GROUPE", "SOCIÉTÉ", "SOCIETE"];
  if (REJECT.some((kw) => upper.includes(kw))) return null;

  // Refuse si contient des chiffres
  if (/\d/.test(trimmed)) return null;

  // Prend le premier mot (probable prénom si nom commercial personnel)
  const first = trimmed.split(/[\s&/,-]+/)[0];
  if (!first || first.length < 3 || first.length > 20) return null;

  // Refuse tout ce qui commence par une minuscule
  if (first[0] !== first[0].toUpperCase()) return null;

  // Capitalise proprement
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
