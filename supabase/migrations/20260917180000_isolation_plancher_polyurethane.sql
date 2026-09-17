-- 2026-09-17 — ENTRÉE MANQUANTE : ISOLANT POLYURÉTHANE SOUS DALLE / SOUS CHAPE
-- (demande Johan : « source l'entrée polyuréthane sous dalle »).
--
-- Déclencheur : le sourcing des quatre fourchettes du devis 25030 (migration
-- 20260917160000) a montré que la ligne « Fourniture et pose d'un isolant
-- polyuréthane 80 mm R = 3,70 » (103 m², 3 338 € HT, soit 32,41 €/m²) était
-- rapprochée d'`isolation_plancher_polystyrene`. **Deux matériaux, deux prix** :
-- le PSE 100 mm vaut ~15 €/m² en fourniture, le PU 80 mm ~22 €/m². Gonfler
-- l'entrée PSE pour couvrir le PU aurait faussé une entrée correcte et absous
-- tous les planchers isolés au polystyrène — le même raisonnement qui a fait
-- REFUSER de remonter `mur_parpaing_20` le 17/09 au matin.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SOURCES (relevées le 17/09/2026, pages ouvertes et lues, URL interrogées) :
--
--   · chausson.fr — négociant matériaux. **LE PRODUIT EXACT DU DEVIS** : panneau
--     TMS Soprema mousse polyuréthane, sol sous chape ou dallage, ép. 80 mm,
--     « R = 3,70 m².k/w », **26,34 € / m² TTC** (31,61 € la dalle de 1,20 × 1 m).
--     Converti à 20 % : **21,95 € HT/m² en FOURNITURE SEULE**.
--
--   · renovbox.fr/prix/isolation/materiaux/polyurethane — panneaux PIR/PUR.
--     Fourniture seule par épaisseur : 100 mm 15-28 €/m², 140 mm 22-38,
--     200 mm 32-50. Et une ligne fourni-posé : « **PIR sous chape neuve :
--     40 / 70 €/m²** ».
--
--   · isolationavenue.com/.../prix-isolation-sol-polyurethane — pose de panneaux
--     rigides sur surface plane « environ 10 € à 20 € le m² ».
--
-- FOURCHETTE RETENUE : 28 / 38 / 50 € HT/m², fourni + posé.
--   · plancher 28 — la fourniture vérifiée (22 € HT) plus la pose la plus basse
--     relevée (10 €/m², arrondi prudemment) ; on ne descend pas sous le coût
--     du matériau, sinon l'entrée absout une pose gratuite.
--   · plafond 50 — la fourniture plus le haut de la pose (≈ 25 €/m² : découpes,
--     relevés périphériques, bande de rive), arrondi.
--   ⚠️ **ON NE RETIENT PAS LE 70 € DE RENOVBOX**, et c'est délibéré : sa ligne
--     dit « PIR sous chape NEUVE », un périmètre qui embarque vraisemblablement
--     la chape elle-même. Un plafond emprunté à un périmètre plus large absout
--     à tort — exactement le piège « isolation sous chape 50-110 €/m² » écarté
--     hier, où le prix comprenait la chape.
--
-- ⚠️ PÉRIMÈTRE : L'ISOLANT SEUL. Ni la dalle, ni la chape, ni le ragréage, ni
-- le film polyane. C'est ce qui rend l'entrée comparable à une ligne de devis
-- qui ne facture que l'isolant, et c'est écrit dans les notes.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.market_prices (
  job_type, label, unit,
  price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht,
  fixed_min_ht, fixed_avg_ht, fixed_max_ht,
  zip_scope, domain, metier, nature_prix, generic_family,
  room_specific, sample_size,
  source, notes, last_reviewed_at
) values (
  'isolation_plancher_polyurethane',
  'Isolation plancher polyuréthane sous dalle (fourni+posé)',
  'm2',
  28, 38, 50,
  0, 0, 0,
  'FR', 'travaux', 'placo_isolation', 'fourniture_pose', 'isolation_plancher_polyurethane',
  false, 0,
  'web 2026-09-17 — chausson.fr (panneau TMS Soprema PU sol sous chape/dallage, ép. 80 mm, R=3,70 : 26,34 €/m² TTC soit 21,95 HT, fourniture seule) + renovbox.fr (PIR/PUR : fourniture 100 mm 15-28 €/m², et fourni-posé « PIR sous chape neuve » 40-70) + isolationavenue.com (pose de panneaux rigides 10-20 €/m²)',
  'Fourni + posé. Panneaux rigides PU/PIR (type TMS) sous dalle ou sous chape, ép. ~80 mm (R ≈ 3,7). L''ISOLANT SEUL : ni la dalle, ni la chape, ni le ragréage, ni le film polyane. ⚠️ Distincte d''isolation_plancher_polystyrene (15-40) — le PU vaut ~22 €/m² en fourniture contre ~15 pour le PSE. ⚠️ Distincte aussi de la mousse polyuréthane PROJETÉE (isolation_mousse_projetée, 30-80) : autre mise en œuvre. Plafond 50 et non 70 : la source à 70 chiffre « sous chape neuve », chape comprise.',
  now()
)
on conflict (job_type) do update set
  label = excluded.label,
  unit = excluded.unit,
  price_min_unit_ht = excluded.price_min_unit_ht,
  price_avg_unit_ht = excluded.price_avg_unit_ht,
  price_max_unit_ht = excluded.price_max_unit_ht,
  metier = excluded.metier,
  nature_prix = excluded.nature_prix,
  source = excluded.source,
  notes = excluded.notes,
  last_reviewed_at = excluded.last_reviewed_at;

-- ═══════════════════════════════════════════════════════════════════════════
-- TÉMOIN — l'entrée doit exister, être ordonnée, et rester COHÉRENTE avec ses
-- deux voisines. Sans ce bloc, un insert silencieusement ignoré passerait pour
-- un succès, et l'étape suivante (embeddings) porterait sur rien.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  n int;
  pu_min numeric; pu_max numeric;
  pse_min numeric; pse_max numeric;
begin
  select count(*) into n from public.market_prices
  where job_type = 'isolation_plancher_polyurethane';
  if n <> 1 then
    raise exception 'TÉMOIN CASSÉ : % entrée(s) polyuréthane au lieu de 1', n;
  end if;

  select price_min_unit_ht, price_max_unit_ht into pu_min, pu_max
  from public.market_prices where job_type = 'isolation_plancher_polyurethane';
  if not (pu_min <= pu_max) then
    raise exception 'TÉMOIN CASSÉ : fourchette désordonnée (% > %)', pu_min, pu_max;
  end if;

  -- 🔴 LE CONTRÔLE QUI COMPTE : le polyuréthane coûte PLUS CHER que le
  -- polystyrène, à tous les étages. Si l'inverse devenait vrai, l'une des deux
  -- entrées serait fausse — et le matcher, qui hésite entre les deux sur des
  -- libellés proches, absoudrait ou accuserait au hasard du rapprochement.
  select price_min_unit_ht, price_max_unit_ht into pse_min, pse_max
  from public.market_prices where job_type = 'isolation_plancher_polystyrene';
  if pse_min is null then
    raise exception 'TÉMOIN CASSÉ : isolation_plancher_polystyrene introuvable — la comparaison de gamme est impossible';
  end if;
  if not (pu_min > pse_min and pu_max > pse_max) then
    raise exception 'TÉMOIN CASSÉ : le polyuréthane (%-%) n''est plus au-dessus du polystyrène (%-%)', pu_min, pu_max, pse_min, pse_max;
  end if;

  raise notice 'OK : entrée polyuréthane créée (% - % €/m²), au-dessus du polystyrène (% - %).', pu_min, pu_max, pse_min, pse_max;
end $$;

-- ⚠️ DEUXIÈME ET TROISIÈME GESTES OBLIGATOIRES (règle « 3 gestes, jamais 1 ») :
--   2. node scripts/seed_market_prices_embeddings.mjs
--      Sans embedding, l'entrée EXISTE mais reste INTROUVABLE par la recherche.
--   3. Vérifier EN DIRECT que la ligne réelle la remonte en tête — et surtout
--      que les lignes d'isolant polyuréthane EXTÉRIEUR du même devis ne partent
--      PAS dessus (risque d'aimant, cf. banc-entrees-aimant du 16/09).
