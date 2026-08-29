-- ============================================================================
-- 2026-08-29 — TESTS D'INTÉRÊT GÉNÉRALISÉS (décision Johan)
--
-- Le test dommages-ouvrage (27/08) est rejoint par un test « proposition de
-- crédit travaux ». Plutôt qu'une table par idée, une table générique avec un
-- `topic` : les prochains tests (assurance emprunteur, courtier, garantie…)
-- réutiliseront la même mécanique — endpoint, UI et KPI admin compris.
--
-- `do_interest` (créée le 27/08, 0 ligne) est remplacée : aucune donnée à
-- migrer, on la supprime pour ne pas laisser deux sources de vérité.
--
-- Rappel : AUCUN lead n'est transmis à un tiers. On mesure la demande avant
-- de démarcher un partenaire. Verdict de chaque test à 3 mois.
-- ============================================================================

create table if not exists public.lead_interest (
  id           uuid primary key default gen_random_uuid(),
  topic        text not null check (topic in ('dommages_ouvrage', 'credit')),
  analysis_id  uuid not null references public.analyses(id) on delete cascade,
  user_id      uuid,
  montant_ht   numeric,
  created_at   timestamptz not null default now(),
  unique (analysis_id, topic)
);

comment on table public.lead_interest is
  'Mesure d''intérêt utilisateur par sujet (dommages_ouvrage, credit…). Écrit en service_role via /api/analyse/[id]/interest. Aucun lead transmis à un tiers à ce stade — mesure de demande uniquement.';

alter table public.lead_interest enable row level security;
revoke all on public.lead_interest from anon, authenticated;

create index if not exists idx_lead_interest_topic_created
  on public.lead_interest(topic, created_at desc);

-- Reprise des éventuelles lignes de l'ancienne table, puis suppression.
insert into public.lead_interest (topic, analysis_id, user_id, montant_ht, created_at)
select 'dommages_ouvrage', analysis_id, user_id, montant_ht, created_at
from public.do_interest
on conflict (analysis_id, topic) do nothing;

drop table if exists public.do_interest;

-- ── Suivi des tests ─────────────────────────────────────────────────────────
--   select topic, count(*) as clics, sum(montant_ht) as montant_cumule
--   from public.lead_interest group by topic;
