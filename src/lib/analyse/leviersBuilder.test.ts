/**
 * Tests Phase 4 — leviers hiérarchisés + verdict tranché 1 ligne.
 * Cas d'acceptance : docs/refonte/BUGS-A-CORRIGER.md § "Cas test acceptance Phase 4".
 */

import { describe, it, expect } from "vitest";
import {
  buildLeviers,
  buildVerdictLigne,
  devisAgeMonths,
  rienNestComparable,
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

// 2026-08-30 (retour Johan, devis ALES sdb) — le levier annonçait « 7 405 à
// 13 751 € » sur un devis de 22 150 € en ne citant qu'un poste à 887 €.
describe("buildLeviers — on ne chiffre que ce qu'on peut nommer", () => {
  const alesSignals: LevierSignals = {
    ...base,
    verdict_decisionnel: "signer_avec_negociation",
    total_ht: 22_150,
    surcout: { min: 7_405, max: 13_751 }, // agrégat serveur, non attribuable
    anomalies_postes: ["Traitement charpente (curatif)"],
    surcout_nomme: 887,
  };

  it("le montant annoncé est celui des postes nommés, pas l'agrégat serveur", () => {
    const l = buildLeviers(alesSignals).find((x) => x.type === "surcout_postes");
    expect(l).toBeDefined();
    expect(l!.detail).toMatch(/887/);
    expect(l!.detail).not.toMatch(/7\s?405|13\s?751/);
  });

  it("la ligne de verdict ne reprend pas non plus l'agrégat", () => {
    const leviers = buildLeviers(alesSignals);
    const vl = buildVerdictLigne(alesSignals, leviers);
    expect(vl.resume).not.toMatch(/7\s?405|13\s?751/);
    expect(vl.motif).toMatch(/887/);
  });

  // 2026-09-05 — CE TEST A CHANGÉ DE SENS, volontairement.
  // Version du 2026-08-30 : sans poste nommé, le levier sortait quand même
  // avec le libellé générique « Négociez les postes au-dessus du marché » et
  // la fourchette agrégée. Le retour Johan sur le devis EC'eau a montré que
  // c'est intenable : « j'annonce 1 000 € de négociation mais on ne sait pas
  // où les trouver ». La règle énoncée à l'époque (« sans poste nommé, pas de
  // chiffre du tout ») n'était donc pas appliquée par le code — elle l'est
  // maintenant, et le levier disparaît entièrement.
  it("agrégat élevé mais AUCUN poste nommé → aucun levier surcoût du tout", () => {
    const l = buildLeviers({
      ...alesSignals,
      anomalies_postes: [],
      surcout_nomme: null,
    }).find((x) => x.type === "surcout_postes");
    expect(l).toBeUndefined();
  });

  it("écart nommé négligeable (< 1,5 % du devis) → aucun levier surcoût", () => {
    const l = buildLeviers({
      ...alesSignals,
      surcout_nomme: 120,
    }).find((x) => x.type === "surcout_postes");
    expect(l).toBeUndefined();
  });
});

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

  it("jamais de liste vide — devis irréprochable : retenue de garantie puis références", () => {
    // base = 10 000 € HT : depuis le 2026-08-27, la retenue de garantie 5 %
    // (conseil actionnable) passe devant le fallback « références ».
    const leviers = buildLeviers(base);
    expect(leviers.length).toBeGreaterThanOrEqual(2);
    expect(leviers[0].type).toBe("retenue_garantie");
    expect(leviers.some((l) => l.titre.includes("références"))).toBe(true);
  });

  it("petit devis irréprochable → fallback références seul (inchangé)", () => {
    const leviers = buildLeviers({ ...base, total_ht: 2_000 });
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

// ── Règle 2026-08-27 (cas ZANNOU v2) : couverture marché partielle ──────────
describe("buildLeviers — couverture marché partielle", () => {
  it("couverture 45% + 7 200€ non comparés → levier second_avis (sécurisation)", () => {
    const leviers = buildLeviers({ ...base, comparable_coverage_pct: 45, montant_non_compare: 7200 });
    const sa = leviers.find((l) => l.type === "second_avis");
    expect(sa).toBeDefined();
    expect(sa!.objectif).toBe("securiser");
    expect(sa!.titre).toMatch(/7.200/); // séparateur = espace insécable fr-FR
    // 2026-08-29 (retour Johan) — le taux de couverture n'est plus montré à
    // l'utilisateur : il se lisait comme un aveu de faiblesse de l'analyse.
    // On explique la NATURE des prestations non comparables, sans ratio.
    expect(sa!.detail).toMatch(/sur-mesure|réglementaires/);
    expect(sa!.detail).not.toMatch(/%/);
  });

  it("couverture 90% → pas de levier second_avis (pas de bruit)", () => {
    const leviers = buildLeviers({ ...base, comparable_coverage_pct: 90, montant_non_compare: 500 });
    expect(leviers.some((l) => l.type === "second_avis")).toBe(false);
  });

  it("verdict signer + couverture 45% → motif QUALIFIÉ (jamais « conforme » global)", () => {
    const s: LevierSignals = { ...base, comparable_coverage_pct: 45, montant_non_compare: 7200 };
    const v = buildVerdictLigne(s, buildLeviers(s));
    expect(v.motif).toMatch(/prestations standards sont au bon prix/);
    expect(v.motif).not.toMatch(/%/);
    expect(v.motif).toContain("second devis");
    expect(v.motif).not.toBe("prix dans les fourchettes du marché et conditions habituelles");
  });

  it("verdict signer + couverture pleine → motif standard inchangé", () => {
    const s: LevierSignals = { ...base, comparable_coverage_pct: 95, montant_non_compare: 200 };
    const v = buildVerdictLigne(s, buildLeviers(s));
    expect(v.motif).toBe("prix dans les fourchettes du marché et conditions habituelles");
  });
});

// ── Conseils à valeur ajoutée 2026-08-27 (demande Johan) ───────────────────
describe("buildLeviers — dommages-ouvrage et retenue de garantie", () => {
  it("gros œuvre → conseil dommages-ouvrage AVANT le chantier (obligation légale)", () => {
    const leviers = buildLeviers({ ...base, total_ht: 60_000, travaux_gros_oeuvre: true });
    const doL = leviers.find((l) => l.type === "dommages_ouvrage");
    expect(doL).toBeDefined();
    expect(doL!.objectif).toBe("securiser");
    expect(doL!.titre).toMatch(/AVANT le début du chantier/);
    // 2026-08-30 — on explique le mécanisme en clair plutôt que d'invoquer
    // « la garantie décennale », qui ne dit rien à un particulier.
    expect(doL!.detail).toMatch(/dans les 10 ans/);
    expect(doL!.detail).toMatch(/sans attendre qu'un tribunal/);
  });

  // 2026-08-29 (retour Johan, devis 25030) — le devis facturait déjà une DO
  // 4 176 € et on conseillait quand même d'en souscrire une, avec un bouton
  // « recevoir une proposition » par-dessus.
  it("DO déjà facturée au devis → on ne conseille PAS d'en souscrire une, on réclame l'attestation", () => {
    const leviers = buildLeviers({
      ...base,
      total_ht: 219_583,
      travaux_gros_oeuvre: true,
      assurance_do_montant: 4_176,
    });
    expect(leviers.some((l) => l.type === "dommages_ouvrage")).toBe(false);
    const v = leviers.find((l) => l.type === "dommages_ouvrage_verification");
    expect(v).toBeDefined();
    expect(v!.titre).toMatch(/attestation/i);
    expect(v!.detail).toMatch(/4\s?176/);
    // 1,9 % du montant → situé dans les usages, pas signalé comme cher
    expect(v!.detail).toMatch(/1,9 %/);
    expect(v!.detail).toMatch(/dans les usages/);
    expect(v!.detail).not.toMatch(/2 à 5 %/);
  });

  it("DO facturée nettement au-dessus des usages → le levier le signale", () => {
    const leviers = buildLeviers({
      ...base,
      total_ht: 100_000,
      travaux_gros_oeuvre: true,
      assurance_do_montant: 6_000, // 6 %
    });
    const v = leviers.find((l) => l.type === "dommages_ouvrage_verification");
    expect(v!.detail).toMatch(/au-dessus des 1 à 3 %/);
  });

  // 2026-08-30 (retour Johan, devis ALES sdb — 3 conseils, 3 erreurs)
  it("solde de 5 % déjà prévu en fin de travaux → on le transforme, on ne le redemande pas", () => {
    const leviers = buildLeviers({ ...base, total_ht: 22_150, solde_final_pct: 5 });
    const rg = leviers.find((l) => l.type === "retenue_garantie");
    expect(rg).toBeDefined();
    expect(rg!.titre).toMatch(/Transformez les 5 %/);
    expect(rg!.titre).not.toMatch(/Demandez une retenue/);
    expect(rg!.detail).toMatch(/prévoit déjà 5 %/);
    // La nuance juridique doit rester dite : solde ≠ retenue.
    expect(rg!.detail).toMatch(/un an après la réception/);
  });

  it("aucune échéance finale connue → conseil de retenue classique (inchangé)", () => {
    const leviers = buildLeviers({ ...base, total_ht: 22_150 });
    const rg = leviers.find((l) => l.type === "retenue_garantie");
    expect(rg!.titre).toMatch(/Demandez une retenue de garantie de 5 %/);
  });

  // 2026-08-30 (retour Johan) — « le client ne doit pas se demander pourquoi ».
  it("le conseil DO cite la ligne du devis et déroule la chaîne solidité → obligation", () => {
    const leviers = buildLeviers({
      ...base,
      total_ht: 22_150,
      travaux_gros_oeuvre: true,
      gros_oeuvre_motif: "Dépose de mur porteur + évacuation de gravats",
    });
    const doL = leviers.find((l) => l.type === "dommages_ouvrage");
    expect(doL!.detail).toMatch(/Dépose de mur porteur/);
    expect(doL!.detail).toMatch(/solidité de l'ouvrage/);
    expect(doL!.detail).toMatch(/L242-1/);
  });

  it("pas de gros œuvre (peinture seule) → aucun conseil dommages-ouvrage", () => {
    const leviers = buildLeviers({ ...base, total_ht: 60_000 });
    expect(leviers.some((l) => l.type === "dommages_ouvrage")).toBe(false);
  });

  it("devis ≥ 10 000 € sans retenue prévue → conseil retenue 5 % chiffrée", () => {
    const leviers = buildLeviers({ ...base, total_ht: 40_000 });
    const rg = leviers.find((l) => l.type === "retenue_garantie");
    expect(rg).toBeDefined();
    expect(rg!.objectif).toBe("securiser");
    expect(rg!.titre).toMatch(/2.000/); // 5 % de 40 000 €
    expect(rg!.detail).toMatch(/levée des réserves|réserve/i);
  });

  it("retenue déjà prévue au devis → pas de doublon", () => {
    const leviers = buildLeviers({ ...base, total_ht: 40_000, retenue_garantie_prevue: true });
    expect(leviers.some((l) => l.type === "retenue_garantie")).toBe(false);
  });

  it("petit devis (< 10 000 €) → pas de retenue de garantie (bruit)", () => {
    const leviers = buildLeviers({ ...base, total_ht: 3_000 });
    expect(leviers.some((l) => l.type === "retenue_garantie")).toBe(false);
  });

  it("ces conseils restent des SÉCURISATIONS — aucune marge promise", () => {
    const s: LevierSignals = { ...base, total_ht: 60_000, travaux_gros_oeuvre: true };
    const v = buildVerdictLigne(s, buildLeviers(s));
    expect(v.marge).toBeNull();
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

/**
 * 2026-09-04 (cas DEV-202608-1) — on n'affirme pas une conformité tarifaire
 * quand on n'a comparé rien du tout. Le devis analysé facturait « 22 jours de
 * Constructeur Bois » ; la seule ligne rapprochée ressortait avec une
 * fourchette 0–0 € et le verdict affiché était « dans la norme ».
 */
describe("rienNestComparable — on ne dit pas 'dans la norme' sans référence", () => {
  it("couverture 0 % → vrai", () => {
    expect(rienNestComparable({ comparable_coverage_pct: 0 })).toBe(true);
  });

  it("couverture 4 % → vrai (sous le seuil)", () => {
    expect(rienNestComparable({ comparable_coverage_pct: 4 })).toBe(true);
  });

  it("couverture 5 % → faux (le seuil est exclusif)", () => {
    expect(rienNestComparable({ comparable_coverage_pct: 5 })).toBe(false);
  });

  it("couverture non mesurée → faux : on ne déclenche que sur une mesure", () => {
    expect(rienNestComparable({ comparable_coverage_pct: null })).toBe(false);
    expect(rienNestComparable({ comparable_coverage_pct: undefined })).toBe(false);
  });

  it("verdict_ligne dit l'absence de référence au lieu d'affirmer un prix juste", () => {
    const s: LevierSignals = {
      ...base,
      total_ht: 2_200,
      work_type: "Travaux de rénovation",
      comparable_coverage_pct: 0,
      montant_non_compare: 2_200,
    };
    const v = buildVerdictLigne(s, buildLeviers(s));
    expect(v.motif).toMatch(/aucune|pas en mesure/i);
    expect(v.resume).not.toMatch(/dans la norme|bon prix|prix juste/i);
    // Le montant du devis reste dit — c'est un fait, pas une appréciation.
    // (fmtEuros utilise une espace fine insécable U+202F)
    expect(v.resume).toMatch(/2\s?200\s?€ HT/);
  });

  it("aucune marge de négociation annoncée quand rien n'est comparable", () => {
    const s: LevierSignals = {
      ...base,
      total_ht: 2_200,
      comparable_coverage_pct: 0,
      montant_non_compare: 2_200,
    };
    const v = buildVerdictLigne(s, buildLeviers(s));
    expect(v.marge).toBeNull();
  });

  it("le levier second avis devient prioritaire et ne dit plus 'une partie'", () => {
    const s: LevierSignals = {
      ...base,
      total_ht: 600,
      comparable_coverage_pct: 0,
      montant_non_compare: 600,
    };
    const leviers = buildLeviers(s);
    const secondAvis = leviers.find((l) => l.type === "second_avis");
    expect(secondAvis).toBeDefined();
    expect(secondAvis!.niveau).toBe("important");
    expect(secondAvis!.detail).not.toMatch(/une partie de ce devis/i);
    // Sous 1 000 € le levier de couverture partielle ne se déclenchait pas :
    // ici il DOIT sortir quand même, l'absence de référence est totale.
    expect(leviers[0].type).toBe("second_avis");
  });

  it("couverture correcte → comportement historique inchangé", () => {
    const s: LevierSignals = { ...base, comparable_coverage_pct: 85, montant_non_compare: 200 };
    const v = buildVerdictLigne(s, buildLeviers(s));
    expect(v.motif).toMatch(/fourchettes du march/i);
    expect(buildLeviers(s).some((l) => l.type === "second_avis")).toBe(false);
  });

  it("une entreprise à risque domine toujours l'absence de référence", () => {
    const s: LevierSignals = {
      ...base,
      comparable_coverage_pct: 0,
      montant_non_compare: 2_200,
      entreprise_risque: "entreprise radiée",
      verdict_decisionnel: "ne_pas_signer",
    };
    const v = buildVerdictLigne(s, buildLeviers(s));
    expect(v.motif).toMatch(/entreprise/i);
  });
});

/**
 * 2026-09-05 (cas EC'eau, retour Johan) — « j'annonce 1 000 € de négociation
 * mais on ne sait pas où les trouver ». Un montant qu'aucun poste ne porte ne
 * doit apparaître NULLE PART : ni en marge, ni en levier, ni dans le motif.
 */
describe("aucun montant sans poste nommé", () => {
  it("surcoût sans aucun poste → ni marge, ni levier surcoût, ni motif chiffré", () => {
    const s: LevierSignals = {
      ...base,
      total_ht: 12_666,
      surcout: { min: 800, max: 1200 },
      anomalies_postes: [],
      surcout_nomme: null,
    };
    const leviers = buildLeviers(s);
    expect(leviers.some((l) => l.type === "surcout_postes")).toBe(false);
    const v = buildVerdictLigne(s, leviers);
    expect(v.marge).toBeNull();
    expect(v.motif).not.toMatch(/800|1 ?200|d'écart/i);
  });

  it("surcoût AVEC postes nommés → levier, marge et motif chiffrés comme avant", () => {
    const s: LevierSignals = {
      ...base,
      total_ht: 12_666,
      surcout: { min: 800, max: 1200 },
      anomalies_postes: ["Climatisation gainable"],
      surcout_nomme: 1000,
    };
    const leviers = buildLeviers(s);
    const levier = leviers.find((l) => l.type === "surcout_postes");
    expect(levier).toBeDefined();
    expect(levier!.titre).toContain("Climatisation gainable");
    const v = buildVerdictLigne(s, leviers);
    expect(v.marge).toMatch(/800/);
    expect(v.motif).toMatch(/Climatisation gainable|dépasse/i);
  });

  it("le motif ne retombe jamais sur un agrégat anonyme", () => {
    const s: LevierSignals = {
      ...base,
      verdict_decisionnel: "signer_avec_negociation",
      total_ht: 40_000,
      surcout: { min: 2000, max: 3000 },
      anomalies_postes: [],
      surcout_nomme: null,
      comparable_coverage_pct: 70,
      montant_non_compare: 500,
    };
    const v = buildVerdictLigne(s, buildLeviers(s));
    expect(v.motif).not.toMatch(/quelques postes dépassent/i);
    expect(v.resume).not.toMatch(/2 ?000|3 ?000/);
  });
});
