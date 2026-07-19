/**
 * src/lib/analyse/preparationBuilder.test.ts
 *
 * Vérifie que la reformulation des données du moteur en 3 sections
 * narratives ne trahit ni la donnée d'origine ni l'esprit de la Bible
 * Produit VMD.
 */

import { describe, it, expect } from "vitest";
import {
  buildPreparationSections,
  extractArtisanFirstName,
} from "./preparationBuilder";
import type { ConclusionData } from "./conclusionTypes";

const baseConclusion: ConclusionData = {
  verdict_global: "a_negocier",
  phrase_intro: "Prix globalement raisonnable, quelques prestations au-dessus.",
  anomalies: [],
  justifications: "",
  has_anomalies: false,
  verdict_decisionnel: "signer_avec_negociation",
  surcout_global: { min: 300, max: 500 },
  niveau_risque: "modéré",
  actions_avant_signature: [],
  generated_at: new Date().toISOString(),
};

describe("preparationBuilder — buildPreparationSections", () => {
  it("produit une ouverture fusionnée sans doublon 'l'entreprise'", () => {
    const { rappelPourOuvrir } = buildPreparationSections(
      baseConclusion,
      ["Entreprise active depuis 2014", "Note Google 4.6/5 sur 47 avis"],
      [],
    );
    expect(rappelPourOuvrir).not.toBeNull();
    // Une seule mention de "L'entreprise" (fusion élégante)
    const occurrences = (rappelPourOuvrir!.match(/L['']entreprise/gi) ?? []).length;
    expect(occurrences).toBe(1);
    expect(rappelPourOuvrir).toContain("établie depuis longtemps");
    expect(rappelPourOuvrir).toContain("bien notée");
  });

  it("ne scénarise pas la conversation avec l'artisan", () => {
    const { rappelPourOuvrir } = buildPreparationSections(
      baseConclusion,
      ["Entreprise active depuis 2014"],
      [],
    );
    expect(rappelPourOuvrir).not.toBeNull();
    // Aucun méta-conseil scénarisé
    expect(rappelPourOuvrir).not.toMatch(/bonne base de conversation/i);
    expect(rappelPourOuvrir).not.toMatch(/mieux vaut le lui dire/i);
    expect(rappelPourOuvrir).not.toMatch(/en ouverture/i);
    expect(rappelPourOuvrir).not.toMatch(/correspond à votre projet/i);
  });

  it("silence assumé quand aucun point_ok tangible (même verdict signer)", () => {
    const conclusion = { ...baseConclusion, verdict_decisionnel: "signer" as const };
    const { rappelPourOuvrir } = buildPreparationSections(conclusion, [], []);
    // Silence — pas d'invention de phrase générique
    expect(rappelPourOuvrir).toBeNull();
  });

  it("silence sur verdict à risque sans données positives", () => {
    const conclusion = { ...baseConclusion, verdict_decisionnel: "ne_pas_signer" as const };
    const { rappelPourOuvrir } = buildPreparationSections(conclusion, [], []);
    expect(rappelPourOuvrir).toBeNull();
  });

  it("reformule sans préfixe 'Point à faire préciser :' redondant", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: ["Demandez la surface exacte du poste peinture"],
    };
    const { aDemander } = buildPreparationSections(conclusion, [], []);
    expect(aDemander).toHaveLength(1);
    // Le préfixe est retiré — le titre de section porte l'intention
    expect(aDemander[0].context).not.toMatch(/^Point à faire préciser/i);
    expect(aDemander[0].context).not.toMatch(/^Point à ouvrir à la discussion/i);
    // Le contenu factuel reste (avec majuscule initiale)
    expect(aDemander[0].context.toLowerCase()).toContain("surface exacte");
    expect(aDemander[0].question).toMatch(/«.*»/);
  });

  it("filtre les items purement informatifs de la section « à ne pas oublier »", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: [
        "Demandez l'attestation d'assurance décennale",
      ],
    };
    const alertes = [
      "Acompte modéré (50%). Un acompte ≤ 30% est généralement recommandé. Cela reste une pratique courante.",
    ];
    const { aNePasOublier } = buildPreparationSections(conclusion, [], alertes);
    // Aucun item ne doit contenir de wording informatif "pratique courante"
    for (const item of aNePasOublier) {
      expect(item).not.toMatch(/pratique courante/i);
      expect(item).not.toMatch(/généralement recommandé/i);
      expect(item).not.toMatch(/cela reste/i);
    }
  });

  it("retire 'à l'artisan' / 'à l'entreprise' après le verbe impératif", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: [
        "Demandez à l'artisan un devis détaillé avec unités précisées",
      ],
    };
    const { aDemander } = buildPreparationSections(conclusion, [], []);
    expect(aDemander).toHaveLength(1);
    // Ne doit PAS commencer par « à l'artisan » ou « à l'entreprise »
    expect(aDemander[0].context).not.toMatch(/à\s+l['']?(artisan|entreprise)/i);
    expect(aDemander[0].context.toLowerCase()).toContain("devis détaillé");
  });

  it("nettoie les emojis colorés (🔴 🟠) et puces qui traînent dans les alertes", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: [
        "Demandez à l'entreprise l'attestation d'assurance décennale valide pour 2026",
      ],
    };
    const alertes = [
      "🔴 Comptes non accessibles publiquement (dernier exercice connu : 2016)",
      "🟠 Note Google 3.3/5 — réputation à surveiller",
    ];
    // Force le passage en section 3 via le keyword "assurance" / "décennale"
    const { aNePasOublier } = buildPreparationSections(conclusion, [], alertes);
    // Aucun item ne doit contenir d'emoji couleur ou de puce
    for (const item of aNePasOublier) {
      expect(item).not.toMatch(/[🔴🟠🟡🟢🔵⚠]/u);
      expect(item.trim()).not.toMatch(/^[•●▪▫]/);
    }
  });

  it("ne double pas le verbe impératif dans la section « à ne pas oublier »", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: [
        "Demandez à l'entreprise de justifier l'absence de publication de ses comptes",
        "Demandez l'attestation d'assurance décennale",
      ],
    };
    const { aNePasOublier } = buildPreparationSections(conclusion, [], []);
    // Aucun item ne doit commencer par un verbe impératif de demande
    for (const item of aNePasOublier) {
      expect(item).not.toMatch(/^(demand(?:ez|er)|exig(?:ez|er)|réclam)/i);
    }
    // Doit contenir des groupes nominaux (attestation, justification, etc.)
    expect(aNePasOublier.length).toBeGreaterThanOrEqual(1);
  });

  it("classe les actions standard (attestation, décennale, planning) en section 3", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: [
        "Demandez l'attestation d'assurance décennale valide pour 2026",
        "Demandez le planning de démarrage",
      ],
    };
    const { aDemander, aNePasOublier } = buildPreparationSections(conclusion, [], []);
    expect(aDemander).toHaveLength(0);
    expect(aNePasOublier).toHaveLength(2);
  });

  it("ne mélange jamais standards et questions", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: [
        "Demandez de préciser la surface de peinture",
        "Demandez l'attestation décennale",
        "Négociez le prix du carrelage sol",
      ],
    };
    const { aDemander, aNePasOublier } = buildPreparationSections(conclusion, [], []);
    expect(aDemander.length).toBeGreaterThanOrEqual(2);
    expect(aNePasOublier.length).toBeGreaterThanOrEqual(1);
    // La section 2 ne contient jamais d'items déjà présents en section 3
    for (const item of aDemander) {
      expect(item.context.toLowerCase()).not.toContain("décennale");
      expect(item.context.toLowerCase()).not.toContain("attestation");
    }
  });

  it("cap dur : maximum 4 questions et 3 rappels", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: [
        "Demandez A", "Demandez B", "Demandez C", "Demandez D", "Demandez E", "Demandez F",
        "Demandez l'attestation X", "Demandez l'assurance Y", "Demandez l'attestation Z", "Demandez la décennale W",
      ],
    };
    const { aDemander, aNePasOublier } = buildPreparationSections(conclusion, [], []);
    expect(aDemander.length).toBeLessThanOrEqual(4);
    expect(aNePasOublier.length).toBeLessThanOrEqual(3);
  });

  it("agrège proprement quand tout est vide", () => {
    const { rappelPourOuvrir, aDemander, aNePasOublier } = buildPreparationSections(
      baseConclusion,
      [],
      [],
    );
    expect(rappelPourOuvrir).toBeNull();
    expect(aDemander).toEqual([]);
    expect(aNePasOublier).toEqual([]);
  });
});

