import { describe, it, expect } from "vitest";
import { phraseIntroSansReference } from "./phraseIntroSansReference";
// 🔴 Le détecteur vient du BANC, pas d'ici — cf. scripts/detecteur-affirmation-prix.mjs.
// Un test qui écrirait sa propre définition de « affirmer un prix » prouverait
// seulement que notre phrase échappe à un motif écrit pour elle.
import { phraseAffirmative } from "../../../scripts/detecteur-affirmation-prix.mjs";

/** Toutes les combinaisons de faits que la production peut présenter. */
const CAS = [
  { nom: "montant + ville, rien de comparé",   f: { totalHT: 12_500, ville: "Rennes",     coveragePct: 0 } },
  { nom: "montant + ville, 4 % comparé",       f: { totalHT: 289_000, ville: "Alençon",   coveragePct: 4 } },
  { nom: "montant seul",                       f: { totalHT: 2_200, ville: "",            coveragePct: 0 } },
  { nom: "ville seule",                        f: { totalHT: null,  ville: "Étréchy",     coveragePct: null } },
  { nom: "ni montant ni ville",                f: { totalHT: null,  ville: "",            coveragePct: null } },
  { nom: "aucune ligne de travaux",            f: { totalHT: null,  ville: "Tulle",       coveragePct: null, aucuneLigneTravaux: true } },
  { nom: "montant nul explicite",              f: { totalHT: 0,     ville: "Montluçon",   coveragePct: null } },
] as const;

