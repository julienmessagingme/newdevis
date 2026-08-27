/**
 * src/lib/analyse/leviersBuilder.ts
 *
 * 🟢 Phase 4 (2026-08-15) — Verdict honnête, Maillon 3.
 * Spec produit : docs/refonte/BUGS-A-CORRIGER.md § "Spec produit validée".
 *
 * Répond aux 2 vraies questions de l'utilisateur :
 *   1. « Est-ce une bonne affaire ou je me fais avoir ? » → verdict_ligne
 *      (1 ligne : décision + montant + MOTIF NOMMÉ + marge)
 *   2. « Quoi dire à l'artisan, comment négocier ? » → 3 leviers max,
 *      hiérarchisés par puissance (🔴 puissant / 🟠 important / 🟡 bonus)
 *
 * 100 % DÉTERMINISTE — assemblé depuis les signaux déjà calculés par le
 * moteur (jamais de texte LLM libre ici). Leçons des revues d'août 2026 :
 *   - Grosbois : un verdict rouge sans motif nommé détruit la confiance
 *   - ZenCouverture : 60 %+ des « anomalies marché » étant des artefacts de
 *     matching, les leviers priorisent les signaux STRUCTURELS (quantités,
 *     acompte, clauses) avant les écarts prix
 *   - Mélier Cognac : l'âge du devis est un levier factuel (coûts matériaux
 *     +5-8 % par an) — cas DEVIS-DATE-NON-EXTRAIT-COMME-LEVIER
 */

export interface LevierSignals {
  verdict_decisionnel: "signer" | "signer_avec_negociation" | "ne_pas_signer";
  total_ht: number | null;
  work_type?: string | null;
  /** Surcoût serveur (postes comparables uniquement) */
  surcout: { min: number; max: number };
  /** Libellés des postes en vraie anomalie (déjà filtrés confidence) */
  anomalies_postes: string[];
  /** Quantités/unités manquantes sur une part significative du devis */
  quantites_manquantes: boolean;
  clauses_litigieuses: Array<{ type: string; gravite: string; citation?: string }>;
  /** % cumulé demandé avant prestation, si connu */
  acompte_cumule_pct: number | null;
  paiement_especes_seul: boolean;
  /** Libellé du risque entreprise (radiée, liquidation…), null sinon */
  entreprise_risque: string | null;
  assurance_absente: boolean;
  /** Date du devis (YYYY-MM-DD) si extraite */
  date_devis: string | null;
  /** Date de référence pour l'âge du devis (défaut: maintenant) — testabilité */
  date_reference?: string;
  /**
   * 2026-08-20 (validé Johan, cas Renov'Toitures) — la société ne publie pas
   * ses comptes : santé financière récente invérifiable pour un particulier.
   * Seul, ce signal n'est PAS un levier (droit à la confidentialité, fréquent).
   * COMBINÉ à un acompte > 30 %, c'est une combinaison à risque : l'exposition
   * financière doit être limitée → le levier acompte est escaladé.
   */
  comptes_opaques?: boolean;
  /** Année du dernier exercice publié, si connue (affichage). */
  comptes_depuis?: string | null;
  /**
   * 2026-08-27 (cas ZANNOU v2, retour Johan) — part du montant des postes
   * réellement comparable au référentiel (confidence high). Quand elle est
   * faible (devis désamiantage, prestations réglementaires…), le verdict
   * « prix dans le marché » doit être QUALIFIÉ (« sur les postes
   * comparables ») et un levier « second avis » proposé — sinon on affirme
   * une conformité qu'on n'a pas mesurée.
   */
  comparable_coverage_pct?: number | null;
  /** Montant HT des postes sans référence marché fiable. */
  montant_non_compare?: number | null;
  /**
   * 2026-08-27 (conseils Johan) — le devis porte des travaux de GROS ŒUVRE
   * (construction, extension, surélévation, ossature, fondations, mur
   * porteur, charpente/couverture). Déclenche le conseil assurance
   * dommages-ouvrage, OBLIGATOIRE avant ouverture du chantier
   * (art. L242-1 du code des assurances).
   */
  travaux_gros_oeuvre?: boolean;
  /** Une retenue de garantie est déjà prévue au devis (mention explicite). */
  retenue_garantie_prevue?: boolean;
}

/**
 * 2026-08-20 (tranche 2) — identifiant machine-lisible du levier. Permet à
 * preparationBuilder d'aligner la fiche rendez-vous et le message copiable
 * sur les leviers (dédup par sujet + question dédiée par type) sans matcher
 * des libellés français fragiles.
 */
