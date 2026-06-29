# Refonte de l'outil d'analyse de prix — Plan de route

**Statut** : 🟢 Phases 0+1+2 livrées · Phase 3 = prochain gros chantier
**Démarrage** : 2026-06-23
**Source** : `refonte outil scoring VMD.pdf` (16 juin 2026), validation Julien 2026-06-23
**Dernière mise à jour** : 2026-06-23 fin de journée

---

## État actuel des 4 maillons

| # | Maillon | Avant refonte | Au 2026-06-29 fin de journée |
|---|---|---|---|
| 1 | **Lire juste** | 🔴 à construire | 🟡 **code prêt** (Phase 3.0+3.1+3.2 livrées) — attente activation prod (3 commandes : db push + secret EXTRACT_V2_ENABLED=shadow + functions deploy) |
| 2 | **Comparer à vraie référence** | 🟡 partiel (57% sans métier) | 🟢 **fait** — 891 entrées rangées par metier × nature_prix × gamme + 33 métiers + 0 doublon |
| 3 | **Verdict honnête** | 🟡 partiel | 🟡 **spec consolidée** (BUGS-A-CORRIGER §"Spec Maillon 3") — code Phase 4 démarre APRÈS bascule extract_v2 |
| 4 | **Apprendre** | 🟡 moitié (socle vide) | 🟢 **fait + assisté IA** — `/admin/reviews` + table `analysis_corrections` + email Resend post-revue (`contact@verifiermondevis.fr`) + script Phase B `ai-prepare-reviews.ts` (pré-revue Claude Sonnet 4.6) |

**Principe de la chaîne** : chaque maillon doit être solide et honnête sur sa propre confiance. Pas de patch correctif — chaque maillon est solide ou il dit "non comparable".

---

## Principes inviolables

1. **Honnêteté avant exhaustivité** — mieux vaut dire "comparaison indicative" que d'inventer une anomalie. Un faux "refuser" peut coûter un contrat à l'utilisateur.
2. **Comparer à base identique** — un prix "pose seule" ne se compare pas à un "fourniture+pose". Base inconnue → plafonné à "indicatif".
3. **Comparer le coût complet, pas la ligne isolée** — les frais annexes (préparation, ragréage, dépose) sont rattachés à l'ouvrage qu'ils servent, jamais comparés seuls.
4. **L'humain valide, la machine n'invente pas** — seules les corrections humaines fiables modifient la référence et les exemples.
5. **Zéro régression** — chaque évolution passe le filet des cas validés avant la prod. Activation par drapeau, repli immédiat.
6. **Coût ≈ 0** — pas d'usine à gaz, pas de modèle maison. La valeur vient de la rigueur de la chaîne, pas de la puissance brute.

---

## Ce qui s'ARRÊTE immédiatement

- ❌ **Plus de bumps `ENGINE_VERSION`** pour patcher un cas user signalé
- ❌ **Plus de "Garde n°X" inline** qui s'empile dans extract.ts / verdictEngine.ts / market-matcher / score.ts
- ❌ **Plus de fix réactifs ad hoc** — chaque bug signalé est noté dans `BUGS-A-CORRIGER.md` et devient un **cas test** du filet anti-régression
- ❌ **Plus de feature flags zombies** — code mort retiré

---

## Décisions actées (2026-06-23)

| ID | Décision | Justification |
|---|---|---|
| **A** | `ENGINE_VERSION` repart à `1.0.0-refonte` | Clarté visuelle, marque la nouvelle ère, casse le lien avec la série V3.4.x/V3.5.x |
| **B** | Quick fix Piste C élargie (ratio aberrant > 5× marché_max → `pending_review`) | Protège la prod pendant la refonte. Esprit "honnêteté avant exhaustivité" |
| **C** | YAML peinture/carrelage → input de Phase 1 (grille classement catalogue) | C'est la grille métier+nature dont la Phase 1 a besoin, pas un système parallèle |

---

## Ordre d'exécution

### ✅ Phase 0 — Nettoyage + cartographie (LIVRÉE 2026-06-23)

