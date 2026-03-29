export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireAuth } from '@/lib/apiHelpers';

export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  // Vérifier que l'appelant est admin
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleData) {
    return jsonError('Accès refusé', 403);
  }

  // Récupérer les 30 derniers devis (tous utilisateurs, bypass RLS via service_role)
  const { data, error } = await supabase
    .from('analyses')
    .select('id, file_name, file_path, created_at, user_id, score, status')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    return jsonError(error.message, 500);
  }

  return jsonOk({ devis: data });
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
