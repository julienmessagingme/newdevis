/**
 * src/lib/analyse/extract/reconciliation.ts
 *
 * 🟢 Phase 3.1 (2026-06-24) — Module de réconciliation arithmétique
 *
 * Module TS PUR (zero dépendance externe) qui réconcilie les valeurs
 * extraites du devis sur elles-mêmes :
 *   - ligne : montant = qty × prix_unitaire
 *   - section : sous_total = Σ lignes_filles
 *   - devis : total = Σ sous_totaux − remise
 *
 * Quand une valeur est manquante mais que 2 autres sont connues, on la
 * calcule (gratuit). Quand les 3 sont connues et qu'il y a désaccord,
 * on diagnostique et on propose la correction la plus fiable.
 *
 * Chaque champ remonte un `FieldConfidence` qui dit d'où vient la valeur
 * (lu / calculé / déduit / absent) et l'écart si recalculé.
 *
 * Cette confiance par champ alimente la confiance globale du devis
 * (certifié / indicatif / non comparable) qui pondère le verdict Phase 4.
 *
 * Tests : src/lib/analyse/extract/reconciliation.test.ts (Vitest).
 */

// ──────────────────────────────────────────────────────────────────────────────
// Tolérances (calibrées sur la pratique BTP, à ajuster en phase live)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Tolérance acceptable au niveau ligne : le plus grand des deux entre
 * 0.50 € (arrondis bruts) et 1 % du montant. Couvre les arrondis comptables
 * standards sans laisser passer les erreurs de calcul.
 */
const TOLERANCE_LIGNE_ABS = 0.5;
const TOLERANCE_LIGNE_PCT = 0.01;

/** Tolérance section : un peu plus stricte (les sous-totaux sont calculés explicitement). */
const TOLERANCE_SECTION_ABS = 1;
const TOLERANCE_SECTION_PCT = 0.005;

/** Tolérance devis : idem section. */
const TOLERANCE_DEVIS_ABS = 1;
const TOLERANCE_DEVIS_PCT = 0.005;

/**
 * Seuils de confiance globale.
 * - certifié : ≥ 95 % de lignes avec prix_unitaire LU + arithmétique OK partout
 * - indicatif : zone tampon (prix calculé sur 5-30 % des lignes OU écart 1-5 %)
 * - non_comparable : prix absent > 30 % OU écart > 5 %
 */
const CONFIANCE_CERTIFIE_MIN_LU_PCT = 0.95;
const CONFIANCE_NON_COMPARABLE_ABSENT_PCT = 0.30;
const CONFIANCE_NON_COMPARABLE_ECART_PCT = 0.05;
const CONFIANCE_INDICATIF_ECART_PCT = 0.01;

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type FieldSource = "lu" | "calcule" | "deduit" | "absent";

export interface FieldConfidence {
  /** Provenance du champ. "lu"=extrait, "calcule"=arithmétique, "deduit"=heuristique, "absent"=null */
  source: FieldSource;
  /** Valeur extraite du devis (peut être null si absent). */
  value_extracted?: number | null;
  /** Valeur recalculée (uniquement si calcule ou si extracted+recalculated divergent). */
  value_recalculated?: number;
  /** Écart relatif extracted/recalculated (0..1). Pertinent si les 2 sont présents. */
  delta_pct?: number;
}

export type TagNature = "ancre_surfacique" | "annexe_correlee" | "ligne_transverse";

export interface LigneInput {
  /** Identifiant hiérarchique du devis : "1.1", "2.3", "3.1.4" */
  id_hierarchique: string;
  /** Libellé exact tel que sur le devis */
  libelle: string;
  /** Quantité lue depuis la colonne quantité (null si absent ou cellule vide) */
  quantite: number | null;
  /** Unité lue depuis la colonne unité (null si absent ou cellule vide) */
  unite: string | null;
  /** Prix unitaire lu depuis la colonne prix_u (null si absent ou cellule vide) */
  prix_unitaire: number | null;
  /** Montant total lu depuis la colonne montant_HT (null si absent ou cellule vide) */
  montant_total: number | null;
  /** Tags nature attribués par l'extracteur (peut être vide) */
  tags_nature?: TagNature[];
  /** Texte brut de la ligne (pour debug / réparation ciblée) */
  texte_brut?: string;
}

