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

-- Comments on columns — wrapped in DO block for idempotency
-- (table may already exist with different column names after dvf_prices_yearly migration)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dvf_prices' AND column_name = 'prix_m2_maison'
  ) THEN
    COMMENT ON COLUMN public.dvf_prices.code_insee IS 'Code INSEE commune (5 car.)';
    COMMENT ON COLUMN public.dvf_prices.prix_m2_maison IS 'Médiane prix/m² – Maison (€)';
    COMMENT ON COLUMN public.dvf_prices.prix_m2_appartement IS 'Médiane prix/m² – Appartement (€)';
    COMMENT ON COLUMN public.dvf_prices.nb_ventes_maison IS 'Nb de ventes Maison retenues';
    COMMENT ON COLUMN public.dvf_prices.nb_ventes_appartement IS 'Nb de ventes Appartement retenues';
    COMMENT ON COLUMN public.dvf_prices.period IS 'Période de calcul (ex: 12m = 12 mois glissants)';
  END IF;
END $$;

-- L'index sur la PK couvre déjà code_insee, mais on l'explicite pour la doc
create index if not exists idx_dvf_prices_code_insee
  on public.dvf_prices (code_insee);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.dvf_prices enable row level security;

-- Lecture publique (anon + authenticated) — données DVF = données publiques
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'dvf_prices' AND policyname = 'dvf_prices_public_read'
  ) THEN
    CREATE POLICY "dvf_prices_public_read"
      ON public.dvf_prices
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;
