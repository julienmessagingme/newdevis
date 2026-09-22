/**
 * src/lib/analyse/refusExplicite.test.ts
 *
 * 🔴 LE TÉMOIN EST DOUBLE, ET IL EST INDISPENSABLE. Sans lui, un détecteur qui
 * répondrait « oui » partout — ou « non » partout — passerait pour un
 * résultat. Les phrases ci-dessous sont RECOPIÉES des messages d'expert du
 * stock, jamais inventées : c'est ce qui rend le contrôle probant.
 */

import { describe, it, expect } from "vitest";
import { messageRefuseExplicitement, verdictContreditLeMessage } from "./refusExplicite";

// ── Les refus réels : le détecteur DOIT les voir ────────────────────────────
const REFUS_REELS: Array<[string, string]> = [
  ["ALES", "Bonjour, Après une relecture approfondie de votre devis par notre expert, nous vous recommandons de ne pas signer ce document en l'état pour plusieurs raisons majeures."],
  ["J.P. ROUX", "En résumé, ne signez pas ce devis en l'état. La priorité absolue est d'obtenir le numéro SIRET de l'artisan."],
  ["KRAUSZ", "Après examen par notre expert, nous vous recommandons de ne pas signer ce devis en l'état pour une raison majeure."],
  ["toiture zinc", "Nous vous conseillons de ne pas donner suite en l'état."],
  ["ISOL TOIT", "Bonjour, Après examen par notre expert, nous vous confirmons qu'il ne faut absolument pas signer ce devis, pour deux raisons majeures."],
];

// ── Les CONDITIONNELS : le détecteur ne doit PAS les voir ───────────────────
// Ils se ressemblent et disent l'inverse — le devis reste signable une fois la
// pièce obtenue. Les confondre bloquerait des corrections cohérentes.
const CONDITIONNELS: Array<[string, string]> = [
  ["ART DE BRITO", "En résumé, nous vous recommandons de négocier les tarifs de la peinture et, surtout, de ne signer aucun document avant d'avoir obtenu et vérifié un devis avec les informations administratives."],
  ["FA BAT", "Trois points à régler avant de signer, aucun n'est bloquant : l'attestation d'assurance décennale n'est pas jointe."],
  ["ETANCHEITE 47", "Il est important de vous faire confirmer par écrit un calendrier plus précis avant de signer et de verser l'acompte de 25%."],
  ["ISO&FACE64", "Trois points méritent d'être discutés avec l'entreprise avant de vous engager."],
  ["CEVENNES", "Nous vous recommandons de discuter du prix de la pose du carrelage et de bien valider les attestations d'assurance mentionnées avant de signer."],
  ["SOLTANI", "Le coût du poêle OFEN 24 de marque LORFLAM est conforme aux prix du marché, et la remise commerciale le rend particulièrement compétitif."],
];

describe("messageRefuseExplicitement — témoin double sur des messages RÉELS", () => {
  it.each(REFUS_REELS)("reconnaît le refus de %s", (_nom, message) => {
    expect(messageRefuseExplicitement(message)).toBe(true);
  });

  it.each(CONDITIONNELS)("n'invente pas un refus sur %s", (_nom, message) => {
    expect(messageRefuseExplicitement(message)).toBe(false);
  });

  it("un message vide ne refuse rien", () => {
    expect(messageRefuseExplicitement("")).toBe(false);
  });

  it("🔴 LE MÊME MESSAGE PEUT PORTER LES DEUX — le refus l'emporte", () => {
    // Cas J.P. ROUX : le corps du message multiplie les conditions (« demander
    // le SIRET », « obtenir l'attestation ») et se termine par un refus net.
    // Un détecteur qui s'arrêterait à la première tournure conclurait l'inverse.
    const melange =
      "Vous devez impérativement demander son SIRET et ne signer aucun document avant d'avoir vérifié son immatriculation. " +
      "En résumé, ne signez pas ce devis en l'état.";
    expect(messageRefuseExplicitement(melange)).toBe(true);
  });
});

describe("verdictContreditLeMessage", () => {
  const REFUS = REFUS_REELS[0][1];

  it("signale le cas ALES : l'expert refuse, le verdict propose de négocier", () => {
    expect(verdictContreditLeMessage(REFUS, "signer_avec_negociation")).toBe(true);
  });

  it("ne signale rien quand l'expert a posé « ne pas signer »", () => {
    expect(verdictContreditLeMessage(REFUS, "ne_pas_signer")).toBe(false);
  });

  it("🔴 ASYMÉTRIQUE — un verdict sévère sous un message doux n'est PAS signalé", () => {
    // Un expert qui POSE « ne pas signer » a tranché, quel que soit le ton de
    // son texte. C'est la leçon du 23/09 : une contradiction de TON n'est pas
    // une contradiction de DÉCISION, et seule la seconde justifie de bloquer.
    expect(verdictContreditLeMessage(CONDITIONNELS[5][1], "ne_pas_signer")).toBe(false);
  });

  it("sans message, rien n'est signalé", () => {
    expect(verdictContreditLeMessage(null, "signer")).toBe(false);
    expect(verdictContreditLeMessage("", "signer")).toBe(false);
  });
});
