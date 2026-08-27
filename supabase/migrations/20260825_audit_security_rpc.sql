-- ============================================================================
-- 2026-08-25 — RPC d'audit sécurité (alerte Supabase auth_users_exposed 23/08)
--
-- Fonction service_role ONLY qui liste :
--   1. les vues du schéma public dont la définition référence auth.users,
--      avec leurs droits SELECT pour anon/authenticated (= la fuite du linter)
--   2. les tables du schéma public sans Row-Level Security
-- Permet de diagnostiquer depuis PostgREST sans accès psql (pas de Docker
-- local), et resservira aux audits futurs.
-- ============================================================================

create or replace function public.admin_audit_auth_exposure()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'views_referencing_auth_users', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'view', v.viewname,
        'anon_select', has_table_privilege('anon', (quote_ident(v.schemaname) || '.' || quote_ident(v.viewname))::regclass, 'SELECT'),
        'authenticated_select', has_table_privilege('authenticated', (quote_ident(v.schemaname) || '.' || quote_ident(v.viewname))::regclass, 'SELECT')
      ) order by v.viewname), '[]'::jsonb)
      from pg_views v
      where v.schemaname = 'public'
        and v.definition ilike '%auth.users%'
    ),
    'tables_without_rls', (
      select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relrowsecurity = false
    )
  );
$$;

revoke all on function public.admin_audit_auth_exposure() from public, anon, authenticated;
grant execute on function public.admin_audit_auth_exposure() to service_role;
