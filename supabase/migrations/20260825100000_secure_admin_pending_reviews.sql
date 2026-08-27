-- ============================================================================
-- 2026-08-25 — FIX alerte Supabase « auth_users_exposed » (email du 23/08)
--
-- La vue public.admin_pending_reviews (écran /admin/reviews, Phase 2.1) joint
-- auth.users pour afficher l'email de l'uploader — et était SELECTable par
-- anon + authenticated : n'importe qui avec l'URL du projet pouvait lire des
-- emails d'utilisateurs via PostgREST. Même pattern (et même fix, option A)
-- que 20260527_001_secure_admin_views_revoke_anon_access.
--
-- L'API route /api/admin/reviews passe simultanément sur createServiceClient()
-- (après vérification du rôle admin) — le fonctionnement métier est préservé.
-- ============================================================================

revoke all on public.admin_pending_reviews from public, anon, authenticated;
grant select on public.admin_pending_reviews to service_role;
