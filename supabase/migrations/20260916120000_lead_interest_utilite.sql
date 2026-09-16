-- 2026-09-16 (décision Johan) — LE SONDAGE CRÉDIT CÈDE SA PLACE À LA QUESTION
-- D'UTILITÉ, LE TEMPS DU TEST.
--
-- Mesuré le 16/09 : **32 affichages du sondage crédit, ZÉRO réponse** — pas même
-- un « non », pourtant enregistrable depuis le 13/09. Il est rendu dans le 2e
-- bloc de la page, juste après le verdict : le lecteur vient d'apprendre s'il
-- doit signer, et on l'interrompt avec une question de financement.
--
-- Consigne : « on ne brouille pas et on ne fait pas 2 demandes en même temps ».
-- Le créneau porte donc une seule question, et c'est la nôtre : l'analyse
-- a-t-elle été utile ? On saura au moins si le bloc est lu — aujourd'hui un
-- zéro ne distingue pas « pas intéressé » de « jamais vu ».
--
-- ⚠️ La contrainte est ÉLARGIE, jamais remplacée : les lignes `credit` et
-- `dommages_ouvrage` existantes restent valides, et le sondage crédit pourra
-- revenir à un autre endroit sans nouvelle migration.

alter table public.lead_interest
  drop constraint if exists lead_interest_topic_check;

alter table public.lead_interest
  add constraint lead_interest_topic_check
  check (topic in ('dommages_ouvrage', 'credit', 'utilite'));

comment on column public.lead_interest.topic is
  'Sujet mesuré : dommages_ouvrage, credit (test suspendu le 2026-09-16 — 32 affichages, 0 réponse), utilite (l''analyse a-t-elle servi ?).';
