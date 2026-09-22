/**
 * scripts/preview-hero-analyse.mts
 *
 * APERÇU DU HERO — LE VRAI COMPOSANT, PAS UNE MAQUETTE RÉÉCRITE.
 *
 * 🔴 Ce script REND `AvisSurLeDevis` avec `renderToStaticMarkup`. Il ne
 * recopie ni un titre, ni une phrase, ni une couleur.
 *
 * C'est la leçon de `preview-review-email.ts` (2026-09-11) : cet outil-là
 * tenait sa propre copie des gabarits « faute d'export », et il a fini par
 * faire approuver un texte qui n'était plus celui qui partait. Un aperçu qui
 * a son propre wording ne valide rien.
 *
 * Lancer :  npx tsx scripts/preview-hero-analyse.mts
 * Sortie :  scripts/out/preview-hero-analyse.html
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import AvisSurLeDevis from "@/components/analysis/AvisSurLeDevis";
import { porteeAnalyse, type GroupePortee } from "@/lib/analyse/porteeAnalyse";
import type { ConclusionData } from "@/lib/analyse/conclusionTypes";

/** Un groupe rapproché, tel que le stock en contient. */
const g = (confidence: string, montant: number, label: string): GroupePortee => ({
  job_type_label: label,
  devis_lines: [{ description: label }],
  devis_total_ht: montant,
  vectorial: { confidence },
});

interface Cas {
  cle: string;
  entreprise?: string;
  totalHt?: number;
  pointsOk?: string[];
  attendu: string;
  provenance: string;
  conclusion: Partial<ConclusionData>;
  groupes: GroupePortee[];
  criticalReasons?: string[];
}

