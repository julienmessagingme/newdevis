/**
 * Tests de la règle unique de publication d'un prix (2026-09-07).
 * Chaque garde vient d'un cas réel : le « ×86 » du faux plafond, la « peinture
 * porte » à 8 350 € l'unité, la médiane menuiserie toutes unités mélangées.
 */

import { describe, it, expect } from "vitest";
import {
  agregerPostes,
  faitMarquant,
  normaliserUnite,
  quantile,
  OBS_MIN_PUBLICATION,
  type LignePrix,
} from "./statsPrix";

const ligne = (label: string, unite: string, prixUnitaire: number): LignePrix =>
  ({ label, unite, prixUnitaire });

/** n observations identiques, pour construire une série sans dispersion. */
const serie = (label: string, unite: string, prix: number[], n = 1): LignePrix[] =>
  prix.flatMap((p) => Array.from({ length: n }, () => ligne(label, unite, p)));

describe("normaliserUnite", () => {
  it("ramène les graphies d'une même unité", () => {
    expect(normaliserUnite("m2")).toBe("m²");
    expect(normaliserUnite("M²")).toBe("m²");
    expect(normaliserUnite("Unité")).toBe("u");
    expect(normaliserUnite("pce")).toBe("u");
    expect(normaliserUnite("ML")).toBe("ml");
  });

  it("reconnaît les forfaits sous toutes leurs formes", () => {
    for (const f of ["forfait", "F", "ff", "ens", "ensemble", "lot"]) {
      expect(normaliserUnite(f)).toBe("forfait");
    }
  });

  it("unité absente → null, la ligne devra être écartée", () => {
    expect(normaliserUnite("")).toBeNull();
    expect(normaliserUnite(null)).toBeNull();
    expect(normaliserUnite(undefined)).toBeNull();
  });
});

describe("quantile", () => {
  it("série vide → 0", () => expect(quantile([], 0.5)).toBe(0));
  it("médiane et extrêmes", () => {
    const s = [10, 20, 30, 40, 50];
    expect(quantile(s, 0.5)).toBe(30);
    expect(quantile(s, 0)).toBe(10);
    expect(quantile(s, 1)).toBe(50);
  });
});

