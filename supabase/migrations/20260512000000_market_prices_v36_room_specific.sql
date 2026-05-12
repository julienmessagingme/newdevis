-- ============================================================================
-- V3.6 — market_prices schema extension : room_specific + required_room + generic_family
-- ============================================================================
--
-- Contexte (cf. CLAUDE.md V3.6) :
-- Avant V3.6, Gemini choisissait lui-même le `job_type` canonique parmi le
-- catalogue → hallucinations type "raccordements_electricite_cuisine" sur
-- un devis ne mentionnant pas cuisine (cas Thouret Elec).
--
-- V3.6 inverse : Gemini extrait une signature sémantique neutre, et le backend
-- TS (market-matcher.ts) fait le matching déterministe avec règles strictes.
-- Pour cela, le catalogue doit déclarer EXPLICITEMENT :
--   - quelles entrées sont room-specific (cuisine, sdb, chambre…)
--   - leur "famille générique" (pour fallback intelligent)
--
-- Le matcher V3.6 FONCTIONNE déjà sans ces colonnes (inférence depuis le job_type
-- via heuristique). La migration améliore la précision et la performance.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ajout des 3 colonnes
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE market_prices
  ADD COLUMN IF NOT EXISTS room_specific BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS required_room TEXT[] NULL,
  ADD COLUMN IF NOT EXISTS generic_family TEXT NULL;

COMMENT ON COLUMN market_prices.room_specific IS
  'V3.6 — TRUE si ce job_type ne peut être matché QUE si la signature sémantique extraite par Gemini mentionne la room déclarée dans `required_room`. Évite les room mismatches type Thouret Elec (cuisine vs chambre).';

COMMENT ON COLUMN market_prices.required_room IS
  'V3.6 — Liste des rooms canoniques (cuisine, sdb, chambre, salon, bureau, garage, cellier, wc, entree, couloir, exterieur, cave, combles) qui doivent apparaître dans la signature pour matcher cette entrée. NULL si pas de contrainte room (room_specific=false).';

COMMENT ON COLUMN market_prices.generic_family IS
  'V3.6 — Famille générique partagée par tous les variants par pièce. Ex: raccordements_electricite_cuisine, raccordements_electricite_sdb, raccordements_electricite_chambre → generic_family="raccordements_electricite". Permet au matcher de fallback vers la famille générique quand aucune room ne matche.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Index pour optimiser le filtrage côté matcher
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_market_prices_room_specific
  ON market_prices (domain, room_specific);

CREATE INDEX IF NOT EXISTS idx_market_prices_generic_family
  ON market_prices (generic_family)
  WHERE generic_family IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SEED initial — marquer comme room_specific tous les job_types contenant
--    un mot-pièce, et calculer leur generic_family.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Ce SEED utilise des patterns regex sur le nom du job_type. À ajuster
-- manuellement si certains job_types non listés par pièce contiennent par
-- coïncidence un mot-pièce (rare).

-- Cuisine
UPDATE market_prices
SET room_specific = TRUE,
    required_room = ARRAY['cuisine'],
    generic_family = regexp_replace(job_type, '_cuisine.*$', '', 'i')
WHERE job_type ~* '_cuisine'
  AND room_specific = FALSE;

-- SDB / Salle de bain
UPDATE market_prices
SET room_specific = TRUE,
    required_room = ARRAY['sdb'],
    generic_family = regexp_replace(job_type, '_(sdb|salle_de_bain|salle_de_bains|salle_d_eau).*$', '', 'i')
WHERE job_type ~* '_(sdb|salle_de_bain|salle_de_bains|salle_d_eau)'
  AND room_specific = FALSE;

-- WC / Toilettes
UPDATE market_prices
SET room_specific = TRUE,
    required_room = ARRAY['wc'],
    generic_family = regexp_replace(job_type, '_(wc|toilettes?).*$', '', 'i')
WHERE job_type ~* '_(wc|toilettes?)'
  AND room_specific = FALSE;

