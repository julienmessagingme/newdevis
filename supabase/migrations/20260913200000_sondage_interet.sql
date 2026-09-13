-- ============================================================================
-- 2026-09-13 — LE TEST D'INTÉRÊT DEVIENT UN SONDAGE (décision Johan)
--
-- Constat qui déclenche ce changement, mesuré le 13/09 sur les analyses depuis
-- l'ouverture du test le 29/08 :
--
--     dommages-ouvrage :  2 affichages,  0 clic
--     financement      : 16 affichages,  0 clic
--
-- Deux défauts de CONCEPTION, pas de rédaction :
--
--   1. UN BOUTON À SENS UNIQUE NE MESURE RIEN. La seule réponse possible était
--      « Oui, ça m'intéresse ». Celui qui pense « non » ne clique pas — et on
--      n'enregistre rien. Impossible de distinguer « pas intéressé » de « n'a
--      pas osé cliquer » et de « n'a jamais fait défiler jusque-là ».
--
--   2. ON NE COMPTAIT PAS LES AFFICHAGES. Le seuil de décision inscrit dans
--      les règles du projet — 15 % de clics — était donc INCALCULABLE : il a
--      fallu reconstituer les affichages hors production en rejouant les
--      conditions d'affichage. Une mesure dont on ne connaît pas le
--      dénominateur n'est pas une mesure.
--
-- Ce que change cette migration :
--   · `reponse` — chaque réponse est une donnée, y compris les négatives ;
--   · les affichages passent par `site_events` (table du test des calculettes,
--     liste fermée d'événements), pas ici : ils sont anonymes et nombreux.
--
-- ⚠️ RIEN N'EST TRANSMIS À UN TIERS, et le remerciement le dit désormais pour
-- ce qu'il est : « ça nous aide à décider si nous développons ce service ».
-- Plus aucun mot d'offre — ni « proposition », ni « sans engagement ».
-- ============================================================================

alter table public.lead_interest
  add column if not exists reponse text;

comment on column public.lead_interest.reponse is
  'Réponse au sondage : « interesse » | « deja_equipe » | « non ». NULL pour les lignes créées avant le 2026-09-13, où seul le clic positif existait — elles valent donc « interesse ».';

-- Les lignes antérieures n'avaient qu'une lecture possible : un clic sur
-- « Oui, ça m'intéresse ». On les qualifie pour que les comptages restent
-- justes sans cas particulier. (Au 13/09 la table est vide — l'instruction est
-- écrite pour le jour où elle ne le sera plus.)
update public.lead_interest set reponse = 'interesse' where reponse is null;

-- ⚠️ Une contrainte de valeurs, pas un enum : ajouter une réponse au sondage ne
-- doit pas demander une migration de type.
alter table public.lead_interest
  drop constraint if exists lead_interest_reponse_check;
alter table public.lead_interest
  add constraint lead_interest_reponse_check
  check (reponse is null or reponse in ('interesse', 'deja_equipe', 'non'));

create index if not exists idx_lead_interest_topic_reponse
  on public.lead_interest(topic, reponse);

-- ── Suivi du test ───────────────────────────────────────────────────────────
--   -- réponses
--   select topic, reponse, count(*)
--   from public.lead_interest group by 1, 2 order by 1, 2;
--
--   -- affichages (le dénominateur qui manquait)
--   select event, count(*)
--   from public.site_events
--   where event in ('sondage_do_vu', 'sondage_credit_vu')
--   group by 1;
-- ============================================================================