export type LevierType =
  | "entreprise"
  | "clause_rouge"
  | "clause_orange"
  | "quantites"
  | "especes"
  | "acompte"
  | "surcout_postes"
  | "revision_tarifaire"
  | "assurance"
  | "references"
  | "second_avis"
  | "retenue_garantie"
  | "dommages_ouvrage";

export interface Levier {
  niveau: "puissant" | "important" | "bonus";
  /** 2026-08-18 (retour Johan, cas NECHAB) — un levier de NÉGOCIATION fait
   * baisser le prix ; une action de SÉCURISATION protège sans faire baisser
   * le prix (assurance, références). Les confondre rend la promesse
   * « marge 3-5% » creuse. L'UI les présente différemment. */
  objectif: "negocier" | "securiser";
  type: LevierType;
  titre: string;
  detail: string;
}

export interface VerdictLigne {
  decision: "signer" | "signer_avec_negociation" | "ne_pas_signer";
  /** 1 ligne : montant + contexte + motif. Ex "31 276 € HT — prix dans le marché." */
  resume: string;
  /** Le motif NOMMÉ du verdict — jamais un verdict sans raison */
  motif: string;
  /** Marge de négociation estimée ("environ 300–600 €", "3 à 5 %") ou null */
  marge: string | null;
}

const CLAUSE_LABELS: Record<string, string> = {
  devis_facture_si_non_signe: "le devis ne peut pas devenir une facture sans votre accord (Code conso L113-3)",
  pas_de_retractation: "le délai légal de rétractation de 14 jours ne peut pas être supprimé (loi Hamon)",
  penalite_annulation_excessive: "la pénalité d'annulation dépasse les usages (15 % maximum)",
  soustraitance_libre: "la sous-traitance sans votre accord mérite d'être encadrée",
  modification_unilaterale: "les modifications unilatérales du contrat méritent d'être encadrées",
};

interface Candidate extends Levier {
  priority: number;
}

function fmtEuros(n: number): string {
  return Math.round(n).toLocaleString("fr-FR");
}

export function devisAgeMonths(dateDevis: string | null, reference?: string): number | null {
  if (!dateDevis) return null;
  const d = new Date(dateDevis);
  if (isNaN(d.getTime())) return null;
  const ref = reference ? new Date(reference) : new Date();
  const months = (ref.getFullYear() - d.getFullYear()) * 12 + (ref.getMonth() - d.getMonth());
  return months >= 0 ? months : null;
}

