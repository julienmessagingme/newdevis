#!/usr/bin/env node
/**
 * scripts/seed_market_prices_embeddings.mjs
 *
 * V3.5.0 PHASE B (2026-05-21) — Embed les ~470 entrées du catalogue
 * `public.market_prices` via Gemini embedding-001 et stocke les vecteurs
 * 768d dans la colonne `embedding` (créée par la migration Phase A).
 *
 * Une fois le seed terminé, l'edge function analyze-quote (à refondre en
 * Phase C) pourra appeler `supabase.rpc('search_market_prices_v2', ...)`
 * pour matcher chaque ligne de devis individuellement au catalogue.
 *
 * USAGE :
 *   # Embed uniquement les rows pas encore embeddées (par défaut, idempotent)
 *   node scripts/seed_market_prices_embeddings.mjs
 *
 *   # Re-embed TOUT (utile après changement de modèle ou de format de texte)
 *   node scripts/seed_market_prices_embeddings.mjs --force
 *
 *   # Tester sur 5 rows seulement
 *   node scripts/seed_market_prices_embeddings.mjs --limit 5
 *
 * ENV VARS REQUISES (read from .env via dotenv, ou shell) :
 *   SUPABASE_URL                 (ou PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_API_KEY               (ou GEMINI_API_KEY)
 *
 * COÛT :
 *   470 entrées × ~80 tokens chacune ≈ 38k tokens
 *   Gemini embedding-001 = ~$0.00025 / 1k tokens
 *   Total : < 0.01 € pour seed complet du catalogue
 *
 * RATE LIMIT :
 *   Gemini embedding-001 : 1500 req/min en free tier
 *   Throttle 50ms entre requêtes = 1200 req/min (marge confortable)
 *   470 entrées × 50ms = ~24s pour seed complet
 */

import { createClient } from '@supabase/supabase-js';

// ── Configuration ──────────────────────────────────────────────────────────
const SUPABASE_URL    = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY  = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

const EMBEDDING_MODEL = 'models/embedding-001';
const EMBEDDING_DIM   = 768; // Gemini embedding-001 retourne 768 dim
const THROTTLE_MS     = 50;  // Délai entre requêtes Gemini

// CLI args
const args = process.argv.slice(2);
const force  = args.includes('--force');
const limitI = args.indexOf('--limit');
const limit  = limitI >= 0 ? parseInt(args[limitI + 1], 10) : null;

// ── Validation env vars ────────────────────────────────────────────────────
if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
  console.error('❌ Env vars manquantes. Requis :');
  console.error('   - SUPABASE_URL ou PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('   - GOOGLE_API_KEY ou GEMINI_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Embed un texte via Gemini embedding-001.
 *
 * taskType="RETRIEVAL_DOCUMENT" : optimisé pour les catalog entries (côté
 * "documents indexés"). À la query depuis l'edge function on utilisera
 * taskType="RETRIEVAL_QUERY" pour les lignes de devis (côté "requêtes").
 * Cette distinction améliore la qualité du matching (cf. doc Gemini).
 *
 * Retourne un array de 768 floats.
 */
async function embedText(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Gemini embedContent ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = await resp.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIM) {
    throw new Error(`Embedding malformé : attendu ${EMBEDDING_DIM} dim, reçu ${values?.length}`);
  }
  return values;
}

/**
 * Construit le texte à embed pour une row catalogue.
 *
 * Format choisi pour maximiser la richesse sémantique :
 *   - label : description humaine ("Pose carrelage sol")
 *   - notes : précisions ("RGE", "Selon accès")
 *   - job_type : identifiant technique ("carrelage_sol") — utile pour matcher
 *     les devis qui mentionnent le terme technique
 *   - domain : domaine large ("carrelage") — donne du contexte
 *   - unit : unité de mesure ("m2") — discriminant pour les variants
 *     (pose au m² vs forfait)
 *
 * Concat en phrases naturelles pour que l'embedding capture mieux le sens.
 */
