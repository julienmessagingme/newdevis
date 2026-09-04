import { describe, it, expect } from "vitest";
import { estGrosOeuvre, ligneEstGrosOeuvre, motifGrosOeuvre } from "./grosOeuvre";

describe("gros œuvre — faux positifs à ne plus jamais déclencher", () => {
  // Retour Johan 2026-09-03, devis SOLTANI : le conseil DO se déclenchait sur
  // l'Indice de Performance Environnementale d'un poêle à bois.
  it("« IPE= 0.5 » dans les specs d'un poêle n'est PAS une poutre", () => {
    expect(
      ligneEstGrosOeuvre(
        "Poêle OFEN 24 LABEL FLAMME VERTE 7* Poêle LORFLAM / Normes EN 13 240 Rendement=80% / Taux CO= 0.08% / IPE= 0.5 / EP=30 m",
      ),
    ).toBe(false);
  });

  it("percer un mur pour la grille d'aération d'un poêle n'est pas du gros œuvre", () => {
    expect(ligneEstGrosOeuvre("Forfait percement du mur extérieur")).toBe(false);
    expect(ligneEstGrosOeuvre("Kit d'arrivée d'air directe par l'arrière, avec grille à lamelles")).toBe(false);
  });

  it("une ossature métallique de cloison placo n'est pas une charpente", () => {
    expect(
      ligneEstGrosOeuvre("Réhabilitation du fond de mur en placo-feu sur ossature métallique"),
    ).toBe(false);
  });

  it("le devis SOLTANI dans son ensemble ne relève pas du gros œuvre", () => {
    const lignes = [
      { libelle: "Poêle OFEN 24 LABEL FLAMME VERTE 7* / IPE= 0.5 / EP=30 m" },
      { libelle: "Réhabilitation du fond de mur en placo-feu sur ossature métallique" },
      { libelle: "Tubage flexible double peau inox Ø150" },
      { libelle: "Forfait percement du mur extérieur" },
      { libelle: "Forfait transport, pose et raccordement d'un poêle à bois" },
    ];
    expect(estGrosOeuvre(lignes)).toBe(false);
    expect(motifGrosOeuvre(lignes)).toBeNull();
  });

  it("traitement de charpente = entretien, pas structure", () => {
    expect(
      ligneEstGrosOeuvre("Fourniture + traitement de charpente, 2 couches de xylophène"),
    ).toBe(false);
  });
});

describe("gros œuvre — cas qui doivent DÉCLENCHER", () => {
  it("dépose d'un mur porteur", () => {
    expect(ligneEstGrosOeuvre("Dépose de mur porteur + évacuation de gravats")).toBe(true);
  });

  it("poutre HEA avec sa section", () => {
    expect(ligneEstGrosOeuvre("Fourniture et pose d'une poutre en fers HEA 180")).toBe(true);
  });

  it("extension et surélévation", () => {
    expect(ligneEstGrosOeuvre("Extension de 20 m² accolée à la maison")).toBe(true);
    expect(ligneEstGrosOeuvre("Surélévation de la toiture existante")).toBe(true);
  });

  it("réfection complète de charpente (≠ traitement)", () => {
    expect(ligneEstGrosOeuvre("Réfection complète de la charpente")).toBe(true);
  });

  it("ossature bois porteuse", () => {
    expect(ligneEstGrosOeuvre("Fourniture et pose d'ossature bois 60 x180 tous les 58 cm")).toBe(true);
  });

  it("le motif nomme la ligne qui déclenche", () => {
    const m = motifGrosOeuvre([
      { libelle: "Protection du chantier" },
      { libelle: "Dépose de mur porteur + évacuation de gravats" },
    ]);
    expect(m).toMatch(/mur porteur/);
  });
});
