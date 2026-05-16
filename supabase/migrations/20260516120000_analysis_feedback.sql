-- ============================================================================
-- V3.4.14+ (2026-05-16) — Persistance feedback utilisateur sur les analyses
-- ============================================================================
--
-- Avant : la modal FeedbackModal envoyait uniquement vers Amplitude (event
-- `feedback_choice` + `feedback_text`). Aucune trace côté backend, donc
-- impossible de visualiser dans l'admin ou de relancer un user mécontent.
--
-- Après : table dédiée `analysis_feedback` (1 row par soumission), lue par
-- la section Admin "Feedback analyses" et exploitable pour des relances email
-- ciblées (verdict ROUGE + feedback négatif, etc.).
--
-- Contrainte unique (user_id, analysis_id) — un user ne peut soumettre qu'un
-- feedback par analyse. Re-soumission = UPDATE via ON CONFLICT côté API.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.analysis_feedback (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id   UUID         NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  user_id       UUID         NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  choice        TEXT         NOT NULL CHECK (choice IN ('positive','neutral','negative')),
  text          TEXT,
  -- Snapshot du verdict au moment du feedback — utile pour cohorter en admin
  -- (ex: "feedback négatif sur des verdicts ROUGE → wording trop alarmant ?")
  verdict_at_submission TEXT, -- "VERT" | "ORANGE" | "ROUGE" | null
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (user_id, analysis_id)
);

CREATE INDEX IF NOT EXISTS analysis_feedback_created_at_idx ON public.analysis_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS analysis_feedback_choice_idx     ON public.analysis_feedback (choice);
CREATE INDEX IF NOT EXISTS analysis_feedback_analysis_id_idx ON public.analysis_feedback (analysis_id);

-- updated_at auto-update via trigger
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS analysis_feedback_updated_at ON public.analysis_feedback;
CREATE TRIGGER analysis_feedback_updated_at
  BEFORE UPDATE ON public.analysis_feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.analysis_feedback ENABLE ROW LEVEL SECURITY;

-- Insert : l'utilisateur peut soumettre son propre feedback uniquement.
CREATE POLICY "Users insert own feedback" ON public.analysis_feedback
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

-- Select : l'utilisateur voit son propre feedback (utile pour "déjà répondu").
CREATE POLICY "Users select own feedback" ON public.analysis_feedback
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- Update : l'utilisateur peut amender son feedback (idempotence soft).
CREATE POLICY "Users update own feedback" ON public.analysis_feedback
  FOR UPDATE USING (user_id = (SELECT auth.uid()))
              WITH CHECK (user_id = (SELECT auth.uid()));

-- Pas de DELETE policy — un feedback soumis reste, l'admin peut éventuellement
-- supprimer manuellement via le service_role si besoin RGPD.

COMMENT ON TABLE public.analysis_feedback IS
  'Feedback utilisateur sur les analyses de devis (FeedbackModal). 1 row max par (user_id, analysis_id).';
COMMENT ON COLUMN public.analysis_feedback.verdict_at_submission IS
  'Snapshot du verdict global au moment de la soumission — permet de coupler "feedback négatif × verdict ROUGE" sans rejoindre `analyses` à chaque requête.';
