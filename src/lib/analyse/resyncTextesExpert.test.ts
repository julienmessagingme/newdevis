import { describe, it, expect } from "vitest";
import { resyncTextesExpert } from "./resyncTextesExpert";

/**
 * ⚠️ LES DONNÉES VIENNENT DU DEVIS RÉEL « noreco peinture2 », tel qu'il était
 * en base après la correction de l'expert — pas de mémoire. C'est la leçon du
 * 17/09 : un jeu de test écrit de tête protège le bug au lieu de l'attraper.
 */
const conclusionNoreco = () => ({
  verdict_global: "dans_la_norme",
  verdict_decisionnel: "signer",
  surcout_global: { min: 0, max: 0 },
  anomalies: [],
  expert_message:
    "Bonjour,\n\nAprès une relecture attentive par notre expert, votre devis pour " +
    "les travaux de peinture présente un prix unitaire cohérent.\n\nLe tarif de " +
    "40,00 € par m² est conforme aux prix du marché.",
  phrase_intro:
    "12 480 € TTC pour des travaux de rénovation — ce devis est à négocier en raison de certains postes surévalués.",
  justifications:
    "Malgré un poste de peinture élevé, le devis global présente des tarifs très prix à examiner sur " +
    "d'autres prestations comme l'aménagement de la cuisine, la pose de douche et le miroir de salon.",
  actions_avant_signature: [
    "Demandez une révision du prix pour le poste 'Peinture pièce ~12m²' dont le tarif est supérieur aux prix du marché.",
    "Demandez à l'artisan une attestation d'assurance RC Pro et décennale en cours de validité.",
    "Demandez à l'artisan des références de chantiers similaires (3 minimum).",
  ],
  verdict_reasons: {
    summary: "Ce devis présente des postes à renégocier avant signature",
    reasons: ["⚠️ Surcoût représentant 13% du devis (estimé : ~1.2 k€)", "⚠️ 1 poste présente un prix anormalement élevé"],
    context: ["📊 Marché très variable — les prix peuvent fortement différer selon les artisans"],
  },
  market_context_note: "Marché avec forte variation de prix — tolérance ajustée",
  verdict_ligne: { resume: "11 345 € HT — demandez une retenue de garantie de 5 %.", motif: "…", marge: null },
});

