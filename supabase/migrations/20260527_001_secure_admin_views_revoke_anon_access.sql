-- ============================================================================
-- 2026-05-27 — SÉCURISATION ACCÈS VUES ADMIN / MARKETING / BUDGET
-- ============================================================================
--
-- Trigger : Supabase Security Advisor remonte 7 alertes sur la base prod :
--   - 1 erreur "Exposed Auth Users" sur `public.admin_kpis_returning_users`
--     (la vue join auth.users et expose les emails à anon/authenticated)
--   - 6 warnings "Security Definer View" sur les vues admin/budget/marketing
--     (créées sans `security_invoker = true` → bypass RLS effectif)
--
-- Risque pratique : un utilisateur connecté (rôle `authenticated`) peut faire
-- `SELECT * FROM public.admin_kpis_returning_users` via PostgREST et récupérer
-- TOUS les emails de TOUS les users → fuite RGPD critique.
--
-- Solution choisie : OPTION A — REVOKE anon/authenticated + GRANT service_role.
-- Toutes les API routes (`src/pages/api/admin/*`, `src/pages/api/chantier/*`)
-- utilisent `createServiceClient()` (cf. `src/lib/api/apiHelpers.ts:33`) →
-- service_role a SELECT, le fonctionnement métier est préservé.
--
-- On NE TOUCHE PAS au flag SECURITY DEFINER : le linter Supabase continuera
-- à afficher 6 warnings cosmétiques, mais le risque effectif est neutralisé.
-- (Option B avec `security_invoker = true` non retenue pour zéro risque de
-- régression — possible plus tard si on veut un dashboard 100% vert.)
--
-- Vues concernées :
--   • public.admin_kpis_returning_users    (Exposed Auth Users + Sec Def)
--   • public.admin_kpis_retention_daily    (Sec Def)
--   • public.admin_kpis_retention_weekly   (Sec Def)
--   • public.payment_events_v              (Sec Def — consommée par budget chantier)
--   • marketing.v_platform_performance     (Sec Def)
--   • marketing.v_upcoming_posts           (Sec Def)
--
-- Idempotente : `REVOKE` et `GRANT` peuvent être ré-exécutés sans erreur.
-- ============================================================================

BEGIN;

-- ── 1. public.admin_kpis_returning_users (CRITIQUE — Exposed Auth Users) ────
-- Cette vue join auth.users pour exposer les emails. Elle est consommée par
-- /api/admin/* uniquement (analytics rétention).
REVOKE ALL ON public.admin_kpis_returning_users FROM anon, authenticated;
GRANT  SELECT ON public.admin_kpis_returning_users TO service_role;

-- ── 2. public.admin_kpis_retention_daily (analytics admin) ──────────────────
REVOKE ALL ON public.admin_kpis_retention_daily FROM anon, authenticated;
GRANT  SELECT ON public.admin_kpis_retention_daily TO service_role;

-- ── 3. public.admin_kpis_retention_weekly (analytics admin) ─────────────────
REVOKE ALL ON public.admin_kpis_retention_weekly FROM anon, authenticated;
GRANT  SELECT ON public.admin_kpis_retention_weekly TO service_role;

-- ── 4. public.payment_events_v (budget chantier — consommée par /api/chantier) ─
-- Cette vue est requêtée par les API budget/payment-events qui passent toutes
-- par `requireChantierAuthOrAgent()` → service_role. Le REVOKE des rôles
-- standard n'impacte pas le fonctionnement.
REVOKE ALL ON public.payment_events_v FROM anon, authenticated;
GRANT  SELECT ON public.payment_events_v TO service_role;

-- ── 5. marketing.v_platform_performance ─────────────────────────────────────
-- Vue créée hors-migration (probablement via Studio). On la sécurise quand
-- même par REVOKE explicite. Si la vue n'existe pas, l'instruction échoue
-- silencieusement (DO block protecteur ci-dessous).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'marketing' AND viewname = 'v_platform_performance') THEN
    REVOKE ALL ON marketing.v_platform_performance FROM anon, authenticated;
    GRANT  SELECT ON marketing.v_platform_performance TO service_role;
  END IF;
END
$$;

-- ── 6. marketing.v_upcoming_posts ───────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'marketing' AND viewname = 'v_upcoming_posts') THEN
    REVOKE ALL ON marketing.v_upcoming_posts FROM anon, authenticated;
    GRANT  SELECT ON marketing.v_upcoming_posts TO service_role;
  END IF;
END
$$;

-- ── Vérifications post-migration ────────────────────────────────────────────
-- À lancer dans SQL Editor après application pour confirmer :
--
--   SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public'
--     AND table_name = 'admin_kpis_returning_users'
--   ORDER BY grantee;
--   -- Attendu : seulement 'service_role' et 'postgres' avec privileges.
--   -- anon et authenticated ne doivent PAS apparaître.
--
--   -- Test fonctionnel : depuis le Supabase Dashboard avec rôle "authenticated" :
--   --   SELECT * FROM public.admin_kpis_returning_users LIMIT 1;
--   -- Doit retourner :
--   --   ERROR:  permission denied for view admin_kpis_returning_users
--
--   -- Test admin : depuis l'app, /admin doit toujours afficher les KPIs
--   -- (les routes /api/admin/* utilisent service_role → continue à fonctionner).

COMMIT;
