-- agent_pending_decisions
-- Mémoire explicite des décisions en attente côté agent.
-- Quand l'agent doit demander validation à l'owner (ex: artisan demande +800€,
-- décalage planning impactant un autre artisan), il crée une ligne ici avec
-- l'action à exécuter (`expected_action`) une fois la confirmation reçue.
-- L'orchestrator résout la pending la plus récente non-expirée quand le user
-- répond OUI/NON dans le canal privé.

CREATE TABLE IF NOT EXISTS agent_pending_decisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id     uuid NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  -- Question posée à l'owner. Affichée telle quelle dans le canal WhatsApp privé.
  question        text NOT NULL,
  -- Contexte facultatif pour l'agent au moment de résoudre (ex: id du devis,
  -- montant proposé). Stocké en JSONB pour rester souple.
  context         jsonb,
  -- Action à exécuter si confirmation positive. Format :
  --   { "tool": "shift_lot", "args": { "lot_id": "...", "jours": 5, "cascade": true, "raison": "..." } }
  -- L'orchestrator l'exécute via executeTool() au tour suivant.
  expected_action jsonb NOT NULL,
  -- Source de la décision (ex: "whatsapp_message:msgId" / "email:emailId" / "internal").
  source_event    text,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'expired', 'cancelled')),
  -- Réponse user éventuelle (texte brut). Renseignée à la résolution.
  resolved_answer text,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Lookup principal : pending non-expirée la plus récente pour ce chantier.
CREATE INDEX IF NOT EXISTS idx_agent_pending_chantier_pending
  ON agent_pending_decisions (chantier_id, created_at DESC)
  WHERE status = 'pending';

-- Cron de nettoyage : pending expirées à marquer (futur — pour l'instant on
-- filtre côté lecture).
CREATE INDEX IF NOT EXISTS idx_agent_pending_expires
  ON agent_pending_decisions (expires_at)
  WHERE status = 'pending';

-- RLS : user lit uniquement ses propres pending (via chantier ownership).
-- Service-role (agent) bypass RLS.
ALTER TABLE agent_pending_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_pending_user_read" ON agent_pending_decisions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chantiers c
      WHERE c.id = agent_pending_decisions.chantier_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

COMMENT ON TABLE agent_pending_decisions IS
  'Décisions en attente de validation owner. Créées par notify_owner_for_decision, résolues quand l''owner répond dans le canal WhatsApp privé.';
