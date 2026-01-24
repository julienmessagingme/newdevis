-- Table des références de prix par type de travail (maintenable)
CREATE TABLE public.market_price_refs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_type TEXT NOT NULL,
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'unité',
  min_unit_price NUMERIC NOT NULL,
  max_unit_price NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(job_type, item_key)
);

-- Enable RLS
ALTER TABLE public.market_price_refs ENABLE ROW LEVEL SECURITY;

-- Lecture publique
CREATE POLICY "Lecture publique des prix marché" 
ON public.market_price_refs 
FOR SELECT 
USING (true);

-- Admins can manage
CREATE POLICY "Admins peuvent gérer les prix marché" 
ON public.market_price_refs 
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Trigger for updated_at
CREATE TRIGGER update_market_price_refs_updated_at
BEFORE UPDATE ON public.market_price_refs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial data for volets roulants
INSERT INTO public.market_price_refs (job_type, item_key, label, unit, min_unit_price, max_unit_price, notes) VALUES
  ('volets_roulants', 'tablier_volet_alu', 'Tablier volet roulant alu', 'unité', 80, 180, 'Fourniture tablier aluminium standard'),
  ('volets_roulants', 'tablier_volet_pvc', 'Tablier volet roulant PVC', 'unité', 50, 120, 'Fourniture tablier PVC standard'),
  ('volets_roulants', 'pose_tablier', 'Pose tablier volet roulant', 'unité', 60, 150, 'Main-d''œuvre pose'),
  ('volets_roulants', 'moteur_volet', 'Motorisation volet roulant', 'unité', 150, 400, 'Moteur + télécommande'),
  ('volets_roulants', 'pose_moteur', 'Pose motorisation', 'unité', 80, 180, 'Main-d''œuvre pose moteur'),
  ('volets_roulants', 'volet_complet', 'Volet roulant complet (fourni + posé)', 'unité', 250, 600, 'Fourniture et pose complète'),
  ('menuiserie', 'fenetre_pvc', 'Fenêtre PVC double vitrage', 'unité', 200, 500, 'Fourniture standard'),
  ('menuiserie', 'fenetre_alu', 'Fenêtre aluminium', 'unité', 350, 800, 'Fourniture'),
  ('menuiserie', 'porte_entree', 'Porte d''entrée', 'unité', 600, 2500, 'Fourniture'),
  ('menuiserie', 'pose_fenetre', 'Pose fenêtre', 'unité', 150, 350, 'Main-d''œuvre'),
  ('plomberie', 'chauffe_eau_150l', 'Chauffe-eau 150L', 'unité', 400, 800, 'Fourniture'),
  ('plomberie', 'pose_chauffe_eau', 'Pose chauffe-eau', 'unité', 200, 400, 'Main-d''œuvre'),
  ('plomberie', 'robinetterie', 'Robinetterie', 'unité', 80, 300, 'Mitigeur standard'),
  ('electricite', 'tableau_electrique', 'Tableau électrique', 'unité', 300, 800, 'Fourniture'),
  ('electricite', 'prise_electrique', 'Point électrique (prise)', 'unité', 40, 100, 'Fourniture + pose'),
  ('electricite', 'interrupteur', 'Interrupteur', 'unité', 30, 80, 'Fourniture + pose');