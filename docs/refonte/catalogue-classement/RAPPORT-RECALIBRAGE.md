# Rapport recalibrage fourchettes — Phase 1.7

**Date** : 2026-07-03
**Source** : `scripts/phase1-7-recalibrage-fourchettes.ts`
**Méthode** : confrontation catalogue (891 entrées) vs prix unitaires observés dans 349 analyses passées.

⚠️ **Risque de validation circulaire** (PDF point de vigilance) : ces propositions sont basées sur nos propres observations. Si l'extraction est mal lue sur certains postes, on validerait une erreur par elle-même. **Julien valide manuellement chaque proposition rouge**. Pour les postes sensibles, croiser avec prix externes (Batiprix, Capeb, etc.).

---

## Synthèse

| Statut | Nb | Action |
|---|---:|---|
| 🔴 Divergence majeure (écart médiane > 30%) | 9 | UPDATE fourchette (validation Julien requise) |
| 🟠 Couverture insuffisante (Q1-Q3 hors fourchette) | 1 | Élargir la fourchette (souple) |
| 🟢 Catalogue cohérent | 9 | Aucune action |
| Entrées sans observations | 812 | Hors scope (pas de données pour comparer) |
| Entrées avec < 3 obs | 60 | Insuffisant statistiquement, on garde tel quel |

---

## 1. Divergences MAJEURES (9) — validation Julien requise

| id | métier | job_type | label | obs (count) | médiane obs | catalogue [min, avg, max] | écart | proposition |
|---|---|---|---|---:|---:|---|---:|---|
| 17 | `carrelage_faience` | `carrelage_sol_pose` | Pose carrelage sol (hors fourniture) | 12 | 80.00 | [35, 55, 90] | 45% | Catalogue SOUS-ÉVALUÉ : médiane observée 80.00 ≠ médiane catalogue 55.00 (écart 45%). Suggérer fourchette [35.00, 125.88] |
| 41 | `demolition_depose` | `demolition_cloison` | Démolition cloison | 10 | 80.00 | [15, 30, 60] | 167% | Catalogue SOUS-ÉVALUÉ : médiane observée 80.00 ≠ médiane catalogue 30.00 (écart 167%). Suggérer fourchette [76.00, 1197.00] |
| 143 | `peinture_revetements` | `peinture_plafond` | Peinture plafond | 7 | 10.00 | [22, 40, 75] | -75% | Catalogue SUR-ÉVALUÉ : médiane observée 10.00 ≠ médiane catalogue 40.00 (écart -75%). Suggérer fourchette [10.00, 28.32] |
| 141 | `peinture_revetements` | `peinture_murs` | Peinture murs | 5 | 7.00 | [18, 35, 65] | -80% | Catalogue SUR-ÉVALUÉ : médiane observée 7.00 ≠ médiane catalogue 35.00 (écart -80%). Suggérer fourchette [7.00, 7.00] |
| 144 | `peinture_revetements` | `peinture_porte` | Peinture porte | 5 | 163.88 | [60, 120, 220] | 37% | Catalogue SOUS-ÉVALUÉ : médiane observée 163.88 ≠ médiane catalogue 120.00 (écart 37%). Suggérer fourchette [76.00, 8350.00] |
| 793 | `placo_isolation` | `isolation_iti_laine_de_verre` | ITI laine de verre sur ossature (fourni+posé) | 4 | 28.00 | [35, 55, 85] | -49% | Catalogue SUR-ÉVALUÉ : médiane observée 28.00 ≠ médiane catalogue 55.00 (écart -49%). Suggérer fourchette [25.20, 29.40] |
| 138 | `peinture_revetements` | `peinture_boiseries` | Peinture boiseries (plinthes, encadrements) | 4 | 3.00 | [6, 12, 25] | -75% | Catalogue SUR-ÉVALUÉ : médiane observée 3.00 ≠ médiane catalogue 12.00 (écart -75%). Suggérer fourchette [3.00, 3.00] |
| 725 | `carrelage_faience` | `carrelage_sdb_etancheite` | Pose carrelage salle de bains avec étanchéité | 3 | 5300.00 | [55, 95, 170] | 5479% | Catalogue SOUS-ÉVALUÉ : médiane observée 5300.00 ≠ médiane catalogue 95.00 (écart 5479%). Suggérer fourchette [1103.20, 5300.00] |
| 771 | `peinture_revetements` | `peinture_sdb_humide` | Peinture SDB pièces humides | 3 | 80.00 | [12, 20, 32] | 300% | Catalogue SOUS-ÉVALUÉ : médiane observée 80.00 ≠ médiane catalogue 20.00 (écart 300%). Suggérer fourchette [80.00, 136.00] |

## 2. Couverture insuffisante (1) — élargir fourchette

| id | métier | job_type | label | obs | Q1-Q3 obs | catalogue | proposition |
|---|---|---|---|---:|---|---|---|
| 746 | `toiture_couverture` | `ecran_sous_toiture` | Écran de sous-toiture HPV (fourni+posé) | 3 | [10.20, 30.75] | [6, 16] | Fourchette catalogue [6.00, 16.00] ne couvre pas la zone Q1-Q3 observée [10.20, 30.75]. Élargir vers [9.42, 42.30] |

## 3. Catalogue cohérent (9)

9 entrées sont en zone verte (médiane observée dans la fourchette catalogue, écart < 30%). Pas d'action nécessaire.

## 4. Entrées catalogue jamais matchées (812)

812 entrées catalogue n'ont jamais été matchées dans les analyses passées. Cela peut signifier :
- elles couvrent des cas rares (ex: ouvrages_geothermie, ouvrages_ascenseur)
- OU le matcher V3.5 ne les trouve jamais (problème d'empreintes ou de couverture sémantique)
- OU notre échantillon de devis ne couvre pas ces métiers

Pas d'action automatique. Si Julien identifie des cas où le matcher devrait les trouver et ne les trouve pas → Phase 1.6 (régénération embeddings) ou enrichissement libellés.

---

## Workflow recommandé Julien

1. **Relire les 9 divergences rouges en priorité** (top de la table section 1)
2. **Pour chaque proposition acceptée**, écrire dans un nouveau fichier `phase1-7-recalibrage.sql` :
```sql
UPDATE public.market_prices SET
  price_min_unit_ht = <nouveau_min>,
  price_avg_unit_ht = <nouvelle_med>,
  price_max_unit_ht = <nouveau_max>
WHERE id = <id>;
```
3. **Pour les rouges refusées** (validation circulaire suspectée) → marquer dans notes_julien.md pour mémoire
4. **Les oranges** peuvent attendre — élargissement souple, faisable en lot plus tard
5. **Après application du SQL** → relancer Phase 1.6 (régénération embeddings) si les libellés ont aussi changé