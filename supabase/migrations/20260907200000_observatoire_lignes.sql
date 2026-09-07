-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-07 (retour Johan) — EXPOSER LES LIGNES, PAS SEULEMENT DES MOYENNES
--
-- « Les prix de l'observatoire n'apportent rien : 1 397 € de panier moyen, et
-- alors ? » Le défaut était que les vues agrégeaient AVG et PERCENTILE sur
-- `prix_unitaire` toutes unités confondues — sur la page menuiserie, 121 lignes
-- à l'unité, 3 au mètre linéaire, 1 au m² et 3 forfaits dans la même médiane.
--
-- La règle de publication (une série par poste ET par unité, forfaits exclus,
-- forfaits déguisés écartés, P90/P10 plutôt que max/min) vit désormais dans
-- `src/lib/observatoire/statsPrix.ts`, testée, et partagée avec les études
-- thématiques. Le SQL n'a plus qu'à fournir les LIGNES ; l'agrégation se fait
-- au-dessus. C'est aussi ce qui évite d'avoir deux définitions de la règle.
--
-- La classification du type de chantier était écrite en dur dans
-- `mv_observatoire_chantiers`. Elle devient une fonction, appelée par les deux
-- vues : une seule définition, pas de dérive possible.
-- ─────────────────────────────────────────────────────────────────────────────

-- 🔴 DEUX DÉFAUTS DU CASE D'ORIGINE, MESURÉS LE 2026-09-07 : 196 lignes sur
-- 1 628 (12 % du corpus) étaient mal classées.
--
--   1. `ILIKE '%iti%'` attrapait « démol-ITI-on » : TOUTES les lignes de
--      démolition comptaient en isolation. La page isolation affichait 83 devis
--      au lieu de 43, et son fait marquant sortait sur de la plomberie. Les
--      sigles ITE / ITI se cherchent en MOT ENTIER.
--   2. La comparaison était sensible aux accents : `%fenetre%` ne matche pas
--      « Fenêtre ». La page fenêtres annonçait 2 devis quand le corpus en
--      contient 56. Idem gouttière, façade, clôture — toiture 38 → 62,
--      façade 10 → 22, clôture 5 → 17.
--
-- Le repli d'accents se fait par TRANSLATE plutôt que par `unaccent` : cette
-- extension n'est pas installée sur le projet, et l'exiger ferait échouer la
-- migration.
--
-- ⚠️ La même règle vit dans `typeDeChantier()` (scripts/observatoire/
-- generate-observatoire.ts), qui pilote le contenu publié tant que cette
-- migration n'est pas appliquée. Toute évolution se fait DES DEUX CÔTÉS.

CREATE OR REPLACE FUNCTION public.observatoire_sans_accents(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT TRANSLATE(
    lower(COALESCE(p, '')),
    'àáâãäçèéêëìíîïñòóôõöùúûüýÿ',
    'aaaaaceeeeiiiinooooouuuuyy'
  );
$$;

CREATE OR REPLACE FUNCTION public.observatoire_chantier_type(
  p_label  TEXT,
  p_metier TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  WITH n AS (SELECT public.observatoire_sans_accents(p_label) AS l)
  SELECT CASE
    WHEN n.l LIKE '%salle de bain%' OR n.l LIKE '%sdb%'
      OR n.l LIKE '%douche%' OR n.l LIKE '%baignoire%'
      OR n.l LIKE '%lavabo%' OR n.l ~ '(^|[^a-z0-9])wc([^a-z0-9]|$)'
      OR n.l LIKE '%receveur%' OR n.l LIKE '%vasque%' THEN 'salle-de-bain'
    WHEN n.l LIKE '%cuisine%' THEN 'cuisine'
    WHEN n.l LIKE '%toiture%' OR n.l LIKE '%couverture%'
      OR n.l LIKE '%charpente%' OR n.l LIKE '%tuile%'
      OR n.l LIKE '%ardoise%' OR n.l LIKE '%zinc%'
      OR n.l LIKE '%gouttiere%' THEN 'toiture'
    -- ITE / ITI en mot entier : sinon « démolition » devient de l'isolation.
    WHEN n.l LIKE '%isolation%' OR n.l LIKE '%isolant%'
      OR n.l ~ '(^|[^a-z0-9])(ite|iti)([^a-z0-9]|$)' THEN 'isolation'
    WHEN n.l LIKE '%fenetre%' OR n.l LIKE '%chassis%'
      OR n.l LIKE '%velux%' THEN 'fenetres'
    WHEN n.l LIKE '%facade%' OR n.l LIKE '%bardage%'
      OR n.l LIKE '%ravalement%' THEN 'facade'
    WHEN n.l LIKE '%terrasse%' THEN 'terrasse'
    WHEN n.l LIKE '%piscine%' THEN 'piscine'
    WHEN n.l LIKE '%cloture%' OR n.l LIKE '%portail%' THEN 'cloture'
    WHEN n.l LIKE '%garage%' THEN 'garage'
    WHEN p_metier = 'chauffage' THEN 'chauffage'
    WHEN p_metier = 'electricite' THEN 'electricite'
    WHEN p_metier = 'plomberie_sanitaires' THEN 'plomberie'
    WHEN p_metier = 'peinture_revetements' THEN 'peinture'
    WHEN p_metier = 'placo_isolation' THEN 'cloisons'
    WHEN p_metier = 'carrelage_faience' THEN 'carrelage'
    ELSE NULL
  END
  FROM n;
$$;

COMMENT ON FUNCTION public.observatoire_chantier_type(TEXT, TEXT) IS
  'Type de chantier déduit du libellé de groupe et du métier, insensible aux accents, ITE/ITI en mot entier. Définition UNIQUE, appelée par mv_observatoire_lignes et mv_observatoire_chantiers. Doit rester alignée avec typeDeChantier() du générateur.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Vue de lignes : une observation = une ligne de devis rapprochée du catalogue.
-- C'est la matière première des pages métier et chantier ; l'agrégation et les
-- garde-fous sont appliqués côté générateur (statsPrix.ts).
-- ─────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.mv_observatoire_lignes;

CREATE MATERIALIZED VIEW public.mv_observatoire_lignes AS
SELECT
  b.analysis_id,
  b.created_at,
  b.metier,
  public.observatoire_chantier_type(b.job_type_label, b.metier) AS chantier_type,
  b.market_label,
  b.main_unit,
  b.prix_unitaire,
  b.devis_total_ht,
  b.market_price_avg
FROM public.mv_observatoire_base b
WHERE b.market_label IS NOT NULL;

CREATE INDEX IF NOT EXISTS mv_observatoire_lignes_metier_idx
  ON public.mv_observatoire_lignes (metier);
CREATE INDEX IF NOT EXISTS mv_observatoire_lignes_chantier_idx
  ON public.mv_observatoire_lignes (chantier_type);

COMMENT ON MATERIALIZED VIEW public.mv_observatoire_lignes IS
  'Lignes de devis rapprochées du catalogue, avec métier et type de chantier. Alimente les pages observatoire ; les moyennes ne sont PAS calculées ici — la règle de publication vit dans src/lib/observatoire/statsPrix.ts.';

GRANT SELECT ON public.mv_observatoire_lignes TO service_role;

-- Rafraîchissement initial (les MV sont peuplées à la création, mais on le note
-- pour le cron hebdomadaire qui rafraîchit déjà les autres vues).
