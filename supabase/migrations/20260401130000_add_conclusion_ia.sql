-- ============================================================
-- Ajout de la colonne conclusion_ia sur la table analyses
-- Stocke le verdict expert généré par Gemini (JSON sérialisé)
-- ============================================================

ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS conclusion_ia TEXT DEFAULT NULL;

COMMENT ON COLUMN analyses.conclusion_ia IS
  'Verdict expert IA (JSON) : phrase_intro, anomalies[], justifications. Généré à la demande via /api/analyse/[id]/conclusion.';
