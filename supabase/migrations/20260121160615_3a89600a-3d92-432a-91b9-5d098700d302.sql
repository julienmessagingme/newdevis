-- Table pour cacher les extractions de documents (éviter appels OCR répétés)
CREATE TABLE public.document_extractions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_hash TEXT NOT NULL UNIQUE, -- SHA-256 du fichier
  file_path TEXT NOT NULL,
  analysis_id UUID REFERENCES public.analyses(id) ON DELETE CASCADE,
  
  -- Extraction metadata
  provider TEXT NOT NULL DEFAULT 'pdf_text', -- pdf_text, textract, lovable_ai
  ocr_used BOOLEAN NOT NULL DEFAULT false,
  pages_used INTEGER DEFAULT 1,
  pages_count INTEGER DEFAULT 1,
  quality_score NUMERIC(3,2) DEFAULT 0.00, -- 0-1
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  
  -- Extracted data
  raw_text TEXT,
  blocks JSONB, -- Structured blocks with bounding boxes
  
  -- Parsed output (deterministic parsing)
  parsed_data JSONB, -- totals, payments, lines, work_categories
  qty_ref_detected NUMERIC, -- Surface m² max ou quantité référence
  qty_unit TEXT, -- m², ml, unité, forfait
  
  -- Provider call debug
  provider_calls JSONB, -- latency_ms, error, pages_used per provider
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '30 days')
);

-- Index for fast lookup by hash
CREATE INDEX idx_document_extractions_hash ON public.document_extractions(file_hash);
CREATE INDEX idx_document_extractions_analysis ON public.document_extractions(analysis_id);

-- Enable RLS
ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can view extractions for their own analyses
CREATE POLICY "Users can view their own extractions"
ON public.document_extractions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.analyses
    WHERE analyses.id = document_extractions.analysis_id
    AND analyses.user_id = auth.uid()
  )
);

-- Admins can view all
CREATE POLICY "Admins can view all extractions"
ON public.document_extractions
FOR SELECT
USING (is_admin());

-- Service role can insert/update (edge functions)
-- Note: Edge functions use service role which bypasses RLS