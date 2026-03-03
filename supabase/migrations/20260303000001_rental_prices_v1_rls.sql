-- ============================================================
-- Migration : RLS + lecture publique sur rental_prices_v1
-- La table est peuplée via import CSV (données locatives).
-- Le frontend (anon key) doit pouvoir lire les prix.
-- ============================================================

-- Activer RLS (nécessaire pour que les policies s'appliquent)
alter table if exists public.rental_prices_v1 enable row level security;

-- Index sur la PK pour les lookups par code_insee
create index if not exists idx_rental_prices_v1_code_insee
  on public.rental_prices_v1 (code_insee);

-- Lecture publique — données locatives = données publiques
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'rental_prices_v1'
      and policyname = 'rental_prices_v1_public_read'
  ) then
    create policy "rental_prices_v1_public_read"
      on public.rental_prices_v1
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;
