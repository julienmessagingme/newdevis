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

type ConclusionLevier = NonNullable<ConclusionData["leviers"]>[number];

/**
 * 🟢 Phase 4 tranche 2 (2026-08-20) — alignement fiche + message copiable sur
 * les leviers (spec Maillon 3, exigence 3 : « message aligné sur les VRAIS
 * leviers, pas sur les fausses anomalies »).
 *
 * - `levierQuestion(levier)` : la question prononçable/copiable portée par un
 *   levier, déterministe par `type` (jamais de matching de libellés français).
 * - `LEVIER_TOPIC_PATTERNS` : par type de levier, le motif qui reconnaît les
 *   actions Gemini couvrant le MÊME sujet — elles sont dédupliquées de la
 *   fiche (le bloc « Vos leviers de négociation » affiché juste au-dessus
 *   raconte déjà l'histoire, mieux).
 */
export function levierQuestion(levier: ConclusionLevier): string | null {
  switch (levier.type) {
    case "quantites":
      return "Pouvez-vous me transmettre un devis détaillé avec les quantités précises (m², ml, unités) et le prix unitaire de chaque prestation ?";
    case "acompte":
      return "Pouvez-vous ramener l'acompte à 30 % maximum, avec un échéancier calé sur l'avancement du chantier ?";
    case "clause_rouge":
      return "Pouvez-vous retirer la clause signalée de votre devis avant signature ?";
    case "clause_orange":
      return "Pouvez-vous préciser ou retirer la clause contractuelle signalée dans le devis ?";
    case "especes":
      return "Pouvez-vous accepter un règlement par virement ou par chèque ?";
    case "surcout_postes": {
      const postes = levier.titre.match(/\(([^)]+)\)/)?.[1];
      return postes
        ? `Pouvez-vous revoir le prix des postes suivants : ${postes} ? Ils dépassent les fourchettes du marché que j'ai consultées.`
        : "Pouvez-vous revoir les postes dont les prix dépassent les fourchettes du marché ?";
    }
    case "revision_tarifaire": {
      const annee = levier.titre.match(/\b(20\d{2})\b/)?.[1];
      return annee
        ? `Votre devis date de ${annee} — pouvez-vous l'actualiser aux tarifs en vigueur ?`
        : "Pouvez-vous actualiser le devis aux tarifs en vigueur ?";
    }
    case "entreprise":
      return "Avant d'aller plus loin, pouvez-vous m'éclairer sur la situation administrative de l'entreprise ?";
    case "assurance":
      return "Pouvez-vous me transmettre vos attestations d'assurance décennale et RC Pro à jour ?";
    case "references":
      return "Pouvez-vous me partager les coordonnées de 2-3 chantiers récents similaires ?";
    case "retenue_garantie":
      // 2026-08-27 — vraie demande contractuelle à l'artisan.
      return "Pouvez-vous prévoir au contrat une retenue de garantie de 5 % sur le solde, libérée un an après la réception une fois les réserves levées ?";
    case "dommages_ouvrage":
      // Assurance que le CLIENT souscrit lui-même — rien à demander à l'artisan.
      return null;
    case "dommages_ouvrage_verification":
      // 2026-08-29 — ici, à l'inverse, l'artisan facture la DO : c'est donc
      // bien à LUI que l'attestation se réclame, avant tout versement.
      return "Vous facturez une assurance dommages-ouvrage : pouvez-vous me transmettre l'attestation à mon nom, avec le nom de l'assureur, le numéro de police et la date de prise d'effet ?";
    default:
      return null;
  }
}

