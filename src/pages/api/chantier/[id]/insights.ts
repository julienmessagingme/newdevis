export const prerender = false;

/**
 * POST /api/chantier/[id]/insights
 *
 * Génère des insights maître-d'œuvre via Gemini 2.0-flash.
 * Lit tous les documents, devis analysés et lots du chantier pour
 * produire 2-3 insights globaux + 1 insight par lot.
 *
 * Réponse :
 * {
 *   global: { type, text, icon }[]
 *   lots:   Record<lotId, { type, text }>
 * }
 */

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

const googleApiKey    = import.meta.env.GOOGLE_API_KEY ?? import.meta.env.GOOGLE_AI_API_KEY;
const GEMINI_URL      = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function fmtK(n: number) {
  return n >= 1000 ? `${Math.round(n / 1000)}k€` : `${n}€`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InsightItem {
  type: 'success' | 'warning' | 'alert' | 'info';
  text: string;
  icon?: string; // emoji
}

export interface InsightsResponse {
  global: InsightItem[];
  lots: Record<string, InsightItem>;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  // ── Reload chantier with full fields ──────────────────────────────────────
  const { data: chantier } = await ctx.supabase
    .from('chantiers')
    .select('id, nom, budget, metadonnees, project_mode')
    .eq('id', chantierId)
    .single();

  if (!chantier) {
    return jsonError('Chantier introuvable', 404);
  }

  // ── Chargement parallèle des données ──────────────────────────────────────
  const [lotsRes, docsRes] = await Promise.all([
    ctx.supabase
      .from('lots_chantier')
      .select('id, nom, emoji, statut, budget_min_ht, budget_avg_ht, budget_max_ht, job_type')
      .eq('chantier_id', chantierId)
      .order('ordre'),

    ctx.supabase
      .from('documents_chantier')
      .select('id, nom, document_type, lot_id, analyse_id, created_at')
      .eq('chantier_id', chantierId)
      .order('created_at', { ascending: false }),
  ]);

  const lots  = lotsRes.data  ?? [];
  const docs  = docsRes.data  ?? [];

  // ── Charger les analyses liées aux documents ───────────────────────────────
  const analyseIds = [...new Set(
    docs.filter(d => d.analyse_id).map(d => d.analyse_id as string),
  )];

  let analysesData: Record<string, {
    score?: string;        // VERT / ORANGE / ROUGE
    totalDevis?: number;   // montant total HT du devis analysé
    prixMarche?: number;   // prix moyen marché correspondant
    entreprise?: string;
  }> = {};

  if (analyseIds.length > 0) {
    const { data: analyses } = await ctx.supabase
      .from('analyses')
      .select('id, raw_text')
      .in('id', analyseIds);

    for (const a of analyses ?? []) {
      const rt = a.raw_text ?? {};
      // Extraire le score global et les données tarifaires
      const scoreGlobal = rt.score_global?.score ?? rt.score_global?.niveau ?? null;
      const totalHT     = rt.context?.total_ht ?? rt.devis?.total_ht ?? null;
      const entreprise  = rt.entreprise?.nom ?? null;

      // Prix marché moyen depuis n8n_price_data (JobTypePriceResult[])
      let prixMarche: number | null = null;
      const priceData = rt.n8n_price_data;
      if (Array.isArray(priceData)) {
        const allAvg = priceData
          .map((p: Record<string, unknown>) => p.theoreticalAvgHT ?? 0)
          .filter((v: number) => v > 0);
        if (allAvg.length > 0) {
          prixMarche = allAvg.reduce((s: number, v: number) => s + v, 0);
        }
      }

      analysesData[a.id] = {
        score: scoreGlobal,
        totalDevis: totalHT,
        prixMarche: prixMarche ?? undefined,
        entreprise: entreprise ?? undefined,
      };
    }
  }

  // ── Construire le contexte pour Gemini ─────────────────────────────────────
  const meta          = chantier.metadonnees ?? {};
  const budgetTotal   = chantier.budget ?? meta.budgetTotal ?? 0;
  const budgetMin     = Math.round(budgetTotal * 0.85);
  const budgetMax     = Math.round(budgetTotal * 1.20);
  const roadmap       = (meta.roadmap ?? []) as { nom: string; isCurrent?: boolean; mois?: string }[];
  const currentStep   = roadmap.find((r: { isCurrent?: boolean }) => r.isCurrent);
  const taches        = (meta.taches ?? []) as { titre: string; done: boolean; priorite: string }[];
  const urgentTodos   = taches.filter((t: { done: boolean; priorite: string }) => !t.done && t.priorite === 'urgent');

  // Résumé des lots
  const lotsCtx = lots.map(l => {
    const lotDocs = docs.filter(d => d.lot_id === l.id);
    const devisDoc = lotDocs.find(d => d.document_type === 'devis' && d.analyse_id);
    const analyse  = devisDoc ? analysesData[devisDoc.analyse_id!] : null;

    let budgetCtx = '';
    if (l.budget_min_ht && l.budget_max_ht) {
      budgetCtx = `référence marché ${fmtK(l.budget_min_ht)}–${fmtK(l.budget_max_ht)}`;
    }

    let analyseCtx = '';
    if (analyse) {
      const pct = analyse.totalDevis && analyse.prixMarche && analyse.prixMarche > 0
        ? Math.round(((analyse.totalDevis - analyse.prixMarche) / analyse.prixMarche) * 100)
        : null;
      analyseCtx = [
        analyse.score ? `score=${analyse.score}` : '',
        pct !== null ? `${pct > 0 ? '+' : ''}${pct}% vs marché` : '',
        analyse.entreprise ? `entreprise="${analyse.entreprise}"` : '',
      ].filter(Boolean).join(', ');
    }

    return `- LOT_ID:${l.id} "${l.nom}" statut=${l.statut} docs=${lotDocs.length} devis=${lotDocs.filter(d => d.document_type === 'devis').length}` +
      (budgetCtx ? ` ${budgetCtx}` : '') +
      (analyseCtx ? ` [analyse: ${analyseCtx}]` : '');
  }).join('\n');

  // Résumé des documents non assignés
  const unassignedDocs = docs.filter(d => !d.lot_id);

  const prompt = `
Tu es un maître d'œuvre expert (20 ans d'expérience) qui supervise ce chantier.
Analyse les données suivantes et génère des insights ULTRA-COURTS et ACTIONNABLES.

CHANTIER : "${chantier.nom}"
BUDGET : ${fmtK(budgetMin)} – ${fmtK(budgetMax)} TTC
ÉTAPE EN COURS : ${currentStep ? `"${currentStep.nom}" (${currentStep.mois ?? ''})` : 'Non précisée'}
TÂCHES URGENTES : ${urgentTodos.length > 0 ? urgentTodos.map((t: { titre: string }) => `"${t.titre}"`).join(', ') : 'Aucune'}
DOCUMENTS TOTAUX : ${docs.length} (${docs.filter(d => d.document_type === 'devis').length} devis, ${docs.filter(d => d.document_type === 'facture').length} factures)

LOTS (${lots.length}) :
${lotsCtx || '(aucun lot défini)'}

${unassignedDocs.length > 0 ? `DOCUMENTS NON ASSIGNÉS : ${unassignedDocs.length} document(s) sans lot` : ''}

---
RÈGLES ABSOLUES :
1. Maximum 8 mots par insight (compte les mots)
2. Uniquement des faits concrets et mesurables
3. Pas de conseils génériques ("choisir un bon artisan", "vérifier les références"...)
4. Si comparaison vs marché disponible : mentionner le % ou le montant
5. Pour le champ "type" : "success" = positif, "warning" = attention requise, "alert" = problème, "info" = information utile
6. Pour le champ "icon" : utilise un seul emoji pertinent
7. Les insights "lots" doivent utiliser les LOT_ID exactement comme listés

Génère UNIQUEMENT ce JSON (sans markdown, sans commentaire) :
{
  "global": [
    { "type": "success|warning|alert|info", "text": "insight ≤ 8 mots", "icon": "emoji" }
  ],
  "lots": {
    "LOT_ID_EXACT": { "type": "success|warning|alert|info", "text": "insight ≤ 8 mots" }
  }
}

Génère 2 à 3 insights globaux et 1 insight par lot.
Si un lot n'a pas de donnée significative, génère quand même un insight utile (ex: "Aucun devis · Budget référence disponible").
`.trim();

  // ── Appel Gemini ───────────────────────────────────────────────────────────
  if (!googleApiKey) {
    // Fallback sans IA : insights statiques basés sur les données
    return buildStaticInsights(lots, docs, budgetMin, budgetMax);
  }

  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${googleApiKey}`,
      },
      body: JSON.stringify({
        model: 'gemini-2.0-flash',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[insights] Gemini ${res.status}:`, errText.slice(0, 200));
      return buildStaticInsights(lots, docs, budgetMin, budgetMax);
    }

    const gemini = await res.json();
    const raw    = gemini.choices?.[0]?.message?.content ?? '{}';

    let parsed: InsightsResponse;
    try {
      const clean = raw.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      console.error('[insights] JSON parse error, raw:', raw.slice(0, 200));
      return buildStaticInsights(lots, docs, budgetMin, budgetMax);
    }

    // Validation souple
    const globalInsights = Array.isArray(parsed.global)
      ? parsed.global.filter(i => i && typeof i.text === 'string').slice(0, 3)
      : [];

    const lotsInsights: Record<string, InsightItem> = {};
    if (parsed.lots && typeof parsed.lots === 'object') {
      for (const [k, v] of Object.entries(parsed.lots)) {
        if (v && typeof (v as InsightItem).text === 'string') {
          lotsInsights[k] = v as InsightItem;
        }
      }
    }

    if (globalInsights.length === 0) {
      return buildStaticInsights(lots, docs, budgetMin, budgetMax);
    }

    const response: InsightsResponse = { global: globalInsights, lots: lotsInsights };
    return jsonOk(response);

  } catch (e) {
    console.error('[insights] error:', (e as Error).message);
    return buildStaticInsights(lots, docs, budgetMin, budgetMax);
  }
};

