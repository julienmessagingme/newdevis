export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireAuth, parseJsonBody } from '@/lib/apiHelpers';

const googleApiKey    = import.meta.env.GOOGLE_API_KEY ?? import.meta.env.GOOGLE_AI_API_KEY;

/** POST /api/chantier/conseils — Génère des conseils de maître d'œuvre via Gemini */
export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;

  if (!googleApiKey) {
    return jsonError('Clé API non configurée', 500);
  }

  // ── Body ─────────────────────────────────────────────────────────────────
  const body = await parseJsonBody<{
    nomChantier?: string;
    lignesBudget?: { label: string; montant: number }[];
    lots?: { nom: string; role?: string; statut?: string }[];
    artisans?: { metier: string; role?: string }[];
    roadmap?: { nom: string; detail: string; isCurrent?: boolean }[];
  }>(request);
  if (body instanceof Response) return body;

  const { nomChantier = '', lignesBudget = [], lots = [], artisans = [], roadmap = [] } = body;

  // Construire la liste des lots (depuis lots DB ou depuis artisans fallback)
  const lotsStr = lots.length > 0
    ? lots.map((l, i) => `Lot ${i + 1} : "${l.nom}"${l.role ? ` — ${l.role}` : ''}`).join('\n')
    : artisans.map((a, i) => `Lot ${i + 1} : "${a.metier}"${a.role ? ` — ${a.role}` : ''}`).join('\n');

  const budgetStr = lignesBudget
    .map((l) => `${l.label} : ${l.montant.toLocaleString('fr-FR')} €`)
    .join(', ');

  const currentStep = roadmap.find((e) => e.isCurrent);
  const stepStr = currentStep ? `Étape actuelle : ${currentStep.nom} — ${currentStep.detail}.` : '';

  // ── Prompt maître d'œuvre ────────────────────────────────────────────────
  const prompt = `
Tu es un maître d'œuvre professionnel avec 20 ans d'expérience.
Projet : "${nomChantier || 'chantier travaux'}".
${stepStr}
Lots de travaux :
${lotsStr || 'Non précisés'}
Budget : ${budgetStr || 'Non précisé'}.

Analyse ce chantier en expert et génère entre 3 et 5 conseils CONCRETS, SPÉCIFIQUES À CES LOTS.
Chaque conseil doit citer les lots concernés par leur nom exact.

Types de conseils (utilise les plus pertinents pour CE projet) :
- "ordre" : séquence d'intervention optimale et pourquoi (dépendances techniques entre lots)
- "synergie" : deux lots à coordonner pour économiser temps/argent/déplacements
- "technique" : point technique CRITIQUE à anticiper AVANT qu'il soit trop tard (ex : gaines avant coulage béton)
- "economie" : économie concrète réalisable en combinant des interventions ou groupements d'achats
- "risque" : vigilance ou problème à anticiper sur ce type de chantier

Règles :
- Cite toujours les noms des lots concernés
- Sois direct et professionnel, comme si tu parlais à un client devant le chantier
- Le "detail" doit faire 30 à 60 mots
- PAS de conseils génériques du type "bien choisir son artisan"
- Pour CHAQUE conseil de type "economie" ET pour tout conseil permettant une économie concrète,
  estime une fourchette d'économie réaliste en euros (economie_potentielle).
  Pour les autres types sans économie mesurable, mettre null.

Réponds UNIQUEMENT en JSON valide sans markdown :
{
  "conseils": [
    {
      "type": "ordre|synergie|technique|economie|risque",
      "emoji": "emoji adapté",
      "titre": "titre court (6-8 mots max)",
      "detail": "explication concrète (30-60 mots, avec noms des lots)",
      "economie_potentielle": { "min": 300, "max": 800 }
    }
  ]
}
Note : economie_potentielle peut être null pour les types sans économie chiffrable.
`.trim();

  // ── Gemini ────────────────────────────────────────────────────────────────
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
          model: 'gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1024,
          response_format: { type: 'json_object' },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[api/chantier/conseils] Gemini ${res.status}:`, errText.slice(0, 200));
      throw new Error(`Gemini ${res.status}`);
    }

    const gemini = await res.json();
    const raw    = gemini.choices?.[0]?.message?.content ?? '{}';

    let parsed: { conseils?: { type: string; emoji: string; titre: string; detail: string; economie_potentielle?: { min: number; max: number } | null }[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('[api/chantier/conseils] JSON parse error, raw:', raw.slice(0, 200));
      throw new Error('JSON parse error');
    }

    const conseils = Array.isArray(parsed.conseils)
      ? parsed.conseils
          .filter((c) => c && typeof c.titre === 'string' && typeof c.detail === 'string')
          .slice(0, 5)
      : [];

    if (conseils.length === 0) throw new Error('No conseils returned');

    return jsonOk({ conseils });
  } catch (e) {
    console.error('[api/chantier/conseils] error:', (e as Error).message);
    return jsonError('Service temporairement indisponible', 503);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
