-- Migration: Add missing performance indexes
-- Identified during Supabase optimization audit (2026-03-12)

-- Priority 1: Dashboard chantier queries (most impactful)
CREATE INDEX IF NOT EXISTS idx_devis_chantier_chantier_id
  ON devis_chantier(chantier_id);

CREATE INDEX IF NOT EXISTS idx_documents_chantier_chantier_id
  ON documents_chantier(chantier_id);

-- Priority 1: Blog public page (scans all rows without this)
CREATE INDEX IF NOT EXISTS idx_blog_posts_status_published
  ON blog_posts(status, published_at DESC)
  WHERE status = 'published';

-- Priority 2: Devis ↔ Analyses linking
CREATE INDEX IF NOT EXISTS idx_devis_chantier_analyse_id
  ON devis_chantier(analyse_id);

-- Priority 2: Todo chantier ordering
CREATE INDEX IF NOT EXISTS idx_todo_chantier_ordre
  ON todo_chantier(chantier_id, ordre);
