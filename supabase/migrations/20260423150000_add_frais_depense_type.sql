-- Ajoute 'frais' aux types de dépenses (déclaration sans justificatif uploadé)
ALTER TABLE documents_chantier
  DROP CONSTRAINT IF EXISTS documents_chantier_depense_type_check;

ALTER TABLE documents_chantier
  ADD CONSTRAINT documents_chantier_depense_type_check
  CHECK (depense_type = ANY (ARRAY['facture'::text, 'ticket_caisse'::text, 'achat_materiaux'::text, 'frais'::text]));
