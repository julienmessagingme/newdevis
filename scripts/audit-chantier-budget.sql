-- ============================================================================
-- AUDIT BUDGET & TRÉSORERIE — un chantier
-- ============================================================================
-- Usage : Supabase Dashboard → SQL Editor → paste ce script
--   Avant de RUN : remplace 'Portail, Clôture et Terrasse Bois' par le nom
--   exact du chantier à auditer (présent dans CHAQUE section, 9 endroits —
--   utilise Ctrl+H pour remplacer en une fois).
--
-- ⚠️  Le SQL Editor de Supabase n'affiche que le résultat de la DERNIÈRE
-- requête. Pour voir les 9 sections, lance-les UNE PAR UNE :
--   - sélectionne uniquement la section voulue (clique-glisse pour
--     surligner du commentaire de section jusqu'au point-virgule final)
--   - clique Run → screenshot du résultat
--   - répète pour chaque section
--
-- Sortie : 9 sections numérotées (1️⃣ → 9️⃣). Chaque section répond à une
-- question précise pour identifier d'où viennent les incohérences observées
-- côté UI.
--
-- À partager : le résultat de chaque section (screenshots ou copier-coller
-- des tableaux) pour diagnostic. Aucune écriture — read-only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- _ctx : récupère l'ID du chantier audité (pour réutilisation dans les CTEs)
-- ----------------------------------------------------------------------------
WITH _ctx AS (
  SELECT id, nom, type_projet, budget, metadonnees, created_at
  FROM public.chantiers
  WHERE nom = 'Portail, Clôture et Terrasse Bois'  -- 👈 CHANGE ME
  LIMIT 1
)

-- ============================================================================
-- 1️⃣  IDENTITÉ DU CHANTIER + 3 SOURCES DU BUDGET CIBLE
-- ============================================================================
-- Question : combien de chiffres "budget" sont stockés ? sont-ils cohérents ?
SELECT
  '1️⃣ BUDGET CIBLE — 3 sources'                AS section,
  c.id::text                                    AS chantier_id,
  c.nom                                         AS chantier_nom,
  c.budget                                      AS source_1_chantiers_budget,
  ((c.metadonnees::jsonb)->>'budgetTotal')::numeric      AS source_2_meta_budgetTotal,
  ((c.metadonnees::jsonb)->'tresoreieFinancing'->>'budgetReel')::numeric
                                                AS source_3_meta_tresoreieFinancing_budgetReel,
  CASE
    WHEN c.budget IS DISTINCT FROM ((c.metadonnees::jsonb)->>'budgetTotal')::numeric
      OR c.budget IS DISTINCT FROM ((c.metadonnees::jsonb)->'tresoreieFinancing'->>'budgetReel')::numeric
    THEN '⚠️ DRIFT : les 3 sources ne matchent pas'
    ELSE '✅ cohérent'
  END                                           AS verdict
FROM _ctx c;

-- ============================================================================
-- 2️⃣  TOUS LES DOCUMENTS (devis + factures + frais + ticket_caisse)
-- ============================================================================
-- Question : quels documents existent, quel statut, quel montant ?
WITH _ctx AS (SELECT id FROM public.chantiers WHERE nom = 'Portail, Clôture et Terrasse Bois' LIMIT 1)
SELECT
  '2️⃣ DOCUMENTS'                 AS section,
  d.created_at::date              AS date,
  d.document_type                 AS type,
  d.depense_type                  AS depense_type,
  COALESCE(l.nom, '— sans lot —') AS lot,
  LEFT(d.nom, 60)                 AS nom,
  d.devis_statut                  AS devis_statut,
  d.facture_statut                AS facture_statut,
  d.montant                       AS montant,
  d.montant_paye                  AS montant_paye_legacy,
  jsonb_array_length(d.cashflow_terms) AS nb_cashflow_terms,
  d.id::text                      AS doc_id
FROM public.documents_chantier d
LEFT JOIN public.lots_chantier l ON l.id = d.lot_id
WHERE d.chantier_id = (SELECT id FROM _ctx)
  AND d.document_type IN ('devis', 'facture')
ORDER BY d.created_at DESC;

-- ============================================================================
-- 3️⃣  CASHFLOW_TERMS DÉTAIL (les versements rattachés à chaque doc)
-- ============================================================================
-- Question : pour chaque versement, est-il marqué payé ? pour quel montant ?
-- C'est ce qui alimente le KPI Décaissé (acomptes + factures réglées).
WITH _ctx AS (SELECT id FROM public.chantiers WHERE nom = 'Portail, Clôture et Terrasse Bois' LIMIT 1)
SELECT
  '3️⃣ CASHFLOW_TERMS'              AS section,
  d.document_type                  AS type_doc,
  d.devis_statut                   AS devis_statut,
  LEFT(d.nom, 40)                  AS nom_doc,
  (term->>'amount')::numeric       AS amount,
  term->>'due_date'                AS due_date,
  term->>'status'                  AS status,
  term->>'label'                   AS label,
  term_index                       AS idx,
  d.id::text                       AS doc_id
FROM public.documents_chantier d
CROSS JOIN LATERAL jsonb_array_elements(d.cashflow_terms) WITH ORDINALITY AS t(term, term_index)
WHERE d.chantier_id = (SELECT id FROM _ctx)
ORDER BY d.created_at DESC, term_index;

-- ============================================================================
-- 4️⃣  CASHFLOW_EXTRAS — mouvements sans pièce (les fameux orphelins)
-- ============================================================================
-- Question : combien de cashflow_extras orphelins ? c'est ici qu'on trouve
-- les "Matériau carrelage 10 000 €" et "maçon au black 5 000 €" qui ne
-- s'affichent dans aucun écran lié à un lot.
WITH _ctx AS (SELECT id FROM public.chantiers WHERE nom = 'Portail, Clôture et Terrasse Bois' LIMIT 1)
SELECT
  '4️⃣ CASHFLOW_EXTRAS (orphelins)' AS section,
  e.due_date                       AS date,
  e.label                          AS label,
  e.amount                         AS amount,
  e.status                         AS status,
  e.financing_source               AS source,
  e.notes                          AS notes,
  e.created_at::date               AS created,
  e.id::text                       AS extra_id
FROM public.cashflow_extras e
WHERE e.project_id = (SELECT id FROM _ctx)
ORDER BY e.due_date DESC NULLS LAST, e.created_at DESC;

-- ============================================================================
-- 5️⃣  PAYMENT_EVENTS_V — la VIEW consolidée (devrait être la source unique)
-- ============================================================================
-- Question : quelle est la liste finale des "events" que l'API budget
-- consomme ? cette vue UNION les 3 branches (frais auto, cashflow_terms,
-- cashflow_extras) — c'est ce qui devrait être le SEUL chiffre vérité.
WITH _ctx AS (SELECT id FROM public.chantiers WHERE nom = 'Portail, Clôture et Terrasse Bois' LIMIT 1)
SELECT
  '5️⃣ PAYMENT_EVENTS_V'    AS section,
  v.due_date               AS date,
  v.source_type            AS type,
  v.amount                 AS amount,
  v.status                 AS status,
  v.label                  AS label,
  v.term_index             AS idx,
  v.source_id::text        AS source_doc_id,
  v.lot_id::text           AS lot_id
FROM public.payment_events_v v
WHERE v.project_id = (SELECT id FROM _ctx)
ORDER BY v.due_date DESC NULLS LAST;

-- ============================================================================
-- 6️⃣  CALCUL — Décaissé selon l'API budget (devrait matcher le KPI)
-- ============================================================================
-- Reproduction fidèle de la logique de src/pages/api/chantier/[id]/budget.ts :
--   - eventsPayeByDoc = SUM(payment_events_v WHERE status='paid' AND source_id NOT NULL AND source_type != 'frais')
--   - paye    = SUM facture entièrement payée
--   - acompte = SUM (paiements partiels factures) + (acomptes versés sur devis SIGNÉS)
--   - acompte_pending = acomptes versés sur devis NON SIGNÉS (Bug A fix 2026-05-09)
--   - décaissé = paye + acompte (HORS acompte_pending)
WITH
_ctx AS (SELECT id FROM public.chantiers WHERE nom = 'Portail, Clôture et Terrasse Bois' LIMIT 1),
_paid_per_doc AS (
  SELECT
    v.source_id,
    v.source_type,
    SUM(v.amount) AS total_paid
  FROM public.payment_events_v v
  WHERE v.project_id = (SELECT id FROM _ctx)
    AND v.status = 'paid'
    AND v.source_id IS NOT NULL
    AND v.source_type != 'frais'
  GROUP BY v.source_id, v.source_type
),
_doc_status AS (
  SELECT
    d.id,
    d.document_type,
    d.devis_statut,
    d.facture_statut,
    d.montant,
    d.depense_type,
    COALESCE(p.total_paid, 0) AS total_paid,
    (d.devis_statut IN ('valide', 'attente_facture')) AS is_signed
  FROM public.documents_chantier d
  LEFT JOIN _paid_per_doc p ON p.source_id = d.id
  WHERE d.chantier_id = (SELECT id FROM _ctx)
    AND d.document_type IN ('devis', 'facture')
)
SELECT
  '6️⃣ CALCUL DÉCAISSÉ (reproduction logique API)' AS section,
  -- Devis signés
  SUM(CASE WHEN document_type = 'devis' AND is_signed THEN total_paid ELSE 0 END) AS acomptes_devis_signes,
  -- Devis pending
  SUM(CASE WHEN document_type = 'devis' AND NOT is_signed THEN total_paid ELSE 0 END) AS acomptes_devis_pending,
  -- Factures payées intégralement
  SUM(CASE
    WHEN document_type = 'facture'
      AND (facture_statut = 'payee' OR depense_type IN ('ticket_caisse','frais'))
      AND total_paid >= COALESCE(montant, 0)
    THEN COALESCE(montant, 0) ELSE 0 END) AS factures_reglees,
  -- Factures partielles
  SUM(CASE
    WHEN document_type = 'facture'
      AND facture_statut = 'payee_partiellement'
    THEN total_paid ELSE 0 END) AS factures_acomptes_partiels,
  -- TOTAL DÉCAISSÉ (ce qui devrait apparaître dans le KPI)
  SUM(CASE WHEN document_type = 'devis' AND is_signed THEN total_paid ELSE 0 END)
  + SUM(CASE WHEN document_type = 'facture' AND facture_statut = 'payee_partiellement' THEN total_paid ELSE 0 END)
  + SUM(CASE
      WHEN document_type = 'facture'
        AND (facture_statut = 'payee' OR depense_type IN ('ticket_caisse','frais'))
      THEN COALESCE(montant, 0) ELSE 0 END)
  AS total_decaisse_attendu
FROM _doc_status;

-- ============================================================================
-- 7️⃣  SOMME ENGAGEMENT (devis_valides) — 1 ligne par lot
-- ============================================================================
-- Question : pourquoi l'Accueil "Total TTC estimé" (13 444 €) ≠ somme par
-- lot dans Budget ? On affiche ici la VRAIE somme par lot.
WITH _ctx AS (SELECT id FROM public.chantiers WHERE nom = 'Portail, Clôture et Terrasse Bois' LIMIT 1)
SELECT
  '7️⃣ ENGAGEMENT par LOT (devis signés)' AS section,
  COALESCE(l.nom, '— sans lot —')         AS lot,
  COUNT(*)                                AS nb_devis_signes,
  SUM(d.montant)                          AS engagement_lot
FROM public.documents_chantier d
LEFT JOIN public.lots_chantier l ON l.id = d.lot_id
WHERE d.chantier_id = (SELECT id FROM _ctx)
  AND d.document_type = 'devis'
  AND d.devis_statut IN ('valide', 'attente_facture')
GROUP BY l.nom
ORDER BY engagement_lot DESC;

-- ============================================================================
-- 8️⃣  TOTAL ENGAGEMENT GLOBAL — devrait matcher le KPI "Engagé" ou "Budget"
-- ============================================================================
WITH _ctx AS (SELECT id FROM public.chantiers WHERE nom = 'Portail, Clôture et Terrasse Bois' LIMIT 1)
SELECT
  '8️⃣ ENGAGEMENT GLOBAL'                  AS section,
  COUNT(*) FILTER (WHERE d.document_type = 'devis' AND d.devis_statut IN ('valide','attente_facture'))
                                          AS nb_devis_signes,
  COUNT(*) FILTER (WHERE d.document_type = 'devis' AND d.devis_statut = 'en_cours')
                                          AS nb_devis_pending,
  SUM(d.montant) FILTER (WHERE d.document_type = 'devis' AND d.devis_statut IN ('valide','attente_facture'))
                                          AS engagement_signe,
  SUM(d.montant) FILTER (WHERE d.document_type = 'devis' AND d.devis_statut = 'en_cours')
                                          AS engagement_pending,
  COUNT(*) FILTER (WHERE d.document_type = 'facture')
                                          AS nb_factures,
  SUM(d.montant) FILTER (WHERE d.document_type = 'facture')
                                          AS factures_total
FROM public.documents_chantier d
WHERE d.chantier_id = (SELECT id FROM _ctx);

-- ============================================================================
-- 9️⃣  ANOMALIES DÉTECTÉES — checklist des incohérences
-- ============================================================================
-- 1) cashflow_extras orphelins (sans lot, sans doc)
-- 2) cashflow_terms avec status='paid' sur des devis 'en_cours'
-- 3) Factures avec montant_paye > montant
-- 4) Documents avec montant null
WITH
_ctx AS (SELECT id FROM public.chantiers WHERE nom = 'Portail, Clôture et Terrasse Bois' LIMIT 1),
_anomalies AS (
  SELECT
    'A1. cashflow_extras orphelins (à rattacher ou supprimer)' AS anomalie,
    COUNT(*)::text || ' entrées · total ' || COALESCE(SUM(amount), 0)::text || ' €' AS detail
  FROM public.cashflow_extras
  WHERE project_id = (SELECT id FROM _ctx)
    AND status != 'cancelled'

  UNION ALL

  SELECT
    'A2. Acomptes payés sur devis NON signés (Bug A — Décaissé gonflé)',
    COUNT(*)::text || ' termes · total ' ||
      COALESCE(SUM((term->>'amount')::numeric) FILTER (WHERE term->>'status' = 'paid'), 0)::text || ' € payés'
  FROM public.documents_chantier d
  CROSS JOIN LATERAL jsonb_array_elements(d.cashflow_terms) AS term
  WHERE d.chantier_id = (SELECT id FROM _ctx)
    AND d.document_type = 'devis'
    AND d.devis_statut NOT IN ('valide', 'attente_facture')
    AND (term->>'status') = 'paid'

  UNION ALL

  SELECT
    'A3. Factures avec montant_paye > montant (overpayment)',
    COUNT(*)::text || ' factures'
  FROM public.documents_chantier
  WHERE chantier_id = (SELECT id FROM _ctx)
    AND document_type = 'facture'
    AND montant_paye > montant
    AND montant IS NOT NULL

  UNION ALL

  SELECT
    'A4. Documents sans montant (null)',
    COUNT(*)::text || ' documents'
  FROM public.documents_chantier
  WHERE chantier_id = (SELECT id FROM _ctx)
    AND document_type IN ('devis', 'facture')
    AND (montant IS NULL OR montant = 0)

  UNION ALL

  SELECT
    'A5. cashflow_terms avec amount null',
    COUNT(*)::text || ' termes'
  FROM public.documents_chantier d
  CROSS JOIN LATERAL jsonb_array_elements(d.cashflow_terms) AS term
  WHERE d.chantier_id = (SELECT id FROM _ctx)
    AND (term->>'amount') IS NULL
)
SELECT
  '9️⃣ ANOMALIES' AS section,
  *
FROM _anomalies;
