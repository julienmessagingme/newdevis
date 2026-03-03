-- Migration: add reading_time to blog_posts with auto-compute trigger
-- reading_time est calculé côté Postgres à chaque INSERT/UPDATE de content_html
-- évite de transmettre content_html (champ lourd) dans les requêtes de liste

-- 1. Colonne
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS reading_time INTEGER;

-- 2. Fonction trigger
CREATE OR REPLACE FUNCTION compute_blog_reading_time()
RETURNS TRIGGER AS $$
DECLARE
  word_count INTEGER;
BEGIN
  IF NEW.content_html IS NOT NULL AND LENGTH(NEW.content_html) > 0 THEN
    -- Compte les mots : supprime les balises HTML, découpe sur les espaces
    SELECT COUNT(*) INTO word_count
    FROM REGEXP_MATCHES(
      REGEXP_REPLACE(NEW.content_html, '<[^>]+>', ' ', 'g'),
      '[^\s]+',
      'g'
    );
    -- 183 mots/min (standard FR), minimum 1 minute
    NEW.reading_time := GREATEST(1, CEIL(word_count::FLOAT / 183)::INTEGER);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger (se déclenche à chaque insert ou modif de content_html)
DROP TRIGGER IF EXISTS tr_blog_post_reading_time ON blog_posts;
CREATE TRIGGER tr_blog_post_reading_time
  BEFORE INSERT OR UPDATE OF content_html ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION compute_blog_reading_time();

-- 4. Calcul initial pour tous les articles existants
UPDATE blog_posts
SET reading_time = (
  SELECT GREATEST(1, CEIL(COUNT(*)::FLOAT / 183)::INTEGER)
  FROM REGEXP_MATCHES(
    REGEXP_REPLACE(content_html, '<[^>]+>', ' ', 'g'),
    '[^\s]+',
    'g'
  )
)
WHERE content_html IS NOT NULL AND LENGTH(content_html) > 0;
