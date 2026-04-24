-- Ajoute lane_index pour que la position visuelle (lane) soit EXPLICITE
-- et pas seulement dérivée des dates via first-fit.
--
-- NULL = lane dérivée automatiquement par first-fit (comportement initial).
-- Valeur = lane visuelle forcée (0 = main chain, 1+ = side lanes).
--
-- Le D&D met à jour lane_index + snapshot des lots visibles pour préserver
-- l'intention utilisateur quand plusieurs lots pourraient coexister sur
-- plusieurs lanes.

ALTER TABLE lots_chantier
  ADD COLUMN IF NOT EXISTS lane_index INTEGER;

COMMENT ON COLUMN lots_chantier.lane_index IS
  'Lane visuelle explicite (0 = main chain, 1+ = side lanes). NULL = dérivée par first-fit sur dates. Mise à jour au D&D.';
