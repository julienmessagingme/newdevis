import { describe, it, expect } from "vitest";
import { decisionAffichee, titreDecision, LEVIERS_SANS_CONSTAT, motifsBloquants } from "./decisionAffichee";
import type { ConclusionData } from "./conclusionTypes";
import type { Portee } from "./porteeAnalyse";

const PORTEE_PLEINE: Portee = { compares: 8, total: 9, pctMontant: 92 };
const PORTEE_VIDE: Portee = { compares: 1, total: 10, pctMontant: 21 };

const c = (p: Partial<ConclusionData>): ConclusionData =>
  ({ anomalies: [], leviers: [], ...p }) as ConclusionData;

const levier = (type: string, objectif = "securiser") =>
  ({ type, objectif, niveau: "bonus", titre: type, detail: "" }) as never;

describe("decisionAffichee — la couleur porte ce qu'on a TROUVÉ", () => {
  it("un fait bloquant prime sur tout, y compris des prix corrects", () => {
    const d = decisionAffichee(c({ verdict_decisionnel: "signer" }), PORTEE_PLEINE, ["entreprise en liquidation"]);
    expect(d.decision).toBe("ne_pas_signer");
    expect(d.ton).toBe("alert");
  });

  it("un écart chiffré donne l'ambre et le montant", () => {
    const d = decisionAffichee(
      c({ anomalies: [{ poste: "Cloison" } as never], surcout_global: { min: 1062, max: 1062 } }),
      PORTEE_PLEINE,
    );
    expect(d.decision).toBe("negocier");
    expect(d.montantANegocier).toBe(1062);
  });

  it("un montant sous 300 € ne se chiffre pas — il ne s'afficherait pas", () => {
    const d = decisionAffichee(
      c({ anomalies: [{ poste: "X" } as never], surcout_global: { min: 120, max: 120 } }),
      PORTEE_PLEINE,
    );
    expect(d.montantANegocier).toBeNull();
  });
});

describe("decisionAffichee — les conseils universels ne colorent plus", () => {
  // 🔴 LE CŒUR DU CORRECTIF DU 2026-09-22. Mesuré sur 30 jours :
  // `retenue_garantie` déclenchait 21 des 34 oranges, sur des devis portant
  // jusqu'à 45 points vérifiés et aucune anomalie.
  it("retenue_garantie seule ne fait pas basculer en ambre", () => {
    const d = decisionAffichee(c({ leviers: [levier("retenue_garantie")] }), PORTEE_PLEINE);
    expect(d.decision).toBe("signer");
    expect(d.ton).toBe("calm");
  });

  it("le fallback references et le second avis non plus", () => {
    const d = decisionAffichee(
      c({ leviers: [levier("references"), levier("second_avis"), levier("dommages_ouvrage")] }),
      PORTEE_PLEINE,
    );
    expect(d.decision).toBe("signer");
  });

  it("mais dommages_ouvrage_VERIFICATION est un constat — une DO est facturée au devis", () => {
    // ⚠️ Distinction délibérée : le conseil d'en souscrire une est universel,
    // réclamer l'attestation d'une DO déjà facturée porte sur CE devis.
    expect(LEVIERS_SANS_CONSTAT.has("dommages_ouvrage_verification")).toBe(false);
    const d = decisionAffichee(c({ leviers: [levier("dommages_ouvrage_verification")] }), PORTEE_PLEINE);
    expect(d.decision).toBe("negocier");
  });

  it("un acompte au-dessus de l'usage reste un constat sur le devis", () => {
    const d = decisionAffichee(c({ leviers: [levier("acompte", "negocier")] }), PORTEE_PLEINE);
    expect(d.decision).toBe("negocier");
    expect(d.constats).toBe(1);
  });
});

describe("decisionAffichee — la portée nuance le titre, jamais la couleur", () => {
  it("rien trouvé + prix non comparables reste VERT", () => {
    // C'est le devis JeanBERNARD : 1 poste opposable sur 10, aucun constat.
    // Il ne mérite pas une alerte — il mérite qu'on dise ce qu'on a vérifié.
    const d = decisionAffichee(c({ leviers: [levier("references")] }), PORTEE_VIDE);
    expect(d.ton).toBe("calm");
    expect(d.prixVerifies).toBe(false);
  });

  it("et le titre, lui, distingue les deux", () => {
    const vu = decisionAffichee(c({}), PORTEE_PLEINE);
    const pasVu = decisionAffichee(c({}), PORTEE_VIDE);
    expect(titreDecision(vu)).toBe("Ce devis nous paraît cohérent.");
    expect(titreDecision(pasVu)).toBe("Rien ne s'oppose à la signature.");
  });

  it("n'affirme JAMAIS sur le prix quand il n'est pas comparé", () => {
    // Invariant du 16/09 tenu par le titre : « rien ne s'oppose » est vrai
    // sans rien dire du prix ; « cohérent » l'affirmerait.
    const titre = titreDecision(decisionAffichee(c({}), PORTEE_VIDE));
    expect(titre).not.toMatch(/prix|cohérent|marché/i);
  });
});

