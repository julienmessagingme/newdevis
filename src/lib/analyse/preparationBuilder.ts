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
 * Transforme une action impérative ("Demandez X") en formulation
 * "contexte / question prononçable" plus bienveillante.
 */
function reformulateAsQuestion(action: string): { context: string; question: string } {
  const trimmed = action.trim().replace(/\s+/g, " ");

  // Cas : "Demandez à l'artisan de préciser X"
  const demanderMatch = trimmed.match(DEMANDER_PREFIXES);
  if (demanderMatch) {
    const rest = trimmed.slice(demanderMatch[0].length).trim().replace(/^de\s+/, "");
    // Extraire le sujet
    const context = `Un point à faire préciser : ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
    const question = `« Pouvez-vous me préciser ce point ? »`;
    return { context, question };
  }

  // Cas : "Négociez X"
  if (/^négoc|^negoc/i.test(trimmed)) {
    const rest = trimmed.replace(/^négoc(?:iez|ier)\s*/i, "").replace(/^negoc(?:iez|ier)\s*/i, "");
    return {
      context: rest ? `Un point à ouvrir à la discussion : ${rest.charAt(0).toLowerCase()}${rest.slice(1)}` : "Un point à ouvrir à la discussion.",
      question: `« Est-ce que ce poste peut être ajusté ? »`,
    };
  }

  // Cas générique : garde l'action telle quelle en contexte
  return {
    context: trimmed,
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
  const aNePasOublier = combined.slice(0, 3);

  return {
    rappelPourOuvrir,
    aDemander,
    aNePasOublier,
  };
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
