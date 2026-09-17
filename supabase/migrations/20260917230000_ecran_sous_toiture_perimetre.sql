-- 2026-09-17 — ÉCRAN DE SOUS-TOITURE : 6-20 → 6-30 €/m², ET SURTOUT SON
-- PÉRIMÈTRE ÉCRIT NOIR SUR BLANC (demande Johan : « corrige la fourchette si
-- elle est trop basse »).
--
-- ⚠️ CETTE ENTRÉE EST REGARDÉE PARCE QU'ELLE VIENT DE PRODUIRE UNE ACCUSATION
-- (devis Vilette : écran facturé 5 800 € pour 64 m², soit 90,63 €/m²). C'est
-- exactement la situation où l'on risque de « corriger » une fourchette pour
-- faire disparaître un chiffre qui dérange. Le sourcing a donc été fait sans
-- montrer au moteur ni notre fourchette ni le devis, et le résultat est
-- volontairement inconfortable : **la fourchette était un peu basse, la
-- corriger ne fait pas disparaître l'écart** (×4,5 → ×3,0).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 LE VRAI SUJET N'EST PAS LE PRIX, C'EST LE PÉRIMÈTRE — ET C'EST CE QUI
--    EXPLIQUE UN ÉCART DE 1 À 10 ENTRE LES SOURCES.
--
--   · constructeurtravaux.fr/ecran-sous-toiture — l'écran SEUL, sur une toiture
--     déjà ouverte : fourniture 0,8-20 €/m² selon le type, pose ≈ 0,05 h/m² à
--     40-60 €/h. Exemple chiffré de la page : **4,70 €/m²** tout compris.
--   · guide-toiture.com/travaux-annexes-toiture/ecran-sous-toiture — décompose :
--     **fourniture HPV 7-10 €/m²**, **pose seule (hors fourniture) 10-20 €/m²**.
--     Et pour la ligne « rénovation, fourniture incluse : 15-50 €/m² », la page
--     précise que ce tarif **INCLUT la dépose de l'ancienne couverture, de
--     l'ancien écran, et le contre-lattage**.
--   · prixdestravaux.com/prix-ecran-sous-toiture — fourniture à partir de 1 €/m²
--     (HPV ≈ 2), pose 15-40 en construction, et « 20 à 65 €/m² » pour un projet
--     complet.
--
-- 🔴 ON NE RETIENT DONC NI LE 50 NI LE 65. Notre catalogue facture DÉJÀ
--    séparément ce que ces chiffres embarquent :
--      · `depose_couverture_tuiles` — 20-30 €/m²
--      · `liteaunage_toiture` (liteaunage ET contre-liteaunage) — 15-50 €/m²
--    Monter l'écran à 50 reviendrait à compter TROIS FOIS la même main-d'œuvre
--    sur un devis qui détaille ces postes — et c'est précisément le cas du devis
--    qui a déclenché la question. C'est le défaut composite/unitaire documenté
--    le 11/09 (« on n'ajoute PAS d'entrée enduit chaux façade complet : elle
--    ferait paraître bon marché chaque couche facturée seule »), retourné.
--
-- FOURCHETTE RETENUE : 6 / 15 / 30 € HT/m², **l'écran SEUL, fourni + posé**.
--   · plancher 6 — écran d'entrée de gamme (PVC 0,6-1,5) posé sur toiture
--     ouverte ; cohérent avec les 4,70 €/m² de constructeurtravaux, arrondi au-
--     dessus. Inchangé.
--   · plafond 30 — la décomposition la plus explicite qu'on ait trouvée :
--     fourniture HPV 10 + pose seule 20 (guide-toiture). L'ancien plafond de 20
--     ne couvrait pas la pose seule haute, même avec un écran gratuit.
--   · moyenne 15 — HPV courant (7) posé au tarif médian (8-10).
--
-- MESURÉ AVANT APPLICATION (simuler-fourchette.mjs) : 7 analyses portent cette
-- entrée, le montant accusé passe de 31 651 € à 29 692 € (−1 959 €), **0 poste
-- ne devient accusé**, aucune analyse ne bascule sous le plancher d'affichage.
-- Sur le devis qui a motivé la question : 4 520 € → 3 880 €, soit encore ×3.
--
-- ⚠️ Entrée NON éditoriale (absente de `generate-reference.ts`) : `reference.json`
-- n'a pas à être régénéré. Vérifié.
-- ⚠️ Pas de re-seed d'embedding : seuls les PRIX changent, le libellé ne bouge pas.
-- ─────────────────────────────────────────────────────────────────────────────