const CAS: Cas[] = [
  // ── VERT ────────────────────────────────────────────────────────────────
  {
    cle: "vert",
    entreprise: "DUPONT Rénovation", totalHt: 8400,
    pointsOk: ["SIRET verifie, entreprise active depuis 2012", "Conditions de paiement conformes aux usages", "Certification RGE verifiee au registre"],
    attendu: "🟢 rien constaté, prix comparés",
    provenance: "construit — 7 postes sur 9 opposables, aucun écart, aucun levier de constat",
    conclusion: {
      verdict_decisionnel: "signer",
      verdict_global: "dans_la_norme",
      anomalies: [],
      leviers: [
        { type: "references", objectif: "securiser", niveau: "bonus",
          titre: "Demandez 2-3 références de chantiers récents similaires",
          detail: "Un artisan fier de son travail les partage volontiers." } as never,
      ],
      verdict_ligne: {
        resume: "8 400 € HT — prix dans les fourchettes du marché et conditions habituelles.",
        marge: null,
      } as never,
      surcout_global: { min: 0, max: 0 },
    },
    groupes: [
      g("high", 2400, "Cloison placo"), g("high", 1800, "Peinture murs et plafonds"),
      g("high", 1500, "Carrelage sol"), g("high", 900, "Pose porte intérieure"),
      g("high", 700, "Plinthes"), g("high", 550, "Dépose cloison"),
      g("high", 400, "Évacuation gravats"),
      g("low", 90, "Nettoyage fin de chantier"), g("no_match", 60, "Divers"),
    ],
  },

  // ── GRIS ────────────────────────────────────────────────────────────────
  {
    cle: "gris",
    entreprise: "JeanBERNARD & Fils", totalHt: 1093,
    pointsOk: ["SIRET verifie, entreprise active", "Conditions de paiement claires"],
    attendu: "🟢 rien constaté, prix non comparables",
    provenance: "RÉEL — devis JeanBERNARD & Fils, 1 093 € HT, 22/09/2026",
    conclusion: {
      verdict_decisionnel: "signer_avec_negociation",
      verdict_global: "eleve_justifie",
      anomalies: [],
      leviers: [
        { type: "references", objectif: "securiser", niveau: "bonus",
          titre: "Demandez 2-3 références de chantiers récents similaires",
          detail: "Un artisan fier de son travail les partage volontiers." } as never,
      ],
      verdict_ligne: {
        // Le texte que la page affichait AVANT le correctif : il reste dans la
        // conclusion, il n'est simplement plus lu dans cet état.
        resume: "1 093 € HT — quelques prestations méritent une clarification avec l'artisan avant signature.",
        marge: null,
      } as never,
      surcout_global: { min: 0, max: 0 },
      comparison_indicative: true,
    },
    groupes: [
      g("high", 225, "Prise de courant 2P+T"),
      g("medium", 163, "Ajout interrupteur différentiel"),
      g("medium", 44, "Ajout interrupteur"),
      g("medium", 75, "Déménagement de cuisine"),
      g("low", 183, "Tableau électrique neuf"), g("low", 96, "Tableau électrique neuf"),
      g("low", 70, "Pose plaque de cuisson"), g("low", 34, "Réfection électrique complète"),
      g("no_match", 128, "Alimentation 32 A plaques"), g("no_match", 75, "VMC — pose bouches"),
    ],
  },

  // ── ORANGE ──────────────────────────────────────────────────────────────
  {
    cle: "orange",
    entreprise: "MARTIN Carrelage", totalHt: 10746,
    pointsOk: ["SIRET verifie, entreprise active depuis 2009", "Conditions de paiement conformes aux usages"],
    attendu: "🟠 un écart constaté et nommé",
    provenance: "construit — 1 062 € sur deux postes nommés, 6 postes sur 9 opposables",
    conclusion: {
      verdict_decisionnel: "signer_avec_negociation",
      verdict_global: "a_negocier",
      anomalies: [
        { poste: "Cloison placo", surcout_estime: 726 } as never,
        { poste: "Carrelage sol", surcout_estime: 336 } as never,
      ],
      leviers: [
        { type: "surcout_postes", objectif: "negocier", niveau: "puissant",
          titre: "Négociez deux postes au-dessus du marché (environ 1 062 €)",
          detail: "Cloison placo 22 m² à 128 €/m² et carrelage 14 m² à 118 €/m²." } as never,
      ],
      verdict_ligne: {
        resume: "10 746 € HT — deux postes dépassent le plafond du marché.",
        marge: "environ 1 062 €",
      } as never,
      surcout_global: { min: 1062, max: 1062 },
    },
    groupes: [
      g("high", 2816, "Cloison placo"), g("high", 1652, "Carrelage sol"),
      g("high", 1900, "Peinture murs et plafonds"), g("high", 1300, "Plomberie sanitaires"),
      g("high", 780, "Faïence salle de bain"), g("high", 620, "Dépose cloison"),
      g("medium", 900, "Menuiserie sur mesure"), g("low", 500, "Reprise électrique"),
      g("no_match", 278, "Divers chantier"),
    ],
  },

  // ── ORANGE sans montant ─────────────────────────────────────────────────
  {
    cle: "orange-points",
    entreprise: "ALTEC Plomberie", totalHt: 6200,
    pointsOk: ["SIRET verifie, entreprise active depuis 2016"],
    attendu: "🟠 des points à sécuriser, sans montant",
    provenance: "construit — acompte au-dessus de l'usage + une clause à faire préciser",
    conclusion: {
      verdict_decisionnel: "signer_avec_negociation",
      verdict_global: "a_negocier",
      anomalies: [],
      leviers: [
        { type: "acompte", objectif: "negocier", niveau: "important",
          titre: "Ramenez l'acompte à 30 %", detail: "Le devis demande 50 % à la signature." } as never,
        { type: "clause_orange", objectif: "securiser", niveau: "important",
          titre: "Faites préciser la clause de sous-traitance", detail: "" } as never,
        // ⚠️ Conseil UNIVERSEL : présent, mais il ne colore plus la page.
        { type: "retenue_garantie", objectif: "securiser", niveau: "bonus",
          titre: "Prévoyez une retenue de garantie de 5 %", detail: "" } as never,
      ],
      verdict_ligne: { resume: "6 200 € HT — l'acompte demandé dépasse l'usage.", marge: null } as never,
      surcout_global: { min: 0, max: 0 },
    },
    groupes: [
      g("high", 3200, "Plomberie sanitaires"), g("high", 1800, "Carrelage sol"),
      g("high", 700, "Peinture murs"), g("low", 500, "Divers"),
    ],
  },

  // ── ROUGE ───────────────────────────────────────────────────────────────
  {
    cle: "rouge",
    entreprise: "RENOV EXPRESS", totalHt: 24300,
    attendu: "🔴 fait bloquant (hard block)",
    provenance: "construit — entreprise en liquidation + acompte 60 %",
    conclusion: {
      verdict_decisionnel: "ne_pas_signer",
      verdict_global: "a_risque",
      anomalies: [],
      leviers: [],
      surcout_global: { min: 0, max: 0 },
    },
    groupes: [g("high", 12000, "Gros œuvre"), g("high", 8000, "Charpente")],
    criticalReasons: [
      "L'entreprise est en liquidation judiciaire depuis le 14/03/2026 — le devis est daté du 2 septembre (SIREN 812 345 678).",
      "Acompte demandé de 60 % (14 580 €) : l'usage est de 30 % maximum, et versés à une entreprise en liquidation ils ne seraient probablement pas récupérables.",
    ],
  },
];

