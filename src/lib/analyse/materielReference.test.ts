/**
 * Tests de `materielReference.ts`.
 *
 * ⚠️ Les libellés utilisés ici sont des lignes RÉELLES du corpus (VOLTELEC et
 * les autres devis clim). Un test écrit sur des libellés inventés ne prouve
 * rien : c'est la façon dont les artisans rédigent qui fait échouer ces
 * rapprochements, pas la théorie.
 */

import { describe, it, expect } from "vitest";
import {
  normaliserReference,
  racineDeReference,
  clesDeRecherche,
  ligneContientPose,
  classerEcart,
  prixUnitaire,
  estPerimee,
  rapprocherMateriel,
  montantVerifie,
  objetDeLigne,
  depassementUsage,
  chiffrerDepassementMateriel,
  groupeEntierementCouvert,
  materielChiffrable,
  clesLignesMateriel,
  SEUIL_MENTION_PCT,
  SEUIL_QUESTION_PCT,
  type PrixMateriel,
} from "./materielReference";

const entree = (p: Partial<PrixMateriel> & { reference: string }): PrixMateriel => ({
  reference_normalisee: normaliserReference(p.reference),
  marque: "Test",
  famille: "mural",
  perimetre: "unite_seule",
  designation: "designation",
  prix_min_ht: 100,
  prix_max_ht: 120,
  nb_sources: 2,
  releve_le: "2026-09-15",
  perime_le: "2026-12-15",
  ...p,
});

// Le catalogue réellement en base (extrait représentatif).
const CATALOGUE: PrixMateriel[] = [
  entree({ reference: "FTXM42A", famille: "mural", designation: "mural 4,2 kW (unite seule)", prix_min_ht: 524.17, prix_max_ht: 532.5 }),
  entree({ reference: "CTXM15A", famille: "mural", designation: "mural 1,5 kW (unite seule)", prix_min_ht: 290.83, prix_max_ht: 307.5 }),
  entree({ reference: "MSZ-AY15VGK", famille: "mural", designation: "mural 1,5 kW (unite seule)", prix_min_ht: 307.5, prix_max_ht: 334 }),
  entree({ reference: "MSZ-AY25VGK", famille: "mural", designation: "mural 2,5 kW (unite seule)", prix_min_ht: 349.17, prix_max_ht: 370, nb_sources: 3 }),
  entree({ reference: "MXZ-4F72VF4", famille: "groupe_ext_multi", designation: "groupe ext 4 sorties 7,2 kW", prix_min_ht: 1874.17, prix_max_ht: 2334.61, nb_sources: 3 }),
  entree({ reference: "MXZ-2F53VF4", famille: "groupe_ext_multi", designation: "groupe ext 2 sorties 5,3 kW", prix_min_ht: 1165.83, prix_max_ht: 1417.78 }),
  entree({ reference: "4MXM80A8/A9", famille: "groupe_ext_multi", designation: "groupe ext 4 sorties 8,0 kW", prix_min_ht: 2415.83, prix_max_ht: 2576.28 }),
  entree({ reference: "PEAD-M60JA + SUZ-M60VA", famille: "gainable", perimetre: "ensemble", designation: "gainable 6 kW (ensemble)", prix_min_ht: 2107.5, prix_max_ht: 2132.5 }),
];

describe("normalisation et racine", () => {
  it("normalise en majuscules alphanumériques", () => {
    expect(normaliserReference("mxz-4f72vf4")).toBe("MXZ4F72VF4");
    expect(normaliserReference("PEAD-M60JA/ ")).toBe("PEADM60JA");
  });

  it("fait tomber le millésime mais JAMAIS la puissance ni les sorties", () => {
    // Deux générations du même produit
    expect(racineDeReference("MXZ-4F72VF4")).toBe(racineDeReference("MXZ-4F72VF5-E1"));
    expect(racineDeReference("4MXM80A8")).toBe(racineDeReference("4MXM80A9"));
    expect(racineDeReference("MSZ-AY25VGK")).toBe(racineDeReference("MSZ-AY25VGK2-E1"));
    // Deux produits DIFFÉRENTS : 900 € d'écart, ils ne doivent jamais se confondre
    expect(racineDeReference("MXZ-4F72VF4")).not.toBe(racineDeReference("MXZ-2F53VF4"));
    expect(racineDeReference("MSZ-AY15VGK")).not.toBe(racineDeReference("MSZ-AY25VGK"));
    expect(racineDeReference("FTXM42A")).not.toBe(racineDeReference("FTXM20A"));
  });
});

