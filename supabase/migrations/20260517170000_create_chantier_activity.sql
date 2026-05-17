-- Journal de chantier — table d'événements horodatés.
-- Alimente la "timeline" du Journal (changements de statut surtout). Les autres
-- événements (dépôts de documents, alertes, décisions IA) sont déjà horodatés
-- dans leurs tables respectives et agrégés à la lecture.

CREATE TABLE IF NOT EXISTS chantier_activity (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id  UUID        NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  category     TEXT        NOT NULL,            -- 'status_change' | 'document' | 'payment' | ...
  actor        TEXT        NOT NULL DEFAULT 'user' CHECK (actor IN ('user', 'agent', 'system')),
  summary      TEXT        NOT NULL,            -- libellé court affiché dans la timeline
  detail       TEXT,                            -- précision optionnelle
  metadata     JSONB,                           -- contexte structuré (ids, anciennes/nouvelles valeurs)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chantier_activity
  ON chantier_activity (chantier_id, occurred_at DESC);

ALTER TABLE chantier_activity ENABLE ROW LEVEL SECURITY;

-- Lecture : le propriétaire du chantier. Les inserts se font côté serveur via
-- service_role (bypass RLS) — pas de policy INSERT volontairement.
CREATE POLICY chantier_activity_select ON chantier_activity
  FOR SELECT USING (
    chantier_id IN (
      SELECT id FROM chantiers WHERE user_id = (SELECT auth.uid())
    )
  );
