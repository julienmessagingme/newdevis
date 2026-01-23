-- Add comprehensive debug JSONB fields to document_extractions for qty diagnostics

-- Debug data for OCR (Textract-specific fields)
ALTER TABLE public.document_extractions
ADD COLUMN IF NOT EXISTS request_id uuid DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS force_textract boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS pages_used_list integer[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS text_length_by_page jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS textract_debug jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ocr_debug jsonb DEFAULT NULL;

-- Debug data for parser
ALTER TABLE public.document_extractions
ADD COLUMN IF NOT EXISTS parser_debug jsonb DEFAULT NULL;

-- Debug data for qty_ref detection
ALTER TABLE public.document_extractions
ADD COLUMN IF NOT EXISTS qty_ref_debug jsonb DEFAULT NULL;

-- Debug data for price calculation
ALTER TABLE public.document_extractions
ADD COLUMN IF NOT EXISTS price_debug jsonb DEFAULT NULL;

-- Add comments for clarity
COMMENT ON COLUMN public.document_extractions.request_id IS 'Unique request ID for tracing across edge functions';
COMMENT ON COLUMN public.document_extractions.force_textract IS 'If true, forces Textract OCR regardless of PDF text quality';
COMMENT ON COLUMN public.document_extractions.pages_used_list IS 'List of page numbers processed, e.g. [1,2,3]';
COMMENT ON COLUMN public.document_extractions.text_length_by_page IS 'Text length per page: [{page: 1, length: 500}, ...]';
COMMENT ON COLUMN public.document_extractions.textract_debug IS 'Textract-specific debug: job_id, mode, blocks_count, tables_count, cells_count';
COMMENT ON COLUMN public.document_extractions.ocr_debug IS 'Comprehensive OCR debug metadata';
COMMENT ON COLUMN public.document_extractions.parser_debug IS 'Parser debug: version, sample_lines, detected_units_set, qty_parse_errors';
COMMENT ON COLUMN public.document_extractions.qty_ref_debug IS 'qty_ref detection debug: candidates, selection_rule, failure_reason';
COMMENT ON COLUMN public.document_extractions.price_debug IS 'Price calculation debug: ranges, zone_adjustment, position';