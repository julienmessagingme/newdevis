# Inventaire des rustines + code mort — refonte en cours

**Statut** : 🟢 V2 — mise à jour 2026-06-24 après Phase 3.1 (extract_v2.ts écrit)

**But** : pour chaque rustine V3.4.x / V3.5.x empilée dans le code, donner :
1. L'emplacement (`fichier:ligne`)
2. La version qui l'a introduite + le cas qui l'a fait naître
3. Sa **classification cible** :

| Classification | Description | Action attendue |
|---|---|---|
| 🟢 **KEEP-GUARD-CRITIQUE** | Garde-fou métier essentiel qui survivra à la refonte (radiation entreprise, clauses litigieuses, IBAN suspect, cash, hard block, etc.) | Garder telle quelle |
| 🟡 **RUSTINE-PHASE-3** | Patch qui panse un bug d'extraction. La refonte Phase 3 (lecture juste + arithmétique) couvrira le cas → retrait après livraison Phase 3 + validation par le filet de tests |
| 🟠 **RUSTINE-PHASE-4** | Patch qui panse un bug de verdict. La refonte Phase 4 (prix unitaire + confiance) couvrira → retrait après Phase 4 |
| 🔴 **MORT** | Code zombie (flag désactivé, mode abandonné, fallback inopérant). Retirable. À retirer en Phase 1 pour ne pas embarquer dans la refonte |

---

## Statut au 2026-06-24 — extract_v2.ts écrit (Phase 3.1 livrée)

Le nouveau pipeline `supabase/functions/analyze-quote/extract_v2.ts` est écrit (code mort tant que pas appelé). Il **conserve 6 rustines métier et retire 4 rustines extraction**. Voici le mapping précis :

### 🟢 Conservées dans extract_v2.ts (rustines métier — survivent à la refonte)

| ID | Description | Présent dans extract_v2 |
|---|---|---|
| R1 | `detectIncompleteQuote` — devis résumé par lot | ✅ Fonction `detectIncompleteV2` (lignes 264+) |
| R2 | `PHYSICAL_UNIT_NAMES` étendu (u, pce, piece, etc.) | ✅ Constante (lignes 57-75) |
| R4 | `detectQuoteCountry` — devis étranger | ✅ Importé depuis `country.ts` |
| R7 | Whitelist enum `estimation_courtier` | ✅ Fonction `validateTypeDocumentV2` (lignes 322+) |
| R8 | Whitelist enum `hors_scope_categorie` | ✅ Fonction `validateHorsScopeCategorieV2` (lignes 334+) |
| R10 | Validation `clauses_litigieuses` | ✅ Fonction `validateClausesV2` (lignes 295+) |

### 🟡 Retirées dans extract_v2.ts (rustines extraction — couvertes par le nouveau format JSON)

| ID | Description | Pourquoi extract_v2 n'en a plus besoin |
|---|---|---|
| R3 | `sanitizeEntrepriseNom` (rejet fragments légaux) | La cartographie distingue le bloc en-tête entreprise → Gemini ne confond plus avec le corps du devis |
| R5 | `RECAP_PATTERNS` (filtre lignes "Total HT/TVA/TTC") | Section B impose `type ∈ {ligne_travaux, sous_total, total, titre_section}` → exclu nativement |
| R6 | Filtre titres section (Σ enfants ≈ parent) | Section B impose `type="titre_section"` natif via la cartographie hiérarchique N / N.M |
| R9 | Swap HT/TTC inversé | Le prompt v2 demande explicitement HT/TVA/TTC + la réconciliation arithmétique post-extraction détecte l'incohérence |

**Effet attendu à Phase 3.4 (cleanup)** : `extract.ts` v1 et ces 4 rustines disparaissent (~120 lignes de code en moins). Bump `ENGINE_VERSION` → `"2.0.0-refonte"`.

---

## Légende statut

- 🟢 garde-fou métier
- 🟡 rustine extraction (retirée par extract_v2)
- 🟠 rustine verdict (retirée par Phase 4)
- 🔴 code mort

---

## extract.ts — pipeline d'extraction PDF → JSON

### 🔴 MORT — Prompts legacy + variantes V3.4.x

| Item | Emplacement | Statut | Note |
|---|---|---|---|
| Prompt `marketPriceExpertPrompt` legacy V3.5 | `domain-config.ts` | 🟡 à vérifier | À retirer SI plus appelé après bascule vectoriel 2026-05-22 |

