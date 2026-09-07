-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-07 (retour Johan) — RELIER LES ANALYSES ISSUES D'UN MÊME DOCUMENT
--
-- Le lot fonctionne : deux devis d'un même PDF donnent deux analyses. Mais dès
-- que l'utilisateur ouvre la première, il quitte l'écran de suivi et **ne
-- retrouve plus la seconde** : elle existe en base, rien ne la relie à celle
-- qu'il regarde, et rien ne la lui signale.
--
-- `batch_id` est l'identifiant du DOCUMENT d'origine, partagé par toutes les
-- analyses qui en sont issues. Il permet trois choses :
--   · afficher « ce devis fait partie d'un document qui en contenait N » ;
--   · offrir le lien vers les autres depuis n'importe laquelle ;
--   · pré-sélectionner le groupe dans le comparateur.
--
-- Nullable : toutes les analyses existantes et tous les dépôts d'un seul devis
-- restent sans lot, ce qui est l'état normal.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.analyses
  ADD COLUMN IF NOT EXISTS batch_id UUID;

COMMENT ON COLUMN public.analyses.batch_id IS
  'Identifiant du document multi-devis d''origine, partagé par les analyses issues du même PDF découpé. NULL pour un dépôt classique.';

-- Index partiel : seules les analyses en lot sont concernées, et la requête est
-- toujours « les analyses de CE lot pour CET utilisateur ».
CREATE INDEX IF NOT EXISTS idx_analyses_batch
  ON public.analyses (batch_id, user_id)
  WHERE batch_id IS NOT NULL;
