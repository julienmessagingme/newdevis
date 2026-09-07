-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-07 (décision Johan) — MESURER L'USAGE DES CALCULETTES AVANT DE
-- TRANCHER.
--
-- Contexte : sur 4 jours et 425 visiteurs de la page d'accueil, /calculette-
-- travaux a reçu 1 visiteur et /simulateur-valorisation-travaux zéro. Plutôt
-- que de supprimer sur un échantillon de 4 jours, on instrumente et on décide
-- dans 30 jours.
--
-- ⚠️ POURQUOI UNE VUE DE PAGE NE SUFFIT PAS. `site_visits` dit combien de
-- personnes ARRIVENT sur /calculette-travaux ; il ne dit pas combien s'en
-- servent. Une calculette que l'on ouvre et que l'on referme sans rien calculer
-- n'a aucune valeur, et c'est précisément la question posée. On enregistre donc
-- l'ÉVÉNEMENT « un résultat a été produit », pas seulement la visite.
--
-- RGPD — strictement le même régime que `site_visits`, et pour les mêmes
-- raisons :
--   · aucun cookie, aucun identifiant persistant ;
--   · `visitor_hash` = SHA-256(IP + user-agent + sel + JOUR) : il CHANGE chaque
--     jour, ne permet aucun suivi dans le temps ni recoupement ;
--   · ni IP ni user-agent conservés ; aucune donnée saisie dans la calculette
--     (code postal, surface, type de travaux) n'est enregistrée — seul le fait
--     qu'un calcul a eu lieu ;
--   · finalité unique : mesure d'audience de notre propre site.
-- Conservation : purge au-delà de 13 mois, comme les visites.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.site_events (
  id           bigserial primary key,
  jour         date        not null default (now() at time zone 'utc')::date,
  -- Identifiant anonyme ROTATIF (change chaque jour) : permet de distinguer
  -- « combien de personnes ont calculé » de « combien de calculs », rien de plus.
  visitor_hash text        not null,
  -- Nom d'événement, contraint par une ALLOWLIST côté API : la route est
  -- publique et non authentifiée, elle ne doit pas devenir un journal ouvert.
  event        text        not null,
  site         text        not null default 'vmd',
  created_at   timestamptz not null default now()
);

comment on table public.site_events is
  'Événements d''usage anonymes (usage des calculettes). Même régime que site_visits : visitor_hash rotatif quotidien, aucune donnée saisie conservée, purge à 13 mois. Les noms d''événements sont contraints par une allowlist dans /api/track/event.';

create index if not exists idx_site_events_jour_event on public.site_events (jour desc, event);

-- Écriture et lecture par le service_role uniquement (routes API) : la table
-- reste fermée, aucune policy pour anon/authenticated.
alter table public.site_events enable row level security;

-- Agrégat par événement sur la fenêtre demandée.
create or replace function public.admin_events_usage(p_days int default 30)
returns table (event text, occurrences bigint, personnes bigint)
language sql
security definer
set search_path = public
as $$
  select e.event,
         count(*)                        as occurrences,
         count(distinct e.visitor_hash)  as personnes
  from public.site_events e
  where e.jour >= ((now() at time zone 'utc')::date - p_days)
  group by e.event
  order by count(*) desc;
$$;

revoke all on function public.admin_events_usage(int) from public, anon, authenticated;

-- Visiteurs uniques par chemin — pour rapprocher « ouvertures de la page » et
-- « calculs effectués ». Sans ce rapprochement on ne saurait pas si une
-- calculette est ignorée parce qu'on n'y arrive pas, ou parce qu'elle déçoit.
create or replace function public.admin_visits_by_path(p_days int default 30, p_paths text[] default null)
returns table (path text, visiteurs bigint, pages_vues bigint)
language sql
security definer
set search_path = public
as $$
  select v.path,
         count(distinct v.visitor_hash) as visiteurs,
         count(*)                       as pages_vues
  from public.site_visits v
  where v.jour >= ((now() at time zone 'utc')::date - p_days)
    and (p_paths is null or v.path = any(p_paths))
  group by v.path
  order by count(distinct v.visitor_hash) desc;
$$;

revoke all on function public.admin_visits_by_path(int, text[]) from public, anon, authenticated;

-- Purge alignée sur celle des visites (13 mois).
create or replace function public.purge_site_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  supprimees integer;
begin
  delete from public.site_events
  where jour < ((now() at time zone 'utc')::date - 395);
  get diagnostics supprimees = row_count;
  return supprimees;
end;
$$;

revoke all on function public.purge_site_events() from public, anon, authenticated;
