-- 2026-09-17 — L'ÉCRAN DE REVUE N'AFFICHAIT QUE LE NOM DU FICHIER.
--
-- Retour Johan : « je ne vois pas l'analyse qui vient d'être effectuée FA BAT ».
-- Elle était pourtant en **position 1** de la file. Son fichier s'appelle
-- `Devis_DV00051.pdf` ; l'entreprise, elle, s'appelle « FERREIRA ALOÏS - FA BAT' ».
--
-- 🔴 UN HUMAIN RECONNAÎT UN DEVIS PAR L'ARTISAN, PAS PAR LE NOM DU FICHIER.
-- Celui-ci est choisi par l'utilisateur et ne veut rien dire : sur les 77 lignes
-- de la file on trouve `image.jpg`, `document(1).pdf`, `Screenshot_2026-09-16-…`,
-- `17895811506207173344151677018893.jpg`. Chercher une analyse par son nom de
-- fichier est impossible, et l'expert conclut que l'analyse n'est pas là —
-- alors qu'elle est en tête. Sur une file dont la promesse est « réponse sous
-- 24 h », c'est un défaut coûteux.
--
-- ⚠️ La garde `~ '^\s*\{'` reprend le motif déjà en place pour `conclusion_ia`
-- (migration 20260615010000) : `raw_text` est une colonne **TEXTE contenant du
-- JSON**, pas un jsonb. Sans elle, une seule ligne mal formée ferait échouer la
-- vue ENTIÈRE — donc l'écran de revue tout entier, pour toutes les analyses.
--
-- ⚠️ Deux emplacements possibles selon l'âge de l'analyse (`extracted` pour le
-- moteur historique, `extracted_data` depuis V2) — d'où le `coalesce`.

create or replace view public.admin_pending_reviews as
select
  a.id,
  a.created_at,
  a.user_id,
  a.file_name,
  a.work_type,
  a.review_status,
  -- Conclusion IA structurée
  (a.conclusion_ia::jsonb)->>'verdict_global' as verdict_global,
  (a.conclusion_ia::jsonb)->>'verdict_decisionnel' as verdict_decisionnel,
  (a.conclusion_ia::jsonb)->>'phrase_intro' as phrase_intro,
  ((a.conclusion_ia::jsonb)->'surcout_global'->>'min')::numeric as surcout_min,
  ((a.conclusion_ia::jsonb)->'surcout_global'->>'max')::numeric as surcout_max,
  jsonb_array_length(coalesce((a.conclusion_ia::jsonb)->'anomalies', '[]'::jsonb)) as nb_anomalies,
  -- Bypass flags actifs
  ((a.conclusion_ia::jsonb)->>'is_foreign_quote')::boolean as is_foreign,
  ((a.conclusion_ia::jsonb)->>'is_incomplete_quote')::boolean as is_incomplete,
  ((a.conclusion_ia::jsonb)->'hors_scope') is not null as is_hors_scope,
  ((a.conclusion_ia::jsonb)->'estimation_courtier') is not null as is_courtier,
  -- User info
  u.email as user_email,
  -- 🟢 2026-09-17 — L'ARTISAN, pour qu'on retrouve un devis par son émetteur.
  -- ⚠️ EN DERNIÈRE POSITION, ET CE N'EST PAS UN CHOIX DE STYLE : `CREATE OR
  -- REPLACE VIEW` sait AJOUTER une colonne à la fin, jamais en insérer une au
  -- milieu. Placée avant `user_email`, Postgres refuse (« cannot change name of
  -- view column »). Il faudrait un DROP + CREATE, qui casserait les droits.
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
order by a.created_at desc;

-- La vue joint `auth.users` : elle reste interdite à anon/authenticated
-- (alerte « auth_users_exposed » du 23/08, migration 20260825100000).
-- L'API /api/admin/reviews passe par service_role après vérification du rôle.
revoke all on public.admin_pending_reviews from public, anon, authenticated;
grant select on public.admin_pending_reviews to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- TÉMOIN — la colonne doit exister ET être RENSEIGNÉE. Une vue qui rend NULL
-- partout compilerait sans erreur et ne servirait à rien.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  n_total int;
  n_nommees int;
  exemple text;
begin
  select count(*), count(entreprise_nom) into n_total, n_nommees
  from public.admin_pending_reviews;

  if n_total = 0 then
    raise notice 'File vide : rien à vérifier.';
    return;
  end if;
  if n_nommees = 0 then
    raise exception 'TÉMOIN CASSÉ : 0 nom d''entreprise sur % lignes — la vue ne lit rien', n_total;
  end if;

  select entreprise_nom into exemple
  from public.admin_pending_reviews
  where entreprise_nom is not null
  order by created_at desc limit 1;

  raise notice 'OK : % / % lignes portent le nom de l''artisan (la plus récente : %).',
    n_nommees, n_total, exemple;
end $$;
