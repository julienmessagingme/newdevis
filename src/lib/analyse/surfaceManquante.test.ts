/**
 * Tests du contrôle d'absence de quantité.
 * Cas tirés du stock réel (mesure du 2026-08-30 sur 220 devis FR).
 */
import { describe, it, expect } from "vitest";
import { diagnostiquerQuantites } from "./surfaceManquante";

describe("diagnostiquerQuantites — quantités présentes", () => {
  it("des lignes au m² → aucune absence", () => {
    const d = diagnostiquerQuantites([
      { description: "Enduit ratissage mural", unite: "m2", quantite: 25 },
      { description: "Peinture murs 2 couches", unite: "m²", quantite: 120 },
    ]);
    expect(d.absenceReelle).toBe(false);
    expect(d.lignesAvecQuantite).toBe(2);
  });

  it("une seule ligne au ml suffit à considérer le devis quantifié", () => {
    const d = diagnostiquerQuantites([
      { description: "Plinthes", unite: "ml", quantite: 42 },
      { description: "Divers", unite: "U", quantite: 1 },
    ]);
    expect(d.absenceReelle).toBe(false);
  });

  it("unité métrique mais quantité nulle → non exploitable", () => {
    const d = diagnostiquerQuantites([{ description: "Carrelage", unite: "m2", quantite: 0 }]);
    expect(d.lignesAvecQuantite).toBe(0);
  });

  it("quantité en chaîne avec virgule décimale", () => {
    const d = diagnostiquerQuantites([{ description: "Dalle", unite: "m2", quantite: "136,06" }]);
    expect(d.lignesAvecQuantite).toBe(1);
  });
});

describe("diagnostiquerQuantites — absence RÉELLE", () => {
  // Cas devis sdb.pdf (ALES) : 24 lignes, toutes en « U 1,00 », aucune surface
  // écrite nulle part. C'est ici qu'on peut légitimement réclamer une précision.
  it("tout en forfait et aucune surface nulle part → absence réelle", () => {
    const d = diagnostiquerQuantites([
      { description: "Dépose totale de carrelage sol et murs", unite: "U", quantite: 1 },
      { description: "Étaiement du plancher pour dépose de mur porteur", unite: "U", quantite: 1 },
      { description: "Fourniture et pose d'une poutre en fers HEA de 180mm", unite: "U", quantite: 1 },
    ]);
    expect(d.absenceReelle).toBe(true);
    expect(d.surfaceEcriteNonExtraite).toBeNull();
  });

  it("des dimensions ne sont PAS une surface", () => {
    const d = diagnostiquerQuantites([
      { description: "Baie coulissante 1800 x 2150 + BVR électrique", unite: "U", quantite: 1 },
      { description: "Poutre HEA 180mm sur 3 ml", unite: "U", quantite: 1 },
    ]);
    expect(d.absenceReelle).toBe(true);
  });
});

describe("diagnostiquerQuantites — surface écrite mais NON extraite", () => {
  // Les 3 cas du stock où réclamer une quantité serait à côté de la plaque.
  it.each(["9m2", "20m2", "30M2", "45 m²", "120 mètres carrés"])(
    "« %s » dans une description → on ne réclame rien",
    (motif) => {
      const d = diagnostiquerQuantites([
        { description: `Réfection complète du sol, environ ${motif} au total`, unite: "U", quantite: 1 },
      ]);
      expect(d.absenceReelle).toBe(false);
      expect(d.surfaceEcriteNonExtraite).not.toBeNull();
    },
  );

  it("la surface peut venir du résumé, pas seulement des lignes", () => {
    const d = diagnostiquerQuantites(
      [{ description: "Peinture complète", unite: "U", quantite: 1 }],
      ["Rénovation d'un appartement de 68 m² à Bordeaux"],
    );
    expect(d.absenceReelle).toBe(false);
    expect(d.surfaceEcriteNonExtraite).toBe("68 m²");
  });
});

describe("diagnostiquerQuantites — robustesse", () => {
  it("liste vide", () => {
    const d = diagnostiquerQuantites([]);
    expect(d.lignesTotal).toBe(0);
    expect(d.absenceReelle).toBe(true);
  });

  it("champs absents ou nuls", () => {
    const d = diagnostiquerQuantites([{ description: null, unite: null, quantite: null }]);
    expect(d.absenceReelle).toBe(true);
  });
});
