/**
 * Tests Phase 4 — leviers hiérarchisés + verdict tranché 1 ligne.
 * Cas d'acceptance : docs/refonte/BUGS-A-CORRIGER.md § "Cas test acceptance Phase 4".
 */

import { describe, it, expect } from "vitest";
import {
  buildLeviers,
  buildVerdictLigne,
  devisAgeMonths,
  type LevierSignals,
} from "./leviersBuilder";

const base: LevierSignals = {
  verdict_decisionnel: "signer",
  total_ht: 10_000,
  work_type: "Rénovation",
  surcout: { min: 0, max: 0 },
  anomalies_postes: [],
  quantites_manquantes: false,
  clauses_litigieuses: [],
  acompte_cumule_pct: 30,
  paiement_especes_seul: false,
  entreprise_risque: null,
  assurance_absente: false,
  date_devis: null,
  date_reference: "2026-08-15",
};

describe("buildLeviers — hiérarchie et cap à 3", () => {
  it("cas Toiture Boxes (devis propre) → 3 leviers max, uniquement bonus", () => {
    const leviers = buildLeviers({ ...base, total_ht: 8841, assurance_absente: true });
    expect(leviers.length).toBeLessThanOrEqual(3);
    expect(leviers.every((l) => l.niveau === "bonus")).toBe(true);
    expect(leviers.some((l) => l.titre.includes("assurance"))).toBe(true);
    expect(leviers.some((l) => l.titre.includes("références"))).toBe(true);
  });

  it("cas Travaux Maçonnerie (quantités manquantes + acompte 50%) → quantités en premier", () => {
    const leviers = buildLeviers({
      ...base,
      verdict_decisionnel: "signer_avec_negociation",
      total_ht: 35_570,
      quantites_manquantes: true,
      acompte_cumule_pct: 50,
    });
    expect(leviers[0].niveau).toBe("puissant");
    expect(leviers[0].titre).toContain("quantités précises");
    expect(leviers.some((l) => l.titre.includes("acompte"))).toBe(true);
  });

  it("cas Mélier Cognac (devis 2024 relu en 2026, rien d'autre) → révision tarifaire en tête", () => {
    const leviers = buildLeviers({ ...base, total_ht: 77_568, date_devis: "2024-06-15" });
    expect(leviers[0].titre).toContain("révision tarifaire");
    expect(leviers[0].titre).toContain("2024");
  });

  it("cas DUBOIS (clause abusive) → retrait de clause en levier n°1 avec citation", () => {
    const leviers = buildLeviers({
      ...base,
      verdict_decisionnel: "ne_pas_signer",
      total_ht: 372,
      clauses_litigieuses: [
        { type: "devis_facture_si_non_signe", gravite: "rouge", citation: "Sans retour sous 8 jours ce devis vaudra facture" },
      ],
    });
    expect(leviers[0].niveau).toBe("puissant");
    expect(leviers[0].titre).toContain("clause abusive");
    expect(leviers[0].detail).toContain("Sans retour sous 8 jours");
  });

  it("entreprise à risque prime sur tout", () => {
    const leviers = buildLeviers({
      ...base,
      verdict_decisionnel: "ne_pas_signer",
      entreprise_risque: "entreprise radiée du registre",
      quantites_manquantes: true,
      acompte_cumule_pct: 70,
    });
    expect(leviers[0].titre).toContain("situation de l'entreprise");
    expect(leviers).toHaveLength(3);
  });

  it("jamais plus de 3 leviers même avec tous les signaux", () => {
    const leviers = buildLeviers({
      ...base,
      quantites_manquantes: true,
      acompte_cumule_pct: 60,
      paiement_especes_seul: true,
      assurance_absente: true,
      date_devis: "2024-01-01",
      surcout: { min: 500, max: 900 },
      anomalies_postes: ["Carrelage", "Peinture"],
      clauses_litigieuses: [{ type: "pas_de_retractation", gravite: "rouge", citation: "aucune rétractation possible" }],
    });
    expect(leviers).toHaveLength(3);
    expect(leviers.every((l) => l.niveau === "puissant")).toBe(true);
  });

  it("jamais de liste vide — fallback références sur devis irréprochable", () => {
    const leviers = buildLeviers(base);
    expect(leviers.length).toBeGreaterThanOrEqual(1);
    expect(leviers[0].titre).toContain("références");
  });

  it("surcoût matériel nomme les postes", () => {
    const leviers = buildLeviers({
      ...base,
      verdict_decisionnel: "signer_avec_negociation",
      surcout: { min: 319, max: 593 },
      anomalies_postes: ["Cloison plâtre BA13", "Pose cuisine"],
    });
    const l = leviers.find((x) => x.titre.includes("au-dessus du marché"));
    expect(l).toBeDefined();
    expect(l!.titre).toContain("Cloison plâtre BA13");
    expect(l!.detail).toContain("319");
    expect(l!.detail).toContain("593");
  });

  // ── Règle 2026-08-20 (validée Johan) : comptes opaques + acompte > 30 % ───
  it("comptes opaques + acompte 40% → levier ESCALADÉ puissant nommant la combinaison", () => {
    const leviers = buildLeviers({
      ...base,
      verdict_decisionnel: "signer_avec_negociation",
      acompte_cumule_pct: 40,
      comptes_opaques: true,
      comptes_depuis: "2017",
    });
    expect(leviers[0].niveau).toBe("puissant");
    expect(leviers[0].titre).toContain("comptes non publiés");
    expect(leviers[0].detail).toContain("Combinaison à risque");
    expect(leviers[0].detail).toContain("2017");
    expect(leviers[0].detail).toContain("30 % maximum");
  });

  it("acompte 40% SANS comptes opaques → levier reste important (pas d'escalade)", () => {
    const leviers = buildLeviers({ ...base, acompte_cumule_pct: 40 });
    const acompte = leviers.find((l) => l.titre.includes("acompte"));
    expect(acompte?.niveau).toBe("important");
    expect(acompte?.titre).not.toContain("comptes");
  });

  it("comptes opaques SEULS (acompte 30%) → aucun levier comptes (pas de bruit)", () => {
    const leviers = buildLeviers({ ...base, comptes_opaques: true, comptes_depuis: "2017" });
    expect(leviers.some((l) => l.titre.toLowerCase().includes("comptes"))).toBe(false);
  });

  it("comptes opaques + acompte 70% → détail du levier puissant enrichi", () => {
    const leviers = buildLeviers({
      ...base,
      verdict_decisionnel: "ne_pas_signer",
      acompte_cumule_pct: 70,
      comptes_opaques: true,
    });
    const acompte = leviers.find((l) => l.titre.includes("acompte"));
    expect(acompte?.niveau).toBe("puissant");
    expect(acompte?.detail).toContain("ne publie pas ses comptes");
  });

  it("verdict — motif nomme la combinaison acompte + comptes opaques", () => {
    const s: LevierSignals = {
      ...base,
      verdict_decisionnel: "signer_avec_negociation",
      acompte_cumule_pct: 40,
      comptes_opaques: true,
    };
    const v = buildVerdictLigne(s, buildLeviers(s));
    expect(v.motif).toContain("ne publie pas ses comptes");
    expect(v.motif).toContain("40 %");
  });

  it("micro-surcoût (180€ sur 48 000€) → PAS de levier prix (bruit)", () => {
    const leviers = buildLeviers({ ...base, total_ht: 48_000, surcout: { min: 100, max: 180 } });
    expect(leviers.some((l) => l.titre.includes("marché"))).toBe(false);
  });
});

