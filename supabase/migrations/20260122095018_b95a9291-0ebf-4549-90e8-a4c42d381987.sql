-- Add new columns for strict Textract triggering logic
ALTER TABLE public.document_extractions 
ADD COLUMN IF NOT EXISTS text_length integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS contains_table_signals boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ocr_reason text DEFAULT NULL;