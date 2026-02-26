-- ============================================================
-- Migration : table dvf_prices
-- Cache des prix DVF par commune (source : data.gouv.fr)
-- Alimenté via scripts/import-dvf-prices.ts
-- ============================================================

create table if not exists public.dvf_prices (
  code_insee            text        primary key,
  commune               text        not null,
  prix_m2_maison        numeric,
  prix_m2_appartement   numeric,
  nb_ventes_maison      int,
  nb_ventes_appartement int,
  period                text        not null default '12m',
  updated_at            timestamptz not null default now()
);

comment on table public.dvf_prices is
  'Cache prix marché DVF par commune (maison / appartement). '
  'Source : Demandes de Valeurs Foncières – data.gouv.fr. '
  'Alimenté via scripts/import-dvf-prices.ts.';

comment on column public.dvf_prices.code_insee   is 'Code INSEE commune (5 car.)';
comment on column public.dvf_prices.prix_m2_maison      is 'Médiane prix/m² – Maison (€)';
comment on column public.dvf_prices.prix_m2_appartement is 'Médiane prix/m² – Appartement (€)';
comment on column public.dvf_prices.nb_ventes_maison     is 'Nb de ventes Maison retenues';
comment on column public.dvf_prices.nb_ventes_appartement is 'Nb de ventes Appartement retenues';
comment on column public.dvf_prices.period       is 'Période de calcul (ex: 12m = 12 mois glissants)';

-- L'index sur la PK couvre déjà code_insee, mais on l'explicite pour la doc
create index if not exists idx_dvf_prices_code_insee
  on public.dvf_prices (code_insee);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.dvf_prices enable row level security;

-- Lecture publique (anon + authenticated) — données DVF = données publiques
create policy "dvf_prices_public_read"
  on public.dvf_prices
  for select
  to anon, authenticated
  using (true);
