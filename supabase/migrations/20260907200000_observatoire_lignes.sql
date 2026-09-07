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

CREATE OR REPLACE FUNCTION public.observatoire_chantier_type(
  p_label  TEXT,
  p_metier TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_label ILIKE '%salle de bain%' OR p_label ILIKE '%sdb%'
      OR p_label ILIKE '%douche%' OR p_label ILIKE '%baignoire%'
      OR p_label ILIKE '%lavabo%' OR p_label ILIKE '%wc%'
      OR p_label ILIKE '%receveur%' OR p_label ILIKE '%vasque%' THEN 'salle-de-bain'
    WHEN p_label ILIKE '%cuisine%' THEN 'cuisine'
    WHEN p_label ILIKE '%toiture%' OR p_label ILIKE '%couverture%'
      OR p_label ILIKE '%charpente%' OR p_label ILIKE '%tuile%'
      OR p_label ILIKE '%ardoise%' OR p_label ILIKE '%zinc%'
      OR p_label ILIKE '%gouttiere%' THEN 'toiture'
    WHEN p_label ILIKE '%isolation%' OR p_label ILIKE '%ite%'
      OR p_label ILIKE '%iti%' THEN 'isolation'
    WHEN p_label ILIKE '%fenetre%' OR p_label ILIKE '%porte-fenetre%'
      OR p_label ILIKE '%chassis%' OR p_label ILIKE '%velux%' THEN 'fenetres'
    WHEN p_label ILIKE '%facade%' OR p_label ILIKE '%bardage%'
      OR p_label ILIKE '%ravalement%' THEN 'facade'
    WHEN p_label ILIKE '%terrasse%' THEN 'terrasse'
    WHEN p_label ILIKE '%piscine%' THEN 'piscine'
    WHEN p_label ILIKE '%cloture%' OR p_label ILIKE '%portail%' THEN 'cloture'
    WHEN p_label ILIKE '%garage%' THEN 'garage'
    WHEN p_metier = 'chauffage' THEN 'chauffage'
    WHEN p_metier = 'electricite' THEN 'electricite'
    WHEN p_metier = 'peinture_revetements' THEN 'peinture'
    WHEN p_metier = 'placo_isolation' THEN 'placo'
    WHEN p_metier = 'carrelage_faience' THEN 'carrelage'
    WHEN p_metier = 'sols_souples' OR p_metier = 'sols_durs' THEN 'sols'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.observatoire_chantier_type(TEXT, TEXT) IS
  'Type de chantier déduit du libellé de poste et du métier. Définition UNIQUE, appelée par mv_observatoire_lignes et mv_observatoire_chantiers.';

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
