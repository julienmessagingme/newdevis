-- Table des prix de référence par catégorie de travaux
CREATE TABLE public.travaux_reference_prix (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  categorie_travaux TEXT NOT NULL UNIQUE,
  unite TEXT NOT NULL DEFAULT 'm²',
  prix_min_national NUMERIC(10,2) NOT NULL,
  prix_max_national NUMERIC(10,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table des coefficients géographiques
CREATE TABLE public.zones_geographiques (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prefixe_postal TEXT NOT NULL UNIQUE,
  type_zone TEXT NOT NULL CHECK (type_zone IN ('grande_ville', 'ville_moyenne', 'province')),
  coefficient NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Activer RLS (lecture publique pour les tables de référence)
ALTER TABLE public.travaux_reference_prix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones_geographiques ENABLE ROW LEVEL SECURITY;

-- Policies de lecture publique (données de référence)
CREATE POLICY "Lecture publique des prix de référence" 
ON public.travaux_reference_prix 
FOR SELECT 
USING (true);

CREATE POLICY "Lecture publique des zones géographiques" 
ON public.zones_geographiques 
FOR SELECT 
USING (true);

-- Trigger pour updated_at
CREATE TRIGGER update_travaux_reference_prix_updated_at
BEFORE UPDATE ON public.travaux_reference_prix
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insérer les grandes villes (coefficient 1.20)
INSERT INTO public.zones_geographiques (prefixe_postal, type_zone, coefficient) VALUES
('75', 'grande_ville', 1.20),
('92', 'grande_ville', 1.20),
('93', 'grande_ville', 1.20),
('94', 'grande_ville', 1.20),
('69', 'grande_ville', 1.20),
('13', 'grande_ville', 1.20),
('33', 'grande_ville', 1.20),
('59', 'grande_ville', 1.20),
('44', 'grande_ville', 1.20);

-- Insérer quelques prix de référence courants (à compléter)
INSERT INTO public.travaux_reference_prix (categorie_travaux, unite, prix_min_national, prix_max_national, description) VALUES
('peinture_interieure', 'm²', 20.00, 45.00, 'Peinture intérieure murs et plafonds'),
('carrelage_sol', 'm²', 40.00, 90.00, 'Pose de carrelage au sol'),
('carrelage_mural', 'm²', 45.00, 100.00, 'Pose de carrelage mural'),
('parquet_stratifie', 'm²', 25.00, 55.00, 'Pose de parquet stratifié'),
('parquet_massif', 'm²', 60.00, 150.00, 'Pose de parquet massif'),
('isolation_combles', 'm²', 20.00, 60.00, 'Isolation des combles perdus'),
('isolation_murs', 'm²', 40.00, 100.00, 'Isolation thermique par l''intérieur'),
('placo_cloison', 'm²', 35.00, 75.00, 'Pose de cloison en placoplatre'),
('electricite_renovation', 'm²', 80.00, 150.00, 'Rénovation électrique complète'),
('plomberie_sdb', 'forfait', 3000.00, 8000.00, 'Rénovation salle de bain complète'),
('cuisine_pose', 'forfait', 1500.00, 5000.00, 'Pose de cuisine équipée'),
('toiture_tuiles', 'm²', 80.00, 180.00, 'Réfection toiture tuiles'),
('facade_ravalement', 'm²', 40.00, 100.00, 'Ravalement de façade'),
('menuiserie_fenetre', 'unité', 300.00, 800.00, 'Fourniture et pose fenêtre PVC'),
('menuiserie_porte', 'unité', 200.00, 600.00, 'Fourniture et pose porte intérieure'),
('chauffage_pac', 'forfait', 8000.00, 18000.00, 'Installation pompe à chaleur'),
('chaudiere_gaz', 'forfait', 3000.00, 7000.00, 'Installation chaudière gaz');