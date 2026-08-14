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
}

export interface Levier {
  niveau: "puissant" | "important" | "bonus";
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
      titre: "Exigez les quantités précises (m², ml) pour chaque poste",
      detail: "C'est le levier le plus puissant : il oblige l'artisan à justifier chaque prix et vous permet de comparer réellement. Sans quantités, impossible de savoir si le prix est juste.",
    });
  }

  if (s.paiement_especes_seul) {
    out.push({
      priority: 85,
      niveau: "puissant",
      titre: "Exigez un mode de paiement traçable (virement ou chèque)",
      detail: "Les espèces comme seul mode de paiement sont illégales au-delà de 1 000 € pour un professionnel, et vous privent de toute preuve en cas de litige.",
    });
  }

  if (s.acompte_cumule_pct !== null && s.acompte_cumule_pct > 50) {
    out.push({
      priority: 80,
      niveau: "puissant",
      titre: `Ramenez l'acompte avant travaux de ${Math.round(s.acompte_cumule_pct)} % à 30 % maximum`,
      detail: "L'usage est de 30 % à la signature, puis des paiements à l'avancement. Verser davantage avant le premier jour de chantier vous expose en cas de défaillance de l'entreprise.",
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
      titre: postes.length > 0
        ? `Négociez les postes au-dessus du marché (${postes.join(", ")})`
        : "Négociez les postes au-dessus du marché",
      detail: `Nos comparaisons chiffrent l'écart entre ${fmtEuros(s.surcout.min)} et ${fmtEuros(s.surcout.max)} €. Appuyez-vous sur les fourchettes du marché pour demander un alignement.`,
    });
  }

  if (s.acompte_cumule_pct !== null && s.acompte_cumule_pct > 30 && s.acompte_cumule_pct <= 50) {
    out.push({
      priority: 60,
      niveau: "important",
      titre: `Négociez l'acompte (${Math.round(s.acompte_cumule_pct)} % demandés) vers 30 %`,
      detail: "30 % à la signature est l'usage. Un échéancier adossé à l'avancement réel du chantier protège les deux parties.",
    });
  }

  const clausesOranges = s.clauses_litigieuses.filter((c) => c.gravite === "orange");
  if (clausesOranges.length > 0 && clausesRouges.length === 0) {
    const c = clausesOranges[0];
    const label = CLAUSE_LABELS[c.type] ?? "cette clause mérite discussion";
    out.push({
      priority: 55,
      niveau: "important",
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
      titre: `Demandez une révision tarifaire : le devis date de ${annee}`,
      detail: `Les coûts matériaux et main-d'œuvre évoluent de 5 à 8 % par an. Un devis de ${annee} relu aujourd'hui justifie une demande d'actualisation — dans un sens comme dans l'autre, mieux vaut la provoquer que la subir en cours de chantier.`,
    });
  }

  if (s.assurance_absente) {
    out.push({
      priority: 30,
      niveau: "bonus",
      titre: "Demandez l'attestation d'assurance décennale et RC Pro",
      detail: "L'attestation à jour se demande par simple mail — c'est une formalité pour un artisan assuré, et une protection indispensable pour vous.",
    });
  }

  // Fallback universel : jamais de fiche vide, même sur un devis irréprochable.
  out.push({
    priority: 10,
    niveau: "bonus",
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
    .map(({ niveau, titre, detail }) => ({ niveau, titre, detail }));
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
    motif = `l'acompte demandé (${Math.round(s.acompte_cumule_pct)} %) est au-dessus de l'usage de 30 %`;
  } else {
    motif = "prix dans les fourchettes du marché et conditions habituelles";
  }

  // Marge de négociation
  let marge: string | null = null;
  if (s.surcout.max >= 300) {
    marge = `environ ${fmtEuros(s.surcout.min)} à ${fmtEuros(s.surcout.max)} €`;
  } else if (s.verdict_decisionnel === "signer") {
    marge = "3 à 5 % en négociation courtoise";
  } else if (leviers.some((l) => l.titre.startsWith("Demandez une révision tarifaire"))) {
    marge = "3 à 5 % (révision tarifaire)";
  }

  const montant = s.total_ht !== null && s.total_ht > 0 ? `${fmtEuros(s.total_ht)} € HT` : null;
  const contexte = (s.work_type ?? "").trim();
  const tete = [montant, contexte ? `pour ${contexte.toLowerCase()}` : null].filter(Boolean).join(" ");
  const resume = tete ? `${tete} — ${motif}.` : `${motif.charAt(0).toUpperCase()}${motif.slice(1)}.`;

  return { decision: s.verdict_decisionnel, resume, motif, marge };
}
