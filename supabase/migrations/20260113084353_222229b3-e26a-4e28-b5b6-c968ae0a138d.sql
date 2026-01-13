
-- Add Level 2 attestation verification columns to analyses table
ALTER TABLE public.analyses
ADD COLUMN IF NOT EXISTS attestation_decennale_url text,
ADD COLUMN IF NOT EXISTS attestation_rcpro_url text,
ADD COLUMN IF NOT EXISTS attestation_analysis jsonb,
ADD COLUMN IF NOT EXISTS attestation_comparison jsonb,
ADD COLUMN IF NOT EXISTS assurance_level2_score text,
ADD COLUMN IF NOT EXISTS assurance_source text DEFAULT 'devis';

-- Add comment for documentation
COMMENT ON COLUMN public.analyses.attestation_decennale_url IS 'URL of uploaded decennale attestation document';
COMMENT ON COLUMN public.analyses.attestation_rcpro_url IS 'URL of uploaded RC Pro attestation document';
COMMENT ON COLUMN public.analyses.attestation_analysis IS 'AI analysis results of attestation documents';
COMMENT ON COLUMN public.analyses.attestation_comparison IS 'Comparison results between quote and attestation';
COMMENT ON COLUMN public.analyses.assurance_level2_score IS 'Level 2 assurance score (overrides level 1 if provided)';
COMMENT ON COLUMN public.analyses.assurance_source IS 'Source of assurance analysis: devis or devis+attestation';