### 🟡 RUSTINE-PHASE-3 — Filtres anti-bug Gemini

Liste des ~250 lignes de rustines empilées dans `extract.ts` qui couvrent des bugs spécifiques d'extraction Gemini.

| Item | Version | Emplacement | Statut | Sera couvert par |
|---|---|---|---|---|
| V3.4.8 — swap HT/TTC si HT > TTC × 1.10 | V3.4.8 | `extract.ts` | 🟡 RUSTINE-PHASE-3 | Réconciliation arithmétique côté code (devis = somme − remise vérifié) |
| V3.4.8 — sanitization nom entreprise (12 patterns blabla légal) | V3.4.8 | `extract.ts:sanitizeEntrepriseNom` | 🟡 RUSTINE-PHASE-3 | Structure-d'abord cartographie la grille → extraction nom entreprise plus robuste |
| V3.4.11 — filtre lignes récap "Montant Total HT/TVA/TTC" (8 regex) | V3.4.11 | `extract.ts` RECAP_PATTERNS | 🟡 RUSTINE-PHASE-3 | Cartographie de la grille distingue lignes travaux vs lignes totaux |
| V3.5.10 — filtre lignes titre de section (parent ≈ Σ enfants) | V3.5.10 | `extract.ts` (post-RECAP) | 🟡 RUSTINE-PHASE-3 | Cartographie de la hiérarchie devis (sous-totaux = somme des lignes filles natif) |
| V3.4.21 — whitelist `typeDocument` enum | V3.4.21 | `extract.ts` validation | 🟢 KEEP-GUARD-CRITIQUE | Survit (validation type ∈ whitelist sécurise les bypasses) |
| V3.4.14 — détection devis étranger (4 signaux IBAN/TVA/adresse/taux) | V3.4.14 | `country.ts` + `extract.ts` | 🟢 KEEP-GUARD-CRITIQUE | Survit (logique métier, pas une rustine) |
| V3.5.17 (2026-06-23) — normalisation IBAN tirets/em-dash/points | 2026-06-23 | `verify.ts:466` | 🟡 RUSTINE-PHASE-3 | Réabsorbé par robustesse extraction Phase 3 |
| V3.5.17 (2026-06-23) — prompt Gemini IBAN avec tirets | 2026-06-23 | `extract.ts:343` | 🟡 RUSTINE-PHASE-3 | Réabsorbé par robustesse extraction Phase 3 |

### 🟢 KEEP-GUARD-CRITIQUE — Détection devis étranger + courtier + hors-scope

| Item | Version | Emplacement | Statut |
|---|---|---|---|
| Détection `estimation_courtier` (V3.4.20) | V3.4.20 | `extract.ts` | 🟢 garde métier |
| Détection `hors_scope` BTP (V3.4.28) | V3.4.28 | `extract.ts` | 🟢 garde métier |
| Extraction `clauses_litigieuses[]` (V3.4.17) | V3.4.17 | `extract.ts` + `BlockClausesLitigieuses.tsx` | 🟢 garde métier |
| Détection `is_incomplete_quote` (V3.5.1) | V3.5.1 | `extract.ts` | 🟢 garde métier |

---

## conclusion.ts — verdict expert

### 🟢 KEEP-GUARD-CRITIQUE — Bypass précoces + hard blocks

| Item | Version | Emplacement | Statut |
|---|---|---|---|
| Bypass `is_foreign_quote` (V3.4.14) | V3.4.14 | `conclusion.ts` | 🟢 garde métier |
| Bypass `estimation_courtier` (V3.4.20) | V3.4.20 | `conclusion.ts` | 🟢 garde métier |
| Bypass `hors_scope_categorie` (V3.4.28) | V3.4.28 | `conclusion.ts` | 🟢 garde métier |
| Bypass `is_incomplete_quote` (V3.5.1) | V3.5.1 | `conclusion.ts` | 🟢 garde métier |
| Garde "critère rouge > bypass" (V3.5.6) | V3.5.6 | `conclusion.ts` | 🟢 garde métier |
| Garde fail-safe entreprise radiée (V3.5.2) | V3.5.2 | `conclusion.ts` + `AnalysisResult.tsx:effectiveScore` | 🟢 garde métier |
| 5 wordings contextuels hard block (V3.5.8) | V3.5.8 | `conclusion.ts:1419` | 🟢 garde métier |
| Acompte cumulé = étapes pré-prestation (V3.5.9) | V3.5.9 | `score.ts` PRE_PRESTATION_ETAPES | 🟢 garde métier |
| Helper `persistConclusion` + email Resend Piste C (V3.5.16) | V3.5.16 | `conclusion.ts:persistConclusion` + migration `20260615_001` | 🟢 garde métier |

