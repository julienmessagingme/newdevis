-- Migration additive : création de la table lots_chantier
-- Aucune modification des tables existantes
-- metadonnees.artisans reste intact et fonctionnel
-- Les anciens chantiers sans lignes dans lots_chantier restent ouvrables (fallback GET)

CREATE TABLE IF NOT EXISTS lots_chantier (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id  UUID        NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  nom          TEXT        NOT NULL,
  statut       TEXT        NOT NULL DEFAULT 'a_trouver'
                           CHECK (statut IN ('a_trouver', 'a_contacter', 'ok')),
  ordre        INTEGER     NOT NULL DEFAULT 0,
  emoji        TEXT,
  role         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index composite pour les requêtes par chantier triées par ordre
CREATE INDEX IF NOT EXISTS idx_lots_chantier_chantier_id
  ON lots_chantier (chantier_id, ordre);

-- RLS : ownership via chantier_id → chantiers.user_id
ALTER TABLE lots_chantier ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lots_chantier_owner" ON lots_chantier
  FOR ALL
  USING (
    chantier_id IN (
      SELECT id FROM chantiers WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    chantier_id IN (
      SELECT id FROM chantiers WHERE user_id = auth.uid()
    )
  );