- [x] **0.1** Étendre Piste C aux ratios aberrants (>5× marché_max) — `detectReviewTriggers` étendu, protège la prod
- [ ] **0.2** Flag manuel de l'analyse ALES 8950€ en `pending_review` — peut maintenant se faire via `/admin/reviews` (Phase 2)
- [x] **0.3** `docs/refonte/BUGS-A-CORRIGER.md` créé (3 bugs notés : ALES WC, IBAN CIC tirets, placo 25€/m²)
- [x] **0.4** `docs/refonte/RUSTINES.md` créé (50 patches V3.4.x/V3.5.x classifiés KEEP / PHASE-3 / PHASE-4 / MORT)
- [x] **0.5** Code mort marqué `🔴 CLEANUP-PHASE-1` (`MARKET_MATCHER_V36`, `MARKET_MATCHER_VECTORIAL=shadow`)
- [x] **0.6** `ENGINE_VERSION` reset à `"1.0.0-refonte"`
- [x] **0.7** YAML peinture/carrelage pivotés en `docs/refonte/catalogue-classement/`
- [x] **0.8** `PLAN.md` créé
- [x] **0.9** `CLAUDE.md` mis à jour (section REFONTE EN COURS en tête)
- [x] **0.10** Commit + push main (`62d3572`)

### ✅ Phase 1 — Catalogue d'aplomb (LIVRÉE 2026-06-23)

**Résultat** : 891 entrées (911 initiales − 21 nettoyées + 1 créée) rangées par métier × nature_prix × multiplicateur_couches × gamme. **33 métiers distincts**, 4 natures de prix, 100% couverture, 0 doublon, 0 inclassable.

- [x] **1.3** Script `scripts/phase1-audit-catalogue.ts` v4 (auto-classifie 891 entrées par parsing label + heuristique nature_prix par défaut)
- [x] **1.4a** Fix doublons : 39 doublons réglés via `phase1-fix-doublons.sql` (16 forfaits par taille supprimés + 10 labels expliciter + 5 fusions + F2 + G1)
- [x] **1.4b** Relecture 152 conflits : 18 corrections Claude + 6 arbitrages Julien + 128 validés en bloc
- [x] **1.5** Migration `phase1-migration-colonnes.sql` appliquée (ALTER TABLE + 891 UPDATE + indexes + CHECK constraints)
- [x] **1.6** Régénération embeddings (891/891 en 344 s, 2026-06-24) — `seed_market_prices_embeddings.mjs --force`. Le matcher vectoriel prod cherche maintenant sur les libellés à jour.
- [x] **1.7** Recalibrage fourchettes : **outillage livré** — `scripts/phase1-7-recalibrage-fourchettes.ts` produit `RAPPORT-RECALIBRAGE.md`. **Reste à Julien** : lancer + relire les flags rouges + écrire SQL d'ajustement (1-2h, optionnel court terme)
- [x] **1.8** Audit unités incohérentes : **outillage livré** — `scripts/phase1-8-audit-unites.ts` produit `RAPPORT-UNITES.md`. **Reste à Julien** : lancer + appliquer les normalisations SQL (~30 min)

### ✅ Phase 2 — Écran de revue (LIVRÉE 2026-06-23)

**Résultat** : page `/admin/reviews` opérationnelle, table `analysis_corrections` prête à recevoir, mécanisme back Piste C V3.5.16 enfin pleinement exploitable.

- [x] **2.1** Migration `20260624_001_phase2_analysis_corrections.sql` appliquée (table + vue `admin_pending_reviews` + RLS 3 policies)
- [x] **2.2** 3 routes API admin (`/api/admin/reviews` GET list, `/api/admin/reviews/[id]` GET detail, `/api/admin/reviews/[id]/decide` POST action)
- [x] **2.3** Page `/admin/reviews` (layout 2 colonnes : liste pending_review à gauche, détail + formulaire correction inline à droite, 3 boutons Valider/Corriger/Rejeter)

