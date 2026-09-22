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
