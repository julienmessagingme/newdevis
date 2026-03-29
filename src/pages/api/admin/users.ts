export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireAuth } from '@/lib/apiHelpers';

export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  // Check admin role
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleData) {
    return jsonError('Accès refusé', 403);
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
      const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers({
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

    // Fetch all subscriptions linked to Stripe (any status)
    const { data: subscriptions, error: subError } = await supabase
      .from('subscriptions')
      .select('user_id, status, stripe_customer_id, stripe_subscription_id, lifetime_analysis_count, created_at, current_period_end')
      .not('stripe_customer_id', 'is', null);

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

    return jsonOk({
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
    });
  } catch (err) {
    console.error('Admin users error:', (err as Error).message);
    return jsonError('Erreur lors du chargement des utilisateurs', 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
