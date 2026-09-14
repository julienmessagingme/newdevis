-- Provenance des visites — 2026-09-14 (demande Johan)
--
-- POURQUOI. La mesure du 14/09 sur 11 jours dit que 87 % du trafic entre par
-- l'accueil et que 3,8 % seulement y cliquent, tout le reste du funnel
-- convertissant à 68-100 %. Mais elle ne permet PAS d'agir : sans savoir d'où
-- viennent ces visiteurs, « l'accueil convertit à 3,8 % » peut aussi bien
-- décrire une mauvaise page qu'un mauvais trafic — les deux donnent
-- exactement le même chiffre, et on ne saura pas non plus si une correction a
-- servi à quelque chose.
--
-- DEUX FAITS DISTINCTS, DEUX COLONNES. On ne les fusionne pas à l'écriture :
--   · `referrer_host` — le site qui nous a envoyé le visiteur (google.com,
--     facebook.com…), lu depuis `document.referrer` côté navigateur.
--     ⚠️ L'en-tête HTTP `Referer` du beacon ne sert à RIEN ici : il porte
--     notre propre page, celle qui émet la requête. Seul `document.referrer`
--     donne la page précédente.
--   · `utm_source` — présent uniquement sur un lien de campagne, et c'est le
--     seul moyen de reconnaître le trafic payant, qu'aucun référent ne
--     distingue d'un clic organique.
-- Les agréger dès l'écriture perdrait l'information ; l'étiquette d'affichage
-- est calculée à la LECTURE (voir la RPC plus bas).
--
-- RGPD — même régime que le reste de la table, et deux précautions propres à
-- ce champ :
--   · on ne garde que l'HÔTE du référent, jamais l'URL complète : une URL de
--     référent porte régulièrement la requête de recherche tapée par la
--     personne, et parfois pire sur un lien mal formé ;
--   · `utm_source` est lu SEUL dans la query string (jamais la chaîne
--     entière, qui reste écartée), tronqué, et ne contient par construction
--     qu'un nom de campagne choisi par nous.
-- Aucun des deux ne rend un visiteur identifiable, et l'empreinte reste
-- rotative quotidiennement.
--
-- ⚠️ Colonnes NULLABLES et sans valeur par défaut : les lignes existantes
-- (depuis le 04/09) n'ont pas cette information et ne doivent pas se voir
-- attribuer une provenance qu'on n'a jamais mesurée. `null` veut dire
-- « avant la mise en service », pas « direct ».

alter table public.site_visits
  add column if not exists referrer_host text,
  add column if not exists utm_source    text;

comment on column public.site_visits.referrer_host is
  'Hôte du site référent (jamais l''URL complète). ''(interne)'' = navigation depuis nos propres pages, ''(aucun)'' = referrer vide — qui mélange l''accès direct, les applications et les navigateurs qui le suppriment : ne jamais le lire comme « direct ». NULL = ligne antérieure au 2026-09-14.';

comment on column public.site_visits.utm_source is
  'Paramètre utm_source seul, lu dans la query string qui n''est par ailleurs jamais conservée. Renseigné uniquement sur un lien de campagne.';

-- Index partiel : seules les lignes portant une provenance sont agrégées, et
-- elles resteront longtemps minoritaires dans la table.
create index if not exists idx_site_visits_provenance
  on public.site_visits (jour desc)
  where referrer_host is not null or utm_source is not null;

-- ── Lecture : d'où vient le trafic, et lequel arrive à l'analyse ? ───────────
--
-- L'unité est le VISITEUR-JOUR, pas la page vue : `visitor_hash` tourne chaque
-- jour, on ne peut donc reconstituer un parcours qu'à l'intérieur d'une
-- journée. Quelqu'un qui revient le lendemain compte deux fois au
-- dénominateur — le taux rendu ici est une borne BASSE, et l'écran qui
-- l'affiche doit le dire.
--
-- La provenance d'une session est celle de sa PREMIÈRE page d'origine externe :
-- une fois entré, le visiteur se référence lui-même à chaque clic interne, et
-- compter ces clics écraserait la vraie source.
create or replace function public.admin_visits_provenance(p_days int default 30)
returns table (
  provenance   text,
  visiteurs    bigint,
  pages_vues   bigint,
  vers_analyse bigint
)
language sql
security definer
set search_path = public
as $$
  with sessions as (
    select
      v.jour,
      v.visitor_hash,
      (array_agg(coalesce(v.utm_source, v.referrer_host) order by v.created_at)
         filter (
           where coalesce(v.utm_source, v.referrer_host) is not null
             and coalesce(v.utm_source, v.referrer_host) <> '(interne)'
         ))[1]                                            as provenance,
      count(*)                                            as pages_vues,
      bool_or(v.path like '/nouvelle-analyse%')           as a_clique
    from public.site_visits v
    where v.jour >= ((now() at time zone 'utc')::date - p_days)
      and v.site = 'vmd'
    group by v.jour, v.visitor_hash
  )
  select
    coalesce(s.provenance, '(non mesuré)')::text          as provenance,
    count(*)::bigint                                      as visiteurs,
    sum(s.pages_vues)::bigint                             as pages_vues,
    count(*) filter (where s.a_clique)::bigint            as vers_analyse
  from sessions s
  group by 1
  order by 2 desc;
$$;

comment on function public.admin_visits_provenance(int) is
  'Trafic par provenance sur N jours : visiteurs-jour, pages vues, et combien ont atteint /nouvelle-analyse. ''(non mesuré)'' regroupe les sessions antérieures au 2026-09-14 et celles dont aucune page ne portait de provenance.';

grant execute on function public.admin_visits_provenance(int) to service_role;
