/**
 * Tests du motif affiché sous le verdict après correction d'expert.
 * Cas d'origine : devis DEV-202608-1 (2026-09-04).
 */

import { describe, it, expect } from "vitest";
import { deriveMotifHero, premierePhrase } from "./motifHero";

describe("premierePhrase", () => {
  it("coupe au premier point suivi d'un espace", () => {
    expect(premierePhrase("Première phrase. Seconde phrase."))
      .toBe("Première phrase");
  });

  it("texte sans ponctuation finale → texte entier", () => {
    expect(premierePhrase("un motif sans point")).toBe("un motif sans point");
  });

  it("ne coupe pas sur une décimale", () => {
    expect(premierePhrase("Le taux est de 12.5 % sur ce devis. Suite."))
      .toBe("Le taux est de 12.5 % sur ce devis");
  });

  it("normalise les retours à la ligne et espaces multiples", () => {
    expect(premierePhrase("Une phrase\n  coupée en deux. Autre chose."))
      .toBe("Une phrase coupée en deux");
  });

  it("chaîne vide → chaîne vide", () => {
    expect(premierePhrase("   ")).toBe("");
  });
});

describe("deriveMotifHero", () => {
  const CAS_REEL =
    "L'entreprise qui a établi ce devis, Damien Dubourg EI (SIREN 883 135 345), a cessé son activité le 1er septembre 2025. " +
    "Le devis est daté du 21 août 2026, soit près d'un an plus tard.";

  it("cas d'origine : le hero dit la cessation, pas le levier « second devis »", () => {
    const motif = deriveMotifHero(
      CAS_REEL,
      "Faites chiffrer par un second devis les prestations spécifiques (~2 200 €)",
    );
    expect(motif).toMatch(/cessé son activité/);
    expect(motif).not.toMatch(/second devis/);
    // Le motif s'insère après un tiret → initiale en minuscule.
    expect(motif.startsWith("l'entreprise")).toBe(true);
  });

  it("pas de message expert → fallback historique sur le titre du levier", () => {
    expect(deriveMotifHero(null, "Faites chiffrer par un second devis"))
      .toBe("faites chiffrer par un second devis");
    expect(deriveMotifHero("   ", "Demandez une preuve de livraison"))
      .toBe("demandez une preuve de livraison");
  });

  it("ni message ni levier → phrase neutre, jamais de motif vide", () => {
    expect(deriveMotifHero(null, null)).toMatch(/clarifier avec l'artisan/);
    expect(deriveMotifHero("", "")).toMatch(/clarifier avec l'artisan/);
  });

  it("première phrase trop longue → on préfère le levier à une phrase coupée", () => {
    const tresLong = `${"a".repeat(300)}. Suite du message.`;
    expect(deriveMotifHero(tresLong, "Demandez un Kbis récent"))
      .toBe("demandez un Kbis récent");
  });

  it("découpe trop courte (abréviation) → on ne publie pas un fragment", () => {
    expect(deriveMotifHero("Cf. le point suivant qui explique tout en détail.", "Demandez un Kbis"))
      .toBe("demandez un Kbis");
  });

  it("un sigle en tête reste capitalisé", () => {
    const motif = deriveMotifHero(
      "SIREN 883 135 345 : cette entreprise a cessé son activité en 2025.",
      "Un levier quelconque",
    );
    expect(motif.startsWith("SIREN")).toBe(true);
  });

  it("message court sans ponctuation → utilisable tel quel", () => {
    expect(deriveMotifHero("l'entreprise a cessé son activité en 2025", "Un levier"))
      .toBe("l'entreprise a cessé son activité en 2025");
  });

  it("le motif ne conserve jamais le point final", () => {
    const motif = deriveMotifHero(CAS_REEL, null);
    expect(motif.endsWith(".")).toBe(false);
  });
});