describe("clés de recherche — le + est un ET, le / est un OU", () => {
  it("un ensemble exige TOUS ses composants", () => {
    const cles = clesDeRecherche("PEAD-M60JA + SUZ-M60VA");
    expect(cles).toHaveLength(2);
    expect(cles[0]).toContain("PEADM60JA");
    expect(cles[1]).toContain("SUZM60VA");
  });

  it("deux millésimes suffisent l'un OU l'autre, en un seul groupe", () => {
    const cles = clesDeRecherche("4MXM80A8/A9");
    expect(cles).toHaveLength(1);
    expect(cles[0]).toContain("4MXM80");
  });
});

describe("prix unitaire — le piège du 15/09", () => {
  it("divise par la quantité : la ligne FTXM42 de VOLTELEC porte q=2", () => {
    // 1 510 € pour 2 unités = 755 € pièce. Comparé tel quel à 524-533 €,
    // l'écart sortait à +184 % au lieu de +44 % : une diffamation.
    expect(prixUnitaire({ libelle: "x", montant: 1510, quantite: 2 })).toBe(755);
  });

  it("traite une quantité absente ou nulle comme 1", () => {
    expect(prixUnitaire({ libelle: "x", montant: 3500, quantite: null })).toBe(3500);
    expect(prixUnitaire({ libelle: "x", montant: 3500, quantite: 0 })).toBe(3500);
  });

  it("refuse une ligne sans montant exploitable", () => {
    expect(prixUnitaire({ libelle: "x", montant: null, quantite: 1 })).toBeNull();
    expect(prixUnitaire({ libelle: "x", montant: 0, quantite: 1 })).toBeNull();
  });
});

describe("seuils validés le 2026-09-15", () => {
  it("classe selon la marge mesurée du métier", () => {
    expect(classerEcart(44)).toBe("normal");   // FTXM42 chez VOLTELEC
    expect(classerEcart(-16)).toBe("normal");  // Bosch facturé SOUS le marché
    expect(classerEcart(SEUIL_MENTION_PCT)).toBe("mention");
    expect(classerEcart(62)).toBe("mention");  // 2MXM68A8
    expect(classerEcart(SEUIL_QUESTION_PCT)).toBe("question");
    expect(classerEcart(144)).toBe("question"); // MSZ-AY15VGK
  });
});

describe("garde du périmètre — le piège du pack monosplit", () => {
  it("ne compare pas une unité seule à une ligne qui facture la pose", () => {
    // MSZ-AY25VGK vaut 1 059 € en pack monosplit et 381 € en unité seule.
    const r = rapprocherMateriel(
      [{ libelle: "Fourniture et pose d'une unité MSZ-AY25VGK", montant: 1059, quantite: 1 }],
      CATALOGUE,
    );
    expect(r).toHaveLength(0);
  });

  it("compare une unité seule quand la ligne ne parle pas de pose", () => {
    const r = rapprocherMateriel(
      [{ libelle: "Unité intérieure MITSUBISHI MSZ-AY25VGK", montant: 473, quantite: 1 }],
      CATALOGUE,
    );
    expect(r).toHaveLength(1);
    expect(r[0].zone).toBe("normal");
  });

  it("compare un ENSEMBLE même si la ligne mentionne la pose", () => {
    // L'entrée couvre intérieur + extérieur : la pose n'en fausse pas le périmètre
    // de la même façon. C'est le prix du matériel des deux unités.
    const r = rapprocherMateriel(
      [{ libelle: "Gainable PEAD-M60JA / SUZ-M60VA avec pose", montant: 2481, quantite: 1 }],
      CATALOGUE,
    );
    expect(r).toHaveLength(1);
    expect(r[0].reference).toBe("PEAD-M60JA + SUZ-M60VA");
  });
});

describe("le bruit du stock ne produit aucun rapprochement", () => {
  it.each([
    ["Groupe extérieur — SCOP4 SEER8 POIDS59KG", 3500],
    ["DV817 - Fourniture cuisine aménagée suivant projet", 5978],
    ["DV001081 - Pose d'éléments de cuisine sur linéaire", 825],
    ["Béton de fondations c25-30", 2768],
    ["Alim CE 3G2.5MM²", 120],
    ["Panneaux de laine de verre ISOVER Murs 032 kraft, Ep.100MM", 600],
  ])("ignore %s", (libelle, montant) => {
    expect(rapprocherMateriel([{ libelle, montant, quantite: 1 }], CATALOGUE)).toHaveLength(0);
  });
});