describe("titreDecision", () => {
  it("porte le montant, sans arrondi — il doit égaler la somme du détail", () => {
    const d = decisionAffichee(
      c({ anomalies: [{ poste: "X" } as never], surcout_global: { min: 1062, max: 1062 } }),
      PORTEE_PLEINE,
    );
    // ⚠️ `toLocaleString("fr-FR")` insère une espace fine INSÉCABLE (U+202F),
    // pas une espace ordinaire : comparer à une chaîne écrite au clavier fait
    // échouer un test pourtant juste. On teste les chiffres, pas le séparateur.
    expect(titreDecision(d)).toMatch(/^Environ 1\s062 € à discuter avec l'artisan\.$/);
    // Et surtout : PAS d'arrondi — 1 100 € trahirait la somme 726 + 336.
    expect(titreDecision(d)).not.toMatch(/1\s100/);
  });

  it("ne chiffre pas tant que l'expert n'a pas tranché", () => {
    const d = decisionAffichee(
      c({ anomalies: [{ poste: "X" } as never], surcout_global: { min: 1062, max: 1062 } }),
      PORTEE_PLEINE,
    );
    expect(titreDecision(d, true)).not.toMatch(/1\s062/);
  });

  it("compte les points quand il n'y a pas de montant", () => {
    const un = decisionAffichee(c({ leviers: [levier("acompte")] }), PORTEE_PLEINE);
    expect(titreDecision(un)).toBe("Un point à sécuriser avant de signer.");
    const deux = decisionAffichee(c({ leviers: [levier("acompte"), levier("clause_orange")] }), PORTEE_PLEINE);
    expect(titreDecision(deux)).toBe("2 points à sécuriser avant de signer.");
  });

  it("ne dit jamais « clarifications » sans pouvoir les nommer", () => {
    // Le titre retiré le 22/09 : il annonçait une action et le bloc suivant
    // répondait « rien de significatif à négocier ».
    for (const portee of [PORTEE_PLEINE, PORTEE_VIDE, null]) {
      const t = titreDecision(decisionAffichee(c({ leviers: [levier("references")] }), portee));
      expect(t).not.toMatch(/clarification/i);
    }
  });
});

describe("decisionAffichee — une alerte sur l'entreprise est un constat (2026-09-23)", () => {
  // 🔴 Devis JeanBERNARD : la carte titrait « Rien ne s'oppose à la signature »
  // et listait quatre lignes plus bas « note Google 3,6/5 sur 140 avis ».
  // La décision ne regardait que les LEVIERS.
  const NOTE_GOOGLE =
    "⚠️ Note Google moyenne : 3.6/5 (140 avis). En dessous du seuil de confort de 4,0/5.";
  const ASSURANCE =
    "Demandez à l'artisan une attestation d'assurance RC Pro et décennale.";

  it("une note Google sous le seuil fait basculer en ambre", () => {
    const d = decisionAffichee(c({}), PORTEE_VIDE, [], [NOTE_GOOGLE]);
    expect(d.decision).toBe("negocier");
    expect(d.constats).toBe(1);
  });

  it("un rappel universel ne colore PAS — sinon chaque devis serait ambre", () => {
    // Mesuré : l'assurance est réclamée sur la quasi-totalité des devis.
    // La faire peser rendrait la couleur muette, comme `retenue_garantie`.
    const d = decisionAffichee(c({}), PORTEE_VIDE, [], [ASSURANCE]);
    expect(d.decision).toBe("signer");
    expect(d.constats).toBe(0);
  });

  it("les comptes non publiés et la radiation comptent aussi", () => {
    for (const a of [
      "Comptes non accessibles publiquement depuis 3 ans",
      "Entreprise récente (moins de 2 ans d'activité)",
    ]) {
      expect(decisionAffichee(c({}), PORTEE_VIDE, [], [a]).constats).toBe(1);
    }
  });
});

describe("titreDecision — le point fort est NOMMÉ (2026-09-23)", () => {
  const NOTE = "⚠️ Note Google moyenne : 3.6/5 (140 avis).";

  it("l'ancienneté remplace « N points à sécuriser »", () => {
    const d = decisionAffichee(c({}), PORTEE_VIDE, [], [NOTE], 25);
    expect(titreDecision(d)).toBe("Entreprise établie depuis 25 ans, un point à vérifier.");
  });

  it("une entreprise de moins de 5 ans n'est PAS un argument", () => {
    // Même garde que la réputation sous dix avis (06/09) : présenter « 2 ans »
    // comme une force serait de la réassurance fabriquée.
    const d = decisionAffichee(c({}), PORTEE_VIDE, [], [NOTE], 2);
    expect(d.ancienneteAnnees).toBeNull();
    expect(titreDecision(d)).toBe("Un point à sécuriser avant de signer.");
  });

  it("LE MONTANT GARDE TOUJOURS LA MAIN sur l'ancienneté", () => {
    // C'est ce que le lecteur emporte. L'ancienneté redescend dans « Vérifié ».
    const d = decisionAffichee(
      c({ anomalies: [{ poste: "X" } as never], surcout_global: { min: 3237, max: 3237 } }),
      PORTEE_PLEINE,
      [],
      [NOTE],
      10,
    );
    expect(titreDecision(d)).toMatch(/^Environ 3\s237 € à discuter avec l'artisan\.$/);
  });

  it("un fait bloquant ignore l'ancienneté", () => {
    const d = decisionAffichee(c({}), PORTEE_VIDE, ["entreprise radiée"], [NOTE], 25);
    expect(titreDecision(d)).toBe("Ne signez pas en l'état.");
  });
});

describe("la décision de l'expert prime sur les critères du moteur (2026-09-23)", () => {
  const ROUGES = ["Acompte cumulé supérieur à 50% demandé avant démarrage (80%)"];
  const AVEC_EXPERT = (verdict: string) =>
    c({
      verdict_decisionnel: verdict as never,
      expert_message: "Après analyse par notre expert, les prix sont cohérents et l'entreprise sérieuse.",
    } as never);

  it("un expert qui valide lève le hard block", () => {
    // Devis SOLTANI : l'expert met « signer » et écrit que les prix sont
    // cohérents ; la page titrait « Nous vous invitons à ne pas signer ».
    // `decide.ts` n'écrit jamais `score` ni `raw_text.scoring`, donc le
    // critère rouge survivait à la correction et l'écrasait.
    const d = decisionAffichee(AVEC_EXPERT("signer"), PORTEE_PLEINE, ROUGES);
    expect(d.decision).not.toBe("ne_pas_signer");
    expect(motifsBloquants(AVEC_EXPERT("signer"), ROUGES)).toEqual([]);
  });

  it("TÉMOIN — un expert qui MAINTIENT le refus garde son hard block", () => {
    const d = decisionAffichee(AVEC_EXPERT("ne_pas_signer"), PORTEE_PLEINE, ROUGES);
    expect(d.decision).toBe("ne_pas_signer");
    expect(motifsBloquants(AVEC_EXPERT("ne_pas_signer"), ROUGES)).toEqual(ROUGES);
  });

  it("TÉMOIN — sans relecture humaine, le critère bloque TOUJOURS", () => {
    // Le cas de loin le plus fréquent : 32 analyses du stock portent un
    // critère rouge sans correction experte. En lever un seul serait la pire
    // régression possible sur ce chemin.
    const d = decisionAffichee(c({ verdict_decisionnel: "signer" }), PORTEE_PLEINE, ROUGES);
    expect(d.decision).toBe("ne_pas_signer");
    expect(motifsBloquants(c({}), ROUGES)).toEqual(ROUGES);
  });

  it("un message VIDE ne lève rien — c'est la relecture qui compte, pas le champ", () => {
    const vide = c({ verdict_decisionnel: "signer", expert_message: "   " } as never);
    expect(motifsBloquants(vide, ROUGES)).toEqual(ROUGES);
  });

  it("`signer_avec_negociation` est aussi une validation", () => {
    // L'expert dit « négociez », pas « ne signez pas » : le hard block, qui
    // affirme l'inverse, n'a pas à s'imposer à sa décision.
    expect(motifsBloquants(AVEC_EXPERT("signer_avec_negociation"), ROUGES)).toEqual([]);
  });
});
