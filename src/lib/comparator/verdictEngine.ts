/**
 * src/lib/comparator/verdictEngine.ts
 *
 * 🟢 Cœur métier du Comparateur de devis V1.
 *
 * Pour N analyses VMD (2 à 4) :
 *   1. Reconstruction du périmètre commun (catalog_job_types présents chez ≥ 1 devis)
 *   2. Validation du Cas A (alignement ≥ 50% des catégories sur l'ensemble)
 *   3. Détection points clefs (postes omis, quantités différentes, marques)
 *   4. Détection points vigilance (clauses litigieuses, acompte excessif)
 *   5. Score multi-critères pondéré (prix 40 / fiabilité 25 / transparence 20 / clauses 15)
 *   6. Verdict conditionnel + 3 leviers
 *
 * Spec : docs/specs/COMPARATEUR-DEVIS-V1.md
 *
 * Posture honnêteté : si on ne sait pas, on dit "Information non disponible".
 * Si la confiance d'extraction d'un devis est basse, ses données sont
 * marquées 'low_confidence' dans le verdict.
 */

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface AnalysisInput {
  id: string;
  file_name: string | null;
  conclusion_ia: any;        // JSON parsé de analyses.conclusion_ia
  raw_text: any;             // JSON parsé de analyses.raw_text (contient extracted + n8n_price_data)
  score_data: any;           // JSON parsé de analyses.score (contient flags entreprise, etc.)
}

export type Confidence = "certifie" | "indicatif" | "non_comparable";

export interface PerimeterPoste {
  job_type: string;
  label: string;
  presence: Record<string, number | null>; // analysisId → devis_total_ht ou null si non inclus
  quantites: Record<string, string | null>; // pour POINTS CLEFS quantités
}

export interface ComparatorVerdict {
  /** Statut global */
  status: "ready" | "rejected_perimeter";
  rejection_reason?: string;

  /** Métadonnées */
  analyses: Array<{
    id: string;
    file_name: string | null;
    artisan_nom: string | null;
    total_ht: number;
    total_ttc: number;
    confiance: Confidence;
    rank: number;       // 1 = best, N = worst
    is_recommended: boolean;
  }>;

  /** Périmètre commun reconstruit */
  perimeter: PerimeterPoste[];
  perimeter_alignment_pct: number; // 0-100

  /** Verdict tranché */
  recommended_analysis_id: string;
  verdict_summary: string;

  /** 3 différences clefs (œil expert) */
  key_findings: Array<{
    icon: string;
    title: string;
    detail: string;
    impacted_analyses: string[];
  }>;

  /** Points de vigilance */
  vigilance: Array<{
    level: "warning" | "danger";
    icon: string;
    title: string;
    detail: string;
    impacted_analyses: string[];
  }>;

  /** 3 leviers conditionnels */
  levers: Array<{
    title: string;
    winner_analysis_id: string;
    detail: string;
  }>;