function collectCandidates(s: LevierSignals): Candidate[] {
  const out: Candidate[] = [];

  // ── Puissants (bloquants ou bascule du rapport de force) ──────────────────
  if (s.entreprise_risque) {
    out.push({
      priority: 110,
      niveau: "puissant",
      objectif: "negocier",
      type: "entreprise",
      titre: "Clarifiez la situation de l'entreprise avant tout engagement",
      detail: `Nos vérifications signalent : ${s.entreprise_risque}. Tant que ce point n'est pas éclairci, aucun versement ne doit être effectué.`,
    });
  }

  const clausesRouges = s.clauses_litigieuses.filter((c) => c.gravite === "rouge");
  if (clausesRouges.length > 0) {
    const c = clausesRouges[0];
    const label = CLAUSE_LABELS[c.type] ?? "cette clause est contraire aux usages";
    out.push({
      priority: 100,
      niveau: "puissant",
      objectif: "negocier",
      type: "clause_rouge",
      titre: clausesRouges.length > 1
        ? `Faites retirer les ${clausesRouges.length} clauses abusives avant de signer`
        : "Faites retirer la clause abusive avant de signer",
      detail: `Le devis contient : « ${(c.citation ?? "").slice(0, 120)}${(c.citation ?? "").length > 120 ? "…" : ""} » — ${label}. Un artisan sérieux la retirera sans difficulté.`,
    });
  }

  if (s.quantites_manquantes) {
    out.push({
      priority: 90,
      niveau: "puissant",
      objectif: "negocier",
      type: "quantites",
      titre: "Exigez les quantités précises (m², ml) pour chaque poste",
      detail: "C'est le levier le plus puissant : il oblige l'artisan à justifier chaque prix et vous permet de comparer réellement. Sans quantités, impossible de savoir si le prix est juste.",
    });
  }

  if (s.paiement_especes_seul) {
    out.push({
      priority: 85,
      niveau: "puissant",
      objectif: "negocier",
      type: "especes",
      titre: "Exigez un mode de paiement traçable (virement ou chèque)",
      detail: "Les espèces comme seul mode de paiement sont illégales au-delà de 1 000 € pour un professionnel, et vous privent de toute preuve en cas de litige.",
    });
  }

  // Contexte « comptes opaques » — enrichit les leviers acompte (2026-08-20).
  const comptesCtx = s.comptes_opaques
    ? ` D'autant que la société ne publie pas ses comptes${s.comptes_depuis ? ` depuis ${s.comptes_depuis}` : ""} : sa santé financière récente est invérifiable — limitez votre exposition.`
    : "";

  if (s.acompte_cumule_pct !== null && s.acompte_cumule_pct > 50) {
    out.push({
      priority: 80,
      niveau: "puissant",
      objectif: "negocier",
      type: "acompte",
      titre: `Ramenez l'acompte avant travaux de ${Math.round(s.acompte_cumule_pct)} % à 30 % maximum`,
      detail: `L'usage est de 30 % à la signature, puis des paiements à l'avancement. Verser davantage avant le premier jour de chantier vous expose en cas de défaillance de l'entreprise.${comptesCtx}`,
    });
  }

  // ── Importants ────────────────────────────────────────────────────────────
  const surcoutMateriel = s.surcout.max >= 300 &&
    (s.total_ht === null || s.total_ht <= 0 || s.surcout.max >= s.total_ht * 0.015);
  if (surcoutMateriel) {
    const postes = s.anomalies_postes.slice(0, 3);
    out.push({
      priority: 70,
      niveau: "important",
      objectif: "negocier",
      type: "surcout_postes",
      titre: postes.length > 0
        ? `Négociez les postes au-dessus du marché (${postes.join(", ")})`
        : "Négociez les postes au-dessus du marché",
      detail: `Nos comparaisons chiffrent l'écart entre ${fmtEuros(s.surcout.min)} et ${fmtEuros(s.surcout.max)} €. Appuyez-vous sur les fourchettes du marché pour demander un alignement.`,
    });
  }

  if (s.acompte_cumule_pct !== null && s.acompte_cumule_pct > 30 && s.acompte_cumule_pct <= 50) {
    // 2026-08-20 (validé Johan) — acompte 31-50 % + comptes non publiés =
    // combinaison à risque : le levier passe « important » → « puissant »
    // (au-dessus du surcoût matériel) et nomme la combinaison.
    if (s.comptes_opaques) {
      out.push({
        priority: 82,
        niveau: "puissant",
        objectif: "negocier",
        type: "acompte",
        titre: `Ramenez l'acompte (${Math.round(s.acompte_cumule_pct)} % demandés) à 30 % maximum — comptes non publiés`,
        detail: `Combinaison à risque : un acompte au-dessus de l'usage demandé par une société qui ne publie pas ses comptes${s.comptes_depuis ? ` depuis ${s.comptes_depuis}` : ""} — sa santé financière récente est invérifiable. Limitez votre exposition : 30 % maximum à la signature, solde échelonné sur l'avancement réel du chantier.`,
      });
    } else {
      out.push({
        priority: 60,
        niveau: "important",
        objectif: "negocier",
        type: "acompte",
        titre: `Négociez l'acompte (${Math.round(s.acompte_cumule_pct)} % demandés) vers 30 %`,
        detail: "30 % à la signature est l'usage. Un échéancier adossé à l'avancement réel du chantier protège les deux parties.",
      });
    }
  }

  const clausesOranges = s.clauses_litigieuses.filter((c) => c.gravite === "orange");
  if (clausesOranges.length > 0 && clausesRouges.length === 0) {
    const c = clausesOranges[0];
    const label = CLAUSE_LABELS[c.type] ?? "cette clause mérite discussion";
    out.push({
      priority: 55,
      niveau: "important",
      objectif: "negocier",
      type: "clause_orange",
      titre: "Discutez la clause contractuelle signalée",
      detail: `Le devis mentionne : « ${(c.citation ?? "").slice(0, 120)}${(c.citation ?? "").length > 120 ? "…" : ""} » — ${label}.`,
    });
  }

  // ── Bonus ─────────────────────────────────────────────────────────────────
  const age = devisAgeMonths(s.date_devis, s.date_reference);
  if (age !== null && age > 12) {
    const annee = s.date_devis!.slice(0, 4);
    out.push({
      priority: 40,
      niveau: "bonus",
      objectif: "negocier",
      type: "revision_tarifaire",
      titre: `Demandez une révision tarifaire : le devis date de ${annee}`,
      detail: `Les coûts matériaux et main-d'œuvre évoluent de 5 à 8 % par an. Un devis de ${annee} relu aujourd'hui justifie une demande d'actualisation — dans un sens comme dans l'autre, mieux vaut la provoquer que la subir en cours de chantier.`,
    });
  }

  if (s.assurance_absente) {
    out.push({
      priority: 30,
      niveau: "bonus",
      objectif: "securiser",
      type: "assurance",
      titre: "Demandez l'attestation d'assurance décennale et RC Pro",
      detail: "L'attestation à jour se demande par simple mail — c'est une formalité pour un artisan assuré, et une protection indispensable pour vous.",
    });
  }

  // ── Conseils à valeur ajoutée (2026-08-27, demande Johan) ─────────────────
  // Deux protections que le particulier ignore presque toujours, et qu'aucun
  // artisan ne propose spontanément. Objectif « securiser » : ce ne sont pas
  // des baisses de prix, ce sont des filets — le bloc s'intitule alors
  // « Avant de signer » et aucune marge n'est promise.

  // 1. Assurance dommages-ouvrage — OBLIGATION LÉGALE (art. L242-1 code des
  //    assurances) avant l'ouverture du chantier dès qu'il y a construction,
  //    extension ou rénovation du gros œuvre. Priorité haute : elle se souscrit
  //    AVANT le démarrage, une fois le chantier commencé il est trop tard.
  if (s.travaux_gros_oeuvre) {
    out.push({
      priority: 50,
      niveau: "important",
      objectif: "securiser",
      type: "dommages_ouvrage",
      titre: "Souscrivez une assurance dommages-ouvrage AVANT le début du chantier",
      detail:
        "Ces travaux touchent le gros œuvre : la loi vous impose, en tant que maître d'ouvrage, de souscrire une assurance dommages-ouvrage avant l'ouverture du chantier. Elle préfinance les réparations relevant de la garantie décennale sans attendre qu'un tribunal désigne un responsable — et se retourne ensuite contre l'entreprise et son assureur. Comptez 2 à 5 % du montant des travaux. Sans elle, vous avancez les frais en cas de sinistre grave, et vous devrez signaler son absence à l'acheteur si vous revendez dans les 10 ans.",
    });
  }

  // 2. Retenue de garantie 5 % (loi n° 71-584 du 16 juillet 1971) — usage sur
  //    les chantiers conséquents. Ne se propose que si le devis ne la prévoit
  //    pas déjà et que le montant le justifie.
  const RETENUE_MIN_HT = 10_000;
  if (
    !s.retenue_garantie_prevue &&
    s.total_ht !== null &&
    s.total_ht >= RETENUE_MIN_HT
  ) {
    out.push({
      priority: 35,
      niveau: "bonus",
      objectif: "securiser",
      type: "retenue_garantie",
      titre: `Demandez une retenue de garantie de 5 % (environ ${fmtEuros(s.total_ht * 0.05)} €) libérée après la levée des réserves`,
      detail:
        "C'est l'usage sur les chantiers de cette taille, et c'est encadré par la loi : vous conservez 5 % du montant au moment du solde, restitués un an après la réception si aucune réserve ne reste à lever (ou immédiatement si l'artisan fournit une caution bancaire). C'est le seul vrai levier pour que les finitions et les reprises soient faites — une fois payé à 100 %, vous n'avez plus de moyen de pression.",
    });
  }

  // 2026-08-27 (cas ZANNOU v2) — couverture marché partielle : quand une part
  // significative du devis n'a AUCUNE référence (désamiantage, réglementaire,
  // sur mesure…), le seul vrai point de comparaison est un second devis sur
  // ce périmètre. Levier de SÉCURISATION côté client — jamais envoyé à
  // l'artisan (levierQuestion retourne null pour ce type).
  const coverage = s.comparable_coverage_pct;
  const nonCompare = s.montant_non_compare ?? 0;
  if (coverage !== null && coverage !== undefined && coverage < 60 && nonCompare >= 1000) {
    out.push({
      priority: 20,
      niveau: "bonus",
      objectif: "securiser",
      type: "second_avis",
      titre: `Faites chiffrer par un second devis les postes sans référence marché (~${fmtEuros(nonCompare)} €)`,
      detail: `Notre référentiel ne couvre que ~${coverage} % du montant de ce devis — le reste (prestations spécialisées : désamiantage, démarches réglementaires, sur-mesure…) n'a pas de prix de marché fiable. Un second devis sur ce périmètre est le seul vrai point de comparaison.`,
    });
  }

  // Fallback universel : jamais de fiche vide, même sur un devis irréprochable.
  out.push({
    priority: 10,
    niveau: "bonus",
    objectif: "securiser",
    type: "references",
    titre: "Demandez 2-3 références de chantiers récents similaires",
    detail: "Un artisan fier de son travail les partage volontiers. C'est aussi l'occasion d'ouvrir la discussion sur un ton constructif.",
  });

  return out;
}

