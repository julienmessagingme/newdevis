/**
 * src/components/analysis/coherenceMontant.test.ts
 *
 * 🔴 L'INVARIANT QUE CE PROJET A VIOLÉ TROIS FOIS : UNE CARTE NE PEUT PAS DIRE
 * DEUX CHOSES DU MÊME PRIX.
 *
 * Historique, et c'est ce qui justifie un test plutôt qu'un correctif de plus :
 *   15/09 — le résumé citait 8 682 €, la marge 340 € (devis ALES).
 *   17/09 — le hero 3 000-4 000 €, le message d'expert 3 880 €, le détail
 *           4 520 € (devis Vilette). Trois nombres, un poste.
 *   22/09 — la carte annonce 2 024 € puis 2 223 €, ET écrit en dessous
 *           « nous ne nous prononçons pas sur les prix » (devis SMPAC).
 *
 * Chaque fois, un correctif a fermé SON chemin ; aucun n'a rendu l'invariant
 * vérifiable. C'est ça, tourner en rond. Ce fichier rend le VRAI composant et
 * refuse la contradiction, quelle que soit la porte par laquelle elle revient.
 *
 * ⚠️ Il rend `AvisSurLeDevis` avec `renderToStaticMarkup` : un test qui
 * inspecterait les données sans rendre ne verrait pas la contradiction — elle
 * naît de la COHABITATION de deux phrases sur la même carte. Les 601 tests
 * unitaires ne l'ont pas vue ; la page, si.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AvisSurLeDevis from "./AvisSurLeDevis";
import { buildVerdictLigne } from "@/lib/analyse/leviersBuilder";
import type { ConclusionData } from "@/lib/analyse/conclusionTypes";
import type { GroupePortee } from "@/lib/analyse/porteeAnalyse";
import { porteeAnalyse } from "@/lib/analyse/porteeAnalyse";

const g = (confidence: string, montant: number, label: string): GroupePortee => ({
  job_type_label: label,
  devis_lines: [{ description: label }],
  devis_total_ht: montant,
  vectorial: { confidence },
});

/** Tous les montants en euros écrits sur la carte, dans l'ordre. */
function montantsAffiches(html: string): number[] {
  const texte = html.replace(/<[^>]+>/g, " ");
  return [...texte.matchAll(/([\d][\d\s  ]*)\s*€/g)].map((m) =>
    Number(m[1].replace(/[^\d]/g, "")),
  );
}

const NIE_LES_PRIX = /nous ne nous prononçons pas sur les prix/i;

/** Le cas SMPAC : 46 % de portée (< 50 %), un écart chiffré sur 3 postes. */
function carteChiffreePorteeFaible(): string {
  const groupes = [
    g("high", 3200, "Groupe extérieur"), g("high", 2400, "Unité intérieure"),
    g("high", 1600, "Pose et raccordement"),
    g("medium", 3100, "Accessoires"), g("medium", 2400, "Liaisons frigorifiques"),
    g("low", 1900, "Mise en service"), g("no_match", 1550, "Divers"),
  ];
  const conclusion = {
    verdict_decisionnel: "signer_avec_negociation",
    verdict_global: "a_negocier",
    anomalies: [{ poste: "Groupe extérieur", surcout_estime: 2223 }],
    leviers: [
      {
        type: "surcout_postes", objectif: "negocier", niveau: "puissant",
        titre: "Négociez les postes au-dessus du marché", detail: "",
      },
    ],
    verdict_ligne: {
      resume: "16 150 € HT — quelques postes dépassent les fourchettes du marché.",
      marge: "environ 2 223 €",
    },
    surcout_global: { min: 2223, max: 2223 },
  } as unknown as ConclusionData;

  return renderToStaticMarkup(
    createElement(AvisSurLeDevis, {
      conclusion,
      portee: porteeAnalyse(groupes),
      pointsOk: ["SIRET verifie, entreprise active"],
      entrepriseName: "SMPAC",
      totalHt: 16150,
      criticalReasons: [],
    }),
  );
}

