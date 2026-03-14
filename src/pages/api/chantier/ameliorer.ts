export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { SYSTEM_PROMPT_UPDATE } from '@/lib/prompts/chantier-ia';
import type { ArtisanIA, FormaliteIA, TacheIA, ChangeItem } from '@/types/chantier-ia';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const googleApiKey = import.meta.env.GOOGLE_AI_API_KEY ?? import.meta.env.GOOGLE_API_KEY;

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

/** POST /api/chantier/ameliorer — Amélioration IA d'un chantier existant */
export const POST: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });
  }

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 401, headers: CORS });
  }

  if (!googleApiKey) {
    return new Response(JSON.stringify({ error: 'Clé API Google AI non configurée' }), { status: 500, headers: CORS });
  }

  let body: { chantierId: string; modification: string };
  try {
    body = await request.json();
    if (!body.chantierId || !body.modification) throw new Error('champs manquants');
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide' }), { status: 400, headers: CORS });
  }

  // Vérifier ownership
  const { data: chantier, error: findError } = await supabase
    .from('chantiers')
    .select('id, nom, budget, metadonnees')
    .eq('id', body.chantierId)
    .eq('user_id', user.id)
    .single();

  if (findError || !chantier) {
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });
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
      model: 'gemini-2.0-flash',
      temperature: 0.2,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_UPDATE },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!apiResponse.ok) {
    return new Response(JSON.stringify({ error: 'Erreur API Anthropic' }), { status: 500, headers: CORS });
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
    return new Response(JSON.stringify({ error: 'Erreur de parsing IA' }), { status: 500, headers: CORS });
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

  return new Response(
    JSON.stringify({
      success: true,
      message: updateData.messageReponse ?? 'Plan mis à jour !',
      changes: updateData.changes ?? [],
      updatedFields: updateData.updatedFields ?? {},
      newArtisans: updateData.newArtisans ?? [],
      newFormalites: updateData.newFormalites ?? [],
      newTaches: updateData.newTaches ?? [],
    }),
    { status: 200, headers: CORS }
  );
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS' } });
