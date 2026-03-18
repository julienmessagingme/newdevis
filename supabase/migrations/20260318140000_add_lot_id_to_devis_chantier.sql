-- Add lot_id column to devis_chantier for linking quotes to specific work lots
ALTER TABLE devis_chantier
  ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES lots_chantier(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_devis_chantier_lot_id ON devis_chantier(lot_id);
