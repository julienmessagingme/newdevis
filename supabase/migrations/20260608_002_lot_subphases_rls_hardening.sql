-- Durcissement RLS + index FK pour le sous-planning (suite revue étape 0).
-- Cf. docs/plans/2026-06-08-sous-planning-PLAN.md.
--
-- Problème corrigé : la RLS initiale faisait confiance au chantier_id dénormalisé
-- (fourni par le client). On dérive désormais l'ownership du lot réel et on valide
-- la cohérence chantier_id == lot.chantier_id, ainsi que l'appartenance au chantier
-- de tous les endpoints d'une arête (à l'écriture). Plus aucune arête/sous-phase
-- cross-tenant possible.

-- ─────────────────────────────────────────────────────────────────────────────
-- lot_subphases : ownership dérivé du lot + cohérence chantier_id
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS lot_subphases_owner_all ON lot_subphases;
CREATE POLICY lot_subphases_owner_all ON lot_subphases FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM lots_chantier l
      JOIN chantiers c ON c.id = l.chantier_id
      WHERE l.id = lot_subphases.lot_id
        AND l.chantier_id = lot_subphases.chantier_id
        AND c.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lots_chantier l
      JOIN chantiers c ON c.id = l.chantier_id
      WHERE l.id = lot_subphases.lot_id
        AND l.chantier_id = lot_subphases.chantier_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- planning_subphase_deps : lecture cloisonnée par chantier possédé ; écriture
-- exige en plus que TOUS les endpoints non-null appartiennent à ce chantier.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS psd_owner_all ON planning_subphase_deps;
CREATE POLICY psd_owner_all ON planning_subphase_deps FOR ALL
  USING (
    EXISTS (SELECT 1 FROM chantiers c
            WHERE c.id = planning_subphase_deps.chantier_id
              AND c.user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM chantiers c
            WHERE c.id = planning_subphase_deps.chantier_id
              AND c.user_id = (SELECT auth.uid()))
    AND (planning_subphase_deps.from_lot_id IS NULL OR EXISTS (
          SELECT 1 FROM lots_chantier l
          WHERE l.id = planning_subphase_deps.from_lot_id
            AND l.chantier_id = planning_subphase_deps.chantier_id))
    AND (planning_subphase_deps.from_subphase_id IS NULL OR EXISTS (
          SELECT 1 FROM lot_subphases s
          WHERE s.id = planning_subphase_deps.from_subphase_id
            AND s.chantier_id = planning_subphase_deps.chantier_id))
    AND (planning_subphase_deps.to_lot_id IS NULL OR EXISTS (
          SELECT 1 FROM lots_chantier l
          WHERE l.id = planning_subphase_deps.to_lot_id
            AND l.chantier_id = planning_subphase_deps.chantier_id))
    AND (planning_subphase_deps.to_subphase_id IS NULL OR EXISTS (
          SELECT 1 FROM lot_subphases s
          WHERE s.id = planning_subphase_deps.to_subphase_id
            AND s.chantier_id = planning_subphase_deps.chantier_id))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Index FK manquants (Postgres n'indexe pas les FK auto) : accélère le CASCADE
-- de suppression d'un lot + les requêtes "arêtes d'un lot".
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_psd_from_lot ON planning_subphase_deps(from_lot_id);
CREATE INDEX IF NOT EXISTS idx_psd_to_lot ON planning_subphase_deps(to_lot_id);
