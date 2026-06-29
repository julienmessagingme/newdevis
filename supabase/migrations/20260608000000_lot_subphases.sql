-- Sous-planning intra-phase (feature premium GMC) — migration additive, zéro impact prod.
-- Cf. docs/plans/2026-06-08-sous-planning-PLAN.md (étape 0).
--
-- Le lot (lots_chantier) reste l'unité de budget/devis/facture/intervenant/statut.
-- Les sous-phases sont une unité d'ORDONNANCEMENT uniquement : elles affinent le
-- planning d'un lot et peuvent dépendre les unes des autres, y compris entre lots
-- différents (cross-métier : "Électricité démarre quand Mise en eau du Plombier est finie").
-- lots_chantier n'est PAS modifié ; ses date_debut/date_fin restent dérivés (min/max
-- des sous-phases) donc tous les lecteurs actuels continuent de fonctionner.

-- ─────────────────────────────────────────────────────────────────────────────
-- Table : sous-phases d'un lot
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lot_subphases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id            UUID NOT NULL REFERENCES lots_chantier(id) ON DELETE CASCADE,
  chantier_id       UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  nom               TEXT NOT NULL,
  ordre             INTEGER NOT NULL DEFAULT 0,
  duree_jours       INTEGER,
  delai_avant_jours INTEGER NOT NULL DEFAULT 0,
  date_debut        DATE,
  date_fin          DATE,
  statut            TEXT NOT NULL DEFAULT 'a_faire'
                    CHECK (statut IN ('a_faire','en_cours','termine')),
  lane_index        INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lot_subphases_lot ON lot_subphases(lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_subphases_chantier ON lot_subphases(chantier_id);

COMMENT ON TABLE lot_subphases IS
  'Sous-phases d''ordonnancement d''un lot (feature premium GMC). Le lot reste l''unité budget/statut ; les dates du lot dérivent du min/max des sous-phases.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Table : dépendances du graphe AVANCÉ (un endpoint = un lot OU une sous-phase)
-- Ne stocke QUE les arêtes impliquant >= 1 sous-phase. Le lot->lot pur reste dans
-- lot_dependencies (pas de double source de vérité).
-- Colonnes FK nullables (pas de polymorphe kind+id) → CASCADE automatique : supprimer
-- un lot ou une sous-phase nettoie ses arêtes sans logique applicative.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning_subphase_deps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id      UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  -- successeur (le noeud qui DÉPEND) : exactement une des deux colonnes
  from_lot_id      UUID REFERENCES lots_chantier(id) ON DELETE CASCADE,
  from_subphase_id UUID REFERENCES lot_subphases(id) ON DELETE CASCADE,
  -- prédécesseur (le noeud DONT on dépend) : exactement une des deux colonnes
  to_lot_id        UUID REFERENCES lots_chantier(id) ON DELETE CASCADE,
  to_subphase_id   UUID REFERENCES lot_subphases(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ( ((from_lot_id IS NOT NULL)::int + (from_subphase_id IS NOT NULL)::int) = 1 ),
  CHECK ( ((to_lot_id   IS NOT NULL)::int + (to_subphase_id   IS NOT NULL)::int) = 1 ),
  -- au moins une sous-phase impliquée (sinon ça relève de lot_dependencies)
  CHECK ( from_subphase_id IS NOT NULL OR to_subphase_id IS NOT NULL ),
  -- pas de self-loop sur une sous-phase
  CHECK ( from_subphase_id IS NULL OR from_subphase_id IS DISTINCT FROM to_subphase_id )
);

CREATE INDEX IF NOT EXISTS idx_psd_chantier ON planning_subphase_deps(chantier_id);
CREATE INDEX IF NOT EXISTS idx_psd_from_sub ON planning_subphase_deps(from_subphase_id);
CREATE INDEX IF NOT EXISTS idx_psd_to_sub ON planning_subphase_deps(to_subphase_id);
-- anti-doublon d'arête (un endpoint = lot_id OU subphase_id, jamais les deux)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_psd_edge ON planning_subphase_deps(
  COALESCE(from_lot_id, from_subphase_id), COALESCE(to_lot_id, to_subphase_id)
);

COMMENT ON TABLE planning_subphase_deps IS
  'Dépendances du graphe planning avancé (Finish-to-Start), impliquant >= 1 sous-phase, y compris cross-lot. Le lot->lot pur reste dans lot_dependencies.';

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS : accès si on possède le chantier (calqué sur lot_dependencies, ownership
-- via chantiers.user_id, wrap (SELECT auth.uid()) pour éval unique par requête).
-- L'appartenance fine des lots/sous-phases référencés au chantier est validée par
-- l'API (defense in depth), comme pour lot_dependencies aujourd'hui.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE lot_subphases ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_subphase_deps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lot_subphases_owner_all ON lot_subphases;
CREATE POLICY lot_subphases_owner_all ON lot_subphases FOR ALL
  USING (
    EXISTS (SELECT 1 FROM chantiers c
            WHERE c.id = lot_subphases.chantier_id
              AND c.user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM chantiers c
            WHERE c.id = lot_subphases.chantier_id
              AND c.user_id = (SELECT auth.uid()))
  );

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
  );
