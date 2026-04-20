export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireAuth, parseJsonBody } from '@/lib/apiHelpers';
import { SYSTEM_PROMPT_UPDATE } from '@/lib/prompts/chantier-ia';
import type { ArtisanIA, FormaliteIA, TacheIA, ChangeItem } from '@/types/chantier-ia';

const googleApiKey = import.meta.env.GOOGLE_AI_API_KEY ?? import.meta.env.GOOGLE_API_KEY;

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

/** POST /api/chantier/ameliorer — Amélioration IA d'un chantier existant */
export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  if (!googleApiKey) {
    return jsonError('Clé API Google AI non configurée', 500);
  }

  const body = await parseJsonBody<{ chantierId: string; modification: string }>(request);
  if (body instanceof Response) return body;
  if (!body.chantierId || !body.modification) {
    return jsonError('Corps de requête invalide', 400);
  }

  // Vérifier ownership
  const { data: chantier, error: findError } = await supabase
    .from('chantiers')
    .select('id, nom, budget, metadonnees')
    .eq('id', body.chantierId)
    .eq('user_id', user.id)
    .single();

  if (findError || !chantier) {
    return jsonError('Chantier introuvable', 404);
  }

  const prompt = `
Chantier actuel : ${chantier.nom} (budget : ${chantier.budget}€)
Modification demandée : ${body.modification}
Contexte actuel : ${chantier.metadonnees ?? '{}'}
  `.trim();

  const apiResponse = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${googleApiKey}`,
    },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      temperature: 0.2,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_UPDATE },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!apiResponse.ok) {
    return jsonError('Erreur API Anthropic', 500);
  }

  const apiData = await apiResponse.json();
  const rawText: string = apiData?.choices?.[0]?.message?.content ?? '{}';
  const clean = rawText.replace(/```json|```/g, '').trim();

  let updateData: {
    changes?: ChangeItem[];
    updatedFields?: Record<string, number>;
    newArtisans?: ArtisanIA[];
    newFormalites?: FormaliteIA[];
    newTaches?: TacheIA[];
    messageReponse?: string;
  };

  try {
    updateData = JSON.parse(clean);
  } catch {
    console.error('[api/chantier/ameliorer] JSON parse error:', clean.slice(0, 200));
    return jsonError('Erreur de parsing IA', 500);
  }

  // Appliquer les changements en DB
  const updates: Record<string, unknown> = {};
  if (updateData.updatedFields?.budgetTotal) {
    updates.budget = updateData.updatedFields.budgetTotal;
  }

  // Mettre à jour metadonnees avec nouveaux artisans/formalites
  if (updateData.newArtisans?.length || updateData.newFormalites?.length || updateData.updatedFields?.dureeEstimeeMois) {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(chantier.metadonnees ?? '{}');
    } catch { /* ignore */ }

    if (updateData.newArtisans?.length) {
      meta.artisans = [...((meta.artisans as ArtisanIA[]) ?? []), ...updateData.newArtisans];
    }
    if (updateData.newFormalites?.length) {
      meta.formalites = [...((meta.formalites as FormaliteIA[]) ?? []), ...updateData.newFormalites];
    }
    if (updateData.updatedFields?.dureeEstimeeMois) {
      meta.dureeEstimeeMois = updateData.updatedFields.dureeEstimeeMois;
    }
    updates.metadonnees = JSON.stringify(meta);
  }

  if (Object.keys(updates).length) {
    const { error: updateError } = await supabase
      .from('chantiers')
      .update(updates)
      .eq('id', body.chantierId);
    if (updateError) {
      console.error('[api/chantier/ameliorer] update error:', updateError.message);
    }
  }

  // Nouveaux todos
  if (updateData.newTaches?.length) {
    const { count } = await supabase
      .from('todo_chantier')
      .select('*', { count: 'exact', head: true })
      .eq('chantier_id', body.chantierId);

    await supabase.from('todo_chantier').insert(
      updateData.newTaches.map((t, i) => ({
        chantier_id: body.chantierId,
        titre: t.titre,
        priorite: t.priorite,
        done: false,
        ordre: (count ?? 0) + i,
      }))
    );
  }

  // Logger la mise à jour
  await supabase.from('chantier_updates').insert({
    chantier_id: body.chantierId,
    modification: body.modification,
    changes: JSON.stringify(updateData.changes ?? []),
  });

  return jsonOk({
    success: true,
    message: updateData.messageReponse ?? 'Plan mis à jour !',
    changes: updateData.changes ?? [],
    updatedFields: updateData.updatedFields ?? {},
    newArtisans: updateData.newArtisans ?? [],
    newFormalites: updateData.newFormalites ?? [],
    newTaches: updateData.newTaches ?? [],
  });
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
