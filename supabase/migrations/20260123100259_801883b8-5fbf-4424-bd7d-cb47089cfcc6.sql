-- Add status column to document_extractions for pipeline tracking
ALTER TABLE public.document_extractions 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'created' 
CHECK (status IN ('created', 'extracting', 'extracted', 'parsing', 'parsed', 'failed', 'timeout'));

-- Add started_at for timeout detection
ALTER TABLE public.document_extractions 
ADD COLUMN IF NOT EXISTS started_at timestamp with time zone DEFAULT now();

-- Add error_code and error_message columns for explicit error tracking
ALTER TABLE public.document_extractions 
ADD COLUMN IF NOT EXISTS error_code text;

ALTER TABLE public.document_extractions 
ADD COLUMN IF NOT EXISTS error_details jsonb;

-- Index for circuit breaker queries (recent failures by file_hash)
CREATE INDEX IF NOT EXISTS idx_document_extractions_recent_failures 
ON public.document_extractions (file_hash, created_at) 
WHERE status IN ('failed', 'timeout');

-- Comment for clarity
COMMENT ON COLUMN public.document_extractions.status IS 'Pipeline status: created → extracting → extracted → parsing → parsed | failed/timeout';
COMMENT ON COLUMN public.document_extractions.started_at IS 'When extraction started, for timeout detection';
COMMENT ON COLUMN public.document_extractions.error_code IS 'Error code if failed: OCR_TIMEOUT, OCR_FAILED, PARSE_FAILED, etc.';
COMMENT ON COLUMN public.document_extractions.error_details IS 'Detailed error info for debugging';