// ── Fallback statique (si Gemini indisponible) ────────────────────────────────

function buildStaticInsights(
  lots: { id: string; nom: string; statut: string; budget_min_ht?: number | null; budget_max_ht?: number | null }[],
  docs: { document_type: string; lot_id?: string | null }[],
  budgetMin: number,
  budgetMax: number,
): Response {
  const global: InsightItem[] = [];
  const lotsMap: Record<string, InsightItem> = {};

  const totalDocs   = docs.length;
  const devisCount  = docs.filter(d => d.document_type === 'devis').length;
  const lotsNoDevis = lots.filter(l => !docs.some(d => d.lot_id === l.id && d.document_type === 'devis'));

  if (totalDocs === 0) {
    global.push({ type: 'info', text: 'Ajoutez vos devis pour analyse automatique', icon: '📄' });
  } else if (lotsNoDevis.length > 0) {
    global.push({ type: 'warning', text: `${lotsNoDevis.length} lot${lotsNoDevis.length > 1 ? 's' : ''} sans devis`, icon: '⚠️' });
  }

  if (devisCount > 0) {
    global.push({ type: 'info', text: `${devisCount} devis déposé${devisCount > 1 ? 's' : ''} · analyse possible`, icon: '🔍' });
  }

  const savings = lots.reduce((s, l) => {
    if (l.budget_max_ht && l.budget_min_ht) return s + (l.budget_max_ht - l.budget_min_ht);
    return s;
  }, 0);
  if (savings > 1000) {
    global.push({ type: 'success', text: `Écart budget : jusqu'à ${fmtK(savings)} à optimiser`, icon: '💰' });
  }

  for (const lot of lots) {
    const hasDevis = docs.some(d => d.lot_id === lot.id && d.document_type === 'devis');
    if (!hasDevis && lot.budget_min_ht && lot.budget_max_ht) {
      lotsMap[lot.id] = {
        type: 'info',
        text: `Aucun devis · réf. ${fmtK(lot.budget_min_ht)}–${fmtK(lot.budget_max_ht)}`,
      };
    } else if (!hasDevis) {
      lotsMap[lot.id] = { type: 'warning', text: 'Aucun devis ajouté' };
    } else if (lot.statut === 'ok') {
      lotsMap[lot.id] = { type: 'success', text: 'Artisan confirmé ✓' };
    } else {
      lotsMap[lot.id] = { type: 'info', text: 'Devis déposé · en attente de validation' };
    }
  }

  const response: InsightsResponse = {
    global: global.length > 0 ? global : [{ type: 'info', text: 'Données insuffisantes pour analyse', icon: '📊' }],
    lots: lotsMap,
  };
  return jsonOk(response);
}

export const OPTIONS: APIRoute = () => optionsResponse();
