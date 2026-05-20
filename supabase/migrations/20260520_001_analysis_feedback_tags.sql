-- ============================================================================
-- V3.4.20+ (2026-05-20) — Tags causes sur analysis_feedback
-- ============================================================================
--
-- Quand le user clique "Pas vraiment" (choice='negative'), on lui propose 7
-- chips pour identifier la cause racine du feedback négatif :
--   - mauvaise_entreprise (entreprise affichée ≠ celle du devis)
--   - faux_radiee         (entreprise dite radiée alors qu'elle est active)
--   - siret_non_extrait   (SIRET du PDF pas capté par l'extraction)
--   - prix_marche_incorrect (fourchette marché pas pertinente)
--   - verdict_incoherent  (verdict ne reflète pas la situation réelle)
--   - mauvais_type_doc    (estimation/MOE/diagnostic traité comme devis)
--   - autre               (free text obligatoire si seul tag)
--
-- Permet d'identifier rapidement les bugs structurels en prod (cf. V3.4.19+20
-- qui ont été identifiés grâce à 1 feedback négatif Julien — sans tag, j'ai
-- dû demander quel devis poser problème).
--
-- Idempotent.
-- ============================================================================

ALTER TABLE public.analysis_feedback
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- Index GIN pour les requêtes du dashboard admin type "WHERE 'faux_radiee' = ANY(tags)"
CREATE INDEX IF NOT EXISTS analysis_feedback_tags_idx ON public.analysis_feedback USING GIN (tags);

COMMENT ON COLUMN public.analysis_feedback.tags IS
  'Causes du feedback négatif sélectionnées par l''utilisateur (chips multi-select). Liste blanche enforced côté API : mauvaise_entreprise, faux_radiee, siret_non_extrait, prix_marche_incorrect, verdict_incoherent, mauvais_type_doc, autre.';