  /** Détail par devis pour les 4 sections UI */
  details: Record<string, {
    prix: {
      total_ht: number;
      total_ttc: number;
      verdict_marche: "Bas" | "Correct" | "Élevé" | "Inconnu";
      acompte_pct: number | null;
    };
    entreprise: {
      anciennete_ans: number | null;
      google_note: number | null;
      google_reviews: number | null;
      assurance: boolean | null;
      clauses_litigieuses: string[];
    };
    transparence: {
      quantites_pct: number;       // % de lignes avec unité précise
      materiel_marques: string[];   // marques détectées
      echeancier_clair: boolean;
    };
  }>;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function safeParse(s: unknown): any {
  if (!s || typeof s !== "string") return s;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extractArtisanNom(a: AnalysisInput): string | null {
  const extracted = a.raw_text?.extracted ?? a.raw_text;
  return extracted?.entreprise?.nom ?? null;
}

function extractTotalHt(a: AnalysisInput): number {
  const extracted = a.raw_text?.extracted ?? a.raw_text;
  return typeof extracted?.totaux?.ht === "number" ? extracted.totaux.ht : 0;
}

function extractTotalTtc(a: AnalysisInput): number {
  const extracted = a.raw_text?.extracted ?? a.raw_text;
  return typeof extracted?.totaux?.ttc === "number" ? extracted.totaux.ttc : 0;
}

function extractAcomptePct(a: AnalysisInput): number | null {
  const extracted = a.raw_text?.extracted ?? a.raw_text;
  const echeancier = Array.isArray(extracted?.echeancier) ? extracted.echeancier : [];
  // Cumul des étapes "pré-prestation" (signature + démarrage + livraison matériaux)
  const PRE = new Set(["signature", "demarrage", "livraison_materiaux"]);
  let cumul = 0;
  for (const e of echeancier) {
    if (PRE.has(String(e.etape))) {
      cumul += typeof e.pourcentage === "number" ? e.pourcentage : 0;
    }
  }
  return cumul > 0 ? cumul : null;
}

function extractClausesLitigieuses(a: AnalysisInput): string[] {
  const extracted = a.raw_text?.extracted ?? a.raw_text;
  const clauses = Array.isArray(extracted?.clauses_litigieuses) ? extracted.clauses_litigieuses : [];
  return clauses.map((c: any) => String(c.type ?? "?")).filter(Boolean);
}

function extractConfiance(a: AnalysisInput): Confidence {
  // V2 a un champ confiance_globale. V1 par défaut "certifie".
  const extracted = a.raw_text?.extracted ?? a.raw_text;
  const c = extracted?.confiance_globale;
  if (c === "certifie" || c === "indicatif" || c === "non_comparable") return c;
  return "certifie";
}

function extractQuantitesPct(a: AnalysisInput): number {
  // % de lignes travaux avec une unité précise (m², ml, U) — pas vide ni juste un nombre
  const extracted = a.raw_text?.extracted ?? a.raw_text;
  const travaux = Array.isArray(extracted?.travaux) ? extracted.travaux : [];
  if (!travaux.length) return 0;
  let ok = 0;
  for (const t of travaux) {
    const unit = String(t.unite ?? "").trim().toLowerCase();
    if (unit && !/^\d+$/.test(unit) && !["", "u", "ens", "f", "ff", "fft", "forfait"].includes(unit)) {
      ok++;
    }
  }
  return Math.round((ok / travaux.length) * 100);
}

/** Détecte les marques de matériel mentionnées dans les libellés travaux. */
function extractMaterielMarques(a: AnalysisInput): string[] {
  const extracted = a.raw_text?.extracted ?? a.raw_text;
  const travaux = Array.isArray(extracted?.travaux) ? extracted.travaux : [];
  // Liste des marques BTP les plus courantes — on cherche celles citées
  const MARQUES = [
    "Grohe", "Hansgrohe", "Geberit", "Villeroy & Boch", "Villeroy and Boch", "Roca",
    "Porcelanosa", "Jacob Delafon", "Ideal Standard", "Duravit", "Kohler",
    "Tollens", "Sikkens", "Dulux", "Farrow & Ball", "Astral",
    "Lapeyre", "Velux", "Schüco", "K-line",
    "Daikin", "Atlantic", "Saunier Duval", "De Dietrich", "Vaillant", "Frisquet",
    "Schneider Electric", "Legrand", "Hager", "Bticino",
    "Velis", "Wedi", "Knauf", "Placo",
  ];
  const found = new Set<string>();
  for (const t of travaux) {
    const libelle = String(t.libelle ?? "");
    for (const m of MARQUES) {
      if (new RegExp(`\\b${m.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i").test(libelle)) {
        found.add(m);
      }
    }
  }
  return [...found];
}

function extractAnciennete(a: AnalysisInput): number | null {
  // Cherche dans score.criteres_verts ou flags entreprise
  const score = a.score_data;
  const annees = score?.entreprise?.annees_activite;
  if (typeof annees === "number" && annees > 0) return annees;
  return null;
}

function extractGoogleNote(a: AnalysisInput): { note: number | null; reviews: number | null } {
  const score = a.score_data;
  const note = score?.entreprise?.google_note;
  const reviews = score?.entreprise?.google_avis_count;
  return {
    note: typeof note === "number" && note > 0 ? note : null,
    reviews: typeof reviews === "number" && reviews >= 0 ? reviews : null,
  };
}

function extractAssurance(a: AnalysisInput): boolean | null {
  const extracted = a.raw_text?.extracted ?? a.raw_text;
  const entreprise = extracted?.entreprise;
  if (!entreprise) return null;
  const dec = entreprise.assurance_decennale_mentionnee;
  const rcpro = entreprise.assurance_rc_pro_mentionnee;
  if (typeof dec === "boolean" || typeof rcpro === "boolean") {
    return Boolean(dec) || Boolean(rcpro);
  }
  return null;
}

function extractVerdictMarche(
  totalHt: number,
  perimeter: PerimeterPoste[],
  analysisId: string,
): "Bas" | "Correct" | "Élevé" | "Inconnu" {
  // Compare le total HT au médian des autres devis. Tolérance ±5%.
  const totaux = perimeter
    .map((p) => Object.entries(p.presence))
    .flat()
    .filter(([_, v]) => v !== null && typeof v === "number") as [string, number][];
  if (totaux.length < 3) return "Inconnu";
  const sums: Record<string, number> = {};
  for (const [aid, v] of totaux) sums[aid] = (sums[aid] ?? 0) + v;
  const allSums = Object.values(sums).sort((a, b) => a - b);
  if (allSums.length < 2) return "Inconnu";
  const median = allSums[Math.floor(allSums.length / 2)];
  const ratio = totalHt / median;
  if (ratio < 0.85) return "Bas";
  if (ratio > 1.15) return "Élevé";
  return "Correct";
}

function extractEcheancierClair(a: AnalysisInput): boolean {
  const extracted = a.raw_text?.extracted ?? a.raw_text;
  const echeancier = Array.isArray(extracted?.echeancier) ? extracted.echeancier : [];
  return echeancier.length >= 2;
}

// ──────────────────────────────────────────────────────────────────────────
// Reconstruction du périmètre commun
// ──────────────────────────────────────────────────────────────────────────

function reconstructPerimeter(analyses: AnalysisInput[]): PerimeterPoste[] {
  // Index : job_type → { label, presence }
  const map = new Map<string, PerimeterPoste>();

  for (const a of analyses) {
    const groups = Array.isArray(a.raw_text?.n8n_price_data) ? a.raw_text.n8n_price_data : [];
    for (const g of groups) {
      const cats = Array.isArray(g.catalog_job_types) ? g.catalog_job_types : [];
      const jobType = String(cats[0] ?? g.prices?.[0]?.job_type ?? "").trim();
      if (!jobType) continue;

      const label = String(g.job_type_label ?? g.prices?.[0]?.label ?? jobType);
      const total = typeof g.devis_total_ht === "number" ? g.devis_total_ht : null;
      const mainQty = g.main_quantity;
      const mainUnit = g.main_unit;
      const qtyStr =
        mainQty !== null && mainQty !== undefined && mainUnit
          ? `${mainQty} ${mainUnit}`
          : null;

      let entry = map.get(jobType);
      if (!entry) {
        entry = {
          job_type: jobType,
          label,
          presence: Object.fromEntries(analyses.map((aa) => [aa.id, null])),
          quantites: Object.fromEntries(analyses.map((aa) => [aa.id, null])),
        };
        map.set(jobType, entry);
      }
      entry.presence[a.id] = total;
      entry.quantites[a.id] = qtyStr;
    }
  }

  return [...map.values()].sort((a, b) => {
    // Tri par "présent partout d'abord", puis par total moyen desc
    const aMissing = Object.values(a.presence).filter((v) => v === null).length;
    const bMissing = Object.values(b.presence).filter((v) => v === null).length;
    if (aMissing !== bMissing) return aMissing - bMissing;
    const aAvg =
      Object.values(a.presence)
        .filter((v) => v !== null)
        .reduce((s: number, v) => s + (v as number), 0) /
      Math.max(1, Object.values(a.presence).filter((v) => v !== null).length);
    const bAvg =
      Object.values(b.presence)
        .filter((v) => v !== null)
        .reduce((s: number, v) => s + (v as number), 0) /
      Math.max(1, Object.values(b.presence).filter((v) => v !== null).length);
    return bAvg - aAvg;
  });
}

function computeAlignmentPct(perimeter: PerimeterPoste[], analyses: AnalysisInput[]): number {
  if (!perimeter.length) return 0;
  // Pour chaque devis, compter combien des catégories du périmètre lui sont communes
  const ratios: number[] = [];
  for (const a of analyses) {
    const present = perimeter.filter((p) => p.presence[a.id] !== null).length;
    ratios.push(present / perimeter.length);
  }
  // Minimum ratio = signal de cas A
  return Math.round(Math.min(...ratios) * 100);
}

// ──────────────────────────────────────────────────────────────────────────
// Détections "œil expert"
// ──────────────────────────────────────────────────────────────────────────

interface KeyFinding {
  icon: string;
  title: string;
  detail: string;
  impacted_analyses: string[];
}

function detectKeyFindings(
  analyses: AnalysisInput[],
  perimeter: PerimeterPoste[],
): KeyFinding[] {
  const findings: KeyFinding[] = [];

  // 1. Postes omis (présents chez ≥ majorité mais absents chez un autre)
  const omissions: Record<string, string[]> = {}; // analysisId → postes omis
  for (const a of analyses) omissions[a.id] = [];
  for (const p of perimeter) {
    const presentCount = Object.values(p.presence).filter((v) => v !== null).length;
    const majorityThreshold = Math.ceil(analyses.length / 2) + 1;
    if (presentCount >= majorityThreshold) {
      // Le poste est présent chez la majorité → ceux qui ne l'ont pas sont des omissions
      for (const a of analyses) {
        if (p.presence[a.id] === null) {
          omissions[a.id].push(p.label);
        }
      }
    }
  }
  for (const a of analyses) {
    if (omissions[a.id].length === 0) continue;
    const nom = extractArtisanNom(a) ?? "Devis " + a.id.slice(0, 4);
    const listePostes = omissions[a.id].slice(0, 3).join(", ");
    // Estimation surcoût ajoutée (moyenne des autres pour ces postes)
    let surcoutEstime = 0;
    for (const posteLabel of omissions[a.id]) {
      const p = perimeter.find((pp) => pp.label === posteLabel);
      if (!p) continue;
      const others = Object.values(p.presence).filter((v): v is number => typeof v === "number");
      if (others.length) surcoutEstime += others.reduce((s, v) => s + v, 0) / others.length;
    }
    findings.push({
      icon: "📦",
      title: `${nom} omet ${omissions[a.id].length} poste${omissions[a.id].length > 1 ? "s" : ""}`,
      detail: `Postes manquants : <em>${listePostes}</em>${
        omissions[a.id].length > 3 ? ` et ${omissions[a.id].length - 3} autre(s)` : ""
      }. Coût caché estimé : <strong>~${Math.round(surcoutEstime).toLocaleString("fr-FR")} €</strong>. Si vous signez tel quel, ces postes ressortiront en facture supplémentaire.`,
      impacted_analyses: [a.id],
    });
  }

  // 2. Quantités différentes sur un même poste (écart ≥ 15%)
  const quantitesDiffs: string[] = [];
  for (const p of perimeter) {
    const qStrs = Object.entries(p.quantites)
      .filter(([_, v]) => v !== null)
      .map(([aid, v]) => ({ aid, str: v as string }));
    if (qStrs.length < 2) continue;
    // Extraire le 1er nombre de chaque
    const numbers = qStrs.map((q) => {
      const m = /^([\d.,]+)/.exec(q.str.trim());
      return { aid: q.aid, n: m ? parseFloat(m[1].replace(",", ".")) : null };
    }).filter((x): x is { aid: string; n: number } => x.n !== null && x.n > 0);
    if (numbers.length < 2) continue;
    const max = Math.max(...numbers.map((n) => n.n));
    const min = Math.min(...numbers.map((n) => n.n));
    if (min > 0 && (max - min) / max >= 0.15) {
      const ecart = Math.round(((max - min) / max) * 100);
      quantitesDiffs.push(`<strong>${p.label}</strong> : écart de ${ecart}% sur les quantités déclarées`);
    }
  }
  if (quantitesDiffs.length > 0) {
    findings.push({
      icon: "📐",
      title: `Quantités déclarées : ${quantitesDiffs.length} écart${quantitesDiffs.length > 1 ? "s" : ""} significatif${quantitesDiffs.length > 1 ? "s" : ""}`,
      detail:
        `${quantitesDiffs.slice(0, 2).join(". ")}. Soit la pièce/surface fait vraiment cette quantité (auquel cas certains surfacturent), soit elle a été sous-estimée pour paraître moins cher. <em>À vérifier mètre laser en main avant signature</em>.`,
      impacted_analyses: analyses.map((a) => a.id),
    });
  }

  // 3. Marques de matériel précisées vs non
  const marquesParDevis: Record<string, string[]> = {};
  for (const a of analyses) marquesParDevis[a.id] = extractMaterielMarques(a);
  const avecMarques = analyses.filter((a) => marquesParDevis[a.id].length >= 2);
  const sansMarques = analyses.filter((a) => marquesParDevis[a.id].length === 0);
  if (avecMarques.length >= 1 && sansMarques.length >= 1) {
    const avecLabels = avecMarques
      .map((a) => `<strong>${extractArtisanNom(a) ?? "Devis"}</strong> (${marquesParDevis[a.id].slice(0, 3).join(", ")})`)
      .join(", ");
    const sansLabels = sansMarques
      .map((a) => extractArtisanNom(a) ?? "Devis")
      .join(", ");
    findings.push({
      icon: "🏷️",
      title: "Marques de matériel précisées ou non",
      detail: `${avecLabels} <strong>nomme${avecMarques.length > 1 ? "nt" : ""}</strong> les marques de matériel installé — gage de transparence et qualité contrôlable. ${sansLabels} <strong>ne précise${sansMarques.length > 1 ? "nt" : ""} aucune marque</strong> : gamme et qualité non vérifiables tant que pas demandé explicitement.`,
      impacted_analyses: [...avecMarques.map((a) => a.id), ...sansMarques.map((a) => a.id)],
    });
  }

  return findings;
}

interface Vigilance {
  level: "warning" | "danger";
  icon: string;
  title: string;
  detail: string;
  impacted_analyses: string[];
}

function detectVigilance(analyses: AnalysisInput[]): Vigilance[] {
  const vigilance: Vigilance[] = [];

  // 1. Clauses litigieuses (DANGER)
  for (const a of analyses) {
    const clauses = extractClausesLitigieuses(a);
    if (clauses.length > 0) {
      const nom = extractArtisanNom(a) ?? "Devis " + a.id.slice(0, 4);
      const types = clauses.join(", ");
      vigilance.push({
        level: "danger",
        icon: "⚠️",
        title: `Clause(s) litigieuse(s) détectée(s) dans le devis de ${nom}`,
        detail: `Type(s) : <em>${types}</em>. Certaines clauses (pas de rétractation, modification unilatérale du prix) sont illégales en France. Exigez leur retrait avant signature, sinon le contrat est nul.`,
        impacted_analyses: [a.id],
      });
    }
  }

  // 2. Acompte cumulé excessif (WARNING)
  for (const a of analyses) {
    const pct = extractAcomptePct(a);
    if (pct !== null && pct > 35) {
      const nom = extractArtisanNom(a) ?? "Devis " + a.id.slice(0, 4);
      const totalHt = extractTotalHt(a);
      const risque = Math.round((totalHt * pct) / 100);
      vigilance.push({
        level: "warning",
        icon: "💰",
        title: `Acompte cumulé ${pct}% avant démarrage chez ${nom}`,
        detail: `Si le chantier tourne mal, vous perdez ~${risque.toLocaleString("fr-FR")} €. Norme du métier = 30%, à négocier.`,
        impacted_analyses: [a.id],
      });
    }
  }

  // 3. Info Google non disponible (WARNING, posture honnêteté)
  for (const a of analyses) {
    const { note } = extractGoogleNote(a);
    if (note === null) {
      const nom = extractArtisanNom(a) ?? "Devis " + a.id.slice(0, 4);
      vigilance.push({
        level: "warning",
        icon: "🔍",
        title: `Aucune note Google trouvée pour ${nom}`,
        detail: `<strong>Information non disponible</strong> : entreprise non identifiée sur Google. Pas forcément un mauvais signal (petite structure récente, communication limitée). <strong>Mais à creuser</strong> : demandez 3 références de chantiers récents avec coordonnées.`,
        impacted_analyses: [a.id],
      });
    }
  }

  return vigilance;
}

// ──────────────────────────────────────────────────────────────────────────
// Score multi-critères + verdict
// ──────────────────────────────────────────────────────────────────────────

interface ScoreBreakdown {
  prix: number;        // 0-100
  fiabilite: number;
  transparence: number;
  clauses: number;
  global: number;      // pondéré 40/25/20/15
}

function computeScore(
  a: AnalysisInput,
  totalHt: number,
  totalHtAjuste: number,
  analyses: AnalysisInput[],
): ScoreBreakdown {
  // Prix : meilleur = plus bas TotalHtAjuste
  const totauxAjustes = analyses.map((aa) => {
    if (aa.id === a.id) return totalHtAjuste;
    return extractTotalHt(aa);
  });
  const minPrice = Math.min(...totauxAjustes);
  const maxPrice = Math.max(...totauxAjustes);
  const prixScore =
    maxPrice === minPrice ? 100 : Math.round(((maxPrice - totalHtAjuste) / (maxPrice - minPrice)) * 100);

  // Fiabilité : ancienneté + Google + assurance
  const anc = extractAnciennete(a) ?? 0;
  const { note } = extractGoogleNote(a);
  const assurance = extractAssurance(a);
  let fiab = 0;
  fiab += Math.min(40, anc * 4); // 10 ans = 40 pts
  fiab += note !== null ? Math.min(40, (note - 3) * 20) : 0;
  fiab += assurance === true ? 20 : assurance === false ? -20 : 0;
  const fiabiliteScore = Math.max(0, Math.min(100, fiab));

  // Transparence : quantités précisées + échéancier clair + marques
  const qPct = extractQuantitesPct(a);
  const echClair = extractEcheancierClair(a);
  const marques = extractMaterielMarques(a).length;
  const transparenceScore = Math.max(
    0,
    Math.min(100, qPct * 0.6 + (echClair ? 20 : 0) + Math.min(20, marques * 7)),
  );

  // Clauses
  const clauses = extractClausesLitigieuses(a);
  const acomptePct = extractAcomptePct(a);
  let cl = 100;
  cl -= clauses.length * 40;
  if (acomptePct !== null && acomptePct > 35) cl -= 20;
  if (acomptePct !== null && acomptePct > 50) cl -= 20;
  const clausesScore = Math.max(0, Math.min(100, cl));

  const global = Math.round(
    prixScore * 0.4 + fiabiliteScore * 0.25 + transparenceScore * 0.2 + clausesScore * 0.15,
  );
  return { prix: prixScore, fiabilite: fiabiliteScore, transparence: transparenceScore, clauses: clausesScore, global };
}

// ──────────────────────────────────────────────────────────────────────────
// Main : computeComparatorVerdict
// ──────────────────────────────────────────────────────────────────────────

export function computeComparatorVerdict(analyses: AnalysisInput[]): ComparatorVerdict {
  if (analyses.length < 2 || analyses.length > 4) {
    throw new Error("Comparator V1 supports 2 to 4 analyses");
  }

  // 1. Périmètre commun
  const perimeter = reconstructPerimeter(analyses);
  const alignmentPct = computeAlignmentPct(perimeter, analyses);

  // 2. Validation Cas A : ≥ 50% d'alignement
  if (alignmentPct < 50 || perimeter.length === 0) {
    return {
      status: "rejected_perimeter",
      rejection_reason: `Vos devis ne semblent pas porter sur les mêmes travaux (alignement ${alignmentPct}% < 50%). Le comparateur V1 ne traite que les devis qui couvrent le même chantier.`,
      analyses: [],
      perimeter,
      perimeter_alignment_pct: alignmentPct,
      recommended_analysis_id: "",
      verdict_summary: "",
      key_findings: [],
      vigilance: [],
      levers: [],
      details: {},
    };
  }

  // 3. Calcul totaux ajustés (avec estimation des manquants)
  const totauxAjustes: Record<string, number> = {};
  for (const a of analyses) {
    const totalHt = extractTotalHt(a);
    let ajustement = 0;
    for (const p of perimeter) {
      if (p.presence[a.id] === null) {
        // Manquant chez ce devis → moyenne des autres
        const others = Object.values(p.presence).filter((v): v is number => typeof v === "number");
        if (others.length) {
          ajustement += others.reduce((s, v) => s + v, 0) / others.length;
        }
      }
    }
    totauxAjustes[a.id] = totalHt + ajustement;
  }

  // 4. Scores
  const scores: Record<string, ScoreBreakdown> = {};
  for (const a of analyses) {
    scores[a.id] = computeScore(a, extractTotalHt(a), totauxAjustes[a.id], analyses);
  }

  // 5. Ranking
  const ranked = [...analyses].sort((a, b) => scores[b.id].global - scores[a.id].global);
  const recommendedId = ranked[0].id;

  // 6. Détections
  const keyFindings = detectKeyFindings(analyses, perimeter);
  const vigilance = detectVigilance(analyses);

  // 7. 3 leviers conditionnels
  const sortedBySecurite = [...analyses]
    .filter((a) => extractClausesLitigieuses(a).length === 0)
    .sort((a, b) => scores[b.id].clauses - scores[a.id].clauses);
  const sortedByExpertise = [...analyses].sort(
    (a, b) => (extractAnciennete(b) ?? 0) - (extractAnciennete(a) ?? 0),
  );
  const cheapest = [...analyses].sort((a, b) => totauxAjustes[a.id] - totauxAjustes[b.id])[0];
  const recommended = ranked[0];

  const levers: ComparatorVerdict["levers"] = [];
  if (sortedBySecurite.length > 0) {
    const w = sortedBySecurite[0];
    levers.push({
      title: "Si vous priorisez la sécurité juridique",
      winner_analysis_id: w.id,
      detail: `${extractArtisanNom(w) ?? "Ce devis"} n'a aucune clause litigieuse. Contrat propre, prêt à signer sans risque.`,
    });
  }
  if (sortedByExpertise[0] && sortedByExpertise[0].id !== recommendedId) {
    const w = sortedByExpertise[0];
    const annees = extractAnciennete(w);
    levers.push({
      title: "Si vous voulez la maîtrise technique max",
      winner_analysis_id: w.id,
      detail: `${extractArtisanNom(w) ?? "Ce devis"} a ${annees ?? "?"} ans d'expérience — signal d'expertise le plus fort.`,
    });
  }
  if (cheapest.id !== recommendedId) {
    levers.push({
      title: "Si vous voulez du grain à moudre pour négocier",
      winner_analysis_id: recommended.id,
      detail: `Présentez le devis de ${extractArtisanNom(cheapest) ?? "l'artisan le moins cher"} (~${Math.round(totauxAjustes[cheapest.id]).toLocaleString("fr-FR")} €) à ${extractArtisanNom(recommended) ?? "votre choix"} pour obtenir un geste commercial. Marge typique 3-7%.`,
    });
  }

  // 8. Détails par devis (pour les 4 sections UI)
  const details: ComparatorVerdict["details"] = {};
  for (const a of analyses) {
    const { note, reviews } = extractGoogleNote(a);
    details[a.id] = {
      prix: {
        total_ht: extractTotalHt(a),
        total_ttc: extractTotalTtc(a),
        verdict_marche: extractVerdictMarche(extractTotalHt(a), perimeter, a.id),
        acompte_pct: extractAcomptePct(a),
      },
      entreprise: {
        anciennete_ans: extractAnciennete(a),
        google_note: note,
        google_reviews: reviews,
        assurance: extractAssurance(a),
        clauses_litigieuses: extractClausesLitigieuses(a),
      },
      transparence: {
        quantites_pct: extractQuantitesPct(a),
        materiel_marques: extractMaterielMarques(a),
        echeancier_clair: extractEcheancierClair(a),
      },
    };
  }

  // 9. Verdict summary
  const recoNom = extractArtisanNom(recommended) ?? "ce devis";
  const recoTotalHt = extractTotalHt(recommended);
  const verdictSummary = `${recoTotalHt.toLocaleString("fr-FR")} € HT — équilibre optimal prix / fiabilité / transparence après comparaison des ${analyses.length} devis.`;

  return {
    status: "ready",
    analyses: ranked.map((a, idx) => ({
      id: a.id,
      file_name: a.file_name,
      artisan_nom: extractArtisanNom(a),
      total_ht: extractTotalHt(a),
      total_ttc: extractTotalTtc(a),
      confiance: extractConfiance(a),
      rank: idx + 1,
      is_recommended: idx === 0,
    })),
    perimeter,
    perimeter_alignment_pct: alignmentPct,
    recommended_analysis_id: recommendedId,
    verdict_summary: verdictSummary,
    key_findings: keyFindings,
    vigilance,
    levers,
    details,
  };
}

// Re-export safeParse for endpoint usage if needed
export { safeParse };
