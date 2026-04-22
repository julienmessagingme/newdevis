-- Ajoute un délai optionnel avant chaque lot pour permettre à l'agent IA
-- (et au D&D manuel) de décaler un lot sans impacter les autres.
-- computePlanningDates prend ce délai en compte avant de placer le lot.

ALTER TABLE lots_chantier
  ADD COLUMN IF NOT EXISTS delai_avant_jours INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN lots_chantier.delai_avant_jours IS
  'Nombre de jours ouvrés de délai à ajouter AVANT ce lot dans le calcul du planning. Permet de décaler un lot sans toucher aux autres (ex: agent IA "bouge la plomberie d''une semaine"). 0 par défaut.';
