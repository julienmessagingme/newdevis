export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, parseJsonBody, createServiceClient } from '@/lib/api/apiHelpers';
import { requireAdmin } from '@/lib/auth/adminAuth';

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const id = params.id;
  if (!id) return jsonError('Missing template id', 400);

  try {
    const sb = createServiceClient();
    const { data, error } = await sb.rpc('get_marketing_template', { p_id: id });

    if (error) {
      console.error('[marketing/templates/:id GET] RPC error:', error.message, error.code);
      return jsonError(error.message || 'Erreur Supabase', 500);
    }
    if (!data) return jsonError('Template non trouvé', 404);

    const template = {
      ...(data as Record<string, unknown>),
      total_uses: (data as Record<string, unknown>).total_uses ?? 0,
      last_usage: null,
      cooldown_until: {},
    };

    return jsonOk({ template });
  } catch (err) {
    const msg = err instanceof Error ? err.message
      : (typeof err === 'object' && err && 'message' in err) ? String((err as { message: unknown }).message)
      : 'Erreur inconnue';
    console.error('[marketing/templates/:id GET] catch:', msg);
    return jsonError(msg, 500);
  }
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const id = params.id;
  if (!id) return jsonError('Missing template id', 400);

  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;

  // Whitelist des champs modifiables
  const allowed = ['title', 'mood', 'caption', 'hashtags', 'is_active', 'slides'] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in (body as Record<string, unknown>)) {
      updates[key] = (body as Record<string, unknown>)[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return jsonError('Aucun champ modifiable fourni', 400);
  }

  try {
    const sb = createServiceClient();
    // p_updates DOIT être passé en OBJET, pas en chaîne JSON.stringify : le
    // paramètre RPC est typé `json`. PostgREST, recevant une string, la passe
    // comme scalaire json string → `p_updates->'slides'` renvoie NULL →
    // COALESCE garde l'ancienne valeur → la sauvegarde renvoie 200 mais ne
    // persiste RIEN (bug "mes modifs ne sont pas prises en compte").
    const { data, error } = await sb.rpc('update_marketing_template', {
      p_id: id,
      p_updates: updates,
    });

    if (error) {
      console.error('[marketing/templates/:id PATCH] RPC error:', error.message, error.code);
      return jsonError(error.message || 'Erreur Supabase', 500);
    }
    if (!data) return jsonError('Template non trouvé', 404);

    // Marque le carrousel pour re-render auto des aperçus. Le worker
    // marketing-regen-worker (PM2 sur le VPS) poll preview_regen_at toutes
    // les 30s, re-render le carrousel, ré-upload sur B2 et MAJ preview_urls.
    // → l'utilisateur édite + sauvegarde, le PNG se met à jour tout seul.
    //
    // SAUF pour les carrousels figés importés via le dashboard (macro_format
    // `*-VID*` vidéo ou `*-IMG*` images) : leurs aperçus sont des fichiers
    // custom (mp4 / PNG hors-pipeline V3). Un re-render V3 les écraserait. On
    // saute donc le flag pour eux → on peut éditer titre/légende/hashtags d'un
    // import sans détruire ses médias. (Lecture null-safe : macro NULL = non figé.)
    const { data: row } = await sb
      .schema('marketing').from('script_templates')
      .select('macro_format').eq('id', id).single();
    const frozenImport = typeof row?.macro_format === 'string' && /-VID|-IMG/i.test(row.macro_format);

    if (!frozenImport) {
      const { error: regenErr } = await sb
        .schema('marketing')
        .from('script_templates')
        .update({ preview_regen_at: new Date().toISOString() })
        .eq('id', id);
      if (regenErr) {
        console.error('[marketing/templates/:id PATCH] flag regen error:', regenErr.message);
        // non bloquant : la sauvegarde a réussi, seul l'auto-render est raté
      }
    }

    return jsonOk(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message
      : (typeof err === 'object' && err && 'message' in err) ? String((err as { message: unknown }).message)
      : 'Erreur inconnue';
    console.error('[marketing/templates/:id PATCH] catch:', msg);
    return jsonError(msg, 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,PATCH,OPTIONS');
