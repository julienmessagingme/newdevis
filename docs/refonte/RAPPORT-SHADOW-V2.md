# Rapport shadow run extract_v2 — Phase 3.2

**Date** : 2026-08-14
**Volume** : 78 analyses shadow collectées
**Période** : 2026-06-30 → 2026-08-13

---

## Verdict bascule Phase 3.3

🔴 **PAS ENCORE** — critères :
- ✅ V2 success rate >= 95% (actuel : 96.2%)
- ❌ V2 durée médiane < 1.5× V1 (actuel : V1=11385ms · V2=17839ms)
- ❌ Divergences majeures < 10% (actuel : 11.5%)

→ Avant bascule, corriger les points marqués ❌ ci-dessus.
→ Si V2 plante souvent : voir section "Top erreurs V2"
→ Si V2 est lent : voir maxOutputTokens / prompt verbosité
→ Si divergences IBAN/SIRET/type : améliorer le prompt v2 sur ces champs

---

## Stats globales

| Indicateur | Valeur |
|---|---|
| Total analyses shadow | 78 |
| V2 success | 75 (96.2%) |
| V2 fail | 3 (3.8%) |
| V1 durée médiane | 11385 ms |
| V2 durée médiane | 17839 ms |
| Ratio V2/V1 durée | 1.57 |
| Résultats identiques (HT + travaux) | 37 (47.4%) |
| Divergences mineures (HT > 10€ OU travaux ≠) | 29 |
| Divergences majeures (IBAN/SIRET/type ≠) | 9 |
| Écart HT médian | 0 € |
| Δ nb travaux médian | 0.0 |

---

## Top erreurs V2 (3 échecs)

| Code erreur | Occurrences |
|---|---:|
| `AI_TIMEOUT` | 3 |

---

## Divergences majeures (9) — IBAN / SIRET / type_document différents

Ces cas méritent une revue ligne par ligne pour comprendre si V2 fait mieux ou moins bien que V1.

| created_at | file_name | analysis_id | summary | erreur V2 |
|---|---|---|---|---|
| 2026-08-13 12:15 | SAVE_20260812_121401 (2).jpg | 617509ff | +5 lignes · -5 lignes · SIRET ≠ · conf=non_comparable | — |
| 2026-08-11 16:38 | UF_Maison Bois le roi_clôture_10_4231a7_CVD0003486.pdf | fcd3ff0e | +6 lignes · -6 lignes · SIRET ≠ · conf=certifie | — |
| 2026-08-03 16:19 | Devis-SAS Florim-ATEX-D-2026-04115.pdf | d3cc843d | Δtravaux 10 · +18 lignes · -8 lignes · SIRET ≠ · conf=non_comparable | — |
| 2026-07-13 06:25 | devis 30678.pdf | 9ae20a2a | Δtravaux 1 · +3 lignes · -2 lignes · type hors_scope→autre · conf=certifie | — |
| 2026-06-30 15:22 | Devis Cloture.pdf | 4e5b8c15 | ΔTTC -14032808€ · ~17 lignes · IBAN ≠ · conf=indicatif | — |
| 2026-06-30 15:22 | devis_DEV00000457 (1).pdf | db39c947 | Δtravaux 1 · +1 lignes · IBAN ≠ · conf=non_comparable | — |
| 2026-06-30 15:21 | Mailliane V2.pdf | d54063ee | SIRET ≠ · conf=certifie | — |
| 2026-06-30 15:21 | IMG_20260612_150009.jpg | 0e4e3365 | +1 lignes · -1 lignes · IBAN ≠ · conf=non_comparable | — |
| 2026-06-30 15:21 | devis combiné.pdf | e5edc2a5 | Δtravaux 6 · +7 lignes · -1 lignes · ~1 lignes · IBAN ≠ · conf=indicatif | — |

---

## 20 dernières comparaisons (debug)

