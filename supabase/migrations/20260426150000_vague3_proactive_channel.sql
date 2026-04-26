-- Vague 3 : canal WhatsApp privé + actions programmées
-- ────────────────────────────────────────────────────────

-- 1. chantier_whatsapp_groups : ajout flag is_owner_channel
-- Permet à l'agent d'identifier le groupe privé "Mon Chantier — X" où il
-- envoie ses notifs proactives (clarifications, alertes, rappels, décisions).
ALTER TABLE chantier_whatsapp_groups
  ADD COLUMN IF NOT EXISTS is_owner_channel BOOLEAN NOT NULL DEFAULT FALSE;

-- Un seul canal owner par chantier (contrainte d'intégrité).
CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_channel_per_chantier
  ON chantier_whatsapp_groups (chantier_id)
  WHERE is_owner_channel = TRUE;

-- 2. agent_scheduled_actions : actions programmées (rappels, etc.)
-- Cron edge function `agent-scheduled-tick` toutes les 15min :
--   SELECT * FROM agent_scheduled_actions
--   WHERE status='pending' AND due_at <= now() LIMIT 50
-- → fire WhatsApp dans le canal owner → status='fired'
CREATE TABLE IF NOT EXISTS agent_scheduled_actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id  uuid NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  due_at       timestamptz NOT NULL,
  -- Type d'action : 'reminder' = simple message au owner.
  -- 'auto_message' = message à un tiers (réservé V2, pour automatisations).
  action_type  text NOT NULL DEFAULT 'reminder' CHECK (action_type IN ('reminder', 'auto_message')),
  -- Payload : pour 'reminder' = { text, lot_id? }. Pour 'auto_message' = { tool, args }.
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fired', 'cancelled', 'failed')),
  -- Trace de la résolution
  fired_at     timestamptz,
  fired_result jsonb,
  -- Source pour traçabilité (ex: 'tool:schedule_reminder', 'manual:settings')
  source       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Index principal cron : pending non expirées les plus anciennes en premier.
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_pending_due
  ON agent_scheduled_actions (due_at ASC)
  WHERE status = 'pending';

-- Index lookup par chantier pour l'UI (à venir : "mes rappels programmés").
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_chantier
  ON agent_scheduled_actions (chantier_id, created_at DESC);

ALTER TABLE agent_scheduled_actions ENABLE ROW LEVEL SECURITY;

-- RLS : user lit ses propres scheduled actions (via chantier ownership).
-- Service-role (agent / cron) bypass RLS.
CREATE POLICY "scheduled_actions_user_read" ON agent_scheduled_actions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chantiers c
      WHERE c.id = agent_scheduled_actions.chantier_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

-- User peut annuler ses propres rappels (UPDATE status='cancelled').
CREATE POLICY "scheduled_actions_user_cancel" ON agent_scheduled_actions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM chantiers c
      WHERE c.id = agent_scheduled_actions.chantier_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

COMMENT ON TABLE agent_scheduled_actions IS
  'Actions programmées par l''agent (rappels owner, auto-messages futurs). Cron tick toutes les 15min.';
