-- ============================================================================
-- 2026-08-27 — MESURE D'INTÉRÊT « dommages-ouvrage » (décision Johan)
--
-- Test de 3 mois : après le conseil DO (affiché sur ~25 % des analyses —
-- devis gros œuvre), on demande à l'utilisateur s'il souhaite une proposition
-- sans engagement. AUCUN lead n'est transmis à qui que ce soit : on mesure la
-- demande avant de démarcher un courtier. Règle posée : aucun clic au bout de
-- 3 mois = piste abandonnée.
--
-- Table volontairement minimale : 1 ligne = 1 utilisateur intéressé sur 1
-- analyse (unique), avec le montant du devis (les courtiers facturent la prime
-- en % du montant des travaux — c'est la valeur du lead).
-- ============================================================================

create table if not exists public.do_interest (
  id           uuid primary key default gen_random_uuid(),
  analysis_id  uuid not null references public.analyses(id) on delete cascade,
  user_id      uuid,
  montant_ht   numeric,
  created_at   timestamptz not null default now(),
  unique (analysis_id)
);

comment on table public.do_interest is
  'Mesure d''intérêt pour une proposition d''assurance dommages-ouvrage (test 3 mois ouvert le 2026-08-27). Écrit en service_role uniquement via /api/analyse/[id]/do-interest. Aucun lead transmis à un tiers à ce stade.';

alter table public.do_interest enable row level security;
revoke all on public.do_interest from anon, authenticated;

create index if not exists idx_do_interest_created_at on public.do_interest(created_at desc);

-- ── Suivi du test ───────────────────────────────────────────────────────────
--   select count(*) as clics,
--          sum(montant_ht) as montant_chantiers_cumule,
--          min(created_at) as premier, max(created_at) as dernier
--   from public.do_interest;
