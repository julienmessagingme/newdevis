-- Espace Artisan : rattachement doc ↔ artisan. Aujourd'hui documents_chantier est rangé par
-- lot_id, ce qui est INSUFFISANT pour l'isolation (un lot peut avoir plusieurs artisans
-- concurrents → l'artisan A verrait le devis de B). On ajoute contact_id (nullable,
-- backwards-compatible) : un doc déposé par un artisan via son espace porte SON contact_id,
-- et la visibilité artisan filtre sur contact_id (jamais sur lot_id).

alter table public.documents_chantier
  add column if not exists contact_id uuid references public.contacts_chantier(id) on delete set null;

create index if not exists idx_documents_contact_id
  on public.documents_chantier (contact_id) where contact_id is not null;