### 🟠 RUSTINE-PHASE-4 — Filtres / gardes vectoriel

| Item | Version | Emplacement | Statut | Sera couvert par |
|---|---|---|---|---|
| Filtre confidence avant verdict expert (V3.5.13) | V3.5.13 | `conclusion.ts` + `index.ts:744` | 🟠 RUSTINE-PHASE-4 | Décision "prix unitaire d'abord" + gradation confiance (Phase 4) rend ce filtre natif |
| 3 gardes sémantiques matcher vectoriel (V3.5.9) | V3.5.9 | `market-matcher-vectorial.ts` (hasLexicalOverlap, isSupplyVsLaborMismatch, isImplausiblyHighRatio) | 🟠 RUSTINE-PHASE-4 | Comparaison à base identique (nature_prix) rend ces gardes structurelles |
| Classification `low_confidence_match` (V3.5.11) | V3.5.11 | `quoteGlobalAnalysis.ts:classifyRowEnriched` | 🟠 RUSTINE-PHASE-4 | Gradation confiance native (Phase 4) |
| Garde plausibilité underprice -20% (V3.4.7) | V3.4.7 | `verdictEngine.ts:~825` | 🟠 RUSTINE-PHASE-4 | Couvert par "comparaison indicative" Phase 4 |
| Garde plausibilité upside +50% (V3.4.13) | V3.4.13 | `verdictEngine.ts:~862` | 🟠 RUSTINE-PHASE-4 | Couvert par "comparaison indicative" Phase 4 |
| 21 patterns prestations intellectuelles bloqués (V3.4.9) | V3.4.9 | `verdictEngine.ts:isNonWorkSignature` | 🟢 KEEP-GUARD-CRITIQUE | Couvre MOE/architecte/diagnostic → reste métier |
| Filtre groupes hallucinés `devis_total > 0` (V3.4.10) | V3.4.10 | `useMarketPriceAPI.ts:processJobTypes` | 🟡 RUSTINE-PHASE-3 | Réabsorbé par réconciliation arithmétique |
| Filtre lignes récap front (V3.4.12) | V3.4.12 | `useMarketPriceAPI.ts:processJobTypes` | 🟡 RUSTINE-PHASE-3 | Réabsorbé par cartographie hiérarchique |

### 🔴 MORT — verdict legacy

| Item | Version | Emplacement | Statut | Note |
|---|---|---|---|---|
| Mapping `verdict_global` 2 jeux distincts (mono vs multi) | V3.5 | 3 endroits (admin/devis, AnalysisResult, migration SQL) | 🟠 RUSTINE-PHASE-4 | Phase 4 doit unifier → "une seule source d'affichage" |
| `effectiveScore` recompute legacy fallback | V3.3 | `AnalysisResult.tsx` | 🟠 RUSTINE-PHASE-4 | Phase 4 rend l'effective score natif |

---

## market-matcher-vectorial.ts — matching catalogue

### 🔴 MORT — Feature flags V3.6 + shadow vectoriel

| Item | Version | Emplacement | Statut |
|---|---|---|---|
| Flag `MARKET_MATCHER_V36` (modes v35_only / shadow / v36_only) | V3.6 (mai 2026, abandonné) | `market-prices.ts:17-55` | 🔴 MORT — V3.6 abandonné après bascule vectoriel 2026-05-22 |
| Flag `MARKET_MATCHER_VECTORIAL=shadow` | V3.5.0 shadow | `market-prices.ts:161+` | 🔴 MORT — Shadow rollout terminé 2026-05-22, plus jamais utilisé |
| Prompt `marketPriceExpertPrompt` legacy (Gemini choisit job_type) | V3.5 | `domain-config.ts` | 🔴 MORT (à vérifier) |
| `marketSignatureExpertPrompt` V3.6 | V3.6 | `domain-config.ts` | 🔴 MORT (V3.6 désactivé) |
| RPC `search_market_prices_v2` | V3.5.0 | `20260521_002_market_prices_vectorization.sql` | 🟢 KEEP (utilisé par vectoriel) |

