#!/usr/bin/env tsx
/**
 * scripts/preview-comparator-mockup.ts
 *
 * Génère 3 maquettes HTML statiques de la future feature Comparateur de devis :
 *   1. comparator-result-desktop.html  — vue tableau N colonnes (desktop)
 *   2. comparator-result-mobile.html   — vue cards swipeables (mobile)
 *   3. comparator-empty-state.html     — landing avec bouton "Démarrer"
 *
 * Données fictives : 4 devis Rénovation salle de bain.
 * Pas de logique, juste du HTML statique pour valider l'UI avant code.
 *
 * USAGE :
 *   npx tsx scripts/preview-comparator-mockup.ts
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
  google_note: number;
  google_reviews: number;
  assurance: boolean;
  clauses_litigieuses: number;
  quantites_pct: number;
  postes: Record<string, number | null>; // null = poste non inclus
  verdict_prix: "Bas" | "Correct" | "Élevé";
  rank: 1 | 2 | 3 | 4;
  is_recommended: boolean;
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
    clauses_litigieuses: 0,
    quantites_pct: 100,
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
    verdict_prix: "Correct",
    rank: 1,
    is_recommended: true,
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
    clauses_litigieuses: 0,
    quantites_pct: 60,
    postes: {
      "Dépose existant": null,
      "Plomberie SDB": 4500,
      "Carrelage sol+murs": 3200,
      "Électricité": 1100,
      "Pose meuble vasque": 700,
      "Pose receveur + paroi": 900,
      "Nettoyage fin chantier": null,
      "Évacuation gravats": 400,
    },
    verdict_prix: "Bas",
    rank: 3,
    is_recommended: false,
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
    clauses_litigieuses: 1,
    quantites_pct: 100,
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
    verdict_prix: "Élevé",
    rank: 2,
    is_recommended: false,
  },
  {
    id: "D",
    name: "Devis 4",
    artisan: "AB Travaux",
    total_ht: 11600,
    total_ttc: 12760,
    acompte_pct: 30,
    anciennete_ans: 5,
    google_note: 4.6,
    google_reviews: 23,
    assurance: true,
    clauses_litigieuses: 0,
    quantites_pct: 90,
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
    verdict_prix: "Correct",
    rank: 4,
    is_recommended: false,
  },
];

const ALL_POSTES = Array.from(
  new Set(DEVIS.flatMap((d) => Object.keys(d.postes))),
);

function fmt(n: number): string {
  return n.toLocaleString("fr-FR");
}

function colorVerdictPrix(v: string): string {
  if (v === "Bas") return "#10B981";
  if (v === "Correct") return "#0E1730";
  if (v === "Élevé") return "#F59E0B";
  return "#6B7280";
}

// ─────────────────────────────────────────────────────────────────
// SHARED HEADER / LAYOUT
// ─────────────────────────────────────────────────────────────────

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title} — Maquette Comparateur VMD</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    background: #F3F4F6;
    color: #0E1730;
    line-height: 1.5;
  }
  header.vmd-header {
    background: #fff;
    border-bottom: 1px solid #E5E7EB;
    padding: 12px 24px;
    display: flex; align-items: center; gap: 16px;
  }
  header .logo {
    font-weight: 700; font-size: 16px; color: #2563EB;
  }
  header nav { margin-left: auto; display: flex; gap: 18px; font-size: 14px; color: #6B7280; }
  header nav a { color: #6B7280; text-decoration: none; }
  header nav a:hover { color: #0E1730; }
  main { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
  h1 { font-size: 24px; margin: 0 0 8px; }
  h2 { font-size: 18px; margin: 24px 0 12px; color: #374151; }
  .breadcrumb { color: #6B7280; font-size: 13px; margin-bottom: 16px; }
  .breadcrumb a { color: #2563EB; text-decoration: none; }
  .info-banner {
    background: #EFF4FF; color: #1B3FA1; padding: 12px 16px; border-radius: 8px;
    font-size: 13px; margin-bottom: 20px; border-left: 3px solid #2563EB;
  }
  .verdict-hero {
    background: linear-gradient(135deg, #ECFDF5 0%, #F0FDF4 100%);
    border: 2px solid #10B981; border-radius: 16px;
    padding: 24px; margin-bottom: 28px;
  }
  .verdict-hero .badge {
    display: inline-block; background: #10B981; color: #fff;
    padding: 3px 10px; border-radius: 999px; font-size: 11px;
    font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  }
  .verdict-hero h2 { margin: 12px 0 4px; font-size: 22px; color: #065F46; }
  .verdict-hero .summary { font-size: 15px; color: #374151; margin: 8px 0 16px; }
  .verdict-hero ul { margin: 8px 0 0; padding-left: 18px; font-size: 14px; color: #374151; }
  .verdict-hero ul li { margin: 4px 0; }
  .levers {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 18px;
  }
  .lever {
    background: #fff; border: 1px solid #E5E7EB; border-radius: 10px;
    padding: 14px;
  }
  .lever .icon { font-size: 20px; margin-bottom: 6px; }
  .lever .title { font-weight: 600; font-size: 13px; color: #374151; margin-bottom: 4px; }
  .lever .body { font-size: 12px; color: #6B7280; line-height: 1.5; }
  .lever .warn { color: #92400E; font-weight: 600; }
  table.comparator {
    width: 100%; border-collapse: collapse;
    background: #fff; border-radius: 12px; overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  table.comparator th, table.comparator td {
    border-bottom: 1px solid #F3F4F6;
    padding: 12px 14px; font-size: 14px; text-align: center;
  }
  table.comparator th:first-child, table.comparator td:first-child {
    text-align: left; color: #6B7280; font-weight: 500;
    background: #FAFAFA; width: 200px;
  }
  table.comparator thead th { background: #F9FAFB; font-weight: 700; font-size: 13px; color: #374151; }
  table.comparator thead th .artisan-name { font-size: 14px; color: #0E1730; }
  table.comparator thead th .rank { font-size: 11px; font-weight: 500; color: #9CA3AF; margin-bottom: 2px; }
  table.comparator thead th.recommended {
    background: #ECFDF5; position: relative;
  }
  table.comparator thead th.recommended .artisan-name { color: #065F46; }
  table.comparator thead th.recommended::after {
    content: "✓ Recommandé"; position: absolute; bottom: -1px; left: 50%;
    transform: translateX(-50%); background: #10B981; color: #fff;
    font-size: 10px; padding: 2px 8px; border-radius: 0 0 6px 6px;
    font-weight: 700;
  }
  td.recommended { background: #F0FDF4; font-weight: 600; }
  td.warn { color: #92400E; }
  td.danger { color: #991B1B; font-weight: 600; }
  td.good { color: #065F46; font-weight: 600; }
  .section-header td {
    background: #F9FAFB; font-size: 12px; text-transform: uppercase;
    letter-spacing: 0.06em; color: #6B7280; font-weight: 700; text-align: left !important;
  }
  .empty-cell { color: #D1D5DB; font-style: italic; }
  .footer-action {
    display: flex; justify-content: center; gap: 12px; margin-top: 24px;
  }
  .btn {
    display: inline-block; padding: 12px 24px; border-radius: 10px;
    font-weight: 600; font-size: 14px; text-decoration: none; cursor: pointer; border: none;
  }
  .btn-primary { background: #2563EB; color: #fff; }
  .btn-secondary { background: #fff; color: #374151; border: 1px solid #D1D5DB; }

  /* Mobile */
  .card-stack { display: flex; flex-direction: column; gap: 14px; }
  .devis-card {
    background: #fff; border-radius: 14px; padding: 18px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    border: 1px solid #E5E7EB;
  }
  .devis-card.recommended { border: 2px solid #10B981; background: #F0FDF4; }
  .devis-card .top {
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;
  }
  .devis-card .artisan { font-weight: 700; font-size: 16px; }
  .devis-card .reco-badge { background: #10B981; color: #fff; font-size: 10px;
    padding: 3px 8px; border-radius: 999px; font-weight: 700; }
  .devis-card .price { font-size: 22px; font-weight: 700; color: #0E1730; margin: 8px 0; }
  .devis-card .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; color: #6B7280; margin: 12px 0; }
  .devis-card .meta strong { color: #0E1730; font-weight: 600; }
  .devis-card .warn { color: #92400E; }

  /* Empty state */
  .empty-hero {
    background: #fff; border-radius: 16px; padding: 48px 32px; text-align: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .empty-hero h1 { font-size: 28px; margin: 0 0 12px; }
  .empty-hero p { color: #6B7280; max-width: 560px; margin: 0 auto 28px; line-height: 1.65; }
  .empty-hero .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin: 32px 0; }
  .empty-hero .step { text-align: left; padding: 18px; background: #F9FAFB; border-radius: 12px; }
  .empty-hero .step .num { width: 28px; height: 28px; background: #2563EB; color: #fff;
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 13px; margin-bottom: 10px; }
  .empty-hero .step h3 { font-size: 15px; margin: 0 0 6px; }
  .empty-hero .step p { font-size: 13px; color: #6B7280; margin: 0; max-width: none; }

  /* Mockup label */
  .mockup-label {
    position: fixed; top: 8px; right: 8px;
    background: #2563EB; color: #fff; font-size: 11px;
    padding: 4px 10px; border-radius: 6px; font-weight: 600; z-index: 100;
  }
</style>
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
    <a href="#" style="color: #2563EB; font-weight: 600;">Comparateur</a>
    <a href="#">Mon compte</a>
  </nav>
</header>`;

// ─────────────────────────────────────────────────────────────────
// PAGE 1 — Desktop tableau
// ─────────────────────────────────────────────────────────────────

const recommended = DEVIS.find((d) => d.is_recommended)!;

function desktopPage(): string {
  const cols = DEVIS.map((d) => `
    <th class="${d.is_recommended ? "recommended" : ""}">
      <div class="rank">${d.rank === 1 ? "🥇 1er choix" : d.rank === 2 ? "🥈 2e" : d.rank === 3 ? "🥉 3e" : "4e"}</div>
      <div class="artisan-name">${d.artisan}</div>
      <div style="font-size: 11px; color: #9CA3AF; margin-top: 2px;">${d.name}</div>
    </th>`).join("");

  const row = (label: string, valueFn: (d: Devis) => string, classFn?: (d: Devis) => string): string => `
    <tr>
      <td>${label}</td>
      ${DEVIS.map((d) => `<td class="${d.is_recommended ? "recommended" : ""} ${classFn?.(d) ?? ""}">${valueFn(d)}</td>`).join("")}
    </tr>`;

  const sectionHeader = (label: string): string => `
    <tr class="section-header">
      <td colspan="${DEVIS.length + 1}">${label}</td>
    </tr>`;

  const postesRows = ALL_POSTES.map((poste) => `
    <tr>
      <td>${poste}</td>
      ${DEVIS.map((d) => {
        const v = d.postes[poste];
        if (v === null || v === undefined) {
          return `<td class="${d.is_recommended ? "recommended" : ""} empty-cell">non inclus ⚠️</td>`;
        }
        return `<td class="${d.is_recommended ? "recommended" : ""}">${fmt(v)} €</td>`;
      }).join("")}
    </tr>`).join("");

  return pageShell("Comparaison — Rénovation SDB",
    headerHtml + `
<main>
  <div class="breadcrumb">
    <a href="#">Tableau de bord</a> › <a href="#">Comparateur</a> › Rénovation salle de bain
  </div>

  <h1>Comparaison de 4 devis — Rénovation salle de bain</h1>
  <div class="info-banner">
    📊 Comparaison basée sur 4 devis pour les mêmes travaux. Les chiffres sont normalisés pour vous permettre de comparer à périmètre équivalent.
  </div>

  <div class="verdict-hero">
    <span class="badge">Verdict expert</span>
    <h2>Notre choix par défaut : ${recommended.artisan}</h2>
    <p class="summary">
      Équilibre optimal entre prix, fiabilité et transparence du devis.
      Total <strong>${fmt(recommended.total_ht)} € HT</strong> — dans le marché pour ce type de chantier.
    </p>
    <p style="margin: 14px 0 6px; font-weight: 600; color: #065F46;">Pourquoi ${recommended.artisan} ?</p>
    <ul>
      <li><strong>${recommended.anciennete_ans} ans d'ancienneté</strong> + <strong>${recommended.google_note}/5 sur Google</strong> (${recommended.google_reviews} avis) → fiabilité confirmée</li>
      <li><strong>Quantités 100% précisées</strong> → vous saurez exactement ce qui est facturé</li>
      <li><strong>Acompte ${recommended.acompte_pct}%</strong> → conforme aux usages, pas de risque financier</li>
      <li><strong>Aucune clause litigieuse</strong> → contrat sécurisé</li>
    </ul>

    <div class="levers">
      <div class="lever">
        <div class="icon">💰</div>
        <div class="title">Si vous voulez le moins cher</div>
        <div class="body">
          <strong>Artisan B</strong> — 10 800 € HT.<br/>
          <span class="warn">⚠️ Mais 2 ans d'ancienneté seulement + acompte 50% à la signature. Économie 1 650 € qui peut se transformer en problème.</span>
        </div>
      </div>
      <div class="lever">
        <div class="icon">🏛️</div>
        <div class="title">Si vous voulez l'expertise max</div>
        <div class="body">
          <strong>Artisan C</strong> — 13 200 € HT (12 ans d'expérience).<br/>
          <span class="warn">⚠️ Clause "pas de rétractation" dans son devis : demandez-la-lui de la retirer avant signature (illégale).</span>
        </div>
      </div>
      <div class="lever">
        <div class="icon">🤝</div>
        <div class="title">Si vous voulez négocier</div>
        <div class="body">
          Présentez à <strong>${recommended.artisan}</strong> le devis B (1 650 € moins cher) pour obtenir un geste commercial. Marge typique 3-7%.
        </div>
      </div>
    </div>
  </div>

  <h2>Comparatif détaillé</h2>
  <table class="comparator">
    <thead>
      <tr>
        <th></th>
        ${cols}
      </tr>
    </thead>
    <tbody>
      ${sectionHeader("Prix")}
      ${row("Total HT", (d) => `<strong>${fmt(d.total_ht)} €</strong>`)}
      ${row("Total TTC", (d) => `${fmt(d.total_ttc)} €`)}
      ${row("Verdict prix marché", (d) => `<span style="color:${colorVerdictPrix(d.verdict_prix)};font-weight:600">${d.verdict_prix}</span>`)}
      ${row("Acompte demandé", (d) => `${d.acompte_pct}%`, (d) => d.acompte_pct > 35 ? "warn" : "")}

      ${sectionHeader("Entreprise")}
      ${row("Ancienneté", (d) => `${d.anciennete_ans} ans`, (d) => d.anciennete_ans < 3 ? "warn" : d.anciennete_ans >= 8 ? "good" : "")}
      ${row("Avis Google", (d) => `${d.google_note}/5 (${d.google_reviews})`, (d) => d.google_note < 4 ? "warn" : d.google_note >= 4.5 ? "good" : "")}
      ${row("Assurance RC Pro + Décennale", (d) => d.assurance ? "✓" : "✗", (d) => d.assurance ? "good" : "danger")}
      ${row("Clauses litigieuses", (d) => d.clauses_litigieuses > 0 ? `${d.clauses_litigieuses} ⚠️` : "Aucune", (d) => d.clauses_litigieuses > 0 ? "danger" : "good")}

      ${sectionHeader("Transparence du devis")}
      ${row("% de lignes avec unités précises", (d) => `${d.quantites_pct}%`, (d) => d.quantites_pct < 70 ? "warn" : d.quantites_pct >= 95 ? "good" : "")}

      ${sectionHeader("Détail des postes (comparaison ligne à ligne)")}
      ${postesRows}
    </tbody>
  </table>

  <div class="footer-action">
    <button class="btn btn-secondary">↓ Exporter en PDF</button>
    <button class="btn btn-primary">✉️ Contacter ${recommended.artisan}</button>
  </div>

  <p style="text-align: center; color: #9CA3AF; font-size: 12px; margin-top: 24px;">
    Cette recommandation est basée sur l'analyse des devis fournis. Elle constitue une aide à la décision, pas un ordre de signature.
    Vérifiez toujours les éléments en visite physique avant signature.
  </p>
</main>`);
}

// ─────────────────────────────────────────────────────────────────
// PAGE 2 — Mobile cards
// ─────────────────────────────────────────────────────────────────

function mobilePage(): string {
  const cards = DEVIS.map((d) => `
    <div class="devis-card ${d.is_recommended ? "recommended" : ""}">
      <div class="top">
        <div>
          <div style="font-size: 11px; color: #9CA3AF;">${d.rank === 1 ? "🥇 1er choix" : d.rank === 2 ? "🥈 2e" : d.rank === 3 ? "🥉 3e" : "4e"}</div>
          <div class="artisan">${d.artisan}</div>
        </div>
        ${d.is_recommended ? '<span class="reco-badge">✓ RECO</span>' : ""}
      </div>
      <div class="price">${fmt(d.total_ht)} € <span style="font-size: 13px; color: #6B7280; font-weight: 400;">HT</span></div>
      <div style="color: ${colorVerdictPrix(d.verdict_prix)}; font-size: 12px; font-weight: 600;">${d.verdict_prix} dans le marché</div>
      <div class="meta">
        <div><strong>${d.anciennete_ans} ans</strong> d'ancienneté</div>
        <div><strong>${d.google_note}/5</strong> Google (${d.google_reviews})</div>
        <div>Acompte <strong class="${d.acompte_pct > 35 ? "warn" : ""}">${d.acompte_pct}%</strong></div>
        <div>Quantités <strong class="${d.quantites_pct < 70 ? "warn" : ""}">${d.quantites_pct}%</strong></div>
      </div>
      ${d.clauses_litigieuses > 0 ? `<div style="background: #FEF2F2; color: #991B1B; padding: 8px 10px; border-radius: 6px; font-size: 12px; margin-top: 10px;">⚠️ ${d.clauses_litigieuses} clause litigieuse à faire retirer avant signature</div>` : ""}
      <div style="margin-top: 14px; display: flex; gap: 8px;">
        <button class="btn btn-secondary" style="flex:1; padding: 10px;">Détail</button>
        <button class="btn ${d.is_recommended ? "btn-primary" : "btn-secondary"}" style="flex:1; padding: 10px;">${d.is_recommended ? "Contacter" : "Voir devis"}</button>
      </div>
    </div>
  `).join("");

  return pageShell("Comparaison mobile — Rénovation SDB",
    `<div style="max-width: 380px; margin: 0 auto;">
${headerHtml}
<main style="padding: 16px;">
  <div class="breadcrumb"><a href="#">← Retour</a></div>
  <h1 style="font-size: 20px;">Rénovation salle de bain</h1>
  <p style="color: #6B7280; font-size: 13px; margin-bottom: 18px;">4 devis comparés</p>

  <div class="verdict-hero" style="padding: 16px;">
    <span class="badge">Verdict expert</span>
    <h2 style="font-size: 17px;">Choix par défaut : ${recommended.artisan}</h2>
    <p class="summary" style="font-size: 13px;">
      ${fmt(recommended.total_ht)} € HT — équilibre prix / fiabilité / transparence.
    </p>
  </div>

  <h2 style="font-size: 15px;">Les 4 devis ↓</h2>
  <div class="card-stack">
    ${cards}
  </div>
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
  <div class="breadcrumb">
    <a href="#">Tableau de bord</a> › Comparateur
  </div>

  <div class="empty-hero">
    <h1>Comparez jusqu'à 4 devis. Choisissez le bon.</h1>
    <p>
      Vous avez plusieurs devis pour les mêmes travaux ? Notre expert les analyse côte à côte,
      pointe les différences, et vous dit lequel privilégier — en fonction de vos priorités
      (prix, fiabilité, expertise).
    </p>

    <div class="steps">
      <div class="step">
        <div class="num">1</div>
        <h3>Ajoutez 2 à 4 devis</h3>
        <p>Sélectionnez parmi vos analyses existantes ou uploadez de nouveaux devis. Chaque devis est analysé individuellement.</p>
      </div>
      <div class="step">
        <div class="num">2</div>
        <h3>L'expert les compare</h3>
        <p>Notre IA aligne les devis poste à poste, identifie les différences cachées, et croise avec la fiabilité de chaque entreprise.</p>
      </div>
      <div class="step">
        <div class="num">3</div>
        <h3>Verdict tranché</h3>
        <p>"Notre choix par défaut : artisan X parce que..." + 3 scénarios alternatifs si vos priorités changent.</p>
      </div>
    </div>

    <button class="btn btn-primary" style="font-size: 16px; padding: 14px 32px;">
      🔍 Démarrer une comparaison
    </button>
    <p style="font-size: 12px; color: #9CA3AF; margin-top: 14px;">
      1 comparaison gratuite par mois. Pass Sérénité (4,99 € / mois) = comparaisons illimitées + rapport PDF.
    </p>
  </div>
</main>`);
}

// ─────────────────────────────────────────────────────────────────
// INDEX
// ─────────────────────────────────────────────────────────────────

const indexHtml = pageShell("Maquettes Comparateur — Index",
`<main style="max-width: 720px;">
  <h1>Maquettes Comparateur de devis</h1>
  <p style="color: #6B7280;">3 écrans à parcourir avant de lancer le code. Clique sur chacun pour voir le rendu.</p>

  <div style="display: grid; gap: 16px; margin-top: 28px;">
    <a href="./comparator-empty-state.html" style="background:#fff;padding:20px;border-radius:12px;text-decoration:none;color:#0E1730;border:1px solid #E5E7EB;">
      <h3 style="margin:0 0 6px;">1. Landing / empty state</h3>
      <p style="margin:0;color:#6B7280;font-size:13px;">Première impression quand l'utilisateur arrive sur /comparateur sans comparaison active.</p>
    </a>
    <a href="./comparator-result-desktop.html" style="background:#fff;padding:20px;border-radius:12px;text-decoration:none;color:#0E1730;border:1px solid #E5E7EB;">
      <h3 style="margin:0 0 6px;">2. Vue résultat — desktop (tableau)</h3>
      <p style="margin:0;color:#6B7280;font-size:13px;">Tableau N colonnes avec verdict expert + 3 leviers + comparaison poste à poste.</p>
    </a>
    <a href="./comparator-result-mobile.html" style="background:#fff;padding:20px;border-radius:12px;text-decoration:none;color:#0E1730;border:1px solid #E5E7EB;">
      <h3 style="margin:0 0 6px;">3. Vue résultat — mobile (cards)</h3>
      <p style="margin:0;color:#6B7280;font-size:13px;">Cards empilées avec verdict en haut + 4 cards artisan.</p>
    </a>
  </div>

  <h2 style="margin-top: 36px;">Points à valider en regardant les maquettes</h2>
  <ul style="color: #4B5563; font-size: 14px; line-height: 1.8;">
    <li>Le verdict expert "Notre choix par défaut" est-il assez visible / tranché ?</li>
    <li>Les 3 leviers conditionnels sont-ils compréhensibles ?</li>
    <li>Le tableau desktop reste-t-il lisible avec 4 colonnes + 12+ lignes ?</li>
    <li>Sur mobile, les cards donnent-elles assez d'info pour décider sans tableau ?</li>
    <li>Le wording des warnings (acompte 50%, clause abusive, "non inclus") est-il clair sans être anxiogène ?</li>
    <li>La mention "1 comparaison gratuite / mois" est-elle bien placée ?</li>
  </ul>
</main>`);

writeFileSync(join(OUT, "comparator-empty-state.html"), emptyPage(), "utf-8");
writeFileSync(join(OUT, "comparator-result-desktop.html"), desktopPage(), "utf-8");
writeFileSync(join(OUT, "comparator-result-mobile.html"), mobilePage(), "utf-8");
writeFileSync(join(OUT, "index.html"), indexHtml, "utf-8");

console.log("🟢 4 maquettes HTML générées\n");
console.log(`📁 Dossier : ${OUT}\n`);
console.log("👉 Ouvre ce fichier dans ton navigateur pour parcourir :");
console.log(`   ${join(OUT, "index.html")}`);
