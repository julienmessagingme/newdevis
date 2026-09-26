import { describe, it, expect } from "vitest";
import {
  invaliderRapprochements,
  LIBELLE_NON_COMPARABLE,
} from "./invalidationRapprochement";

/**
 * ⚠️ LES DONNÉES D'ENTRÉE VIENNENT DU DEVIS RÉEL « noreco peinture2 », pas de
 * mémoire. Un test sur une donnée de production se construit depuis la donnée
 * de production (leçon du 17/09, où un jeu de test écrit de tête protégeait un
 * bug au lieu de l'attraper).
 */
const devisReel = () => [
  {
    devis_lines: [{ description: "réparation et application enduit … : chambre 1" }],
    job_type_label: "Peinture pièce ~12m² (murs+plafond)",
    prices: [{ job_type: "peinture_piece_12m2" }],
    vectorial: { confidence: "high", top_similarity: 0.81 },
  },
  {
    devis_lines: [{ description: "chambre 2" }],
    job_type_label: "Non comparable",
    prices: [],
    vectorial: { confidence: "no_match" },
  },
  {
    devis_lines: [{ description: "salon" }],
    job_type_label: "Miroir salon / dressing (fourni+posé)",
    prices: [{ job_type: "miroir_salon_pose" }],
    vectorial: { confidence: "high" },
  },
  {
    devis_lines: [{ description: "cuisine" }],
    job_type_label: "Aménagement cuisine complète (hors électroménager)",
    prices: [{ job_type: "amenagement_cuisine_complet" }],
    vectorial: { confidence: "high" },
  },
];

describe("invaliderRapprochements", () => {
  it("retire le tarif, le libellé catalogue et la confiance du groupe visé", () => {
    const r = invaliderRapprochements(devisReel(), [2]);
    expect(r.invalides).toEqual(["salon"]);
    expect(r.groupes[2].prices).toEqual([]);
    expect(r.groupes[2].job_type_label).toBe(LIBELLE_NON_COMPARABLE);
    expect(r.groupes[2].vectorial).toMatchObject({ confidence: "no_match" });
  });

  it("CONSERVE les tarifs d'origine — une invalidation erronée doit rester réversible", () => {
    const r = invaliderRapprochements(devisReel(), [2]);
    expect(r.groupes[2].prices_invalides_par_expert).toEqual([{ job_type: "miroir_salon_pose" }]);
    expect(r.groupes[2].job_type_label_invalide_par_expert).toBe(
      "Miroir salon / dressing (fourni+posé)",
    );
  });

  it("ne mute jamais le tableau d'entrée", () => {
    const entree = devisReel();
    invaliderRapprochements(entree, [2, 3]);
    expect(entree[2].prices).toHaveLength(1);
    expect(entree[2].job_type_label).toBe("Miroir salon / dressing (fourni+posé)");
  });

  it("ignore un groupe déjà sans tarif — et ne le COMPTE pas comme invalidé", () => {
    // ⚠️ C'est ce qui permet à l'écran d'annoncer « 1 sur 2 » plutôt qu'un faux
    // succès complet. Sans cet écart, une demande sans effet passerait inaperçue.
    const r = invaliderRapprochements(devisReel(), [1, 2]);
    expect(r.demandes).toBe(2);
    expect(r.invalides).toEqual(["salon"]);
  });

  it("signale un indice hors du devis et N'APPLIQUE RIEN", () => {
    const r = invaliderRapprochements(devisReel(), [2, 99]);
    expect(r.indicesInvalides).toEqual([99]);
    expect(r.invalides).toEqual([]);
    expect(r.groupes[2].prices).toHaveLength(1); // rien n'a été touché
  });

  it("refuse un indice qui n'est pas un entier plutôt que de l'arrondir", () => {
    expect(invaliderRapprochements(devisReel(), ["2"]).indicesInvalides).toEqual(["2"] as never);
    expect(invaliderRapprochements(devisReel(), [1.5]).indicesInvalides).toEqual([1.5]);
    expect(invaliderRapprochements(devisReel(), [-1]).indicesInvalides).toEqual([-1]);
  });

  it("déduplique les indices", () => {
    const r = invaliderRapprochements(devisReel(), [2, 2, 2]);
    expect(r.demandes).toBe(1);
    expect(r.invalides).toEqual(["salon"]);
  });

  it("invalide plusieurs groupes dans l'ordre des indices, quel que soit l'ordre demandé", () => {
    // ⚠️ TÉMOIN D'IDENTIFICATION PAR INDICE : les deux groupes visés portent des
    // libellés DIFFÉRENTS mais aucune des deux lignes ne les contient. Une
    // implémentation qui rapprocherait par intitulé n'invaliderait rien.
    const r = invaliderRapprochements(devisReel(), [3, 2]);
    expect(r.invalides).toEqual(["salon", "cuisine"]);
  });

  it("ne touche à rien quand aucun indice n'est demandé", () => {
    const r = invaliderRapprochements(devisReel(), []);
    expect(r.invalides).toEqual([]);
    expect(r.demandes).toBe(0);
    expect(r.groupes[2].prices).toHaveLength(1);
  });

  it("supporte une donnée absente sans lever", () => {
    expect(invaliderRapprochements(null, [0]).indicesInvalides).toEqual([0]);
    expect(invaliderRapprochements(devisReel(), null).invalides).toEqual([]);
  });

  it("nomme le groupe par sa LIGNE DE DEVIS, jamais par notre étiquette catalogue", () => {
    // Règle du 10/09 : notre libellé est une hypothèse ; l'afficher à la place
    // du texte de l'artisan ferait juger notre vocabulaire, pas le rapprochement.
    const r = invaliderRapprochements(devisReel(), [3]);
    expect(r.invalides[0]).toBe("cuisine");
    expect(r.invalides[0]).not.toContain("Aménagement");
  });

  it("se rabat sur l'indice quand la ligne du devis n'a pas de libellé", () => {
    const sans = [{ prices: [{ job_type: "x" }], devis_lines: [] }];
    expect(invaliderRapprochements(sans, [0]).invalides).toEqual(["groupe 0"]);
  });
});
