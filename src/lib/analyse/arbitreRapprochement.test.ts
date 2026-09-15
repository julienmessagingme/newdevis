import { describe, it, expect } from "vitest";
import {
  melangeDeterministe,
  grainePour,
  construirePrompt,
  interpreterChoix,
  contestationMaterielle,
  postesAArbitrer,
  ecartAvecTarif,
  arbitrerRapprochements,
  MAX_POSTES_ARBITRES,
  CONSIGNE_ARBITRE,
} from "./arbitreRapprochement";

const candidat = (job_type: string, label: string) => ({ job_type, label, similarity: 0.8 });

/** Groupe de devis chiffré : 1 000 € facturés, plafond 10 × 50 = 500 €. */
const groupe = (o: Record<string, any> = {}) => ({
  job_type_label: "Pose carrelage sol",
  main_unit: "m2",
  main_quantity: 10,
  devis_total_ht: 1000,
  devis_lines: [{ description: "Pose carrelage sol salle de bain", amount_ht: 1000, quantity: 10, unit: "m2" }],
  prices: [{ job_type: "carrelage_sol_pose", label: "Pose carrelage sol", unit: "m2", price_max_unit_ht: 50, fixed_max_ht: 0 }],
  vectorial: {
    confidence: "high",
    all_candidates: [
      candidat("carrelage_sol_pose", "Pose carrelage sol"),
      candidat("carrelage_fourni_pose", "Carrelage sol (fourni+posé)"),
      candidat("ragreage", "Ragréage sol"),
    ],
  },
  ...o,
});

