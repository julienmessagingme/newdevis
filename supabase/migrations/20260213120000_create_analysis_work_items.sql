CREATE TABLE analysis_work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  description TEXT NOT NULL,         -- resume < 50 mots genere par Gemini
  category TEXT,                     -- categorie de travaux (ex: "menuiserie")
  amount_ht NUMERIC,                -- montant HT du devis pour ce poste
  quantity NUMERIC,                  -- quantite
  unit TEXT,                         -- unite (m2, unite, ml...)
  n8n_response JSONB,               -- reponse N8N pour ce poste
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour requetes par analyse
CREATE INDEX idx_analysis_work_items_analysis_id ON analysis_work_items(analysis_id);

-- RLS
ALTER TABLE analysis_work_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own work items"
  ON analysis_work_items FOR SELECT
  USING (analysis_id IN (SELECT id FROM analyses WHERE user_id = auth.uid()));