describe("lignes réelles du corpus", () => {
  it("rapproche le groupe extérieur de VOLTELEC (+36 à +45 %, normal)", () => {
    const r = rapprocherMateriel(
      [{
        libelle: "- GROUPE EXTERTIEUR DAIKIN 4 SORTIES 8 kW DC INVERTER R32 4MXM80A8 Puissance froid: 1,50-4.00",
        montant: 3500, quantite: 1,
      }],
      CATALOGUE,
    );
    expect(r).toHaveLength(1);
    expect(r[0].reference).toBe("4MXM80A8/A9");
    expect(r[0].ecart_min_pct).toBe(36);
    expect(r[0].ecart_max_pct).toBe(45);
    expect(r[0].zone).toBe("normal");
  });

  it("rapproche la ligne FTXM42 à q=2 sur son PRIX UNITAIRE", () => {
    const r = rapprocherMateriel(
      [{ libelle: "MURAL DAIKIN PERFERA BLUEVOLUTION R32 FTXM42 Très haute performance", montant: 1510, quantite: 2 }],
      CATALOGUE,
    );
    expect(r).toHaveLength(1);
    expect(r[0].prix_unitaire_devis).toBe(755);
    expect(r[0].quantite).toBe(2);
    expect(r[0].zone).toBe("normal"); // +42 à +44 %
  });

  it("attrape le vrai écart : MSZ-AY15VGK facturé 647 € contre 308-334 €", () => {
    const r = rapprocherMateriel(
      [{ libelle: "Unité intérieure chambres type split mural marque MITSUBISHI MSZ-AY15VGK", montant: 647, quantite: 1 }],
      CATALOGUE,
    );
    expect(r).toHaveLength(1);
    expect(r[0].zone).toBe("question");
    expect(r[0].ecart_min_pct).toBeGreaterThanOrEqual(90);
  });

  it("reconnaît un millésime absent du catalogue (VF5 sur une entrée VF4)", () => {
    const r = rapprocherMateriel(
      [{ libelle: "UNITE EXTERIEURE 4 SORTIES MITSUBISHI Groupe Extérieur MXZ-4F72VF5-E1", montant: 3850, quantite: 1 }],
      CATALOGUE,
    );
    expect(r).toHaveLength(1);
    expect(r[0].reference).toBe("MXZ-4F72VF4");
    expect(r[0].zone).toBe("question"); // 3 850 € contre 1 874-2 335 €
  });

  it("ne confond JAMAIS deux puissances : un 2F53 n'est pas un 4F72", () => {
    const r = rapprocherMateriel(
      [{ libelle: "Groupe extérieur multi split MITSUBISHI ELECTRIC MXZ-2F53VF4", montant: 1621, quantite: 1 }],
      CATALOGUE,
    );
    expect(r).toHaveLength(1);
    expect(r[0].reference).toBe("MXZ-2F53VF4");
  });
});

describe("péremption", () => {
  const perimee = entree({ reference: "FTXM42A", perime_le: "2026-01-01" });

  it("écarte une entrée dont le relevé a expiré", () => {
    expect(estPerimee(perimee, new Date("2026-09-15"))).toBe(true);
    const r = rapprocherMateriel(
      [{ libelle: "MURAL DAIKIN FTXM42", montant: 755, quantite: 1 }],
      [perimee],
      new Date("2026-09-15"),
    );
    expect(r).toHaveLength(0);
  });

  it("garde une entrée encore valide", () => {
    expect(estPerimee(CATALOGUE[0], new Date("2026-09-15"))).toBe(false);
  });
});

describe("montant vérifié", () => {
  it("multiplie par la quantité — c'est la part du devis qu'on a chiffrée", () => {
    const r = rapprocherMateriel(
      [
        { libelle: "MURAL DAIKIN FTXM42", montant: 1510, quantite: 2 },
        { libelle: "GROUPE EXTERIEUR DAIKIN 4MXM80A8", montant: 3500, quantite: 1 },
      ],
      CATALOGUE,
    );
    expect(r).toHaveLength(2);
    expect(montantVerifie(r)).toBe(1510 + 3500);
  });
});

