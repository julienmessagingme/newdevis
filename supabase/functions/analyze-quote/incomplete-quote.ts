// ============================================================
// Détection "devis incomplet" (résumé par lot) — logique partagée V1 + V2.
//
// V3.5.1 : un devis dont ≥ 70% des lignes n'ont ni unité physique ni quantité
// réelle est considéré comme un résumé par corps de métier ("Plomberie 7600€")
// → bypass conclusion.ts avec bannière "demandez un devis détaillé".
//
// 2026-08-03 — Garde montant (cas ATEX, cf. docs/refonte/BUGS-A-CORRIGER.md
// INCOMPLETE-QUOTE-FAUX-POSITIF-FORFAITS-LEGITIMES) : compter les LIGNES ne
// suffit pas. Un ravalement de façade légitime contient 6 forfaits "1 unité"
// (échafaudage, purge, dépose, nettoyage) à côté d'un poste principal
// parfaitement quantifié (bardage 80 m² × 142,50 €) qui porte 74% du montant.
// L'ancienne heuristique déclenchait à 75% de lignes forfait alors que le
// devis était analysable. Nouvelle règle : le bypass ne se déclenche que si
// EN PLUS ≥ 70% du MONTANT HT est porté par des lignes sans unité physique.
// Fallback : si aucun montant exploitable (tous null/0), on garde le
// comportement historique par comptage de lignes (cas devis bidon Crételi).
//
// Le Set d'unités physiques reste fourni par l'appelant : extract.ts (V1) et
// extract_v2.ts (V2, set étendu) ont des listes différentes — ce module ne
// doit PAS unifier silencieusement leurs comportements.
// ============================================================

export interface IncompleteQuoteLine {
  unite: string | null | undefined;
  quantite: number | null | undefined;
  /** Montant HT de la ligne (V1: travaux[].montant, V2: LigneV2.montant_total) */
  montant: number | null | undefined;
  /** Libellé de la ligne — utilisé par la garde « libellés de lot » (2026-08-17) */
  libelle?: string | null;
}

// 2026-08-17 (cas FCE climatisation) — 3e garde-fou : la garde « libellés de
// lot ». Un devis d'ÉQUIPEMENT (clim, chaudière, menuiseries…) se quantifie
// naturellement à l'unité (« 1 × PAC gainable PEAD-M60JA — 2 481 € ») : 100%
// des lignes sont en qty=1 sans unité physique ET 100% du montant aussi, mais
// ce n'est PAS un résumé par lot — chaque ligne porte une référence produit et
// un prix. Le vrai « résumé par lot » (cas Créteil) a des libellés GÉNÉRIQUES
// de corps de métier (« Plomberie », « Électricité », « Travaux de couverture »).
// Règle : le bypass n'est légitime que si ≥ 50% des lignes non quantifiées
// ressemblent à des intitulés de lot.
const LOT_VOCAB = [
  "plomberie", "électricité", "electricite", "maçonnerie", "maconnerie",
  "peinture", "menuiserie", "carrelage", "faïence", "faience", "placo",
  "cloison", "isolation", "démolition", "demolition", "dépose", "depose",
  "chauffage", "climatisation", "couverture", "toiture", "charpente",
  "zinguerie", "étanchéité", "etancheite", "terrassement", "vrd",
  "façade", "facade", "ravalement", "salle de bain", "salle d'eau",
  "cuisine", "gros œuvre", "gros oeuvre", "second œuvre", "second oeuvre",
  "installation de chantier", "nettoyage", "préparation", "preparation",
  "travaux préparatoires", "travaux preparatoires", "forfait global",
  "mise en sécurité", "mise en securite", "échafaudage", "echafaudage",
];

/** Token mêlant lettres et chiffres (≥4 chars) = référence produit → PAS un intitulé de lot. */
const PRODUCT_CODE_RE = /\b(?=[A-Za-z0-9-]{4,}\b)(?:[A-Za-z]+\d|\d+[A-Za-z])[A-Za-z0-9-]*\b/;