describe("preparationBuilder — extractArtisanFirstName", () => {
  it("extrait un prénom simple", () => {
    expect(extractArtisanFirstName("Marc Dubois")).toBe("Marc");
    expect(extractArtisanFirstName("Julie Peinture")).toBe("Julie");
  });

  it("refuse les raisons sociales", () => {
    expect(extractArtisanFirstName("SARL Dubois Peinture")).toBeNull();
    expect(extractArtisanFirstName("Ent. Dupont & Fils")).toBeNull();
    expect(extractArtisanFirstName("SAS Renov Plus")).toBeNull();
    expect(extractArtisanFirstName("Entreprise Martin")).toBeNull();
    expect(extractArtisanFirstName("Groupe Sud Rénovation")).toBeNull();
  });

  it("refuse les noms contenant des chiffres", () => {
    expect(extractArtisanFirstName("Renov 2000")).toBeNull();
  });

  it("refuse les noms commençant par une minuscule", () => {
    expect(extractArtisanFirstName("marc dubois")).toBeNull();
  });

  it("retourne null sur null/undefined/vide", () => {
    expect(extractArtisanFirstName(null)).toBeNull();
    expect(extractArtisanFirstName(undefined)).toBeNull();
    expect(extractArtisanFirstName("")).toBeNull();
    expect(extractArtisanFirstName("   ")).toBeNull();
  });

  it("refuse les prénoms trop courts ou trop longs", () => {
    expect(extractArtisanFirstName("Al Dupont")).toBeNull();
    expect(extractArtisanFirstName("Aaaaaaaaaaaaaaaaaaaaaaa Dupont")).toBeNull();
  });
});
