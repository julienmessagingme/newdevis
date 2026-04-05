-- ============================================================
-- Vue : répartition des types de travaux analysés
-- Exclut les analyses des 2 comptes admin
-- ============================================================

CREATE OR REPLACE VIEW admin_kpis_work_type_distribution AS
WITH exploded AS (
  SELECT
    a.id,
    lower(trim(item->>'categorie')) AS cat
  FROM analyses a,
    jsonb_array_elements(a.types_travaux) AS item
  WHERE a.status = 'completed'
    AND a.types_travaux IS NOT NULL
    AND a.user_id NOT IN (
      '92f67a7c-be15-449f-8a7e-01be84d0fe8b',
      '28fc8e97-9ea8-431c-8fdc-c022e30125e5'
    )
),
dominant AS (
  SELECT DISTINCT ON (id) id, cat
  FROM (
    SELECT id, cat, count(*) AS n
    FROM exploded
    WHERE cat IS NOT NULL AND cat != ''
    GROUP BY id, cat
  ) sub
  ORDER BY id, n DESC, cat
)
SELECT
  cat AS categorie,
  count(*) AS nb_analyses
FROM dominant
GROUP BY cat
ORDER BY nb_analyses DESC
LIMIT 30;
