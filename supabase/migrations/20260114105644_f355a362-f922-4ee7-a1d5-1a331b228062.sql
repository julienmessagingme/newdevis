-- Table pour stocker les informations de suivi post-signature
CREATE TABLE public.post_signature_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  -- Consentement
  tracking_consent BOOLEAN NOT NULL DEFAULT false,
  consent_date TIMESTAMP WITH TIME ZONE,
  communication_channel TEXT DEFAULT 'email', -- email, whatsapp
  phone_number TEXT,
  
  -- Statut de signature
  is_signed BOOLEAN NOT NULL DEFAULT false,
  signed_date TIMESTAMP WITH TIME ZONE,
  
  -- Dates extraites du devis
  work_start_date DATE,
  work_end_date DATE,
  max_execution_days INTEGER,
  
  -- Informations entreprise pour surveillance
  company_siret TEXT,
  company_name TEXT,
  
  -- Suivi des alertes
  deadline_alert_sent BOOLEAN DEFAULT false,
  deadline_alert_date TIMESTAMP WITH TIME ZONE,
  admin_alert_sent BOOLEAN DEFAULT false,
  admin_alert_date TIMESTAMP WITH TIME ZONE,
  admin_alert_type TEXT,
  
  -- Réponse utilisateur (optionnelle)
  work_completion_status TEXT, -- 'oui', 'en_cours', 'non_retard'
  work_completion_response_date TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.post_signature_tracking ENABLE ROW LEVEL SECURITY;

-- Policies for user access
CREATE POLICY "Users can view their own tracking" 
ON public.post_signature_tracking 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tracking" 
ON public.post_signature_tracking 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tracking" 
ON public.post_signature_tracking 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Trigger for automatic timestamp updates
CREATE TRIGGER update_post_signature_tracking_updated_at
BEFORE UPDATE ON public.post_signature_tracking
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for efficient lookups
CREATE INDEX idx_post_signature_tracking_analysis_id ON public.post_signature_tracking(analysis_id);
CREATE INDEX idx_post_signature_tracking_user_id ON public.post_signature_tracking(user_id);
CREATE INDEX idx_post_signature_tracking_deadline ON public.post_signature_tracking(work_end_date) WHERE tracking_consent = true AND deadline_alert_sent = false;