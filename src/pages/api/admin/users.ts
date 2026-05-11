export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireAuth } from '@/lib/api/apiHelpers';

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

    // V3.4.3 — séparer les utilisateurs inscrits (compte permanent avec email)
    // des utilisateurs anonymes (créés silencieusement via useAnonymousAuth lors
    // d'une analyse de devis). Ces derniers étaient invisibles dans le panneau
    // admin → on les expose désormais pour comprendre le funnel réel.
    const registeredUsers = allUsers
      .filter(u => u.email && !u.is_anonymous)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const anonymousUsers = allUsers
      .filter(u => u.is_anonymous === true)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Décompte par jour des comptes anonymes créés (utile pour mesurer le funnel anonyme)
    const anonymousByDay = anonymousUsers.reduce((acc, u) => {
      const day = u.created_at.split("T")[0];
      acc[day] = (acc[day] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

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
      // V3.4.3 — visibilité du funnel anonyme
      total_anonymous: anonymousUsers.length,
      anonymous_by_day: anonymousByDay,
    });
  } catch (err) {
    console.error('Admin users error:', (err as Error).message);
    return jsonError('Erreur lors du chargement des utilisateurs', 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
