-- ============================================================
-- PREMIUM MODULE — Mon Chantier
-- Tables : subscriptions, chantiers, devis_chantier,
--          documents_chantier, journal_entries, relances
-- ============================================================

-- 1. SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS subscriptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'inactive',   -- 'active' | 'inactive' | 'trial'
  plan                 TEXT NOT NULL DEFAULT 'premium_monthly', -- 'premium_monthly' | 'premium_yearly'
  trial_ends_at        TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_select_own"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "subscriptions_insert_own"
  ON subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "subscriptions_update_own"
  ON subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- 2. CHANTIERS
CREATE TABLE IF NOT EXISTS chantiers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nom          TEXT NOT NULL DEFAULT 'Mon projet travaux',
  adresse      TEXT,
  date_debut   TIMESTAMPTZ,
  date_fin     TIMESTAMPTZ,
  budget       DECIMAL(12,2),
  apport       DECIMAL(12,2),
  credit       DECIMAL(12,2),
  taux_interet DECIMAL(5,2),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chantiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chantiers_select_own"
  ON chantiers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "chantiers_insert_own"
  ON chantiers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chantiers_update_own"
  ON chantiers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "chantiers_delete_own"
  ON chantiers FOR DELETE
  USING (auth.uid() = user_id);

-- 3. DEVIS CHANTIER
CREATE TABLE IF NOT EXISTS devis_chantier (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id    UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  analyse_id     UUID,                         -- optional ref to analyses table
  artisan_nom    TEXT NOT NULL,
  artisan_email  TEXT,
  artisan_phone  TEXT,
  artisan_siret  TEXT,
  type_travaux   TEXT NOT NULL DEFAULT 'Travaux',
  montant_ht     DECIMAL(12,2) NOT NULL DEFAULT 0,
  tva            DECIMAL(5,2) NOT NULL DEFAULT 10,
  montant_ttc    DECIMAL(12,2) NOT NULL DEFAULT 0,
  acompte_pct    DECIMAL(5,2),
  acompte_paye   DECIMAL(12,2) DEFAULT 0,
  statut         TEXT NOT NULL DEFAULT 'recu',  -- 'recu'|'signe'|'en_cours'|'termine'|'litige'
  score_analyse  TEXT,                          -- 'VERT'|'ORANGE'|'ROUGE'
  date_debut     TIMESTAMPTZ,
  date_fin       TIMESTAMPTZ,
  assurance_ok   BOOLEAN NOT NULL DEFAULT FALSE,
  rc_pro_ok      BOOLEAN NOT NULL DEFAULT FALSE,
  mentions_ok    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE devis_chantier ENABLE ROW LEVEL SECURITY;

-- RLS via chantier ownership
CREATE POLICY "devis_chantier_select_own"
  ON devis_chantier FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM chantiers WHERE id = devis_chantier.chantier_id AND user_id = auth.uid())
  );

CREATE POLICY "devis_chantier_insert_own"
  ON devis_chantier FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM chantiers WHERE id = devis_chantier.chantier_id AND user_id = auth.uid())
  );

CREATE POLICY "devis_chantier_update_own"
  ON devis_chantier FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM chantiers WHERE id = devis_chantier.chantier_id AND user_id = auth.uid())
  );

CREATE POLICY "devis_chantier_delete_own"
  ON devis_chantier FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM chantiers WHERE id = devis_chantier.chantier_id AND user_id = auth.uid())
  );

-- 4. DOCUMENTS CHANTIER
CREATE TABLE IF NOT EXISTS documents_chantier (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id  UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,  -- 'apport_facture'|'apport_cheque'|'apport_virement'|'decennale'|'rc_pro'|'daact'|'pv_reception'|'autre'
  nom          TEXT NOT NULL,
  url          TEXT NOT NULL DEFAULT '',
  montant      DECIMAL(12,2),
  date         TIMESTAMPTZ,
  statut       TEXT NOT NULL DEFAULT 'en_attente', -- 'en_attente'|'valide'|'a_completer'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE documents_chantier ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_chantier_select_own"
  ON documents_chantier FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM chantiers WHERE id = documents_chantier.chantier_id AND user_id = auth.uid())
  );

CREATE POLICY "documents_chantier_insert_own"
  ON documents_chantier FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM chantiers WHERE id = documents_chantier.chantier_id AND user_id = auth.uid())
  );

CREATE POLICY "documents_chantier_update_own"
  ON documents_chantier FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM chantiers WHERE id = documents_chantier.chantier_id AND user_id = auth.uid())
  );

CREATE POLICY "documents_chantier_delete_own"
  ON documents_chantier FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM chantiers WHERE id = documents_chantier.chantier_id AND user_id = auth.uid())
  );

-- 5. JOURNAL ENTRIES
CREATE TABLE IF NOT EXISTS journal_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id  UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  phase        TEXT NOT NULL DEFAULT 'preparation', -- 'preparation'|'gros_oeuvre'|'second_oeuvre'|'finitions'|'reception'
  artisan_nom  TEXT,
  note         TEXT NOT NULL DEFAULT '',
  photos       TEXT[] NOT NULL DEFAULT '{}',
  tags         TEXT[] NOT NULL DEFAULT '{}',  -- 'important'|'probleme'|'validation'|'info'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal_entries_select_own"
  ON journal_entries FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM chantiers WHERE id = journal_entries.chantier_id AND user_id = auth.uid())
  );

CREATE POLICY "journal_entries_insert_own"
  ON journal_entries FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM chantiers WHERE id = journal_entries.chantier_id AND user_id = auth.uid())
  );

CREATE POLICY "journal_entries_update_own"
  ON journal_entries FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM chantiers WHERE id = journal_entries.chantier_id AND user_id = auth.uid())
  );

CREATE POLICY "journal_entries_delete_own"
  ON journal_entries FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM chantiers WHERE id = journal_entries.chantier_id AND user_id = auth.uid())
  );

-- 6. RELANCES
CREATE TABLE IF NOT EXISTS relances (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id    UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  artisan_nom    TEXT NOT NULL,
  artisan_email  TEXT NOT NULL DEFAULT '',
  type           TEXT NOT NULL,  -- 'relance_delai'|'reclamation'|'demande_facture'|'mise_en_demeure'
  contenu        TEXT NOT NULL DEFAULT '',
  envoye_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE relances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "relances_select_own"
  ON relances FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM chantiers WHERE id = relances.chantier_id AND user_id = auth.uid())
  );

CREATE POLICY "relances_insert_own"
  ON relances FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM chantiers WHERE id = relances.chantier_id AND user_id = auth.uid())
  );

CREATE POLICY "relances_update_own"
  ON relances FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM chantiers WHERE id = relances.chantier_id AND user_id = auth.uid())
  );

CREATE POLICY "relances_delete_own"
  ON relances FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM chantiers WHERE id = relances.chantier_id AND user_id = auth.uid())
  );

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_chantiers_user_id ON chantiers(user_id);
CREATE INDEX IF NOT EXISTS idx_devis_chantier_chantier_id ON devis_chantier(chantier_id);
CREATE INDEX IF NOT EXISTS idx_devis_chantier_analyse_id ON devis_chantier(analyse_id);
CREATE INDEX IF NOT EXISTS idx_documents_chantier_chantier_id ON documents_chantier(chantier_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_chantier_id ON journal_entries(chantier_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(chantier_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_relances_chantier_id ON relances(chantier_id);

-- AUTO-UPDATE updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_subscriptions
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_chantiers
  BEFORE UPDATE ON chantiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
