/**
 * Tests du découpage multi-devis (2026-09-07).
 * Le principe défendu : rater une frontière est désagréable, en inventer une
 * est inacceptable — chaque cas ambigu doit donc NE PAS couper.
 */

import { describe, it, expect } from "vitest";
import {
  detecterDevis,
  decoupageUtile,
  numeroDevisDePage,
  siretDePage,
} from "./decoupeDevis";

describe("relevé des identifiants", () => {
  it("numéro de devis dans ses graphies courantes", () => {
    expect(numeroDevisDePage("DEVIS N° 2026-0417")).toBe("20260417");
    expect(numeroDevisDePage("Devis n°D2025000567")).toBe("D2025000567");
    expect(numeroDevisDePage("Devis DEV-202608-1")).toBe("DEV2026081");
  });

  it("une année seule n'est pas un numéro de devis", () => {
    expect(numeroDevisDePage("Devis 2026")).toBeNull();
  });

  it("un numéro sans le mot « devis » est ignoré", () => {
    expect(numeroDevisDePage("Commande n° 4417 du 12/03")).toBeNull();
  });

  it("SIRET espacé ou non", () => {
    expect(siretDePage("SIRET : 883 135 345 00030")).toBe("88313534500030");
    expect(siretDePage("SIRET 95405855800022")).toBe("95405855800022");
    expect(siretDePage("aucun identifiant ici")).toBeNull();
  });
});

describe("detecterDevis", () => {
  it("document d'un seul devis sur plusieurs pages → un segment", () => {
    const s = detecterDevis([
      "DEVIS N° 2026-0417 SIRET 883 135 345 00030",
      "suite du tableau, lignes de travaux",
      "Conditions générales de vente",
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ debut: 0, fin: 2, pages: 3, numero: "20260417" });
  });

  it("deux devis d'artisans différents → coupe au changement de SIRET", () => {
    const s = detecterDevis([
      "DEVIS N° A-100 SIRET 883 135 345 00030",
      "suite",
      "DEVIS N° B-200 SIRET 954 058 558 00022",
      "suite",
      "suite",
    ]);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ debut: 0, fin: 1 });
    expect(s[1]).toMatchObject({ debut: 2, fin: 4, pages: 3 });
  });

  it("deux devis du MÊME artisan → coupe au changement de numéro", () => {
    const s = detecterDevis([
      "Devis n° 2026-01 SIRET 883 135 345 00030",
      "Devis n° 2026-02 SIRET 883 135 345 00030",
    ]);
    expect(s).toHaveLength(2);
  });

  it("une page sans identifiant ne coupe jamais", () => {
    const s = detecterDevis([
      "DEVIS N° A-100 SIRET 883 135 345 00030",
      "page de photos, aucun identifiant",
      "annexe technique",
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].pages).toBe(3);
  });

  it("le SIRET n'apparaissant qu'en pied de dernière page ne coupe pas", () => {
    const s = detecterDevis([
      "DEVIS N° A-100 (aucun SIRET sur cette page)",
      "suite des travaux",
      "Bon pour accord — SIRET 883 135 345 00030",
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].siret).toBe("88313534500030");
  });

  it("document vide → aucun segment", () => {
    expect(detecterDevis([])).toEqual([]);
  });

  it("trois devis à la suite", () => {
    const s = detecterDevis([
      "Devis n° 1001 SIRET 111 111 111 11111",
      "Devis n° 2002 SIRET 222 222 222 22222",
      "suite",
      "Devis n° 3003 SIRET 333 333 333 33333",
    ]);
    expect(s.map((x) => x.pages)).toEqual([1, 2, 1]);
  });
});

describe("decoupageUtile", () => {
  it("un seul devis → on ne propose rien", () => {
    expect(decoupageUtile(detecterDevis(["Devis n° A-1 SIRET 111 111 111 11111"]), 8)).toBe(false);
  });

  it("deux devis dont au moins un analysable → on propose", () => {
    const s = detecterDevis([
      "Devis n° A-1 SIRET 111 111 111 11111",
      "Devis n° B-2 SIRET 222 222 222 22222",
    ]);
    expect(decoupageUtile(s, 8)).toBe(true);
  });

  it("deux devis tous deux encore trop longs → inutile de découper", () => {
    const pages = [
      "Devis n° A-1 SIRET 111 111 111 11111",
      ...Array(9).fill("suite"),
      "Devis n° B-2 SIRET 222 222 222 22222",
      ...Array(9).fill("suite"),
    ];
    expect(decoupageUtile(detecterDevis(pages), 8)).toBe(false);
  });
});
