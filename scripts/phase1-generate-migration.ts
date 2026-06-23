#!/usr/bin/env tsx
/**
 * scripts/phase1-generate-migration.ts
 *
 * 🟢 Phase 1.5 — Génère la migration SQL d'ajout des colonnes structurelles
 *
 * Lit docs/refonte/catalogue-classement/audit-911-classified.csv (avec les
 * 18 corrections Claude + 6 arbitrages Julien dans commentaire_julien) et
 * produit :
 *
 *   docs/refonte/catalogue-classement/phase1-migration-colonnes.sql
 *
 * Le SQL :
 *   1. ALTER TABLE market_prices ADD COLUMN metier, nature_prix,
 *      multiplicateur_couches_applicable, gamme
 *   2. CHECK constraint sur nature_prix (enum)
 *   3. UPDATE en bloc pour les 891 entrées
 *   4. Indexes sur metier + nature_prix
 *   5. Transaction BEGIN/COMMIT + vérifications DO $$
 *
 * USAGE :
 *   npx tsx scripts/phase1-generate-migration.ts
 *
 * Julien colle ensuite le SQL dans Supabase Studio.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CSV_PATH = join(ROOT, "docs", "refonte", "catalogue-classement", "audit-911-classified.csv");
const SQL_PATH = join(ROOT, "docs", "refonte", "catalogue-classement", "phase1-migration-colonnes.sql");

// ──────────────────────────────────────────────────────────────────────────────
// Parser CSV
// ──────────────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────────────
// Extraction du metier final depuis le commentaire_julien (sinon metier_propose)
// ──────────────────────────────────────────────────────────────────────────────

function extractFinalMetier(metierPropose: string, commentaire: string): string {
  // Si le commentaire commence par "?" → c'est resté un cas non tranché, fallback metier_propose
  if (commentaire.trim().startsWith("?")) return metierPropose;
  // Cherche "metier=XXX" dans le commentaire
  const m = commentaire.match(/metier\s*=\s*([a-z_]+)/i);
  if (m) return m[1].toLowerCase();
  return metierPropose;
}

// ──────────────────────────────────────────────────────────────────────────────
// SQL escape
// ──────────────────────────────────────────────────────────────────────────────

function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function sqlBool(s: string): string {
  if (s === "true" || s === "TRUE" || s === "1") return "TRUE";
  return "FALSE";
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

console.log("🟢 Phase 1.5 — Génération de la migration SQL\n");

const content = readFileSync(CSV_PATH, "utf-8");
const { header, rows } = parseCsv(content);

const idIdx = header.indexOf("id");
const metierProposeIdx = header.indexOf("metier_propose");
const naturePrixIdx = header.indexOf("nature_prix_proposee");
const multiCouchesIdx = header.indexOf("multiplicateur_couches_applicable");
const gammeIdx = header.indexOf("gamme_proposee");
const commentaireIdx = header.indexOf("commentaire_julien");

if ([idIdx, metierProposeIdx, naturePrixIdx, multiCouchesIdx, gammeIdx, commentaireIdx].some((i) => i === -1)) {
  console.error("❌ Colonnes manquantes dans le CSV");
  console.error("Trouvé :", header);
  process.exit(1);
}

interface Entry {
  id: number;
  metier: string;
  nature_prix: string;
  multi_couches: string;
  gamme: string;
  override: boolean; // true si vient d'un commentaire_julien
}

const entries: Entry[] = [];
const metierStats = new Map<string, number>();
const naturePrixStats = new Map<string, number>();
let overrideCount = 0;

for (const row of rows) {
  const id = parseInt(row[idIdx] ?? "", 10);
  if (!Number.isFinite(id)) continue;
  const metierPropose = (row[metierProposeIdx] ?? "").trim();
  const naturePrix = (row[naturePrixIdx] ?? "").trim();
  const multi = (row[multiCouchesIdx] ?? "").trim();
  const gamme = (row[gammeIdx] ?? "").trim();
  const commentaire = (row[commentaireIdx] ?? "").trim();

  const metierFinal = extractFinalMetier(metierPropose, commentaire);
  const override = metierFinal !== metierPropose;
  if (override) overrideCount++;

  entries.push({
    id,
    metier: metierFinal,
    nature_prix: naturePrix === "" || naturePrix === "inconnu" ? "non_applicable" : naturePrix,
    multi_couches: multi,
    gamme,
    override,
  });

  metierStats.set(metierFinal, (metierStats.get(metierFinal) ?? 0) + 1);
  naturePrixStats.set(naturePrix, (naturePrixStats.get(naturePrix) ?? 0) + 1);
}

console.log(`✓ ${entries.length} entrées préparées`);
console.log(`  ${overrideCount} overrides (corrections Claude + arbitrages Julien)\n`);

// Génère SQL
const updateStatements = entries
  .map(
    (e) =>
      `UPDATE public.market_prices SET metier = ${sqlString(e.metier)}, nature_prix = ${sqlString(e.nature_prix)}, multiplicateur_couches_applicable = ${sqlBool(e.multi_couches)}, gamme = ${sqlString(e.gamme === "—" ? "" : e.gamme)} WHERE id = ${e.id};`,
  )
  .join("\n");

const metierStatsSorted = [...metierStats.entries()].sort((a, b) => b[1] - a[1]);
const metierEnumValues = [...new Set(metierStatsSorted.map((s) => s[0]))]
  .map((m) => `'${m}'`)
  .join(", ");

const naturePrixStatsSorted = [...naturePrixStats.entries()].sort((a, b) => b[1] - a[1]);

const sql = `-- ═════════════════════════════════════════════════════════════════════════════
-- Phase 1.5 — Migration : ajout des colonnes structurelles au catalogue
-- ═════════════════════════════════════════════════════════════════════════════
-- Date           : 2026-06-23
-- Source         : docs/refonte/catalogue-classement/audit-911-classified.csv
-- Génération     : scripts/phase1-generate-migration.ts
-- Décisions      : Claude (18 corrections) + Julien (6 arbitrages) + 128 validations bloc
--
-- ⚠️ À LANCER DANS SUPABASE STUDIO → SQL EDITOR
-- Effet : 891 entrées market_prices enrichies de 4 colonnes structurelles
--
-- Le script tourne dans une transaction BEGIN/COMMIT. Si UNE seule instruction
-- échoue, ROLLBACK automatique → catalogue intact.
-- ═════════════════════════════════════════════════════════════════════════════

-- Photo initiale attendue : 891 entrées sans metier/nature_prix/gamme
-- SELECT COUNT(*) FROM public.market_prices; -- → 891

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ALTER TABLE — ajouter les 4 nouvelles colonnes (nullable au départ)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.market_prices
  ADD COLUMN IF NOT EXISTS metier TEXT,
  ADD COLUMN IF NOT EXISTS nature_prix TEXT,
  ADD COLUMN IF NOT EXISTS multiplicateur_couches_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gamme TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CHECK constraints
-- ─────────────────────────────────────────────────────────────────────────────

-- nature_prix : enum (4 valeurs autorisées)
ALTER TABLE public.market_prices
  DROP CONSTRAINT IF EXISTS check_nature_prix_enum;
ALTER TABLE public.market_prices
  ADD CONSTRAINT check_nature_prix_enum CHECK (
    nature_prix IS NULL OR nature_prix IN (
      'pose_seule',
      'fourniture_pose',
      'fourniture_seule',
      'non_applicable'
    )
  );

-- metier : enum (24 familles décidées en Phase 1.4)
ALTER TABLE public.market_prices
  DROP CONSTRAINT IF EXISTS check_metier_enum;
ALTER TABLE public.market_prices
  ADD CONSTRAINT check_metier_enum CHECK (
    metier IS NULL OR metier IN (${metierEnumValues})
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. UPDATE en bloc — 891 entrées avec les valeurs décidées
-- ─────────────────────────────────────────────────────────────────────────────

${updateStatements}

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Indexes pour le futur matcher
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_market_prices_metier ON public.market_prices (metier);
CREATE INDEX IF NOT EXISTS idx_market_prices_nature_prix ON public.market_prices (nature_prix);
CREATE INDEX IF NOT EXISTS idx_market_prices_metier_nature ON public.market_prices (metier, nature_prix);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Vérifications finales (avant COMMIT)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_total INT;
  v_with_metier INT;
  v_with_nature INT;
  v_unique_metiers INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.market_prices;
  SELECT COUNT(*) INTO v_with_metier FROM public.market_prices WHERE metier IS NOT NULL;
  SELECT COUNT(*) INTO v_with_nature FROM public.market_prices WHERE nature_prix IS NOT NULL;
  SELECT COUNT(DISTINCT metier) INTO v_unique_metiers FROM public.market_prices WHERE metier IS NOT NULL;

  IF v_total != 891 THEN
    RAISE EXCEPTION 'Erreur — attendu 891 entrées, trouvé %', v_total;
  END IF;
  IF v_with_metier != 891 THEN
    RAISE EXCEPTION 'Erreur — % entrées sans metier (attendu 0)', 891 - v_with_metier;
  END IF;
  IF v_with_nature != 891 THEN
    RAISE EXCEPTION 'Erreur — % entrées sans nature_prix (attendu 0)', 891 - v_with_nature;
  END IF;

  RAISE NOTICE '✓ Catalogue : 891 entrées toutes enrichies';
  RAISE NOTICE '✓ Metiers distincts : %', v_unique_metiers;
  RAISE NOTICE '✓ nature_prix : 100%% des entrées renseignées';
END $$;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- Distribution finale par métier (info)
-- ═════════════════════════════════════════════════════════════════════════════
${metierStatsSorted
  .map((s) => `-- ${s[0].padEnd(35)} : ${s[1]} entrées`)
  .join("\n")}

-- ═════════════════════════════════════════════════════════════════════════════
-- Distribution finale par nature_prix (info)
-- ═════════════════════════════════════════════════════════════════════════════
${naturePrixStatsSorted
  .map((s) => `-- ${s[0].padEnd(20)} : ${s[1]} entrées`)
  .join("\n")}
`;

writeFileSync(SQL_PATH, sql, "utf-8");

console.log(`✓ Migration SQL générée : ${SQL_PATH}`);
console.log(`  ${entries.length} UPDATE statements`);
console.log(`  ${metierStats.size} métiers distincts`);
console.log(`  Distribution :`);
for (const [m, n] of metierStatsSorted) console.log(`    ${m.padEnd(35)} : ${n}`);
console.log(`\n👉 Étape suivante : Julien colle ce SQL dans Supabase Studio`);