**Grain de revue** (validé PDF) : verdict global d'abord, descente ligne par ligne reportée à Phase 2.4 (édition anomalies détaillées) — à faire seulement si on constate qu'on en a besoin en pratique.

### 🟡 Phase 3 — Lecture juste (Maillon 1) — le gros chantier

Objectif : ne plus confondre quantité / unité / prix unitaire, extraire le prix unitaire, vérifier l'arithmétique du devis sur lui-même.

**Sous-phases livrées au 2026-06-24 (code mort, prêt à brancher)** :

- [x] **3.0** Architecture complète dans [`PHASE3-ARCHITECTURE.md`](PHASE3-ARCHITECTURE.md) (520 lignes) : diagnostic extract.ts actuel (924 lignes dont ~250 de rustines), cible structure-d'abord, mapping des 10 rustines (6 KEEP, 4 RETIRABLES), esquisse prompt v2, stratégie shadow → bascule contrôlée → cleanup
- [x] **3.0bis** Module de réconciliation arithmétique TS pur livré + testé Vitest 23/23 : `src/lib/analyse/extract/reconciliation.ts` + copie Deno dans `supabase/functions/analyze-quote/reconciliation.ts`
- [x] **3.0ter** Banc de tests spec dans [`BANC-DE-TESTS.md`](BANC-DE-TESTS.md) (15 cas canoniques, dont ALES 8950€ et Créteil résumé par lot)
- [x] **3.1** `supabase/functions/analyze-quote/extract_v2.ts` écrit (973 lignes) : nouveau pipeline complet. Prompt v2 en 2 sections (Cartographie + Lignes structurées). 6 rustines métier conservées, 4 rustines extraction retirées. Output `ExtractedDataV2` étend `ExtractedData` v1 (rétrocompat). **Code mort, pas appelé, zero risque prod.**

**Sous-phases restantes** :

- [ ] **3.2** Brancher feature flag `EXTRACT_V2_ENABLED` (off/shadow/on) + migration SQL `extract_comparisons` (snapshot V1 vs V2 par analyse). En mode shadow : appeler V2 via `EdgeRuntime.waitUntil` + logger comparaison. (1-2h)
- [ ] **3.3** Bascule contrôlée après ~100 analyses shadow validées (1 semaine monitoring rapproché via `/admin/reviews`)
- [ ] **3.4** Cleanup `extract.ts` v1 + retrait des 4 rustines extraction (R3 sanitize, R5 RECAP_PATTERNS, R6 titres section, R9 swap HT/TTC) + bump `ENGINE_VERSION` → `"2.0.0-refonte"`

**Risques connus** (mitigation dans `PHASE3-ARCHITECTURE.md` §8) :
- **Budget temps ~150 s** : un seul appel à sortie structurée (cartographie fait partie du JSON)
- **Troncature JSON** : maxOutputTokens=32768, monitoring en shadow
- **Ne pas casser ce qui marche** : retrait des 4 rustines uniquement après que le banc de tests les couvre
- **Cas particuliers** : multi-devis + devis "résumé par lot" sont dans le banc de tests

### 🔴 Phase 4 — Verdict honnête (Maillon 3)

Objectif : reconstituer le coût complet d'un ouvrage (annexes corrélées comprises), décider sur le prix unitaire, afficher la confiance honnêtement.

- **Rattachement des annexes au coût unitaire** : pour chaque poste surfacique, rattacher les frais annexes corrélés (même métier, même zone, sans unité propre). Ex : `(2550 € pose + 400 € ragréage) / 85 m² = 34,7 €/m²`. Liste codifiée par métier.
- **Décision "prix unitaire d'abord"** : le sens cher/normal = rapport prix unitaire devis vs marché. La quantité ne sert qu'à chiffrer l'ampleur en €. Une quantité douteuse n'affiche plus qu'une **fourchette d'ampleur**, sans changer la couleur.
- **Gradation de confiance** : certifié / indicatif / non comparable, avec pondération du surcoût (1 / ~0,5 / 0)
- **Blocages anti-verdict-dur** : liste de raisons qui interdisent une anomalie rouge (unité incompatible, nature de prix inconnue, HT/TTC incertain, rapprochement incertain) → basculent en "indicatif"
- **Garder intacts** les garde-fous critiques existants (entreprise radiée, clauses litigieuses, IBAN suspect, cash)