describe("resyncTextesExpert", () => {
  it("recompose les quatre textes quand l'expert a retiré tout écart", () => {
    const c = conclusionNoreco();
    const r = resyncTextesExpert(c);
    expect(r.recompose).toBe(true);
    expect(r.champsReecrits).toContain("phrase_intro");
    expect(r.champsReecrits).toContain("justifications");
    expect(r.champsReecrits).toContain("verdict_reasons");
  });

  it("🔴 plus aucun texte ne contredit le verdict corrigé", () => {
    // C'est LE contrôle de cette règle : les quatre phrases réellement sorties
    // en production ne doivent plus parler d'un écart que l'expert a annulé.
    const c = conclusionNoreco();
    resyncTextesExpert(c);
    const tout = [
      c.phrase_intro,
      c.justifications,
      ...(c.actions_avant_signature as string[]),
      c.verdict_reasons?.summary,
      ...(c.verdict_reasons?.reasons ?? []),
      ...(c.verdict_reasons?.context ?? []),
    ].join(" ");
    expect(tout).not.toMatch(/à négocier|surévalué|surcoût|renégocier|anormalement élevé|révision du prix/i);
  });

  it("🔴 ne cite plus les faux rapprochements (cuisine, douche, miroir)", () => {
    const c = conclusionNoreco();
    resyncTextesExpert(c);
    expect(c.justifications).not.toMatch(/cuisine|douche|miroir/i);
  });

  it("reprend la raison de l'EXPERT, pas une formule", () => {
    const c = conclusionNoreco();
    resyncTextesExpert(c);
    expect(c.justifications).toContain("prix unitaire cohérent");
    expect(c.verdict_reasons?.reasons?.[0]).toContain("prix unitaire cohérent");
  });

  it("garde le montant du devis, qui reste vrai", () => {
    const c = conclusionNoreco();
    resyncTextesExpert(c);
    expect(c.phrase_intro).toContain("11 345 € HT");
  });

  it("🔴 n'affirme JAMAIS que le prix est correct — invariant du 16/09", () => {
    // Le moteur n'a rien chiffré : aucun texte composé PAR NOUS ne peut dire que
    // le prix est bon. Si l'expert l'a écrit, ça vit dans son encadré à lui.
    const c = conclusionNoreco();
    c.expert_message = null;
    resyncTextesExpert(c);
    expect(c.phrase_intro).not.toMatch(/prix (correct|cohérent|juste)|dans la norme|dans le marché/i);
    expect(c.verdict_reasons?.summary).not.toMatch(/prix (correct|cohérent|juste)|dans le marché/i);
  });

  it("retire l'action de prix et GARDE les autres", () => {
    const c = conclusionNoreco();
    resyncTextesExpert(c);
    const actions = c.actions_avant_signature as string[];
    expect(actions).toHaveLength(2);
    expect(actions.join(" ")).toContain("assurance");
    expect(actions.join(" ")).toContain("références");
  });

  /**
   * 🔴 LES QUATRE ACTIONS CI-DESSOUS SONT DES TEXTES RÉELS DE PRODUCTION,
   * relevés le 26/09 sur les conclusions déjà corrigées par l'expert. Les deux
   * premières fuyaient l'ancien motif ; la troisième doit SURVIVRE.
   */
  it("🔴 retire une révision de prix même avec un mot intercalé", () => {
    const c = conclusionNoreco();
    c.actions_avant_signature = [
      "Exigez une révision significative du prix unitaire du poste 'Faux plafond plâtre BA13', qui est anormalement élevé par rapport aux prix du marché.",
    ];
    resyncTextesExpert(c);
    expect(c.actions_avant_signature).toHaveLength(0);
  });

  it("🔴 retire « ces prix élevés » et « postes surévalués »", () => {
    const c = conclusionNoreco();
    c.actions_avant_signature = [
      "Demandez un devis détaillé pour les postes 'Mur parpaing' afin de comprendre la justification de ces prix élevés.",
      "Sollicitez au moins deux autres devis pour comparer, notamment sur les postes identifiés comme surévalués.",
    ];
    resyncTextesExpert(c);
    expect(c.actions_avant_signature).toHaveLength(0);
  });

  it("🔴 TÉMOIN — garde « Renégociez l'échéancier », qui ne parle PAS du prix", () => {
    // Sans ce témoin, élargir le motif pour attraper les deux cas ci-dessus
    // ferait disparaître un conseil de paiement parfaitement légitime.
    const c = conclusionNoreco();
    c.actions_avant_signature = [
      "Renégociez l'échéancier : 80 % du montant sont exigés avant la fin des travaux. Demandez 30 % à la commande, des paiements à l'avancement, et une retenue de garantie de 5 %.",
      "Demandez à l'artisan un devis détaillé avec UNITÉS PRÉCISÉES pour CHAQUE ligne — 3 lignes sur 3 n'ont pas d'unité explicite, la comparaison aux prix du marché n'est pas fiable sans cette précision.",
    ];
    resyncTextesExpert(c);
    expect(c.actions_avant_signature).toHaveLength(2);
  });

  /**
   * 🔴 LE RÉSUMÉ DE VERDICT LE PLUS FRÉQUENT DU STOCK — 5 conclusions sur les 6
   * qui résistaient à la première passe du 26/09. « postes à renégocier » est
   * une affirmation de prix ; « Renégociez l'échéancier » ne l'est pas. Le
   * témoin juste en dessous garde la distinction.
   */
  it("🔴 « Ce devis présente des postes à renégocier » déclenche la recomposition", () => {
    const c = sansPrix("14 675 € HT pour des travaux de couverture.");
    c.verdict_reasons = {
      summary: "Ce devis présente des postes à renégocier avant signature",
      reasons: [],
      context: [],
    };
    const r = resyncTextesExpert(c);
    expect(r.recompose).toBe(true);
    expect(r.champsReecrits).toContain("verdict_reasons");
    expect(c.verdict_reasons?.summary).not.toMatch(/renégoci/i);
  });

  it("🔴 TÉMOIN — « Renégociez l'échéancier » ne déclenche toujours RIEN", () => {
    // Le même verbe, un autre objet. Sans ce témoin, le motif ci-dessus
    // effacerait un conseil de calendrier de paiement parfaitement légitime.
    const c = sansPrix("14 675 € HT pour des travaux de couverture.", [
      "Renégociez l'échéancier de paiement : 80 % du montant sont exigés avant la fin des travaux.",
    ]);
    expect(resyncTextesExpert(c).recompose).toBe(false);
  });

  it("vide la note de contexte marché, qui décrit notre mécanique", () => {
    const c = conclusionNoreco();
    resyncTextesExpert(c);
    expect(c.market_context_note).toBeNull();
  });

  /**
   * 🔴 LA SECONDE GARDE — celle qui a évité la régression du 26/09.
   *
   * Un passage à blanc sur les conclusions corrigées rendait 37 candidats là où
   * 19 seulement portaient une contradiction. Les 18 autres ont un écart nul
   * parce qu'ils NE PARLENT PAS DE PRIX. Les recomposer aurait remplacé des
   * textes exacts par une phrase creuse. Les trois cas ci-dessous sont RÉELS.
   */
  const sansPrix = (phrase: string, actions: string[] = []) => {
    const c = conclusionNoreco();
    c.phrase_intro = phrase;
    c.justifications = "";
    c.actions_avant_signature = actions;
    c.verdict_reasons = { summary: "", reasons: [], context: [] };
    return c;
  };

  it("🔴 TÉMOIN — ne touche pas à un avertissement CONTRACTUEL", () => {
    const c = sansPrix(
      "2 429,99 € HT pour une installation audio automobile à Vichy — le devis présente un risque contractuel élevé.",
    );
    const avant = JSON.stringify(c);
    expect(resyncTextesExpert(c).recompose).toBe(false);
    expect(JSON.stringify(c)).toBe(avant);
  });

  it("🔴 TÉMOIN — ne touche pas à « devis trop synthétique »", () => {
    const c = sansPrix(
      "Ce devis est trop synthétique pour être analysé en l'état. Il manque les quantités précises (m², ml, u).",
    );
    expect(resyncTextesExpert(c).recompose).toBe(false);
  });

  it("🔴 TÉMOIN — « Renégociez l'échéancier » seul ne déclenche RIEN", () => {
    // Sans ce témoin, mettre « renégoci » dans le déclencheur recomposerait des
    // conclusions justes dont le seul mot « prix » porte sur le calendrier.
    const c = sansPrix("14 675 € HT pour des travaux de couverture.", [
      "Renégociez l'échéancier : 80 % du montant sont exigés avant la fin des travaux.",
    ]);
    const r = resyncTextesExpert(c);
    expect(r.recompose).toBe(false);
    expect(r.motif).toContain("aucun texte n'affirme");
  });

  it("🔴 TÉMOIN — ne touche à RIEN quand l'expert laisse un écart", () => {
    // Sans ce témoin, « tout recomposer toujours » passerait les tests ci-dessus
    // et effacerait des textes justes sur les devis réellement surfacturés.
    const c = conclusionNoreco();
    c.surcout_global = { min: 800, max: 800 };
    const avant = JSON.stringify(c);
    const r = resyncTextesExpert(c);
    expect(r.recompose).toBe(false);
    expect(r.motif).toContain("écart");
    expect(JSON.stringify(c)).toBe(avant);
  });

  it("🔴 TÉMOIN — ne touche à RIEN quand une anomalie subsiste", () => {
    const c = conclusionNoreco();
    c.anomalies = [{ poste: "Peinture", surcout_estime: 0 }];
    const avant = JSON.stringify(c);
    expect(resyncTextesExpert(c).recompose).toBe(false);
    expect(JSON.stringify(c)).toBe(avant);
  });

  it("fonctionne sans message d'expert", () => {
    const c = conclusionNoreco();
    c.expert_message = null;
    resyncTextesExpert(c);
    expect(c.justifications).toContain("aucun écart de prix n'est retenu");
    expect(c.verdict_reasons?.reasons).toHaveLength(1);
  });

  it("ignore une salutation seule et une phrase trop courte", () => {
    const c = conclusionNoreco();
    c.expert_message = "Bonjour, OK.";
    resyncTextesExpert(c);
    // Ne doit pas produire « OK. Après cette relecture… »
    expect(c.justifications).toBe("Après relecture par un expert, aucun écart de prix n'est retenu sur ce devis.");
  });

  it("ne lève pas sur une conclusion absente", () => {
    expect(resyncTextesExpert(null).recompose).toBe(false);
    expect(resyncTextesExpert(undefined as never).recompose).toBe(false);
  });

  it("se passe d'un résumé exploitable pour le montant", () => {
    const c = conclusionNoreco();
    c.verdict_ligne = { resume: "un texte sans montant", motif: "", marge: null };
    resyncTextesExpert(c);
    expect(c.phrase_intro).toBe("Ce devis a été relu par un expert VerifierMonDevis.");
  });
});
