-- Cron quotidien : flippe les essais arrives a echeance (trial -> expired) a J30.
--
-- Pourquoi : le gate d'ecriture bloque deja l'acces via la date (trial_ends_at < now),
-- mais la ligne restait status='trial' a vie => donnees sales (faux "essais actifs" en
-- analytics) et cycle de vie email ambigu. Ce flip donne un statut terminal propre.
--
-- Sans risque pour le winback : la suite POST_TRIAL du gmc-email-scheduler (trial_ended,
-- winback_1/2/offer) est pilotee par trial_ends_at, donc rejouable que la ligne soit
-- encore 'trial' (cron pas encore passe) ou deja 'expired'. Le scheduler n'envoie
-- 'goodbye' QUE pour un abonne payant resilie (stripe_subscription_id present), jamais
-- pour un essai expire.
--
-- Tourne a 07:50, juste avant gmc-email-scheduler-daily (08:00), pour que le statut
-- soit a jour au moment de l'envoi des emails.
--
-- cron.schedule upsert par nom (pg_cron >= 1.4) : rejouable sans doublon.

select cron.schedule(
  'gmc-trial-expire-daily',
  '50 7 * * *',
  $$UPDATE public.gmc_subscriptions
      SET status = 'expired', updated_at = now()
    WHERE status = 'trial'
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at < now()$$
);