describe("groupes partiellement couverts — le double comptage du 15/09", () => {
  const m4 = [
    { ligne: "Mitsubishi Réf: MXZ-4F72VF4 Unité extérieure", reference: "MXZ-4F72VF4", designation: "d",
      quantite: 1, prix_unitaire_devis: 4257, marche_min_ht: 1874.17, marche_max_ht: 2334.61,
      ecart_min_pct: 82, ecart_max_pct: 127, zone: "question" as const, nb_sources: 3, releve_le: "2026-09-15" },
  ];

  it("un groupe MIXTE n'est pas considéré couvert", () => {
    const cles = clesLignesMateriel(m4);
    const groupeMixte = { devis_lines: [
      { description: "Mitsubishi Réf: MXZ-4F72VF4 Unité extérieure" },
      { description: "Forfait main d'œuvre 4 jours ouvrés" },
    ]};
    expect(groupeEntierementCouvert(groupeMixte, cles)).toBe(false);
  });

  it("un groupe dont TOUTES les lignes sont couvertes l'est", () => {
    const cles = clesLignesMateriel(m4);
    expect(groupeEntierementCouvert(
      { devis_lines: [{ description: "Mitsubishi Réf: MXZ-4F72VF4 Unité extérieure" }] },
      cles,
    )).toBe(true);
  });

  it("un groupe vide n'est jamais 'couvert'", () => {
    expect(groupeEntierementCouvert({ devis_lines: [] }, new Set(["X"]))).toBe(false);
    expect(groupeEntierementCouvert({}, new Set(["X"]))).toBe(false);
  });

  it("🔴 n'est PAS chiffrable quand son groupe reste dans le calcul catalogue", () => {
    // Le cas réel : un groupe de 12 275 € contenant 4 lignes matériel sur 5.
    // Ajouter leur dépassement produisait « 9 758 à 16 242 € » de marge sur un
    // devis de 16 245 € — 99,98 % du devis.
    const groupes = [{ devis_lines: [
      { description: "Mitsubishi Réf: MXZ-4F72VF4 Unité extérieure" },
      { description: "Forfait main d'œuvre 4 jours ouvrés" },
    ]}];
    expect(materielChiffrable(m4, groupes)).toHaveLength(0);
  });

  it("EST chiffrable quand son groupe sort entièrement du calcul", () => {
    const groupes = [{ devis_lines: [{ description: "Mitsubishi Réf: MXZ-4F72VF4 Unité extérieure" }] }];
    expect(materielChiffrable(m4, groupes)).toHaveLength(1);
  });

  it("sans groupe connu, on ne retire rien", () => {
    expect(materielChiffrable(m4, [])).toHaveLength(1);
    expect(materielChiffrable([], [])).toHaveLength(0);
  });
});

describe("chiffrer le dépassement — ce qui va dans le score", () => {
  const mat = (p: Partial<import("./materielReference").MaterielVerifie>) => ({
    ligne: "Unité X", reference: "REF", designation: "d", quantite: 1,
    prix_unitaire_devis: 0, marche_min_ht: 100, marche_max_ht: 120,
    ecart_min_pct: 0, ecart_max_pct: 0, zone: "normal" as const,
    nb_sources: 2, releve_le: "2026-09-15", ...p,
  });

  it("🔴 ne chiffre PAS la marge normale de l'artisan", () => {
    // Facturé 168 € = +40 % sur le prix max : c'est l'usage du métier, pas un
    // surcoût. Le compter reviendrait à réclamer qu'il travaille gratuitement.
    expect(depassementUsage(mat({ prix_unitaire_devis: 168, marche_max_ht: 120 }))).toBe(0);
    // Pile au plafond d'usage (+50 %)
    expect(depassementUsage(mat({ prix_unitaire_devis: 180, marche_max_ht: 120 }))).toBe(0);
    // Au-delà : seul l'excédent compte, pas l'écart total
    expect(depassementUsage(mat({ prix_unitaire_devis: 200, marche_max_ht: 120 }))).toBe(20);
  });

  it("🔴 chiffre sur le prix distributeur le PLUS HAUT (asymétrie voulue)", () => {
    // Le cas réel CTXM15A : facturé 450 €, marché 291-308 €. Classé « mention »
    // (+55 % sur le prix bas) mais 450 < 308 × 1,5 = 462 → AUCUN montant.
    // On signale au pire cas, on chiffre au meilleur cas.
    const m = mat({ prix_unitaire_devis: 450, marche_min_ht: 290.83, marche_max_ht: 307.5, zone: "mention" });
    expect(depassementUsage(m)).toBe(0);
  });

  it("multiplie par la quantité", () => {
    expect(depassementUsage(mat({ prix_unitaire_devis: 200, marche_max_ht: 120, quantite: 4 }))).toBe(80);
  });

  it("se tait sous le plancher de 300 € — montant ET postes", () => {
    // Le cas réel VOLTELEC : 88 € + 11 € = 99 €. « 99 € à négocier » sur un
    // devis de 16 485 € décrédibiliserait tout le reste.
    const r = chiffrerDepassementMateriel([
      mat({ ligne: "Groupe 2 sorties", prix_unitaire_devis: 2650, marche_max_ht: 1708.25, zone: "mention" }),
      mat({ ligne: "Mural FTXM20", prix_unitaire_devis: 510, marche_max_ht: 332.5, zone: "question" }),
    ]);
    expect(r.montant).toBe(0);
    expect(r.postes).toEqual([]); // jamais de poste nommé sans montant affiché
  });

  it("chiffre et NOMME au-dessus du plancher, du plus cher au moins cher", () => {
    // Le cas réel DE2090 : quatre équipements au-dessus de l'usage.
    const r = chiffrerDepassementMateriel([
      mat({ ligne: "Mural MSZ-AY15VGK Très haute performance", prix_unitaire_devis: 750, marche_max_ht: 334, quantite: 4, zone: "question" }),
      mat({ ligne: "Groupe extérieur MXZ-3F68VF", prix_unitaire_devis: 3650, marche_max_ht: 1980.28, zone: "question" }),
    ]);
    expect(r.montant).toBeGreaterThan(1000);
    expect(r.postes).toHaveLength(2);
    expect(r.postes[0].ecart).toBeGreaterThanOrEqual(r.postes[1].ecart);
    // Le libellé est tronqué à son objet, pas à la fiche technique
    expect(r.postes.some((p) => p.label.includes("MSZ-AY15VGK"))).toBe(true);
    expect(r.postes.every((p) => !/Très haute performance/.test(p.label))).toBe(true);
  });

  it("aucun équipement hors usage → rien", () => {
    const r = chiffrerDepassementMateriel([mat({ prix_unitaire_devis: 150, marche_max_ht: 120 })]);
    expect(r).toEqual({ montant: 0, postes: [] });
  });
});

