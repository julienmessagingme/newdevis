export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

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

interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

interface LotInfo {
  nom: string;
  role?: string;
  statut?: string;
  budget_min_ht?: number | null;
  budget_avg_ht?: number | null;
  budget_max_ht?: number | null;
}

interface DocumentInfo {
  name: string;
  type: string;
  analysisResume?: string;
  analysisScore?: string;
}

interface ChatRequestBody {
  message: string;
  history: ChatHistoryItem[];
  context: {
    nom: string;
    description?: string;
    typeProjet?: string;
    budgetTotal?: number;
    dureeEstimeeMois?: number;
    lignesBudget?: { label: string; montant: number }[];
    lots?: LotInfo[];
    formalites?: { nom: string; detail: string; obligatoire: boolean }[];
    aides?: { nom: string; detail: string; montant: number | null; eligible: boolean }[];
    roadmap?: { nom: string; detail: string; mois: string; isCurrent: boolean }[];
    prochaineAction?: { titre: string; detail: string; deadline?: string };
    codePostal?: string;
  };
  documents?: DocumentInfo[];
}

/** POST /api/chantier/chat — Assistant maître d'œuvre branché sur Gemini 2.0-flash */
export const POST: APIRoute = async ({ request }) => {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });
  }

  const token    = authHeader.slice(7);
  const supabase = getSupabase();

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 401, headers: CORS });
  }

  if (!googleApiKey) {
    return new Response(JSON.stringify({ error: 'Clé API non configurée' }), { status: 500, headers: CORS });
  }

  // ── Body ─────────────────────────────────────────────────────────────────
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers: CORS });
  }

  const { message, history = [], context, documents = [] } = body;

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'Message vide' }), { status: 400, headers: CORS });
  }

  // ── Construire le contexte projet ─────────────────────────────────────────
  const lots = context.lots ?? [];
  const lotsStr = lots.length > 0
    ? lots.map((l, i) => {
        const budgetPart = l.budget_avg_ht != null
          ? ` (budget estimé : ${l.budget_avg_ht.toLocaleString('fr-FR')} € HT)`
          : '';
        return `  - Lot ${i + 1} : "${l.nom}"${l.role ? ` — ${l.role}` : ''}${budgetPart} [statut : ${l.statut ?? 'à trouver'}]`;
      }).join('\n')
    : '  Non précisés';

  const budgetStr = (context.lignesBudget ?? []).length > 0
    ? (context.lignesBudget ?? []).map((l) => `  - ${l.label} : ${l.montant.toLocaleString('fr-FR')} €`).join('\n')
    : `  Budget total estimé : ${(context.budgetTotal ?? 0).toLocaleString('fr-FR')} €`;

  const formalitesStr = (context.formalites ?? []).length > 0
    ? (context.formalites ?? []).map((f) => `  - ${f.nom}${f.obligatoire ? ' (OBLIGATOIRE)' : ''} : ${f.detail}`).join('\n')
    : '  Aucune formalité identifiée';

  const aidesStr = (context.aides ?? []).filter((a) => a.eligible).length > 0
    ? (context.aides ?? []).filter((a) => a.eligible).map((a) => {
        const montantStr = a.montant != null ? ` (jusqu'à ${a.montant.toLocaleString('fr-FR')} €)` : '';
        return `  - ${a.nom}${montantStr} : ${a.detail}`;
      }).join('\n')
    : '  Aucune aide éligible identifiée';

  const roadmapStr = (context.roadmap ?? []).length > 0
    ? (context.roadmap ?? []).map((e) => `  - ${e.mois} : ${e.nom}${e.isCurrent ? ' ← ÉTAPE ACTUELLE' : ''} — ${e.detail}`).join('\n')
    : '  Non précisé';

  const prochaineActionStr = context.prochaineAction
    ? `${context.prochaineAction.titre} — ${context.prochaineAction.detail}${context.prochaineAction.deadline ? ` (avant le ${context.prochaineAction.deadline})` : ''}`
    : 'Non précisée';

  const docsStr = documents.length > 0
    ? documents.map((d) => {
        let info = `  - ${d.name} (${d.type})`;
        if (d.analysisResume) info += ` → Analyse : ${d.analysisResume}`;
        if (d.analysisScore) info += ` [Score : ${d.analysisScore}]`;
        return info;
      }).join('\n')
    : '  Aucun document transmis';

  // ── System prompt maître d'œuvre ──────────────────────────────────────────
  const systemPrompt = `Tu es un maître d'œuvre expérimenté avec plus de 20 ans d'expérience dans la gestion de chantiers de rénovation et de construction pour les particuliers.
Ton rôle est d'accompagner un client dans la gestion complète de son chantier.
Tu dois agir comme un conseiller technique et administratif fiable.

Tu as accès aux informations suivantes sur le projet du client :

PROJET : ${context.nom}
Type : ${context.typeProjet ?? 'travaux'}
Description des travaux : ${context.description ?? 'Non précisée'}
Code postal : ${context.codePostal ?? 'Non précisé'}
Budget total estimé : ${(context.budgetTotal ?? 0).toLocaleString('fr-FR')} €
Durée estimée : ${context.dureeEstimeeMois ?? '?'} mois

LOTS DE TRAVAUX :
${lotsStr}

DÉTAIL BUDGET :
${budgetStr}

PLANNING ET ÉTAT D'AVANCEMENT :
${roadmapStr}

PROCHAINE DÉCISION À PRENDRE :
${prochaineActionStr}

FORMALITÉS ADMINISTRATIVES :
${formalitesStr}

AIDES ET FINANCEMENTS ÉLIGIBLES :
${aidesStr}

DEVIS ANALYSÉS ET DOCUMENTS TÉLÉCHARGÉS :
${docsStr}

Tu dois utiliser ces informations pour répondre de façon contextualisée au projet.

RÈGLES DE COMPORTEMENT :
1. Tes réponses doivent être claires, pratiques et utiles.
2. Évite les réponses génériques — appuie-toi sur les données du projet ci-dessus.
3. Si une règle administrative existe, cite une source officielle (service-public.fr).
4. Si une action est nécessaire, explique pourquoi.
5. Parle en "vous" de façon professionnelle et chaleureuse.
6. Tu peux utiliser du markdown (gras, listes) pour structurer ta réponse.

STRUCTURE DE RÉPONSE :
- **Réponse directe** à la question posée
- **Explication courte** si nécessaire
- **Action recommandée** parmi : générer un document, télécharger un modèle, comparer des devis, vérifier une règle administrative, proposer la prochaine étape du chantier

COMPORTEMENTS SPÉCIAUX :
- Si l'utilisateur demande un document (accord de voisinage, déclaration préalable, comparaison devis, etc.) : génère un modèle complet et structuré que l'utilisateur pourra télécharger.
- Si l'utilisateur pose une question sur un devis : utilise les données d'analyse disponibles et donne un avis objectif.
- Si l'utilisateur demande conseil sur un choix technique (matériau, équipement, technique) : explique les avantages et inconvénients en lien avec son projet.

Tu es un copilote de chantier, pas un chatbot généraliste. Ton objectif est d'aider le client à sécuriser son chantier, éviter les erreurs et prendre les bonnes décisions.`;

  // ── Construire l'historique de conversation pour Gemini ────────────────────
  const messages: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];

  // Historique précédent (on convertit 'assistant' → 'model' pour Gemini natif)
  // On utilise le format OpenAI-compatible donc on garde 'assistant'
  const openAiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Ajouter l'historique (on limite à 10 derniers échanges pour ne pas dépasser le contexte)
  const recentHistory = history.slice(-20);
  for (const msg of recentHistory) {
    openAiMessages.push({ role: msg.role, content: msg.content });
  }

  // Ajouter le message courant
  openAiMessages.push({ role: 'user', content: message });

  // ── Appel Gemini ──────────────────────────────────────────────────────────
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
          messages: openAiMessages,
          max_tokens: 1024,
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[api/chantier/chat] Gemini ${res.status}:`, errText.slice(0, 200));
      throw new Error(`Gemini ${res.status}`);
    }

    const gemini = await res.json();
    const reply  = gemini.choices?.[0]?.message?.content ?? '';

    if (!reply) throw new Error('Empty reply from Gemini');

    return new Response(JSON.stringify({ reply }), { status: 200, headers: CORS });
  } catch (e) {
    console.error('[api/chantier/chat] error:', (e as Error).message);
    return new Response(
      JSON.stringify({ error: 'Service temporairement indisponible' }),
      { status: 503, headers: CORS },
    );
  }
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS' } });