describe("buildVerdictLigne — le motif est TOUJOURS nommé", () => {
  it("verdict rouge acompte (cas Grosbois) → le motif dit l'acompte, pas 'risque élevé'", () => {
    const s: LevierSignals = { ...base, verdict_decisionnel: "ne_pas_signer", total_ht: 21_362, acompte_cumule_pct: 70 };
    const v = buildVerdictLigne(s, buildLeviers(s));
    expect(v.motif).toContain("70 %");
    expect(v.motif).toContain("30 %");
    expect(v.resume).toContain("21");
    expect(v.motif.toLowerCase()).not.toContain("risque élevé");
  });

  it("devis propre (que du fallback sécurisation) → motif positif, marge NULL (pas de promesse creuse)", () => {
    const leviers = buildLeviers(base);
    expect(leviers.every((l) => l.objectif === "securiser")).toBe(true);
    const v = buildVerdictLigne(base, leviers);
    expect(v.motif).toContain("fourchettes du marché");
    expect(v.marge).toBeNull();
  });

  it("signer + levier révision tarifaire → marge 3-5 % portée par le levier", () => {
    const s: LevierSignals = { ...base, date_devis: "2024-06-15" };
    const v = buildVerdictLigne(s, buildLeviers(s));
    expect(v.marge).toContain("révision tarifaire");
  });

  it("le fallback références est étiqueté sécurisation, pas négociation", () => {
    const leviers = buildLeviers(base);
    const refs = leviers.find((l) => l.titre.includes("références"));
    expect(refs?.objectif).toBe("securiser");
  });

  it("surcoût matériel → marge chiffrée en euros", () => {
    const s: LevierSignals = {
      ...base,
      verdict_decisionnel: "signer_avec_negociation",
      surcout: { min: 319, max: 593 },
      anomalies_postes: ["Cloison"],
    };
    const v = buildVerdictLigne(s, buildLeviers(s));
    expect(v.marge).toContain("319");
    expect(v.marge).toContain("593");
  });

  it("total_ht null → pas de montant fantôme dans le résumé", () => {
    const s: LevierSignals = { ...base, total_ht: null, work_type: null };
    const v = buildVerdictLigne(s, buildLeviers(s));
    expect(v.resume).not.toContain("€");
    expect(v.resume.length).toBeGreaterThan(10);
  });

  it("work_type absent → jamais de 'pour undefined' ni 'ville inconnue'", () => {
    const s: LevierSignals = { ...base, work_type: undefined };
    const v = buildVerdictLigne(s, buildLeviers(s));
    expect(v.resume).not.toMatch(/undefined|inconnu/i);
  });
});

describe("devisAgeMonths", () => {
  it("2024-06 vu de 2026-08 → 26 mois", () => {
    expect(devisAgeMonths("2024-06-15", "2026-08-15")).toBe(26);
  });
  it("date invalide → null", () => {
    expect(devisAgeMonths("pas-une-date", "2026-08-15")).toBeNull();
  });
  it("date future → null", () => {
    expect(devisAgeMonths("2027-01-01", "2026-08-15")).toBeNull();
  });
});
