-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : champs nécessaires pour le module Budget & Trésorerie v2
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Termes de paiement extraits automatiquement des factures
--    { type_facture: 'acompte'|'solde'|'totale',
--      pct: number,              -- ex: 30 pour 30%
--      delai_jours: number,      -- 0 = à réception, 30 = net 30...
--      numero_facture: string }
ALTER TABLE documents_chantier
  ADD COLUMN IF NOT EXISTS payment_terms JSONB;

COMMENT ON COLUMN documents_chantier.payment_terms IS
  'Termes de paiement extraits par IA : {type_facture, pct, delai_jours, numero_facture}';

-- 2. Source de financement affectée par l'utilisateur à chaque échéance
ALTER TABLE payment_events
  ADD COLUMN IF NOT EXISTS financing_source TEXT
  CHECK (financing_source IN ('apport', 'credit', 'maprime', 'cee', 'eco_ptz', 'mixte'));

COMMENT ON COLUMN payment_events.financing_source IS
  'Source de financement choisie par l''utilisateur pour cette échéance';
