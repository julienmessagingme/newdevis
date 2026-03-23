-- Table contacts_chantier : carnet de contacts par chantier
CREATE TABLE IF NOT EXISTS contacts_chantier (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  nom         TEXT NOT NULL,
  email       TEXT,
  telephone   TEXT,
  siret       TEXT,
  role        TEXT,              -- ex: "Électricien", "Plombier", "Architecte"
  lot_id      UUID REFERENCES lots_chantier(id) ON DELETE SET NULL,
  notes       TEXT,
  source      TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'devis' | 'facture'
  devis_id    UUID REFERENCES devis_chantier(id) ON DELETE SET NULL,
  analyse_id  UUID REFERENCES analyses(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX idx_contacts_chantier_chantier ON contacts_chantier(chantier_id);
CREATE INDEX idx_contacts_chantier_user     ON contacts_chantier(user_id);

-- RLS
ALTER TABLE contacts_chantier ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_chantier_select" ON contacts_chantier
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "contacts_chantier_insert" ON contacts_chantier
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "contacts_chantier_update" ON contacts_chantier
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "contacts_chantier_delete" ON contacts_chantier
  FOR DELETE USING (auth.uid() = user_id);
