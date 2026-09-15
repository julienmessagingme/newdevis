import { describe, it, expect } from "vitest";
import {
  computeServerSurcout,
  tarifMainDoeuvreFaceAFourniture,
  hasIncomparableUnit,
  hasSurfaceUnitMismatch,
  RATIO_RAPPROCHEMENT_INVRAISEMBLABLE,
} from "./surcoutServeur";

/** Groupe minimal : un tarif catalogue unitaire, une ligne de devis. */
const groupe = (o: Partial<Record<string, any>> = {}) => ({
  job_type_label: "Pose carrelage sol",
  main_unit: "m2",
  main_quantity: 10,
  devis_total_ht: 1000,
  devis_lines: [{ description: "Pose carrelage sol", amount_ht: 1000, quantity: 10, unit: "m2" }],
  prices: [{ label: "Carrelage sol (fourni+posé)", unit: "m2", price_max_unit_ht: 50, fixed_max_ht: 0 }],
  ...o,
});

describe("computeServerSurcout — le montant et son détail", () => {
  it("chiffre l'écart au plafond marché", () => {
    // 1 000 € facturés, plafond 10 × 50 = 500 € → 500 € d'écart.
    const r = computeServerSurcout([groupe()], 5000);
    expect(r.max).toBe(500);
    expect(r.postes).toHaveLength(1);
    expect(r.postes[0].label).toBe("Pose carrelage sol");
  });

  it("🔴 n'applique AUCUN coefficient : min === max === somme brute", () => {
    // C'est le cœur du correctif du 2026-09-15. Avant, min valait 350 (×0,7)
    // et max 650 (×1,3) — deux nombres qu'aucune ligne du devis ne portait.
    const r = computeServerSurcout([groupe()], 5000);
    expect(r.min).toBe(r.max);
    expect(r.max).toBe(Math.round(r.brut));
  });

  it("🔴 le montant affiché est EXACTEMENT la somme du détail", () => {
    const r = computeServerSurcout(
      [
        groupe(),
        groupe({ job_type_label: "Peinture murs", devis_total_ht: 800, main_quantity: 10 }),
      ],
      9000,
    );
    expect(r.postes.reduce((s, p) => s + p.ecart, 0)).toBe(r.max);
  });

  it("ne chiffre rien quand le devis est sous le plafond marché", () => {
    const r = computeServerSurcout([groupe({ devis_total_ht: 400 })], 5000);
    expect(r.max).toBe(0);
    expect(r.postes).toHaveLength(0);
  });

  it("classe les postes du plus lourd au plus léger", () => {
    const r = computeServerSurcout(
      [
        groupe({ job_type_label: "Petit", devis_total_ht: 600 }),
        groupe({ job_type_label: "Gros", devis_total_ht: 2000 }),
      ],
      9000,
    );
    expect(r.postes.map((p) => p.label)).toEqual(["Gros", "Petit"]);
  });
});

describe("garde du ratio invraisemblable", () => {
  it(`retire un poste au-delà de ×${RATIO_RAPPROCHEMENT_INVRAISEMBLABLE} le plafond marché`, () => {
    // Cas réel : micro-station 10 759 € opposée à « Reprise tuyauterie » au
    // point (plafond 110 €) — ×97,8.
    const r = computeServerSurcout(
      [
        groupe({
          job_type_label: "Reprise tuyauterie / soudure",
          main_unit: "m2",
          main_quantity: 1,
          devis_total_ht: 10759,
          prices: [{ label: "Reprise tuyauterie / soudure", unit: "m2", price_max_unit_ht: 110, fixed_max_ht: 0 }],
        }),
      ],
      13269,
    );
    expect(r.max).toBe(0);
    expect(r.ecartes[0].motif).toBe("rapprochement invraisemblable");
    expect(r.ecartes[0].ecart).toBeGreaterThan(10000);
  });

  it("laisse passer un écart important mais crédible", () => {
    // ×3 : au-dessus du marché, mais dans la zone dense de la distribution —
    // c'est une vraie surfacturation, pas un faux rapprochement.
    const r = computeServerSurcout([groupe({ devis_total_ht: 1500 })], 9000);
    expect(r.max).toBe(1000);
    expect(r.ecartes).toHaveLength(0);
  });
});

describe("garde « un poste ne pèse pas plus que le devis »", () => {
  it("retire un groupe dont le montant dépasse le total HT", () => {
    const r = computeServerSurcout([groupe({ devis_total_ht: 4000 })], 2000);
    expect(r.max).toBe(0);
    expect(r.ecartes[0].motif).toBe("montant du poste supérieur au total du devis");
  });

  it("⚠️ tolère le devis d'UNE seule prestation (groupe = total)", () => {
    // Sans la tolérance de 2 %, tout devis mono-prestation perdrait son
    // chiffrage — et les arrondis d'extraction suffisent à faire dépasser.
    const r = computeServerSurcout([groupe({ devis_total_ht: 1000 })], 1000);
    expect(r.max).toBe(500);
  });

  it("reste inactive quand le total HT est inconnu", () => {
    const r = computeServerSurcout([groupe({ devis_total_ht: 4000 })], null);
    expect(r.max).toBeGreaterThan(0);
  });
});

