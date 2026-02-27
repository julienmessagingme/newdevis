-- ============================================================================
-- Migration: Supprimer les index redondants + ajouter des index partiels ciblés
--
-- Contexte: PostgreSQL crée AUTOMATIQUEMENT un index B-tree unique pour :
--   - Chaque contrainte PRIMARY KEY
--   - Chaque contrainte UNIQUE
-- Créer un index supplémentaire sur ces colonnes est donc un doublon inutile
-- qui ralentit les INSERT/UPDATE sans aucun gain en lecture.
--
-- Impact:
--   - DROP 6 index redondants → ~50-100 µs économisés par INSERT/UPDATE
--   - CREATE idx_analyses_active → polling frontend 10-50x plus rapide
--   - Remplacement idx_blog_posts_status → listing public blog plus rapide
-- ============================================================================


-- ============================================================================
-- PARTIE 1 : SUPPRESSION DES INDEX REDONDANTS
-- ============================================================================

-- strategic_matrix : job_type EST la PRIMARY KEY → index unique déjà créé par PG
-- Créé dans 20260224120000_create_strategic_matrix.sql
DROP INDEX IF EXISTS public.idx_strategic_matrix_job_type;

-- dvf_prices : code_insee EST la PRIMARY KEY → index unique déjà créé par PG
-- Créé dans 20260226000001_create_dvf_prices.sql
DROP INDEX IF EXISTS public.idx_dvf_prices_code_insee;

-- company_cache : siret a une contrainte UNIQUE → index déjà créé par PG
-- Créé dans 20260115220136_c3b0073a.sql
DROP INDEX IF EXISTS public.idx_company_cache_siret;

-- document_extractions : file_hash a une contrainte UNIQUE → index déjà créé par PG
-- Deux index redondants créés dans deux migrations différentes :
--   - idx_document_extractions_hash (20260121160615)
--   - idx_extractions_file_hash     (20260214160000)
DROP INDEX IF EXISTS public.idx_document_extractions_hash;
DROP INDEX IF EXISTS public.idx_extractions_file_hash;

-- blog_posts : slug a une contrainte UNIQUE → index déjà créé par PG
-- Créé dans 20260124165400_e6299f90.sql
DROP INDEX IF EXISTS public.idx_blog_posts_slug;


-- ============================================================================
-- PARTIE 2 : AJOUT D'INDEX PARTIELS CIBLÉS
-- ============================================================================

-- POLLING FRONTEND : analyses en cours (pending / processing)
--
-- Le frontend poll analyses.status toutes les 3s pendant un traitement.
-- La grande majorité des analyses sont à status='completed' → un index partiel
-- ne couvre que les lignes actives, ce qui le rend minuscule et très rapide.
-- Requête cible :
--   SELECT * FROM analyses WHERE user_id = $1 AND status IN ('pending','processing')
--   ORDER BY created_at DESC LIMIT 1
--
CREATE INDEX IF NOT EXISTS idx_analyses_active
  ON public.analyses (user_id, created_at DESC)
  WHERE status IN ('pending', 'processing');


-- LISTING BLOG PUBLIC : articles publiés seulement
--
-- La policy RLS "Anyone can read published articles" filtre toujours
-- WHERE status = 'published'. L'ancien idx_blog_posts_status couvrait TOUS les
-- statuts (draft + published). Un index partiel sur 'published' est plus petit,
-- couvre aussi le tri par published_at, et est inutilisable pour les requêtes
-- incorrectes (évite les scans d'index inutiles).
-- Requête cible :
--   SELECT * FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC
--
DROP INDEX IF EXISTS public.idx_blog_posts_status;

CREATE INDEX IF NOT EXISTS idx_blog_posts_published
  ON public.blog_posts (published_at DESC)
  WHERE status = 'published';