update public.market_prices
set price_min_unit_ht = 6,
    price_avg_unit_ht = 15,
    price_max_unit_ht = 30,
    source = 'web 2026-09-17 — guide-toiture.com (fourniture HPV 7-10 €/m², pose seule hors fourniture 10-20 €/m² ; sa ligne « rénovation 15-50 » inclut dépose de couverture + contre-lattage) + constructeurtravaux.fr (écran seul sur toiture ouverte : exemple chiffré 4,70 €/m²) + prixdestravaux.com (fourniture dès 1 €/m², HPV ≈ 2)',
    notes = 'L''ÉCRAN SEUL, fourni + posé sur une toiture ouverte. ⚠️ NE COUVRE NI la dépose de la couverture (voir depose_couverture_tuiles, 20-30 €/m²), NI le liteaunage et contre-liteaunage (voir liteaunage_toiture, 15-50 €/m²), NI la repose des tuiles. ⚠️ NE PAS monter cette entrée vers les 40-65 €/m² que publient les guides : ces chiffres désignent une réfection complète et embarquent les trois postes ci-dessus — les additionner reviendrait à compter la même main-d''œuvre trois fois sur un devis détaillé. Plafond 30 = fourniture HPV haut de gamme (10) + pose seule haute (20).',
    last_reviewed_at = now()
where job_type = 'ecran_sous_toiture';

-- ═══════════════════════════════════════════════════════════════════════════
-- TÉMOIN — la correction doit avoir eu lieu, rester ordonnée, et surtout NE PAS
-- empiéter sur les postes voisins qu'elle ne doit pas recouvrir.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  n int;
  e_min numeric; e_max numeric;
  lit_max numeric; dep_max numeric;
begin
  select count(*) into n from public.market_prices
  where job_type = 'ecran_sous_toiture' and last_reviewed_at >= now() - interval '1 minute';
  if n <> 1 then
    raise exception 'TÉMOIN CASSÉ : % entrée(s) mise(s) à jour au lieu de 1', n;
  end if;

  select price_min_unit_ht, price_max_unit_ht into e_min, e_max
  from public.market_prices where job_type = 'ecran_sous_toiture';
  if not (e_min <= e_max) then
    raise exception 'TÉMOIN CASSÉ : fourchette désordonnée (% > %)', e_min, e_max;
  end if;

  -- 🔴 LE CONTRÔLE QUI COMPTE : l'écran ne doit pas coûter, à lui seul, plus
  -- cher que les ouvrages qui l'entourent. S'il les dépassait, c'est qu'on y
  -- aurait glissé leur main-d'œuvre — le défaut que cette migration existe pour
  -- éviter.
  select price_max_unit_ht into lit_max from public.market_prices where job_type = 'liteaunage_toiture';
  select price_max_unit_ht into dep_max from public.market_prices where job_type = 'depose_couverture_tuiles';
  if lit_max is null or dep_max is null then
    raise exception 'TÉMOIN CASSÉ : entrées voisines introuvables — la comparaison de périmètre est impossible';
  end if;
  if e_max > lit_max then
    raise exception 'TÉMOIN CASSÉ : l''écran seul (% €/m²) dépasse le liteaunage complet (%) — périmètre probablement contaminé', e_max, lit_max;
  end if;

  raise notice 'OK : écran % - % €/m² (l''écran SEUL), sous le liteaunage (max %) et cohérent avec la dépose (max %).',
    e_min, e_max, lit_max, dep_max;
end $$;
