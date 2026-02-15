-- Policies INSERT/UPDATE pour price_observations
-- INSERT : le pipeline edge function utilise service_role (bypass RLS)
-- mais on ajoute une policy pour le cas où le frontend en aurait besoin

-- Policy : les utilisateurs authentifiés peuvent insérer leurs propres observations
CREATE POLICY "user_insert_own_price_observations" ON price_observations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy : les utilisateurs authentifiés peuvent mettre à jour leurs propres observations
-- (utilisé par useMarketPriceEditor lors de la validation drag-and-drop)
CREATE POLICY "user_update_own_price_observations" ON price_observations
  FOR UPDATE USING (auth.uid() = user_id);
