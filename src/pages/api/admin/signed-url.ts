export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireAuth, parseJsonBody } from '@/lib/apiHelpers';

export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  // Vérifier admin
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleData) {
    return jsonError('Accès refusé', 403);
  }

  const body = await parseJsonBody<{ filePath?: string }>(request);
  if (body instanceof Response) return body;
  if (!body.filePath) {
    return jsonError('filePath manquant', 400);
  }

  // Générer la signed URL via service_role (bypass RLS storage)
  const { data, error } = await supabase.storage
    .from('devis')
    .createSignedUrl(body.filePath, 60);

  if (error || !data?.signedUrl) {
    return jsonError(error?.message ?? "Impossible de générer l'URL", 500);
  }

  return jsonOk({ signedUrl: data.signedUrl });
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
