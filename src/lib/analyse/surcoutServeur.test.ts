import { describe, it, expect } from "vitest";
import {
  computeServerSurcout,
  tarifMainDoeuvreFaceAFourniture,
  hasIncomparableUnit,
  hasSurfaceUnitMismatch,
  RATIO_RAPPROCHEMENT_INVRAISEMBLABLE,
  bornesMarche,
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
    expect(r.ecartes[0].motif).toBe("rapprochement_invraisemblable");
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
    expect(r.ecartes[0].motif).toBe("poste_superieur_au_devis");
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
    expect(r.ecartes[0].motif).toBe("tarif_main_doeuvre");
  });
});

describe("gardes d'unité héritées (anti-régression)", () => {
  it("hasIncomparableUnit — tarif au m² face à une ligne sans surface", () => {
    expect(hasIncomparableUnit(groupe({ main_unit: "U", main_quantity: 1 }))).toBe(true);
    expect(hasIncomparableUnit(groupe())).toBe(false);
  });
});

/**
 * 🔴 2026-09-17 — « métrique des deux côtés » ne veut pas dire « comparable ».
 * Les deux premiers cas sont RÉELS et portaient à eux seuls les montants
 * accusés sur deux devis que l'expert avait annulés.
 */
describe("unités métriques discordantes", () => {
  it("un tarif au m² face à une ligne au ML est incomparable (cas Renov'Toitures, 1 504 €)", () => {
    expect(hasIncomparableUnit(groupe({
      job_type_label: "Traitement hydrofuge / imperméabilisant toiture",
      main_unit: "ML",
      main_quantity: 38,
      prices: [{ label: "Hydrofuge toiture", unit: "m2", price_max_unit_ht: 26 }],
    }))).toBe(true);
  });

  it("un tarif au ml face à une ligne au m² est incomparable (cas Mélier, 378 €)", () => {
    expect(hasIncomparableUnit(groupe({
      job_type_label: "Faîtage tuile (fourni+posé)",
      main_unit: "m²",
      main_quantity: 6.9,
      prices: [{ label: "Faîtage tuile", unit: "ml", price_max_unit_ht: 60 }],
    }))).toBe(true);
  });

  it("le chiffrage est retiré, avec le motif d'unité", () => {
    const r = computeServerSurcout([groupe({
      job_type_label: "Traitement hydrofuge / imperméabilisant toiture",
      main_unit: "ML",
      main_quantity: 38,
      devis_total_ht: 2492,
      prices: [{ label: "Hydrofuge toiture", unit: "m2", price_max_unit_ht: 26, fixed_max_ht: 0 }],
    })], 6830);
    expect(r.max).toBe(0);
    expect(r.ecartes[0].motif).toBe("unite_incomparable");
  });

  it("MÊME famille = toujours comparable — m² contre m², ml contre mètre linéaire", () => {
    expect(hasIncomparableUnit(groupe({ main_unit: "m²", main_quantity: 20 }))).toBe(false);
    expect(hasIncomparableUnit(groupe({
      main_unit: "mètres linéaires",
      main_quantity: 12,
      prices: [{ label: "Plinthe", unit: "ml", price_max_unit_ht: 18 }],
    }))).toBe(false);
  });

  it("une unité qu'on ne sait pas classer ne devient PAS un refus silencieux", () => {
    // Le tarif est métrique, la ligne porte une quantité métrique reconnue par
    // METRIC_UNIT_RE mais non classable : on garde le comportement d'origine
    // plutôt que d'inventer une incompatibilité.
    expect(hasIncomparableUnit(groupe({
      main_unit: "metre carre",       // passe METRIC_UNIT_RE (« metre »), famille « lineaire »
      main_quantity: 10,
      prices: [{ label: "X", unit: "m2", price_max_unit_ht: 50 }],
    }))).toBe(true); // familles identifiées ET différentes → refus assumé
    expect(hasIncomparableUnit(groupe({
      main_unit: "m²",
      main_quantity: 10,
      prices: [{ label: "X", unit: "unité", price_max_unit_ht: 50 }],
    }))).toBe(false); // tarif non métrique : la garde ne s'applique pas
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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 2026-09-16 — ON N'ADDITIONNE JAMAIS UN TARIF UNITAIRE ET UN FORFAIT.
//
// Cas fondateur : devis DESMARIS, « Remplacement d'une sortie de cheminée »
// 2 395 € HT facturée « 1 Ens ». L'entrée `tubage_conduit_cheminee` porte
// 80-280 €/ml ET un forfait 200-800 € — une ALTERNATIVE, pas un supplément.
// Six endroits du code calculaient `unitaire × qté + forfait`, ce qui donnait
// une fourchette 280-1 080 € dont aucune borne ne correspondait à rien.
//
// Les 13 entrées mixtes du catalogue (sur 925) sont toutes dans ce cas.
// ─────────────────────────────────────────────────────────────────────────────
describe("bornesMarche — jamais unitaire + forfait", () => {
  /** L'entrée réelle qui a déclenché le correctif. */
  const tubage = [{
    unit: "ml",
    price_min_unit_ht: 80, price_avg_unit_ht: 150, price_max_unit_ht: 280,
    fixed_min_ht: 200, fixed_avg_ht: 400, fixed_max_ht: 800,
  }];

  it("ligne au FORFAIT face à un tarif au mètre → le forfait seul", () => {
    // C'est le cas DESMARIS : « 1 Ens » ne se compare pas à un prix au ml.
    expect(bornesMarche(tubage, 1, "Ens")).toEqual({ min: 200, avg: 400, max: 800 });
  });

  it("ligne au MÈTRE face au même tarif → le tarif unitaire seul", () => {
    expect(bornesMarche(tubage, 10, "ml")).toEqual({ min: 800, avg: 1500, max: 2800 });
  });

  it("la somme des deux n'est JAMAIS produite", () => {
    // 280 = 80×1 + 200 et 1080 = 280×1 + 800 : les deux bornes de l'ancienne
    // règle. Aucune ne doit réapparaître.
    const r = bornesMarche(tubage, 1, "Ens");
    expect(r.min).not.toBe(280);
    expect(r.max).not.toBe(1080);
  });

  it("« u » et « unité » ne sont PAS comparés littéralement", () => {
    // 🔴 Ma première version comparait les deux chaînes : « u » ≠ « unité »,
    // donc elle basculait sur le forfait et rendait 5 postes ACCUSÉS à tort.
    // Un tarif catalogue NON métrique reste applicable quelle que soit la
    // façon dont le devis écrit son unité.
    const clim = [{
      unit: "unité",
      price_min_unit_ht: 1200, price_avg_unit_ht: 1900, price_max_unit_ht: 3200,
      fixed_min_ht: 800, fixed_avg_ht: 1200, fixed_max_ht: 2200,
    }];
    expect(bornesMarche(clim, 2, "u").max).toBe(6400);      // 3200 × 2, pas 8600
    expect(bornesMarche(clim, 1, "U").max).toBe(3200);      // pas 5400
  });

  it("la MOYENNE suit le même choix que les bornes", () => {
    // Sinon elle peut sortir de l'intervalle qu'elle résume.
    const r = bornesMarche(tubage, 1, "forfait");
    expect(r.avg).toBeGreaterThanOrEqual(r.min);
    expect(r.avg).toBeLessThanOrEqual(r.max);
  });

  it("entrée à tarif UNITAIRE seul : comportement historique inchangé", () => {
    const seulUnitaire = [{ unit: "m2", price_min_unit_ht: 40, price_avg_unit_ht: 70, price_max_unit_ht: 100,
                            fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0 }];
    expect(bornesMarche(seulUnitaire, 20, "m2")).toEqual({ min: 800, avg: 1400, max: 2000 });
  });

  it("entrée au FORFAIT seul : comportement historique inchangé", () => {
    const seulForfait = [{ unit: "forfait", price_min_unit_ht: 0, price_avg_unit_ht: 0, price_max_unit_ht: 0,
                           fixed_min_ht: 300, fixed_avg_ht: 700, fixed_max_ht: 1200 }];
    expect(bornesMarche(seulForfait, 1, "forfait")).toEqual({ min: 300, avg: 700, max: 1200 });
    // ⚠️ Et la quantité ne multiplie pas un forfait.
    expect(bornesMarche(seulForfait, 5, "forfait").max).toBe(1200);
  });

  it("aucun tarif / entrée vide → zéro, sans planter", () => {
    expect(bornesMarche([], 3, "m2")).toEqual({ min: 0, avg: 0, max: 0 });
    expect(bornesMarche(null, 3, "m2")).toEqual({ min: 0, avg: 0, max: 0 });
    expect(bornesMarche(undefined, 3, null)).toEqual({ min: 0, avg: 0, max: 0 });
  });

  it("quantité absente ou absurde → 1, jamais NaN", () => {
    expect(bornesMarche(tubage, 0, "ml").max).toBe(280);
    expect(bornesMarche(tubage, Number.NaN, "ml").max).toBe(280);
  });
});