// ── Rendu ────────────────────────────────────────────────────────────────
const cartes = CAS.map((cas) => {
  const portee = porteeAnalyse(cas.groupes);
  const html = renderToStaticMarkup(
    createElement(AvisSurLeDevis, {
      conclusion: cas.conclusion as ConclusionData,
      portee,
      pointsOk: cas.pointsOk ?? [],
      entrepriseName: cas.entreprise ?? null,
      totalHt: cas.totalHt ?? null,
      criticalReasons: cas.criticalReasons ?? [],
    }),
  );
  const compte = portee ? `${portee.compares}/${portee.total} postes · ${portee.pctMontant} % du montant` : "—";
  return `
    <section class="cas">
      <header>
        <h2>${cas.attendu}</h2>
        <p class="meta">${cas.provenance}<br><span class="portee">portée mesurée : ${compte}</span></p>
      </header>
      <div class="rendu">${html}</div>
    </section>`;
}).join("\n");

const page = `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aperçu hero — les états du verdict</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  /* Tokens du projet (src/index.css) — sans eux, text-foreground ne rend rien. */
  :root{--background:220 20% 97%;--foreground:220 30% 15%;--primary:220 70% 35%;
        --muted-foreground:220 15% 45%;--border:220 20% 88%;}
  .text-foreground{color:hsl(var(--foreground))}
  .text-foreground\\/80{color:hsl(var(--foreground)/.8)}
  .text-foreground\\/75{color:hsl(var(--foreground)/.75)}
  .text-foreground\\/60{color:hsl(var(--foreground)/.6)}
  .border-foreground\\/10{border-color:hsl(var(--foreground)/.1)}
  .border-foreground\\/15{border-color:hsl(var(--foreground)/.15)}
  .bg-background\\/60{background:hsl(var(--background)/.6)}
  .decoration-foreground\\/25{text-decoration-color:hsl(var(--foreground)/.25)}
  body{background:#f6f7f9;font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif;
       margin:0;padding:32px 20px 64px}
  .wrap{max-width:780px;margin:0 auto}
  h1{font-size:19px;font-weight:650;color:#0f172a;margin:0 0 6px}
  .intro{font-size:13px;color:#64748b;margin:0 0 32px;line-height:1.6}
  .cas{margin-bottom:38px}
  .cas h2{font-size:13px;font-weight:650;color:#0f172a;margin:0 0 3px;letter-spacing:-.01em}
  .meta{font-size:11.5px;color:#94a3b8;margin:0 0 10px;line-height:1.5}
  .portee{color:#cbd5e1}
  .rendu{}
</style></head><body><div class="wrap">
<h1>Hero d'analyse — les états du verdict</h1>
<p class="intro">Rendu du composant <code>AvisSurLeDevis</code> par <code>renderToStaticMarkup</code>.
Aucun texte n'est recopié ici : ce sont les titres, les phrases et les couleurs que le client voit.</p>
${cartes}
</div></body></html>`;

const sortie = resolve(process.cwd(), "scripts/out/preview-hero-analyse.html");
mkdirSync(dirname(sortie), { recursive: true });
writeFileSync(sortie, page, "utf8");

console.log("APERÇU DU HERO\n" + "=".repeat(66) + "\n");
for (const cas of CAS) {
  const portee = porteeAnalyse(cas.groupes);
  const html = renderToStaticMarkup(
    createElement(AvisSurLeDevis, {
      conclusion: cas.conclusion as ConclusionData,
      portee,
      pointsOk: cas.pointsOk ?? [],
      entrepriseName: cas.entreprise ?? null,
      totalHt: cas.totalHt ?? null,
      criticalReasons: cas.criticalReasons ?? [],
    }),
  );
  const texte = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  console.log(`${cas.attendu}`);
  console.log(`  ${texte}\n`);
}
console.log(`HTML écrit : ${sortie}`);