-- Chambre
UPDATE market_prices
SET room_specific = TRUE,
    required_room = ARRAY['chambre'],
    generic_family = regexp_replace(job_type, '_chambre.*$', '', 'i')
WHERE job_type ~* '_chambre'
  AND room_specific = FALSE;

-- Salon / Séjour / Salle à manger
UPDATE market_prices
SET room_specific = TRUE,
    required_room = ARRAY['salon'],
    generic_family = regexp_replace(job_type, '_(salon|sejour|salle_a_manger).*$', '', 'i')
WHERE job_type ~* '_(salon|sejour|salle_a_manger)'
  AND room_specific = FALSE;

-- Bureau
UPDATE market_prices
SET room_specific = TRUE,
    required_room = ARRAY['bureau'],
    generic_family = regexp_replace(job_type, '_bureau.*$', '', 'i')
WHERE job_type ~* '_bureau'
  AND room_specific = FALSE;

-- Garage
UPDATE market_prices
SET room_specific = TRUE,
    required_room = ARRAY['garage'],
    generic_family = regexp_replace(job_type, '_garage.*$', '', 'i')
WHERE job_type ~* '_garage'
  AND room_specific = FALSE;

-- Cellier / Buanderie
UPDATE market_prices
SET room_specific = TRUE,
    required_room = ARRAY['cellier'],
    generic_family = regexp_replace(job_type, '_(cellier|buanderie|lingerie).*$', '', 'i')
WHERE job_type ~* '_(cellier|buanderie|lingerie)'
  AND room_specific = FALSE;

-- Entrée / Hall / Vestibule
UPDATE market_prices
SET room_specific = TRUE,
    required_room = ARRAY['entree'],
    generic_family = regexp_replace(job_type, '_(entree|hall|vestibule).*$', '', 'i')
WHERE job_type ~* '_(entree|hall|vestibule)'
  AND room_specific = FALSE;

-- Couloir / Dégagement
UPDATE market_prices
SET room_specific = TRUE,
    required_room = ARRAY['couloir'],
    generic_family = regexp_replace(job_type, '_(couloir|degagement).*$', '', 'i')
WHERE job_type ~* '_(couloir|degagement)'
  AND room_specific = FALSE;

-- Extérieur / Terrasse / Balcon / Jardin
UPDATE market_prices
SET room_specific = TRUE,
    required_room = ARRAY['exterieur'],
    generic_family = regexp_replace(job_type, '_(terrasse|balcon|jardin|exterieur).*$', '', 'i')
WHERE job_type ~* '_(terrasse|balcon|jardin|exterieur)'
  AND room_specific = FALSE;

-- Cave / Sous-sol
UPDATE market_prices
SET room_specific = TRUE,
    required_room = ARRAY['cave'],
    generic_family = regexp_replace(job_type, '_(cave|sous_sol).*$', '', 'i')
WHERE job_type ~* '_(cave|sous_sol)'
  AND room_specific = FALSE;

-- Combles / Grenier
UPDATE market_prices
SET room_specific = TRUE,
    required_room = ARRAY['combles'],
    generic_family = regexp_replace(job_type, '_(combles|grenier).*$', '', 'i')
WHERE job_type ~* '_(combles|grenier)'
  AND room_specific = FALSE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Pour les job_types NON room-specific, calculer une generic_family égale
--    au job_type lui-même (utile pour le matcher quand il cherche par famille).
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE market_prices
SET generic_family = job_type
WHERE generic_family IS NULL
  AND room_specific = FALSE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Vérification — affiche les statistiques après migration
-- ─────────────────────────────────────────────────────────────────────────────
-- Lancer manuellement après la migration pour valider :
--
-- SELECT
--   COUNT(*) AS total,
--   SUM(CASE WHEN room_specific THEN 1 ELSE 0 END) AS room_specific_count,
--   SUM(CASE WHEN generic_family IS NOT NULL THEN 1 ELSE 0 END) AS with_family,
--   COUNT(DISTINCT generic_family) AS distinct_families
-- FROM market_prices;
