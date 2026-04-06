-- Dedup index: prevents concurrent inserts of same insight within the same day
CREATE UNIQUE INDEX IF NOT EXISTS idx_insights_dedup
  ON agent_insights(chantier_id, title, (date_trunc('day', created_at AT TIME ZONE 'UTC')));
