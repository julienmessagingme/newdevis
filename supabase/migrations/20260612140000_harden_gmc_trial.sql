-- ============================================================
-- GMC — Durcissement Phase 2 (suite revue de code 2026-06-12)
-- 1) Le trigger d'essai ne doit JAMAIS bloquer une inscription : l'INSERT est
--    enveloppe dans un handler d'exception (un echec d'essai ne fait pas echouer
--    la creation de compte).
-- 2) Contrainte CHECK sur les valeurs de `status`.
-- ============================================================

-- 1) Trigger resilient (CREATE OR REPLACE : idempotent, le trigger existant pointe deja dessus)
CREATE OR REPLACE FUNCTION public.gmc_create_trial_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'signup_source' = 'gerermonchantier' THEN
    BEGIN
      INSERT INTO public.gmc_subscriptions (
        user_id, status, plan, trial_started_at, trial_ends_at, signup_source
      )
      VALUES (
        NEW.id, 'trial', 'gmc_essentiel', NOW(), NOW() + INTERVAL '30 days', 'gerermonchantier'
      )
      ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- Ne JAMAIS faire echouer la creation de compte a cause de l'essai.
      RAISE WARNING 'gmc_create_trial_on_signup failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Contrainte de valeurs sur status (les lignes existantes 'trial'/'inactive' sont valides)
ALTER TABLE public.gmc_subscriptions
  DROP CONSTRAINT IF EXISTS gmc_subscriptions_status_check;
ALTER TABLE public.gmc_subscriptions
  ADD CONSTRAINT gmc_subscriptions_status_check
  CHECK (status IN ('inactive', 'trial', 'active', 'expired'));
