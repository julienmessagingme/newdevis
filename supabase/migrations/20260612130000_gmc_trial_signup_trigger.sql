-- ============================================================
-- GMC — Trigger d'essai a l'inscription
-- A la creation d'un compte (auth.users), cree l'essai GMC 30j
-- UNIQUEMENT pour les inscriptions GMC (signup_source='gerermonchantier'
-- dans les metadata du user). VMD et les autres signups ne sont pas affectes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.gmc_create_trial_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'signup_source' = 'gerermonchantier' THEN
    INSERT INTO public.gmc_subscriptions (
      user_id, status, plan, trial_started_at, trial_ends_at, signup_source
    )
    VALUES (
      NEW.id, 'trial', 'gmc_essentiel', NOW(), NOW() + INTERVAL '30 days', 'gerermonchantier'
    )
    ON CONFLICT (user_id) DO NOTHING;  -- idempotent
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gmc_create_trial_on_signup ON auth.users;
CREATE TRIGGER trg_gmc_create_trial_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.gmc_create_trial_on_signup();

-- Note : l'INSERT dans gmc_subscriptions declenche le Database Webhook
-- (a configurer dans le dashboard) qui appelle l'edge function `gmc-on-signup`
-- pour envoyer le welcome + la notif admin via Resend.
