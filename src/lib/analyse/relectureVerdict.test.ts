import { describe, it, expect } from "vitest";
import { relireVerdict } from "./relectureVerdict";

const poste = (label: string, ecart: number, ratio = 2) => ({ label, ecart, ratio });

describe("relireVerdict — le contrôle avant affichage", () => {
  it("laisse passer un verdict cohérent sans rien journaliser", () => {
    const r = relireVerdict({
      surcoutMin: 1000,
      surcoutMax: 1000,
      postes: [poste("Peinture murs", 700), poste("Carrelage", 300)],
      postesNommes: ["Peinture murs"],
      surcoutNomme: null,
      totalHT: 12000,
    });
    expect(r.surcoutMax).toBe(1000);
    expect(r.journal).toHaveLength(0);
    expect(r.exigeComparaisonIndicative).toBe(false);
  });

  it("🔴 retire un écart qui atteint le devis entier", () => {
    const r = relireVerdict({
      surcoutMin: 2500,
      surcoutMax: 2500,
      postes: [poste("Terrassement et évacuation", 2500, 25)],
      postesNommes: ["Terrassement et évacuation"],
      surcoutNomme: null,
      totalHT: 2000,
    });
    expect(r.surcoutMax).toBe(0);
    expect(r.postes).toHaveLength(0);
    expect(r.exigeComparaisonIndicative).toBe(true);
    expect(r.journal[0].regle).toBe("ecart_superieur_au_devis");
  });

  it("retire un montant qu'aucun poste ne porte", () => {
    const r = relireVerdict({
      surcoutMin: 1000,
      surcoutMax: 1000,
      postes: [],
      postesNommes: [],
      surcoutNomme: null,
      totalHT: 12000,
    });
    expect(r.surcoutMax).toBe(0);
    expect(r.journal[0].regle).toBe("montant_sans_poste_nomme");
  });

  it("garde le montant quand une anomalie le nomme, même sans poste serveur", () => {
    // Le repli « somme des anomilies bornées » de conclusion.ts produit
    // exactement ce cas : un montant attribué à des lignes nommées par Gemini,
    // sans passer par le calcul serveur.
    const r = relireVerdict({
      surcoutMin: 900,
      surcoutMax: 900,
      postes: [],
      postesNommes: ["Installation digicode"],
      surcoutNomme: null,
      totalHT: 12000,
    });
    expect(r.surcoutMax).toBe(900);
    expect(r.journal).toHaveLength(0);
  });

  it("🔴 recale le montant sur la somme du détail — c'est la règle qui voyait le ×1,3", () => {
    // 1 000 € de détail, 1 300 € annoncés : exactement ce que produisait le
    // coefficient. Le lecteur qui additionnait ne retombait jamais sur le total.
    const r = relireVerdict({
      surcoutMin: 700,
      surcoutMax: 1300,
      postes: [poste("Peinture murs", 700), poste("Carrelage", 300)],
      postesNommes: ["Peinture murs"],
      surcoutNomme: null,
      totalHT: 12000,
    });
    expect(r.surcoutMax).toBe(1000);
    expect(r.surcoutMin).toBe(1000);
    expect(r.journal[0].regle).toBe("montant_different_du_detail");
  });

  it("tolère l'écart d'arrondi entre les postes et leur somme", () => {
    const r = relireVerdict({
      surcoutMin: 999,
      surcoutMax: 999,
      postes: [poste("A", 500), poste("B", 500)],
      postesNommes: ["A"],
      surcoutNomme: null,
      totalHT: 12000,
    });
    expect(r.journal).toHaveLength(0);
  });

  it("remet une fourchette inversée dans l'ordre", () => {
    const r = relireVerdict({
      surcoutMin: 1200,
      surcoutMax: 800,
      postes: [poste("A", 800)],
      postesNommes: ["A"],
      surcoutNomme: null,
      totalHT: 12000,
    });
    expect(r.surcoutMin).toBe(800);
    expect(r.journal.some((j) => j.regle === "fourchette_inversee")).toBe(true);
  });

  it("retire le détail resté sous un montant nul", () => {
    const r = relireVerdict({
      surcoutMin: 0,
      surcoutMax: 0,
      postes: [poste("A", 800)],
      postesNommes: ["A"],
      surcoutNomme: null,
      totalHT: 12000,
    });
    expect(r.postes).toHaveLength(0);
    expect(r.journal[0].regle).toBe("detail_orphelin");
  });

  it("⚠️ ne fabrique jamais de montant : la relecture ne peut que retirer", () => {
    const entrees = [
      { surcoutMin: 0, surcoutMax: 0, postes: [], postesNommes: [], surcoutNomme: null,
      totalHT: 5000 },
      { surcoutMin: 500, surcoutMax: 500, postes: [poste("A", 500)], postesNommes: ["A"], surcoutNomme: null,
      totalHT: 5000 },
      { surcoutMin: 9000, surcoutMax: 9000, postes: [poste("A", 9000, 40)], postesNommes: ["A"], surcoutNomme: null,
      totalHT: 5000 },
    ];
    for (const e of entrees) {
      expect(relireVerdict(e).surcoutMax).toBeLessThanOrEqual(e.surcoutMax);
    }
  });

  it("🔴 plafonne le montant CITÉ sur le montant AFFICHÉ (cas ALES)", () => {
    // Trouvé en régénérant un devis réel, pas à la relecture du code : la même
    // conclusion disait « environ 8 682 € d'écart sur ces lignes » dans son
    // résumé et « environ 340 € » dans sa marge, parce que le premier vient des
    // anomalies de Gemini et le second du calcul serveur — d'où une garde qui
    // retirait un poste n'atteignait que le second.
    const r = relireVerdict({
      surcoutMin: 340,
      surcoutMax: 340,
      postes: [poste("Création arrivée d'eau", 340)],
      postesNommes: ["WC", "Création arrivée d'eau"],
      surcoutNomme: 8682,
      totalHT: 22150,
    });
    expect(r.surcoutNomme).toBe(340);
    expect(r.journal.some((j) => j.regle === "montant_nomme_superieur_au_total")).toBe(true);
  });

  it("retire le montant cité quand plus rien n'est affiché", () => {
    const r = relireVerdict({
      surcoutMin: 0,
      surcoutMax: 0,
      postes: [],
      postesNommes: ["WC"],
      surcoutNomme: 8682,
      totalHT: 22150,
    });
    expect(r.surcoutNomme).toBeNull();
  });

  it("laisse intact un montant cité inférieur au montant affiché", () => {
    const r = relireVerdict({
      surcoutMin: 1000,
      surcoutMax: 1000,
      postes: [poste("A", 1000)],
      postesNommes: ["A"],
      surcoutNomme: 700,
      totalHT: 12000,
    });
    expect(r.surcoutNomme).toBe(700);
    expect(r.journal).toHaveLength(0);
  });

  it("reste muette quand le total HT est inconnu plutôt que de supposer", () => {
    const r = relireVerdict({
      surcoutMin: 9000,
      surcoutMax: 9000,
      postes: [poste("A", 9000, 40)],
      postesNommes: ["A"],
      surcoutNomme: null,
      totalHT: null,
    });
    expect(r.surcoutMax).toBe(9000);
  });
});