function buildEmbeddingText(row) {
  const parts = [
    row.label || '',
    row.notes ? `Précisions : ${row.notes}` : '',
    `Type métier : ${row.job_type}`,
    row.domain ? `Domaine : ${row.domain}` : '',
    `Unité de facturation : ${row.unit}`,
  ].filter(Boolean);
  return parts.join('. ');
}

/**
 * Formate un array JS en littéral pgvector (string "[v1, v2, ...]").
 * pgvector accepte ce format pour les UPDATE / INSERT.
 */
function toPgVector(arr) {
  return `[${arr.join(',')}]`;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Seed market_prices.embedding (V3.5.0 Phase B)`);
  console.log(`   Mode  : ${force ? '🔄 RE-EMBED ALL (--force)' : '📌 missing only'}`);
  console.log(`   Model : ${EMBEDDING_MODEL} (${EMBEDDING_DIM} dim)`);
  if (limit) console.log(`   Limit : ${limit} rows max`);
  console.log('');

  // Vérifie d'abord que la colonne embedding existe
  const { data: cols, error: colsErr } = await supabase
    .from('market_prices')
    .select('id, embedding')
    .limit(1);
  if (colsErr) {
    console.error(`❌ Impossible de query market_prices : ${colsErr.message}`);
    console.error(`   → Vérifier que la migration Phase A est appliquée :`);
    console.error(`     supabase/migrations/20260521_002_market_prices_vectorization.sql`);
    process.exit(1);
  }

  // Sélection des rows à embed
  // Note : on ne peut pas filtrer côté Supabase sur embedding IS NULL si la
  // colonne est de type vector (pas de support native). Donc on fetch tout
  // et on filtre côté Node.
  let q = supabase
    .from('market_prices')
    .select('id, job_type, label, unit, notes, domain, embedding')
    .order('id', { ascending: true });
  if (limit) q = q.limit(limit);
  const { data: rows, error } = await q;
  if (error) {
    console.error(`❌ Fetch market_prices : ${error.message}`);
    process.exit(1);
  }

  const target = force ? rows : rows.filter(r => r.embedding === null);
  console.log(`📦 Total catalogue : ${rows.length} rows`);
  console.log(`📦 À traiter       : ${target.length} rows\n`);

  if (target.length === 0) {
    console.log('✅ Aucune row à embedder (toutes déjà OK). Use --force pour re-embed.');
    return;
  }

  let success = 0, failed = 0;
  const startTs = Date.now();

  for (let i = 0; i < target.length; i++) {
    const row = target[i];
    const text = buildEmbeddingText(row);

    try {
      const embedding = await embedText(text);
      const { error: updErr } = await supabase
        .from('market_prices')
        .update({ embedding: toPgVector(embedding) })
        .eq('id', row.id);
      if (updErr) throw updErr;
      success++;
      if (success % 20 === 0 || success === target.length) {
        const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
        process.stdout.write(`\r  ✓ ${success}/${target.length} (${elapsed}s)`);
      }
    } catch (e) {
      failed++;
      process.stdout.write('\n');
      console.error(`  ✗ id=${row.id} job_type="${row.job_type}" : ${e.message}`);
    }

    // Throttle anti-rate-limit
    if (i < target.length - 1) {
      await new Promise(r => setTimeout(r, THROTTLE_MS));
    }
  }

  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  console.log(`\n\n🎉 Done : ${success} ✓ / ${failed} ✗ en ${elapsed}s`);

  // Vérification post-seed
  const { count: stillNullCount } = await supabase
    .from('market_prices')
    .select('*', { count: 'exact', head: true })
    .is('embedding', null);
  console.log(`📊 Rows sans embedding restantes : ${stillNullCount ?? '?'}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('\n💥 Erreur fatale :', e.message);
  process.exit(1);
});