describe("mélange déterministe", () => {
  it("reproduit le même ordre pour la même graine", () => {
    const a = melangeDeterministe([1, 2, 3, 4, 5], grainePour("x"));
    const b = melangeDeterministe([1, 2, 3, 4, 5], grainePour("x"));
    expect(a).toEqual(b);
  });

  it("🔴 ne rend pas l'ordre d'origine — sinon on mesure un réflexe, pas un jugement", () => {
    // Sans mélange, un modèle répondant « 1 » systématiquement afficherait un
    // accord parfait avec notre top-1 sans avoir rien jugé.
    const ordres = ["a", "b", "c", "d", "e"].map((c) =>
      melangeDeterministe([1, 2, 3, 4, 5], grainePour(c)).join(""),
    );
    expect(ordres.some((o) => o !== "12345")).toBe(true);
  });

  it("conserve tous les éléments", () => {
    const m = melangeDeterministe([1, 2, 3, 4, 5], grainePour("zz"));
    expect([...m].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("construirePrompt", () => {
  it("numérote les postes et porte la ligne du devis", () => {
    const p = construirePrompt("Pose de faïence", "8 m² · 640 € HT", ["A", "B"]);
    expect(p).toContain(CONSIGNE_ARBITRE);
    expect(p).toContain("LIGNE DE DEVIS : Pose de faïence");
    expect(p).toContain("1. A");
    expect(p).toContain("2. B");
  });

  it("dit « non précisé » plutôt que de laisser un contexte vide", () => {
    expect(construirePrompt("X", "", ["A"])).toContain("Contexte : non précisé");
  });
});

describe("interpreterChoix — remise en numérotation d'origine", () => {
  const ordre = [{ rangVectoriel: 3 }, { rangVectoriel: 1 }, { rangVectoriel: 2 }];

  it("traduit le rang PRÉSENTÉ vers le rang vectoriel", () => {
    // L'IA répond « 2 » sur la liste mélangée → c'est notre rang 1.
    expect(interpreterChoix('{"choix":2,"raison":"ok"}', ordre)?.choix).toBe(1);
  });

  it("laisse passer 0 (aucun ne convient) et -1 (injugeable)", () => {
    expect(interpreterChoix('{"choix":0,"raison":"rien"}', ordre)?.choix).toBe(0);
    expect(interpreterChoix('{"choix":-1,"raison":"illisible"}', ordre)?.choix).toBe(-1);
  });

  it("tolère du texte autour du JSON", () => {
    expect(interpreterChoix('Voici : {"choix":1,"raison":"r"} fin', ordre)?.choix).toBe(3);
  });

  it("⚠️ rend null plutôt qu'un rang inventé quand la réponse est illisible", () => {
    expect(interpreterChoix("pas de json", ordre)).toBeNull();
    expect(interpreterChoix('{"choix":"deux"}', ordre)).toBeNull();
    expect(interpreterChoix('{"choix":99}', ordre)).toBeNull();
  });
});

describe("contestationMaterielle", () => {
  it("🔴 un quasi-doublon du catalogue ne réveille personne", () => {
    // « Mur parpaing 20 cm » → « Construction mur parpaing 20 cm » : le montant
    // ne bouge pas. Router ça en relecture est du bruit pur.
    const r = contestationMaterielle(1000, 1050);
    expect(r.materiel).toBe(false);
  });

  it("une contestation qui annule l'écart est matérielle", () => {
    expect(contestationMaterielle(1259, 0).materiel).toBe(true);
  });

  it("⚠️ « aucune entrée ne convient » est matériel par défaut", () => {
    // Ne pas savoir recalculer n'est pas une raison de se taire.
    const r = contestationMaterielle(870, null);
    expect(r.materiel).toBe(true);
    expect(r.motif).toMatch(/aucune référence opposable/);
  });

  it("exige les DEUX seuils — 300 € ET 20 %", () => {
    // 200 € d'écart sur 10 000 € : au-dessus de 20 % ? non. → pas matériel.
    expect(contestationMaterielle(10000, 9800).materiel).toBe(false);
    // 250 € sur 400 € : 62 % mais sous 300 € → pas matériel non plus.
    expect(contestationMaterielle(400, 150).materiel).toBe(false);
    // 600 € sur 1 000 € : les deux seuils sont franchis.
    expect(contestationMaterielle(1000, 400).materiel).toBe(true);
  });
});

describe("ecartAvecTarif", () => {
  it("recalcule l'écart avec le tarif proposé", () => {
    expect(ecartAvecTarif(1000, 10, { price_max_unit_ht: 60, fixed_max_ht: 0 })).toBe(400);
  });

  it("rend null quand le tarif est inconnu ou nul — jamais 0 par défaut", () => {
    expect(ecartAvecTarif(1000, 10, null)).toBeNull();
    expect(ecartAvecTarif(1000, 10, { price_max_unit_ht: 0, fixed_max_ht: 0 })).toBeNull();
  });

  it("ne rend jamais d'écart négatif", () => {
    expect(ecartAvecTarif(1000, 10, { price_max_unit_ht: 500, fixed_max_ht: 0 })).toBe(0);
  });
});

describe("postesAArbitrer", () => {
  it("retient un poste chiffré qui porte un top-5", () => {
    const p = postesAArbitrer([groupe()], 9000);
    expect(p).toHaveLength(1);
    expect(p[0].rangUtilise).toBe(1);
    expect(p[0].ecart).toBe(500);
    // 🔴 C'est la LIGNE DU DEVIS qui est jugée, pas notre étiquette.
    expect(p[0].ligne).toBe("Pose carrelage sol salle de bain");
  });

  it("ignore un poste que la production ne chiffre pas", () => {
    expect(postesAArbitrer([groupe({ devis_total_ht: 300 })], 9000)).toHaveLength(0);
  });

  it("⚠️ ignore les analyses sans top-5 plutôt que d'inventer des candidats", () => {
    expect(postesAArbitrer([groupe({ vectorial: undefined })], 9000)).toHaveLength(0);
  });

  it("ignore un poste dont l'entrée utilisée n'est pas dans le top-5", () => {
    expect(postesAArbitrer([groupe({
      prices: [{ job_type: "inconnu", label: "X", unit: "m2", price_max_unit_ht: 50 }],
    })], 9000)).toHaveLength(0);
  });

  it(`plafonne à ${MAX_POSTES_ARBITRES} postes, les plus gros écarts d'abord`, () => {
    const groupes = Array.from({ length: 12 }, (_, i) =>
      groupe({ job_type_label: `Poste ${i}`, devis_total_ht: 600 + i * 100 }));
    const p = postesAArbitrer(groupes, 90000);
    expect(p).toHaveLength(MAX_POSTES_ARBITRES);
    expect(p[0].ecart).toBeGreaterThan(p[p.length - 1].ecart);
  });
});

describe("arbitrerRapprochements — best-effort", () => {
  const tarifsVides = async () => new Map();

  it("ne fait rien sans clé API, et ne jette pas", async () => {
    const r = await arbitrerRapprochements(postesAArbitrer([groupe()], 9000), "", tarifsVides);
    expect(r.conteste).toHaveLength(0);
    expect(r.postes_juges).toBe(0);
  });

  it("ne fait rien sans poste", async () => {
    const r = await arbitrerRapprochements([], "cle", tarifsVides);
    expect(r.postes_juges).toBe(0);
  });

  it("🔴 un échec réseau ne fait pas échouer l'analyse", async () => {
    const fetchOrigine = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("réseau coupé"); }) as typeof fetch;
    try {
      const r = await arbitrerRapprochements(postesAArbitrer([groupe()], 9000), "cle", tarifsVides);
      expect(r.echecs).toBe(1);
      expect(r.conteste).toHaveLength(0);
    } finally {
      globalThis.fetch = fetchOrigine;
    }
  });

  it("route une contestation matérielle, tait un quasi-doublon", async () => {
    const fetchOrigine = globalThis.fetch;
    // L'arbitre désigne toujours le premier poste PRÉSENTÉ ; le mélange fait
    // que ce n'est pas notre rang 1, donc il conteste.
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"choix":1,"raison":"autre"}' }] } }] }),
    })) as unknown as typeof fetch;
    try {
      const postes = postesAArbitrer([groupe()], 9000);
      // Tarif proposé très bas → l'écart exploserait → contestation matérielle.
      const materiel = await arbitrerRapprochements(postes, "cle", async () =>
        new Map([["carrelage_fourni_pose", { price_max_unit_ht: 5, fixed_max_ht: 0 }],
                 ["ragreage", { price_max_unit_ht: 5, fixed_max_ht: 0 }]]));
      // Tarif proposé quasi identique → même montant → silence.
      const bruit = await arbitrerRapprochements(postes, "cle", async () =>
        new Map([["carrelage_fourni_pose", { price_max_unit_ht: 51, fixed_max_ht: 0 }],
                 ["ragreage", { price_max_unit_ht: 51, fixed_max_ht: 0 }]]));
      expect(materiel.conteste.length + materiel.sans_effet).toBe(1);
      expect(materiel.conteste).toHaveLength(1);
      // Le montant contesté est agrégé : c'est lui qui décide du routage.
      expect(materiel.ecart_conteste).toBe(500);
      expect(bruit.conteste).toHaveLength(0);
      expect(bruit.sans_effet).toBe(1);
      expect(bruit.ecart_conteste).toBe(0);
    } finally {
      globalThis.fetch = fetchOrigine;
    }
  });

  it("⚠️ une ligne jugée injugeable (-1) n'est pas une contestation", async () => {
    const fetchOrigine = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"choix":-1,"raison":"illisible"}' }] } }] }),
    })) as unknown as typeof fetch;
    try {
      const r = await arbitrerRapprochements(postesAArbitrer([groupe()], 9000), "cle", tarifsVides);
      expect(r.conteste).toHaveLength(0);
      expect(r.sans_effet).toBe(0);
    } finally {
      globalThis.fetch = fetchOrigine;
    }
  });
});