export interface LigneReconciliee extends LigneInput {
  /** Valeurs résolues après réconciliation (les nulls peuvent avoir été calculés) */
  quantite_resolved: number | null;
  prix_unitaire_resolved: number | null;
  montant_total_resolved: number | null;

  /** Confidence par champ critique */
  quantite_confidence: FieldConfidence;
  prix_unitaire_confidence: FieldConfidence;
  montant_total_confidence: FieldConfidence;

  /** True si les 3 champs sont arithmétiquement cohérents (post-réconciliation). */
  arithmetique_valide: boolean;

  /** Message de diagnostic si quelque chose ne va pas. */
  diagnostic?: string;
}

export interface SectionInput {
  id_hierarchique: string;
  libelle: string;
  /** Sous-total lu sur le devis (null si pas affiché) */
  sous_total_lu: number | null;
  /** Lignes filles de cette section */
  lignes: LigneInput[];
}

export interface SectionReconciliee {
  id_hierarchique: string;
  libelle: string;
  sous_total_lu: number | null;
  sous_total_recalcule: number;
  /** Écart relatif entre lu et recalculé (0..1) */
  ecart_pct: number;
  /** True si lu ≈ recalculé (ou si lu est absent → recalculé fait foi). */
  coherent: boolean;
  /** Lignes après réconciliation */
  lignes: LigneReconciliee[];
}

export interface DevisInput {
  sections: SectionInput[];
  /** Total HT global lu (tableau récap fin de devis) */
  total_ht_lu: number | null;
  /** Total TVA lu */
  total_tva_lu: number | null;
  /** Total TTC lu */
  total_ttc_lu: number | null;
  /** Remise globale (positive = à soustraire) */
  remise_appliquee?: number;
}

export type ConfianceGlobale = "certifie" | "indicatif" | "non_comparable";

