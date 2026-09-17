-- 2026-09-17 — SORTIR DE LA FILE LES 65 ANALYSES QUE NOUS Y AVONS REMISES
-- (demande Johan : « laisse-moi uniquement FA BAT et les 11 de septembre »).
--
-- La file compte 77 lignes, mais **65 n'y sont pas parce qu'un utilisateur
-- attend** : ce sont des devis déposés entre avril et juillet, remis en
-- `pending_review` par NOTRE passe de régénération du 15/09 (Piste C by design,
-- comportement documenté et voulu). Elles noient les 12 vraies demandes de
-- septembre et rendent l'écran inexploitable pour ce à quoi il sert — c'est le
-- défaut relevé le 16/09 et resté au backlog depuis.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 ON NE TOUCHE PAS À `review_status`, ET C'EST LE CŒUR DE CETTE MIGRATION.
--
-- Le réflexe serait de basculer les 65 en `auto_approved` : la file se vide en
-- une ligne. Mais `review_status` n'est PAS un champ d'affichage interne — il
-- gouverne ce que l'UTILISATEUR voit sur sa page :
--   · `pending_review` affiche un bandeau bleu « verdict provisoire, confirmé
--     ou ajusté sous 24 h ouvrées, vous serez notifié par e-mail » ;
--   · et il MASQUE le montant du surcoût (règle du 30/08 : une analyse en
--     attente d'expert n'affiche aucun écart chiffré).
-- Le basculer ferait donc réapparaître des montants sur 65 pages et retirerait
-- un bandeau — deux changements côté client que personne n'a demandés.
--
-- Ranger l'écran de l'expert et changer ce que voient 65 utilisateurs sont
-- **deux décisions différentes**. Celle-ci ne fait que la première.
--
-- ⚠️ CE QUI RESTE VRAI ET DOIT ÊTRE TRANCHÉ À PART : ces 65 pages promettent
-- une réponse « sous 24 h ouvrées » depuis quatre mois. C'est une promesse
-- fausse, affichée en ce moment même. Elle ne se corrige pas en cachant la
-- ligne dans notre écran (`TODO.md`).
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Le mécanisme est une colonne dédiée, pas un statut détourné : réversible
-- (remettre à NULL), datée (on sait QUAND on a différé), et elle laisse le
-- compteur dire la vérité — 12 en attente, 65 différées, jamais « 77 ».

alter table public.analyses
  add column if not exists review_differe_le timestamptz;

comment on column public.analyses.review_differe_le is
  'Non NULL = analyse retirée de la file /admin/reviews sans être tranchée. '
  'Sert aux analyses re-signalées par une régénération de masse, qui noient les '
  'demandes réelles. N''affecte PAS review_status, donc rien de ce que voit '
  'l''utilisateur. Remettre à NULL la fait réapparaître dans la file.';

-- Index partiel : la file ne lit que les lignes NON différées.
create index if not exists idx_analyses_review_differe
  on public.analyses (review_status)
  where review_differe_le is null;

-- ── Les 65 : tout ce qui est en attente ET déposé avant septembre ────────────
-- ⚠️ La borne est la DATE DE DÉPÔT du devis, pas la date de régénération : c'est
-- « depuis quand cet utilisateur attend-il ? » qui décide, pas notre tuyauterie.
update public.analyses
set review_differe_le = now()
where review_status = 'pending_review'
  and review_differe_le is null
  and created_at < '2026-09-01';

-- ── La file n'affiche plus que les non différées ─────────────────────────────
-- ⚠️ `create or replace view` ne peut ni retirer ni réordonner une colonne :
-- on republie la définition À L'IDENTIQUE, seul le `where` change.
create or replace view public.admin_pending_reviews as
select
  a.id,
  a.created_at,
  a.user_id,
  a.file_name,
  a.work_type,
  a.review_status,
  (a.conclusion_ia::jsonb)->>'verdict_global' as verdict_global,
  (a.conclusion_ia::jsonb)->>'verdict_decisionnel' as verdict_decisionnel,
  (a.conclusion_ia::jsonb)->>'phrase_intro' as phrase_intro,
  ((a.conclusion_ia::jsonb)->'surcout_global'->>'min')::numeric as surcout_min,
  ((a.conclusion_ia::jsonb)->'surcout_global'->>'max')::numeric as surcout_max,
  jsonb_array_length(coalesce((a.conclusion_ia::jsonb)->'anomalies', '[]'::jsonb)) as nb_anomalies,
  ((a.conclusion_ia::jsonb)->>'is_foreign_quote')::boolean as is_foreign,
  ((a.conclusion_ia::jsonb)->>'is_incomplete_quote')::boolean as is_incomplete,
  ((a.conclusion_ia::jsonb)->'hors_scope') is not null as is_hors_scope,
  ((a.conclusion_ia::jsonb)->'estimation_courtier') is not null as is_courtier,
  u.email as user_email,
  case
    when a.raw_text is null or a.raw_text = '' then null
    when a.raw_text ~ '^\s*\{' then coalesce(
      (a.raw_text::jsonb)->'extracted'->'entreprise'->>'nom',
      (a.raw_text::jsonb)->'extracted_data'->'entreprise'->>'nom'
    )
    else null
  end as entreprise_nom
from public.analyses a
left join auth.users u on u.id = a.user_id
where a.review_status = 'pending_review'
  and a.review_differe_le is null
order by a.created_at desc;

revoke all on public.admin_pending_reviews from public, anon, authenticated;
grant select on public.admin_pending_reviews to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- TÉMOIN — on vérifie les DEUX côtés : ce qui reste ET ce qui est parti.
-- Un compteur qui tombe à 12 peut aussi bien vouloir dire « on a bien trié »
-- que « on a effacé 65 lignes ». Il faut les retrouver.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  n_file int;
  n_differees int;
  n_total_attente int;
  plus_ancienne date;
begin
  select count(*) into n_file from public.admin_pending_reviews;
  select count(*) into n_differees
    from public.analyses
    where review_status = 'pending_review' and review_differe_le is not null;
  select count(*) into n_total_attente
    from public.analyses where review_status = 'pending_review';

  -- Recomposition : rien ne doit avoir disparu.
  if n_file + n_differees <> n_total_attente then
    raise exception 'TÉMOIN CASSÉ : % en file + % différées ≠ % en attente',
      n_file, n_differees, n_total_attente;
  end if;

  -- La file ne doit plus contenir que du septembre.
  select min(created_at)::date into plus_ancienne from public.admin_pending_reviews;
  if plus_ancienne < date '2026-09-01' then
    raise exception 'TÉMOIN CASSÉ : la file contient encore un devis du % ', plus_ancienne;
  end if;

  -- Et elle ne doit pas être vide : un filtre trop large se verrait ici.
  if n_file = 0 then
    raise exception 'TÉMOIN CASSÉ : la file est VIDE — le filtre a tout emporté';
  end if;

  raise notice 'OK : % en file (la plus ancienne du %), % différées, % en attente au total.',
    n_file, plus_ancienne, n_differees, n_total_attente;
end $$;

-- ── POUR TOUT REMETTRE DANS LA FILE, si besoin ───────────────────────────────
--   update public.analyses set review_differe_le = null
--   where review_status = 'pending_review' and review_differe_le is not null;
