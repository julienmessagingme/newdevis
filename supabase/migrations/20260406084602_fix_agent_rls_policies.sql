-- Fix: scope INSERT policy on agent_insights by user_id
DROP POLICY IF EXISTS "Service role can insert insights" ON agent_insights;
CREATE POLICY "Users can insert own insights" ON agent_insights FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

-- Fix: split chantier_journal FOR ALL into scoped INSERT + UPDATE
DROP POLICY IF EXISTS "Service role can write journal" ON chantier_journal;
CREATE POLICY "Users can insert own journal entries" ON chantier_journal FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own journal entries" ON chantier_journal FOR UPDATE USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
