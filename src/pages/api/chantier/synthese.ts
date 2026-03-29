export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, parseJsonBody } from '@/lib/apiHelpers';

// ── Config ────────────────────────────────────────────────────────────────────

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

/** POST /api/chantier/synthese
 *  Génère une synthèse courte du chantier via Gemini.
 *  Body : SyntheseRequestBody
 *  Retourne : { synthese: string }
 */

interface SyntheseRequestBody {
  nom:              string;
  budgetTotal:      number;
  dureeEstimeeMois: number;
  lignesBudget:     { label: string; montant: number }[];
  roadmap:          { nom: string; detail: string; phase: string; isCurrent: boolean }[];
  nbDocuments:      number;
  docBreakdown:     { devis: number; factures: number; photos: number; autres: number };
  totalEngage:      number;
  totalPaye:        number;
}

export const POST: APIRoute = async ({ request }) => {
  const googleApiKey = import.meta.env.GOOGLE_AI_API_KEY ?? import.meta.env.GOOGLE_API_KEY;
  if (!googleApiKey) {
    return jsonError('Clé API Google AI non configurée', 500);
  }

  const body = await parseJsonBody<SyntheseRequestBody>(request);
  if (body instanceof Response) return body;
  if (!body.nom) {
    return jsonError('Corps de requête invalide', 400);
  }

  const { nom, budgetTotal, dureeEstimeeMois, lignesBudget, roadmap,
          nbDocuments, docBreakdown, totalEngage, totalPaye } = body;

  const currentStep = roadmap?.find((e) => e.isCurrent);
  const lotsStr = lignesBudget
    .slice(0, 6)
    .map((l) => `${l.label} (${l.montant.toLocaleString('fr-FR')} €)`)
    .join(', ');

  const prompt = `Tu es un assistant de pilotage de chantier. Génère une synthèse TRÈS COURTE du chantier en français.

DONNÉES :
- Nom : ${nom}
- Budget estimé : ${budgetTotal.toLocaleString('fr-FR')} €
- Durée estimée : ${dureeEstimeeMois} mois
- Lots de travaux : ${lignesBudget.length} lots — ${lotsStr}
- Phase actuelle : ${currentStep ? `${currentStep.nom} — ${currentStep.detail}` : 'Non déterminée'}
- Documents : ${nbDocuments} total (${docBreakdown.devis} devis, ${docBreakdown.factures} factures, ${docBreakdown.photos} photos)
- Budget engagé : ${totalEngage > 0 ? totalEngage.toLocaleString('fr-FR') + ' €' : 'non renseigné'}
- Déjà payé : ${totalPaye > 0 ? totalPaye.toLocaleString('fr-FR') + ' €' : 'non renseigné'}

RÈGLES DE RÉDACTION :
- Maximum 3 phrases, 90 mots au total
- Mettre en gras (**texte**) les chiffres et éléments clés
- Ton professionnel et pragmatique, pas de fioritures
- Terminer par une recommandation actionnable courte
- Pas de bullet points, texte continu`;

  try {
    const apiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${googleApiKey}`,
      },
      body: JSON.stringify({
        model: 'gemini-2.0-flash',
        temperature: 0.4,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!apiRes.ok) {
      const err = await apiRes.text().catch(() => '');
      console.error('[api/chantier/synthese] Gemini error:', apiRes.status, err.substring(0, 200));
      return jsonError('Erreur API IA', 502);
    }

    const apiData = await apiRes.json();
    const synthese: string = apiData?.choices?.[0]?.message?.content?.trim() ?? '';

    if (!synthese) {
      return jsonError('Réponse vide', 502);
    }

    return jsonOk({ synthese });

  } catch (e) {
    console.error('[api/chantier/synthese] Unexpected error:', e instanceof Error ? e.message : e);
    return jsonError('Erreur inattendue', 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