**Action Phase 1** : retirer ces 4 items pendant la phase catalogue (atomique avec le travail sur `market_prices`).

### 🟢 KEEP-GUARD-CRITIQUE — gardes matcher

| Item | Version | Emplacement | Statut |
|---|---|---|---|
| Audit log `match_audit_log` (V3.5.11) | V3.5.11 | `market-matcher-vectorial.ts:logMatchAudit` | 🟢 garde métier — dataset gold pour calibration |
| Filtre devis_total > 8× theoreticalMaxHT (V3.4.24) | V3.4.24 | `conclusion.ts` | 🟠 RUSTINE-PHASE-4 — réabsorbé par confidence native |
| Filtre devisTotalHT < theoreticalMinHT × 0.10 (V3.4.28) | V3.4.28 | `conclusion.ts` | 🟠 RUSTINE-PHASE-4 |

---

## verdictEngine.ts — moteur de décision

### 🟢 KEEP-GUARD-CRITIQUE — Hard blocks + escalades

| Item | Version | Statut |
|---|---|---|
| Hard block company_status (V3.3) | V3.3 | 🟢 priorité 0 — entreprise radiée force REFUSER |
| Escalade matérielle anomalies × surcout (V3.2.1) | V3.2.1 | 🟢 |
| Garde de cohérence finale `isMaterialServerSurcout` (V3.3) | V3.3 | 🟢 |
| Sanitization LLM 3 niveaux (V3.3) | V3.3 | 🟢 |
| Wording amplitude-aware (V3.4.7) | V3.4.7 | 🟠 RUSTINE-PHASE-4 — couvert par gradation confiance |
| 3 défenses anti-"Vérifiez Infogreffe" (V3.4.26 + V3.4.27) | V3.4.26 | 🟢 KEEP |

---

## UI / front-end

### 🟢 KEEP-GUARD-CRITIQUE — Sources de vérité front

| Item | Version | Statut |
|---|---|---|
| `effectiveScore` lit `verdict_global` en priorité (V3.3) | V3.3 | 🟢 source de vérité pastille |
| 6 règles inviolables cohérence UI (V3.3.1) | V3.3.1 | 🟢 |
| Bannière bleue Piste C "Validation expert en cours" (V3.5.16) | V3.5.16 | 🟢 |

### 🟠 RUSTINE-PHASE-4

| Item | Version | Statut |
|---|---|---|
| `VectorialPriceList.tsx` cards "Comparaison incertaine" | V3.5.14 | 🟠 — refonte UI alignée Phase 4 |
| `BlockPrixMarche` mapping confidence | V3.5.x | 🟠 — refonte Phase 4 |

---

## Récap chiffré

| Catégorie | Nombre estimé d'items | Action |
|---|---|---|
| 🟢 KEEP-GUARD-CRITIQUE | ~20 | Garder telles quelles, documenter dans CLAUDE.md « Invariants ACTIFS » |
| 🟡 RUSTINE-PHASE-3 (extraction) | ~10-15 | Retrait en bloc après Phase 3 livrée + cas tests passent |
| 🟠 RUSTINE-PHASE-4 (verdict) | ~10-12 | Retrait en bloc après Phase 4 livrée + cas tests passent |
| 🔴 MORT | ~5 | Retrait en Phase 1 (atomique avec travail catalogue) |

**Total des items recensés : ~50**.

Sur 6 versions V3.4.x + 17 versions V3.5.x, c'est cohérent avec ce que le PDF de refonte annonce (« ~250 lignes de rustines empilées »).

---

## Note méthode

Ce fichier sera mis à jour à chaque livraison de phase :
- Phase 1 → marquer 🔴 MORT en ✅ retiré
- Phase 3 → marquer 🟡 RUSTINE-PHASE-3 en ✅ retiré + cas test couvre
- Phase 4 → marquer 🟠 RUSTINE-PHASE-4 en ✅ retiré + cas test couvre

À la fin de la refonte, seul subsiste 🟢 KEEP-GUARD-CRITIQUE.