**Risques** :
- **Anti-double-comptage de surface** : une zone = une seule ancre (piège : fond de forme + concassé + pavé sur la même surface ne s'additionnent pas)
- **Abstention si zone ambiguë** : plusieurs métiers surfaciques mélangés → on ne rattache pas, on garde séparé et "indicatif"
- **2 jeux de valeurs verdict_global coexistent** (mono-devis vs multi-devis) — tout changement doit gérer les deux
- **Une seule source d'affichage** : pastille et bandeau doivent lire la même valeur
- **Changer la logique invalide le cache** → régénération massive, à activer hors heures de pointe

### 🟢 En continu — boucle d'amélioration

Chaque correction humaine devient :
1. Un test du filet anti-régression
2. Un exemple pour guider le modèle
3. Un correctif pour la référence de prix

**Plus on l'utilise, meilleur c'est — sans surcoût.**

---

## Documents associés

| Fichier | Rôle |
|---|---|
| [`PLAN.md`](PLAN.md) | Ce fichier — boussole de la refonte |
| [`BUGS-A-CORRIGER.md`](BUGS-A-CORRIGER.md) | File de test des bugs signalés (deviennent cas du filet anti-régression) |
| [`RUSTINES.md`](RUSTINES.md) | Inventaire des ~50 patches V3.4.x/V3.5.x avec classification (KEEP-GUARD-CRITIQUE / RUSTINE-PHASE-3 / RUSTINE-PHASE-4 / MORT) |
| [`PHASE3-ARCHITECTURE.md`](PHASE3-ARCHITECTURE.md) | Architecture détaillée Phase 3 (refonte extract.ts) |
| [`BANC-DE-TESTS.md`](BANC-DE-TESTS.md) | 15 cas canoniques pour valider Phase 3 (avant bascule prod) |
| [`catalogue-classement/`](catalogue-classement/) | Phase 1 — grille métier+nature_prix + audit catalogue + rapports unités/recalibrage |

---

## Pour toute prochaine session

Ouvrir **CE FICHIER** en premier. Puis :
- Si on bosse sur un bug user → noter dans `BUGS-A-CORRIGER.md`, ne **PAS** patcher inline
- Si on bosse sur les fourchettes catalogue → Phase 1.7 (recalibrage)
- Si on bosse sur les embeddings → Phase 1.6 (régénération)
- Si on bosse sur extract.ts → on entre en Phase 3, suivre le scope strict
- Si on bosse sur le verdict → on entre en Phase 4

**Règle absolue** : la priorité va à la phase en cours. Pas de saut de phase. Pas de patch parallèle.

---

## ⏸️ Où on s'est arrêté — fin de journée 2026-06-29

**État cumulé** : Phase 0 ✅ · Phase 1 ✅ (1.3 à 1.6 appliquées, 1.7 et 1.8 outillage livré) · Phase 2 ✅ (déployée) · Phase 2.4 🟡 (5 revues humaines faites sur 15 cibles) · Phase 3.0 + 3.1 + 3.2 ✅ (shadow run code livré, attente activation prod) · Phase B (assistant pré-revue IA) ✅

### Ce qui a été livré dans la session 2026-06-29

- **Phase 3.2** — Shadow run `extract_v2` câblé (migration `extract_comparisons` + module `extract_shadow.ts` + script `phase3-analyze-shadow.ts`)
- **Phase 4 Apprendre étendue** :
  - Script `admin-fetch-pending-reviews.ts` (CLI pour lister les analyses pending sans naviguer dans l'admin)
  - Script `admin-correct-review.ts` (corriger une revue déjà tranchée par erreur)
  - **Email Resend post-revue** (`reviewNotificationEmail.ts`) envoyé au user dès qu'admin valide/corrige/rejette. From `contact@verifiermondevis.fr`, 3 wordings (validated/corrected/rejected).
  - Script `preview-review-email.ts` (prévisualisation HTML locale du mail avant déploiement)
  - **Phase B** : script `ai-prepare-reviews.ts` — Claude Sonnet 4.6 lit le PDF + verdict actuel + déclencheurs Piste C, propose en pré-revue (action / verdict / surcout / note expert / commande prête à exécuter). Julien gagne ~80% du temps de revue.
- **Phase 2.4 revues humaines** : 5/15 faites (Travaux Maçonnerie, Mélier Cognac, Toiture Boxes, ALES n°467, DUBOIS clavier VELUX)
- **Spec Maillon 3 (Verdict honnête) consolidée** dans `BUGS-A-CORRIGER.md` :
  - 4 exigences UX (verdict 1 ligne / 3 leviers / message aligné / détail replié)
  - 4 sources de bruit à éliminer
  - 4 cas test acceptance
  - 2 nouveaux bugs documentés : `FORFAIT-VS-PRIX-UNITAIRE-CATALOGUE` (pattern récurrent sur 4 devis) + `DEVIS-DATE-NON-EXTRAIT-COMME-LEVIER`
- **Wording bandeau "validation expert"** sécurisé : "sous 24h ouvrées" + "à l'adresse de votre compte" (promesse email enfin tenue par Resend)
- **TikTok Pixel** (`D902V4RC77UB3EFMQVB0`) câblé sur VMD + GMC (mutualisé)
- **Pont VMD→GMC** dans `/api/gmc/status` (provisionne l'essai des users VMD existants qui entrent dans GMC)

### Ce qui a été livré dans la session 2026-06-24

- **Phase 1.6** — Régénération embeddings appliquée (891/891 entrées en 344 s)
- **Phase 1.7** — Script `phase1-7-recalibrage-fourchettes.ts` livré (produit `RAPPORT-RECALIBRAGE.md`)
- **Phase 1.8** — Script `phase1-8-audit-unites.ts` livré (produit `RAPPORT-UNITES.md`)
- **Phase 3.0** — Architecture `PHASE3-ARCHITECTURE.md` + module réconciliation TS pur + 23 tests Vitest passants + spec banc de tests
- **Phase 3.1** — `extract_v2.ts` (973 lignes, code mort) + copie Deno `reconciliation.ts`

### Ce qui a été livré dans la session 2026-06-24

- **Phase 1.6** — Régénération embeddings appliquée (891/891 entrées en 344 s)
- **Phase 1.7** — Script `phase1-7-recalibrage-fourchettes.ts` livré (produit `RAPPORT-RECALIBRAGE.md`)
- **Phase 1.8** — Script `phase1-8-audit-unites.ts` livré (produit `RAPPORT-UNITES.md`)
- **Phase 3.0** — Architecture `PHASE3-ARCHITECTURE.md` + module réconciliation TS pur + 23 tests Vitest passants + spec banc de tests
- **Phase 3.1** — `extract_v2.ts` (973 lignes, code mort) + copie Deno `reconciliation.ts`

### Reprise possible — 4 options

#### (A) Phase 1.7 application — relire `RAPPORT-RECALIBRAGE.md` + écrire SQL d'ajustement (1-2h)

Julien lance `npx tsx scripts/phase1-7-recalibrage-fourchettes.ts`, ouvre le rapport généré, regarde les flags rouges (entrées catalogue où la médiane observée diverge > 30% du catalogue). Pour chaque proposition acceptée : `UPDATE market_prices SET price_min_unit_ht = X, price_avg_unit_ht = Y, price_max_unit_ht = Z WHERE id = ...`. **Risque de validation circulaire** : flag accepté = vérifier qu'on n'a pas un bug d'extraction systématique sur ce poste.

#### (B) Phase 1.8 application — relire `RAPPORT-UNITES.md` + normaliser (~30 min)

Idem, mais plus simple : variantes orthographiques à normaliser (u/u./unite/unité → u canonique), entrées sans unité à compléter, incohérences forfait/unitaire à corriger.

#### (C) Phase 2.4 — Amorcer le socle avec 15 revues réelles (~1h)

`/admin/reviews` est opérationnel. Julien fait 15 revues réelles (validations / corrections / rejets) pour amorcer la table `analysis_corrections` (socle gold standard pour Phase 3 anti-régression) et valider l'ergonomie de l'écran en pratique.

#### (D) Phase 3.2 — Brancher extract_v2 en shadow run (1-2h) — 🟡 Code livré, à activer

**Livré côté code (commit à venir)** :
1. Migration SQL `supabase/migrations/20260624_002_extract_comparisons.sql` — table `extract_comparisons` (extract_v1, extract_v2, diff JSONB, v1_duration_ms, v2_duration_ms, v2_success, v2_error). RLS admin-only.
2. Module `supabase/functions/analyze-quote/extract_shadow.ts` — `getExtractV2Mode()` (lit env `EXTRACT_V2_ENABLED`, off/shadow/on), `diffExtractions(v1, v2)` (diff structuré : totaux, lignes added/removed/modified, iban/siret/type match), `runShadowExtractV2()` (fire-and-forget, jamais d'exception remontée).
3. `supabase/functions/analyze-quote/index.ts` — wrap V1 avec `performance.now()` + `EdgeRuntime.waitUntil(runShadowExtractV2(...))` quand mode=`shadow`.
4. Script `scripts/phase3-analyze-shadow.ts` — produit `docs/refonte/RAPPORT-SHADOW-V2.md` (verdict bascule, stats globales, top erreurs V2, divergences majeures).

**Actions Julien pour activer** :
1. `npx supabase db push --linked` (applique la migration `20260624_002_extract_comparisons.sql`)
2. `npx supabase secrets set EXTRACT_V2_ENABLED=shadow --project-ref vhrhgsqxwvouswjaiczn`
3. `git pull origin main && npx supabase functions deploy analyze-quote --project-ref vhrhgsqxwvouswjaiczn` (⚠️ `git pull` AVANT — `deploy` lit le code local)
4. Vérifier dans Supabase Dashboard → Functions → analyze-quote logs : la 1re analyse réelle doit logger `[extract_shadow] analysis=<id> shadow V2 scheduled (V1 done in Xms)` puis quelques secondes plus tard `[extract_shadow] analysis=<id> v2_success=true v2_duration=Yms diff="…"`
5. Après 50-100 analyses naturelles (3-5 jours en prod), lancer `npx tsx scripts/phase3-analyze-shadow.ts` pour obtenir le rapport décisionnel.

**Rollback express** : `npx supabase secrets set EXTRACT_V2_ENABLED=off --project-ref vhrhgsqxwvouswjaiczn` (effet immédiat).

**Reco** : (C) puis (D). La (C) amorce le filet de tests qui validera la (D). La (A) et (B) peuvent attendre.

### Décisions actées cumulées

- **ENGINE_VERSION** = `"1.0.0-refonte"` jusqu'à Phase 3.4 où on bumpera à `"2.0.0-refonte"`
- **Catalogue verrouillé** : 891 entrées, 33 métiers, 4 natures, 100% couverture, embeddings à jour
- **Piste C élargie** au ratio aberrant > 5× — protège la prod pendant la refonte
- **Bugs ALES 8950€ / IBAN CIC tirets / placo 25€** : restent dans `BUGS-A-CORRIGER.md`, deviennent cas test Phase 3 (cas #11, #5, à constituer)
- **Code extract.ts v1 NON modifié** pendant la refonte (extract_v2.ts vit à côté, zero risque tant que pas appelé)
- **Module reconciliation** versionné en double : source de vérité = `src/lib/analyse/extract/reconciliation.ts` (testé Vitest), copie Deno = `supabase/functions/analyze-quote/reconciliation.ts` (à synchroniser à la main au moindre changement)
