-- 2026-09-17 — ON NE SAVAIT PAS SI UNE NOTIFICATION DE REVUE ÉTAIT PARTIE
-- (demande Johan : « ferme l'angle mort des mails de revue »).
--
-- Le 08/09 on a appris qu'un envoi qui échoue en silence est pire que pas
-- d'envoi : on croit l'utilisateur prévenu. La raison de l'échec remonte depuis
-- à l'écran de revue — mais **elle n'est affichée qu'une fois, au moment du
-- clic**. Une heure plus tard, plus rien : aucune trace en base.
--
-- Constaté aujourd'hui en voulant simplement répondre à « est-ce que le mail
-- est parti ? » sur une correction faite dix minutes plus tôt : impossible.
-- `vmd_email_log` ne pouvait pas servir — c'est une table de DÉDUPLICATION
-- (`unique (user_id, template_id)`), elle ne peut porter qu'une ligne par
-- utilisateur et par gabarit, alors qu'un même utilisateur reçoit une
-- notification par analyse relue.
--
-- ⚠️ ON JOURNALISE LES TROIS ISSUES, PAS SEULEMENT LES SUCCÈS. Un journal qui
-- n'enregistre que ce qui a marché laisse exactement le trou qu'on ferme :
--   · envoyé          → `envoye = true`
--   · échec           → `envoye = false` + la cause RENDUE PAR RESEND, telle
--                       quelle (domaine non vérifié, clé révoquée, destinataire
--                       refusé) — c'est elle qui permet le diagnostic ;
--   · silence VOULU   → `envoye = false` + « silencieux demandé ». Sans cette
--                       troisième valeur, on ne distinguerait pas un envoi
--                       qu'on a choisi de ne pas faire d'un envoi qui a raté.
--
-- ⚠️ PAS DE CLÉ ÉTRANGÈRE SUR `analysis_id`, ET C'EST DÉLIBÉRÉ. Le bouton
-- « Tester l'envoi » (10/09) envoie un vrai e-mail depuis notre domaine avec un
-- identifiant d'analyse nul (`00000000-…`) : c'est un envoi réel, il doit
-- figurer au journal. Une contrainte référentielle le rejetterait — et un
-- journal qui refuse d'enregistrer certains envois n'est plus un journal.

create table if not exists public.review_notification_log (
  id          uuid primary key default gen_random_uuid(),
  analysis_id uuid,
  to_email    text not null,
  action      text not null,
  envoye      boolean not null,
  raison      text not null,
  created_at  timestamptz not null default now()
);

create index if not exists review_notification_log_analysis_idx
  on public.review_notification_log (analysis_id, created_at desc);
create index if not exists review_notification_log_date_idx
  on public.review_notification_log (created_at desc);

comment on table public.review_notification_log is
  'Journal des notifications de revue envoyées aux utilisateurs (helper '
  'sendReviewNotificationEmail). Écrit pour les TROIS issues : envoyé, échec '
  '(avec la cause rendue par Resend), et silence délibéré. Sans lui, « le mail '
  'est-il parti ? » n''a pas de réponse dix minutes après le clic.';
comment on column public.review_notification_log.raison is
  'Succès : « envoyé ». Échec : la cause telle que Resend la rend. Silence '
  'voulu : « silencieux demandé — l''utilisateur n''a PAS été prévenu ».';
comment on column public.review_notification_log.analysis_id is
  'Sans clé étrangère : le bouton « Tester l''envoi » utilise un UUID nul, et '
  'cet envoi-là est réel — il doit figurer au journal.';

-- Le journal porte des adresses e-mail d'utilisateurs : même régime que les
-- autres tables d'administration (alerte « auth_users_exposed » du 23/08).
alter table public.review_notification_log enable row level security;
revoke all on public.review_notification_log from public, anon, authenticated;
grant select, insert on public.review_notification_log to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- TÉMOIN — la table doit accepter les trois issues, et refuser un trou.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  n int;
begin
  insert into public.review_notification_log (analysis_id, to_email, action, envoye, raison)
  values
    (null, 'temoin@example.test', 'corrected', true,  'envoyé'),
    (null, 'temoin@example.test', 'validated', false, 'domain is not verified'),
    (null, 'temoin@example.test', 'rejected',  false, 'silencieux demandé');

  select count(*) into n from public.review_notification_log where to_email = 'temoin@example.test';
  if n <> 3 then
    raise exception 'TÉMOIN CASSÉ : % ligne(s) insérée(s) au lieu de 3', n;
  end if;

  -- Une raison vide rendrait le journal inutile le jour où il sert.
  begin
    insert into public.review_notification_log (to_email, action, envoye, raison)
    values ('temoin@example.test', 'corrected', true, null);
    raise exception 'TÉMOIN CASSÉ : une raison NULL a été acceptée';
  exception when not_null_violation then
    null; -- attendu
  end;

  delete from public.review_notification_log where to_email = 'temoin@example.test';
  raise notice 'OK : le journal accepte les trois issues et refuse une raison vide.';
end $$;
