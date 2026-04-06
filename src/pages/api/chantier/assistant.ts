/**
 * POST /api/chantier/assistant
 * Analyse contextuelle IA — retourne un JSON structuré (action_prioritaire, insights, alertes, conseil_metier).
 * Propulsé par Gemini 2.0-flash. Cohérent avec les analyses de devis de la plateforme.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireAuth, parseJsonBody } from '@/lib/apiHelpers';
import { extractProjectElements, detectDevisType } from '@/utils/extractProjectElements';

const googleApiKey    = import.meta.env.GOOGLE_API_KEY ?? import.meta.env.GOOGLE_AI_API_KEY;

// ── Types ─────────────────────────────────────────────────────────────────────

interface LotInfo {
  nom: string;
  statut?: string;
  budget_min_ht?: number | null;
  budget_avg_ht?: number | null;
  budget_max_ht?: number | null;
  devisCount?: number;
}

interface DevisInfo {
  nom: string;
  montant?: number | null;
  analyse_id?: string | null;
  analysisScore?: string | null;
  anomalies?: string | null;
}

interface AssistantRequestBody {
  description: string;
  lots: LotInfo[];
  devis: DevisInfo[];
  budgetMin?: number | null;
  budgetMax?: number | null;
  planning?: { phase: string; statut: string }[];
}

export interface AssistantProposition {
  id: string;
  titre: string;
  description: string;
  action_type: 'analyse_devis' | 'budget_review' | 'add_devis';
  cta_oui: string;
  cta_non: string;
}

export interface AssistantResult {
  action_prioritaire: {
    titre: string;
    raison: string;
    cta: string;
  };
  insights: string[];
  alertes: {
    type: 'critique' | 'risque' | 'opportunité';
    message: string;
    cta: string;
  }[];
  conseil_metier: string;
  propositions?: AssistantProposition[];
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un maître d'œuvre professionnel avec 20 ans d'expérience en conduite de travaux.
Tu pilotes ce chantier pour le compte du client. Tu es concret, direct, et toujours orienté action.

RÈGLES DE COMMUNICATION :
- Phrases courtes et percutantes (max 20 mots par champ texte)
- Jamais de généralités ("restez vigilant", "choisissez bien vos artisans", "vérifiez les références")
- Uniquement des faits concrets avec chiffres quand disponibles
- Ne jamais inventer d'informations

LOGIQUE MÉTIER :
- 0 devis → chantier bloqué → action critique immédiate
- Devis sans analyse IA → risque fort de payer trop cher → proposer l'analyse
- Écart budget significatif (>15%) → alerte dépassement avec montant précis
- Devis > prix marché → signaler le % d'écart
- Score ROUGE sur un devis → alerte critique avec nom de l'artisan

RÈGLE COHÉRENCE DEVIS ↔ LOT :
- Si [COHERENCE_DEVIS] contient "AFFECTATION DOUTEUSE" → alerte risque : "Devis [nom] affecté au lot [lot] — êtes-vous sûr ?"
- Si [COHERENCE_DEVIS] contient des devis "non affectés" → observation info, pas d'alerte
- Maximum 2 propositions
- Chaque proposition doit être une offre concrète du maître d'œuvre ("Je peux...", "Voulez-vous que je...")

Réponds UNIQUEMENT avec un JSON valide, sans balises markdown, sans commentaires.`;

// ── Handler ───────────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;

  if (!googleApiKey) {
    return jsonError('Clé API non configurée', 500);
  }

  const body = await parseJsonBody<AssistantRequestBody>(request);
  if (body instanceof Response) return body;

  const { description, lots = [], devis = [], budgetMin, budgetMax, planning = [] } = body;

  // ── Détection des éléments du projet ──────────────────────────────────────

  const elementsProjet = extractProjectElements(description ?? '');

  // Enrichir chaque devis avec son type détecté
  const devisEnrichis = devis.map(d => ({
    ...d,
    type: detectDevisType(d.nom),
  }));

  // ── Coherence devis ↔ lot (new logic) ─────────────────────────────────────
  // 1. Devis assigned to a lot → check if devis type matches the lot type
  //    If mismatch → "are you sure it's assigned to the right lot?"
  // 2. Devis NOT assigned to a lot → simple info "devis non affecté à un lot"
  const devisNonAffectes = devisEnrichis.filter(d => !d.lot_id);
  const devisMalAffectes: Array<{ nom: string; type: string; lotNom: string; lotType: string }> = [];

  for (const d of devisEnrichis) {
    if (!d.lot_id || !d.lot_nom || d.type === 'autre') continue;
    const lotType = detectDevisType(d.lot_nom);
    if (lotType !== 'autre' && lotType !== d.type) {
      devisMalAffectes.push({ nom: d.nom, type: d.type, lotNom: d.lot_nom, lotType });
    }
  }

  // ── Construire le contexte projet ─────────────────────────────────────────

  const devisCount   = devis.length;
  const lotsNoDev    = lots.filter(l => (l.devisCount ?? 0) === 0).length;
  const budgetStr    = budgetMin != null && budgetMax != null
    ? `${Math.round(budgetMin / 1000)}k€ – ${Math.round(budgetMax / 1000)}k€`
    : 'non précisé';

  const lotsStr = lots.length > 0
    ? lots.map(l => {
        const bStr = l.budget_avg_ht != null ? ` (moy. ${Math.round(l.budget_avg_ht / 1000)}k€)` : '';
        return `- ${l.nom}${bStr} [statut: ${l.statut ?? 'à trouver'}, devis: ${l.devisCount ?? 0}]`;
      }).join('\n')
    : 'Aucun intervenant défini';

  // Détecter les devis sans analyse IA
  const devisNonAnalyses = devisEnrichis.filter(d => !d.analyse_id);
  const devisAnalyses    = devisEnrichis.filter(d => !!d.analyse_id);

  const devisStr = devisEnrichis.length > 0
    ? devisEnrichis.map(d => {
        let str = `- ${d.nom} [type: ${d.type}, analysé: ${d.analyse_id ? 'OUI' : 'NON'}]`;
        if (d.montant != null) str += ` (${Math.round(d.montant / 1000)}k€)`;
        if (d.analysisScore) str += ` [score: ${d.analysisScore}]`;
        if (d.anomalies) str += ` ⚠ ${d.anomalies}`;
        return str;
      }).join('\n')
    : 'Aucun devis transmis';

  const devisNonAnalysesStr = devisNonAnalyses.length > 0
    ? `⚠ ${devisNonAnalyses.length} devis sans analyse IA : ${devisNonAnalyses.map(d => `"${d.nom}"`).join(', ')}`
    : 'Tous les devis sont analysés';

  const elementsProjetStr = elementsProjet.length > 0
    ? elementsProjet.join(', ')
    : 'non détectés (description insuffisante)';

  const coherenceLines: string[] = [];
  if (devisMalAffectes.length > 0) {
    coherenceLines.push(`⚠ AFFECTATION DOUTEUSE — ${devisMalAffectes.length} devis possiblement mal affectés :`);
    for (const d of devisMalAffectes) {
      coherenceLines.push(`  - "${d.nom}" (type détecté: ${d.type}) est affecté au lot "${d.lotNom}" (type: ${d.lotType}) — à vérifier`);
    }
  }
  if (devisNonAffectes.length > 0) {
    coherenceLines.push(`ℹ ${devisNonAffectes.length} devis non affecté(s) à un lot : ${devisNonAffectes.map(d => `"${d.nom}"`).join(', ')}`);
  }
  const coherenceStr = coherenceLines.length > 0
    ? coherenceLines.join('\n')
    : 'OK — tous les devis sont affectés et cohérents avec leurs lots';

  const planningStr = planning.length > 0
    ? planning.map(p => `- ${p.phase}: ${p.statut}`).join('\n')
    : 'Non précisé';

  const userMessage = `Analyse les données suivantes :

[PROJET] ${description || 'Non précisé'}

[ELEMENTS_PROJET] ${elementsProjetStr}

[COHERENCE_DEVIS]
${coherenceStr}

[INTERVENANTS]
${lotsStr}

[DEVIS] (${devisCount} total, ${devisAnalyses.length} analysés, ${devisNonAnalyses.length} non analysés, ${lotsNoDev} lots sans devis)
${devisStr}

[DEVIS_NON_ANALYSÉS]
${devisNonAnalysesStr}

[BUDGET] ${budgetStr}

[PLANNING]
${planningStr}

Retourne UNIQUEMENT ce JSON (pas de markdown, pas de texte avant ou après) :
{
  "action_prioritaire": {
    "titre": "titre concret (max 10 mots)",
    "raison": "explication avec chiffres si dispo (max 20 mots)",
    "cta": "libellé bouton action"
  },
  "insights": [
    "observation concrète avec chiffres (max 20 mots)",
    "observation concrète avec chiffres (max 20 mots)"
  ],
  "alertes": [
    {
      "type": "critique | risque | opportunité",
      "message": "message précis avec montants/% si dispo (max 20 mots)",
      "cta": "action"
    }
  ],
  "conseil_metier": "conseil terrain actionnable avec contexte spécifique (max 25 mots)",
  "propositions": [
    {
      "id": "prop_1",
      "titre": "Proposition courte (max 8 mots)",
      "description": "Je peux... / Voulez-vous que je... (max 20 mots)",
      "action_type": "analyse_devis | budget_review | add_devis",
      "cta_oui": "Oui, lancer",
      "cta_non": "Non merci"
    }
  ]
}

IMPORTANT : Ne génère la section "propositions" que si tu as une proposition concrète. Si aucune proposition pertinente, mets "propositions": [].`;

  // ── Appel Gemini 2.0-flash ────────────────────────────────────────────────

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${googleApiKey}`,
        },
        body: JSON.stringify({
          model: 'gemini-2.0-flash',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: userMessage   },
          ],
          max_tokens: 1024,
          temperature: 0.2, // bas pour rester factuel
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[api/chantier/assistant] Gemini ${res.status}:`, errText.slice(0, 200));
      throw new Error(`Gemini ${res.status}`);
    }

    const gemini  = await res.json();
    const rawText = gemini.choices?.[0]?.message?.content ?? '';

    if (!rawText) throw new Error('Empty reply from Gemini');

    // Parse le JSON retourné par Gemini (il peut y avoir des backticks résiduels)
    const cleaned = rawText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    let result: AssistantResult;

    try {
      result = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[api/chantier/assistant] JSON parse error:', parseErr, '\nRaw:', cleaned.slice(0, 300));
      throw new Error('Invalid JSON from Gemini');
    }

    return jsonOk(result);

  } catch (e) {
    console.error('[api/chantier/assistant] error:', (e as Error).message);
    return jsonError('Service temporairement indisponible', 503);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
