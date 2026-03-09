export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { SYSTEM_PROMPT_CHANTIER } from '@/lib/prompts/chantier-ia';
import type { ChantierIAResult, SseEvent } from '@/types/chantier-ia';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const anthropicApiKey = import.meta.env.ANTHROPIC_API_KEY;

const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

function encodeEvent(data: SseEvent): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** POST /api/chantier/generer — Génération IA via SSE */
export const POST: APIRoute = async ({ request }) => {
  // Auth
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }
  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 401 });
  }

  if (!anthropicApiKey) {
    return new Response(JSON.stringify({ error: 'Clé API Anthropic non configurée' }), { status: 500 });
  }

  let body: { description?: string; mode?: string; guidedForm?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide' }), { status: 400 });
  }

  const { description, mode, guidedForm } = body;

  // Construire le prompt
  let prompt = description ?? '';
  if (mode === 'guide' && guidedForm) {
    const parts: string[] = [];
    if (guidedForm.typeProjet) parts.push(`Type de projet : ${guidedForm.typeProjet}`);
    if (guidedForm.budget) parts.push(`Budget estimé : ${Number(guidedForm.budget).toLocaleString('fr-FR')} €`);
    if (guidedForm.financement) {
      const fin = guidedForm.financement as string;
      const duree = guidedForm.dureeCredit ? ` sur ${guidedForm.dureeCredit}` : '';
      parts.push(`Financement : ${fin}${fin !== 'apport' ? duree : ''}`);
    }
    if (guidedForm.dateLabelFr) parts.push(`Date de début souhaitée : ${guidedForm.dateLabelFr}`);
    prompt = parts.join('\n');
  }

  if (!prompt.trim()) {
    return new Response(JSON.stringify({ error: 'Description du projet requise' }), { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SseEvent) => {
        controller.enqueue(encoder.encode(encodeEvent(event)));
      };

      try {
        send({ type: 'step', step: 0, status: 'active', detail: 'Identification des travaux…' });
        send({ type: 'progress', pct: 5 });

        // Appel Anthropic
        const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropicApiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2500,
            system: SYSTEM_PROMPT_CHANTIER,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!apiResponse.ok) {
          const errText = await apiResponse.text();
          console.error('[api/chantier/generer] Anthropic error:', errText.slice(0, 200));
          send({ type: 'error', message: 'Génération échouée, veuillez réessayer' });
          controller.close();
          return;
        }

        const apiData = await apiResponse.json();

        send({ type: 'step', step: 0, status: 'done', detail: 'Projet analysé ✓' });
        send({ type: 'step', step: 1, status: 'active', detail: 'Construction du plan…' });
        send({ type: 'progress', pct: 30 });
        await delay(250);

        send({ type: 'step', step: 1, status: 'done', detail: 'Roadmap créée ✓' });
        send({ type: 'step', step: 2, status: 'active', detail: 'Estimation budget par poste…' });
        send({ type: 'progress', pct: 55 });
        await delay(200);

        send({ type: 'step', step: 2, status: 'done', detail: 'Budget estimé ✓' });
        send({ type: 'step', step: 3, status: 'active', detail: 'Formalités + artisans détectés…' });
        send({ type: 'progress', pct: 75 });
        await delay(200);

        send({ type: 'step', step: 3, status: 'done', detail: 'Formalités et artisans ✓' });
        send({ type: 'step', step: 4, status: 'active', detail: 'Génération checklist…' });
        send({ type: 'progress', pct: 90 });
        await delay(150);

        send({ type: 'step', step: 4, status: 'done', detail: 'Checklist + aides ✓' });
        send({ type: 'progress', pct: 100 });

        // Parser la réponse IA
        const rawText: string =
          apiData?.content?.[0]?.type === 'text' ? apiData.content[0].text : '';
        const clean = rawText.replace(/```json|```/g, '').trim();

        let parsed: ChantierIAResult;
        try {
          parsed = JSON.parse(clean);
        } catch {
          console.error('[api/chantier/generer] JSON parse error. Raw:', clean.slice(0, 300));
          send({ type: 'error', message: 'Erreur de parsing de la réponse IA' });
          controller.close();
          return;
        }

        const result: ChantierIAResult = {
          ...parsed,
          promptOriginal: prompt,
          generatedAt: new Date().toISOString(),
        };

        send({ type: 'result', data: result });
      } catch (err) {
        console.error('[api/chantier/generer] Unexpected error:', err instanceof Error ? err.message : String(err));
        send({ type: 'error', message: 'Génération échouée, veuillez réessayer' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
};

export const OPTIONS: APIRoute = () =>
  new Response(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS' },
  });
