-- 1) Add explicit pipeline status columns to document_extractions (idempotent)
ALTER TABLE public.document_extractions
ADD COLUMN IF NOT EXISTS ocr_status text NOT NULL DEFAULT 'created',
ADD COLUMN IF NOT EXISTS parser_status text NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS qtyref_status text NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS ocr_provider text NULL,
ADD COLUMN IF NOT EXISTS sample_lines jsonb NULL,
ADD COLUMN IF NOT EXISTS detected_units_set text[] NULL,
ADD COLUMN IF NOT EXISTS qtyref_candidates jsonb NULL,
ADD COLUMN IF NOT EXISTS qtyref_failure_reason text NULL;

-- Optional: constrain allowed status values (safe / immutable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_extractions_ocr_status_check'
  ) THEN
    ALTER TABLE public.document_extractions
      ADD CONSTRAINT document_extractions_ocr_status_check
      CHECK (ocr_status IN ('created','extracting','success','failed','timeout'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_extractions_parser_status_check'
  ) THEN
    ALTER TABLE public.document_extractions
      ADD CONSTRAINT document_extractions_parser_status_check
      CHECK (parser_status IN ('pending','parsing','success','failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_extractions_qtyref_status_check'
  ) THEN
    ALTER TABLE public.document_extractions
      ADD CONSTRAINT document_extractions_qtyref_status_check
      CHECK (qtyref_status IN ('pending','computing','success','failed'));
  END IF;
END $$;

-- 2) Ensure a document_extractions row exists immediately after an analysis is created
CREATE OR REPLACE FUNCTION public.create_document_extraction_on_analysis_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id uuid;
BEGIN
  SELECT id INTO existing_id
  FROM public.document_extractions
  WHERE analysis_id = NEW.id
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_id IS NULL THEN
    INSERT INTO public.document_extractions (
      analysis_id,
      file_path,
      file_hash,
      status,
      started_at,
      request_id,
      provider,
      ocr_status,
      parser_status,
      qtyref_status
    ) VALUES (
      NEW.id,
      NEW.file_path,
      'pending:' || NEW.id::text,
      'created',
      now(),
      gen_random_uuid(),
      'pending',
      'created',
      'pending',
      'pending'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_document_extraction_on_analysis_insert ON public.analyses;
CREATE TRIGGER trg_create_document_extraction_on_analysis_insert
AFTER INSERT ON public.analyses
FOR EACH ROW
EXECUTE FUNCTION public.create_document_extraction_on_analysis_insert();

-- 3) Forbid marking an analysis as completed if the extraction row is missing or OCR is not successful
CREATE OR REPLACE FUNCTION public.prevent_analysis_completed_without_successful_ocr()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  extraction_id uuid;
  ocr_status_val text;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    SELECT id, ocr_status
      INTO extraction_id, ocr_status_val
    FROM public.document_extractions
    WHERE analysis_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;

    IF extraction_id IS NULL THEN
      RAISE EXCEPTION 'COMPLETED_WITHOUT_EXTRACTION';
    END IF;

    IF COALESCE(ocr_status_val, 'created') <> 'success' THEN
      RAISE EXCEPTION 'COMPLETED_WITHOUT_OCR_SUCCESS';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_completed_without_extraction ON public.analyses;
CREATE TRIGGER trg_prevent_completed_without_extraction
BEFORE UPDATE ON public.analyses
FOR EACH ROW
EXECUTE FUNCTION public.prevent_analysis_completed_without_successful_ocr();
