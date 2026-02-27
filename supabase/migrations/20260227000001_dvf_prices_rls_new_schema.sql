-- ============================================================
-- Migration : RLS policy pour la table dvf_prices (nouveau schéma)
-- Table créée manuellement avec : code_insee, commune, code_postal,
--   prix_m2, source, updated_at
-- ============================================================

-- S'assurer que RLS est activé
alter table if exists public.dvf_prices enable row level security;

-- Supprimer l'éventuelle ancienne policy (issue de l'ancien schéma)
drop policy if exists "dvf_prices_public_read" on public.dvf_prices;

-- Lecture publique — données DVF = données publiques data.gouv.fr
create policy "dvf_prices_public_read"
  on public.dvf_prices
  for select
  to anon, authenticated
  using (true);

-- Index sur code_postal pour le fallback de recherche par CP
create index if not exists idx_dvf_prices_code_postal
  on public.dvf_prices (code_postal);
