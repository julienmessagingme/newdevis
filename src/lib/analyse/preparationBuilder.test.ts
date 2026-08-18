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

  // Cas ATEX 2026-08-03 : points_ok mélange ✓ verts et 🟠/ℹ️ non-positifs.
  // Le rappel disait « établie depuis longtemps et bien notée » alors que le
  // bloc Entreprise affichait « 2 ans d'existence » + « aucun avis Google ».
  it("ignore les points 🟠/ℹ️ non-positifs (cas ATEX — entreprise jeune sans avis)", () => {
    const { rappelPourOuvrir } = buildPreparationSections(
      baseConclusion,
      [
        "✓ Entreprise identifiée : ATEX",
        "🟠 Entreprise établie depuis 2 ans",
        "ℹ️ Aucun avis Google trouvé - cela ne préjuge pas de la qualité de l'entreprise",
        "ℹ️ Aucune donnée financière publiée - la vérification financière n'a pas pu être effectuée",
        "✓ Mode de paiement traçable accepté",
        "✓ IBAN valide et domicilié en France",
      ],
      [],
    );
    // Ne doit JAMAIS sur-affirmer ce que le bloc Entreprise contredit
    expect(rappelPourOuvrir).not.toMatch(/établie depuis longtemps/);
    expect(rappelPourOuvrir).not.toMatch(/bien notée/);
    // Le seul positif tangible restant : conditions de paiement
    expect(rappelPourOuvrir).toMatch(/paiement/);
    // Grammaire : la phrase complète « L'entreprise est … »
    expect(rappelPourOuvrir).toMatch(/^L['']entreprise est /);
  });

  it("entreprise jeune en clair (« depuis 2 ans » sans marqueur) → pas de rappel ancienneté", () => {
    const { rappelPourOuvrir } = buildPreparationSections(
      baseConclusion,
      ["Entreprise établie depuis 2 ans"],
      [],
    );
    expect(rappelPourOuvrir).toBeNull();
  });

  it("négation sur les avis (« aucun avis ») ne devient jamais « bien notée »", () => {
    const { rappelPourOuvrir } = buildPreparationSections(
      baseConclusion,
      ["Aucun avis Google trouvé pour cet établissement"],
      [],
    );
    expect(rappelPourOuvrir).toBeNull();
  });

  it("statut actif sans ancienneté chiffrée → claim modeste « immatriculée et en activité »", () => {
    const { rappelPourOuvrir } = buildPreparationSections(
      baseConclusion,
      ["✓ Entreprise active, SIRET vérifié"],
      [],
    );
    expect(rappelPourOuvrir).toContain("immatriculée et en activité");
    expect(rappelPourOuvrir).not.toMatch(/établie depuis longtemps/);
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

  it("« Vérifiez le numéro QualiPAC » devient une question à l'artisan spécifique", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: [
        "Vérifiez la validité du numéro QualiPAC (QPAC/E-E208236) mentionné sur le devis pour confirmer les qualifications",
      ],
    };
    const { aDemander } = buildPreparationSections(conclusion, [], []);
    expect(aDemander).toHaveLength(1);
    // La question doit contenir « Pouvez-vous me confirmer » + le sujet
    expect(aDemander[0].question).toMatch(/Pouvez-vous me confirmer/i);
    expect(aDemander[0].question).toMatch(/numéro QualiPAC/i);
    // La scorie « mentionné sur le devis » doit être retirée
    expect(aDemander[0].question).not.toMatch(/mentionné sur le devis/i);
    // Aucune trace d'impératif adressé au user
    expect(aDemander[0].question).not.toMatch(/^Vérifiez/i);
  });

  it("« Assurez-vous que X » (proposition) devient « me confirmer qu'X », grammatical", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: [
        "Assurez-vous qu'un acompte est prévu et que le solde est lié à la réception des travaux",
      ],
    };
    const { aDemander } = buildPreparationSections(conclusion, [], []);
    expect(aDemander.length).toBeGreaterThanOrEqual(1);
    // Une PROPOSITION se confirme (« me confirmer qu'un acompte est prévu ») —
    // « me préciser un acompte est prévu » était agrammatical (cas NECHAB).
    expect(aDemander[0].question).toMatch(/Pouvez-vous me confirmer qu['']un acompte est prévu/i);
    // Aucune trace de l'auto-conseil au user
    expect(aDemander[0].question).not.toMatch(/^Assurez-vous/i);
    expect(aDemander[0].question).not.toMatch(/^assurez-vous/i);
  });

  // ── Cas NECHAB 2026-08-18 — les 3 défauts verbatim du message copiable ────
  it("cas NECHAB #1 — pas de « . ? » et « vos attentes » → « mes attentes »", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: [
        "Vérifiez que les spécifications techniques des luminaires et autres fournitures correspondent bien à vos attentes et aux normes en vigueur.",
      ],
    };
    const { aDemander } = buildPreparationSections(conclusion, [], []);
    expect(aDemander).toHaveLength(1);
    const q = aDemander[0].question;
    // Ponctuation propre : jamais « . ? »
    expect(q).not.toMatch(/\.\s*\?/);
    // Possessif inversé : la question part à l'ARTISAN, ce sont MES attentes
    expect(q).toContain("mes attentes");
    expect(q).not.toContain("vos attentes");
    expect(q).toMatch(/Pouvez-vous me confirmer que les spécifications techniques/);
    expect(q).toMatch(/aux normes en vigueur \?/);
  });

  it("cas NECHAB #2 — « Assurez-vous que X sont stipulés » → « me confirmer que X sont stipulés ? »", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: [
        "Assurez-vous que les modalités de paiement, les délais de livraison des fournitures et la durée de la garantie sur les équipements sont clairement stipulés dans le devis.",
      ],
    };
    const { aDemander } = buildPreparationSections(conclusion, [], []);
    expect(aDemander).toHaveLength(1);
    const q = aDemander[0].question;
    // L'ancien rendu « me préciser les modalités […] sont clairement
    // stipulés. ? » était agrammatical + ponctuation cassée.
    expect(q).not.toMatch(/me préciser les modalités/);
    expect(q).not.toMatch(/\.\s*\?/);
    expect(q).toMatch(
      /Pouvez-vous me confirmer que les modalités de paiement, les délais de livraison des fournitures et la durée de la garantie sur les équipements sont clairement stipulés dans le devis \?/,
    );
  });

  it("« Assurez-vous de X » (groupe nominal) reste « me préciser X »", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: ["Assurez-vous de la conformité des équipements livrés."],
    };
    const { aDemander } = buildPreparationSections(conclusion, [], []);
    expect(aDemander).toHaveLength(1);
    expect(aDemander[0].question).toMatch(/Pouvez-vous me préciser la conformité des équipements livrés \?/);
  });

  it("le point final d'une action « Demandez X. » ne colle jamais au « ? »", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: ["Demandez le détail des références produit commandées."],
    };
    const { aDemander } = buildPreparationSections(conclusion, [], []);
    expect(aDemander).toHaveLength(1);
    expect(aDemander[0].question).not.toMatch(/\.\s*\?/);
    expect(aDemander[0].question).toMatch(/\?\s*»$/);
  });

  it("les possessifs côté ARTISAN (votre devis, vos tarifs) ne sont PAS inversés", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: [
        "Vérifiez que votre devis détaille bien vos tarifs horaires appliqués au chantier",
      ],
    };
    const { aDemander } = buildPreparationSections(conclusion, [], []);
    expect(aDemander).toHaveLength(1);
    const q = aDemander[0].question;
    expect(q).toContain("votre devis");
    expect(q).toContain("vos tarifs");
    // Mais « au chantier » n'active pas le flip (« votre chantier » absent)
    expect(q).not.toContain("mon devis");
  });

  it("coupe les auto-conseils « et assurez-vous que » dans la section 3", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: [
        "Demandez les modalités de paiement, notamment le paiement par chèque à réception, et assurez-vous qu'un acompte est prévu et que le solde est lié à la réception",
      ],
    };
    const { aDemander, aNePasOublier } = buildPreparationSections(conclusion, [], []);
    // Cet item passe en section 2 (non-standard). Le contenu ne doit
    // contenir « assurez-vous » nulle part (auto-conseil coupé).
    const all = [
      ...aDemander.map((x) => x.context + " " + x.question),
      ...aNePasOublier,
    ].join(" ").toLowerCase();
    expect(all).not.toContain("assurez-vous");
    expect(all).not.toContain("assurez vous");
  });

  it("« Demandez à l'artisan des précisions sur X » ne laisse pas un « s » orphelin", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: [
        "Demandez à l'artisan des précisions sur les modèles et marques des équipements",
      ],
    };
    const { aDemander } = buildPreparationSections(conclusion, [], []);
    expect(aDemander.length).toBeGreaterThanOrEqual(1);
    // Ne doit PAS commencer par « s précisions » (bug du regex ^d[e'] qui ne matchait pas « des »)
    expect(aDemander[0].context).not.toMatch(/^s\s+précisions/i);
    // Doit commencer par « Précisions » (« des » entièrement retiré)
    expect(aDemander[0].context.toLowerCase()).toContain("précisions");
    // La question aussi doit être propre
    expect(aDemander[0].question).not.toMatch(/\bs\s+précisions\b/i);
  });

  it("« Demandez du détail sur X » retire aussi « du »", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: ["Demandez du détail sur le poste plomberie"],
    };
    const { aDemander } = buildPreparationSections(conclusion, [], []);
    expect(aDemander.length).toBeGreaterThanOrEqual(1);
    expect(aDemander[0].context).not.toMatch(/^u\s+détail/i);
  });

  it("« Demandez l'attestation décennale » devient « me transmettre » et non « me préciser »", () => {
    const conclusion = {
      ...baseConclusion,
      actions_avant_signature: [
        "Demandez l'attestation d'assurance décennale à jour pour les pompes à chaleur",
      ],
    };
    // Actions "assurance/décennale" sont classées en section 3 (standard).
    // Vérifions le format section 3 nettoyé.
    const { aNePasOublier } = buildPreparationSections(conclusion, [], []);
    expect(aNePasOublier.length).toBeGreaterThanOrEqual(1);
    // Ne commence pas par « Demandez »
    expect(aNePasOublier[0]).not.toMatch(/^Demandez/i);
    // Commence par un groupe nominal capitalisé (L'attestation, Une attestation, etc.)
    expect(aNePasOublier[0]).toMatch(/^(L['']|Une |Les |Votre |Vos |Un )/);
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
