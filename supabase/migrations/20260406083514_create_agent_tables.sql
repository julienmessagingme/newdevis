-- Agent insights: observations from deterministic checks + LLM
CREATE TABLE agent_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'planning_impact', 'budget_alert', 'payment_overdue', 'conversation_summary',
    'risk_detected', 'digest', 'lot_status_change', 'needs_clarification'
  )),
  severity TEXT CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_event JSONB,
  actions_taken JSONB DEFAULT '[]'::jsonb,
  needs_confirmation BOOLEAN DEFAULT FALSE,
  read_by_user BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_insights_chantier ON agent_insights(chantier_id, created_at DESC);
CREATE INDEX idx_insights_unread ON agent_insights(chantier_id, read_by_user) WHERE NOT read_by_user;
CREATE INDEX idx_insights_user ON agent_insights(user_id, created_at DESC);

ALTER TABLE agent_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own insights" ON agent_insights FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own insights" ON agent_insights FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own insights" ON agent_insights FOR UPDATE USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Agent config: dual-mode (edge_function or openclaw)
CREATE TABLE agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  agent_mode TEXT NOT NULL DEFAULT 'edge_function' CHECK (agent_mode IN ('edge_function', 'openclaw', 'disabled')),
  openclaw_url TEXT,
  openclaw_token TEXT,
  openclaw_agent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own config" ON agent_config FOR ALL USING (user_id = (SELECT auth.uid()));

-- Agent run log
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL CHECK (run_type IN ('morning', 'evening')),
  messages_analyzed INT DEFAULT 0,
  insights_created INT DEFAULT 0,
  actions_taken JSONB DEFAULT '[]'::jsonb,
  tokens_used INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_runs_chantier ON agent_runs(chantier_id, created_at DESC);

-- Chantier journal: 1 page per day
CREATE TABLE chantier_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  journal_date DATE NOT NULL,
  body TEXT NOT NULL,
  alerts_count INT DEFAULT 0,
  max_severity TEXT DEFAULT 'info' CHECK (max_severity IN ('info', 'warning', 'critical')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chantier_id, journal_date)
);

CREATE INDEX idx_journal_chantier ON chantier_journal(chantier_id, journal_date DESC);

ALTER TABLE chantier_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own journal" ON chantier_journal FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own journal entries" ON chantier_journal FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own journal entries" ON chantier_journal FOR UPDATE USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Agent context cache
CREATE TABLE agent_context_cache (
  chantier_id UUID PRIMARY KEY REFERENCES chantiers(id) ON DELETE CASCADE,
  context_json JSONB NOT NULL,
  hydrated_at TIMESTAMPTZ NOT NULL,
  invalidated BOOLEAN DEFAULT FALSE
);
