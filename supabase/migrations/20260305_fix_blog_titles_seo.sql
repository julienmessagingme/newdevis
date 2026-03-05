-- ============================================================
-- Correction des balises <title> trop longues (> 70 caractères)
-- Stratégie : on remplit seo_title (prioritaire sur title dans <title>)
--             sans toucher au title éditorial (H1, JSON-LD)
-- Note : le template ajoute " | VerifierMonDevis.fr" → prévoir max 48 car.
-- Exécuter dans Supabase SQL Editor > New query
-- ============================================================

UPDATE blog_posts SET seo_title = 'Prix isolation thermique : combles, murs et plancher'
WHERE slug = 'prix-isolation-thermique-devis-combles-murs-plancher';

UPDATE blog_posts SET seo_title = 'Piscine : prix, conseils et démarches 2026'
WHERE slug = 'piscine-prix-conseils-demarches-projet';

UPDATE blog_posts SET seo_title = 'Réception de travaux : se protéger des litiges'
WHERE slug = 'reception-travaux-conseils-protection-litiges';

UPDATE blog_posts SET seo_title = 'Sinistre travaux : démarches et arnaques à éviter'
WHERE slug = 'sinistre-travaux-demarches-arnaques-eviter';

UPDATE blog_posts SET seo_title = 'Architecte, maître d''œuvre ou conducteur : qui choisir ?'
WHERE slug = 'architecte-maitre-oeuvre-conducteur-travaux-qui-choisir';

UPDATE blog_posts SET seo_title = 'Labels et qualifications artisans : le guide complet'
WHERE slug = 'qualifications-labels-artisans-batiment-france';

UPDATE blog_posts SET seo_title = 'Analyser un devis artisan en 5 minutes chrono'
WHERE slug = 'analyser-devis-artisan';

UPDATE blog_posts SET seo_title = 'Quels travaux valorisent vraiment votre bien ?'
WHERE slug = 'valoriser-bien-immobilier-travaux-rentables';

UPDATE blog_posts SET seo_title = 'Documents obligatoires avant et après vos travaux'
WHERE slug = 'documents-obligatoires-avant-apres-travaux';

UPDATE blog_posts SET seo_title = 'Travaux soi-même : ce qu''il faut savoir avant'
WHERE slug = 'travaux-soi-meme-ce-quil-faut-savoir';

-- ============================================================
-- Vérification : affiche le <title> final complet avec sa longueur
-- (le template ajoute " | VerifierMonDevis.fr")
-- ============================================================
SELECT
  slug,
  title                                                          AS titre_editorial,
  seo_title                                                      AS seo_title,
  COALESCE(seo_title, title) || ' | VerifierMonDevis.fr'        AS title_tag_final,
  LENGTH(COALESCE(seo_title, title) || ' | VerifierMonDevis.fr') AS nb_caracteres_total
FROM blog_posts
WHERE slug IN (
  'prix-isolation-thermique-devis-combles-murs-plancher',
  'piscine-prix-conseils-demarches-projet',
  'reception-travaux-conseils-protection-litiges',
  'sinistre-travaux-demarches-arnaques-eviter',
  'architecte-maitre-oeuvre-conducteur-travaux-qui-choisir',
  'qualifications-labels-artisans-batiment-france',
  'analyser-devis-artisan',
  'valoriser-bien-immobilier-travaux-rentables',
  'documents-obligatoires-avant-apres-travaux',
  'travaux-soi-meme-ce-quil-faut-savoir'
)
ORDER BY nb_caracteres_total DESC;
