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
    .replace(/[\u{1F534}\u{1F7E0}\u{1F7E1}\u{1F7E2}\u{1F535}\u{26A0}\u{26A1}\u{2757}\u{203C}]️?/gu, "")
    .replace(/^[\s•●▪▫◦]+/g, "")
    .trim()
    .replace(/\s+/g, " ");
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
 * Transforme une action impérative ("Demandez X") en formulation
 * "contexte / question prononçable" plus bienveillante.
 */
function reformulateAsQuestion(action: string): { context: string; question: string } {
  const cleaned = stripAdminScoriae(action);

  // Cas : "Négociez X" → traitement dédié
  if (/^négoc|^negoc/i.test(cleaned)) {
    const rest = cleaned
      .replace(/^négoc(?:iez|ier)\s*/i, "")
      .replace(/^negoc(?:iez|ier)\s*/i, "")
      .trim();
    return {
      context: rest ? `Point à ouvrir à la discussion : ${rest.charAt(0).toLowerCase()}${rest.slice(1)}` : "Un point à ouvrir à la discussion.",
      question: `« Est-ce que ce poste peut être ajusté ? »`,
    };
  }

  // Cas : "Demandez à l'artisan de préciser X" → nettoie puis reformule
  const demanderMatch = cleaned.match(DEMANDER_PREFIXES);
  if (demanderMatch) {
    const rest = stripImperativePrefix(cleaned);
    if (!rest) {
      return {
        context: "Un point à faire préciser.",
        question: `« Pouvez-vous me préciser ce point ? »`,
      };
    }
    const context = `Point à faire préciser : ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
    return { context, question: `« Pouvez-vous me préciser ce point ? »` };
  }

  // Cas générique : garde l'action nettoyée en contexte
  return {
    context: cleaned,
    question: `« Pouvez-vous m'en dire un peu plus sur ce point ? »`,
  };
}

/**
 * Simplifie un point_ok pour l'intégrer dans une phrase d'ouverture.
 * Ex : "Entreprise active depuis 2014, 47 avis Google (4,6/5)"
 *      -> "l'entreprise a un bon profil"
 */
function simplifyPointOk(point: string): string | null {
  const lower = point.toLowerCase();
  if (lower.includes("assurance") || lower.includes("décennale") || lower.includes("decennale") || lower.includes("rge") || lower.includes("qualib")) {
    return "les certifications et assurances sont en règle";
  }
  if (lower.includes("avis") || lower.includes("note") || lower.includes("google")) {
    return "l'entreprise a un bon profil";
  }
  if (lower.includes("ancien") || lower.includes("depuis") || lower.includes("siret") || lower.includes("actif")) {
    return "l'entreprise est établie de longue date";
  }
  if (lower.includes("paiement") || lower.includes("acompte") || lower.includes("iban")) {
    return "les conditions de paiement sont classiques";
  }
  return null;
}

export function buildPreparationSections(
  conclusion: ConclusionData,
  pointsOk: string[],
  alertes: string[],
): PreparationSections {
  const actions = conclusion.actions_avant_signature ?? [];

  // ── Section 1 — Ouverture ──────────────────────────────────────────────
  const positives = pointsOk
    .map(simplifyPointOk)
    .filter((s): s is string => s !== null);

  const uniquePositives = Array.from(new Set(positives)).slice(0, 2);

  let rappelPourOuvrir: string | null = null;
  if (uniquePositives.length >= 2) {
    rappelPourOuvrir = `Le devis correspond à votre projet, ${uniquePositives.join(" et ")}. C'est une bonne base de conversation — mieux vaut le lui dire en ouverture.`;
  } else if (uniquePositives.length === 1) {
    rappelPourOuvrir = `Sur l'ensemble, ${uniquePositives[0]}. C'est une bonne base pour ouvrir la discussion.`;
  } else if (conclusion.verdict_decisionnel === "signer") {
    rappelPourOuvrir = "Le devis correspond à votre projet et les points principaux sont dans les habitudes du métier. C'est une bonne base de conversation.";
  }

  // ── Section 2 — Ce que vous pouvez lui demander ────────────────────────
  const aDemander = actions
    .filter((a) => !isStandardAction(a))
    .filter((a) => isClarificationOrNegotiation(a) || !isStandardAction(a))
    .slice(0, 4)
    .map(reformulateAsQuestion);

  // ── Section 3 — Ce qu'il ne faut pas oublier ───────────────────────────
  const standardActions = actions.filter(isStandardAction);
  const alertesStandards = alertes.filter((a) => isStandardAction(a));
  const combined = Array.from(new Set([...standardActions, ...alertesStandards]));
  // Nettoie chaque item (emojis, puces, préfixes impératifs traînants)
  // puis produit un texte prononçable au discours indirect naturel.
  const aNePasOublier = combined
    .slice(0, 3)
    .map((raw) => reformulateStandardItem(raw))
    .filter((s) => s.length > 0);

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
  // Retire les parenthèses de contexte historique (« dernier exercice… »)
  // qui alourdissent le mail. On garde 1 seule idée par item.
  const parenIdx = s.indexOf(" (");
  if (parenIdx > 20) s = s.slice(0, parenIdx);
  // Retire l'impératif + destinataire
  const demanderMatch = s.match(DEMANDER_PREFIXES);
  if (demanderMatch) {
    const rest = stripImperativePrefix(s);
    if (rest) {
      // "l'attestation décennale" → "L'attestation décennale"
      return rest.charAt(0).toUpperCase() + rest.slice(1);
    }
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
