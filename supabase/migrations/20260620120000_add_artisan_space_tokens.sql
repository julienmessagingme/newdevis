-- Espace Artisan : tokens d'accès uniques (magic-link, sans compte Supabase).
-- Un token par (artisan × chantier), persistant + révocable (revoked_at). Validé EN LIVE
-- à chaque requête par requireArtisanToken (token non révoqué + abo client actif + contact
-- toujours sur le chantier). RLS activée SANS policy = service-role only (jamais lisible
-- via un JWT client). Le backend (service-role) est le seul à y accéder.

create table if not exists public.artisan_space_tokens (
  id            uuid        primary key default gen_random_uuid(),
  chantier_id   uuid        not null references public.chantiers(id) on delete cascade,
  contact_id    uuid        not null references public.contacts_chantier(id) on delete cascade,
  token         text        not null unique default encode(gen_random_bytes(32), 'hex'),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  constraint artisan_space_tokens_unique_contact unique (chantier_id, contact_id)
);

create index if not exists idx_artisan_tokens_token    on public.artisan_space_tokens (token) where revoked_at is null;
create index if not exists idx_artisan_tokens_chantier on public.artisan_space_tokens (chantier_id);

alter table public.artisan_space_tokens enable row level security;
-- Aucune policy : anon/authenticated = 0 accès ; seul le service-role (qui bypass RLS) lit/écrit.
