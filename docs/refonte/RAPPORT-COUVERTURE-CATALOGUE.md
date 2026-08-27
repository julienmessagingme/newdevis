# Rapport couverture catalogue — mining du stock (2026-08-27)

**Contexte** : couverture marché médiane mesurée à **29 %** du montant des postes
(74 analyses vectorielles récentes, 81 % des analyses sous 60 %). Mining réalisé
sur **237 analyses françaises** (`raw_text.n8n_price_data`, lignes en confidence
`medium`/`low`/`no_match`), après exclusion de 2 devis camerounais non détectés
comme étrangers (bug corrigé par ailleurs). NB : `match_audit_log` n'existait
pas en prod (migration 20260609 marquée appliquée sans avoir tourné) — recréée
le 2026-08-27, la collecte reprend.

## Enseignement principal

La perte de couverture a DEUX causes, à traiter différemment :

1. **~60 % du manque = matching `medium` sur des prestations que le catalogue
   couvre déjà** — le libellé catalogue est trop éloigné du phrasé réel des
   devis (« Enduit ratissage mural » 87 occurrences / 63 250 € ! similarity
   0,70-0,85 → exclu du verdict). **Remède : lignes ALIAS** — nouvelles lignes
   `market_prices` avec le MÊME `job_type` et fourchettes, mais un libellé
   calqué sur le phrasé devis (chaque ligne a son embedding → le vrai phrasé
   matche en high).
2. **~40 % = vraies familles absentes** (placard sur mesure, PAC multi-split,
   tableau électrique, SS4 amiante…). **Remède : nouvelles entrées.**

## A. Lignes ALIAS proposées (job_type existant à vérifier, libellé nouveau)

| Libellé alias (phrasé devis réel) | job_type cible probable | Occurrences | € cumulés |
|---|---|---|---|
| Enduit de ratissage mural (préparation peinture) | enduit lissage/ratissage existant | 87× / 10 devis | 63 250 € |
| Ragréage (variantes : « réangréage », « ragréage sol ») | ragréage existant | 24× / 10 devis | 9 120 € |
| Ponçage murs et plafonds (préparation) | préparation peinture existante | 6× / 6 devis | 14 400 € |
| Prise de courant 2P+T (ajout/remplacement) | ajout_prise existant | 29× / 2 devis | 8 148 € |
| Travaux de préparation et 2 couches de peinture (mur/plafond) | peinture murale existante | 44× / 1 devis + 3× / 3 devis | 36 000 € |
| Grattage et traitement des fissures murs/plafonds | reprise fissures existante | 7× / 7 devis | 6 020 € |
| Fourniture et pose VMC (« Vms ») | vmc existante | 2× / 2 devis | 11 600 € |

## B. Nouvelles entrées proposées (fourchettes **À VALIDER PAR JULIEN**)

| job_type proposé | Libellé | Unité | Fourchette HT proposée | Source famille |
|---|---|---|---|---|
| coffrage_placo_ml | Coffrage / habillage placo (gaines, réseaux) | ml | 25 – 60 €/ml | 20× / 10 devis · 6 000 € |
| tirage_alimentation_point_eau | Tirage alimentation EF/EC + évacuation par point d'eau | u | 150 – 400 €/u | 17× / 7 devis · 7 405 € + 15 200 € |
| pose_porte_fournie_client | Pose de porte intérieure fournie par le client | u | 80 – 180 €/u | 7× / 7 devis · 6 496 € |
| placard_sur_mesure_ml | Placard / dressing sur mesure (fourni+posé) | ml | 400 – 900 €/ml | 2× · 8 600 € |
| porte_placard_coulissante | Portes de placard coulissantes (fourni+posé) | m² | 150 – 350 €/m² | 2× · 10 375 € |
| pac_air_air_multisplit_ui | PAC air/air multi-split, par unité intérieure (fourni+posé) | u | 900 – 1 800 €/u | 4× / 4 devis · 20 141 € |
| tableau_electrique_mono | Tableau électrique monophasé rénové (fourni+posé) | u | 700 – 1 600 €/u | 3× · 4 370 € |
| refection_electrique_complete_m2 | Réfection électrique complète logement (NF C 15-100) | m² | 80 – 140 €/m² | 1× · 5 378 € (récurrent en stock) |
| ouverture_mur_non_porteur | Ouverture de passage dans mur non porteur | forfait | 400 – 1 200 € | 2× · 5 000 € |
| poteau_beton_arme | Poteau béton armé (coffrage+ferraillage+coulage) | u | 300 – 700 €/u | 1× · 5 550 € |
| poutre_beton_arme_ml | Poutre béton armé coulée en place | ml | 150 – 350 €/ml | 1× · 5 500 € |
| fenetre_bois_renovation | Croisée bois 2 vantaux rénovation (fourni+posé) | u | 800 – 1 600 €/u | 1× · 10 855 € |
| curage_piece_complet | Curage / dépose complète d'une pièce (sol+murs+plafond) | m² | 30 – 70 €/m² | 2× · 7 920 € |
| ss4_mode_operatoire | Amiante SS4 — mode opératoire + phases administratives | forfait | 1 200 – 3 000 € | cas ZANNOU · 2 750 € |
| ss4_mesure_empoussierement | Amiante — mesure d'empoussièrement META | u | 350 – 600 €/u | cas ZANNOU · 1 600 € |
| ss4_evacuation_amiante_lie | Amiante lié — transport et élimination (petit volume) | forfait | 600 – 1 500 € | cas ZANNOU · 1 000 € |
| echafaudage_maison_forfait | Échafaudage façades maison (location+montage+démontage) | forfait | 800 – 2 500 € | famille ratio_aberrant récurrente |
| depose_cloture_ml | Dépose et évacuation de clôture | ml | 8 – 25 €/ml | famille ratio_aberrant récurrente (×4+) |

## C. Méthode d'application (pattern Phase 1.6)

1. Julien valide/ajuste les fourchettes ci-dessus (prix France métropole posés).
2. SQL d'insertion dans `market_prices` (mêmes colonnes que Phase 1.6, avec
   `generic_family` pour les groupes SS4) — je le génère dès validation.
3. `node scripts/seed_market_prices_embeddings.mjs` pour embedder les
   nouvelles lignes (~1 min, idempotent).
4. Re-mesure de la couverture à J+15 avec la même méthode (script
   `mine-coverage.mjs` conservable) + `match_audit_log` désormais actif.

**Gain attendu** : les 7 alias + 18 entrées couvrent ~200 k€ de lignes vues sur
237 analyses ; combinés, ils devraient remonter la couverture médiane de ~29 %
vers 55-65 % (l'alias « enduit/ratissage/ponçage/peinture-préparation » pèse à
lui seul un tiers du manque récurrent).

---

## ✅ APPLIQUÉ le 2026-08-27 (décision Johan — sans attente de validation préalable)

25 lignes insérées en prod et embeddées (script `scripts/catalogue-additions-20260827.mjs`,
idempotent) : 6 alias (job_type suffixé `_alias`, mêmes fourchettes que la cible,
`generic_family` = cible) + 19 nouvelles entrées (`confidence='medium'`,
`source` tracé, fourchettes désamiantage ancrées web travaux.com/desamianter.fr).
Catalogue : 891 → 916 lignes. **Julien peut ajuster les fourchettes a posteriori**
(filtre SQL : `source LIKE 'mining stock 2026-08-27%'`). Re-mesure de la
couverture à J+15 : `node scripts/mine-coverage.mjs`.