describe("agregerPostes", () => {
  it("sépare les séries par unité — le défaut de la page menuiserie", () => {
    const lignes = [
      ...serie("Pose carrelage", "m²", [40, 45, 50, 55, 60, 65, 70, 75]),
      ...serie("Pose carrelage", "u", [400, 450, 500, 550, 600, 650, 700, 750]),
    ];
    const postes = agregerPostes(lignes);
    expect(postes).toHaveLength(2);
    expect(new Set(postes.map((p) => p.unite))).toEqual(new Set(["m²", "u"]));
    // Aucune médiane ne doit mélanger les deux ordres de grandeur.
    expect(postes.find((p) => p.unite === "m²")!.mediane).toBeLessThan(100);
    expect(postes.find((p) => p.unite === "u")!.mediane).toBeGreaterThan(400);
  });

  it("exclut les forfaits : leur périmètre varie d'un devis à l'autre", () => {
    const lignes = serie("Rénovation complète", "forfait", [8000, 9000, 10000, 11000, 12000, 13000, 14000, 15000]);
    expect(agregerPostes(lignes)).toHaveLength(0);
  });

  it("écarte le forfait déguisé — « 1 u » couvrant tout un lot", () => {
    // Neuf portes autour de 40 €, plus une ligne à 8 350 € qui couvre la maison.
    const lignes = [
      ...serie("Peinture porte", "u", [38, 39, 40, 40, 41, 42, 45, 48, 50]),
      ligne("Peinture porte", "u", 8350),
    ];
    const [poste] = agregerPostes(lignes);
    expect(poste.nbObs).toBe(9); // la valeur aberrante est retirée
    expect(poste.p90).toBeLessThan(100);
    expect(poste.ecart).toBeLessThan(2);
  });

  it("sous le seuil d'observations, on ne publie pas", () => {
    const lignes = serie("Poste rare", "m²", [10, 20, 30]);
    expect(agregerPostes(lignes)).toHaveLength(0);
    expect(agregerPostes(lignes, { obsMin: 3 })).toHaveLength(1);
  });

  it("une ligne sans unité ou sans libellé est ignorée", () => {
    const lignes = [
      ...serie("Bon poste", "m²", [10, 12, 14, 16, 18, 20, 22, 24]),
      ligne("", "m²", 15),
      ligne("Sans unité", "", 15),
    ];
    const postes = agregerPostes(lignes);
    expect(postes).toHaveLength(1);
    expect(postes[0].label).toBe("Bon poste");
  });

  it("l'amplitude est P90/P10, pas max/min", () => {
    // Dix valeurs à 100 et une à 900 : max/min donnerait ×9.
    const lignes = [...serie("Poste", "m²", [100, 100, 100, 100, 100, 100, 100, 100, 100, 100]),
                    ligne("Poste", "m²", 900)];
    const [poste] = agregerPostes(lignes);
    expect(poste.ecart).toBeLessThan(2);
  });

  it("classe les postes les mieux documentés en premier", () => {
    const lignes = [
      ...serie("Peu vu", "m²", [10, 12, 14, 16, 18, 20, 22, 24]),
      ...serie("Très vu", "m²", [30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52]),
    ];
    expect(agregerPostes(lignes)[0].label).toBe("Très vu");
  });

  it("le seuil par défaut reste explicite", () => {
    expect(OBS_MIN_PUBLICATION).toBe(8);
  });
});

describe("faitMarquant", () => {
  it("retient le poste au plus fort écart, pas le plus fréquent", () => {
    const lignes = [
      ...serie("Stable", "m²", [50, 50, 51, 51, 52, 52, 53, 53, 54, 54]),
      ...serie("Dispersé", "u", [40, 60, 90, 120, 160, 200, 260, 320, 350]),
    ];
    const postes = agregerPostes(lignes);
    expect(faitMarquant(postes)!.label).toBe("Dispersé");
  });

  it("aucun écart notable → aucun fait marquant, on n'invente pas", () => {
    const postes = agregerPostes(serie("Stable", "m²", [50, 50, 51, 51, 52, 52, 53, 53]));
    expect(faitMarquant(postes)).toBeNull();
  });

  it("ne fait pas la une sur un accessoire — le cas de la poignée de porte", () => {
    // Cas réel de la page menuiserie : la poignée avait le plus fort écart, mais
    // 83 € à côté d'une fenêtre à 1 760 € n'intéresse personne.
    const lignes = [
      ...serie("Poignée", "u", [30, 40, 50, 70, 100, 140, 200, 260, 300]),
      ...serie("Fenêtre PVC", "u", [900, 1100, 1300, 1600, 1800, 2100, 2400, 2700, 2900]),
    ];
    const postes = agregerPostes(lignes);
    expect(postes.find((p) => p.label === "Poignée")!.ecart)
      .toBeGreaterThan(postes.find((p) => p.label === "Fenêtre PVC")!.ecart);
    expect(faitMarquant(postes)!.label).toBe("Fenêtre PVC");
  });

  it("un poste modeste reste éligible si le métier n'en compte pas de plus gros", () => {
    // En électricité, un point lumineux à 116 € EST le poste central : le seuil
    // est relatif au métier, jamais un montant absolu.
    const postes = agregerPostes([
      ...serie("Point lumineux", "u", [60, 70, 85, 100, 116, 140, 170, 200, 230]),
      ...serie("Prise", "u", [50, 55, 60, 62, 65, 68, 70, 72, 75]),
    ]);
    expect(faitMarquant(postes)!.label).toBe("Point lumineux");
  });
});
