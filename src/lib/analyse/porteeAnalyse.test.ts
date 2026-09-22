import { describe, it, expect } from "vitest";
import {
  porteeAnalyse,
  porteeSuffisantePourAffirmer,
  phrasePortee,
  PORTEE_MIN_POUR_AFFIRMER_PCT,
  type GroupePortee,
} from "./porteeAnalyse";

const g = (
  confidence: string | null,
  montant: number,
  label = "Poste",
  lignes = 1,
): GroupePortee => ({
  job_type_label: label,
  devis_lines: Array.from({ length: lignes }, (_, i) => ({ description: `l${i}` })),
  devis_total_ht: montant,
  vectorial: confidence === null ? null : { confidence },
});

describe("porteeAnalyse — le compte du hero EST celui du détail", () => {
  it("ne compte que les postes que le détail affiche", () => {
    // `BlockPrixMarche` écarte les groupes sans ligne et le fourre-tout
    // « Autre ». Les compter ferait annoncer « 1 sur 3 » là où le lecteur
    // voit une seule ligne.
    const p = porteeAnalyse([
      g("high", 200),
      { job_type_label: "Vide", devis_lines: [], devis_total_ht: 100, vectorial: { confidence: "high" } },
      g("high", 100, "Autre"),
    ]);
    expect(p).toEqual({ compares: 1, total: 1, pctMontant: 100 });
  });

  it("reproduit le cas JeanBERNARD : un poste opposable sur dix", () => {
    const groupes = [
      g("high", 225),
      g("medium", 163),
      g("medium", 44),
      g("medium", 75),
      g("low", 183),
      g("low", 96),
      g("low", 70),
      g("low", 34),
      g("no_match", 128),
      g("no_match", 75),
    ];
    const p = porteeAnalyse(groupes)!;
    expect(p.compares).toBe(1);
    expect(p.total).toBe(10);
    expect(p.pctMontant).toBe(21); // 225 / 1093
    // 🔴 LE CAS QUI A IMPOSÉ LE SEUIL DE 50 %. Avec l'ancien seuil de 5 % — celui
    // de `leviersBuilder`, qui répond à « n'avons-nous RIEN comparé ? » — ce
    // devis sortait en VERT, « Ce devis nous paraît cohérent », sur un poste
    // opposable sur dix. Affirmer la cohérence de l'ensemble n'est pas la même
    // question que constater qu'on n'a rien comparé.
    expect(porteeSuffisantePourAffirmer(p)).toBe(false);
  });

  it("compte le matériel des DEUX côtés — il est comparé ET affiché", () => {
    // Sur un devis de climatisation, les références fabricant portent la
    // majorité des lignes : les omettre annoncerait une portée plus faible
    // que ce que le détail montre.
    const p = porteeAnalyse([g("no_match", 500)], 4, 8000)!;
    expect(p.compares).toBe(4);
    expect(p.total).toBe(5);
    expect(p.pctMontant).toBe(94); // 8000 / 8500
  });

  it("rend null quand il n'y a rien à afficher", () => {
    expect(porteeAnalyse([])).toBeNull();
    expect(porteeAnalyse(null)).toBeNull();
    expect(porteeAnalyse([g("high", 0, "Autre")])).toBeNull();
  });
});

describe("porteeSuffisantePourAffirmer", () => {
  it("dit non quand aucun poste n'est opposable", () => {
    const p = porteeAnalyse([g("medium", 100), g("low", 200)])!;
    expect(p.compares).toBe(0);
    expect(porteeSuffisantePourAffirmer(p)).toBe(false);
  });

  it("bascule à la moitié du montant, pas au nombre de postes", () => {
    // Un seul poste sur dix, mais il porte 60 % du montant : on peut se
    // prononcer. C'est le MONTANT qui engage, pas le décompte.
    const gros = porteeAnalyse([g("high", 600), ...Array.from({ length: 9 }, () => g("low", 44))])!;
    expect(gros.pctMontant).toBe(60);
    expect(porteeSuffisantePourAffirmer(gros)).toBe(true);

    const juste = porteeAnalyse([g("high", 490), g("low", 510)])!;
    expect(juste.pctMontant).toBe(49);
    expect(porteeSuffisantePourAffirmer(juste)).toBe(false);

    expect(PORTEE_MIN_POUR_AFFIRMER_PCT).toBe(50);
  });

  it("se rabat sur le compte de postes quand aucun montant n'est exploitable", () => {
    const p = porteeAnalyse([g("high", 0), g("high", 0), g("low", 0)])!;
    expect(p.pctMontant).toBeNull();
    expect(porteeSuffisantePourAffirmer(p)).toBe(true); // 2 sur 3

    const minoritaire = porteeAnalyse([g("high", 0), g("low", 0), g("low", 0)])!;
    expect(porteeSuffisantePourAffirmer(minoritaire)).toBe(false); // 1 sur 3
  });

  it("dit non sur une portée absente — l'ignorance n'est jamais un satisfecit", () => {
    expect(porteeSuffisantePourAffirmer(null)).toBe(false);
  });
});

describe("phrasePortee — un fait, en une ligne", () => {
  it("nomme le total quand rien n'est opposable", () => {
    const p = porteeAnalyse([g("low", 100), g("no_match", 100)])!;
    expect(phrasePortee(p)).toBe(
      "Aucune des 2 prestations n'a de prix de référence que nous puissions opposer.",
    );
  });

  it("ne dit pas « 9 sur 9 » quand tout est comparé", () => {
    const p = porteeAnalyse([g("high", 100), g("high", 100)])!;
    expect(phrasePortee(p)).toBe("Nous avons comparé les 2 prestations de ce devis au marché.");
  });

  it("donne le compte ET la part du montant sur un devis partiel", () => {
    const p = porteeAnalyse([g("high", 600), g("low", 400)])!;
    expect(phrasePortee(p)).toBe(
      "Nous avons comparé 1 des 2 prestations au marché, soit 60 % du montant.",
    );
  });

  it("reste silencieuse sans portée", () => {
    expect(phrasePortee(null)).toBeNull();
  });
});
