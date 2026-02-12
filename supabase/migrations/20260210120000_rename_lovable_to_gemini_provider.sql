-- Rename lovable_ai provider to gemini_ai in document_extractions
UPDATE public.document_extractions SET provider = 'gemini_ai' WHERE provider = 'lovable_ai';
COMMENT ON COLUMN public.document_extractions.provider IS 'pdf_text, textract, gemini_ai';
