-- Modèle CPM (Critical Path Method) : graph de dépendances multi-parent.
-- Chaque lot peut dépendre de 0..N prédécesseurs (Finish-to-Start).
-- Les dates sont calculées par tri topologique + forward pass.

CREATE TABLE IF NOT EXISTS lot_dependencies (
  lot_id         UUID NOT NULL REFERENCES lots_chantier(id) ON DELETE CASCADE,
  depends_on_id  UUID NOT NULL REFERENCES lots_chantier(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (lot_id, depends_on_id),
  CHECK (lot_id <> depends_on_id)
);

CREATE INDEX IF NOT EXISTS idx_lot_deps_lot ON lot_dependencies(lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_deps_dep ON lot_dependencies(depends_on_id);

ALTER TABLE lot_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY lot_deps_select ON lot_dependencies FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM lots_chantier l
    JOIN chantiers c ON c.id = l.chantier_id
    WHERE l.id = lot_dependencies.lot_id AND c.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY lot_deps_insert ON lot_dependencies FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM lots_chantier l
    JOIN chantiers c ON c.id = l.chantier_id
    WHERE l.id = lot_dependencies.lot_id AND c.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY lot_deps_delete ON lot_dependencies FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM lots_chantier l
    JOIN chantiers c ON c.id = l.chantier_id
    WHERE l.id = lot_dependencies.lot_id AND c.user_id = (SELECT auth.uid())
  )
);

COMMENT ON TABLE lot_dependencies IS
  'Dépendances CPM entre lots (Finish-to-Start, multi-parent). Les dates sont dérivées par tri topologique dans computePlanningDates.';

-- Backfill depuis l'état actuel : pour chaque lot B avec date_debut, les lots A
-- dont date_fin correspond exactement à B.date_debut sont des prédécesseurs.
INSERT INTO lot_dependencies (lot_id, depends_on_id)
SELECT DISTINCT b.id, a.id
FROM lots_chantier b
JOIN lots_chantier a
  ON a.chantier_id = b.chantier_id
  AND a.id <> b.id
WHERE b.date_debut IS NOT NULL
  AND a.date_fin IS NOT NULL
  AND a.date_fin = b.date_debut
ON CONFLICT DO NOTHING;
