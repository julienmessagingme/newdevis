-- Migration : resync one-shot des contacts désynchronisés de leur devis.
--
-- Bug : un contact peut avoir lot_id != lot_id de son devis (cas typique :
-- l'auto-classement initial a mis devis + contact dans le même mauvais lot,
-- puis l'utilisateur a déplacé le devis vers le bon lot, mais le contact
-- est resté sur l'ancien). C'est de l'incohérence — le devis est la source
-- de vérité.
--
-- Le PATCH route documents/[docId] est patché en parallèle pour empêcher
-- que ça se reproduise.

-- 1. Resync via analyse_id (lien fort : contact créé depuis une analyse VMD)
UPDATE contacts_chantier c
SET lot_id = d.lot_id
FROM documents_chantier d
WHERE d.chantier_id      = c.chantier_id
  AND d.document_type    = 'devis'
  AND d.analyse_id IS NOT NULL
  AND d.analyse_id       = c.analyse_id
  AND d.lot_id IS NOT NULL
  AND c.lot_id IS DISTINCT FROM d.lot_id;

-- 2. Resync via siret (fallback : contact sans analyse_id mais même artisan)
--    On prend le devis le plus récent avec un lot_id pour ce siret.
UPDATE contacts_chantier c
SET lot_id = derived.lot_id
FROM (
  SELECT DISTINCT ON (c2.id)
    c2.id          AS contact_id,
    d.lot_id       AS lot_id
  FROM contacts_chantier c2
  JOIN documents_chantier d
    ON d.chantier_id = c2.chantier_id
   AND d.document_type = 'devis'
   AND d.lot_id IS NOT NULL
  JOIN analyses a
    ON a.id = d.analyse_id
   AND a.user_id IS NOT NULL
  WHERE c2.siret IS NOT NULL
    AND c2.analyse_id IS NULL              -- déjà traité en étape 1
    AND (a.raw_text::jsonb)->'extracted'->'entreprise'->>'siret' = c2.siret
    AND c2.lot_id IS DISTINCT FROM d.lot_id
  ORDER BY c2.id, d.created_at DESC
) AS derived
WHERE c.id = derived.contact_id;
