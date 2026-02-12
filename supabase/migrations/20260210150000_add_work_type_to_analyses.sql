-- Add work_type column to analyses table
-- Stores the user-selected work type category for the quote being analyzed
ALTER TABLE public.analyses
ADD COLUMN IF NOT EXISTS work_type text DEFAULT NULL;

COMMENT ON COLUMN public.analyses.work_type IS 'Type de travaux sélectionné par l''utilisateur lors de la soumission du devis';
