#!/usr/bin/env tsx
/**
 * scripts/phase1-apply-julien-arbitrages.ts
 *
 * Applique les 6 arbitrages Julien sur les cas ? du CSV.
 * Réponses Julien (2026-06-23) : 1A, 2B, 3B, 4A, 5B, 6B
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CSV_PATH = join(ROOT, "docs", "refonte", "catalogue-classement", "audit-911-classified.csv");

const ARBITRAGES: { id: number; metier_final: string; note: string }[] = [
  // 1A — Peinture radiateur → peinture_revetements
  { id: 145, metier_final: "peinture_revetements", note: "Julien 1A : metier=peinture_revetements (le label commence par 'Peinture', métier peintre)" },
  // 2B — Pose meuble double vasque → plomberie_sanitaires
  { id: 567, metier_final: "plomberie_sanitaires", note: "Julien 2B : metier=plomberie_sanitaires (vasque = SDB principalement)" },
  // 3B — Création alimentation extérieure → electricite
  { id: 4, metier_final: "electricite", note: "Julien 3B : metier=electricite (alim extérieure = élec dans ce catalogue, prise/éclairage jardin)" },
  // 4A — Blindage porte → menuiserie_vitrages (statu quo)
  { id: 11, metier_final: "menuiserie_vitrages", note: "Julien 4A : metier=menuiserie_vitrages (la porte prime sur le matériau blindage)" },
  // 5B — Panneau solaire thermique → energie_environnement
  { id: 821, metier_final: "energie_environnement", note: "Julien 5B : metier=energie_environnement (thermique ≠ photovoltaïque, catégorie énergies renouvelables)" },
  // 6B — Terrasse carrelage extérieur → carrelage_faience
  { id: 672, metier_final: "carrelage_faience", note: "Julien 6B : metier=carrelage_faience (matériau prime, couvert par YAML carrelage sol_exterieur)" },
];

function parseCsv(content: string): { header: string[]; rows: string[][] } {
  const lines: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (field !== "" || cur.length > 0) {
          cur.push(field);
          lines.push(cur);
          cur = [];
          field = "";
        }
        if (c === "\r" && content[i + 1] === "\n") i++;
      } else field += c;
    }
  }
  if (field !== "" || cur.length > 0) { cur.push(field); lines.push(cur); }
  return { header: lines[0] ?? [], rows: lines.slice(1) };
}

function csvEscape(v: string): string {
  if (/[,;"\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

const content = readFileSync(CSV_PATH, "utf-8");
const { header, rows } = parseCsv(content);
const idIdx = header.findIndex((h) => h === "id");
const commentaireIdx = header.findIndex((h) => h === "commentaire_julien");

const arbitrageMap = new Map<number, string>();
for (const a of ARBITRAGES) arbitrageMap.set(a.id, a.note);

let applied = 0;
for (const row of rows) {
  const id = parseInt(row[idIdx] ?? "", 10);
  const note = arbitrageMap.get(id);
  if (!note) continue;
  row[commentaireIdx] = note;
  applied++;
}

const newCsv = [header.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
writeFileSync(CSV_PATH, newCsv, "utf-8");

console.log(`✓ ${applied} arbitrages Julien appliqués sur les cas ?`);
for (const a of ARBITRAGES) console.log(`  id ${a.id} → ${a.metier_final}`);
