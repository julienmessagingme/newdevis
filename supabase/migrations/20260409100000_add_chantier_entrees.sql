-- Migration: chantier_entrees
-- Stocke les entrées de fonds manuelles par chantier :
-- déblocages crédit, aides (MaPrimeRénov, CEE, Éco-PTZ), apports, remboursements.
-- Utilisé par l'onglet Échéancier pour la projection de trésorerie.

CREATE TABLE IF NOT EXISTS chantier_entrees (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id  UUID         NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  user_id      UUID         NOT NULL REFERENCES auth.users(id),
  montant      NUMERIC(12,2) NOT NULL CHECK (montant > 0),
  label        TEXT         NOT NULL,
  source_type  TEXT         NOT NULL DEFAULT 'autre'
                            CHECK (source_type IN (
                              'deblocage_credit',
                              'aide_maprime',
                              'aide_cee',
                              'eco_ptz',
                              'apport_personnel',
                              'remboursement',
                              'autre'
                            )),
  date_entree  DATE         NOT NULL,
  statut       TEXT         NOT NULL DEFAULT 'attendu'
                            CHECK (statut IN ('recu', 'attendu')),
  notes        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE chantier_entrees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entrees_user_scoped" ON chantier_entrees
  FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Index pour les requêtes de l'onglet trésorerie
CREATE INDEX IF NOT EXISTS idx_entrees_chantier
  ON chantier_entrees(chantier_id, date_entree ASC);
