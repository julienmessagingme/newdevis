# HISTORY.md — VerifierMonDevis.fr

Historique détaillé des versions du moteur de scoring (`ENGINE_VERSION`) et des fixes majeurs sur le pipeline d'analyse de devis. **CLAUDE.md ne garde plus que les invariants ACTIFS** — l'histoire détaillée vit ici.

À lire si tu as besoin de :
- Comprendre POURQUOI une garde V3.x existe (cause racine + cas d'origine)
- Vérifier la trajectoire (qui a fait quoi, dans quel ordre)
- Éviter de réintroduire un bug déjà fixé

Format : chronologie inversée (récent → ancien). Chaque entrée = bug observé + fix + anti-régression.

---

## 🟢 REFONTE 2026-06-23 — Pivot vers une chaîne fiable en 4 maillons

### Pourquoi ce pivot

Après 17 versions V3.4.x → V3.5.16 de patches anti-hallucination, le constat de Julien (2026-06-23) :

> "Il faut arrêter les patchs dans tous les sens, ça ne fonctionne pas. J'ai créé une feuille de route pour fiabiliser définitivement l'outil. Il faut nettoyer l'outil actuel pour repartir d'une base saine et éviter le chevauchement de règles contradictoires."

**Le déclencheur immédiat** : devis ALES n°467, analyse `d3b3f014-7441-42fb-b3b7-95c7b56eb521`.
- L'utilisateur voyait afficher "WC (fourni+posé) — Anomalie marché — Devis 8 950 € · Marché 292-608 €"
- Le devis ne contenait pas de WC à 8 950 €
- Diagnostic : Gemini a **collé** le libellé de la ligne 2.3 ("Fourniture et pose de nouveaux wc") avec le montant de la ligne 3.1 ("Dépose totale des cloisons intérieures sur combles — 8 950 €")
- 2 vraies lignes du devis ont disparu, 1 ligne fantôme à 8 950 € a été créée
- Tout cela parce que les cellules "Désignation" du tableau ALES s'étendent sur 2-3 lignes physiques du PDF, et le pipeline V3.5 lit chaque ligne physique de façon isolée

Ce n'est pas un cas isolé : le PDF de refonte ("refonte outil scoring VMD.pdf" du 16 juin 2026, validé Julien 2026-06-23) chiffre que **~70% des faux verdicts viennent du Maillon 1 (lecture)** qui est aujourd'hui à construire.

### La cible — 4 maillons d'une chaîne fiable

| # | Maillon | Avant | Après refonte (cible) |
|---|---|---|---|
| 1 | **Lire juste** | 🔴 à construire | Cartographie de la grille du tableau UNE FOIS + extraction prix unitaire + réconciliation arithmétique côté code + confiance par champ |
| 2 | **Comparer à vraie référence** | 🟡 partiel (57% sans métier) | Catalogue rangé par métier × nature_prix × gamme, fourchettes recalibrées vs prix réels observés |
| 3 | **Verdict honnête** | 🟡 partiel | Décision sur le prix unitaire (pas le montant), gradation de confiance certifié/indicatif/non comparable, rattachement annexes au coût complet |
| 4 | **Apprendre** | 🟡 socle vide | Écran de revue admin pour expert, chaque correction = cas test du filet anti-régression |

### Principes inviolables (PDF page 13)

1. **Honnêteté avant exhaustivité** — mieux dire "comparaison indicative" qu'inventer une anomalie
2. **Comparer à base identique** — "pose seule" ≠ "fourniture+pose"
3. **Comparer le coût complet** — annexes corrélées rattachées à l'ouvrage qu'elles servent
4. **L'humain valide, la machine n'invente pas**
5. **Zéro régression** — chaque évolution passe le filet des cas validés avant la prod
6. **Coût ≈ 0** — pas d'usine à gaz

### Ce qui s'arrête immédiatement

- ❌ **Plus de bumps `ENGINE_VERSION`** pour patcher un cas user signalé (reset à `"1.0.0-refonte"` le 2026-06-23)
- ❌ **Plus de "Garde n°X"** qui s'empile inline dans extract.ts / verdictEngine.ts / market-matcher / score.ts / conclusion.ts
- ❌ **Plus de fix réactifs ad hoc** — chaque bug user → entrée dans `docs/refonte/BUGS-A-CORRIGER.md` qui devient un cas test
- ❌ **Plus de feature flags zombies** — code mort inventorié dans `docs/refonte/RUSTINES.md`

### Chronologie de la refonte

#### Phase 0 — Cap + nettoyage (2026-06-23 — livrée)

- Reset `ENGINE_VERSION` "3.5.16" → "1.0.0-refonte" (marque la nouvelle ère, ne bumper qu'aux livraisons de phase)
- Création de 5 documents de référence dans `docs/refonte/`
  - `PLAN.md` (boussole, 4 maillons, principes inviolables, ordre d'exécution, décisions actées)
  - `BUGS-A-CORRIGER.md` (file de test — chaque bug user signalé y atterrit, devient cas test de la phase qui le couvre)
  - `RUSTINES.md` (inventaire des ~50 patches V3.4.x/V3.5.x avec classification : KEEP-GUARD-CRITIQUE / RUSTINE-PHASE-3 / RUSTINE-PHASE-4 / MORT)
  - `catalogue-classement/` (anciens YAML peinture/carrelage pivotés en input Phase 1, grille de classement métier × nature_prix)
- Code mort marqué `// CLEANUP-PHASE-1` (`MARKET_MATCHER_V36`, `MARKET_MATCHER_VECTORIAL=shadow`)
- CLAUDE.md mis à jour avec section "REFONTE EN COURS" en tête
- **Filet de sécurité Phase 0.1** : `detectReviewTriggers` étendu au ratio aberrant (`devis_total > 5 × theoreticalMaxHT` sur priceData BRUT) → toute analyse type ALES bascule automatiquement en `pending_review` + email expert + bannière bleue masque l'anomalie. **Protège la prod pendant la refonte sans toucher à la logique métier.**

#### Phase 1 — Catalogue d'aplomb (2026-06-23/24 — livrée)

**Effet** : Maillon 2 passe de 🟡 à 🟢.

- **1.3 Audit catalogue** : script `phase1-audit-catalogue.ts` (v4 avec ~35 règles de classification, défaut nature_prix=fourniture_pose, pluriel-tolérant, lookarounds Unicode-aware). Sur 911 entrées : 726 auto / 0 doute / 146 conflit / 39 doublon / 0 inclassable.
- **1.4a Fix doublons** : `phase1-fix-doublons.sql` (BEGIN/COMMIT atomique avec 4 vérifs). 39 doublons résolus en 3 catégories : 16 forfaits par taille linéaires supprimés (dépose carrelage/moquette/parquet × 10/20/30/50m² + pose SDB × 4 tailles), 10 labels expliciter (standard/premium/simple/global), 4 fusions strictes, 1 fusion intelligente (isolation_murs_interieurs élargie 35-110 €/m²) + 1 nouvelle entrée `pose_carrelage_sdb_m2` (39-81 €/m², calcul depuis les 4 forfaits supprimés). **Catalogue : 911 → 891 entrées**.
- **1.4b Relecture conflits** : Claude relit les 152 conflits → 18 corrections sûres + 6 cas ambigus arbitrés par Julien (réponses 1A 2B 3B 4A 5B 6B) + 128 validés en bloc. Scripts `phase1-apply-relecture-claude.ts` + `phase1-apply-julien-arbitrages.ts` pour traçabilité.
- **1.5 Migration colonnes** : `phase1-migration-colonnes.sql` ajoute `metier` + `nature_prix` + `multiplicateur_couches_applicable` + `gamme` à `market_prices`. 891 UPDATE en transaction atomique avec 4 vérifs intégrées. **33 métiers distincts, 4 natures de prix, 100% couverture, 0 NULL**.
- **1.6 Régénération embeddings** (2026-06-24) : `seed_market_prices_embeddings.mjs --force` re-embed 891/891 entrées en 344 s. Sans ça les 10 labels Cat B modifiés + la nouvelle entrée SDB pointaient sur les anciens libellés → matcher vectoriel V3.5 prod incohérent. Le PDF marque ce point comme **point de vigilance obligatoire**.
- **1.7 Recalibrage fourchettes** (2026-06-24, outillage livré) : script `phase1-7-recalibrage-fourchettes.ts` confronte le catalogue aux ~1200 devis-postes observés. Médiane / Q1 / Q3 / p10 / p90 par job_type. Flag rouge si écart médiane > 30%. Respect du point de vigilance PDF "ne pas recalibrer aveuglément" : on flag, Julien valide chaque proposition avant SQL UPDATE.
- **1.8 Audit unités incohérentes** (2026-06-24, outillage livré) : script `phase1-8-audit-unites.ts` détecte variantes orthographiques (u/u./unite/unité/pce/piece), unités atypiques par métier, entrées sans unité, incohérences forfait/unitaire (prix dans le mauvais champ).

#### Phase 2 — Écran de revue + socle de cas validés (2026-06-23 — livrée)

**Effet** : Maillon 4 passe de 🟡 à 🟢.

- **2.1 Migration SQL** (`20260624_001_phase2_analysis_corrections.sql`) : nouvelle table `analysis_corrections` (snapshot conclusion originale immuable + corrections appliquées + audit trail + RLS admin uniquement) + vue `admin_pending_reviews` enrichie (verdict, surcout, anomalies count, bypass flags).
- **2.2 3 routes API admin** : `GET /api/admin/reviews` (liste pending_review), `GET /api/admin/reviews/[id]` (détail avec conclusion parsée + raw priceData + review_triggers devinés + corrections antérieures), `POST /api/admin/reviews/[id]/decide` (action validated/corrected/rejected → INSERT correction + UPDATE analyses.review_status + UPDATE conclusion_ia si action=corrected).
- **2.3 Page admin** `/admin/reviews` (Astro + wrapper React lazy + composant principal avec layout 2 colonnes : liste à gauche / détail à droite). Le verdict corrigé est immédiatement visible côté utilisateur (bannière bleue disparaît).
- **Grain de revue** acté (PDF) : verdict global d'abord, descente ligne par ligne reportée à 2.4 (anomalies détaillées éditables) — uniquement si l'usage réel le justifie.

#### Phase 3.0 — Préparation refonte extract.ts (2026-06-24 — livrée)

**Effet** : architecture validée, code mort prêt à brancher.

- **`docs/refonte/PHASE3-ARCHITECTURE.md`** (520 lignes) : diagnostic extract.ts actuel (924 lignes dont ~250 de rustines), cible (cartographie + lignes structurées + réconciliation arithmétique côté code), mapping des 10 rustines (6 KEEP métier, 4 RETIRABLES couvertes par le nouveau format), esquisse du nouveau prompt, API publique du module reconciliation, 9 décisions actées, 6 risques + mitigation, stratégie shadow → bascule contrôlée → cleanup.
- **`src/lib/analyse/extract/reconciliation.ts`** + **`reconciliation.test.ts`** : module TS pur de réconciliation arithmétique (qty × prix_u ≈ montant ; section ≈ Σ lignes filles ; devis ≈ Σ sections − remise). 5 cas couverts par ligne (3 connus cohérents, 3 connus désaccord, 2 connus → calcule le 3e, 1 connu → impossible, 0 connu → tout absent). Confiance par champ (lu/calculé/déduit/absent). Confiance globale du devis (certifié/indicatif/non comparable). **23/23 tests Vitest passants**.
- **`docs/refonte/BANC-DE-TESTS.md`** : 15 cas canoniques (facile/moyen/difficile) avec critères de réussite. 2 cas détaillés : ALES 8950€ (le bug emblématique) + Créteil 49 700€ (devis résumé par lot).

#### Phase 3.1 — Écrire extract_v2.ts (2026-06-24 — livrée, code mort)

**Effet** : nouveau pipeline structure-d'abord écrit, prêt à brancher en shadow run.

- **`supabase/functions/analyze-quote/reconciliation.ts`** : copie Deno du module Node testé (synchronisation manuelle, source de vérité = version Node).
- **`supabase/functions/analyze-quote/extract_v2.ts`** (973 lignes) : nouveau pipeline complet.
  - **Prompt v2 en 2 sections solidaires** : Section A (Cartographie : colonnes, schéma numérotation N/N.M/N.M.K, devise, multi_devis, pages_total) faite UNE FOIS ; Section B (Lignes structurées : type ∈ {ligne_travaux, sous_total, total, titre_section}, id_hierarchique, qty, unite, prix_unitaire, montant_total, tags_nature[ancre_surfacique|annexe_correlee|ligne_transverse], texte_brut) qui remplit la carte.
  - **7 règles absolues** inscrites au prompt (jamais de mix description/montant, type=titre_section natif, prix_unitaire OBLIGATOIRE si colonne existe, unite courante uniquement, tags_nature obligatoire, multi-devis structuré).
  - **6 rustines métier conservées** (R1 incomplete, R2 unités étendues, R4 country, R7+R8 enums whitelist, R10 clauses).
  - **4 rustines extraction retirées** (R3 sanitize entreprise, R5 RECAP_PATTERNS, R6 titres section, R9 swap HT/TTC) — couvertes par le format JSON structuré.
  - **Output type `ExtractedDataV2`** étend `ExtractedData` v1 (rétrocompat conclusion.ts) + enrichit avec cartographie, sections_v2, reconciliation (résultat du module), confiance_globale.
  - **STATUS** : code mort, **pas appelé**, pas de risque prod. À brancher en Phase 3.2 (shadow run via feature flag `EXTRACT_V2_ENABLED`).

### État au 2026-06-24 fin de journée

| Maillon | Phase | Statut |
|---|---|---|
| 1 — Lire juste | Phase 3.0 + 3.1 livrées (code mort) | 🟡 prêt à brancher en shadow (Phase 3.2) |
| 2 — Comparer à vraie référence | Phase 1.3-1.6 livrées + Phase 1.7-1.8 outillage livré | 🟢 **fait** côté catalogue, optimisations 1.7/1.8 à appliquer manuellement |
| 3 — Verdict honnête | Phase 4 non commencée | 🟡 inchangé (filet de sécurité Phase 0.1 protège) |
| 4 — Apprendre | Phase 2 livrée | 🟢 **fait** (outil opérationnel, socle à amorcer par 15 revues réelles) |

### Décisions actées pendant la refonte (clés A à L)

- **A** — `ENGINE_VERSION` reset à `"1.0.0-refonte"` (clarté visuelle, marque la nouvelle ère)
- **B** — Piste C élargie au ratio aberrant > 5× marché_max (protège la prod pendant Phase 3)
- **C** — YAML peinture/carrelage pivotés en input Phase 1 (grille de classement métier+nature_prix, plus un système parallèle de matching)
- **D** — Audit 228 inclassables creusé avec SQL 5
- **E** — Relecture intégrale du CSV abandonnée en pratique au profit de la relecture des 152 conflits seulement (plus rapide, mêmes résultats)
- **F2** — `isolation_murs_interieurs` : élargir fourchette 35→110 €/m² + DELETE id 97 (fusion intelligente)
- **G1** — Créer `pose_carrelage_sdb_m2` 39-81 €/m² en remplacement des 4 forfaits par taille
- **H1** — Ajustements priorités v4 sur les conflits avant relecture humaine (réduit la charge de 627 à 185 lignes)
- **I1** — Phase 1.6 régénération embeddings prioritaire avant tout (sinon le matcher cherche les anciens libellés)
- **J1** — Continuer Phase 3.1 (extract_v2.ts) pendant que Julien débloque les credentials Vercel (zero risque, code mort)
- **K** — Demande à l'associé : invitation sur le scope Vercel (option propre) OU partage sécurisé des 4 vars (rapide)
- **L1+L2** — Lancer les 2 audits unités + recalibrage en parallèle

### Bugs identifiés à corriger par la refonte (file de test)

Source : `docs/refonte/BUGS-A-CORRIGER.md`.

| Bug | Phase qui le résoudra | Cas test |
|---|---|---|
| ALES 8950€ WC | Phase 3 (lecture juste, cartographie multi-lignes) | Cas #11 du banc de tests |
| IBAN CIC avec tirets | Phase 3 (extraction robuste, retire le patch V3.5.17) | Cas #5 du banc |
| Devis placo 25€/m² verdict 45€/m² halluciné | Phase 4 (verdict prix unitaire d'abord) | Cas à constituer |

### Ce qui reste à faire (mise à jour 2026-06-24)

- 🟡 **Phase 1.7 / 1.8 application** : Julien lit les rapports, écrit le SQL d'ajustement (1-2h)
- 🟡 **Phase 2.4 amorcer socle** : Julien fait les 15 premières revues réelles via `/admin/reviews` pour valider l'ergonomie et alimenter le socle gold standard (~1h)
- 🔴 **Phase 3.2 shadow run** : brancher feature flag `EXTRACT_V2_ENABLED` + table `extract_comparisons` (1-2h)
- 🔴 **Phase 3.3 bascule contrôlée** : après ~100 analyses shadow validées (1 semaine de monitoring)
- 🔴 **Phase 3.4 cleanup + bump v2.0** : retirer code mort extract.ts v1 + 4 rustines extraction couvertes
- 🔴 **Phase 4 — Verdict honnête** : rattachement annexes, gradation confiance, blocages anti-verdict-dur

---

## V3.5.16 (2026-06-15) — Piste C : revue humaine assistée (zéro hallucination publique)

**Contexte** : après 14 versions de patches anti-hallucination (V3.4.x → V3.5.x) qui colmatent au cas par cas, le user a accepté le plan **Piste B + C** :
- **Piste C** (livrée ici) — revue humaine assistée court terme pour stopper les hallucinations publiques pendant qu'on construit la Piste B
- **Piste B** (à venir, 4-6 semaines) — référentiel métier hiérarchique remplaçant le matching vectoriel générique

**Architecture Piste C** :

1. **Migration SQL** (`20260615_001_review_status_analyses.sql`) :
   - Nouvelle colonne `analyses.review_status` ∈ {`auto_approved`, `pending_review`, `validated`, `corrected`} (défaut `auto_approved`)
   - Colonnes `review_notes`, `reviewed_at`, `reviewed_by` (FK auth.users)
   - Index partiel `pending_review` pour file d'attente expert
   - Vue `admin_pending_reviews` (raccourci consultation)

2. **Détection auto dans `conclusion.ts`** (helper `detectReviewTriggers`) :
   - `verdict_global` ∈ {`a_risque`, `refuser`}
   - OU `surcout_global.max` > 2 000 €
   - OU `anomalies.length` ≥ 2
   - OU bypass actif (`is_foreign_quote`, `is_incomplete_quote`, `hors_scope`, `estimation_courtier`)

3. **Helper centralisé `persistConclusion`** :
   - Remplace les 5 UPDATE `conclusion_ia` épars (foreign, incomplete, courtier, hors_scope, normal)
   - UPDATE atomique `conclusion_ia` + `review_status`
   - Fallback rétrocompat si la migration n'est pas encore appliquée en prod (column does not exist → skip review_status, persiste juste conclusion_ia)

4. **Email Resend fire-and-forget** vers `bridey.johan@gmail.com` (destinataire confirmé par user) :
   - Template HTML bleu (vs rouge du template "Analyse échouée" existant)
   - Contenu : verdict, surcoût, top 3 anomalies, raisons du flag, bouton "Valider ou corriger" → `/admin/analyses/<id>`
   - Pas de blocage si Resend KO (UX utilisateur prioritaire sur email expert)

5. **Bandeau UI bleu** dans `AnalysisResult.tsx` :
   - Affiché AVANT le verdict si `review_status === 'pending_review'`
   - Wording : "Validation expert en cours" + "verdict provisoire confirmé sous 24h"
   - Disparait automatiquement quand `review_status` passe à `validated` ou `corrected`

**Ce qui n'est PAS livré dans V3.5.16** (à venir) :
- Mini-page admin `/admin/reviews` avec boutons Valider / Corriger (pour l'instant, validation manuelle via SQL Editor ou edit direct table `analyses` côté Supabase)
- Spec Piste B famille peinture + carrelage (docs à écrire cette semaine)

**ENGINE_VERSION 3.5.13 → 3.5.16** (saut de 3 versions car j'avais 3.5.14 et 3.5.15 qui n'avaient pas bumpé conclusion.ts). Le bump invalide le cache `conclusion_ia` → toutes les analyses existantes seront régénérées au prochain F5, le `review_status` sera évalué pour chacune.

**Effet attendu** :
- ~30-50% des analyses passent en `pending_review` (cible : verdicts ROUGE, surcouts élevés, anomalies multiples, bypass actifs)
- Email instantané à chaque trigger → user notifié sous 24h
- Dataset gold standard se constitue pour Piste B

**⚠️ Actions manuelles requises après push** :
1. **Migration SQL** : appliquer manuellement le contenu de `supabase/migrations/20260615_001_review_status_analyses.sql` via Dashboard SQL Editor (cf. désynchro CLI documentée précédemment). Idempotent — peut être ré-exécuté sans risque.
2. **Vercel env vars** : confirmer que `RESEND_API_KEY` est bien configuré côté Vercel (déjà utilisé par d'autres routes du repo).
3. Tester en uploadant un devis qui déclenche au moins 1 critère → vérifier réception email + bandeau UI bleu côté user.

**Note dataset gold** : chaque analyse qui passe `pending_review → validated` (ou `corrected` avec ajustement) constitue un cas labellisé par toi. Sur 200 cas validés en ~2 mois, on aura assez de data pour calibrer la Piste B (taxonomie métier hiérarchique famille → sous-type → conventions composites).

---

## V3.5.14 (2026-06-13) — Retour wording verdict prix classique sur mode vectoriel

**Demande utilisateur** : le rendu `VectorialPriceList` introduit en V3.5.0 Phase D affichait des badges "Match fiable / plausible / incertain / Non comparable" + 3 sections séparées ("Comparables fiables / Comparables incertains / Non comparables"). Wording obscur pour l'utilisateur final — jargon technique sans valeur produit.

L'utilisateur a confirmé qu'il n'avait jamais demandé ce changement et a explicitement réclamé le retour au système classique : "il faut rester sur prix marché 'au-delà' / 'en-deçà' / 'dans la norme' en résumé comme avant."

**Fix** : supprimer la bascule conditionnelle vers `VectorialPriceList` dans `BlockPrixMarche.tsx`. Toujours utiliser `AnalysisCard` (rendu V3.6 classique) qui gère déjà tout :

| Niveau | Source | Contenu affiché |
|---|---|---|
| `row.verdict` (vert/orange/rouge selon position prix) | `useMarketPriceAPI.computeVerdict` | "Bien placé / Inférieur à la moyenne / Dans la norme / Légèrement élevé / Plutôt cher" |
| `globalBadge` (badge synthèse, prioritaire sur `verdict`) | `classifyRowEnriched` via `classifyRow` | 🔴 Anomalie marché, 🟠 Surévalué, 🟡 Surface à vérifier, ⚪ Comparaison incertaine |

Le badge "⚪ Comparaison incertaine" (V3.5.11) reste actif sur les matchs `vectorial.confidence !== "high"` avec ratio modéré — la garde anti-hallucination est préservée. La structure visuelle (1 carte par poste, expand pour voir le détail des lignes + gauge) reste inchangée.

**VectorialPriceList n'est plus rendu** mais conservé en code pour rollback éventuel (`src/components/analysis/VectorialPriceList.tsx`). L'import est retiré de `BlockPrixMarche.tsx`.

**Pas de bump ENGINE_VERSION** — changement UI uniquement, le cache `conclusion_ia` n'est pas concerné. Au prochain F5 (sans régénération), les badges sont déjà reformés.

**Anti-régression** : tests 43/43 verdictEngine + 34/34 vectorial inchangés (logique métier inchangée, seul le rendu UI bascule).

---

## V3.5.13 (2026-06-12) — Filtre confidence dans le verdict expert (anomalies à 0€)

**Bug observé** : audit des 8 derniers devis a montré 3 analyses avec des anomalies affichées à 0€ dans le verdict expert :
- DUBILLOT : "Terrassement spécifique ANC (fouilles cuve + tranchées épandage) [0€]"
- BURGAUD : "Dépose et évacuation clôture existante [0€]"
- GRIFFATON : 3× "Lessivage / nettoyage murs [0€]" (doublons)

Ces anomalies surfaient malgré la garde V3.5.11 (`low_confidence_match`) qui downgradait visuellement les badges UI mais ne nettoyait pas les anomalies du JSON `conclusion_ia.anomalies`.

**Cause architecturale** : 2 bugs en cascade.

1. `index.ts:744` mappe `jobTypePrices` → `n8nPriceDataForFrontend` **sans propager le champ `vectorial`**. La méta vectorielle (confidence/top_similarity) arrivait bien côté front via `useMarketPriceAPI.processJobTypes` (autre voie) mais était perdue côté serveur dans le `priceData` consommé par `conclusion.ts`. Impossible de filtrer par confidence.

2. `conclusion.ts` envoyait à Gemini le `priceData` complet (y compris les groupes en `low`/`medium`/`no_match` confidence). Gemini générait des anomalies sur ces groupes incertains. La garde V3.5.11 downgrade ensuite ces anomalies en `surcout_estime = 0` côté client, mais elles restent affichées dans la liste "Anomalies détectées" → UX bancale.

**Fix en 2 étapes** :

1. **Propagation `vectorial`** dans `index.ts:744` :
```ts
const n8nPriceDataForFrontend = jobTypePrices.map((jt) => ({
  ...
  vectorial: (jt as unknown as { vectorial?: unknown }).vectorial ?? undefined,
}));
```

2. **Filtre dans `conclusion.ts`** juste après V3.4.24/V3.4.28 :
```ts
priceData = priceData.filter((g) => {
  const vect = (g as any).vectorial as { confidence?: string } | undefined;
  if (!vect) return true; // V3.6 legacy → permissif
  return vect.confidence === "high";
});
```

Conséquences en cascade :
- `computeServerSurcout` ne voit plus les groupes faibles → pas de surcoût artificiel
- Gemini ne reçoit pas ces groupes dans le prompt → ne génère pas d'anomalies dessus
- L'UI `VectorialPriceList` continue d'afficher la card "Comparaison incertaine" via `n8n_price_data` complet (côté client, pas filtré) — cohérence préservée

**Anti-régression** : pas de méta `vectorial` (mode V3.6 legacy) → garde permissive, pas de filtrage → comportement inchangé. Tests : 43/43 verdictEngine + 34/34 vectorial inchangés.

**Mode dégradé** : si plus aucun groupe `high` ne reste mais que priceData était non-vide, le verdict bascule en `comparison_indicative=true` plus bas (déjà géré par les gardes existantes V3.4.17 unitMissingRatio).

**⚠️ Action manuelle requise après push** : redéployer la edge function `analyze-quote`. Bump ENGINE_VERSION 3.5.12 → 3.5.13 invalide le cache. Au prochain F5 sur DUBILLOT/BURGAUD/GRIFFATON, les anomalies à 0€ disparaissent.

---

## V3.5.12 (2026-06-09) — Bug critique iban_suspect : ORANGE remontait en HARD BLOCK ROUGE

**Bug observé** : devis Dubillot Environnement (CMC Des Sorinières + BPGO, 2 IBAN FR76 visibles dans le bloc "Informations de compte bancaire") — verdict ROUGE "Ce devis présente un risque élevé — ne signez pas / IBAN étranger ou invalide — risque de fraude" alors que :
- Les 2 IBAN sont français (FR76) parfaitement valides
- L'UI Conditions de paiement affichait paradoxalement "Aucun IBAN n'a été détecté dans le devis" — bug d'extraction OCR Gemini sur photo, séparé

**Cause racine** : `verdictEngine.ts:extractFlagsFromCriteria` ligne 628 lisait `join` (= concaténation `[...criteres_rouges, ...criteres_oranges]`) au lieu de `rouge` (= criteres_rouges uniquement) pour calculer `iban_suspect`. Tous les autres flags hard block (entreprise_radiee, siret_invalide, absence_assurance, paiement_cash_suspect, acompte_cumule_excessif) lisent `rouge` correctement.

Conséquence : `score.ts` lignes 164-170 pousse en ORANGE 2 critères légitimes — "IBAN étranger (Belgique) - à confirmer" et "Format IBAN invalide (erreur de saisie probable)" — sans intention de déclencher un hard block (un IBAN étranger n'est PAS frauduleux par nature, c'est juste à confirmer). Mais à cause du bug join, ces oranges devenaient des hard block ROUGE.

Cas Dubillot probable : Gemini a extrait un IBAN malformé (ou aucun) depuis la photo, OpenIBAN a renvoyé `iban_valide=false` → score.ts a poussé "Format IBAN invalide" en ORANGE → verdictEngine a déclenché `iban_suspect=true` (parce que join contenait "iban" + "invalide") → hard block ROUGE.

**Fix** (`verdictEngine.ts:628`) : remplacer `join.includes(...)` par `rouge.includes(...)` pour `iban_suspect`. Les autres flags `mentions_legales_manquantes` et `acompte_excessif` peuvent légitimement lire `join` car ils déclenchent `a_negocier` (pas hard block) — comportement conservé.

**Anti-régression** : un vrai critère rouge explicite "IBAN frauduleux confirmé" ou "IBAN invalide (format erroné confirmé)" reste détecté. 4 nouveaux tests ajoutés dans verdictEngine.test.ts couvrant les 4 cas (orange seul ne déclenche pas / rouge déclenche).

**Bug #2 non corrigé ici (extraction IBAN ratée)** : ne nécessite pas de fix code car le pipeline V3.5.12 est correctement défensif — pas d'IBAN extrait + pas de critère rouge = pas de hard block. Si Gemini OCR a foiré sur photo, on accepte la limite. Le prompt extract.ts ligne ~313 est déjà détaillé sur l'extraction IBAN multi-pages. Améliorer demanderait un retry OCR ou un fallback vision — hors scope de ce fix.

Tests : 43/43 ✓ verdictEngine.test.ts (39 anciens + 4 nouveaux V3.5.12).

**⚠️ Action manuelle requise après push** : redéployer la edge function. Bump ENGINE_VERSION 3.5.11 → 3.5.12 invalide le cache. Au prochain F5 sur le devis Dubillot, le verdict bascule de ROUGE à VERT/ORANGE selon les autres critères.

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
