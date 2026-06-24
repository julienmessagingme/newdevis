/**
 * src/lib/analyse/extract/reconciliation.test.ts
 *
 * Tests unitaires Vitest pour le module de réconciliation arithmétique.
 *
 * Lance via : npm test reconciliation
 */

import { describe, it, expect } from "vitest";
import {
  reconcileLigne,
  reconcileSection,
  reconcileDevis,
  evaluerConfianceGlobale,
  type LigneInput,
  type SectionInput,
  type DevisInput,
} from "./reconciliation";

// ──────────────────────────────────────────────────────────────────────────────
// reconcileLigne
// ──────────────────────────────────────────────────────────────────────────────

describe("reconcileLigne", () => {
  const baseLigne: LigneInput = {
    id_hierarchique: "1.1",
    libelle: "Pose carrelage sol",
    quantite: null,
    unite: "m2",
    prix_unitaire: null,
    montant_total: null,
  };

  describe("Cas 5 — Aucun connu", () => {
    it("retourne tout absent + arithmetique invalide", () => {
      const r = reconcileLigne({ ...baseLigne });
      expect(r.quantite_resolved).toBeNull();
      expect(r.prix_unitaire_resolved).toBeNull();
      expect(r.montant_total_resolved).toBeNull();
      expect(r.quantite_confidence.source).toBe("absent");
      expect(r.prix_unitaire_confidence.source).toBe("absent");
      expect(r.montant_total_confidence.source).toBe("absent");
      expect(r.arithmetique_valide).toBe(false);
      expect(r.diagnostic).toContain("Aucune valeur lisible");
    });
  });

  describe("Cas 4 — 1 seul connu", () => {
    it("qty seule connue → invalide mais sans calcul", () => {
      const r = reconcileLigne({ ...baseLigne, quantite: 85 });
      expect(r.quantite_resolved).toBe(85);
      expect(r.quantite_confidence.source).toBe("lu");
      expect(r.prix_unitaire_confidence.source).toBe("absent");
      expect(r.arithmetique_valide).toBe(false);
    });

    it("montant seul connu → invalide mais sans calcul", () => {
      const r = reconcileLigne({ ...baseLigne, montant_total: 2550 });
      expect(r.montant_total_resolved).toBe(2550);
      expect(r.montant_total_confidence.source).toBe("lu");
      expect(r.prix_unitaire_confidence.source).toBe("absent");
      expect(r.arithmetique_valide).toBe(false);
    });
  });

  describe("Cas 3 — 2 connus, calcule le 3e", () => {
    it("qty + prix_u → calcule montant", () => {
      const r = reconcileLigne({ ...baseLigne, quantite: 85, prix_unitaire: 30 });
      expect(r.montant_total_resolved).toBe(2550);
      expect(r.montant_total_confidence.source).toBe("calcule");
      expect(r.montant_total_confidence.value_recalculated).toBe(2550);
      expect(r.arithmetique_valide).toBe(true);
    });

    it("qty + montant → calcule prix_u", () => {
      const r = reconcileLigne({ ...baseLigne, quantite: 85, montant_total: 2550 });
      expect(r.prix_unitaire_resolved).toBe(30);
      expect(r.prix_unitaire_confidence.source).toBe("calcule");
      expect(r.arithmetique_valide).toBe(true);
    });

    it("prix_u + montant → calcule qty", () => {
      const r = reconcileLigne({ ...baseLigne, prix_unitaire: 30, montant_total: 2550 });
      expect(r.quantite_resolved).toBe(85);
      expect(r.quantite_confidence.source).toBe("calcule");
      expect(r.arithmetique_valide).toBe(true);
    });
  });

  describe("Cas 1 — 3 connus cohérents", () => {
    it("tous lus + cohérents → arithmétique valide", () => {
      const r = reconcileLigne({
        ...baseLigne,
        quantite: 85,
        prix_unitaire: 30,
        montant_total: 2550,
      });
      expect(r.arithmetique_valide).toBe(true);
      expect(r.quantite_confidence.source).toBe("lu");
      expect(r.prix_unitaire_confidence.source).toBe("lu");
      expect(r.montant_total_confidence.source).toBe("lu");
      expect(r.diagnostic).toBeUndefined();
    });

    it("écart d'arrondi inférieur à 50 cts → coherent (cas BTP)", () => {
      // 85 × 30.005 = 2550.425 ≈ 2550 (écart 0.42€ < 0.50€)
      const r = reconcileLigne({
        ...baseLigne,
        quantite: 85,
        prix_unitaire: 30.005,
        montant_total: 2550,
      });
      expect(r.arithmetique_valide).toBe(true);
    });

    it("écart de centimes (1%) → coherent", () => {
      // 100 × 25 = 2500, devis affiche 2525 (1% d'écart, dans la tolérance)
      const r = reconcileLigne({
        ...baseLigne,
        quantite: 100,
        prix_unitaire: 25,
        montant_total: 2525,
      });
      expect(r.arithmetique_valide).toBe(true);
    });
  });

  describe("Cas 2 — 3 connus avec désaccord", () => {
    it("écart majeur → arithmétique invalide + diagnostic", () => {
      // 100 × 25 = 2500, devis affiche 5000 (100% d'écart)
      const r = reconcileLigne({
        ...baseLigne,
        quantite: 100,
        prix_unitaire: 25,
        montant_total: 5000,
      });
      expect(r.arithmetique_valide).toBe(false);
      expect(r.diagnostic).toContain("Incohérence majeure");
      expect(r.montant_total_confidence.value_recalculated).toBe(2500);
      expect(r.montant_total_confidence.delta_pct).toBeGreaterThan(0.4);
    });

    it("incohérence mineure (3%) → invalide mais sans alerte majeure", () => {
      // 100 × 25 = 2500, devis affiche 2575 (3% d'écart)
      const r = reconcileLigne({
        ...baseLigne,
        quantite: 100,
        prix_unitaire: 25,
        montant_total: 2575,
      });
      expect(r.arithmetique_valide).toBe(false);
      expect(r.diagnostic).toContain("Incohérence mineure");
    });
  });

  describe("Cas BTP — application 2 couches (bug Phase 1.7 du PDF)", () => {
    it("Reconcilie correctement même si qty surface × 2 (le bug est ailleurs, le module reste honnête)", () => {
      // 138 m² × 2 couches : si le devis affiche qty=138 et montant=276×prix, l'extraction est mal lue.
      // Le module ici réconcilie ce qu'on lui donne. Le bug 2 couches sera traité en Phase 4
      // (rattachement annexes) et en Phase 3 (extraction du multiplicateur de couches dans tags_nature).
      const r = reconcileLigne({
        ...baseLigne,
        quantite: 138,
        prix_unitaire: 25,
        montant_total: 6900, // 276 × 25 — devis affiche montant 2 couches
      });
      // Réconciliation : 138 × 25 = 3450 ≠ 6900 → incohérence détectée
      expect(r.arithmetique_valide).toBe(false);
      expect(r.diagnostic).toContain("Incohérence");
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// reconcileSection
// ──────────────────────────────────────────────────────────────────────────────

describe("reconcileSection", () => {
  it("sous-total connu et cohérent avec lignes → coherent=true", () => {
    const section: SectionInput = {
      id_hierarchique: "1",
      libelle: "Salle de bain",
      sous_total_lu: 5050,
      lignes: [
        {
          id_hierarchique: "1.1",
          libelle: "Pose carrelage sol",
          quantite: 85,
          unite: "m2",
          prix_unitaire: 30,
          montant_total: 2550,
        },
        {
          id_hierarchique: "1.2",
          libelle: "Pose faïence murale",
          quantite: 50,
          unite: "m2",
          prix_unitaire: 50,
          montant_total: 2500,
        },
      ],
    };
    const r = reconcileSection(section);
    expect(r.coherent).toBe(true);
    expect(r.sous_total_recalcule).toBe(5050);
    expect(r.ecart_pct).toBe(0);
  });

  it("sous-total non lu (null) → coherent=true (le recalculé fait foi)", () => {
    const section: SectionInput = {
      id_hierarchique: "1",
      libelle: "SDB sans sous-total",
      sous_total_lu: null,
      lignes: [
        {
          id_hierarchique: "1.1",
          libelle: "Pose carrelage",
          quantite: 85,
          unite: "m2",
          prix_unitaire: 30,
          montant_total: 2550,
        },
      ],
    };
    const r = reconcileSection(section);
    expect(r.coherent).toBe(true);
    expect(r.sous_total_recalcule).toBe(2550);
  });

  it("sous-total incohérent (écart > 1%) → coherent=false", () => {
    const section: SectionInput = {
      id_hierarchique: "1",
      libelle: "SDB avec sous-total faux",
      sous_total_lu: 8000, // affiché 8000 mais Σ lignes = 5050
      lignes: [
        {
          id_hierarchique: "1.1",
          libelle: "Pose carrelage",
          quantite: 85,
          unite: "m2",
          prix_unitaire: 30,
          montant_total: 2550,
        },
        {
          id_hierarchique: "1.2",
          libelle: "Pose faïence",
          quantite: 50,
          unite: "m2",
          prix_unitaire: 50,
          montant_total: 2500,
        },
      ],
    };
    const r = reconcileSection(section);
    expect(r.coherent).toBe(false);
    expect(r.sous_total_recalcule).toBe(5050);
    expect(r.ecart_pct).toBeGreaterThan(0.3);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// reconcileDevis
// ──────────────────────────────────────────────────────────────────────────────

describe("reconcileDevis", () => {
  it("devis simple cohérent → certifie", () => {
    const devis: DevisInput = {
      total_ht_lu: 5050,
      total_tva_lu: 1010,
      total_ttc_lu: 6060,
      sections: [
        {
          id_hierarchique: "1",
          libelle: "Travaux",
          sous_total_lu: 5050,
          lignes: [
            {
              id_hierarchique: "1.1",
              libelle: "Pose carrelage",
              quantite: 85,
              unite: "m2",
              prix_unitaire: 30,
              montant_total: 2550,
            },
            {
              id_hierarchique: "1.2",
              libelle: "Pose faïence",
              quantite: 50,
              unite: "m2",
              prix_unitaire: 50,
              montant_total: 2500,
            },
          ],
        },
      ],
    };
    const r = reconcileDevis(devis);
    expect(r.total_devis_coherent).toBe(true);
    expect(r.total_ht_recalcule).toBe(5050);
    expect(r.confiance_globale).toBe("certifie");
    expect(r.stats.nb_lignes_prix_lu).toBe(2);
    expect(r.stats.nb_lignes_arithmetique_invalide).toBe(0);
  });

  it("devis avec remise globale → recalcule total correctement", () => {
    const devis: DevisInput = {
      total_ht_lu: 4550, // 5050 − 500 de remise
      total_tva_lu: 910,
      total_ttc_lu: 5460,
      remise_appliquee: 500,
      sections: [
        {
          id_hierarchique: "1",
          libelle: "Travaux",
          sous_total_lu: 5050,
          lignes: [
            {
              id_hierarchique: "1.1",
              libelle: "Pose carrelage",
              quantite: 85,
              unite: "m2",
              prix_unitaire: 30,
              montant_total: 2550,
            },
            {
              id_hierarchique: "1.2",
              libelle: "Pose faïence",
              quantite: 50,
              unite: "m2",
              prix_unitaire: 50,
              montant_total: 2500,
            },
          ],
        },
      ],
    };
    const r = reconcileDevis(devis);
    expect(r.total_ht_recalcule).toBe(4550);
    expect(r.total_devis_coherent).toBe(true);
  });

  it("devis avec prix manquants sur 30% des lignes → non_comparable", () => {
    const devis: DevisInput = {
      total_ht_lu: 5050,
      total_tva_lu: 1010,
      total_ttc_lu: 6060,
      sections: [
        {
          id_hierarchique: "1",
          libelle: "Travaux",
          sous_total_lu: 5050,
          lignes: [
            // 3 lignes avec prix lu
            {
              id_hierarchique: "1.1",
              libelle: "Pose carrelage",
              quantite: 85,
              unite: "m2",
              prix_unitaire: 30,
              montant_total: 2550,
            },
            {
              id_hierarchique: "1.2",
              libelle: "Pose faïence",
              quantite: 50,
              unite: "m2",
              prix_unitaire: 50,
              montant_total: 2500,
            },
            {
              id_hierarchique: "1.3",
              libelle: "Joints silicone",
              quantite: null,
              unite: null,
              prix_unitaire: null,
              montant_total: null,
            },
            // 7 lignes sans prix
            ...Array.from({ length: 7 }, (_, i) => ({
              id_hierarchique: `1.${i + 4}`,
              libelle: `Annexe ${i}`,
              quantite: null,
              unite: null,
              prix_unitaire: null,
              montant_total: null,
            })),
          ],
        },
      ],
    };
    const r = reconcileDevis(devis);
    // 8/10 = 80% absent > 30% → non_comparable
    expect(r.confiance_globale).toBe("non_comparable");
    expect(r.stats.nb_lignes_prix_absent).toBe(8);
  });

  it("devis avec prix calculés (qty + montant lus) → indicatif", () => {
    const devis: DevisInput = {
      total_ht_lu: 5050,
      total_tva_lu: 1010,
      total_ttc_lu: 6060,
      sections: [
        {
          id_hierarchique: "1",
          libelle: "Travaux",
          sous_total_lu: 5050,
          lignes: Array.from({ length: 10 }, (_, i) => ({
            id_hierarchique: `1.${i + 1}`,
            libelle: `Ligne ${i}`,
            quantite: 10,
            unite: "m2",
            prix_unitaire: null, // pas lu → calculé
            montant_total: 505,
          })),
        },
      ],
    };
    const r = reconcileDevis(devis);
    expect(r.confiance_globale).toBe("indicatif");
    expect(r.stats.nb_lignes_prix_calcule).toBe(10);
    expect(r.stats.nb_lignes_prix_lu).toBe(0);
  });

  it("écart total > 5% → non_comparable même si tout est lu", () => {
    const devis: DevisInput = {
      total_ht_lu: 8000, // affiché 8000 mais Σ recalculé = 5050
      total_tva_lu: 1600,
      total_ttc_lu: 9600,
      sections: [
        {
          id_hierarchique: "1",
          libelle: "Travaux",
          sous_total_lu: 5050,
          lignes: [
            {
              id_hierarchique: "1.1",
              libelle: "Pose carrelage",
              quantite: 85,
              unite: "m2",
              prix_unitaire: 30,
              montant_total: 2550,
            },
            {
              id_hierarchique: "1.2",
              libelle: "Pose faïence",
              quantite: 50,
              unite: "m2",
              prix_unitaire: 50,
              montant_total: 2500,
            },
          ],
        },
      ],
    };
    const r = reconcileDevis(devis);
    expect(r.confiance_globale).toBe("non_comparable");
    expect(r.total_devis_coherent).toBe(false);
    expect(r.ecart_total_pct).toBeGreaterThan(0.3);
  });

  it("devis vide (zéro section) → non_comparable", () => {
    const devis: DevisInput = {
      total_ht_lu: 0,
      total_tva_lu: 0,
      total_ttc_lu: 0,
      sections: [],
    };
    const r = reconcileDevis(devis);
    expect(r.confiance_globale).toBe("non_comparable");
    expect(r.stats.nb_lignes_total).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Scénarios complets — banc de tests
// ──────────────────────────────────────────────────────────────────────────────

describe("Scénarios devis canoniques", () => {
  it("Devis simple cuisine 4 lignes — certifié", () => {
    const devis: DevisInput = {
      total_ht_lu: 5500,
      total_tva_lu: 1100,
      total_ttc_lu: 6600,
      sections: [
        {
          id_hierarchique: "1",
          libelle: "Cuisine",
          sous_total_lu: 5500,
          lignes: [
            {
              id_hierarchique: "1.1",
              libelle: "Plan de travail granit",
              quantite: 4,
              unite: "ml",
              prix_unitaire: 500,
              montant_total: 2000,
            },
            {
              id_hierarchique: "1.2",
              libelle: "Crédence carrelage",
              quantite: 5,
              unite: "m2",
              prix_unitaire: 100,
              montant_total: 500,
            },
            {
              id_hierarchique: "1.3",
              libelle: "Pose hotte aspirante",
              quantite: 1,
              unite: "u",
              prix_unitaire: 200,
              montant_total: 200,
            },
            {
              id_hierarchique: "1.4",
              libelle: "Installation cuisine complète (MO)",
              quantite: 1,
              unite: "forfait",
              prix_unitaire: 2800,
              montant_total: 2800,
            },
          ],
        },
      ],
    };
    const r = reconcileDevis(devis);
    expect(r.confiance_globale).toBe("certifie");
  });

  it("Devis avec sous-total absent — recalcul fait foi", () => {
    const devis: DevisInput = {
      total_ht_lu: 2550,
      total_tva_lu: 510,
      total_ttc_lu: 3060,
      sections: [
        {
          id_hierarchique: "1",
          libelle: "SDB sans sous-total affiché",
          sous_total_lu: null,
          lignes: [
            {
              id_hierarchique: "1.1",
              libelle: "Pose carrelage",
              quantite: 85,
              unite: "m2",
              prix_unitaire: 30,
              montant_total: 2550,
            },
          ],
        },
      ],
    };
    const r = reconcileDevis(devis);
    expect(r.total_devis_coherent).toBe(true);
    expect(r.confiance_globale).toBe("certifie");
  });
});
