import { describe, it, expect } from "vitest";
import {
  separerPetitsPostes,
  PART_MAX_PETIT_POSTE,
  MIN_POSTES_POUR_REGROUPER,
} from "./petitsPostes";

/** Les accessoires RÉELS du devis VOLTELEC (16 485 € HT), qui ont motivé la règle. */
const ACCESSOIRES = [
  { l: "Liaison Frigorifique 1/4 3/8", m: 500 },
  { l: "Cable interconnexion 5G 1,5mm", m: 230 },
  { l: "Tuyau de condensat diamètre 22", m: 100 },
  { l: "Kit Rubber 600 (anti vibration)", m: 65 },
  { l: "Goulotte de climatisation 90x60", m: 500 },
];
const PRESTATIONS = [
  { l: "La distribution se fera sous goulotte…", m: 900 },
  { l: "La distribution partie extérieure…", m: 1500 },
];
const montant = (p: { m: number | null }) => p.m;

describe("separerPetitsPostes", () => {
  it("regroupe les accessoires et garde les vraies prestations", () => {
    const r = separerPetitsPostes([...ACCESSOIRES, ...PRESTATIONS], montant, 16485);
    // Plafond = 824 € : les cinq accessoires passent dessous, les deux
    // prestations de distribution restent au-dessus.
    expect(r.regroupes).toHaveLength(5);
    expect(r.affiches).toHaveLength(2);
    expect(r.montantRegroupe).toBe(1395);
    expect(r.affiches.map((p) => p.m)).toEqual([900, 1500]);
  });

  it("le seuil est RELATIF : 500 € est petit à 16 485 €, central à 3 000 €", () => {
    const petitDevis = separerPetitsPostes(ACCESSOIRES, montant, 3000);
    // Plafond = 150 € : seuls le tuyau (100) et le kit (65) y passent, soit 2
    // postes → sous le plancher de regroupement, on affiche tout.
    expect(petitDevis.regroupes).toHaveLength(0);
    expect(petitDevis.affiches).toHaveLength(5);
  });

  it("ne regroupe pas en dessous de trois postes — ça n'apporte rien", () => {
    const deux = separerPetitsPostes(ACCESSOIRES.slice(0, 2), montant, 16485);
    expect(deux.regroupes).toHaveLength(0);
    expect(deux.affiches).toHaveLength(2);

    const trois = separerPetitsPostes(ACCESSOIRES.slice(0, 3), montant, 16485);
    expect(trois.regroupes).toHaveLength(MIN_POSTES_POUR_REGROUPER);
  });

  it("sans total exploitable, on n'invente pas de frontière", () => {
    for (const total of [null, 0, -1]) {
      const r = separerPetitsPostes(ACCESSOIRES, montant, total);
      expect(r.regroupes).toHaveLength(0);
      expect(r.affiches).toHaveLength(ACCESSOIRES.length);
    }
  });

  it("un poste sans montant garde sa carte : on ne peut rien en dire", () => {
    const avecNul: Array<{ l: string; m: number | null }> = [
      ...ACCESSOIRES,
      { l: "Poste sans montant", m: null },
    ];
    // Lambda inline : sinon T est inféré depuis `montant` (dont le paramètre
    // ne porte pas `l`) au lieu du tableau, et `p.l` n'existe plus au typage.
    const r = separerPetitsPostes(avecNul, (p) => p.m, 16485);
    expect(r.affiches.some((p) => p.l === "Poste sans montant")).toBe(true);
    expect(r.regroupes).toHaveLength(5);
  });

  it("le montant regroupé est la SOMME exacte — rien ne disparaît", () => {
    const r = separerPetitsPostes(ACCESSOIRES, montant, 16485);
    expect(r.montantRegroupe).toBe(ACCESSOIRES.reduce((s, p) => s + p.m, 0));
  });

  it("la frontière est bien à 5 % du devis", () => {
    const total = 10000;
    const plafond = total * PART_MAX_PETIT_POSTE; // 500
    const postes = [{ m: 499 }, { m: 500 }, { m: 501 }, { m: 10 }];
    const r = separerPetitsPostes(postes, (p) => p.m, total);
    expect(r.regroupes.map((p) => p.m)).toEqual([499, 500, 10]); // <= plafond
    expect(r.affiches.map((p) => p.m)).toEqual([501]);
  });
});