| created_at | file_name | V1 (ms) | V2 (ms) | V2 success | summary |
|---|---|---:|---:|---|---|
| 2026-08-13 12:15 | SAVE_20260812_121401 (2).jpg | 13446 | 12453 | ✅ | +5 lignes · -5 lignes · SIRET ≠ · conf=non_comparable |
| 2026-08-11 16:38 | UF_Maison Bois le roi_clôture_10_4231a7_CVD0003486.pdf | 18626 | 14265 | ✅ | +6 lignes · -6 lignes · SIRET ≠ · conf=certifie |
| 2026-08-11 16:15 | SF_INBOX_9889_f7f0d1_DM PAYSAGES Devis DEV-202607-037 21 07 2026 BENBERRADJI kamel.pdf | 10076 | 10303 | ✅ | conf=certifie |
| 2026-08-10 20:50 | devis_DEV00000295(1).pdf | 9215 | 15097 | ✅ | Δtravaux 1 · +6 lignes · -5 lignes · conf=indicatif |
| 2026-08-09 22:01 | Devis-1412.pdf | 18832 | 37383 | ✅ | Δtravaux 7 · +7 lignes · conf=non_comparable |
| 2026-08-06 20:12 | DevisD2026022Yan-Stephant.pdf | 8837 | 17680 | ✅ | +5 lignes · -5 lignes · conf=certifie |
| 2026-08-05 13:51 | Devis Vincent Grosbois - Projet V&P.pdf | 20458 | 38625 | ✅ | Δtravaux 1 · +2 lignes · -1 lignes · ~1 lignes · conf=certifie |
| 2026-08-03 16:19 | Devis-SAS Florim-ATEX-D-2026-04115.pdf | 8962 | 16982 | ✅ | Δtravaux 10 · +18 lignes · -8 lignes · SIRET ≠ · conf=non_comparable |
| 2026-08-01 20:46 | DevisD2026019Sentis-Remi.pdf | 10045 | 14709 | ✅ | +4 lignes · -4 lignes · conf=certifie |
| 2026-08-01 16:26 | devis-d202600056-hexa-bat.pdf | 11118 | 48805 | ✅ | Δtravaux 77 · +78 lignes · -1 lignes · conf=non_comparable |
| 2026-08-01 14:19 | Devis estimation des travaux .pdf | 6340 | 6766 | ✅ | conf=non_comparable |
| 2026-07-24 22:04 | DevisRenovation_ano.pdf | 49157 | 81674 | ❌ | v2_failed: AI_TIMEOUT: Extraction Gemini a dépassé le délai |
| 2026-07-24 13:26 | 2607 Devis Porcelanosa carrelage pour 51 m2 GIRAUD.pdf | 5738 | 6131 | ✅ | +1 lignes · -1 lignes · conf=certifie |
| 2026-07-20 08:01 | Devis VIE DE LUMIERE - SABAS n° 00935.pdf | 13752 | 19347 | ✅ | Δtravaux 1 · +5 lignes · -4 lignes · conf=non_comparable |
| 2026-07-19 12:11 | DV0003261.pdf | 12005 | 14816 | ✅ | Δtravaux 1 · +3 lignes · -2 lignes · ~4 lignes · conf=non_comparable |
| 2026-07-17 16:12 | devis-pages.pdf | 9045 | 11584 | ✅ | Δtravaux -1 · +6 lignes · -7 lignes · conf=indicatif |
| 2026-07-17 16:03 | devis-pages.pdf | 9997 | 12939 | ✅ | Δtravaux -1 · +6 lignes · -7 lignes · conf=indicatif |
| 2026-07-15 16:35 | Devis DE00001262.pdf | 8369 | 12887 | ✅ | Δtravaux 2 · +2 lignes · conf=indicatif |
| 2026-07-14 11:37 | b8f6f03c2b697b3c8bea4c0160c25871fedcca10daf786839be5c268d17a.pdf | 12173 | 19719 | ✅ | Δtravaux 1 · +7 lignes · -6 lignes · conf=indicatif |
| 2026-07-13 06:25 | devis 30678.pdf | 9168 | 15400 | ✅ | Δtravaux 1 · +3 lignes · -2 lignes · type hors_scope→autre · conf=certifie |