export interface DevisReconcilie {
  sections: SectionReconciliee[];
  total_ht_lu: number | null;
  total_ht_recalcule: number;
  total_tva_lu: number | null;
  total_ttc_lu: number | null;
  remise_appliquee: number;
  total_devis_coherent: boolean;
  ecart_total_pct: number;
  confiance_globale: ConfianceGlobale;
  /** Stats pour debug et diagnostic */
  stats: {
    nb_lignes_total: number;
    nb_lignes_prix_lu: number;
    nb_lignes_prix_calcule: number;
    nb_lignes_prix_absent: number;
    nb_lignes_arithmetique_invalide: number;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers numériques
// ──────────────────────────────────────────────────────────────────────────────

/** Vrai si v est un nombre fini > 0. */
function isPositive(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/** Arrondit à 2 décimales (centimes). */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Vrai si a et b sont arithmétiquement proches au sens des tolérances. */
function isClose(a: number, b: number, absTol: number, pctTol: number): boolean {
  const diff = Math.abs(a - b);
  const ref = Math.max(Math.abs(a), Math.abs(b));
  return diff <= absTol || (ref > 0 && diff / ref <= pctTol);
}

/** Écart relatif entre a et b (0..1). Renvoie 0 si l'un des deux est 0. */
function deltaPct(a: number, b: number): number {
  const ref = Math.max(Math.abs(a), Math.abs(b));
  if (ref === 0) return 0;
  return Math.abs(a - b) / ref;
}

// ──────────────────────────────────────────────────────────────────────────────
// Réconciliation au niveau ligne
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Réconcilie 1 ligne (qty × prix_u ≈ montant).
 *
 * Cas couverts (les 3 champs sont soit positifs, soit null) :
 *   1. Les 3 connus + cohérents → tout "lu", arithmétique valide
 *   2. Les 3 connus + incohérents → diagnostic, on propose le plus fiable
 *   3. 2 connus + 1 manquant → on calcule le 3e
 *   4. 1 connu + 2 manquants → on remonte tel quel (impossible de calculer)
 *   5. 0 connus → on remonte tout absent
 */
export function reconcileLigne(input: LigneInput): LigneReconciliee {
  const { quantite, prix_unitaire, montant_total } = input;

  const qLu = isPositive(quantite);
  const puLu = isPositive(prix_unitaire);
  const mLu = isPositive(montant_total);

  // Cas 5 — Aucun connu
  if (!qLu && !puLu && !mLu) {
    return {
      ...input,
      quantite_resolved: null,
      prix_unitaire_resolved: null,
      montant_total_resolved: null,
      quantite_confidence: { source: "absent", value_extracted: null },
      prix_unitaire_confidence: { source: "absent", value_extracted: null },
      montant_total_confidence: { source: "absent", value_extracted: null },
      arithmetique_valide: false,
      diagnostic: "Aucune valeur lisible (qty/prix_u/montant tous absents)",
    };
  }

  // Cas 4 — 1 seul connu, impossible à compléter
  const nbConnus = (qLu ? 1 : 0) + (puLu ? 1 : 0) + (mLu ? 1 : 0);
  if (nbConnus === 1) {
    return {
      ...input,
      quantite_resolved: quantite,
      prix_unitaire_resolved: prix_unitaire,
      montant_total_resolved: montant_total,
      quantite_confidence: qLu
        ? { source: "lu", value_extracted: quantite }
        : { source: "absent", value_extracted: null },
      prix_unitaire_confidence: puLu
        ? { source: "lu", value_extracted: prix_unitaire }
        : { source: "absent", value_extracted: null },
      montant_total_confidence: mLu
        ? { source: "lu", value_extracted: montant_total }
        : { source: "absent", value_extracted: null },
      arithmetique_valide: false,
      diagnostic: "Une seule valeur connue, impossible de réconcilier",
    };
  }

  // Cas 3 — 2 connus, on calcule le 3e
  if (nbConnus === 2) {
    if (qLu && puLu && !mLu) {
      // Calcule montant = qty × prix_u
      const recalc = round2(quantite! * prix_unitaire!);
      return {
        ...input,
        quantite_resolved: quantite,
        prix_unitaire_resolved: prix_unitaire,
        montant_total_resolved: recalc,
        quantite_confidence: { source: "lu", value_extracted: quantite },
        prix_unitaire_confidence: { source: "lu", value_extracted: prix_unitaire },
        montant_total_confidence: {
          source: "calcule",
          value_extracted: null,
          value_recalculated: recalc,
        },
        arithmetique_valide: true,
        diagnostic: "Montant calculé depuis qty × prix_u",
      };
    }
    if (qLu && mLu && !puLu) {
      // Calcule prix_u = montant / qty
      const recalc = round2(montant_total! / quantite!);
      return {
        ...input,
        quantite_resolved: quantite,
        prix_unitaire_resolved: recalc,
        montant_total_resolved: montant_total,
        quantite_confidence: { source: "lu", value_extracted: quantite },
        prix_unitaire_confidence: {
          source: "calcule",
          value_extracted: null,
          value_recalculated: recalc,
        },
        montant_total_confidence: { source: "lu", value_extracted: montant_total },
        arithmetique_valide: true,
        diagnostic: "Prix unitaire calculé depuis montant / qty",
      };
    }
    if (puLu && mLu && !qLu) {
      // Calcule qty = montant / prix_u
      const recalc = round2(montant_total! / prix_unitaire!);
      return {
        ...input,
        quantite_resolved: recalc,
        prix_unitaire_resolved: prix_unitaire,
        montant_total_resolved: montant_total,
        quantite_confidence: {
          source: "calcule",
          value_extracted: null,
          value_recalculated: recalc,
        },
        prix_unitaire_confidence: { source: "lu", value_extracted: prix_unitaire },
        montant_total_confidence: { source: "lu", value_extracted: montant_total },
        arithmetique_valide: true,
        diagnostic: "Quantité calculée depuis montant / prix_u",
      };
    }
  }

  // Cas 1 ou 2 — Les 3 connus
  const recalc = round2(quantite! * prix_unitaire!);
  const ecart = deltaPct(recalc, montant_total!);
  const coherent = isClose(recalc, montant_total!, TOLERANCE_LIGNE_ABS, TOLERANCE_LIGNE_PCT);

  if (coherent) {
    // Cas 1 — Tout cohérent
    return {
      ...input,
      quantite_resolved: quantite,
      prix_unitaire_resolved: prix_unitaire,
      montant_total_resolved: montant_total,
      quantite_confidence: { source: "lu", value_extracted: quantite },
      prix_unitaire_confidence: {
        source: "lu",
        value_extracted: prix_unitaire,
        value_recalculated: undefined,
      },
      montant_total_confidence: {
        source: "lu",
        value_extracted: montant_total,
        value_recalculated: recalc,
        delta_pct: round2(ecart * 10000) / 10000,
      },
      arithmetique_valide: true,
    };
  }

  // Cas 2 — Désaccord
  // Heuristique : le montant_total est généralement le plus fiable
  // (colonne explicite, somme arithmétique sur l'écriture du devis).
  // On garde montant + prix_u lus, on flag le diagnostic.
  return {
    ...input,
    quantite_resolved: quantite,
    prix_unitaire_resolved: prix_unitaire,
    montant_total_resolved: montant_total,
    quantite_confidence: { source: "lu", value_extracted: quantite },
    prix_unitaire_confidence: { source: "lu", value_extracted: prix_unitaire },
    montant_total_confidence: {
      source: "lu",
      value_extracted: montant_total,
      value_recalculated: recalc,
      delta_pct: round2(ecart * 10000) / 10000,
    },
    arithmetique_valide: false,
    diagnostic: `Incohérence ${ecart > 0.1 ? "majeure" : "mineure"} : qty × prix_u = ${recalc} ≠ montant ${montant_total} (écart ${(ecart * 100).toFixed(1)}%)`,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Réconciliation au niveau section
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Pour une section avec sous_total lu et N lignes filles, vérifie
 * sous_total ≈ Σ lignes.montant_total_resolved.
 *
 * Si sous_total_lu absent → recalculé fait foi (coherent=true par défaut).
 * Si sous_total_lu présent → écart vs Σ ≤ tolérance section.
 */
export function reconcileSection(input: SectionInput): SectionReconciliee {
  const lignesReconciliees = input.lignes.map(reconcileLigne);
  const sumLignes = lignesReconciliees.reduce(
    (acc, l) => acc + (l.montant_total_resolved ?? 0),
    0,
  );
  const sousTotalRecalcule = round2(sumLignes);
  const ecart = input.sous_total_lu === null ? 0 : deltaPct(input.sous_total_lu, sousTotalRecalcule);
  const coherent =
    input.sous_total_lu === null
      ? true
      : isClose(input.sous_total_lu, sousTotalRecalcule, TOLERANCE_SECTION_ABS, TOLERANCE_SECTION_PCT);

  return {
    id_hierarchique: input.id_hierarchique,
    libelle: input.libelle,
    sous_total_lu: input.sous_total_lu,
    sous_total_recalcule: sousTotalRecalcule,
    ecart_pct: round2(ecart * 10000) / 10000,
    coherent,
    lignes: lignesReconciliees,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Réconciliation au niveau devis
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Pour le devis entier : total_ht ≈ Σ sous_totaux − remise.
 *
 * Calcule aussi stats globales pour piloter la confiance globale.
 */
export function reconcileDevis(input: DevisInput): DevisReconcilie {
  const sectionsReconciliees = input.sections.map(reconcileSection);
  const sumSections = sectionsReconciliees.reduce(
    (acc, s) => acc + s.sous_total_recalcule,
    0,
  );
  const remise = input.remise_appliquee ?? 0;
  const totalRecalcule = round2(sumSections - remise);
  const ecart = input.total_ht_lu === null ? 0 : deltaPct(input.total_ht_lu, totalRecalcule);
  const coherent =
    input.total_ht_lu === null
      ? true
      : isClose(input.total_ht_lu, totalRecalcule, TOLERANCE_DEVIS_ABS, TOLERANCE_DEVIS_PCT);

  // Stats
  let nb_total = 0;
  let nb_lu = 0;
  let nb_calc = 0;
  let nb_absent = 0;
  let nb_arith_inv = 0;
  for (const s of sectionsReconciliees) {
    for (const l of s.lignes) {
      nb_total++;
      switch (l.prix_unitaire_confidence.source) {
        case "lu":
          nb_lu++;
          break;
        case "calcule":
          nb_calc++;
          break;
        case "absent":
          nb_absent++;
          break;
      }
      if (!l.arithmetique_valide) nb_arith_inv++;
    }
  }

  const confiance_globale = evaluerConfianceGlobaleInterne(
    nb_total,
    nb_lu,
    nb_calc,
    nb_absent,
    ecart,
    sectionsReconciliees,
  );

  return {
    sections: sectionsReconciliees,
    total_ht_lu: input.total_ht_lu,
    total_ht_recalcule: totalRecalcule,
    total_tva_lu: input.total_tva_lu,
    total_ttc_lu: input.total_ttc_lu,
    remise_appliquee: remise,
    total_devis_coherent: coherent,
    ecart_total_pct: round2(ecart * 10000) / 10000,
    confiance_globale,
    stats: {
      nb_lignes_total: nb_total,
      nb_lignes_prix_lu: nb_lu,
      nb_lignes_prix_calcule: nb_calc,
      nb_lignes_prix_absent: nb_absent,
      nb_lignes_arithmetique_invalide: nb_arith_inv,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Confiance globale du devis
// ──────────────────────────────────────────────────────────────────────────────

function evaluerConfianceGlobaleInterne(
  nbTotal: number,
  nbLu: number,
  _nbCalc: number,
  nbAbsent: number,
  ecartTotal: number,
  sections: SectionReconciliee[],
): ConfianceGlobale {
  if (nbTotal === 0) return "non_comparable";

  const pctLu = nbLu / nbTotal;
  const pctAbsent = nbAbsent / nbTotal;
  const sectionsCoherentes = sections.every((s) => s.coherent);

  // Critère "non_comparable" : prix absent > 30% OU écart total > 5%
  if (pctAbsent > CONFIANCE_NON_COMPARABLE_ABSENT_PCT) return "non_comparable";
  if (ecartTotal > CONFIANCE_NON_COMPARABLE_ECART_PCT) return "non_comparable";

  // Critère "certifié" : ≥ 95% lus + sections cohérentes + écart total ≤ 1%
  if (
    pctLu >= CONFIANCE_CERTIFIE_MIN_LU_PCT &&
    sectionsCoherentes &&
    ecartTotal <= CONFIANCE_INDICATIF_ECART_PCT
  ) {
    return "certifie";
  }

  // Sinon : indicatif (zone tampon)
  return "indicatif";
}

/**
 * API publique : alias pour rester cohérent avec PHASE3-ARCHITECTURE.md
 */
export function evaluerConfianceGlobale(devis: DevisReconcilie): ConfianceGlobale {
  return devis.confiance_globale;
}
