/**
 * Import DVF prices CSV → table Supabase `dvf_prices`
 *
 * Usage :
 *   npx tsx scripts/import-dvf-prices.ts [chemin/vers/fichier.csv]
 *
 * Si aucun chemin fourni, utilise data/dvf_prices_seed.csv
 *
 * Variables d'environnement requises (jamais committées) :
 *   SUPABASE_URL          — ou PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Format CSV attendu (virgule, encodage UTF-8) :
 *   code_insee,commune,prix_m2_maison,prix_m2_appartement,nb_ventes_maison,nb_ventes_appartement,period
 *   31555,Toulouse,3200,2700,450,1100,12m
 *
 * Les champs prix/nb_ventes peuvent être vides (null en base).
 * La clé de conflit est code_insee → upsert (mise à jour si déjà présent).
 */

import * as fs   from 'node:fs';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ── Config ────────────────────────────────────────────────────
const SUPABASE_URL  = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BATCH_SIZE    = 50; // upsert par lots

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Variables manquantes : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.');
  console.error('    Exemple : SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/import-dvf-prices.ts');
  process.exit(1);
}

const CSV_PATH = process.argv[2] ?? path.join(process.cwd(), 'data', 'dvf_prices_seed.csv');

if (!fs.existsSync(CSV_PATH)) {
  console.error(`❌  Fichier introuvable : ${CSV_PATH}`);
  process.exit(1);
}

// ── Types ─────────────────────────────────────────────────────
interface DvfPriceRow {
  code_insee:            string;
  commune:               string;
  prix_m2_maison:        number | null;
  prix_m2_appartement:   number | null;
  nb_ventes_maison:      number | null;
  nb_ventes_appartement: number | null;
  period:                string;
  updated_at:            string;
}

// ── Helpers ───────────────────────────────────────────────────
function num(s: string | undefined): number | null {
  if (!s || s.trim() === '') return null;
  const n = parseFloat(s.trim());
  return isNaN(n) ? null : n;
}

function int(s: string | undefined): number | null {
  if (!s || s.trim() === '') return null;
  const n = parseInt(s.trim(), 10);
  return isNaN(n) ? null : n;
}

function parseCsv(text: string): DvfPriceRow[] {
  const lines   = text.trim().split(/\r?\n/);
  const headers = lines[0]!.split(',').map(h => h.trim());

  const idx = (name: string) => headers.indexOf(name);
  const iCode    = idx('code_insee');
  const iCommune = idx('commune');
  const iPrM     = idx('prix_m2_maison');
  const iPrA     = idx('prix_m2_appartement');
  const iNbM     = idx('nb_ventes_maison');
  const iNbA     = idx('nb_ventes_appartement');
  const iPeriod  = idx('period');

  if (iCode < 0 || iCommune < 0) {
    console.error('❌  Colonnes requises manquantes : code_insee, commune');
    process.exit(1);
  }

  const now = new Date().toISOString();
  const rows: DvfPriceRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',');
    const codeInsee = cols[iCode]?.trim() ?? '';
    const commune   = cols[iCommune]?.trim() ?? '';
    if (!codeInsee || !commune) continue;

    rows.push({
      code_insee:            codeInsee,
      commune,
      prix_m2_maison:        num(cols[iPrM]),
      prix_m2_appartement:   num(cols[iPrA]),
      nb_ventes_maison:      int(cols[iNbM]),
      nb_ventes_appartement: int(cols[iNbA]),
      period:                cols[iPeriod]?.trim() || '12m',
      updated_at:            now,
    });
  }

  return rows;
}

async function upsertBatch(
  supabase: ReturnType<typeof createClient>,
  batch: DvfPriceRow[],
): Promise<void> {
  const { error } = await supabase
    .from('dvf_prices')
    .upsert(batch, { onConflict: 'code_insee' });

  if (error) {
    console.error('❌  Erreur Supabase :', error.message);
    throw error;
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`\n📂  Source : ${CSV_PATH}`);
  const text = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(text);

  if (rows.length === 0) {
    console.warn('⚠️   Aucune ligne valide trouvée dans le CSV.');
    return;
  }
  console.log(`📊  ${rows.length} lignes valides — upsert en cours…`);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await upsertBatch(supabase, batch);
    done += batch.length;
    process.stdout.write(`\r   ✔  ${done} / ${rows.length}`);
  }

  console.log(`\n🎉  Import terminé — ${done} commune(s) upsertée(s) dans dvf_prices.`);
}

main().catch(err => {
  console.error('\n❌  Erreur fatale :', err instanceof Error ? err.message : err);
  process.exit(1);
});