const LEVIER_TOPIC_PATTERNS: Record<string, RegExp> = {
  quantites: /quantit|unit[ée]s\s+précis|devis\s+détaillé/i,
  acompte: /acompte/i,
  clause_rouge: /clause/i,
  clause_orange: /clause/i,
  especes: /esp[eè]ces|virement|traçable/i,
  // 2026-08-20 (retour Johan #2) — élargi : les actions Gemini « demandez une
  // justification détaillée pour les prix unitaires … plus élevés que les
  // standards du marché » parlent du même sujet sans le mot « poste ».
  surcout_postes: /n[ée]goci[ée\w]*\s+le(?:s)?\s+poste|poste[^.]{0,60}march[ée]|au-dessus\s+du\s+march[ée]|justifi\w*[^.]{0,80}prix|prix\s+unitaires?[^.]{0,80}(?:[ée]lev[ée]|march[ée])|plus\s+[ée]lev[ée]s?\s+que\s+les?\s+(?:standards?|prix|fourchettes?)/i,
  revision_tarifaire: /r[ée]vision\s+tarifaire|actualis|date\s+de\s+20\d{2}/i,
  entreprise: /statut\s+juridique|radi[ée]|situation\s+de\s+l[''`]entreprise/i,
  references: /r[ée]f[ée]rences?\s+de\s+chantiers/i,
};

/** true si l'action Gemini couvre le sujet d'un des leviers fournis. */
function actionCoveredByLevier(action: string, leviers: ConclusionLevier[]): boolean {
  return leviers.some((l) => {
    const rx = l.type ? LEVIER_TOPIC_PATTERNS[l.type] : undefined;
    return rx ? rx.test(action) : false;
  });
}

/**
 * 2026-08-21 (décision Johan) — LE message copiable, unique et 100 %
 * DÉTERMINISTE. Trois rounds de correctifs sur la reformulation des actions
 * Gemini (NECHAB, Renov'Toitures, « deux devis supplémentaires ») ont montré
 * que du texte LLM reformulé finit toujours par produire une maladresse — et
 * ce texte est le seul que l'utilisateur ENVOIE à un tiers. Règle absolue :
 * AUCUNE phrase dérivée du LLM ici. Uniquement les questions de leviers
 * (écrites à la main par type dans `levierQuestion`) + le gabarit URSSAF.
 * Retourne null s'il n'y a AUCUN levier de négociation (rien qui vaille un
 * envoi — l'accordéon est masqué).
 */
export function buildArtisanMessage(
  prenom: string | null,
  leviers: ConclusionLevier[],
  options?: { includeUrssaf?: boolean },
): string | null {
  const negocier = leviers.filter((l) => l.objectif !== "securiser");
  if (negocier.length === 0) return null;

  const questions = [...negocier, ...leviers.filter((l) => l.objectif === "securiser")]
    .map((l) => levierQuestion(l))
    .filter((q): q is string => Boolean(q))
    .slice(0, 5);
  if (questions.length === 0) return null;

  const salut = prenom ? `Bonjour ${prenom},` : "Bonjour,";
  const intro = questions.length === 1
    ? "Merci pour votre devis. Avant de le signer, j'aurais une question :"
    : "Merci pour votre devis. Avant de le signer, j'aurais quelques questions :";
  const body = questions.length === 1
    ? questions[0]
    : questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
  const urssaf = options?.includeUrssaf
    ? "\n\nPourriez-vous également me transmettre une attestation de vigilance URSSAF récente ?"
    : "";

  return `${salut}\n\n${intro}\n\n${body}${urssaf}\n\nBien cordialement,`;
}

export interface PreparationSections {
  /** Phrase courte d'ouverture (null si aucun point_ok pertinent). */
  rappelPourOuvrir: string | null;
  /** Points à discuter — un contexte + une question prononçable. */
  aDemander: Array<{ context: string; question: string }>;
  /** Standards du métier à ne pas oublier avant signature. */
  aNePasOublier: string[];
  /**
   * 2026-08-20 (retour Johan, cas Renov'Toitures) — conseils de PRUDENCE
   * adressés au CLIENT (ex : « comptes non publiés → limitez l'acompte à
   * 20-30 % »). Affichés sur la fiche uniquement — JAMAIS injectés dans le
   * message copiable à l'artisan (ce sont des conseils, pas des demandes).
   */
  conseilsPrudence: string[];
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

/**
 * 2026-08-18 (retour Johan, cas NECHAB) — trois défauts de rédaction dans le
 * message copiable :
 *   1. « …aux normes en vigueur. ? » — le point final de l'action source
 *      restait collé avant le « ? » ajouté.
 *   2. « …correspondent bien à vos attentes » envoyé à l'ARTISAN — le moteur
 *      s'adresse au client (« vos attentes » = celles du client), mais la
 *      question part à l'artisan : les possessifs des choses appartenant au
 *      client doivent basculer à la 1re personne, sinon on ne sait plus qui
 *      parle à qui.
 *   3. « Pouvez-vous me préciser les modalités […] sont clairement stipulés »
 *      — greffer une proposition complète (« Assurez-vous QUE X ») derrière
 *      « me préciser » casse la grammaire. Une proposition se confirme
 *      (« me confirmer que X »), un groupe nominal se précise.
 */

/** Retire la ponctuation finale d'une clause avant insertion dans une
 *  question — sinon on obtient « …en vigueur. ? ». */
function trimTrailingPunctuation(s: string): string {
  return s.replace(/[\s.;,…]+$/g, "").trim();
}

/**
 * Possessifs de choses appartenant au CLIENT → 1re personne quand la phrase
 * est adressée à l'artisan. Les possessifs légitimes côté artisan
 * (« votre devis », « vos tarifs », « votre entreprise ») ne sont PAS touchés.
 */
const CLIENT_OWNED_FLIPS: Array<[RegExp, string]> = [
  [/\bvos\s+attentes\b/gi, "mes attentes"],
  [/\bvotre\s+attente\b/gi, "mon attente"],
  [/\bvos\s+besoins\b/gi, "mes besoins"],
  [/\bvotre\s+besoin\b/gi, "mon besoin"],
  [/\bvotre\s+projet\b/gi, "mon projet"],
  [/\bvos\s+projets\b/gi, "mes projets"],
  [/\bvotre\s+budget\b/gi, "mon budget"],
  [/\bvotre\s+logement\b/gi, "mon logement"],
  [/\bvotre\s+maison\b/gi, "ma maison"],
  [/\bvotre\s+appartement\b/gi, "mon appartement"],
  [/\bvotre\s+chantier\b/gi, "mon chantier"],
  [/\bvos\s+travaux\b/gi, "mes travaux"],
  [/\bvotre\s+choix\b/gi, "mon choix"],
  [/\bvotre\s+demande\b/gi, "ma demande"],
];
function flipClientPossessives(s: string): string {
  let out = s;
  for (const [rx, rep] of CLIENT_OWNED_FLIPS) out = out.replace(rx, rep);
  return out;
}

/**
 * 2026-08-20 (cas Renov'Toitures) — le moteur parle de l'artisan à la 3e
 * personne (« sa bonne santé financière », « ses réalisations ») mais la
 * question lui est adressée directement : ces possessifs basculent à la 2e
 * personne (« votre bonne santé financière »). Liste blanche de noms
 * appartenant à l'artisan uniquement.
 */
const ARTISAN_THIRD_PERSON_FLIPS: Array<[RegExp, string]> = [
  [/\bsa\s+(bonne\s+)?sant[ée]\s+financi[èe]re\b/gi, "votre $1santé financière"],
  // NB : pas de \b final après un caractère accentué (é est hors classe
  // \w en JS → \b ne matche jamais) — lookahead négatif à la place.
  [/\bson\s+activit[ée](?![a-zà-ÿ])/gi, "votre activité"],
  [/\bson\s+entreprise\b/gi, "votre entreprise"],
  [/\bson\s+[ée]quipe\b/gi, "votre équipe"],
  [/\bses\s+r[ée]alisations\b/gi, "vos réalisations"],
  [/\bses\s+chantiers\b/gi, "vos chantiers"],
  [/\bses\s+qualifications\b/gi, "vos qualifications"],
  [/\bses\s+certifications\b/gi, "vos certifications"],
  [/\bses\s+assurances\b/gi, "vos assurances"],
  [/\bses\s+r[ée]f[ée]rences\b/gi, "vos références"],
  [/\bson\s+travail\b/gi, "votre travail"],
  [/\bses\s+tarifs\b/gi, "vos tarifs"],
];
function flipArtisanPossessives(s: string): string {
  let out = s;
  for (const [rx, rep] of ARTISAN_THIRD_PERSON_FLIPS) out = out.replace(rx, rep);
  return out;
}

/** Clause prête à être insérée dans une question adressée à l'artisan. */
function asQuestionClause(rest: string): string {
  return flipArtisanPossessives(flipClientPossessives(trimTrailingPunctuation(rest)));
}

function ucFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Minuscule initiale SAUF si le mot est un sigle (IBAN, RGE, Kbis…) —
 *  on ne minuscule que si la 2e lettre est déjà minuscule ou une apostrophe. */
function lcFirst(s: string): string {
  return /^[A-ZÀ-Ý][a-zà-ÿ'']/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
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
  // 3. Retire un article résiduel : « des »/« du »/« de »/« d' » (ordre longer-first
  //    pour éviter que « de » matche le début de « des » et laisse « s » orphelin).
  rest = rest.replace(/^(?:des|du|de\s|d[''])\s*/i, "").trim();
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
    const rest = trimTrailingPunctuation(
      cleaned
        .replace(/^négoc(?:iez|ier)\s*/i, "")
        .replace(/^negoc(?:iez|ier)\s*/i, ""),
    );
    return {
      context: rest ? ucFirst(rest) : "Poste à ouvrir à la discussion.",
      question: `« Est-ce que ce poste peut être ajusté ? »`,
    };
  }

  // Cas : « Vérifiez X », « Confirmez X », « Contrôlez X », « Validez X »
  if (CONFIRMER_PREFIXES.test(cleaned)) {
    const rest = trimTrailingPunctuation(
      cleaned.replace(CONFIRMER_PREFIXES, "").trim().replace(/^d[e']\s*/i, ""),
    );
    if (!rest) return { context: "Point à confirmer.", question: `« Pouvez-vous me confirmer ce point ? »` };
    const clause = lcFirst(asQuestionClause(rest));
    return {
      // Le contexte reste adressé au CLIENT sur la fiche → possessifs d'origine.
      context: ucFirst(rest),
      question: `« Pouvez-vous me confirmer ${clause} ? »`,
    };
  }

  // Cas : « Assurez-vous que … » / « Assurez-vous de … »
  if (PRECISER_PREFIXES.test(cleaned)) {
    // « que »/« qu' » ⇒ une PROPOSITION complète suit (« un acompte est
    // prévu ») → elle se CONFIRME. « de X » ⇒ groupe nominal → se précise.
    const hadQue = /^assur\w*[\s-]?vous\s+qu/i.test(cleaned);
    let rest = cleaned.replace(PRECISER_PREFIXES, "").trim();
    // Retire un « qu' » / « que » / « d' » / « de » résiduels si le regex
    // n'a pas capturé la contraction (« Assurez-vous qu'un … »).
    rest = rest.replace(/^(?:qu['e]\s*|d[e']\s*)/i, "").trim();
    rest = trimTrailingPunctuation(rest);
    if (!rest) return { context: "Point à préciser.", question: `« Pouvez-vous me préciser ce point ? »` };
    const clause = lcFirst(asQuestionClause(rest));
    if (hadQue) {
      // Élision : « que » devant consonne, « qu' » devant voyelle/h muet.
      const que = /^[aeiouyhàâäéèêëîïôöùûü]/i.test(clause) ? "qu'" : "que ";
      // 2026-08-27 (retour Johan, cas ZANNOU v2) — le contexte affiché sous
      // « Ce que vous pouvez lui demander » ne peut pas être la proposition
      // brute (« Le devis détaille clairement les matériaux… » lit comme une
      // AFFIRMATION, pas une demande). On préfixe : « Que le devis détaille
      // bien… » — grammaticalement enchaîné au titre de section.
      const queCtx = /^[aeiouyhàâäéèêëîïôöùûü]/i.test(rest) ? "Qu'" : "Que ";
      return {
        context: `${queCtx}${lcFirst(rest)}`,
        question: `« Pouvez-vous me confirmer ${que}${clause} ? »`,
      };
    }
    return {
      context: ucFirst(rest),
      question: `« Pouvez-vous me préciser ${clause} ? »`,
    };
  }

  // Cas : « Demandez à l'artisan de préciser X » / « Demandez l'attestation X »
  const demanderMatch = cleaned.match(DEMANDER_PREFIXES);
  if (demanderMatch) {
    // 2026-08-20 (cas Renov'Toitures) — variante AVEC article conservé pour la
    // question : « Demandez des preuves de… » donnait « me préciser preuves
    // de… » (article avalé par stripImperativePrefix). La question garde
    // l'article (« me transmettre DES preuves de… ») ; le contexte reste en
    // groupe nominal sans article (usage titre).
    let withArticle = cleaned
      .replace(DEMANDER_PREFIXES, "")
      .trim()
      .replace(/^(?:à\s+l[''`]?(?:artisan|artisane|entreprise|entrepreneur|professionnel)|au\s+(?:professionnel|prestataire|maître\s+d[''`]?œuvre))\s*/i, "")
      .trim();
    withArticle = trimTrailingPunctuation(withArticle);
    const hasPartitive = /^(des|du|de\s+la|de\s+l[''])\s/i.test(withArticle);

    const rest = trimTrailingPunctuation(stripImperativePrefix(cleaned));
    if (!rest) return { context: "Point à clarifier.", question: `« Pouvez-vous me préciser ce point ? »` };
    // Si le sujet ressemble à un document / une pièce à obtenir → « transmettre »
    const looksLikeDoc = /^(l[e']|la\s|les\s|un\s|une\s|des\s|vos\s|votre\s)/i.test(rest) &&
                        /\b(attestation|certificat|justificatif|copie|preuve|r[ée]f[ée]rence|planning|éch[ée]ancier|assurance|kbis|siret)\b/i.test(rest);
    let verb: string;
    let clause: string;
    if (looksLikeDoc) {
      verb = "me transmettre";
      clause = lcFirst(asQuestionClause(rest));
    } else if (hasPartitive) {
      verb = /^des\b/i.test(withArticle) ? "me transmettre" : "me donner";
      clause = lcFirst(asQuestionClause(withArticle));
    } else {
      verb = "me préciser";
      clause = lcFirst(asQuestionClause(rest));
    }
    return {
      context: ucFirst(rest),
      question: `« Pouvez-vous ${verb} ${clause} ? »`,
    };
  }

  // Cas générique : garde l'action nettoyée en contexte, question courte
  return {
    context: ucFirst(cleaned),
    question: `« Pouvez-vous m'en dire un peu plus sur ce point ? »`,
  };
}

/**
 * Simplifie un point_ok pour l'intégrer dans une phrase d'ouverture SOBRE.
 * Retourne { key, text } — la clé sert à dédupliquer sémantiquement (éviter
 * plusieurs phrases « l'entreprise ... l'entreprise ... »).
 *
 * Chaque `short` doit compléter grammaticalement « L'entreprise est … » pour
 * permettre une fusion élégante (« établie depuis longtemps et bien notée »).
 *
 * 2026-08-03 (cas ATEX) — le tableau points_ok mélange des points ✓ VERTS et
 * des points 🟠/ℹ️/📍 (avertissements, absences de donnée, contexte). L'ancien
 * matching par mots-clés transformait « 🟠 Entreprise établie depuis 2 ans »
 * en « établie depuis longtemps » et « ℹ️ Aucun avis Google trouvé » en
 * « bien notée par ses clients » — contradiction frontale avec le bloc
 * Entreprise affiché au-dessus. Garde-fous :
 *   1. Seuls les points sans marqueur d'alerte (🟠 ⚠ ℹ 📍 ❌ ❗ 🔴) sont éligibles.
 *   2. Négation → rejet (« aucun avis », « non trouvé », « incertain »…).
 *   3. « établie depuis longtemps » exige une ancienneté chiffrée ≥ 5 ans ;
 *      un simple statut actif/SIRET donne « immatriculée et en activité ».
 */
const NON_POSITIVE_MARKERS = /^\s*(?:🟠|⚠️?|ℹ️?|📍|❌|❗|🔴)/u;
const NEGATION_PATTERN = /\b(?:aucun[e]?|non\s+(?:trouv|disponible|exploit|v[ée]rifi)|pas\s+d[e'']|incertain|partielle|manquant|impossible)/i;

function extractSeniorityYears(lower: string): number | null {
  // « depuis 12 ans » / « 12 ans d'existence »
  const years = lower.match(/(\d{1,2})\s*ans/);
  if (years) return parseInt(years[1], 10);
  // « depuis 2014 » / « créée le 18/06/2024 » → années écoulées
  const year = lower.match(/\b(19\d{2}|20\d{2})\b/);
  if (year) {
    const n = new Date().getFullYear() - parseInt(year[1], 10);
    return n >= 0 && n <= 100 ? n : null;
  }
  return null;
}

function simplifyPointOk(point: string): { key: string; short: string } | null {
  if (NON_POSITIVE_MARKERS.test(point)) return null;
  if (NEGATION_PATTERN.test(point)) return null;
  const lower = point.toLowerCase();
  // 2026-08-20 (retour Johan, cas Renov'Toitures) — ne JAMAIS affirmer « à
  // jour de ses assurances » : on n'a pas l'attestation entre les mains (la
  // décennale est seulement MENTIONNÉE sur le devis) et la section 3 demande
  // justement de la réclamer — contradiction frontale. Seules les
  // certifications VÉRIFIÉES dans les registres (RGE/Qualibat via API)
  // peuvent être revendiquées.
  if (lower.includes("rge") || lower.includes("qualib")) {
    if (/v[ée]rifi/.test(lower)) {
      return { key: "cert", short: "titulaire de certifications professionnelles vérifiées (RGE/Qualibat)" };
    }
    return null; // certification seulement mentionnée → pas un fait à rappeler
  }
  if (lower.includes("assurance") || lower.includes("décennale") || lower.includes("decennale")) {
    return null; // assurance mentionnée ≠ attestation vérifiée
  }
  if (lower.includes("avis") || lower.includes("note") || lower.includes("google")) {
    return { key: "avis", short: "bien notée par ses clients" };
  }
  if (lower.includes("ancien") || lower.includes("depuis")) {
    const n = extractSeniorityYears(lower);
    if (n !== null && n >= 5) return { key: "anciennete", short: "établie depuis longtemps" };
    if (n !== null && n < 3) return null; // entreprise jeune : rien à « rappeler »
    return { key: "anciennete", short: "immatriculée et en activité" };
  }
  if (lower.includes("siret") || lower.includes("actif")) {
    return { key: "anciennete", short: "immatriculée et en activité" };
  }
  if (lower.includes("paiement") || lower.includes("acompte") || lower.includes("iban")) {
    return { key: "paiement", short: "claire sur ses conditions de paiement" };
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
  // 2026-08-20 (cas Renov'Toitures) — comptes non publiés : détection en
  // amont. Le sujet est traité par UN conseil de prudence actionnable
  // (limiter l'acompte + attestation de vigilance URSSAF) au lieu de
  // l'empilement « preuves de sa bonne santé financière » (question à
  // laquelle un particulier ne peut rien obtenir : les bilans sont
  // confidentiels) + item sec « Comptes non accessibles publiquement ».
  const COMPTES_OPAQUES_RE = /comptes\s+non\s+(accessibles|publi[ée]s|d[ée]pos[ée]s)/i;
  const comptesSource = [...actions, ...alertes].find((s) => COMPTES_OPAQUES_RE.test(s)) ?? null;
  const SANTE_FIN_RE = /(bonne\s+)?sant[ée]\s+financi[èe]re/i;

  // 2026-08-20 (retour Johan #2) — les actions « demandez d'autres devis /
  // comparez / faites jouer la concurrence » sont des CONSEILS AU CLIENT.
  // Transformées en question, elles devenaient absurdes (« Pouvez-vous me
  // préciser au moins deux devis supplémentaires auprès d'autres artisans ? »
  // — on demande à l'artisan les devis de ses concurrents !). Elles sont
  // routées vers les conseils de prudence (fiche, adressée au client) et ne
  // partent JAMAIS dans le message à l'artisan.
  const SELF_ADVICE_RE = /devis\s+suppl[ée]mentaires?|aupr[èe]s\s+d[''`]?autres\s+(?:artisans|professionnels|entreprises)|autres\s+devis|comparer\s+les\s+(?:prix|prestations|devis)|faire\s+jouer\s+la\s+concurrence|mettre\s+en\s+concurrence|second\s+avis/i;
  const selfAdviceConseils: string[] = [];

  // 🟢 Phase 4 tranche 2 (2026-08-20) — les actions couvrant le sujet d'un
  // LEVIER sont dédupliquées de la fiche : le bloc « Vos leviers de
  // négociation » (affiché juste au-dessus) porte déjà ces sujets, mieux
  // hiérarchisés. La fiche ne garde que le complément (autres questions,
  // pièces). Le message copiable, lui, est reconstruit à partir des leviers
  // (cf. buildWrittenMessages côté composant).
  const leviersForDedup = (conclusion.leviers ?? []).filter((l) => l && l.type);

  const inSection2 = new Set<string>();
  const aDemander = actions
    .filter((a) => {
      // Redondant avec le conseil de prudence comptes → retiré de la fiche.
      if (comptesSource && SANTE_FIN_RE.test(a)) return false;
      // Conseil au client (devis concurrents, comparaison) → fiche uniquement,
      // jamais transformé en question à l'artisan.
      if (SELF_ADVICE_RE.test(a)) {
        const cleaned = trimTrailingPunctuation(stripDevisFluff(stripAdminScoriae(a)));
        if (cleaned) selfAdviceConseils.push(`${ucFirst(cleaned)}.`);
        return false;
      }
      // Sujet déjà porté par un levier → dédupliqué.
      if (actionCoveredByLevier(a, leviersForDedup)) return false;
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
  const combined = Array.from(new Set([...standardActions, ...alertesStandards]))
    // Le sujet « comptes » est porté par le conseil de prudence + l'attestation
    // URSSAF ci-dessous — l'item brut ne doit plus apparaître tel quel.
    .filter((s) => !COMPTES_OPAQUES_RE.test(s));
  const aNePasOublier = combined
    .slice(0, 3)
    .map((raw) => reformulateStandardItem(raw))
    .filter((s) => s.length > 0 && !isPurelyInformative(s));

  // ── Conseils de prudence (fiche uniquement, jamais dans le message) ────
  const conseilsPrudence: string[] = [...selfAdviceConseils.slice(0, 2)];
  if (comptesSource) {
    const year = comptesSource.match(/\b(20\d{2})\b/)?.[1] ?? null;
    conseilsPrudence.push(
      `La société ne publie plus ses comptes${year ? ` depuis ${year}` : ""} — c'est légal et fréquent, mais sa santé financière récente est invérifiable pour un particulier. Par prudence, limitez l'acompte à 20-30 % maximum et échelonnez le solde sur l'avancement des travaux.`,
    );
    // La seule pièce que l'artisan PEUT fournir facilement sur ce sujet.
    if (aNePasOublier.length < 3) {
      aNePasOublier.push(
        "Une attestation de vigilance URSSAF récente (l'artisan l'obtient en ligne en quelques minutes — elle prouve qu'il est à jour de ses cotisations)",
      );
    }
  }

  return {
    rappelPourOuvrir,
    aDemander,
    aNePasOublier,
    conseilsPrudence,
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