describe("tarifMainDoeuvreFaceAFourniture", () => {
  it("reconnaît un tarif catalogue de main-d'œuvre seule", () => {
    expect(tarifMainDoeuvreFaceAFourniture(groupe({
      job_type_label: "Fenêtre",
      prices: [{ label: "Menuisier (taux horaire)", unit: "h", price_max_unit_ht: 120 }],
    }))).toBe(true);
    expect(tarifMainDoeuvreFaceAFourniture(groupe({
      prices: [{ label: "Pose store banne (MO)", unit: "u", price_max_unit_ht: 200 }],
    }))).toBe(true);
  });

  it("laisse comparer quand la LIGNE DU DEVIS dit elle-même « hors fourniture »", () => {
    // ⚠️ Ce test renseignait `job_type_label` — donc NOTRE étiquette — alors
    // qu'il prétend vérifier ce que dit le devis. Il encodait ainsi le bug du
    // 15/09 et l'aurait protégé. La mention doit être dans la ligne.
    expect(tarifMainDoeuvreFaceAFourniture(groupe({
      devis_lines: [{ description: "Pose carrelage hors fourniture", amount_ht: 400, quantity: 10, unit: "m2" }],
      prices: [{ label: "Pose carrelage sol (hors fourniture)", unit: "m2", price_max_unit_ht: 40 }],
    }))).toBe(false);
  });

  it("ne se déclenche pas sur un tarif fourni+posé", () => {
    expect(tarifMainDoeuvreFaceAFourniture(groupe())).toBe(false);
  });

  it("🔴 NOTRE étiquette catalogue n'entre pas dans le test (bug du 15/09)", () => {
    // La première version concaténait `job_type_label` au texte du devis. Notre
    // libellé portant lui-même « (hors fourniture) », la garde se lisait
    // elle-même et se désarmait. Cas réel : 4 radiateurs du devis Mélier.
    expect(tarifMainDoeuvreFaceAFourniture(groupe({
      job_type_label: "Pose radiateur électrique à inertie (hors fourniture)",
      devis_lines: [{ description: "Fourniture et pose d'un radiateur à inertie MOZART 1250 W", amount_ht: 500, quantity: 1, unit: "u" }],
      prices: [{ label: "Pose radiateur électrique à inertie (hors fourniture)", unit: "u", price_max_unit_ht: 120 }],
    }))).toBe(true);
  });

  it("⚠️ mais une ligne qui dit « non fournie » reste comparable", () => {
    // Trois lignes réelles de carrelage disent « fournie colle et joint
    // (carrelage NON fournie) » : le tarif de pose seule EST le bon comparatif.
    expect(tarifMainDoeuvreFaceAFourniture(groupe({
      job_type_label: "Pose carrelage sol (hors fourniture)",
      devis_lines: [{ description: "Pose carrelage, fournie colle et joint (carrelage non fournie)", amount_ht: 780, quantity: 6, unit: "m2" }],
      prices: [{ label: "Pose carrelage sol (hors fourniture)", unit: "m2", price_max_unit_ht: 65 }],
    }))).toBe(false);
  });

  it("retire le chiffrage d'un tel groupe", () => {
    const r = computeServerSurcout([groupe({
      job_type_label: "Fenêtre",
      main_unit: "m2",
      main_quantity: 1,
      devis_total_ht: 2892,
      prices: [{ label: "Menuisier (taux horaire)", unit: "m2", price_max_unit_ht: 800, fixed_max_ht: 0 }],
    })], 20000);
    expect(r.max).toBe(0);
    expect(r.ecartes[0].motif).toBe("tarif de main-d'œuvre face à une ligne fournie");
  });
});

describe("gardes d'unité héritées (anti-régression)", () => {
  it("hasIncomparableUnit — tarif au m² face à une ligne sans surface", () => {
    expect(hasIncomparableUnit(groupe({ main_unit: "U", main_quantity: 1 }))).toBe(true);
    expect(hasIncomparableUnit(groupe())).toBe(false);
  });

  it("hasSurfaceUnitMismatch — poste surfacique facturé au forfait", () => {
    expect(hasSurfaceUnitMismatch(groupe({
      job_type_label: "Dépose cloisons",
      main_unit: "U",
      devis_lines: [{ description: "Dépose totale des cloisons", amount_ht: 8950, quantity: 1, unit: "U" }],
    }))).toBe(true);
  });

  it("hasSurfaceUnitMismatch — un équipement vendu à l'unité n'est pas un mismatch", () => {
    expect(hasSurfaceUnitMismatch(groupe({
      job_type_label: "Climatisation split",
      main_unit: "U",
      devis_lines: [{ description: "Climatisation mono-split", amount_ht: 2000, quantity: 1, unit: "U" }],
    }))).toBe(false);
  });
});
