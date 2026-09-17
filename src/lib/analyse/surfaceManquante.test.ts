/**
 * Tests du contrôle d'absence de quantité.
 * Cas tirés du stock réel (mesure du 2026-08-30 sur 220 devis FR).
 */
import { describe, it, expect } from "vitest";
import { diagnostiquerQuantites, partMontantQuantifie, devisReellementInanalysable, PART_MONTANT_QUANTIFIE_MIN } from "./surfaceManquante";

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

// ─────────────────────────────────────────────────────────────────────────────
// 2026-09-17 — « la surface est bien indiquée de 64 m², donc notre verdict est
// faux » (retour Johan). Un devis qui porte ses quantités n'est pas un résumé.
// ─────────────────────────────────────────────────────────────────────────────
describe("devisReellementInanalysable", () => {
  /** Le cas RÉEL qui a déclenché la règle : couverture, 38 000 € HT, 10 lignes,
   *  deux seulement portent « 64 m² » — mais elles pèsent 29 % du montant. */
  const couverture64m2 = [
    { libelle: "Installation, sécurisation et protection du chantier", unite: null, quantite: null, montant: 2800 },
    { libelle: "Dépose soignée des tuiles et stockage pour réemploi - 64 m²", unite: "m²", quantite: 64, montant: 5200 },
    { libelle: "Dépose des liteaux existants et mise en décharge", unite: null, quantite: null, montant: 2200 },
    { libelle: "Diagnostic visuel de la charpente", unite: null, quantite: null, montant: 1800 },
    { libelle: "Fourniture et pose de l'écran sous-toiture - 64 m²", unite: "m²", quantite: 64, montant: 5800 },
    { libelle: "Fourniture et pose du contre-lattage neuf", unite: null, quantite: null, montant: 5100 },
    { libelle: "Fourniture et pose du litonnage neuf", unite: null, quantite: null, montant: 5200 },
    { libelle: "Étanchéité complète de deux pieds de cheminée", unite: null, quantite: null, montant: 5700 },
    { libelle: "Repose des tuiles réutilisables", unite: null, quantite: null, montant: 3300 },
    { libelle: "Repli, évacuation des déchets et nettoyage final", unite: null, quantite: null, montant: 900 },
  ];

  it("un devis dont 29 % du montant est quantifié N'EST PAS inanalysable", () => {
    expect(partMontantQuantifie(couverture64m2)).toBeCloseTo(0.289, 2);
    expect(devisReellementInanalysable(couverture64m2)).toBe(false);
  });

  it("un vrai résumé par lot reste inanalysable", () => {
    // Le cas d'origine du bypass (V3.5.1) : un sous-total par corps de métier.
    const resumeParLot = [
      { libelle: "Plomberie", unite: null, quantite: null, montant: 7600 },
      { libelle: "Électricité", unite: null, quantite: null, montant: 5400 },
      { libelle: "Peinture", unite: null, quantite: null, montant: 3200 },
    ];
    expect(partMontantQuantifie(resumeParLot)).toBe(0);
    expect(devisReellementInanalysable(resumeParLot)).toBe(true);
  });

  it("une quantité ANECDOTIQUE ne suffit pas à rendre un résumé analysable", () => {
    // 1 ligne quantifiée sur 4, mais elle ne porte que 5 % du montant : le
    // devis reste un résumé. C'est ce qui sépare les 2 devis qui basculent des
    // 15 qui ne basculent pas.
    const presqueResume = [
      { libelle: "Plomberie", unite: null, quantite: null, montant: 7600 },
      { libelle: "Électricité", unite: null, quantite: null, montant: 5400 },
      { libelle: "Peinture", unite: null, quantite: null, montant: 3200 },
      { libelle: "Faïence", unite: "m²", quantite: 10, montant: 850 },
    ];
    expect(partMontantQuantifie(presqueResume)).toBeLessThan(PART_MONTANT_QUANTIFIE_MIN);
    expect(devisReellementInanalysable(presqueResume)).toBe(true);
  });

  it("un devis SANS AUCUN PRIX reste inanalysable, même avec des unités", () => {
    // Garde du 13/09 (« Entreprise Fk ») : sans montant, il n'y a rien à
    // comparer — et une part de zéro sur zéro ne vaut pas « quantifié ».
    const sansPrix = [
      { libelle: "Ravalement", unite: "m²", quantite: 80, montant: null },
      { libelle: "Enduit", unite: "m²", quantite: 80, montant: 0 },
    ];
    expect(partMontantQuantifie(sansPrix)).toBe(0);
    expect(devisReellementInanalysable(sansPrix)).toBe(true);
  });

  it("une unité NON métrique ne compte pas comme une quantité exploitable", () => {
    // « 1 u » n'autorise pas à comparer à un tarif au m² — c'est le défaut du
    // 30/08 (cas ALES) qu'on ne veut surtout pas rouvrir.
    const forfaits = [
      { libelle: "Salle de bain complète", unite: "u", quantite: 1, montant: 8950 },
      { libelle: "Cuisine", unite: "forfait", quantite: 1, montant: 6200 },
    ];
    expect(partMontantQuantifie(forfaits)).toBe(0);
    expect(devisReellementInanalysable(forfaits)).toBe(true);
  });
});
