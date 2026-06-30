#!/usr/bin/env tsx
/**
 * scripts/preview-comparator-mockup.ts
 *
 * Génère 3 maquettes HTML statiques du Comparateur V1 — aligné design system VMD.
 *
 * v2 (2026-06-30) — révision après retour Julien :
 *   - 4 sections thématiques au lieu d'un mega-tableau (PRIX / ENTREPRISE /
 *     POINTS CLEFS / POINTS DE VIGILANCE)
 *   - Détail postes en accordion replié
 *   - Verdict expert focalisé sur valeur ajoutée (postes manquants, quantités
 *     différentes, qualité matériel) au lieu de "moins cher" trivial
 *   - Posture honnêteté : "Information non disponible" si on ne sait pas
 *   - Couleurs alignées sur les CSS variables VMD (--primary, --background,
 *     --border, etc.)
 *
 * USAGE :
 *   npx tsx scripts/preview-comparator-mockup.ts
 *   start scratchpad/comparator-mockups/index.html
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "scratchpad", "comparator-mockups");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

interface Devis {
  id: string;
  name: string;
  artisan: string;
  total_ht: number;
  total_ttc: number;
  acompte_pct: number;
  anciennete_ans: number;
  google_note: number | null; // null = info non dispo (HONNÊTETÉ)
  google_reviews: number | null;
  assurance: boolean | null;
  clauses_litigieuses: string[]; // Liste détaillée (ex: ["pas_de_retractation"])
  quantites_pct: number;
  echeancier_clair: boolean;
  materiel_marque_mentionnee: string[]; // Marques détectées (ex: ["Geberit", "Grohe"])
  postes: Record<string, number | null>; // null = poste non inclus
  quantites_postes: Record<string, string | null>; // ex: "carrelage: 30m²"
  verdict_prix: "Bas" | "Correct" | "Élevé";
  rank: 1 | 2 | 3 | 4;
  is_recommended: boolean;
  extraction_confiance: "certifie" | "indicatif"; // si indicatif → bandeau
}

const DEVIS: Devis[] = [
  {
    id: "A",
    name: "Devis 1",
    artisan: "Plomberie Martin",
    total_ht: 12450,
    total_ttc: 13694.5,
    acompte_pct: 30,
    anciennete_ans: 8,
    google_note: 4.7,
    google_reviews: 47,
    assurance: true,
    clauses_litigieuses: [],
    quantites_pct: 100,
    echeancier_clair: true,
    materiel_marque_mentionnee: ["Grohe", "Geberit", "Porcelanosa"],
    postes: {
      "Dépose existant": 800,
      "Plomberie SDB": 4200,
      "Carrelage sol+murs": 3500,
      "Électricité": 1200,
      "Pose meuble vasque": 850,
      "Pose receveur + paroi": 1100,
      "Nettoyage fin chantier": 200,
      "Évacuation gravats": 600,
    },
    quantites_postes: {
      "Carrelage sol+murs": "35 m²",
      "Plomberie SDB": "Mitigeur Grohe + raccordement complet",
    },
    verdict_prix: "Correct",
    rank: 1,
    is_recommended: true,
    extraction_confiance: "certifie",
  },
  {
    id: "B",
    name: "Devis 2",
    artisan: "BTP Solutions",
    total_ht: 10800,
    total_ttc: 11880,
    acompte_pct: 50,
    anciennete_ans: 2,
    google_note: 3.8,
    google_reviews: 9,
    assurance: true,
    clauses_litigieuses: [],
    quantites_pct: 60,
    echeancier_clair: false,
    materiel_marque_mentionnee: [], // Aucune marque mentionnée
    postes: {
      "Dépose existant": null, // NON INCLUS
      "Plomberie SDB": 4500,
      "Carrelage sol+murs": 3200,
      "Électricité": 1100,
      "Pose meuble vasque": 700,
      "Pose receveur + paroi": 900,
      "Nettoyage fin chantier": null, // NON INCLUS
      "Évacuation gravats": 400,
    },
    quantites_postes: {
      "Carrelage sol+murs": "28 m²", // 28 vs 35 chez A = 20% de moins
      "Plomberie SDB": "Forfait global", // Pas de détail
    },
    verdict_prix: "Bas",
    rank: 3,
    is_recommended: false,
    extraction_confiance: "certifie",
  },
  {
    id: "C",
    name: "Devis 3",
    artisan: "Renov'Express",
    total_ht: 13200,
    total_ttc: 14520,
    acompte_pct: 30,
    anciennete_ans: 12,
    google_note: 4.5,
    google_reviews: 78,
    assurance: true,
    clauses_litigieuses: ["pas_de_retractation"],
    quantites_pct: 100,
    echeancier_clair: true,
    materiel_marque_mentionnee: ["Villeroy & Boch", "Hansgrohe"],
    postes: {
      "Dépose existant": 950,
      "Plomberie SDB": 4600,
      "Carrelage sol+murs": 3700,
      "Électricité": 1300,
      "Pose meuble vasque": 900,
      "Pose receveur + paroi": 1200,
      "Nettoyage fin chantier": 250,
      "Évacuation gravats": 300,
    },
    quantites_postes: {
      "Carrelage sol+murs": "35 m²",
      "Plomberie SDB": "Mitigeur Hansgrohe + colonne thermo",
    },
    verdict_prix: "Élevé",
    rank: 2,
    is_recommended: false,
    extraction_confiance: "certifie",
  },
  {
    id: "D",
    name: "Devis 4",
    artisan: "AB Travaux",
    total_ht: 11600,
    total_ttc: 12760,
    acompte_pct: 30,
    anciennete_ans: 5,
    google_note: null, // INFO NON DISPO (entreprise pas trouvée sur Google)
    google_reviews: null,
    assurance: true,
    clauses_litigieuses: [],
    quantites_pct: 90,
    echeancier_clair: true,
    materiel_marque_mentionnee: [], // Pas de marque mentionnée
    postes: {
      "Dépose existant": 850,
      "Plomberie SDB": 4100,
      "Carrelage sol+murs": 3300,
      "Électricité": 1150,
      "Pose meuble vasque": 800,
      "Pose receveur + paroi": 1000,
      "Nettoyage fin chantier": 200,
      "Évacuation gravats": 200,
    },
    quantites_postes: {
      "Carrelage sol+murs": "33 m²",
      "Plomberie SDB": "WC suspendu + lavabo (marque non précisée)",
    },
    verdict_prix: "Correct",
    rank: 4,
    is_recommended: false,
    extraction_confiance: "certifie",
  },
];

const ALL_POSTES = Array.from(new Set(DEVIS.flatMap((d) => Object.keys(d.postes))));
const recommended = DEVIS.find((d) => d.is_recommended)!;

function fmt(n: number): string {
  return n.toLocaleString("fr-FR");
}

function rankLabel(r: number): string {
  return r === 1 ? "🥇 1er" : r === 2 ? "🥈 2e" : r === 3 ? "🥉 3e" : "4e";
}

// ─────────────────────────────────────────────────────────────────
// SHARED HEADER / DESIGN SYSTEM (aligné CSS vars VMD)
// ─────────────────────────────────────────────────────────────────

const CSS = `
  /* Tokens VMD (src/index.css) */
  :root {
    --background: hsl(220, 20%, 97%);
    --foreground: hsl(220, 30%, 15%);
    --card: hsl(0, 0%, 100%);
    --primary: hsl(220, 70%, 35%);
    --primary-light: hsl(220, 60%, 95%);
    --muted: hsl(220, 15%, 94%);
    --muted-foreground: hsl(220, 15%, 45%);
    --border: hsl(220, 20%, 88%);
    --score-green: hsl(142, 71%, 45%);
    --score-amber: hsl(38, 92%, 50%);
    --score-red: hsl(0, 72%, 51%);
    --radius: 0.75rem;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    background: var(--background);
    color: var(--foreground);
    line-height: 1.5;
  }

  header.vmd-header {
    background: var(--card);
    border-bottom: 1px solid var(--border);
    padding: 14px 24px;
    display: flex; align-items: center; gap: 16px;
  }
  header .logo {
    font-weight: 700; font-size: 16px; color: var(--primary);
  }
  header nav {
    margin-left: auto; display: flex; gap: 18px; font-size: 14px;
    color: var(--muted-foreground);
  }
  header nav a {
    color: var(--muted-foreground); text-decoration: none;
  }
  header nav a:hover { color: var(--foreground); }

  main { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
  h1 { font-size: 24px; margin: 0 0 8px; letter-spacing: -0.01em; }
  h2 { font-size: 17px; margin: 28px 0 14px; color: var(--foreground); letter-spacing: -0.01em; }
  .breadcrumb { color: var(--muted-foreground); font-size: 13px; margin-bottom: 16px; }
  .breadcrumb a { color: var(--primary); text-decoration: none; }

  /* Verdict hero */
  .verdict-hero {
    background: var(--card);
    border: 2px solid var(--primary);
    border-radius: var(--radius);
    padding: 28px;
    margin-bottom: 28px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.04);
  }
  .verdict-hero .badge {
    display: inline-block; background: var(--primary); color: #fff;
    padding: 4px 10px; border-radius: 999px; font-size: 10px;
    font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  }
  .verdict-hero h2 {
    margin: 14px 0 4px; font-size: 22px; color: var(--foreground);
  }
  .verdict-hero .winner {
    font-size: 22px; color: var(--primary); font-weight: 700;
  }
  .verdict-hero .summary {
    font-size: 14px; color: var(--muted-foreground); margin: 6px 0 18px;
  }
  .findings {
    background: var(--muted); border-radius: 10px; padding: 16px 20px;
    margin: 16px 0;
  }
  .findings h3 {
    margin: 0 0 12px; font-size: 12px; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--muted-foreground);
  }
  .finding {
    display: flex; gap: 12px; padding: 8px 0;
    border-top: 1px solid var(--border);
  }
  .finding:first-of-type { border-top: 0; }
  .finding .icon {
    flex: 0 0 28px; font-size: 18px; line-height: 22px; text-align: center;
  }
  .finding .body {
    flex: 1; font-size: 13.5px; color: var(--foreground); line-height: 1.55;
  }
  .finding .body strong { color: var(--foreground); }
  .levers {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
    margin-top: 22px;
  }
  .lever {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 10px; padding: 14px 16px;
  }
  .lever .title {
    font-weight: 700; font-size: 13px; color: var(--foreground);
    margin-bottom: 6px; line-height: 1.4;
  }
  .lever .winner {
    font-size: 14px; color: var(--primary); font-weight: 600; margin-bottom: 4px;
  }
  .lever .body {
    font-size: 12.5px; color: var(--muted-foreground); line-height: 1.55;
  }

  /* Sections thématiques */
  .section {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 22px 24px;
    margin-bottom: 18px;
  }
  .section-title {
    display: flex; align-items: center; gap: 10px;
    margin: 0 0 16px; font-size: 14px;
    font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.07em; color: var(--muted-foreground);
  }
  .section-title .dot {
    width: 8px; height: 8px; border-radius: 50%; background: var(--primary);
  }
  .grid-4 {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
  }
  .mini-card {
    background: var(--background); border-radius: 10px; padding: 14px;
    border: 1px solid transparent;
  }
  .mini-card.recommended {
    border-color: var(--primary); background: var(--primary-light);
  }
  .mini-card .label {
    font-size: 11px; color: var(--muted-foreground);
    text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px;
  }
  .mini-card .value {
    font-size: 17px; font-weight: 700; color: var(--foreground);
  }
  .mini-card .sub {
    font-size: 12px; color: var(--muted-foreground); margin-top: 4px;
  }
  .green { color: hsl(142, 71%, 35%); }
  .red { color: var(--score-red); }
  .amber { color: hsl(38, 92%, 35%); }
  .unknown { color: var(--muted-foreground); font-style: italic; }

  /* Points clefs / vigilance */
  .point-item {
    padding: 14px 16px; border-radius: 10px;
    background: var(--background); margin-bottom: 8px;
    display: flex; gap: 14px; align-items: flex-start;
  }
  .point-item.warning { background: hsl(38, 92%, 95%); }
  .point-item.danger { background: hsl(0, 72%, 95%); }
  .point-item .icon {
    flex: 0 0 24px; font-size: 18px; line-height: 24px;
  }
  .point-item .content {
    flex: 1; font-size: 13.5px; color: var(--foreground); line-height: 1.55;
  }
  .point-item .content strong { color: var(--foreground); }
  .point-item .which {
    font-size: 12px; color: var(--muted-foreground); margin-top: 4px;
  }

  /* Accordion postes */
  details.postes-detail {
    margin-top: 24px;
    background: var(--card); border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  details.postes-detail summary {
    padding: 16px 22px; cursor: pointer; user-select: none;
    font-weight: 600; font-size: 14px;
    display: flex; align-items: center; justify-content: space-between;
  }
  details.postes-detail summary::after {
    content: "▼"; font-size: 10px; color: var(--muted-foreground);
  }
  details[open].postes-detail summary::after { content: "▲"; }
  .postes-table-wrap { padding: 0 22px 22px; overflow-x: auto; }
  table.postes {
    width: 100%; border-collapse: collapse; font-size: 13px;
  }
  table.postes th, table.postes td {
    padding: 10px 8px; border-bottom: 1px solid var(--border);
    text-align: center;
  }
  table.postes th:first-child, table.postes td:first-child {
    text-align: left; color: var(--muted-foreground); font-weight: 500;
  }
  table.postes thead th { font-size: 12px; color: var(--muted-foreground); font-weight: 700; }
  table.postes thead th.recommended { color: var(--primary); }
  td.poste-missing { color: var(--score-red); font-weight: 600; font-size: 12px; }
  td.poste-included { font-weight: 500; }
  td.recommended { background: var(--primary-light); }

  /* Boutons */
  .actions {
    display: flex; gap: 12px; justify-content: center; margin-top: 28px;
  }
  .btn {
    padding: 12px 22px; border-radius: 10px;
    font-weight: 600; font-size: 14px; text-decoration: none;
    cursor: pointer; border: none;
    font-family: inherit;
  }
  .btn-primary { background: var(--primary); color: #fff; }
  .btn-secondary {
    background: var(--card); color: var(--foreground); border: 1px solid var(--border);
  }

  /* Bandeau honnêteté */
  .honesty-disclaimer {
    background: var(--muted); padding: 12px 16px; border-radius: 8px;
    font-size: 12.5px; color: var(--muted-foreground); margin-top: 16px;
    border-left: 3px solid var(--muted-foreground);
  }

  /* Mobile cards */
  .card-stack { display: flex; flex-direction: column; gap: 14px; }
  .devis-card {
    background: var(--card); border-radius: var(--radius); padding: 18px;
    border: 1px solid var(--border);
  }
  .devis-card.recommended { border: 2px solid var(--primary); background: var(--primary-light); }
  .devis-card .top {
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;
  }
  .devis-card .artisan { font-weight: 700; font-size: 16px; }
  .devis-card .reco-badge {
    background: var(--primary); color: #fff; font-size: 10px;
    padding: 3px 8px; border-radius: 999px; font-weight: 700;
  }
  .devis-card .price { font-size: 22px; font-weight: 700; margin: 8px 0; }
  .devis-card .meta {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
    font-size: 12px; color: var(--muted-foreground); margin: 12px 0;
  }
  .devis-card .meta strong { color: var(--foreground); font-weight: 600; }

  /* Empty state */
  .empty-hero {
    background: var(--card); border-radius: var(--radius);
    padding: 48px 36px; text-align: center;
    border: 1px solid var(--border);
  }
  .empty-hero h1 { font-size: 26px; margin: 0 0 14px; }
  .empty-hero p {
    color: var(--muted-foreground); max-width: 560px;
    margin: 0 auto 28px; line-height: 1.65;
  }
  .empty-hero .steps {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 16px; margin: 32px 0;
  }
  .empty-hero .step {
    text-align: left; padding: 18px;
    background: var(--background); border-radius: 12px;
  }
  .empty-hero .step .num {
    width: 28px; height: 28px; background: var(--primary); color: #fff;
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 13px; margin-bottom: 10px;
  }
  .empty-hero .step h3 { font-size: 14px; margin: 0 0 6px; }
  .empty-hero .step p { font-size: 13px; margin: 0; max-width: none; }

  .mockup-label {
    position: fixed; top: 8px; right: 8px;
    background: var(--primary); color: #fff; font-size: 11px;
    padding: 4px 10px; border-radius: 6px; font-weight: 600; z-index: 100;
  }
`;

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title} — Maquette Comparateur VMD</title>
<style>${CSS}</style>
</head>
<body>
<div class="mockup-label">MAQUETTE STATIQUE</div>
${body}
</body></html>`;
}

const headerHtml = `
<header class="vmd-header">
  <span class="logo">VerifierMonDevis.fr</span>
  <nav>
    <a href="#">Mes analyses</a>
    <a href="#" style="color: var(--primary); font-weight: 600;">Comparateur</a>
    <a href="#">Mon compte</a>
  </nav>
</header>`;

// ─────────────────────────────────────────────────────────────────
// PAGE 1 — Desktop : 4 sections + verdict + détail accordion
// ─────────────────────────────────────────────────────────────────

function desktopPage(): string {
  // POINTS CLEFS — différences importantes que seul un expert voit
  const pointsClefs = [
    {
      icon: "📦",
      title: "Postes inclus complets vs incomplets",
      detail:
        "<strong>Artisan B (BTP Solutions) omet 2 postes essentiels</strong> : la <em>dépose de l'existant</em> (~800–950 €) et le <em>nettoyage fin de chantier</em> (~200 €). Si tu signes son devis tel quel, tu retrouveras ces postes en facture supplémentaire — coût caché ~1000 € qui annule l'économie apparente.",
    },
    {
      icon: "📐",
      title: "Quantités déclarées : écart de 20% sur le carrelage",
      detail:
        "Pour le même chantier, <strong>artisan B chiffre 28 m² de carrelage</strong> contre <strong>35 m² chez les autres</strong>. Soit la pièce fait vraiment 28 m² (auquel cas les autres surfacturent), soit B a sous-estimé pour paraître moins cher. <em>À vérifier mètre laser en main avant signature</em>.",
    },
    {
      icon: "🏷️",
      title: "Marques de matériel précisées vs imprécis",
      detail:
        "Artisans A (Grohe, Geberit, Porcelanosa) et C (Villeroy & Boch, Hansgrohe) <strong>nomment les marques</strong> qu'ils installeront — gage de transparence et qualité contrôlable. Artisans B et D <strong>ne mentionnent aucune marque</strong> : gamme et qualité non vérifiables tant que pas demandé explicitement.",
    },
  ];

  // POINTS DE VIGILANCE
  const vigilance = [
    {
      level: "danger",
      icon: "⚠️",
      title: "Clause litigieuse détectée dans le devis C",
      detail:
        "<strong>Renov'Express (devis C)</strong> contient une clause <em>« Pas de droit de rétractation »</em>. <strong>Illégal en France</strong> (loi Hamon 2014). Exige son retrait avant signature, sinon le contrat est nul.",
    },
    {
      level: "warning",
      icon: "💰",
      title: "Acompte de 50% chez B avant démarrage",
      detail:
        "<strong>BTP Solutions (devis B) demande 50% à la signature</strong>. Combiné aux 2 ans d'ancienneté seulement, le risque financier est réel : si le chantier tourne mal, tu perds 5 400 €. Norme du métier = 30%, à négocier.",
    },
    {
      level: "warning",
      icon: "🔍",
      title: "Aucune note Google trouvée pour AB Travaux",
      detail:
        "<strong>Information non disponible pour le devis D</strong> : entreprise non identifiée sur Google. Ce n'est pas forcément un mauvais signal — petite structure récente, communication limitée. <strong>Mais à creuser</strong> : demande 3 références de chantiers récents avec coordonnées.",
    },
  ];

  // Mini-cards par devis pour la section PRIX
  const prixCards = DEVIS.map((d) => `
    <div class="mini-card ${d.is_recommended ? "recommended" : ""}">
      <div class="label">${rankLabel(d.rank)} · ${d.artisan}</div>
      <div class="value">${fmt(d.total_ht)} € <span style="font-size:13px;color:var(--muted-foreground);font-weight:400">HT</span></div>
      <div class="sub ${d.verdict_prix === "Bas" ? "green" : d.verdict_prix === "Élevé" ? "amber" : ""}">
        ${d.verdict_prix === "Correct" ? "Dans le marché" : d.verdict_prix === "Bas" ? "En dessous du marché ⚠️" : "Au-dessus du marché"}
      </div>
      <div style="font-size:11.5px;color:var(--muted-foreground);margin-top:8px;">
        Acompte ${d.acompte_pct}% ${d.acompte_pct > 35 ? "⚠️" : "✓"}
      </div>
    </div>`).join("");

  // Mini-cards par devis pour la section ENTREPRISE
  const entrepriseCards = DEVIS.map((d) => {
    const noteHtml = d.google_note === null
      ? `<div class="value unknown" style="font-size:14px">Info non disponible</div>`
      : `<div class="value">${d.google_note}/5 <span style="font-size:12px;color:var(--muted-foreground);font-weight:400">(${d.google_reviews} avis)</span></div>`;
    return `
    <div class="mini-card ${d.is_recommended ? "recommended" : ""}">
      <div class="label">${d.artisan}</div>
      <div style="font-size:14px;font-weight:600">${d.anciennete_ans} ans d'activité</div>
      ${noteHtml}
      <div class="sub">${d.assurance ? "✓ Assurance RC Pro + Décennale" : "⚠️ Assurance non confirmée"}</div>
      <div class="sub ${d.clauses_litigieuses.length > 0 ? "red" : "green"}">
        ${d.clauses_litigieuses.length > 0 ? `⚠️ ${d.clauses_litigieuses.length} clause litigieuse` : "✓ Contrat propre"}
      </div>
    </div>`;
  }).join("");

  // Table détail postes
  const postesRows = ALL_POSTES.map((poste) => `
    <tr>
      <td>${poste}</td>
      ${DEVIS.map((d) => {
        const v = d.postes[poste];
        if (v === null || v === undefined) {
          return `<td class="${d.is_recommended ? "recommended" : ""} poste-missing">non inclus ⚠️</td>`;
        }
        return `<td class="${d.is_recommended ? "recommended" : ""} poste-included">${fmt(v)} €</td>`;
      }).join("")}
    </tr>`).join("");

  return pageShell("Comparaison — Rénovation SDB",
    headerHtml + `
<main>
  <div class="breadcrumb">
    <a href="#">Tableau de bord</a> › <a href="#">Comparateur</a> › Rénovation salle de bain
  </div>

  <h1>Comparaison de 4 devis — Rénovation salle de bain</h1>
  <p style="color: var(--muted-foreground); margin: 0 0 28px;">
    4 artisans consultés pour le même chantier. Voici notre analyse experte.
  </p>

  <!-- VERDICT HERO -->
  <div class="verdict-hero">
    <span class="badge">Verdict expert</span>
    <h2>Notre choix par défaut : <span class="winner">${recommended.artisan}</span></h2>
    <div class="summary">
      ${fmt(recommended.total_ht)} € HT — pas le moins cher, mais le plus solide après vérification des
      détails que tu ne lis pas dans les totaux.
    </div>

    <div class="findings">
      <h3>3 différences clés que l'œil expert a détecté</h3>
      ${pointsClefs.map((p) => `
        <div class="finding">
          <div class="icon">${p.icon}</div>
          <div class="body"><strong>${p.title}</strong><br/>${p.detail}</div>
        </div>`).join("")}
    </div>

    <div class="levers">
      <div class="lever">
        <div class="title">Si tu priorises la sécurité juridique</div>
        <div class="winner">→ ${DEVIS[0].artisan}</div>
        <div class="body">Aucune clause litigieuse, 8 ans d'ancienneté, marques de matériel précisées (Grohe, Geberit). Contrat propre, prête à signer sans risque.</div>
      </div>
      <div class="lever">
        <div class="title">Si tu veux la maîtrise technique max</div>
        <div class="winner">→ ${DEVIS[2].artisan}</div>
        <div class="body">12 ans d'expérience + matériel premium Villeroy & Boch / Hansgrohe. <strong style="color:var(--score-red)">Mais</strong> demande-lui de retirer la clause "pas de rétractation" avant.</div>
      </div>
      <div class="lever">
        <div class="title">Si tu veux du grain à moudre pour négocier</div>
        <div class="winner">→ Présente le devis B à ${DEVIS[0].artisan}</div>
        <div class="body">Avec le devis de B (10 800 €) en main, demande à ${DEVIS[0].artisan} un geste commercial. Marge typique 3-7% sur ce volume.</div>
      </div>
    </div>
  </div>

  <!-- SECTION PRIX -->
  <div class="section">
    <h3 class="section-title"><span class="dot"></span>Prix</h3>
    <div class="grid-4">${prixCards}</div>
  </div>

  <!-- SECTION ENTREPRISE -->
  <div class="section">
    <h3 class="section-title"><span class="dot"></span>Entreprise</h3>
    <div class="grid-4">${entrepriseCards}</div>
  </div>

  <!-- SECTION POINTS CLEFS -->
  <div class="section">
    <h3 class="section-title"><span class="dot"></span>Points clefs (différences expertes)</h3>
    ${pointsClefs.map((p) => `
      <div class="point-item">
        <div class="icon">${p.icon}</div>
        <div class="content"><strong>${p.title}</strong><br/>${p.detail}</div>
      </div>`).join("")}
  </div>

  <!-- SECTION POINTS DE VIGILANCE -->
  <div class="section">
    <h3 class="section-title"><span class="dot"></span>Points de vigilance</h3>
    ${vigilance.map((v) => `
      <div class="point-item ${v.level}">
        <div class="icon">${v.icon}</div>
        <div class="content"><strong>${v.title}</strong><br/>${v.detail}</div>
      </div>`).join("")}
  </div>

  <!-- ACCORDION DÉTAIL POSTES -->
  <details class="postes-detail">
    <summary>Détail poste par poste (${ALL_POSTES.length} postes) — cliquez pour ouvrir</summary>
    <div class="postes-table-wrap">
      <table class="postes">
        <thead>
          <tr>
            <th></th>
            ${DEVIS.map((d) => `<th class="${d.is_recommended ? "recommended" : ""}">${d.artisan}</th>`).join("")}
          </tr>
        </thead>
        <tbody>${postesRows}</tbody>
      </table>
    </div>
  </details>

  <!-- HONNÊTETÉ DISCLAIMER -->
  <div class="honesty-disclaimer">
    💡 <strong>Note sur la méthode :</strong> nous comparons ce qui est lisible dans les devis fournis.
    Pour les informations manquantes (note Google de AB Travaux par exemple), nous affichons
    explicitement <em>« Information non disponible »</em> plutôt que d'inventer une approximation.
    Le verdict est une aide à la décision, pas un ordre de signature — vérifie toujours les éléments
    en visite physique avant de signer.
  </div>

  <div class="actions">
    <button class="btn btn-secondary">↓ Exporter en PDF</button>
    <button class="btn btn-primary">✉️ Contacter ${recommended.artisan}</button>
  </div>
</main>`);
}

// ─────────────────────────────────────────────────────────────────
// PAGE 2 — Mobile cards
// ─────────────────────────────────────────────────────────────────

function mobilePage(): string {
  const cards = DEVIS.map((d) => {
    const noteHtml = d.google_note === null
      ? `<div><strong class="unknown">N/A</strong> Google</div>`
      : `<div><strong>${d.google_note}/5</strong> Google (${d.google_reviews})</div>`;
    return `
    <div class="devis-card ${d.is_recommended ? "recommended" : ""}">
      <div class="top">
        <div>
          <div style="font-size: 11px; color: var(--muted-foreground);">${rankLabel(d.rank)}</div>
          <div class="artisan">${d.artisan}</div>
        </div>
        ${d.is_recommended ? '<span class="reco-badge">✓ RECO</span>' : ""}
      </div>
      <div class="price">${fmt(d.total_ht)} € <span style="font-size: 12px; color: var(--muted-foreground); font-weight: 400;">HT</span></div>
      <div style="font-size: 12px; font-weight: 600; color: ${d.verdict_prix === "Correct" ? "var(--score-green)" : d.verdict_prix === "Élevé" ? "var(--score-amber)" : "var(--score-red)"};">
        ${d.verdict_prix === "Correct" ? "Dans le marché" : d.verdict_prix === "Bas" ? "Sous le marché ⚠️" : "Au-dessus du marché"}
      </div>
      <div class="meta">
        <div><strong>${d.anciennete_ans} ans</strong> activité</div>
        ${noteHtml}
        <div>Acompte <strong style="color:${d.acompte_pct > 35 ? 'var(--score-red)' : 'inherit'}">${d.acompte_pct}%</strong></div>
        <div>Quantités <strong style="color:${d.quantites_pct < 70 ? 'var(--score-red)' : 'inherit'}">${d.quantites_pct}%</strong></div>
      </div>
      ${d.clauses_litigieuses.length > 0 ? `<div style="background:hsl(0,72%,95%);color:hsl(0,72%,35%);padding:8px 10px;border-radius:6px;font-size:12px;margin-top:10px;">⚠️ Clause litigieuse à faire retirer</div>` : ""}
      <button class="btn ${d.is_recommended ? "btn-primary" : "btn-secondary"}" style="width:100%; padding: 10px; margin-top: 12px;">${d.is_recommended ? "Contacter" : "Voir détail"}</button>
    </div>`;
  }).join("");

  return pageShell("Comparaison mobile — Rénovation SDB",
    `<div style="max-width: 380px; margin: 0 auto;">
${headerHtml}
<main style="padding: 16px;">
  <div class="breadcrumb"><a href="#">← Retour</a></div>
  <h1 style="font-size: 20px;">Rénovation salle de bain</h1>
  <p style="color: var(--muted-foreground); font-size: 13px; margin-bottom: 18px;">4 devis comparés</p>

  <div class="verdict-hero" style="padding: 18px;">
    <span class="badge">Verdict expert</span>
    <h2 style="font-size: 17px; margin-top: 10px;">Choix : <span class="winner">${recommended.artisan}</span></h2>
    <div class="summary" style="font-size: 13px;">
      ${fmt(recommended.total_ht)} € HT — pas le moins cher, mais le plus solide après analyse experte.
    </div>
    <div style="background: var(--muted); border-radius: 10px; padding: 14px; margin-top: 14px; font-size: 13px; line-height: 1.55;">
      <strong>3 différences clés :</strong><br/>
      📦 B oublie 2 postes (~1000€)<br/>
      📐 B chiffre 20% de carrelage en moins<br/>
      🏷️ A et C précisent les marques, B et D non
    </div>
  </div>

  <h2 style="font-size: 15px;">Les 4 devis</h2>
  <div class="card-stack">${cards}</div>
</main>
</div>`);
}

// ─────────────────────────────────────────────────────────────────
// PAGE 3 — Empty state
// ─────────────────────────────────────────────────────────────────

function emptyPage(): string {
  return pageShell("Comparateur de devis — VMD",
    headerHtml + `
<main>
  <div class="breadcrumb"><a href="#">Tableau de bord</a> › Comparateur</div>

  <div class="empty-hero">
    <h1>Comparez 2 à 4 devis. Évitez les pièges cachés.</h1>
    <p>
      Vous avez plusieurs devis pour le même chantier ? Notre expert détecte ce qu'un
      particulier ne voit pas : postes omis, quantités sous-estimées, matériel
      non précisé, clauses abusives. <strong>Vous savez lire un total HT. On vous montre
      le reste.</strong>
    </p>

    <div class="steps">
      <div class="step">
        <div class="num">1</div>
        <h3>Ajoutez 2 à 4 devis</h3>
        <p>Parmi vos analyses existantes ou de nouveaux PDFs. Même chantier, périmètres comparables.</p>
      </div>
      <div class="step">
        <div class="num">2</div>
        <h3>L'expert les passe au crible</h3>
        <p>Alignement poste à poste, détection des omissions stratégiques, lecture du matériel, des quantités et des clauses.</p>
      </div>
      <div class="step">
        <div class="num">3</div>
        <h3>Verdict tranché + 3 leviers</h3>
        <p>"Notre choix par défaut : X parce que…" + scénarios alternatifs selon vos priorités (sécurité, technique, négo).</p>
      </div>
    </div>

    <button class="btn btn-primary" style="font-size: 16px; padding: 14px 32px;">
      🔍 Démarrer une comparaison
    </button>
    <p style="font-size: 12px; color: var(--muted-foreground); margin-top: 14px;">
      1 comparaison gratuite. Pass Sérénité (4,99 €/mois) = comparaisons illimitées + rapport PDF.
    </p>
  </div>
</main>`);
}

// ─────────────────────────────────────────────────────────────────
// INDEX
// ─────────────────────────────────────────────────────────────────

const indexHtml = pageShell("Maquettes Comparateur v2 — Index", `
<main style="max-width: 720px;">
  <h1>Maquettes Comparateur de devis — v2 (revue Julien)</h1>
  <p style="color: var(--muted-foreground);">
    Refonte après retour Julien : structure 4 sections, verdict valeur ajoutée
    (pas "moins cher" trivial), design system VMD, posture honnêteté.
  </p>

  <div style="display: grid; gap: 12px; margin-top: 28px;">
    <a href="./comparator-empty-state.html" style="background:var(--card);padding:18px;border-radius:12px;text-decoration:none;color:var(--foreground);border:1px solid var(--border);">
      <h3 style="margin:0 0 4px;font-size:15px;">1. Landing / empty state</h3>
      <p style="margin:0;color:var(--muted-foreground);font-size:13px;">Première impression /comparateur — promesse claire sur la valeur ajoutée.</p>
    </a>
    <a href="./comparator-result-desktop.html" style="background:var(--card);padding:18px;border-radius:12px;text-decoration:none;color:var(--foreground);border:1px solid var(--border);">
      <h3 style="margin:0 0 4px;font-size:15px;">2. Vue résultat — desktop</h3>
      <p style="margin:0;color:var(--muted-foreground);font-size:13px;">Verdict expert + 4 sections (Prix / Entreprise / Points clefs / Vigilance) + détail accordion.</p>
    </a>
    <a href="./comparator-result-mobile.html" style="background:var(--card);padding:18px;border-radius:12px;text-decoration:none;color:var(--foreground);border:1px solid var(--border);">
      <h3 style="margin:0 0 4px;font-size:15px;">3. Vue résultat — mobile</h3>
      <p style="margin:0;color:var(--muted-foreground);font-size:13px;">Verdict condensé + 3 différences clés + 4 cards artisan empilées.</p>
    </a>
  </div>

  <h2 style="margin-top: 32px; font-size: 16px;">Changements v1 → v2</h2>
  <ul style="color: var(--muted-foreground); font-size: 14px; line-height: 1.8;">
    <li>❌ Mega-tableau dense → ✅ 4 sections thématiques + détail accordion</li>
    <li>❌ "Si vous voulez le moins cher" (trivial) → ✅ "Si vous priorisez la sécurité juridique", "la maîtrise technique", "le levier de négo"</li>
    <li>✅ <strong>POINTS CLEFS</strong> — les vraies différences expertes : postes omis, quantités sous-estimées, marques de matériel précisées ou non</li>
    <li>✅ <strong>POINTS DE VIGILANCE</strong> — clauses litigieuses, acompte excessif, info non disponible</li>
    <li>✅ Posture honnêteté : "Information non disponible" pour la note Google de D au lieu d'une approximation</li>
    <li>✅ Couleurs alignées sur les CSS variables VMD (--primary, --background, --border)</li>
  </ul>
</main>`);

writeFileSync(join(OUT, "comparator-empty-state.html"), emptyPage(), "utf-8");
writeFileSync(join(OUT, "comparator-result-desktop.html"), desktopPage(), "utf-8");
writeFileSync(join(OUT, "comparator-result-mobile.html"), mobilePage(), "utf-8");
writeFileSync(join(OUT, "index.html"), indexHtml, "utf-8");

console.log("🟢 4 maquettes HTML v2 générées (aligné design VMD + structure 4 sections + verdict valeur ajoutée + honnêteté)\n");
console.log(`📁 Dossier : ${OUT}\n`);
console.log("👉 Ouvre dans ton navigateur :");
console.log(`   ${join(OUT, "index.html")}`);