/** Max 3 leviers, hiérarchisés par puissance décroissante. */
export function buildLeviers(s: LevierSignals): Levier[] {
  const seen = new Set<string>();
  return collectCandidates(s)
    .sort((a, b) => b.priority - a.priority)
    .filter((c) => {
      if (seen.has(c.titre)) return false;
      seen.add(c.titre);
      return true;
    })
    .slice(0, 3)
    .map(({ niveau, objectif, type, titre, detail }) => ({ niveau, objectif, type, titre, detail }));
}

/**
 * Verdict tranché 1 ligne — nomme TOUJOURS son motif.
 * Le motif = le signal le plus fort ; jamais « risque élevé » sans dire lequel.
 */
export function buildVerdictLigne(s: LevierSignals, leviers: Levier[]): VerdictLigne {
  // Motif : dérivé du signal dominant (même hiérarchie que les leviers)
  let motif: string;
  if (s.entreprise_risque) {
    motif = `la situation de l'entreprise doit être clarifiée (${s.entreprise_risque})`;
  } else if (s.clauses_litigieuses.some((c) => c.gravite === "rouge")) {
    motif = "le devis contient une clause contraire à vos droits";
  } else if (s.paiement_especes_seul) {
    motif = "le paiement en espèces est le seul mode proposé";
  } else if (s.acompte_cumule_pct !== null && s.acompte_cumule_pct > 50) {
    motif = `l'acompte demandé avant travaux (${Math.round(s.acompte_cumule_pct)} %) dépasse largement l'usage de 30 %`;
  } else if (s.quantites_manquantes) {
    motif = "les quantités manquent pour vérifier les prix";
  } else if (s.surcout.max >= 300 && (s.total_ht === null || s.surcout.max >= (s.total_ht ?? 0) * 0.015)) {
    motif = `quelques postes dépassent les fourchettes du marché (${fmtEuros(s.surcout.min)}–${fmtEuros(s.surcout.max)} € d'écart estimé)`;
  } else if (s.acompte_cumule_pct !== null && s.acompte_cumule_pct > 30) {
    motif = s.comptes_opaques
      ? `l'acompte demandé (${Math.round(s.acompte_cumule_pct)} %) est au-dessus de l'usage alors que la société ne publie pas ses comptes — limitez votre exposition`
      : `l'acompte demandé (${Math.round(s.acompte_cumule_pct)} %) est au-dessus de l'usage de 30 %`;
  } else if (s.verdict_decisionnel === "signer") {
    // 2026-08-27 (cas ZANNOU v2) — couverture partielle : ne pas affirmer une
    // conformité globale quand une grosse part du devis n'a pas de référence.
    const cov = s.comparable_coverage_pct;
    motif = cov !== null && cov !== undefined && cov < 60 && (s.montant_non_compare ?? 0) >= 1000
      ? `prix dans le marché sur les postes comparables (~${cov} % du devis) — ${fmtEuros(s.montant_non_compare ?? 0)} € de prestations spécialisées sans référence marché, à confirmer par un second devis`
      : "prix dans les fourchettes du marché et conditions habituelles";
  } else {
    // Décision non-signer sans signal dominant identifié : rester honnête sans
    // affirmer ni un risque non nommé ni une conformité contredite par le badge.
    motif = "quelques prestations méritent une clarification avec l'artisan avant signature";
  }

  // Marge de négociation — 2026-08-18 (retour Johan) : annoncée UNIQUEMENT si
  // un levier de négociation la porte. Une marge « 3-5% » sans levier est une
  // promesse creuse qui décrédibilise le verdict.
  let marge: string | null = null;
  const hasNegoLevier = leviers.some((l) => l.objectif === "negocier");
  if (s.surcout.max >= 300) {
    marge = `environ ${fmtEuros(s.surcout.min)} à ${fmtEuros(s.surcout.max)} €`;
  } else if (leviers.some((l) => l.titre.startsWith("Demandez une révision tarifaire"))) {
    marge = "3 à 5 % (révision tarifaire)";
  } else if (hasNegoLevier) {
    marge = "3 à 5 % en négociation courtoise";
  }

  const montant = s.total_ht !== null && s.total_ht > 0 ? `${fmtEuros(s.total_ht)} € HT` : null;
  const contexte = (s.work_type ?? "").trim();
  const tete = [montant, contexte ? `pour ${contexte.toLowerCase()}` : null].filter(Boolean).join(" ");
  const resume = tete ? `${tete} — ${motif}.` : `${motif.charAt(0).toUpperCase()}${motif.slice(1)}.`;

  return { decision: s.verdict_decisionnel, resume, motif, marge };
}
