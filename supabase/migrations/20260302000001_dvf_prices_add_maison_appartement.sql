-- ============================================================
-- Migration : dvf_prices — ajout colonnes maison / appartement
-- Si la table a été créée avec l'ancien schéma (prix_m2 unique),
-- on ajoute les colonnes différenciées. Si elles existent déjà, no-op.
-- Données alimentées via : scripts/build-dvf-top1000.ts + CSV import
-- ============================================================

ALTER TABLE public.dvf_prices
  ADD COLUMN IF NOT EXISTS prix_m2_maison        numeric,
  ADD COLUMN IF NOT EXISTS prix_m2_appartement   numeric,
  ADD COLUMN IF NOT EXISTS nb_ventes_maison      integer,
  ADD COLUMN IF NOT EXISTS nb_ventes_appartement integer;

-- Commentaires
COMMENT ON COLUMN public.dvf_prices.prix_m2_maison        IS 'Médiane prix/m² – Maison (€)';
COMMENT ON COLUMN public.dvf_prices.prix_m2_appartement   IS 'Médiane prix/m² – Appartement (€)';
COMMENT ON COLUMN public.dvf_prices.nb_ventes_maison      IS 'Nb de transactions Maison retenues';
COMMENT ON COLUMN public.dvf_prices.nb_ventes_appartement IS 'Nb de transactions Appartement retenues';
