export const prerender = false;

import type { APIRoute } from 'astro';

// ── Config ────────────────────────────────────────────────────────────────────

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

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
  const googleApiKey = import.meta.env.GOOGLE_AI_API_KEY;
  if (!googleApiKey) {
    return new Response(JSON.stringify({ error: 'Clé API Google AI non configurée' }), { status: 500, headers: CORS });
  }

  let body: SyntheseRequestBody;
  try {
    body = await request.json();
    if (!body.nom) throw new Error('champ nom manquant');
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide' }), { status: 400, headers: CORS });
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
      return new Response(JSON.stringify({ error: 'Erreur API IA' }), { status: 502, headers: CORS });
    }

    const apiData = await apiRes.json();
    const synthese: string = apiData?.choices?.[0]?.message?.content?.trim() ?? '';

    if (!synthese) {
      return new Response(JSON.stringify({ error: 'Réponse vide' }), { status: 502, headers: CORS });
    }

    return new Response(JSON.stringify({ synthese }), { status: 200, headers: CORS });

  } catch (e) {
    console.error('[api/chantier/synthese] Unexpected error:', e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: 'Erreur inattendue' }), { status: 500, headers: CORS });
  }
};

export const OPTIONS: APIRoute = () =>
  new Response(null, {
    status: 204,
    headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS' },
  });