describe("une carte ne dit qu'une seule chose du prix", () => {
  it("n'écrit jamais « nous ne nous prononçons pas sur les prix » sous un montant", () => {
    const html = carteChiffreePorteeFaible();
    const montants = montantsAffiches(html);
    // Témoin : sans montant affiché, ce test ne prouverait rien.
    expect(montants.some((m) => m >= 300)).toBe(true);
    expect(NIE_LES_PRIX.test(html)).toBe(false);
  });

  it("garde la réserve quand AUCUN montant n'est affiché — témoin inverse", () => {
    const groupes = [
      g("medium", 400, "Prise de courant"), g("low", 300, "Tableau"),
      g("no_match", 200, "Divers"),
    ];
    const conclusion = {
      verdict_decisionnel: "signer",
      verdict_global: "dans_la_norme",
      anomalies: [],
      leviers: [],
      verdict_ligne: { resume: "900 € HT.", marge: null },
      surcout_global: { min: 0, max: 0 },
    } as unknown as ConclusionData;
    const html = renderToStaticMarkup(
      createElement(AvisSurLeDevis, {
        conclusion,
        portee: porteeAnalyse(groupes),
        pointsOk: [],
        entrepriseName: "TEST",
        totalHt: 900,
        criticalReasons: [],
      }),
    );
    // Sans ce témoin, supprimer purement la réserve ferait passer le test
    // précédent — et on perdrait une information vraie.
    expect(NIE_LES_PRIX.test(html)).toBe(true);
  });

  it("n'affiche qu'UN SEUL montant d'écart, jamais deux", () => {
    const html = carteChiffreePorteeFaible();
    const texte = html.replace(/<[^>]+>/g, " ");
    // Les montants d'ÉCART (pas le total du devis, qui est en sous-titre).
    const ecarts = montantsAffiches(html).filter((m) => m !== 16150);
    const distincts = new Set(ecarts);
    expect(
      distincts.size,
      `deux montants d'écart sur la même carte : ${[...distincts].join(" et ")} — ${texte.slice(0, 200)}`,
    ).toBeLessThanOrEqual(1);
  });
});

