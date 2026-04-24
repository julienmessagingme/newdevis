-- Allow admins to read any analysis (needed for /analyse/[id] admin preview)
-- Without this policy, RLS blocks cross-user reads and the Synthèse button
-- redirects to homepage when an admin views another user's analysis.

CREATE POLICY "Admin can read all analyses"
  ON analyses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
        AND role = 'admin'
    )
  );
