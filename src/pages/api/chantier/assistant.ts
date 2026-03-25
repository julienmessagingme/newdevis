/**
 * POST /api/chantier/assistant
 * Analyse contextuelle IA — retourne un JSON structuré (action_prioritaire, insights, alertes, conseil_metier).
 * Propulsé par Gemini 2.0-flash. Cohérent avec les analyses de devis de la plateforme.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { extractProjectElements, detectDevisType } from '@/utils/extractProjectElements';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const googleApiKey    = import.meta.env.GOOGLE_API_KEY ?? import.meta.env.GOOGLE_AI_API_KEY;

function getSupabase() {
  return createClient(supabaseUrl, supabaseService);
}

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
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un maître d'œuvre avec 20 ans d'expérience en travaux.
Tu es propulsé par Gemini 2.0, la même intelligence artificielle utilisée sur la plateforme pour analyser les devis travaux. Tu dois garantir une cohérence totale avec les analyses réalisées (prix, anomalies, fiabilité).
Ton rôle :
Aider un particulier à piloter son chantier simplement, comme le ferait un vrai maître d'œuvre.
Tu dois être :
* concret
* direct
* utile immédiatement
Règles STRICTES :
* Pas de blabla
* Pas de phrases longues
* Maximum 12 mots par message
* Toujours orienté action
* Ne jamais inventer d'informations
* Utiliser uniquement les données fournies
* Être cohérent avec les analyses de devis existantes (scores, prix marché, anomalies)
* Si une donnée est manquante → le signaler clairement
LOGIQUE MÉTIER :
* 0 devis → chantier bloqué → critique
* 1 devis → insuffisant → risque
* ≥2 devis → comparaison possible → OK
* devis > budget → alerte dépassement
* devis cohérent marché → validation possible
RÈGLE COHÉRENCE (PRIORITAIRE) :
* Si [COHERENCE_DEVIS] contient "INCOHÉRENCE DÉTECTÉE" :
  - Ne jamais valider ces devis
  - Générer une alerte de type "critique" pour chaque devis hors périmètre
  - Format exact : { "type": "critique", "message": "Devis [nom] hors périmètre projet", "cta": "Vérifier" }
  - Proposer 2 actions dans conseil_metier : corriger le projet OU supprimer le devis
* Si tous les devis sont cohérents → ne pas générer d'alerte cohérence
Toujours :
* expliquer simplement
* guider vers UNE action claire
* rester concret chantier (pas théorique)
IMPORTANT :
Ton objectif est d'être utile, pas intelligent.
Tu es un maître d'œuvre terrain, pas un assistant générique.
Réponds UNIQUEMENT avec un JSON valide, sans balises markdown, sans commentaires.`;

// ── Handler ───────────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request }) => {
  // Auth
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ') && supabaseService) {
    const token    = authHeader.slice(7);
    const supabase = getSupabase();
    const { error } = await supabase.auth.getUser(token);
    if (error) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });
    }
  }

  if (!googleApiKey) {
    return new Response(JSON.stringify({ error: 'Clé API non configurée' }), { status: 500, headers: CORS });
  }

  let body: AssistantRequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers: CORS });
  }

  const { description, lots = [], devis = [], budgetMin, budgetMax, planning = [] } = body;

  // ── Détection des éléments du projet ──────────────────────────────────────

  const elementsProjet = extractProjectElements(description ?? '');

  // Enrichir chaque devis avec son type détecté
  const devisEnrichis = devis.map(d => ({
    ...d,
    type: detectDevisType(d.nom),
  }));

  // Détecter les incohérences : devis dont le type n'est pas dans les éléments projet
  // (on ignore 'autre' — pas assez d'info pour trancher)
  const devisHorsProjet = elementsProjet.length > 0
    ? devisEnrichis.filter(d => d.type !== 'autre' && !elementsProjet.includes(d.type))
    : [];

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

  const devisStr = devisEnrichis.length > 0
    ? devisEnrichis.map(d => {
        let str = `- ${d.nom} [type: ${d.type}]`;
        if (d.montant != null) str += ` (${Math.round(d.montant / 1000)}k€)`;
        if (d.analysisScore) str += ` [score: ${d.analysisScore}]`;
        if (d.anomalies) str += ` ⚠ ${d.anomalies}`;
        return str;
      }).join('\n')
    : 'Aucun devis transmis';

  const elementsProjetStr = elementsProjet.length > 0
    ? elementsProjet.join(', ')
    : 'non détectés (description insuffisante)';

  const coherenceStr = devisHorsProjet.length > 0
    ? `⚠ INCOHÉRENCE DÉTECTÉE — ${devisHorsProjet.length} devis hors périmètre projet :\n` +
      devisHorsProjet.map(d => `  - "${d.nom}" (type: ${d.type}) n'appartient pas au projet`).join('\n')
    : 'OK — tous les devis sont cohérents avec le périmètre projet';

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

[DEVIS] (${devisCount} total, ${lotsNoDev} lots sans devis)
${devisStr}

[BUDGET] ${budgetStr}

[PLANNING]
${planningStr}

Retourne UNIQUEMENT ce JSON (pas de markdown, pas de texte avant ou après) :
{
  "action_prioritaire": {
    "titre": "titre court (max 8 mots)",
    "raison": "explication courte (max 12 mots)",
    "cta": "libellé du bouton d'action"
  },
  "insights": [
    "insight 1 (max 12 mots)",
    "insight 2 (max 12 mots)",
    "insight 3 (max 12 mots)"
  ],
  "alertes": [
    {
      "type": "critique | risque | opportunité",
      "message": "message court (max 12 mots)",
      "cta": "action"
    }
  ],
  "conseil_metier": "conseil terrain concret (max 20 mots)"
}`;

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
          max_tokens: 512,
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

    return new Response(JSON.stringify(result), { status: 200, headers: CORS });

  } catch (e) {
    console.error('[api/chantier/assistant] error:', (e as Error).message);
    return new Response(
      JSON.stringify({ error: 'Service temporairement indisponible' }),
      { status: 503, headers: CORS },
    );
  }
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS' } });
