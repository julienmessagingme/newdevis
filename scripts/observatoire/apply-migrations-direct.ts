#!/usr/bin/env tsx
/**
 * scripts/observatoire/apply-migrations-direct.ts
 *
 * Applique les 2 migrations en attente (Comparateur + Observatoire) en se
 * connectant directement à la DB Postgres via `pg` package.
 *
 * Contournement du bug Node 24 Windows sur `npx supabase db push`.
 *
 * Requis dans .env.local :
 *   SUPABASE_DB_PASSWORD=<mot de passe DB>
 *   (ou DATABASE_URL=postgresql://...)
 *
 * Le project-ref est déduit de SUPABASE_URL.
 *
 * USAGE :
 *   npm i pg @types/pg
 *   npx tsx scripts/observatoire/apply-migrations-direct.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

function loadEnvFile(name: string): boolean {
  const p = join(ROOT, name);
  if (!existsSync(p)) return false;
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
  return true;
}
loadEnvFile(".env.local");
loadEnvFile(".env");

// ─────────────────────────────────────────────────────────────────
// Construction du connectionString
// ─────────────────────────────────────────────────────────────────

let connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  const supaUrl = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  if (!supaUrl || !dbPassword) {
    console.error(`
❌ Configuration manquante dans .env.local

Ajoute soit :
  DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres

Soit :
  SUPABASE_DB_PASSWORD=<mot de passe DB>
  (SUPABASE_URL est déjà présent)

Le mot de passe DB est celui que tu as utilisé pour "npx supabase db push --linked".
Si tu l'as perdu, tu peux le reset dans Supabase Dashboard :
  Settings > Database > Reset database password
`);
    process.exit(1);
  }

  // Deduit project-ref depuis SUPABASE_URL : https://vhrhgsqxwvouswjaiczn.supabase.co
  const match = /^https?:\/\/([a-z0-9]+)\.supabase\.co/i.exec(supaUrl);
  if (!match) {
    console.error(`❌ Impossible de déduire le project-ref depuis SUPABASE_URL : ${supaUrl}`);
    process.exit(1);
  }
  const projectRef = match[1];

  // On tente d'abord le connection pooler (aws-0-eu-west-3 par défaut FR)
  // sinon la connexion directe (moins fiable derrière NAT)
  const region = process.env.SUPABASE_DB_REGION || "eu-west-3";
  connectionString = `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@aws-0-${region}.pooler.supabase.com:6543/postgres?sslmode=require`;
  console.log(`🔗 Connexion via pooler aws-0-${region} (projet ${projectRef})`);
}

// ─────────────────────────────────────────────────────────────────
// Fichiers à appliquer
// ─────────────────────────────────────────────────────────────────

const MIGRATIONS = [
  "20260630120000_comparisons.sql",
  "20260701090000_observatoire_views.sql",
];

async function main(): Promise<void> {
  console.log("🟢 Application directe des migrations DDL\n");

  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log("✓ Connexion Postgres établie\n");
  } catch (e) {
    console.error(
      `❌ Impossible de se connecter : ${e instanceof Error ? e.message : String(e)}\n`,
    );
    console.error(`Vérifie :
  - SUPABASE_DB_PASSWORD est correct dans .env.local
  - SUPABASE_DB_REGION (défaut eu-west-3) correspond à ton projet
  - Ton IP n'est pas bloquée par le "Restrict to trusted IPs" côté Supabase
`);
    process.exit(1);
  }

  for (const filename of MIGRATIONS) {
    const path = join(ROOT, "supabase", "migrations", filename);
    if (!existsSync(path)) {
      console.error(`❌ Fichier introuvable : ${path}`);
      continue;
    }
    const sql = readFileSync(path, "utf-8");
    console.log(`⏳ Exécution : ${filename} (${sql.length} chars)…`);

    try {
      const start = Date.now();
      await client.query(sql);
      const dur = Date.now() - start;
      console.log(`   ✓ Appliquée en ${dur}ms\n`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Certaines migrations peuvent contenir des CREATE TABLE IF NOT EXISTS
      // qui râlent si déjà appliquées partiellement. On log mais on continue.
      if (msg.includes("already exists") || msg.includes("duplicate")) {
        console.log(`   ⚠️  Certaines parties déjà appliquées : ${msg.slice(0, 200)}\n`);
      } else {
        console.error(`   ❌ Erreur SQL : ${msg}\n`);
      }
    }
  }

  console.log("──── Vérification post-application ────");
  const checks = [
    ["comparisons", "public.comparisons"],
    ["mv_observatoire_base", "public.mv_observatoire_base"],
    ["mv_observatoire_metiers", "public.mv_observatoire_metiers"],
    ["mv_observatoire_chantiers", "public.mv_observatoire_chantiers"],
    ["mv_observatoire_postes_surfactures", "public.mv_observatoire_postes_surfactures"],
    ["mv_observatoire_anomalies", "public.mv_observatoire_anomalies"],
    ["mv_observatoire_tva", "public.mv_observatoire_tva"],
    ["mv_observatoire_kpi_global", "public.mv_observatoire_kpi_global"],
  ] as const;
  for (const [label, obj] of checks) {
    try {
      const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM ${obj}`);
      console.log(`  ✓ ${label} : ${rows[0].n} rows`);
    } catch (e) {
      console.log(`  ✗ ${label} : NON créée (${e instanceof Error ? e.message.slice(0, 80) : "erreur"})`);
    }
  }

  await client.end();
  console.log(`\n🟢 Terminé. Tu peux maintenant lancer :`);
  console.log(`  npx tsx scripts/observatoire/generate-observatoire.ts`);
}

main().catch((err) => {
  console.error("❌ Erreur fatale :", err);
  process.exit(1);
});
