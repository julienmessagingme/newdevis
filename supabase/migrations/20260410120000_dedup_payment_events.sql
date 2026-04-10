-- ============================================================
-- Dédoublonnage payment_events
-- Conserve uniquement le plus récent par (project_id, source_id, label)
-- pour les events non-override et non-cancelled
-- ============================================================

DELETE FROM payment_events
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY project_id, source_id, label
        ORDER BY created_at DESC
      ) AS rn
    FROM payment_events
    WHERE is_override = false
      AND status != 'cancelled'
  ) ranked
  WHERE rn > 1
);
