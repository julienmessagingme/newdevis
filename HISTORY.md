# HISTORY.md — VerifierMonDevis.fr

Historique détaillé des versions du moteur de scoring (`ENGINE_VERSION`) et des fixes majeurs sur le pipeline d'analyse de devis. **CLAUDE.md ne garde plus que les invariants ACTIFS** — l'histoire détaillée vit ici.

À lire si tu as besoin de :
- Comprendre POURQUOI une garde V3.x existe (cause racine + cas d'origine)
- Vérifier la trajectoire (qui a fait quoi, dans quel ordre)
- Éviter de réintroduire un bug déjà fixé

Format : chronologie inversée (récent → ancien). Chaque entrée = bug observé + fix + anti-régression.

---

## V3.5.11 (2026-06-09) — Phase 1 anti-hallucination : confidence-aware classification + audit log

**Contexte** : suite à un brief utilisateur "Politique anti-hallucination pour VerifierMonDevis", audit critique du pipeline V3.5.x. La proposition initiale (taxonomie hiérarchique famille → sous-type → job type) est validée comme direction long terme mais ne résout que ~1.5 bug sur 5 parmi les bugs observés ces 10 derniers jours. La majorité des faux positifs viennent de la zone "medium confidence" (similarity 0.70-0.85) qui passe les gardes V3.5.9 mais reste sémantiquement bancale.

**Phase 1 livrée** (ce commit) — Quick wins déterministes :

1. **Nouveau type de classification `low_confidence_match`** dans `quoteGlobalAnalysis.ts` (`ItemClassification`). Une anomalie/survalue est downgradée vers ce statut si :
   - `vectorial.confidence !== "high"` (similarity < 0.85)
   - ET le ratio prix devis/marché_max < 2.0 (sinon "anomalie franche" → conservée)
   - Seuils : `CONFIDENCE_THRESHOLD_HIGH=0.85`, `STRONG_ANOMALY_RATIO_OVERRIDE=2.0`

2. **Affichage UI badge gris "⚪ Comparaison incertaine"** dans `BlockPrixMarche.tsx` avec tooltip "Le matching avec notre catalogue n'est pas suffisamment précis pour qualifier l'écart d'anomalie. Comparaison à interpréter avec réserve." Compté dans `nbNormal` pour ne pas polluer le verdict global.

3. **Nouvelle table `match_audit_log`** (`supabase/migrations/20260609_001_match_audit_log.sql`). Capture chaque match (high/medium/low/no_match) avec :
   - description, unit, quantity, amount_ht de la ligne devis
   - top_job_type, top_label, top_similarity du match retenu
   - confidence tier final
   - top-5 candidats (transparence pour rétro-analyse)
   - rejected_reasons (si gardes V3.5.9 ont rejeté)
   - engine_version

4. **Écriture fire-and-forget** dans `matchSingleLineVectorial` via `EdgeRuntime.waitUntil`. Aucun blocage du pipeline d'analyse si l'insert échoue (audit = nice-to-have). Garde tolérance test : `if (typeof supabase?.from !== "function") return` pour ne pas casser les mocks unitaires existants.

5. **Propagation `analysis_id` + `engine_version`** depuis `index.ts` → `lookupMarketPrices` → `lookupMarketPricesVectorial` → `matchSingleLineVectorial`. Permet de rétrocrosser les matchs d'une analyse précise.

**Tests** : 39/39 verdictEngine + 34/34 vectorial inchangés. Mock supabase rendu tolérant aux call `from()` (matcher) pour ne pas casser les 5 cas de test qui ne mockaient que `rpc()`.

**Effet sur les bugs observés** :
- Côte Maison Travaux (carrelage fourniture matché à pose) : ancien match similarity ~0.78 (medium) → désormais `low_confidence_match` → badge gris au lieu de rouge ✓
- Florian Miranda (échafaudage halluciné sur logistique) : déjà résolu V3.5.9 garde lexical, badge inchangé ✓
- Faux positifs résiduels zone medium : tous downgradés → 0 fausse alerte rouge

**Phase 2 — Taxonomie hiérarchique** : plan dormant écrit dans `docs/plans/2026-06-09-taxonomie-hierarchique-anti-hallucination.md`. À déclencher après 2-3 semaines de prod (≥ 2000 entrées dans `match_audit_log`) si ≥ 5 faux positifs nouveaux signalés par utilisateur. 7 sous-phases identifiées (A→G), 12-15 jours-homme total. Critères de gate documentés.

**⚠️ Action manuelle requise après push** :
1. Appliquer migration : `npx supabase db push --linked`
2. Redéployer edge function : `git pull origin main && npx supabase functions deploy analyze-quote --project-ref vhrhgsqxwvouswjaiczn`

Bump ENGINE_VERSION 3.5.10 → 3.5.11 invalide le cache `conclusion_ia` → au prochain F5 sur analyses existantes, les anomalies sur zone medium passent en "Comparaison incertaine".

---

## V3.5.10 (2026-06-09) — Garde structurelle lignes titre de section

Audit utilisateur sur "devis ano analyse.pdf" (Florian Miranda, 3 710 € HT). Devis avec structure hiérarchique :

```
1     Pose de carrelage                                3 230 €  ← titre section
1.1     Préparation + pose carrelage  85m² × 30€      2 550 €  ← détail
1.2     Dépose/repose plinthes        85m² × 8€         680 €  ← détail
2     Modifications élec et plomberie                   280 €  ← titre section
2.1     Suppression prises             1u × 280€        280 €  ← détail
3     Camouflage tuyaux                                 200 €  ← titre section
3.1     Mise en place cache placo      1u × 200€        200 €  ← détail
```

**Bug observé** : Gemini extrait les **7 lignes** y compris les titres de section (1, 2, 3). La ligne titre "Pose de carrelage" 3 230 € est extraite avec qty=1 et unit="m²" (héritée des sous-lignes). Le matcher vectoriel V3.5.0 (1 ligne = 1 groupe) la traite comme un poste isolé → 3 230 €/m² comparé au catalogue "Pose carrelage sol" 25-80 €/m² → **anomalie ROUGE "+3 150€" totalement fausse**.

**Cause racine** : V3.4.25 avait un filtre `parent.amt ≈ Σ(enfants)` mais il opérait sur le **groupement V3.6** (1 groupe = N lignes). Depuis V3.5.0 vectoriel (1 ligne = 1 groupe), V3.4.25 ne kicke plus — la ligne titre passe directement au matcher sans aucun garde-fou.

**Fix — Garde structurelle dans `extract.ts`** (avant la propagation au pipeline vectoriel) : pour chaque ligne L à l'index i, si Σ(L_{i+1}..L_{i+K}) ≈ L.montant (tolérance 5€ OU 2%) avec K ∈ [2, 6] enfants ET L est "synthétique" (qty=1/null), alors L est un titre de section → **DROP silencieux + log**.

```
[extract] V3.5.10 drop section-title line "Pose de carrelage" 
  (3230€ = Σ 2 enfants 3230.00€, qty=1 unite=m2)
```

**Anti-régression** : un poste légitime "Pose 5 portes 1000€ qty=5" suivi de 5 lignes "Porte chambre 200€" garde la ligne parent car qty=5 ≠ 1. Seules les lignes parent avec qty=1/null (héritée du titre de section sans QTÉ réelle) sont droppées. Tests 39/39 verdictEngine + 34/34 vectorial inchangés.

**Défense en profondeur — Renforcement prompt Gemini** : nouvelle section "EXCLURE LES TITRES DE SECTION" qui explicite la hiérarchie N / N.M et donne l'exemple devis Florian Miranda. Évite que les titres de section soient extraits du tout. Le filtre post-extraction reste actif comme filet de sécurité.

**⚠️ Action manuelle requise après push** : `git pull origin main && npx supabase functions deploy analyze-quote --project-ref vhrhgsqxwvouswjaiczn`. Bump ENGINE_VERSION 3.5.9 → 3.5.10 invalide le cache.

---

## V3.5.9 (2026-06-08) — 5 fixes audit devis Côte Maison Travaux

Audit utilisateur sur "devis combiné.pdf" (Côte Maison Travaux, rénovation SDB 11 871 € TTC).

**Bug 1 — Carrelage fourniture vs pose confondus** : ligne devis "Fourniture de carrelage de sol à 25€ le m² à l'achat" (matériaux seuls) matchée à tort à "Pose carrelage sol (hors fourniture)" (MO seule) — antonymes parfaits → comparaison invalide + label trompeur côté UI.

**Bug 2 — Chauffe-eau VELIS 538€ matché à "Groupe de sécurité chauffe-eau"** (accessoire 30-80€) : le matcher vectoriel a accroché un sous-élément accessoire (groupe sécurité) au lieu de l'équipement principal nommé dans la description (chauffe-eau complet). Ratio 538/60 ≈ 9× — anomalie marché fausse.

**Bug 3 — "Demandez la surface exacte" pour "Démolition légère"** alors que la ligne 2.3 indiquait clairement **2.70 m²** dans la cellule QTÉ du devis. Cause : extraction Gemini OCR a lu "u" au lieu de "m²" (contamination des lignes voisines en `1,00 u`).

**Bug 4 — Anomalie "Échafaudage location +220€"** sur la ligne 1.1 "Logistique avec livraison du matériel, outillage, nettoyage" — aucun mot "échafaudage" dans la description, hallucination pure du matcher vectoriel (top-1 cosine sur similarity tiède ~0.70 sans aucun overlap lexical).

**Bug 5 — CRITIQUE : Hard block ROUGE "Acompte 95% avant réception"** alors que la structure du devis est : 10%+30%=**40% au démarrage** + 40% à mi-chantier + 15% à la fin + 5% retenue à la réception. La logique V3.1 cumulait TOUTES les étapes sauf `reception` (donc incluait mi-chantier et fin-travaux qui sont des jalons d'AVANCEMENT légitimes, pas des acomptes pré-prestation). Verdict ROUGE forcé alors que les paiements sont alignés sur la valeur délivrée.

**Fix 1+2+4 — Gardes sémantiques anti-faux-match dans `market-matcher-vectorial.ts`** : (a) `hasLexicalOverlap()` rejette si AUCUN token significatif (≥4 lettres, hors stopwords FR) du label catalogue n'est présent dans la description devis → fix bug 4 ; (b) `isSupplyVsLaborMismatch()` rejette si description "fourniture seule" + label "pose seule" (ou inversement, détection via tokens SUPPLY_TOKENS / LABOR_ONLY_TOKENS et pattern `hors\s+fourniture`) → fix bug 1 ; (c) `isImplausiblyHighRatio()` rejette si `devisPriceUnit > catalogPriceMaxUnit × 8` sur unités cohérentes hors forfait (adapté pour pipeline vectoriel 1 ligne = 1 groupe — V3.4.24 demandait `length >= 5`, inapplicable ici) → fix bug 2. Application : `matchSingleLineVectorial` parcourt les top-5 candidats RPC dans l'ordre similarity et garde le PREMIER qui passe les 3 gardes. Si tous rejetés → no_match propre (carte "Non comparable" UI), warning log avec raisons de rejet.

**Fix 3 — Renforcement prompt `extract.ts`** : nouvelle section "RÈGLES STRICTES POUR quantite + unite" qui explicite le cas cellule QTÉ fusionnée "X,YY m²" → extraire séparément quantite=X.YY et unite="m2", + interdiction explicite de copier l'unité d'une ligne voisine pour combler.

**Fix 5 — Recalcul acompte cumulé pré-prestation dans `score.ts`** : nouveau set `PRE_PRESTATION_ETAPES = { signature, demarrage, livraison_materiaux }`. Le cumul ne compte plus que ces étapes "avant que l'artisan ait commencé à délivrer de la valeur". Les jalons d'avancement (`intermediaire`, `revue_chantier`, `fin_travaux`) sont EXCLUS. Wording adapté "avant DÉMARRAGE des travaux" (vs "avant réception"). Sur le devis Côte Maison Travaux : 40% démarrage → ORANGE "acompte modéré" (cohérent), pas ROUGE hard block.

**Anti-régression** : un VRAI échéancier risqué genre "70% à la signature + 30% au démarrage" → 100% cumul pré-prestation → reste ROUGE hard block. Le pattern Kern Terrassement (30% signature + 30% démarrage + 30% revue + 10% réception) cumule désormais 60% (signature+démarrage), pas 90% — reste ROUGE car > 50%. Tests : 39/39 pass sur verdictEngine.test.ts, 34/34 pass sur market-matcher-vectorial.test.ts.

**⚠️ Action manuelle requise après push** : redéployer la edge function `analyze-quote` via `git pull origin main && npx supabase functions deploy analyze-quote --project-ref vhrhgsqxwvouswjaiczn`. Bump ENGINE_VERSION 3.5.8 → 3.5.9 invalide le cache.

---

## V3.5.8 (2026-06-02) — 3 fixes audit TLC Construction

Bug observé : verdict ROUGE correct (vrai hard block acompte cumulé 90%) MAIS justifications trompeuses — l'action 3 mentionnait "entreprise radiée ou paiement suspect" alors que l'entreprise affichait 4,9/5 sur 117 avis Google + "Aucun indicateur à risque". + 3 chiffres de surcoût différents sur la même page (28k€ hero / 105k€ reasons / 15k€ anomalies = ×4 d'écart). + 3 anomalies prix sur 4 = faux positifs catalogue (plancher hourdis béton matché à ragréage épais, charpente fermette matchée €/U générique trop bas).

**Fix P1 — Wording hard block contextuel** (`conclusion.ts:1419`) : remplacement du générique "HARD BLOCK ACTIF (entreprise radiée ou paiement suspect)" par 5 wordings distincts selon le flag : `company_status` → "STATUT JURIDIQUE À RISQUE", `acompte_cumule_excessif` → "ACOMPTE CUMULÉ EXCESSIF... ⚠️ l'entreprise peut être par ailleurs en règle — risque UNIQUEMENT contractuel/financier", `absence_assurance` → "ABSENCE D'ASSURANCE", `siret_invalide` → "SIRET INVALIDE", `paiement_cash_suspect` → "PAIEMENT EN ESPÈCES IMPOSÉ", `iban_suspect` → "IBAN SUSPECT".

**Fix P2 — Surcoût aligné sur hero** (`verdictEngine.ts:920`) : la branche fallback (sans `wa`) utilisait `overprice` agrégé qui pouvait diverger fortement du chiffre hero. Désormais utilise `surcoutForWording` (aligné sur le hero) ou wording neutre sans chiffre si non calculable.

**Fix P3 — Enrichissement catalogue gros œuvre** (migration `20260602_001_market_prices_gros_oeuvre_enrichment.sql`) : +8 entrées pour combler les trous catalogue sur les postes structurels (Plancher poutrelles hourdis 100-200 €/m², Dalle BA pleine RDC 85-165 €/m², Prédalles 95-185 €/m², Charpente fermette industrielle 3 variantes m²/ml/U, Dalle béton finition non porteuse 35-85 €/m², Pré-mur béton préfabriqué 85-175 €/m²).

**⚠️ Action manuelle requise après push** : (1) appliquer la migration SQL via Dashboard Supabase, (2) lancer `node scripts/seed_market_prices_embeddings.mjs` pour embed les 8 nouvelles entrées (idempotent), (3) redéployer la edge function analyze-quote. Bump ENGINE_VERSION 3.5.6 → 3.5.8 invalide le cache. Tests : 39/39 pass sur verdictEngine.test.ts.

---

## V3.5.7 (2026-06-02) — override admin sur API analyse

**Bug observé** : Julien (admin) voyait dans son admin la liste des analyses de tous les users (override déjà en place dans `AnalysisResult.tsx:397-420` depuis commit `56e4100`), MAIS quand il cliquait pour consulter une analyse appartenant à un autre user, l'API `/api/analyse/[id]/conclusion` retournait 403 "Accès refusé" car `analysis.user_id !== user.id` → l'analyse restait bloquée en "Préparation du verdict... — Accès refusé".

**Cause** : asymétrie front (admin override en place) vs API Vercel routes (admin override absent).

**Fix** : ajouter le même override admin côté API. Check `user_roles.role='admin'` avant de refuser, log warning si admin override déclenché. Touche 2 routes : `conclusion.ts` (régénération du verdict) et `mark-failed.ts` (timeout).

**Anti-régression** : un user non-admin qui essaie d'accéder à l'analyse d'un autre user continue à recevoir 403 (comportement inchangé). Pas de bump ENGINE_VERSION (ne change pas la logique du verdict, juste l'auth).

---

## V3.5.6 (2026-05-31) — garde critères rouges prioritaire sur bypass

Bug observé sur devis Côte Maison Travaux : le bypass `is_incomplete_quote` (V3.5.1) déclenchait à tort (24 lignes en `unité=u` comptées comme "sans unité physique" — bug V3.5.4 toujours présent malgré le fix, possiblement cache instance Supabase) ET surtout, ce bypass MASQUAIT un VRAI critère rouge détecté par le pipeline : "Acompte cumulé 95% > 50% — risque majeur en cas de défaillance entreprise". Le verdict synthétique orange "À négocier" écrasait le verdict rouge légitime.

**Garde ajoutée** dans `conclusion.ts` AVANT le branche du bypass `is_incomplete_quote` : parse local `analysis.score.criteres_rouges` (avec fallback `raw_text.scoring`), si `criteres_rouges.length > 0` → ne PAS bypass, laisser le pipeline normal générer le verdict ROUGE.

**Anti-régression** : si pas de critère rouge ET is_incomplete=true → bypass classique conservé (devis vraiment sans détail, sans risque autre). **Logique** : un critère rouge identifié par le pipeline est TOUJOURS prioritaire — la garde "devis incomplet" est une protection contre les faux verdicts prix, pas un masque pour les vrais risques juridiques/financiers.

---

## V3.5.5 (2026-05-31) — log diagnostic temporaire

Log `[extract] V3.5.5 detectIncompleteQuote — ... u_in_set=...` pour traquer le cache instance Supabase (à retirer plus tard).

---

## V3.5.4 (2026-05-28) — fix faux-positif "devis incomplet" sur unité "u"

Bug d'origine devis "Côte Maison Travaux" (rénovation SDB 11 871€ TTC, 30 lignes très détaillées) : 24 équipements ponctuels en `unité=u` (1 mitigeur GROHE 382€, 1 bac WEDI 495€, 1 cabine douche 498€, 1 chauffe-eau VELIS 538€, 1 vasque GEBERIT, etc.) + 6 lignes carrelage en `m²`. Ratio 24/30 = 80% sans "unité physique" au sens de ma garde V3.5.1 → garde déclenchée → bannière "Devis trop synthétique" affichée à tort → BlockPrixMarche masqué → l'utilisateur ne peut pas comparer son devis aux prix marché alors que le devis est PARFAITEMENT analysable.

**Fix dans `extract.ts:PHYSICAL_UNIT_NAMES`** : ajout `"u"`, `"u."`, `"pce"`, `"pcs"`, `"p."`, `"piece"`, `"pièce"` à la liste des unités physiques légitimes. **Ne JAMAIS ajouter** `"unite"`/`"unité"`/`"forfait"`/`"ff"` à cette liste — ce sont les fallbacks génériques que Gemini peut écrire quand la colonne UNITE est vide (cas devis bidon Crételi qui doit continuer à être détecté comme incomplet).

**Anti-régression devis bidon Crételi** : `unite=null` ou `""` (colonne vide) reste classé "sans unité physique" → garde continue à kicker correctement. Bump ENGINE_VERSION 3.5.3 → 3.5.4 invalide le cache pour les analyses récentes affectées.

---

## V3.5.3 (2026-05-27) — fix racine "verdict VERT sur entreprise radiée" via fallback raw_text.scoring

**CAUSE RACINE TROUVÉE** au bug V3.5.2 : sur l'analyse SARL TECHNO BAIN, le diagnostic SQL (`SELECT score::text, conclusion_ia::text FROM analyses WHERE id=...`) a révélé que `analyses.score` est stocké comme **string brute "ROUGE"** au lieu d'un objet JSON `{score_global, criteres_rouges, criteres_oranges}`. Régression du pipeline `supabase/functions/analyze-quote/index.ts:985` qui fait `score: scoring.score_global` (= string "ROUGE") au lieu de stocker l'objet complet. Conséquence : `conclusion.ts` ligne 1073 fait `JSON.parse("ROUGE")` qui throw, catch silencieux → `criteres_rouges` reste `[]` → `extractCompanyStatusFromCriteria([])` retourne `null` → `computeVerdict({company_status: undefined})` → pas de hard block → verdict "dans_la_norme" (VERT).

**Solution sans toucher au pipeline ni au schema DB** : le pipeline stocke heureusement l'objet `scoring` complet dans `raw_text` (cf. `analyze-quote/index.ts:962-978` : `rawDataForDebug = JSON.stringify({extracted, verified, scoring, ...})`). On lit donc en **fallback `raw_text.scoring.criteres_rouges`** quand `analysis.score` ne contient pas l'objet structuré.

**Double modification** : (a) `conclusion.ts` après le parse `analysis.score`, si `criteres_rouges.length === 0`, on tente `JSON.parse(analysis.raw_text).scoring.criteres_rouges` ; (b) `AnalysisResult.tsx:effectiveScore` garde V3.5.2 étendue avec la même tentative fallback. Couvre **toutes les analyses existantes** sans nécessiter migration ni régénération du pipeline.

Anti-régression : si une analyse a un `score` correctement JSON-structuré (cas normal V3.5.3+), le fallback n'est pas activé (court-circuit par `criteres_rouges.length > 0`). **Note** : le pipeline `analyze-quote/index.ts:985+1011+1028` reste à refactorer dans une session ultérieure pour stocker l'objet structuré dans `score` directement (plus propre, moins de redondance) — pas critique vu que le fallback résout le bug fonctionnel.

---

## V3.5.2 (2026-05-27) — garde fail-safe entreprise radiée

**Double garde fail-safe** sur le hard block "entreprise radiée" suite à un bug observé sur SARL TECHNO BAIN (SIRET 503 263 345 00038) : le bloc Entreprise & Fiabilité affichait correctement "Situation juridique à risque — entreprise radiée" + badge Radiée + chip "Critique" santé financière, MAIS le verdict expert sortait en VERT "Vous pouvez signer — Les prix sont cohérents avec le marché". Contradiction visible et critique côté UX/RGPD.

**Double défense** : (a) côté serveur `conclusion.ts` après le mapping DECISION_MAP/GLOBAL_MAP, on relit directement `criteres_rouges` et si une entrée matche `/radi[eé]{1,2}/i`, on force `verdictGlobal="a_risque"` + `verdictDecision="ne_pas_signer"` quel que soit `preEngine.verdict` ; (b) côté front `AnalysisResult.tsx:effectiveScore` même garde — si `analysis.score.criteres_rouges` contient un libellé matchant "radié", on retourne "ROUGE" en court-circuitant le mapping `conclusion_ia.verdict_global` cached. Cela couvre TOUS les cas où le cache `conclusion_ia` était figé sur "dans_la_norme" avant que la garde n'existe.

**Anti-régression** : pas d'impact sur les analyses sans entreprise radiée (la garde ne kicke que si match regex sur radié/radiée). Toute analyse legacy avec conclusion_ia obsolète + entreprise radiée bascule en ROUGE au prochain F5 (cache invalidé par bump ENGINE_VERSION 3.5.1 → 3.5.2).

---

## V3.5.1 (2026-05-26) — détection devis incomplet/résumé par lot

Bug d'origine "devis bidon Créteil" : 49 700€ HT avec 9 sections (Travaux préliminaires 890€, Démolition 3960€, Maçonnerie 11600€, Plomberie 7600€, RVT Sols 5300€, Menuiseries Int 4300€, Menuiserie ext 1900€, Peinture 8350€, Électricité 5800€) — toutes les colonnes UNITE/QTE/Prix UNIT vides dans le PDF, seuls les SOUS TOTAUX remplis. Le vectoriel matchait correctement chaque label catalogue (Démolition cloison, Plomberie petite intervention, etc.) mais le ratio quantité=1 vs marché m² donnait ×80 partout → faux verdict "+29 200€ d'anomalies" + 6 cartes 🔴 Anomalie marché trompeuses.

**Architecture identique aux bypass existants** (`is_foreign_quote` V3.4.14, `estimation_courtier` V3.4.20, `hors_scope_categorie` V3.4.28) : (a) `extract.ts:detectIncompleteQuote()` heuristique post-extraction 3 conditions ANDées : `≥ 5 lignes` ET `≥ 70% lignes sans unité physique` (unit ∉ {m²,ml,kg,h,m³,...}) ET `≥ 70% lignes quantité=1/null` ; (b) nouveau champ `is_incomplete_quote` + `incomplete_quote_reason` propagés via `ExtractedData` ; (c) bypass précoce dans `conclusion.ts` (avant verdictEngine + matching catalogue) qui génère un `ConclusionData` synthétique avec verdict `signer_avec_negociation` (pas refuser — on n'a pas la preuve que le prix est mauvais, juste qu'on ne peut pas l'évaluer), `comparison_indicative=true`, nouveau champ `incomplete_quote: { reason }` dans `ConclusionData` ; (d) UI dans `ConclusionIA.tsx` : bannière ambre 📋 "Devis trop synthétique — détail manquant" qui explique pourquoi + 3 actions concrètes (demandez quantité par ligne, prix unitaire, références). Masque `showAccusatoryHero` (ANDé avec `!isIncompleteQuote`) ; (e) dans `AnalysisResult.tsx`, nouveau memo `isIncompleteQuote` masque `BlockPrixMarche` entièrement (les cartes ×80 absurdes ne servent personne).

**Anti-régression** : seuils 70% volontairement conservateurs — un devis FR classique avec >= 5 lignes m²/ml ne déclenche pas. Les vrais petits devis 1-2 forfaits légitimes (ex: "Pose 2 portes") restent inchangés car la garde demande >= 5 lignes.

---

## V3.5.0 (2026-05-22) — bascule Phase F vectorisation en prod

Activation `MARKET_MATCHER_VECTORIAL=on` côté Supabase secrets. Le pipeline analyze-quote bascule du groupement Gemini Phase 2 (V3.6, source des hallucinations type PH VISION / placo TCE / AS COUVERTURE / CYRIL CATEZ) vers la similarity search vectorielle pgvector (1 ligne devis = 1 embedding = 1 match catalogue top-1 + top-4 candidats alternatifs). V3.6 groupement Gemini est désormais legacy avec flag rollback `off`.

---

## V3.4.28 (2026-05-22) — détection hors-scope BTP + filtre matchs catalogue inversés

**Fix #1 — DÉTECTION HORS-SCOPE BTP**. Bug d'origine "devis vélo" : un user a uploadé un devis de réparation Trek Emonda par Cycle Service Lyon (révision, cassette, dérailleur, lubrification chaîne, etc.) → l'analyse passait → matcher catalogue inventait "Remplacement chaudière fioul" pour des opérations vélo (3 unités 114€ vs marché 2500-7000€). VMD est dédié BTP/rénovation/aménagement immobilier — tout devis qui n'est pas du BTP doit être rejeté avec un message explicite.

**Pattern bypass dédié** (même architecture que `is_foreign_quote` V3.4.14 et `estimation_courtier` V3.4.20) : (a) `extract.ts` prompt étendu avec règle "DÉTECTION HORS-SCOPE BTP" qui reconnaît 6 catégories (`reparation_vehicule`, `reparation_electromenager`, `achat_biens`, `service_personnel`, `medical`, `veterinaire`, `autre`) avec mots-clés et exemples + nouveau champ `hors_scope_categorie` retourné par Gemini ; (b) whitelist `typeDocument` ligne ~455 d'`extract.ts` étendue avec `"hors_scope"` (cf. piège V3.4.20 → V3.4.21 — TOUJOURS mettre à jour la whitelist quand on étend l'enum du prompt) ; (c) bypass précoce dans `conclusion.ts` (avant verdictEngine + matching catalogue) qui génère un `ConclusionData` synthétique avec `phrase_intro` explicite "Ce devis concerne une [catégorie] — il n'est pas dans le périmètre de VerifierMonDevis", actions génériques utiles, `comparison_indicative=true`, nouveau champ `hors_scope: { categorie }` dans `ConclusionData` ; (d) côté UI dans `AnalysisResult.tsx`, nouveau memo `isHorsScopeBtp` parse `conclusion_ia` et masque `BlockPrixMarche` ET `BlockEntreprise` (les checks RGE/santé financière/qualifications artisan n'ont aucun sens sur un magasin vélo).

**Fix #2 — FILTRE MATCH CATALOGUE FAUX PAR RATIO INVERSE**. Le bug "Nettoyage pédalier 38€ matché à Chaudière fioul 2500-7000€" persistait même sans hors_scope (cas similaire sur de vrais devis BTP où Gemini matche un poste à un identifiant catalogue totalement absent). Garde symétrique de V3.4.24 (devis >> marché_max) — désormais on filtre aussi devis << marché_min. **4 conditions ANDées** : `theoreticalMinHT >= 200 €` (marché significatif) ET `devisTotalHT >= 5 €` (devis non nul) ET `devisTotalHT < theoreticalMinHT * 0.10` (devis < 10% du marché_min = écart impossible pour un VRAI match catalogue) ET `!isForfait`. Appliquée dans `useMarketPriceAPI.ts:processJobTypes` (front) ET `conclusion.ts` filterHallucinatedGroups (serveur).

**Anti-régression** : un poste légitimement bas (devis 100€ pour catalogue 200-500€, ratio 50%) ne déclenche pas. Test : devis vélo "Remplacement chaudière fioul" 114€/2500-7000€ → ratio 4.5% < 10% → filtré.

---

## V3.4.27 (2026-05-21) — durcissement actions absurdes après contournement Gemini

Gemini a contourné V3.4.26 en remplaçant "Vérifiez sur Infogreffe" par "Vérifiez que l'entreprise est bien immatriculée et à jour de ses obligations légales, notamment article 293B" — formulation différente mais bug identique (action absurde car VMD a déjà cette info dans bloc Entreprise & Fiabilité).

**2 défenses ajoutées** : (a) `EXTERNAL_VERIF_PATTERNS` étendu avec 4 nouvelles regex couvrant : `vérifiez X est immatriculé/en règle/obligations légales/à jour de ses`, `assurez-vous que X est immatriculé/en règle`, `vérifiez X article 293B/régime micro/TVA non applicable`, `vérifiez X SIRET/SIREN/APE` ; (b) règle 8bis dans le prompt Gemini → INTERDIT ABSOLU de demander à l'utilisateur de vérifier immatriculation/SIRET/statut/ancienneté/obligations légales/article 293B/code APE/RCS, avec 3 alternatives suggérées (attestation RC Pro+décennale, références chantiers, garantie écrite).

**Anti-régression** : actions légitimes sur l'artisan (assurance, références, garanties écrites, modalités garantie spécifique au chantier) passent.

---

## V3.4.26 (2026-05-21) — filtre initial sur Infogreffe/Societe.com/Pappers

Bug d'origine devis AS COUVERTURE : action 2 du verdict expert disait "Vérifiez l'existence légale de l'entreprise AS COUVERTURE RÉNOVATION et son ancienneté via des sites comme Infogreffe ou Societe.com" — alors que VMD fait DÉJÀ cette vérification via Pappers/INSEE dans le bloc Entreprise. Pousser le user à refaire le travail sur un site externe casse la promesse produit.

**Fix** : 3 regex `EXTERNAL_VERIF_PATTERNS` dans `conclusion.ts` qui détectent les actions Gemini contenant `(vérifiez|consultez|recherchez)` + `(infogreffe|societe.com|pappers|insee|sirene)` OU `vérifiez l'existence légale/ancienneté/statut juridique`. Match → action droppée silencieusement avec log warning.

**Anti-régression** : actions légitimes type "Demandez à l'artisan une attestation RC Pro et décennale" passent. + wording "sous-couvrir la prestation" reformulé en "Comparaison limitée — notre référentiel prix n'a pas trouvé d'équivalent précis pour ce type de prestation" (incompréhensible pour le user lambda → français clair). Touches `ConclusionIA.tsx` (encadré comparison_indicative) ET `verdictEngine.ts` (reasons).

---

## V3.4.25 (2026-05-21) — filtre des lignes titre récap STRUCTURELLES (extension V3.4.11/V3.4.12)

Bug d'origine devis AS COUVERTURE (2000€ TTC affiché en 4000€) : Gemini extrait ligne 1 "Travaux à effectuer : Décapage toiture et hydrofuge" 2000€ (titre récap) + lignes 2-3 "Nettoyage 1500€" + "Application 500€" qui sont la décomposition du 2000€. Patterns lexicaux V3.4.11 ne couvraient pas "Travaux à effectuer :".

**2 défenses** : (a) extension `RECAP_LINE_PATTERNS` avec `/^travaux\s+(à|a)\s+effectuer\s*[:：]/i` + variantes "Détail/Récapitulatif/Désignation des travaux" ; (b) garde STRUCTURELLE : pour chaque groupe ≥ 3 lignes avec montants > 0, si UNE ligne L a un `amt ≈ Σ(autres lignes)` (delta < 5€ OU < 1%), elle est titre récap → drop silencieux + log warning. Conservatif (≥ 3 lignes) pour éviter faux positifs sur groupes "Pose volet + dépose volet" accidentels.

---

## V3.4.24 (2026-05-21) — filtre des groupes massivement hallucinés Gemini V3.6

Bug d'origine (devis placo TCE) : Gemini a inventé un poste "Peinture salle de bain (pièce)" auquel il a attribué TOUS les 13 totaux par pièce du devis (Couloir 720€ + SDB 900€ + Chambre 1350€ + Salon 3630€ + …) = 26 040 € pour 13 « unités », alors que le marché de la peinture SDB est 330-870 €/pièce. Le groupe halluciné polluait pastille + verdict + UX (le user voit "Devis 26 040 € vs Marché 330-870 €" en gros sur sa page).

**Heuristique conservative dans `useMarketPriceAPI.ts:processJobTypes` ET `conclusion.ts` (4 conditions ANDées)** : `theoreticalMaxHT > 0` ET `devis_total > 8 × theoreticalMaxHT` ET `devis_lines.length >= 5` ET `mainQuantity <= devis_lines.length` ET `!isForfait` → groupe skip silencieusement + log warning. Seuil 8× volontairement conservateur (un vrai surcoût atteint 1.5-3×, jamais 8×). Pourquoi double garde (client + serveur) : si seul le client filtre, le serveur calcule encore le verdict sur priceData pollué → verdict figé en cache. Quick fix anti-hémorragie en attendant Phase F vectorisation (qui résoudra structurellement le bug).

**Anti-régression** : groupe avec 1-4 lignes (poste isolé légitimement cher) → garde inactive, aucun changement.

---

## V3.4.23 (2026-05-21) — simplification UI page d'analyse

Retrait du bloc `<StrategicBadge>` (IVP/IPI Indice Stratégique Immobilier, hors-scope particulier qui rénove sa SDB) et `<PostSignatureTrackingSection>` (jamais demandé par les users mesuré sur tous devis téléchargés à date). Cœur conservé : Verdict expert + Entreprise & Fiabilité + Clauses litigieuses + Postes (collapsé par défaut). Composants + endpoints conservés en code, réactivables en réinsérant les blocs. Rollback simple via `git revert d6b6ef5`.

---

## V3.4.22 (2026-05-21) — cohérence inter-blocs (pastille = cartes = verdict expert)

Bug d'origine : `analyzeQuoteGlobal` (pastille) appliquait downgrade hétérogène + upgrade ligne, mais `classifyRow` (cartes) faisait juste ratio + surface_mismatch → divergence systématique (cas PH VISION : pastille=2 anomalies, cartes=4 rouges, verdict expert=1).

**Fix** : nouvelle fonction `classifyRowEnriched()` dans `src/lib/analyse/quoteGlobalAnalysis.ts` qui applique TOUS les filtres. `classifyRow` délègue désormais à `classifyRowEnriched`. + Nouveau prop `onGlobalAnalysisReady` sur `BlockPrixMarche` qui remonte le count d'anomalies déterministe à `AnalysisResult` → passé en prop à `ConclusionIA` (props `deterministicAnomalyCount` + `deterministicSurvalueCount`) qui adapte le wording si divergence : "1 sur 4 postes vraiment à renégocier — 3 autres anomalies marché expliquées par un regroupement imparfait — voir détail".

**Audit V3.4.22 production-ready** : aucune duplication de logique de classification trouvée dans le codebase, chaîne props sans cycle, performance < 3 ms même 300 lignes. Risque théorique downgrade hétérogène masquant une vraie anomalie : ~1-2% des cas, mitigé par upgrade ligne V3.3.2 + transparence wording ConclusionIA.

---

## V3.4.21 — fix URGENT régression V3.4.20

Whitelist `typeDocument` ligne 443 de `supabase/functions/analyze-quote/extract.ts` n'avait PAS été mise à jour en V3.4.20 alors que le prompt Gemini avait été étendu pour retourner `'estimation_courtier'`. Conséquence : tous les docs courtier uploadés entre 2026-05-19 et 2026-05-21 étaient silencieusement dégradés en `type='autre'` → bypass courtier jamais déclenché → fallback nom INSEE sur "Renovation Man" → 6 homonymes dont 3 RADIÉS → bloc ROUGE faux + verdict REFUSER mensonger.

**Fix** : ajout `'estimation_courtier'` dans le `.includes([...])`. **À retenir** : tout commit qui étend le prompt Gemini sur `type_document` ou un autre champ enum DOIT vérifier que la whitelist de validation correspondante est mise à jour AVANT le push. Test unitaire à ajouter : un test qui parse le prompt et vérifie que toutes les valeurs `xxx | yyy | zzz` sont dans les `.includes([...])` correspondantes.

---

## V3.4.20 — détection courtier travaux + bypass dédié

Bug d'origine (devis "Renovation Man" pour Jules Duval) : le doc est une ESTIMATION émise par un courtier travaux (Renovation Man = intermédiaire qui désigne l'artisan PLUS TARD), pas un devis d'artisan signé. VMD cherchait "Renovation Man" sur INSEE → **6 résultats dont 3 RADIÉS** ("MAN RENOVATION" Beaumont-sur-Oise radié 2024, "USMAN MANZOOR (MAN RENOVATION)" Le Bourget radié 2026, "MUSTAPHA MBARKI (MAN RENOVATION)" Choisy-le-Roi radié 2024) → bloc Entreprise ROUGE faux + verdict REFUSER mensonger sur le courtier.

**Pattern mis en place** : nouveau `type_document="estimation_courtier"` + champ `courtier_nom`. Prompt Gemini reconnaît les principaux courtiers (Renovation Man, Ootravaux, Hellio, Travaux.com, Bricoleur du Coin, Mes Travaux Solidaires, IZI by EDF, Tucoenergie, Effy, La Maison Saint-Gobain, HomeServe, Quelle Energie, Heero) via combinaison de signaux : marque dans en-tête/logo + mention "estimation" + phrase "vérifiée sur place par un professionnel partenaire" + ligne "Frais de service [NomCourtier]" + méthodologie en étapes. Si ≥ 2 signaux convergents → estimation_courtier.

**Sortie anticipée** dans `conclusion.ts` (même pattern que foreign quote V3.4.14) : bypass Gemini + verdictEngine + matching catalogue, génération d'un wording dédié + champ `estimation_courtier{courtier_nom}` dans `ConclusionData`. **Bannière UI bleu ciel** dans `ConclusionIA.tsx` 📋 "Estimation Renovation Man — pas un devis d'artisan", masque le hero surcout (`showAccusatoryHero` ANDé avec `!isCourtierEstimation`), explique que l'artisan sera désigné plus tard et invite à re-uploader le VRAI devis quand il sera signé.

**Anti-régression** : devis classiques (sans mention courtier) → comportement inchangé. Cas hybrides (artisan qui mentionne "Renovation" dans son nom comme "AEB Rénovation") → reste devis_travaux car aucun signal courtier ne matche.

---

## V3.4.19 — fix faux positif "entreprise radiée" sur fallback nom homonyme

Bug d'origine (devis AEB Rénovation, SIRET 39023425000061 non extrait par Gemini car SANS label "SIRET:" dans le PDF) : le code prenait `results[0]` aveuglément quand le fallback nom retournait plusieurs candidats. Sur "AEB Rénovation" il y a **6 homonymes en France dont 2 RADIÉS** (Pusignan 2020, Salleles-d'Aude 2022) — le pipeline tombait souvent sur une radiée → bloc Entreprise ROUGE → `company_status=risk` → hard block REFUSER → client furieux alors que le vrai artisan est actif depuis 1993.

**3 fixes** : (a) `extract.ts` prompt — ajout cas "SIRET 14 chiffres sans label dans le bloc d'en-tête" + warning "label SIREN trompeur quand il y a 14 chiffres" (couvre aussi le devis Vitaliy Botyuk où pied de page dit "SIREN : 85217085100012") ; (b) `verify.ts` — nouveau helper `pickBestNameMatch(results, contractorAddress)` qui désambiguïse les fallback nom par code postal contractor (extrait via regex `\d{5}` dans `extracted.entreprise.adresse`). Cascade : CP exact → département → ambigu. Les 2 branches fallback (1b avec SIRET échoué + 3 direct sans SIRET) utilisent ce helper ; (c) `types.ts` + `score.ts` + `render.ts` — nouveau statut `lookup_status="ambiguous"` avec `ambiguous_candidates[]` (max 5 entries au format "NOM (CP VILLE)"). Quand ambigu, on n'écrit JAMAIS `entreprise_radiee=true` (donc pas de hard block REFUSER), on pousse un critère ORANGE explicite "Identification entreprise incertaine — SIRET non extrait, X homonymes" + bloc Entreprise affiche un avertissement détaillé avec liste des candidats.

**Anti-régression** : extraction SIRET classique (avec label) inchangée → comportement identique. Fallback nom avec 1 seul résultat → comportement identique. Fallback nom avec plusieurs résultats au MÊME CP que contractor → on prend le bon (désambiguïsation effective).

---

## V3.4.18 — 3 affinages

(a) `BlockEntreprise` — nouvelle garde `isEtablieAvecPeuAvis` (≥ 5 ans + reviews_count < `max(3, anciennete/5)`) → bloc ORANGE avec wording dédié "Sources de vérification insuffisantes vs ancienneté" — évite que des entreprises établies sans empreinte numérique passent en VERT sur la base du seul SIRENE ;

(b) `conclusion.ts` reconstitution `totalHT` robuste 5 niveaux avec **garde de cohérence** `rawHt < rawTtc * 0.7` → reconstitue HT depuis TTC + taux TVA (fix devis Gemini extrait avec HT partiel 8800€ vs réel 11292€ → ratio surcoût 17% mensonger devient 13% correct) ;

(c) wording action surface — whitelist `REAL_UNITS` (m², ml, u, forfait, h, etc.) : si l'unité n'est pas une vraie unité physique ("Article", "Réf", etc.) → omet l'unité ("facturé sans précision de surface") au lieu d'afficher "facturé en Article sans précision".

---

## V3.4.17 — 3 gardes structurelles

Détection clauses abusives "devis facturé si non signé" + atteinte rétractation + pénalité > 15% + sous-traitance libre + modification unilatérale via `clauses_litigieuses[]` + nouveau bloc `BlockClausesLitigieuses` ; garde globale "unités manquantes" si > 50% des lignes sans unité explicite → `comparison_indicative=true` + escalade verdict ; garde "cohérence groupement ↔ lignes" si delta > 50€ et > 10%.
