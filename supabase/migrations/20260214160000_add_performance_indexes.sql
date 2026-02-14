-- Performance indexes based on query pattern analysis
-- These indexes target the most frequent queries in the application

-- Dashboard: list user's analyses sorted by date, filtered by status
CREATE INDEX IF NOT EXISTS idx_analyses_user_status_created
ON public.analyses(user_id, status, created_at DESC);

-- Market price matching: filter work items by job type group
CREATE INDEX IF NOT EXISTS idx_work_items_job_type_group
ON public.analysis_work_items(job_type_group);

-- Document extraction cache: lookup by file hash (used on every analysis)
CREATE INDEX IF NOT EXISTS idx_extractions_file_hash
ON public.document_extractions(file_hash);

-- Blog scheduled publishing: filter by workflow status
CREATE INDEX IF NOT EXISTS idx_blog_posts_workflow_status
ON public.blog_posts(workflow_status);
