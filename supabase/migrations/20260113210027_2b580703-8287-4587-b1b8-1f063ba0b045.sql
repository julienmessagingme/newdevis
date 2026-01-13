-- Ajouter une colonne pour stocker les types de travaux détectés et leurs comparaisons de prix
ALTER TABLE public.analyses 
ADD COLUMN types_travaux JSONB DEFAULT NULL;

-- Commentaire pour documenter la structure
COMMENT ON COLUMN public.analyses.types_travaux IS 'Tableau JSON des types de travaux détectés: [{categorie, libelle, quantite, unite, montant_ht, score_prix, fourchette_min, fourchette_max, zone_type}]';