-- Add AI workflow columns to blog_posts
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_prompt TEXT NULL,
  ADD COLUMN IF NOT EXISTS ai_model TEXT NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'manual'
    CHECK (workflow_status IN ('manual','ai_draft','ai_reviewed','scheduled','published','rejected'));