describe("phraseIntroSansReference", () => {
  // ── LE TÉMOIN D'ABORD ──────────────────────────────────────────────────────
  // Sans lui, le test principal passerait même si le détecteur ne détectait
  // plus rien — et il annoncerait « zéro violation » en ne mesurant rien.
  // C'est l'erreur commise trois fois le 2026-09-16 (conjonction APE,
  // contrainte SQL testée contre une clé étrangère, motif d'affirmation brut).
  describe("témoin — le détecteur attrape bien les phrases qui ont fuité en production", () => {
    const VIOLATIONS_REELLES = [
      "Il s'agit d'un devis qui se situe dans la norme du marché.",
      "Ce devis de construction présente un prix cohérent pour ce type de projet.",
      "Les prix pratiqués sont corrects au regard du marché local.",
      "Montant global au juste prix pour la prestation décrite.",
    ];
    it.each(VIOLATIONS_REELLES)("détecte : %s", (phrase) => {
      expect(phraseAffirmative(phrase)).not.toBeNull();
    });

    // Et le contre-témoin : une RÉSERVE ne doit PAS compter comme affirmation.
    const RESERVES = [
      "Nous ne sommes pas en mesure de dire si le prix est juste.",
      "Aucune prestation ne correspond à un tarif de référence : nous ne pouvons pas affirmer que ce prix est cohérent.",
      "Ces prix ne sont rattachables à aucune fourchette de marché.",
    ];
    it.each(RESERVES)("ne compte PAS comme affirmation : %s", (phrase) => {
      expect(phraseAffirmative(phrase)).toBeNull();
    });
  });

  // ── L'INVARIANT LUI-MÊME ───────────────────────────────────────────────────
  describe("n'affirme JAMAIS que le prix est correct", () => {
    it.each(CAS)("$nom", ({ f }) => {
      const phrase = phraseIntroSansReference(f);
      expect(phraseAffirmative(phrase)).toBeNull();
    });
  });

  // ── ET N'AFFIRME PAS L'INVERSE NON PLUS ────────────────────────────────────
  // « Ces prix sont suspects » serait tout aussi faux : nous n'en savons rien.
  // Le conseil intempestif est proscrit depuis le 2026-09-04.
  describe("n'accuse pas davantage", () => {
    const ACCUSATION = /\b(surfactur|trop cher|excessif|abusif|suspect|gonfl[ée]|anormalement [ée]lev)/i;
    it.each(CAS)("$nom", ({ f }) => {
      expect(phraseIntroSansReference(f)).not.toMatch(ACCUSATION);
    });
  });

  // ── LE FAIT VÉRIFIABLE EST EN TÊTE ─────────────────────────────────────────
  it("rappelle le montant et la ville quand ils sont connus", () => {
    const p = phraseIntroSansReference({ totalHT: 12_500, ville: "Rennes", coveragePct: 0 });
    // ⚠️ `toLocaleString("fr-FR")` sépare les milliers par une espace fine
    // INSÉCABLE (U+202F), pas par une espace ordinaire — c'est le bon
    // séparateur français et celui qu'emploie le reste du produit. Mon premier
    // test attendait une espace ordinaire : c'est LUI qui avait tort. On
    // compare donc sur le rendu réel de la locale, jamais sur une chaîne
    // recopiée à la main.
    expect(p).toContain(`${(12_500).toLocaleString("fr-FR")} € HT`);
    expect(p).toContain("Rennes");
  });

  it("n'invente ni montant ni ville quand ils manquent", () => {
    const p = phraseIntroSansReference({ totalHT: null, ville: "", coveragePct: null });
    expect(p).not.toMatch(/€ HT/);
    expect(p).not.toMatch(/undefined|null|NaN/);
    // La phrase reste complète et lisible malgré l'absence de faits.
    expect(p.startsWith("Aucune des prestations")).toBe(true);
  });

  // ── « AUCUNE » SEULEMENT QUAND C'EST ZÉRO ──────────────────────────────────
  // Même distinction que `aucuneReferenceDuTout` (2026-09-10, cas AQUIVOLTAIQUE) :
  // écrire « aucune prestation » au-dessus d'un détail qui affiche UNE fourchette
  // est une contradiction que le lecteur voit immédiatement.
  it("écrit « aucune » quand rien n'est comparé", () => {
    const p = phraseIntroSansReference({ totalHT: 5_000, ville: "Lyon", coveragePct: 0 });
    expect(p).toContain("Aucune des prestations");
    expect(p).not.toContain("À une ligne près");
  });

  it("écrit « à une ligne près » quand une ligne EST comparée", () => {
    const p = phraseIntroSansReference({ totalHT: 289_000, ville: "Alençon", coveragePct: 4 });
    expect(p).toContain("À une ligne près");
    expect(p).not.toContain("Aucune des prestations");
  });

  it("traite une couverture INCONNUE comme le cas le plus fort, pas comme une absence de signal", () => {
    // Règle du 2026-09-13 (devis « Entreprise Fk ») : `coveragePct === null`
    // signifie que le devis ne porte AUCUN prix — c'est « rien de comparé »,
    // surtout pas « à une ligne près ».
    const p = phraseIntroSansReference({ totalHT: null, ville: "Étréchy", coveragePct: null });
    expect(p).toContain("Aucune des prestations");
  });

  // ── CE QUE LE BANC DE PERTE A TROUVÉ ───────────────────────────────────────
  // `scripts/banc-perte-phrase-intro.mjs` a relu les 42 phrases remplacées :
  // sur trois d'entre elles, l'âge du devis n'était écrit NULLE PART AILLEURS.
  // Sans ce rappel, le correctif aurait fait disparaître le fait de la page.
  describe("l'âge du devis survit au remplacement", () => {
    it("reprend l'année quand le devis a plus de 12 mois", () => {
      const p = phraseIntroSansReference({
        totalHT: 372, ville: "SERGY", coveragePct: 0, anneeDevisAncien: 2024,
      });
      expect(p).toContain("date de 2024");
      expect(p).toMatch(/version à jour/i);
    });

    it("ne dit rien de l'âge quand le devis est récent", () => {
      const p = phraseIntroSansReference({
        totalHT: 372, ville: "SERGY", coveragePct: 0, anneeDevisAncien: null,
      });
      expect(p).not.toMatch(/date de \d{4}/);
    });

    it("reste muet sur l'âge plutôt que d'écrire une année invalide", () => {
      const p = phraseIntroSansReference({
        totalHT: 372, ville: "SERGY", coveragePct: 0, anneeDevisAncien: Number.NaN,
      });
      expect(p).not.toMatch(/NaN|date de/);
    });

    it("le rappel d'âge n'affirme toujours aucun prix", () => {
      for (const cov of [0, 3, null]) {
        const p = phraseIntroSansReference({
          totalHT: 8_099, ville: "Évreux", coveragePct: cov, anneeDevisAncien: 2024,
        });
        expect(phraseAffirmative(p)).toBeNull();
      }
    });
  });

  // ── LE RESTE DE L'ANALYSE GARDE SA VALEUR ──────────────────────────────────
  // Ne pas se taire sur tout : l'entreprise, les clauses et les paiements
  // restent vérifiables sans référentiel de prix (règle du 2026-09-04).
  it("rappelle ce qui reste vérifiable", () => {
    const p = phraseIntroSansReference({ totalHT: 5_000, ville: "Lyon", coveragePct: 0 });
    expect(p).toMatch(/entreprise/i);
    expect(p).toMatch(/clauses/i);
  });
});
