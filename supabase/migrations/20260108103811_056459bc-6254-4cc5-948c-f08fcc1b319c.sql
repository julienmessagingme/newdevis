-- Create storage bucket for quote files (PDFs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('devis', 'devis', false);

-- RLS policies for the devis bucket
CREATE POLICY "Users can upload their own quotes"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'devis' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own quotes"
ON storage.objects
FOR SELECT
USING (bucket_id = 'devis' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own quotes"
ON storage.objects
FOR DELETE
USING (bucket_id = 'devis' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create table for quote analyses
CREATE TABLE public.analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  score TEXT CHECK (score IN ('VERT', 'ORANGE', 'ROUGE')),
  resume TEXT,
  points_ok JSONB DEFAULT '[]'::jsonb,
  alertes JSONB DEFAULT '[]'::jsonb,
  recommandations JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  error_message TEXT,
  raw_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

-- RLS policies for analyses
CREATE POLICY "Users can view their own analyses"
ON public.analyses
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own analyses"
ON public.analyses
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own analyses"
ON public.analyses
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own analyses"
ON public.analyses
FOR DELETE
USING (auth.uid() = user_id);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for automatic timestamp updates
CREATE TRIGGER update_analyses_updated_at
BEFORE UPDATE ON public.analyses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();