describe("objetDeLigne — l'objet, pas la fiche technique", () => {
  it("coupe la fiche produit en gardant la référence", () => {
    // Le libellé RÉEL du devis VOLTELEC : 400 caractères déversés bruts dans
    // le bandeau « postes sans équivalent », trois fois de suite.
    const brut = "- GROUPE EXTERTIEUR DAIKIN 4 SORTIES 8 kW DC INVERTER R32 4MXM80A8 Puissance froid: 1,50-4.00 – 4,20 Puissance chaud: 1.30- 4.2 - 4.60 Dimension: 734/974/408 Compresseur SWING Poids : 60 kg Pression sonore froid / chaud db(A): 46/48";
    const court = objetDeLigne(brut);
    expect(court).toBe("GROUPE EXTERTIEUR DAIKIN 4 SORTIES 8 kW DC INVERTER R32 4MXM80A8");
    expect(court).toContain("4MXM80A8"); // la référence survit : elle identifie le poste
    expect(court.length).toBeLessThan(90);
  });

  it("coupe aussi sur les qualificatifs commerciaux", () => {
    expect(objetDeLigne("MURAL DAIKIN PERFERA BLUEVOLUTION R32 FTXM42 Très haute performance énergétique A++"))
      .toBe("MURAL DAIKIN PERFERA BLUEVOLUTION R32 FTXM42");
  });

  it("laisse intact un libellé déjà court", () => {
    expect(objetDeLigne("Tuyau de condensat diamètre 22")).toBe("Tuyau de condensat diamètre 22");
  });

  it("retire la puce de tête et ne rend jamais une chaîne vide sur un libellé utile", () => {
    expect(objetDeLigne("— Liaison Frigorifique 1/4 3/8")).toBe("Liaison Frigorifique 1/4 3/8");
    expect(objetDeLigne("")).toBe("");
  });

  it("tronque de toute façon un libellé sans marque de spécification", () => {
    const long = "A".repeat(200);
    expect(objetDeLigne(long).length).toBeLessThanOrEqual(80);
    expect(objetDeLigne(long).endsWith("…")).toBe(true);
  });
});

describe("détection de la pose", () => {
  it.each([
    "Fourniture et pose d'une unité extérieure",
    "Pose de l'unité intérieure",
    "Installation mono split",
    "Main d'œuvre",
    "Mise en service comprenant tirage au vide",
    "Fourni et posé",
  ])("reconnaît « %s »", (t) => expect(ligneContientPose(t)).toBe(true));

  it.each([
    "MURAL DAIKIN PERFERA BLUEVOLUTION R32 FTXM42",
    "- GROUPE EXTERTIEUR DAIKIN 4 SORTIES 8 kW",
    "Unité intérieure MITSUBISHI MSZ-AY25VGK",
  ])("ne voit pas de pose dans « %s »", (t) => expect(ligneContientPose(t)).toBe(false));
});
