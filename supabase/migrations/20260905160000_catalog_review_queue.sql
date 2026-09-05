-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-05 (demande Johan) — FILE DE RELECTURE SEMESTRIELLE DES FOURCHETTES
--
-- Les prix des travaux et des matériaux bougent ; nos fourchettes, non. À ce
-- jour, 916 des 919 entrées du catalogue n'ont JAMAIS été relues — seules les
-- 3 ajoutées le 2026-08-30 portent une date.
--
-- Une alerte qui listerait les 916 serait ignorée dès le premier envoi. Le
-- principe retenu : on ne relit pas 919 entrées, on relit **les quelques
-- dizaines qui portent l'essentiel des comparaisons**. Le classement se fait
-- donc par MONTANT CUMULÉ réellement rapproché sur la période, pas par ordre
-- alphabétique ni par ancienneté seule.
--
-- Source d'usage : `match_audit_log`, qui trace chaque rapprochement avec son
-- `top_job_type` et le montant de la ligne. On ne compte que les matchs de
-- confiance HAUTE : ce sont les seuls qui alimentent réellement un verdict, et
-- donc les seuls dont une fourchette fausse a une conséquence.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.catalog_review_queue(
  p_mois  INT DEFAULT 6,
  p_limit INT DEFAULT 25
)
RETURNS TABLE (
  job_type          TEXT,
  label             TEXT,
  unit              TEXT,
  metier            TEXT,
  price_min_unit_ht NUMERIC,
  price_max_unit_ht NUMERIC,
  fixed_min_ht      NUMERIC,
  fixed_max_ht      NUMERIC,
  source            TEXT,
  last_reviewed_at  TIMESTAMPTZ,
  mois_depuis_revue NUMERIC,
  nb_matchs         BIGINT,
  montant_cumule    NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH usage AS (
    SELECT
      mal.top_job_type            AS job_type,
      COUNT(*)                    AS nb_matchs,
      SUM(COALESCE(mal.amount_ht, 0)) AS montant_cumule
    FROM public.match_audit_log mal
    WHERE mal.created_at >= now() - make_interval(months => p_mois)
      AND mal.confidence = 'high'
      AND mal.top_job_type IS NOT NULL
    GROUP BY mal.top_job_type
  )
  SELECT
    mp.job_type,
    mp.label,
    mp.unit,
    mp.metier,
    mp.price_min_unit_ht,
    mp.price_max_unit_ht,
    mp.fixed_min_ht,
    mp.fixed_max_ht,
    mp.source,
    mp.last_reviewed_at,
    CASE
      WHEN mp.last_reviewed_at IS NULL THEN NULL
      ELSE ROUND(EXTRACT(EPOCH FROM (now() - mp.last_reviewed_at)) / 2629746.0, 1)
    END AS mois_depuis_revue,
    COALESCE(u.nb_matchs, 0)      AS nb_matchs,
    COALESCE(u.montant_cumule, 0) AS montant_cumule
  FROM public.market_prices mp
  JOIN usage u ON u.job_type = mp.job_type
  -- Une entrée relue dans la période n'a pas à revenir : c'est ce qui rend la
  -- liste plus courte à chaque envoi, et donc le rituel tenable.
  WHERE mp.last_reviewed_at IS NULL
     OR mp.last_reviewed_at < now() - make_interval(months => p_mois)
  ORDER BY u.montant_cumule DESC NULLS LAST
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.catalog_review_queue(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_review_queue(INT, INT) TO service_role;

COMMENT ON FUNCTION public.catalog_review_queue(INT, INT) IS
  'File de relecture des fourchettes catalogue, classée par montant réellement rapproché sur la période (confiance haute uniquement). Alimente le cron semestriel catalog-review-alert.';
