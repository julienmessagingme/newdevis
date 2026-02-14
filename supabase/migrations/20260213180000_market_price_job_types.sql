-- Add job_type_group to analysis_work_items for grouping lines by job type
ALTER TABLE analysis_work_items ADD COLUMN IF NOT EXISTS job_type_group TEXT DEFAULT NULL;

-- Add market_price_overrides to analyses for user edits (quantity, line reassignments)
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS market_price_overrides JSONB DEFAULT NULL;
