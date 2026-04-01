-- supabase/migrations/20260401200000_whatsapp_multigroup.sql

BEGIN;

-- Table des groupes WhatsApp par chantier (N groupes possibles)
CREATE TABLE IF NOT EXISTS chantier_whatsapp_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Groupe principal',
  group_jid   TEXT NOT NULL,
  invite_link TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_groups_chantier ON chantier_whatsapp_groups(chantier_id);
CREATE INDEX IF NOT EXISTS idx_wa_groups_jid ON chantier_whatsapp_groups(group_jid);

ALTER TABLE chantier_whatsapp_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own wa groups"
  ON chantier_whatsapp_groups FOR SELECT
  USING (chantier_id IN (SELECT id FROM chantiers WHERE user_id = auth.uid()));

-- Table des membres par groupe
CREATE TABLE IF NOT EXISTS chantier_whatsapp_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES chantier_whatsapp_groups(id) ON DELETE CASCADE,
  phone      TEXT NOT NULL,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'artisan',
  status     TEXT NOT NULL DEFAULT 'active',
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at    TIMESTAMPTZ,
  CONSTRAINT wa_members_group_phone_unique UNIQUE (group_id, phone)
);

ALTER TABLE chantier_whatsapp_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own wa members"
  ON chantier_whatsapp_members FOR SELECT
  USING (
    group_id IN (
      SELECT g.id FROM chantier_whatsapp_groups g
      JOIN chantiers c ON c.id = g.chantier_id
      WHERE c.user_id = auth.uid()
    )
  );

-- Migrer les données existantes
INSERT INTO chantier_whatsapp_groups (chantier_id, name, group_jid, invite_link)
SELECT id, 'Groupe principal', whatsapp_group_id, whatsapp_invite_link
FROM chantiers
WHERE whatsapp_group_id IS NOT NULL;

-- Supprimer les colonnes obsolètes
ALTER TABLE chantiers DROP COLUMN IF EXISTS whatsapp_group_id;
ALTER TABLE chantiers DROP COLUMN IF EXISTS whatsapp_invite_link;

COMMIT;
