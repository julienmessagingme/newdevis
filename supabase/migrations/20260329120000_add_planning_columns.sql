-- Planning chantier : colonnes pour durée, dates et ordonnancement des lots

ALTER TABLE lots_chantier ADD COLUMN IF NOT EXISTS duree_jours INTEGER;
ALTER TABLE lots_chantier ADD COLUMN IF NOT EXISTS date_debut DATE;
ALTER TABLE lots_chantier ADD COLUMN IF NOT EXISTS date_fin DATE;
ALTER TABLE lots_chantier ADD COLUMN IF NOT EXISTS ordre_planning INTEGER;
ALTER TABLE lots_chantier ADD COLUMN IF NOT EXISTS parallel_group INTEGER;

ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS date_debut_chantier DATE;
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS date_fin_souhaitee DATE;

CREATE INDEX IF NOT EXISTS idx_lots_planning ON lots_chantier(chantier_id, ordre_planning);
