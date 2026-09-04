-- Mesure d'audience first-party — 2026-09-04 (demande Johan)
--
-- Objectif : afficher dans les KPI admin le nombre de visiteurs par jour, et
-- en déduire le funnel « visites → analyses ».
--
-- POURQUOI PAS GOOGLE ANALYTICS. GA4 ne compte que les visiteurs qui ont
-- ACCEPTÉ les cookies — soit une fraction inconnue du trafic réel. Rapporter
-- nos analyses (comptées, elles, à 100 % en base) à un dénominateur amputé
-- donnerait un taux de conversion faussement flatteur. Pour un funnel, les
-- deux bouts doivent être mesurés de la même façon.
--
-- RGPD — mesure d'audience strictement anonyme, conforme aux critères CNIL
-- d'exemption de consentement :
--   · aucun cookie, aucun identifiant persistant ;
--   · `visitor_hash` = SHA-256(IP + user-agent + sel + JOUR), donc un
--     identifiant qui CHANGE CHAQUE JOUR et ne permet aucun suivi dans le
--     temps ni recoupement entre sites ;
--   · ni IP ni user-agent ne sont stockés ;
--   · finalité unique : compter les visites de notre propre site.
-- Conservation : purge automatique au-delà de 13 mois (durée maximale
-- recommandée par la CNIL pour la mesure d'audience).

create table if not exists public.site_visits (
  id          bigserial primary key,
  -- Jour de la visite (UTC). Redondant avec created_at mais indexé : c'est la
  -- seule dimension d'agrégation utilisée.
  jour        date        not null default (now() at time zone 'utc')::date,
  -- Identifiant anonyme ROTATIF (change chaque jour) — permet de distinguer
  -- « visiteurs uniques du jour » de « pages vues », rien de plus.
  visitor_hash text       not null,
  -- Chemin visité, sans query string (jamais de données personnelles en URL).
  path        text        not null,
  -- 'vmd' ou 'gmc' : le layout est partagé entre les deux domaines.
  site        text        not null default 'vmd',
  created_at  timestamptz not null default now()
);

comment on table public.site_visits is
  'Mesure d''audience first-party anonyme. visitor_hash tourne chaque jour : aucun suivi individuel possible. Purge à 13 mois.';

create index if not exists idx_site_visits_jour on public.site_visits (jour desc);
create index if not exists idx_site_visits_jour_visitor on public.site_visits (jour, visitor_hash);

-- Écriture par le service_role uniquement (la route API), lecture idem :
-- aucune policy pour anon/authenticated, la table reste fermée.
alter table public.site_visits enable row level security;

-- Agrégat quotidien : visiteurs uniques + pages vues. Le funnel se calcule
-- côté API en rapprochant ces jours des analyses créées.
create or replace function public.admin_visits_daily(p_days int default 30)
returns table (jour date, visiteurs bigint, pages_vues bigint)
language sql
security definer
set search_path = public
as $$
  select v.jour,
         count(distinct v.visitor_hash) as visiteurs,
         count(*)                       as pages_vues
  from public.site_visits v
  where v.jour >= ((now() at time zone 'utc')::date - p_days)
  group by v.jour
  order by v.jour;
$$;

revoke all on function public.admin_visits_daily(int) from public, anon, authenticated;

-- Purge des visites de plus de 13 mois (appelée par le cron de maintenance).
create or replace function public.purge_site_visits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  supprimees integer;
begin
  delete from public.site_visits
  where jour < ((now() at time zone 'utc')::date - 395);
  get diagnostics supprimees = row_count;
  return supprimees;
end;
$$;

revoke all on function public.purge_site_visits() from public, anon, authenticated;