function isLotLabel(libelle: string | null | undefined): boolean {
  if (!libelle) return false;
  // Première ligne du libellé uniquement (les descriptions détaillées suivent souvent)
  const first = libelle.split("\n")[0].trim();
  if (first.length === 0 || first.length > 80) return false;
  if (PRODUCT_CODE_RE.test(first)) return false;
  const lower = first.toLowerCase();
  return LOT_VOCAB.some((w) => lower.includes(w));
}

export interface IncompleteQuoteResult {
  is_incomplete: boolean;
  reason: string;
}

const LINE_RATIO_THRESHOLD = 0.70;
const MONTANT_RATIO_THRESHOLD = 0.70;

export function detectIncompleteQuoteShared(
  lines: IncompleteQuoteLine[],
  physicalUnits: Set<string>,
): IncompleteQuoteResult {
  if (!Array.isArray(lines) || lines.length < 5) {
    return { is_incomplete: false, reason: "" };
  }

  let noPhysicalUnit = 0;
  let qtyOneOrNull = 0;
  let montantTotal = 0;
  let montantNonDetaille = 0;

  for (const t of lines) {
    const unit = String(t?.unite ?? "").trim().toLowerCase();
    const hasPhysicalUnit = physicalUnits.has(unit);
    if (!hasPhysicalUnit) noPhysicalUnit++;

    const qty = t?.quantite;
    if (qty === null || qty === undefined || qty === 1 || qty === 0) qtyOneOrNull++;

    const amt = typeof t?.montant === "number" && t.montant > 0 ? t.montant : 0;
    montantTotal += amt;
    if (!hasPhysicalUnit) montantNonDetaille += amt;
  }

  const total = lines.length;
  const noPhysicalRatio = noPhysicalUnit / total;
  const qtyOneRatio = qtyOneOrNull / total;

  if (noPhysicalRatio < LINE_RATIO_THRESHOLD || qtyOneRatio < LINE_RATIO_THRESHOLD) {
    return { is_incomplete: false, reason: "" };
  }

  // Garde montant : si la majorité du montant HT est portée par des lignes
  // quantifiées (unité physique), le devis est analysable — pas de bypass.
  let montantRatioLabel = "";
  if (montantTotal > 0) {
    const montantRatio = montantNonDetaille / montantTotal;
    if (montantRatio < MONTANT_RATIO_THRESHOLD) {
      return { is_incomplete: false, reason: "" };
    }
    montantRatioLabel = ` + ${(montantRatio * 100).toFixed(0)}% du montant HT non détaillé`;
  }

  // Garde « libellés de lot » (2026-08-17, cas FCE) : le bypass n'est légitime
  // que si les lignes non quantifiées ressemblent à des intitulés génériques de
  // corps de métier. Un devis d'équipement (références produit, prix par ligne)
  // n'est PAS un résumé par lot même si tout est en qty=1 sans unité physique.
  // Appliquée uniquement si des libellés sont disponibles (rétrocompat).
  const withLabels = lines.filter((l) => typeof l?.libelle === "string" && l.libelle.trim().length > 0);
  if (withLabels.length > 0) {
    const trivial = withLabels.filter((l) => {
      const unit = String(l?.unite ?? "").trim().toLowerCase();
      return !physicalUnits.has(unit);
    });
    if (trivial.length > 0) {
      const lotLike = trivial.filter((l) => isLotLabel(l.libelle)).length;
      if (lotLike / trivial.length < 0.5) {
        return { is_incomplete: false, reason: "" };
      }
    }
  }

  return {
    is_incomplete: true,
    reason:
      `${(noPhysicalRatio * 100).toFixed(0)}% lignes sans unité physique + ` +
      `${(qtyOneRatio * 100).toFixed(0)}% lignes quantité=1/null${montantRatioLabel} sur ${total} lignes` +
      (montantTotal > 0 ? "" : " (montants indisponibles)"),
  };
}
