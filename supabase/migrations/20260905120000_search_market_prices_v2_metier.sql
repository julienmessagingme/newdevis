-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-05 — expose `metier` dans search_market_prices_v2
--
-- Cas d'origine (devis EC'eau, climatisation 12 666 € HT) : la ligne
--   « Mise en service comprenant : Mise en pression azote / Tirage au vide /
--     Mise en gaz / Essai et contrôle de fonctionnement / Délivrance du cerfa »
-- a été rapprochée de l'entrée catalogue « Mise en service piscine / hivernage ».
-- Les trois gardes sémantiques du matcher laissent passer : « mise en service »
-- est commun aux deux libellés (overlap lexical OK), ce n'est pas un antonyme
-- fourniture/pose, et le ratio de prix est plausible.
--
-- Il manque la seule information qui tranche : le MÉTIER de l'entrée catalogue.
-- On est sur une installation de climatisation ; un prix de piscine ne peut
-- pas servir de comparatif. Le champ existe et est renseigné sur les 919
-- entrées (33 métiers distincts, contrainte check_metier_enum), il n'était
-- simplement pas remonté par la recherche vectorielle.
--
-- CREATE OR REPLACE ne casse rien : la colonne est ajoutée EN FIN de table de
-- retour, les appelants existants qui lisent par nom ne bougent pas.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.search_market_prices_v2(extensions.vector(768), FLOAT, INT);

CREATE FUNCTION public.search_market_prices_v2(
  query_embedding extensions.vector(768),
  match_threshold FLOAT DEFAULT 0.5,
  match_count    INT   DEFAULT 5
)
RETURNS TABLE (
  id                INT,
  job_type          TEXT,
  label             TEXT,
  unit              TEXT,
  price_min_unit_ht NUMERIC,
  price_avg_unit_ht NUMERIC,
  price_max_unit_ht NUMERIC,
  fixed_min_ht      NUMERIC,
  fixed_avg_ht      NUMERIC,
  fixed_max_ht      NUMERIC,
  domain            TEXT,
  notes             TEXT,
  similarity        FLOAT,
  metier            TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mp.id,
    mp.job_type,
    mp.label,
    mp.unit,
    mp.price_min_unit_ht,
    mp.price_avg_unit_ht,
    mp.price_max_unit_ht,
    mp.fixed_min_ht,
    mp.fixed_avg_ht,
    mp.fixed_max_ht,
    mp.domain,
    mp.notes,
    (1 - (mp.embedding <=> query_embedding))::FLOAT AS similarity,
    mp.metier
  FROM public.market_prices mp
  WHERE mp.embedding IS NOT NULL
    AND (1 - (mp.embedding <=> query_embedding)) > match_threshold
  ORDER BY mp.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.search_market_prices_v2(extensions.vector(768), FLOAT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_market_prices_v2(extensions.vector(768), FLOAT, INT) TO service_role;
