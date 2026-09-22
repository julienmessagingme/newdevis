import { describe, it, expect } from "vitest";
import {
  porteeAnalyse,
  porteeSuffisantePourAffirmer,
  porteeValorisable,
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
    expect(p).toMatchObject({ compares: 1, total: 1, pctMontant: 100 });
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

// ═══════════════════════════════════════════════════════════════════════
// 🟢 2026-09-23 (validé Johan) — QUAND PEUT-ON VALORISER CE QU'ON A COMPARÉ ?
// ═══════════════════════════════════════════════════════════════════════

describe("porteeValorisable — dire ce qu'on a établi, pas seulement ce qu'on ignore", () => {
  it("nomme les postes comparés et leur montant", () => {
    const p = porteeAnalyse([
      g("high", 600, "Tableau électrique neuf"),
      g("high", 400, "Peinture plafond"),
      g("low", 1000, "Divers"),
    ])!;
    expect(p.postesCompares).toEqual(["Tableau électrique neuf", "Peinture plafond"]);
    expect(p.montantCompare).toBe(1000);
  });

  it("compte le matériel dans les postes NOMMÉS quand on lui donne ses libellés", () => {
    // Sur un devis de climatisation, le matériel EST la majorité des lignes :
    // l'omettre annoncerait une portée plus faible que ce que le détail montre.
    const p = porteeAnalyse([g("low", 500, "Pose")], 2, 3000, ["Daikin FTXM42", "Unité extérieure"])!;
    expect(p.postesCompares).toEqual(["Daikin FTXM42", "Unité extérieure"]);
    expect(p.compares).toBe(2);
  });

  it("valorise à partir de 3 postes ET 20 % du montant", () => {
    // 3 postes comparés sur 6, 30 % du montant : dans la zone.
    const p = porteeAnalyse([
      g("high", 100, "A"), g("high", 100, "B"), g("high", 100, "C"),
      g("low", 300, "D"), g("low", 200, "E"), g("low", 200, "F"),
    ])!;
    expect(p.pctMontant).toBe(30);
    expect(porteeValorisable(p)).toBe(true);
  });

  it("refuse UN SEUL poste, même s'il pèse lourd — le cas JeanBERNARD", () => {
    // 21 % du montant, mais « nous avons comparé la prise de courant » n'est
    // pas une phrase qui vaut la peine d'être lue. Le nombre de postes est le
    // vrai discriminant : 61 des 91 cartes mesurées en ont 0, 1 ou 2.
    const p = porteeAnalyse([g("high", 210, "Prise"), g("low", 790, "Reste")])!;
    expect(p.pctMontant).toBe(21);
    expect(porteeValorisable(p)).toBe(false);
  });

  it("refuse trois postes qui ne pèsent rien", () => {
    const p = porteeAnalyse([
      g("high", 30, "A"), g("high", 30, "B"), g("high", 30, "C"),
      g("low", 910, "Gros œuvre"),
    ])!;
    expect(p.pctMontant).toBe(9);
    expect(porteeValorisable(p)).toBe(false);
  });

  it("ne valorise PAS quand la portée suffit déjà à affirmer — témoin inverse", () => {
    // Au-dessus de 50 %, le titre porte déjà la cohérence de l'ensemble : il
    // n'y a rien à rattraper, et deux blocs diraient la même chose.
    const p = porteeAnalyse([
      g("high", 400, "A"), g("high", 400, "B"), g("high", 200, "C"),
    ])!;
    expect(porteeSuffisantePourAffirmer(p)).toBe(true);
    expect(porteeValorisable(p)).toBe(false);
  });

  it("le seuil tombe dans un plateau : 20, 25 et 30 % donnent le même verdict", () => {
    // Mesuré sur 91 cartes : 18, 17 et 17. Un seuil qu'on peut déplacer sans
    // rien changer est un seuil qu'on ne peut pas « régler » pour se flatter.
    const cas = porteeAnalyse([
      g("high", 100, "A"), g("high", 100, "B"), g("high", 150, "C"),
      g("low", 650, "D"),
    ])!;
    expect(cas.pctMontant).toBe(35); // au-dessus des trois valeurs testées
    expect(porteeValorisable(cas)).toBe(true);
  });
});