describe("le motif ne duplique pas le montant de la marge", () => {
  const signaux = {
    verdict_decisionnel: "signer_avec_negociation" as const,
    total_ht: 16150,
    surcout: { min: 2223, max: 2223 },
    // ⚠️ Volontairement DIFFÉRENT du surcout serveur : c'est le cas réel
    // (Gemini ne nomme pas exactement les postes que le serveur chiffre).
    surcout_nomme: 2024,
    anomalies_postes: ["Groupe extérieur", "Unité intérieure", "Pose"],
    quantites_manquantes: false,
    clauses_litigieuses: [],
    acompte_cumule_pct: null,
    paiement_especes_seul: false,
    entreprise_risque: null,
  };

  it("le motif ne porte AUCUN montant quand la marge en porte un", () => {
    const leviers = [
      {
        type: "surcout_postes", objectif: "negocier", niveau: "puissant",
        titre: "Négociez les postes au-dessus du marché", detail: "",
      },
    ];
    const vl = buildVerdictLigne(signaux as never, leviers as never);
    // ⚠️ 2 024 (postes NOMMÉS), pas 2 223 (agrégat serveur) : règle du 30/08.
    // Mon premier jet attendait 2 223 — il encodait le comportement que ce
    // fichier existe pour supprimer.
    expect(vl.marge, "la marge doit porter le montant attribuable").toMatch(/2\s* ?024/);
    expect(vl.marge, "et jamais l'agrégat serveur").not.toMatch(/2\s* ?223/);
    expect(
      /\d[\d\s  ]*\s*€/.test(vl.motif ?? ""),
      `le motif duplique un montant : « ${vl.motif} »`,
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2026-09-23 — DEUX AUTRES PORTES DU MÊME INVARIANT, TROUVÉES EN RENDANT
// LES 200 CARTES DU STOCK. Aucune n'était visible en lisant la base : la
// première est coupée par un dédoublonnage qui ne connaissait qu'une forme,
// la seconde naît de la cohabitation de deux blocs depuis la fusion du 22/09.
// ═══════════════════════════════════════════════════════════════════

/**
 * ⚠️ LE HTML ÉCHAPPE LES APOSTROPHES (`&#x27;`). Asserter « ne contient pas
 * d'écart estimé » sur le HTML BRUT passerait même SANS correctif : la forme
 * cherchée n'y apparaît jamais. Un test qui ne peut pas échouer ne teste rien —
 * c'est le piège du 15/09, où un jeu de données renseignait la mauvaise clé.
 */
const texteRendu = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Carte dont le TITRE porte le montant (portée pleine, poste nommé). */
function carteTitreChiffre(resume: string, marge: string, expert?: string): string {
  const groupes = [g("high", 9000, "Peinture"), g("high", 3000, "Cloison")];
  const conclusion = {
    verdict_decisionnel: "signer_avec_negociation",
    verdict_global: "a_negocier",
    anomalies: [{ poste: "Peinture", surcout_estime: 2017 }],
    surcout_global: { min: 1412, max: 2622 },
    leviers: [{ type: "surcout_postes", objectif: "negocier", niveau: "puissant", titre: "Négociez", detail: "" }],
    verdict_ligne: { resume, marge, motif: "quelques postes dépassent les fourchettes du marché" },
    ...(expert ? { expert_message: expert } : {}),
  } as unknown as ConclusionData;
  return renderToStaticMarkup(
    createElement(AvisSurLeDevis, {
      conclusion, portee: porteeAnalyse(groupes, 0, 0), totalHt: 21600,
      entrepriseName: "SAS TEST", pointsOk: [], alertes: [],
    } as never),
  );
}

describe("la parenthèse d'écart ne répète pas le titre", () => {
  it("coupe « (1 412–2 622 € d'écart estimé) » quand le titre chiffre déjà", () => {
    // Mesuré sur le stock : 9 des 23 cartes dont le titre chiffre rouvraient
    // un montant juste en dessous — jusqu'à trois nombres pour un seul fait.
    const html = carteTitreChiffre(
      "21 600 € HT — quelques postes dépassent les fourchettes du marché (1 412–2 622 € d'écart estimé).",
      "environ 2 017 €",
    );
    expect(texteRendu(html)).not.toMatch(/d.écart estimé/);
    expect(html).not.toMatch(/1\s*412/);
    // Le fait, lui, reste dit.
    expect(texteRendu(html)).toMatch(/dépassent les fourchettes du marché/);
  });

  it("coupe aussi la forme « (environ 12 300 € d'écart sur ces lignes) »", () => {
    const html = carteTitreChiffre(
      "21 600 € HT — un poste dépasse le marché (environ 2 017 € d'écart sur ces lignes).",
      "environ 2 017 €",
    );
    expect(texteRendu(html)).not.toMatch(/d.écart sur ces lignes/);
  });

  it("TÉMOIN INVERSE — sans montant au titre, la parenthèse RESTE", () => {
    // Sans ce témoin, « supprimer la parenthèse partout » passerait le test
    // principal en faisant disparaître une information utile.
    const groupes = [g("high", 9000, "Peinture")];
    const conclusion = {
      verdict_decisionnel: "signer_avec_negociation",
      verdict_global: "a_negocier",
      anomalies: [],                       // aucun poste nommé → le titre ne chiffre pas
      surcout_global: { min: 1412, max: 2622 },
      leviers: [{ type: "acompte", objectif: "securiser", niveau: "important", titre: "Acompte", detail: "" }],
      verdict_ligne: {
        resume: "21 600 € HT — quelques postes dépassent le marché (1 412–2 622 € d'écart estimé).",
        marge: null, motif: "quelques postes dépassent le marché",
      },
    } as unknown as ConclusionData;
    const html = renderToStaticMarkup(
      createElement(AvisSurLeDevis, {
        conclusion, portee: porteeAnalyse(groupes, 0, 0), totalHt: 21600,
        entrepriseName: "SAS TEST", pointsOk: [], alertes: [],
      } as never),
    );
    expect(texteRendu(html)).toMatch(/d.écart estimé/);
  });
});

describe("le message de l'expert n'est pas affiché deux fois", () => {
  const EXPERT =
    "Bonjour, Après une relecture approfondie de votre devis par notre expert, nous vous recommandons de ne pas signer ce document en l'état pour plusieurs raisons majeures. La première tient aux conditions de paiement.";

  it("le résumé se tait quand il n'est que le début du message d'expert", () => {
    // `resyncVerdictLigne` (05/09) reprend la première phrase de l'expert comme
    // résumé — légitime — mais depuis la fusion du 22/09 les deux blocs
    // cohabitent : 15 cartes du stock l'affichaient deux fois.
    const html = carteTitreChiffre(
      "Bonjour, Après une relecture approfondie de votre devis par notre expert, nous vous recommandons de ne pas signer ce document en l'état pour plusieurs raisons majeures.",
      "environ 2 017 €",
      EXPERT,
    );
    const texte = html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(texte.split("Après une relecture approfondie").length - 1).toBe(1);
    // ⚠️ Et il reste affiché : on ne se tait que parce que l'encadré le porte.
    expect(texte).toMatch(/Vérifié par un expert/);
    expect(texte).toMatch(/La première tient aux conditions de paiement/);
  });

  it("🔴 LA MARGE SURVIT AU DÉDOUBLONNAGE quand le titre ne la porte pas", () => {
    // Trouvé par le banc de perte, pas à la relecture : ma première version
    // retournait `null` sec. Sur ATARAXIA (« Ne signez pas en l'état », titre
    // sans montant) la carte perdait « environ 390 € » — un correctif de
    // doublon ne doit jamais faire disparaître le montant.
    const groupes = [g("high", 9000, "Peinture")];
    const conclusion = {
      verdict_decisionnel: "ne_pas_signer",
      verdict_global: "a_risque",
      anomalies: [{ poste: "Peinture", surcout_estime: 390 }],
      surcout_global: { min: 390, max: 390 },
      leviers: [],
      verdict_ligne: { resume: "Bonjour, Après analyse de votre document.", marge: "environ 390 €", motif: "x" },
      expert_message: "Bonjour, Après analyse de votre document. Les tarifs sont très élevés.",
    } as unknown as ConclusionData;
    const html = renderToStaticMarkup(
      createElement(AvisSurLeDevis, {
        conclusion, portee: porteeAnalyse(groupes, 0, 0), totalHt: 17565,
        entrepriseName: "ATARAXIA", pointsOk: [], alertes: [],
      } as never),
    );
    expect(texteRendu(html)).toMatch(/390/);
    // ⚠️ CE TEST A CHANGÉ DE LIBELLÉ LE 23/09 AU SOIR, ET C'EST DÉLIBÉRÉ : le
    // scénario est un REFUS (ATARAXIA), et depuis le reformulage on n'y parle
    // plus de « marge de négociation » mais d'« écart estimé sur les prix ».
    // Son INTENTION est inchangée — le montant doit survivre au dédoublonnage —
    // et c'est elle que porte l'assertion sur `390` juste au-dessus.
    expect(texteRendu(html)).toMatch(/Écart estimé sur les prix/);
  });
});

describe("on ne propose pas de négocier ce qu'on refuse (2026-09-23)", () => {
  /** Carte en refus portant un montant que le titre ne peut pas afficher. */
  const carteRefus = () => {
    const groupes = [g("high", 9000, "Charpente")];
    const conclusion = {
      verdict_decisionnel: "ne_pas_signer",
      verdict_global: "a_risque",
      anomalies: [{ poste: "Charpente", surcout_estime: 390 }],
      surcout_global: { min: 390, max: 390 },
      leviers: [],
      verdict_ligne: { resume: "17 565 € HT — deux postes dépassent le marché.", marge: "environ 390 €", motif: "x" },
    } as unknown as ConclusionData;
    return renderToStaticMarkup(
      createElement(AvisSurLeDevis, {
        conclusion, portee: porteeAnalyse(groupes, 0, 0), totalHt: 17565,
        entrepriseName: "ATARAXIA", pointsOk: [], alertes: [],
      } as never),
    );
  };

  it("sous un refus, le montant est un ÉCART, pas une marge de négociation", () => {
    // Mesuré sur le rendu des 200 cartes : 9 des 48 refus disaient « Marge de
    // négociation estimée » sous « Ne signez pas en l'état » — le mot suppose
    // qu'on va contracter, alors que la carte vient de dire l'inverse.
    const t = texteRendu(carteRefus());
    expect(t).not.toMatch(/Marge de négociation/);
    expect(t).toMatch(/Écart estimé sur les prix/);
  });

  it("🔴 LE MONTANT RESTE AFFICHÉ — on reformule, on ne masque pas", () => {
    // Sur ces cartes le titre ne porte aucun chiffre : masquer ferait
    // disparaître le montant de la page. C'est la perte que le banc du 23/09
    // a déjà attrapée une fois sur ce composant.
    expect(texteRendu(carteRefus())).toMatch(/390/);
  });

  it("TÉMOIN — hors refus, le libellé de négociation RESTE", () => {
    // Sans ce témoin, « supprimer le mot partout » passerait le test principal.
    const groupes = [g("high", 9000, "Peinture")];
    const conclusion = {
      verdict_decisionnel: "signer_avec_negociation",
      verdict_global: "a_negocier",
      anomalies: [],                       // aucun poste nommé → le titre ne chiffre pas
      surcout_global: { min: 390, max: 390 },
      leviers: [{ type: "acompte", objectif: "securiser", niveau: "important", titre: "Acompte", detail: "" }],
      verdict_ligne: { resume: "21 600 € HT — un poste dépasse le marché.", marge: "environ 390 €", motif: "x" },
    } as unknown as ConclusionData;
    const t = texteRendu(
      renderToStaticMarkup(
        createElement(AvisSurLeDevis, {
          conclusion, portee: porteeAnalyse(groupes, 0, 0), totalHt: 21600,
          entrepriseName: "SAS TEST", pointsOk: [], alertes: [],
        } as never),
      ),
    );
    expect(t).toMatch(/Marge de négociation estimée/);
  });
});
