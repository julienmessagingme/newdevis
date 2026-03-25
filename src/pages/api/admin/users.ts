export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export const GET: APIRoute = async ({ request }) => {
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Configuration serveur manquante' }),
      { status: 500, headers: CORS },
    );
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Non authentifié' }),
      { status: 401, headers: CORS },
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Verify caller identity
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Token invalide' }),
      { status: 401, headers: CORS },
    );
  }

  // Check admin role
  const { data: roleData } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleData) {
    return new Response(
      JSON.stringify({ error: 'Accès refusé' }),
      { status: 403, headers: CORS },
    );
  }

  try {
    // Fetch all users from auth.users (service_role required)
    const allUsers: Array<{
      id: string;
      email: string | undefined;
      created_at: string;
      last_sign_in_at: string | null;
      user_metadata: Record<string, unknown>;
      is_anonymous?: boolean;
    }> = [];

    let page = 1;
    const perPage = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (usersError) throw usersError;

      allUsers.push(...users.map(u => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        user_metadata: u.user_metadata ?? {},
        is_anonymous: u.is_anonymous,
      })));

      hasMore = users.length === perPage;
      page++;
    }

    // Filter out anonymous users (no email)
    const registeredUsers = allUsers
      .filter(u => u.email && !u.is_anonymous)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Fetch subscriptions with active Pass Sérénité
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id, status, stripe_subscription_id, lifetime_analysis_count, created_at, current_period_end')
      .in('status', ['active', 'trial', 'past_due']);

    if (subError) throw subError;

    // Build subscribers list with user info
    const subscribers = (subscriptions || []).map(sub => {
      const userInfo = allUsers.find(u => u.id === sub.user_id);
      return {
        user_id: sub.user_id,
        email: userInfo?.email || 'Inconnu',
        first_name: (userInfo?.user_metadata?.first_name as string) || '',
        last_name: (userInfo?.user_metadata?.last_name as string) || '',
        status: sub.status,
        lifetime_analysis_count: sub.lifetime_analysis_count,
        subscribed_at: sub.created_at,
        current_period_end: sub.current_period_end,
      };
    }).sort((a, b) => new Date(b.subscribed_at).getTime() - new Date(a.subscribed_at).getTime());

    return new Response(
      JSON.stringify({
        registered_users: registeredUsers.map(u => ({
          id: u.id,
          email: u.email,
          first_name: (u.user_metadata?.first_name as string) || '',
          last_name: (u.user_metadata?.last_name as string) || '',
          phone: (u.user_metadata?.phone as string) || '',
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
        })),
        subscribers,
        total_registered: registeredUsers.length,
        total_subscribers: subscribers.length,
      }),
      { status: 200, headers: CORS },
    );
  } catch (err) {
    console.error('Admin users error:', (err as Error).message);
    return new Response(
      JSON.stringify({ error: 'Erreur lors du chargement des utilisateurs' }),
      { status: 500, headers: CORS },
    );
  }
};
