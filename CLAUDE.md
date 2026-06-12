# CLAUDE.md — VerifierMonDevis.fr

Plateforme d'analyse de devis d'artisans + module **GérerMonChantier**. Stack : Astro 5 + React 18 islands + Supabase + Tailwind/shadcn-ui · Vercel (`@astrojs/vercel`, `output: 'static'`).

## 📚 Où trouver quoi

Ce fichier = **règles + pièges + décisions récentes** pour ne pas casser quand on code. C'est tout. Les tableaux exhaustifs (routes, tables, composants) sont **ailleurs** :

| Tu cherches… | Fichier |
|---|---|
| **Ce que l'utilisateur peut faire** (features prod + pain résolu + avantage marché + détail des 7 agents IA) | [`FEATURES.md`](FEATURES.md) |
| **Ce qu'on a commencé et pas encore fini** (en cours, partiellement implémenté, bloqué) | [`WIP.md`](WIP.md) |
| **Backlog — ce qu'on doit/veut faire mais qu'on n'a pas commencé** | [`TODO.md`](TODO.md) |
| **Référence technique exhaustive** (toutes les routes, schéma DB, pipeline, deploy) | [`DOCUMENTATION.md`](DOCUMENTATION.md) |
| **Plan de test E2E agent IA** (10 scénarios + cas d'erreur, avec 3 numéros WhatsApp GMC `+33633921577`/USER/ARTISAN + outils debug SQL) | [`TEST-PLAN-AGENT-IA.md`](TEST-PLAN-AGENT-IA.md) |
| **Historique détaillé V3.x du moteur de scoring** (cause racine + fix + anti-régression de chaque bump ENGINE_VERSION) | [`HISTORY.md`](HISTORY.md) |
| **Règles + pièges + décisions** | ← ce fichier |

**Si tu ajoutes une info** :
- Un user peut faire ça aujourd'hui ? → `FEATURES.md`
- C'est commencé mais pas terminé / bloqué / en réflexion active ? → `WIP.md`
- C'est une idée / un fix identifié mais qu'on n'a pas attaqué ? → `TODO.md`
- C'est exhaustif et stable (route, table, composant) ? → `DOCUMENTATION.md`
- C'est une règle / un piège / une décision récente que Claude doit savoir ? → ici

**Règle absolue WIP vs TODO** : un item ne va dans `WIP.md` qu'à partir du moment où on l'attaque (premier commit, première décision, premier code). Tant que c'est un "à faire" non démarré, c'est `TODO.md` exclusivement. Ne jamais polluer WIP avec du backlog non commencé — ça brouille la lecture "où on en est".

### Workflow obligatoire à chaque session

1. **Quand on identifie un truc à faire mais qu'on ne l'attaque pas tout de suite** → entrée dans `TODO.md`.
2. **Quand on commence un truc** (feature, refacto, exploration) → migrer de `TODO.md` vers `WIP.md` avec entrée 🟡 immédiatement.
3. **Quand on finit et que ça marche en prod** → retirer l'entrée WIP, ajouter à `FEATURES.md` si user-facing.
4. **Quand on bloque** ou qu'on change d'avis → mettre 🔴 dans WIP avec la raison (ne pas remettre dans TODO — bloqué ≠ pas commencé).
5. **Quand on change un comportement, une règle, une décision** qui doit survivre les sessions → ajouter ici (CLAUDE.md, sections "Pièges connus" ou "Règles importantes").
6. **Quand on ajoute un truc structurel** (route API, table DB, edge function, composant majeur) → mettre à jour `DOCUMENTATION.md`.

À l'ouverture d'une session : **toujours ouvrir `WIP.md`** pour reprendre là où on s'était arrêté, et `TODO.md` pour voir le backlog. Si l'utilisateur dit "on bosse sur X", on commence par `WIP.md` puis `TODO.md` pour voir si X y est déjà.

---

## Pattern critique — Islands Astro + React

**NE JAMAIS** passer un composant React comme enfant dans un fichier `.astro` — il sera rendu en HTML statique sans event handlers. Utiliser les wrappers `src/components/app/` :
```tsx
// src/components/app/LoginApp.tsx
export default function LoginApp() { return <ReactApp><Login /></ReactApp>; }
```
Pages Astro : `<LoginApp client:only="react" />`. Toujours `client:only`, jamais `client:load`.

## Ajouter une page

1. `src/components/pages/MaPage.tsx` — composant React
2. `src/components/app/MaPageApp.tsx` — wrapper `<ReactApp><MaPage /></ReactApp>`
3. `src/pages/ma-page.astro` — `<MaPageApp client:only="react" />` avec `export const prerender = false`

Liste complète des routes existantes : `DOCUMENTATION.md` § 6.

## Structure du code (refacto 2026-05-08/09)

`src/components/chantier/cockpit/` et `src/lib/` sont partitionnés **par domaine**. Quand tu importes ou tu cherches un fichier, vérifie le bon sous-dossier :

### `src/lib/` — utils & domain logic
```
lib/
├── analyse/      verdictEngine, scoreUtils, conclusionTypes, entrepriseUtils,
│                 urbanismeUtils, securiteUtils, devisUtils, quoteGlobalAnalysis,
│                 contexteUtils, architecteUtils
├── chantier/     planningUtils, lotUtils, paymentEvents, financingUtils,
│                 budgetAffinageData, budgetHelpers, dashboardHelpers, roadmapUtils,
│                 documentFilters, formalitesLinks, workTypeReferentiel
├── auth/         gmcAccess, postLoginRedirect, signOut, ssoHandoffClient,
│                 adminAuth, brand, domainConfig
├── integrations/ whapiUtils, marketingApi, amplitude, subscription
├── api/          apiHelpers
├── blog/         blogUtils
└── (root)        utils.ts, constants.ts, prompts/
```
Imports : `@/lib/<domain>/<file>`. Ex : `@/lib/chantier/financingUtils`, `@/lib/analyse/verdictEngine`. Si tu vois un import `@/lib/X` sans domaine, c'est cassé — corriger.

### `src/components/chantier/cockpit/` — UI cockpit
```
cockpit/
├── ChantierCockpit.tsx       (orchestrateur principal — anciennement DashboardUnified)
├── DashboardHome.tsx          (vue accueil)
├── Sidebar.tsx, PageHeader.tsx, useInsights.ts (partagés)
├── AnalyseDevisSection.tsx, TravauxDIYSection.tsx, UserCoordonnees.tsx
├── PlanningChantier.tsx, TimelineHorizontale.tsx (planning racine)
├── ComparateurDevisModal.tsx, ConceptionPage.tsx, PanneauDetail.tsx, SimulateurOptions.tsx
├── assistant/    AssistantTriPane (onglet 3 colonnes), AssistantWidget (FAB + bulle), AlertsPanel, JournalChantierSection
├── budget/       BudgetTab, BudgetGaugeReal, BudgetGauge, BudgetKpiCard,
│                 BudgetAffinageModal, BudgetBandeau, BudgetComparaison, BudgetExplication,
│                 LotBreakdown, AlertesIA, FacturesPaiements, DepenseRapideModal,
│                 ProjectHeader, QuickActions, ReliabilityBadge, TresoreriePhases
├── contacts/     ContactsSection, AddIntervenantModal
├── documents/    DocumentsView, UploadDocumentModal, AddDocumentModal
├── financing/    AidesTravaux, CreditSimulator, FinancementTab
├── lots/         LotDetail, LotCard, LotIntervenantCard, IntervenantsListView, PVReceptionModal
├── messagerie/   MessagerieSection, ConversationList, ConversationThread, MessageComposer,
│                 TemplateSelector, WhatsAppGroupsPanel, WhatsAppThread
├── planning/     PlanningTimeline, PlanningWidget
└── tresorerie/   TresoreriePanel, TresorerieView, BudgetTresorerie, Echeancier,
                  PaiementDrawer, VersementsDrawer, CashflowProjection, CashflowTab,
                  PaymentTimeline, FinancingSources
```
Avant de créer un nouveau composant cockpit : trouver le bon dossier domaine. Si le composant ne rentre dans aucun, soit c'est un orchestrateur qui reste à la racine, soit il manque un dossier (à discuter).

### Renames récents — éviter les références fantômes

| Ancien nom | Nouveau nom | Date |
|---|---|---|
| `DashboardUnified.tsx` | `ChantierCockpit.tsx` | 2026-05-08 |
| `DashboardPremium.tsx` | (supprimé, inliné) | 2026-05-08 |
| `DashboardWidgets.tsx` | (supprimé, 3 exports inlinés dans DashboardHome) | 2026-05-08 |
| `EcheancierRefonte.tsx` | `Echeancier.tsx` | 2026-05-08 |

### Refonte accueil cockpit — design GMC navy/crème (2026-05-16/17)

`ChantierCockpit` + `DashboardHome` + `Sidebar` refondus selon le design `11_cockpit_chantier_refonte.html`. Feuille dédiée `src/styles/cockpit-refonte.css` (tokens navy `#1A4A7F` / crème / gold / sage, classes `cr-*` scopées `.gmc-cockpit`, JetBrains Mono). La refonte ne touche que **l'accueil cockpit + la sidebar** — les autres onglets gardent leur style indigo.

Structure de l'accueil (`DashboardHome`) : header (titre = nom du chantier) → stepper démarrage → 3 quick actions → grille 2 colonnes. Colonne gauche = `cr-left-col` : **bulle Planning** (`PlanningBubble` — flèche temporelle début→fin + jalons RDV, cliquable → onglet Planning) au-dessus du **panneau Intervenants** (`cr-panel`, cartes `ProCard`). Colonne droite = budget + 2 stats + alerte. La tuile "À régler" est cliquable → ouvre Budget filtré "À payer" (signal `sessionStorage.cockpitBudgetFilter`).

**Règles** : la sidebar (logo cliquable → accueil, badges Documents=nb total / Messagerie=non-lus, carte profil → menu) est navy ; le widget de chat MessagingMe est désactivé sur la page chantier via `BaseLayout noChatWidget`.

**Rollback "ancien look"** : ancien cockpit = état au commit **`7386f8d`** (dernier avant refonte) ; refonte = commits **`a52bf24` →** suivants. Revenir en arrière : `git revert --no-commit a52bf24^..HEAD` (cible le dernier commit cockpit) puis commit.

---

## Modèles IA par tâche

Le choix du modèle Gemini par tâche n'est pas anodin — c'est une règle née de plusieurs mauvaises surprises (cf. Pièges connus).

| Tâche | Modèle | Pourquoi |
|---|---|---|
| Extraction OCR (`extract.ts`) | gemini-2.5-flash | Puissance OCR + raisonnement nécessaires pour parser des documents complexes |
| Groupement prix marché (`market-prices.ts`) | gemini-2.0-flash | Obéissance aux règles catalogue, pas de créativité — le modèle thinking invente des identifiants |
| Résumés lignes de travaux (`summarize.ts`) | gemini-2.0-flash | Tâche simple, pas besoin de raisonnement complexe |
| Agent orchestrator chantier | gemini-2.5-flash | Function calling multi-tour, contexte riche |

Endpoint OpenAI-compatible : `generativelanguage.googleapis.com/v1beta/openai/chat/completions` (Bearer auth).

---

## Pièges connus (gold — relire avant chaque session)

### Gemini

- **embedding-001 + text-embedding-004 inaccessibles (2026-05-21)** : `models/embedding-001` ET `models/text-embedding-004` retournent désormais `404 "not found for API version v1beta, or is not supported for embedContent"` sur les clés API GA actuelles. Cause : Google a coupé ces 2 modèles sur l'endpoint v1beta (le legacy embedding-001 d'abord, puis text-embedding-004 silencieusement). **Seul modèle d'embedding disponible aujourd'hui** : `gemini-embedding-001` (GA août 2025). Il produit nativement 3072 dim mais accepte le paramètre **`outputDimensionality: 768`** dans le body de la requête → reste compatible avec la colonne `vector(768)` créée en Phase A, ZÉRO migration SQL. Script `scripts/seed_market_prices_embeddings.mjs` mis à jour. À ne JAMAIS oublier dans le body : `outputDimensionality: 768` (sinon le serveur renvoie un vecteur 3072 dim et le check `values.length !== EMBEDDING_DIM` rejette). Doc : https://ai.google.dev/gemini-api/docs/embeddings.
- **2.5-flash "thinking" budget** : ce modèle utilise une partie du `max_tokens` pour son raisonnement interne. Avec `max_tokens: 4096`, le thinking peut consommer ~3000 tokens → JSON tronqué → parsing échoue → toutes les lignes dans "Autre". Solution : `max_tokens: 32768` pour `extract.ts`, **16384 minimum** pour l'agent orchestrator.
- **2.5-flash trop créatif pour le catalogue** : invente des `job_types` qui n'existent pas dans `market_prices`. Solution : utiliser **gemini-2.0-flash** pour `market-prices.ts` + validation serveur stricte.
- **"Aucun poste avec référence de prix marché" — causes et fix** : symptôme = tout finit dans groupe "Autre", Indice Stratégique Immobilier tombe aussi. Causes possibles (par ordre de fréquence) : (1) catalogue 470+ envoyé entier à Gemini → invente des identifiants, (2) Gemini ajoute un préfixe `"pose_"` devant l'identifiant catalogue, (3) API Gemini fail/timeout → 0 groupes retournés. **Architecture de défense dans `market-prices.ts`** : Couche 1 = `filterRelevantPrices()` réduit le catalogue à ~20-80 entrées via 180+ triggers de mots-clés. Couche 2 = matching 5 niveaux (L1 exact trim → L2 normalized → L3 préfixe → L4 token-boundary substring → L5 sémantique par scoring de tokens). Couche 3 = emergency fallback si matchedGroups===0 : matching direct par `categorie` des work items sans Gemini. **Ne jamais supprimer ces 3 couches.** Si le bug réapparaît : vérifier les logs Supabase Dashboard → Functions → analyze-quote → chercher `[MarketPrices] Gemini raw response` pour voir ce que Gemini retourne, et `ALL 5 LEVELS FAILED` ou `Emergency fallback` pour identifier quelle couche a manqué.
- **Hallucination depuis l'en-tête entreprise** (bug détecté 2026-04-30, commit `a9bd773`) : Gemini lit la description commerciale de l'entreprise (ex: "Aménagement extérieur / Piscine - Mur de soutènement") et invente des groupes de travaux absents du devis (ex: "Pompe + filtre piscine" sur un devis de pavage). Triple défense en place : (1) règle extraction — `categorie` doit venir des LIGNES DE TRAVAUX uniquement, jamais de l'en-tête, (2) règle groupement — en-tête ≠ travaux, (3) domaine `piscine` dans `filterRelevantPrices` ne se déclenche que sur les `description` des lignes, pas sur le champ `category` (qui peut être contaminé). Ne jamais retirer cette restriction `DESCRIPTION_ONLY_DOMAINS` sur le domaine piscine.
- **Escalier maçonnerie/carrelage ≠ monte-escalier** (bug détecté 2026-04-30) : Gemini assignait des travaux de chape + carrelage sur escalier à l'identifiant catalogue `monte_escalier` (équipement mécanique). Fix : règle absolue dans `marketPriceExpertPrompt` — si les lignes décrivent dépose/chape/céramique/primaire → identifiant carrelage obligatoire, jamais monte_escalier. Règle à maintenir si le catalogue évolue.
- **Double-comptage de surface VRD/pavage** : plusieurs opérations successives sur la même zone physique (fond de forme 65m² + concassé 65m² + pavé 65m²) additionnées à tort. Règle renforcée dans le prompt groupement avec exemples explicites pavage (même quantité = même surface). Vérifier toujours `main_quantity` affiché vs quantités réelles du devis quand on touche aux règles de calcul.
- **2.5-flash réécrit les textes** lors de l'extraction. Solution : instruction explicite "COPIE MOT POUR MOT" + template JSON avec "TEXTE EXACT copié mot pour mot depuis le devis".
- **Prompt "plus de types = mieux"** a causé 1 groupe par ligne de devis. Solution : cibler explicitement 3-7 groupes avec regroupement large.
- **gemini-2.5-flash sur message court "oui"** après une longue proposition assistant → retourne content vide et `completion_tokens:0`. Compensation dans `index.ts` : injection système "l'utilisateur CONFIRME, appelle le tool maintenant".

### Verdict expert — analyse de devis

- **Architecture source de vérité unique (règle absolue)** : `ConclusionIA` est le seul composant autorisé à afficher le verdict, le surcoût et les actions. `GlobalAnalysisCard` affiche uniquement la répartition des postes par catégorie de prix (chips 4 couleurs). `BlockPrixMarche` affiche uniquement le détail poste par poste. **Ne jamais ajouter** de surcoût, verdict ou plan d'action dans `GlobalAnalysisCard` ou `BlockPrixMarche` — cela crée des contradictions visibles (deux surcoûts différents, deux plans d'action). Règle établie 2026-04-30, commits `eaacc07`→`b36c1c3`.

- **Auto-trigger ConclusionIA** : `useConclusionIA` déclenche `generate()` automatiquement au mount si `initialRaw` est null. Les appels suivants utilisent le cache DB (`analyses.conclusion_ia`). **Ne pas supprimer ce useEffect** : sans lui, l'utilisateur doit cliquer pour voir le verdict (friction critique sur une page de décision).

- **effectiveScore — champ `verdict_decisionnel` pas `verdict`** (bug détecté 2026-05-01, commit `b411ebd`) : `ConclusionData` stocke le verdict décisionnel dans `verdict_decisionnel`, pas `verdict`. `effectiveScore` dans `AnalysisResult.tsx` lisait `parsed?.verdict` → toujours `undefined` → score restait VERT même si ConclusionIA retournait ORANGE. Fix : `parsed?.verdict_decisionnel`. Ne jamais renommer ce champ sans mettre à jour tous les consommateurs.

- **Matching catalogue V3.6 — architecture déterministe backend (2026-05-12)** : Gemini n'a PLUS la responsabilité de choisir un `job_type` du catalogue marché. Il extrait UNIQUEMENT une **signature sémantique neutre** (`domain`, `subcategory`, `room`, `unit`, `keywords[]`). Le backend TypeScript (`supabase/functions/analyze-quote/market-matcher.ts`) fait le matching déterministe avec règles strictes :
  1. **Hard block ROOM MISMATCH** : si l'entrée catalogue est `room_specific=true` ET que la signature ne mentionne pas la pièce → REJECT sans fallback.
  2. **Exact match** : domain + subcategory + room + unit identiques.
  3. **Partial sans room** : domain + subcategory + unit identiques, room absente → OK uniquement si catalogue !room_specific.
  4. **Generic family** : fallback sur la famille générique (ex: "raccordements_electricite" pour tous les variants par pièce).
  5. **Fuzzy keywords** : match sémantique par mots-clés.
  6. **NO_MATCH** : aucun match → comparaison indicative honnête.

  **Migration SQL** : `supabase/migrations/20260512000000_market_prices_v36_room_specific.sql` ajoute 3 colonnes (`room_specific`, `required_room[]`, `generic_family`) à `market_prices`. SEED initial marque les job_types existants contenant un mot-pièce comme room_specific=true.

  **Le matcher fonctionne SANS la migration SQL** (inférence depuis le job_type via heuristique) — la migration optimise et explicite.

  **Feature flag** : `MARKET_MATCHER_V36=false` dans l'env de l'edge function pour revenir au comportement V3.5 (Gemini choisit). Par défaut V3.6 actif si `marketSignatureExpertPrompt` présent dans le domain config.

  **2 prompts coexistent dans `domain-config.ts`** :
  - `marketPriceExpertPrompt` (legacy V3.5, requis) : Gemini reçoit catalogue + choisit job_type
  - `marketSignatureExpertPrompt` (V3.6, optionnel) : Gemini reçoit pas de catalogue + extrait signature

  **Logging audit** : chaque match passe par `logMatchResult()` qui trace dans Supabase Functions logs : `[MatchV36] "<group>" MATCH <reason> → <job_type> ("<label>") | sig: domain=<X> sub=<Y> room=<Z> unit=<U> kw=[...]`. Permet de retracer chaque décision a posteriori. En cas de NO_MATCH ou REJECTED_ROOM_MISMATCH : `mismatch_reason` est loggé en `console.warn`.

  **Anti-régression** : ne JAMAIS faire choisir un job_type au LLM. Si tu refactors `groupWithGeminiSignature` ou `matchMarketCategory`, tester sur les 3 devis canoniques (Thouret Elec → no room cuisine, Kern Terrassement → 4 groupes pas 1, Zitelec Chauffage → cuisine si signalée).

- **V3.6 ACTIF EN PROD (2026-05-13)** — `MARKET_MATCHER_V36=v36_only` flipé via `npx supabase secrets set`. Mode SHADOW retiré. Toutes les nouvelles analyses passent par le matcher déterministe backend. Rollback express : `npx supabase secrets set MARKET_MATCHER_V36=v35_only` (effet immédiat, pas de redéploiement).

  **V3.6.1 hardening matcher (commit `53e2a29`)** — 3 fixes anti faux-fuzzy :
  1. `SCORE_THRESHOLD_FUZZY` 40 → **50** (zone permissive divisée par 2).
  2. **`FUZZY_MIN_DOMAIN_SCORE = 30/40`** : un fuzzy_fallback exige désormais un vrai signal domaine. Bloque les matchs croisés type "Pose IPN → couverture_bac_acier" (domain score 0 mais total 40+ via subcategory générique).
  3. `"autre"` ajouté dans `ALLOWED_SUBCATEGORIES_BY_DOMAIN.autre` (sinon Gemini retournant `{domain:"autre", subcategory:"autre"}` était rejeté en invalid_signature).

  **V3.4.9 — Garde prestations intellectuelles (commit `612267e`)** : 21 patterns bloqués dans `isNonWorkSignature` (MOE, maitrise oeuvre, architecte, étude, avant-projet, conception, AMO, OPC, ingénierie, diagnostic, audit, expertise, permis de construire, honoraires, ...). Spécificité : ces keywords bloquent **quel que soit le `domain` choisi par Gemini** (contrairement à `NON_WORK_KEYWORDS` qui ne s'applique qu'à `domain="autre"`). Raison : un "diagnostic électrique" peut être classé en `domain=electricite` mais reste une prestation intellectuelle non comparable au catalogue. Cas d'origine : devis MOE 4 706€ matché à `diagnostic_immobilier` 250€ → anomalie aberrante +4 500€.

  **V3.4.10 — Filtre groupes hallucinés (commit `bd0c329`)** dans `useMarketPriceAPI.ts` `processJobTypes` : skip silencieux des groupes sans `devis_total_ht > 0` ET sans aucune `devis_line` avec `amount_ht > 0`. Couvre les cas où Gemini invente des groupes (ex: "Local technique piscine" sur un devis MOE) sans correspondance dans le devis. Ne JAMAIS supprimer ce filtre — sinon affichage absurde "Marché 1 625-3 375€, Devis : —" sur des postes fantômes.

  **V3.4.11 + V3.4.12 — Filtre lignes récap (commits `060ff5c`, `7501d3e`)** : double défense contre les "Montant Total HT/TVA/TTC" extraites à tort comme postes travaux par Gemini.
  - **V3.4.11 côté serveur** : `extract.ts` filtre `parsed.travaux` selon 8 regex (`/^montant\s+(total|sous-?total|tva|ht|ttc|acompte|solde|...)/i`). Prompt renforcé avec règle absolue listant les patterns interdits.
  - **V3.4.12 côté front** : `processJobTypes` filtre AUSSI les `devis_lines` au sein de chaque groupe selon les mêmes patterns. Recompute `devis_total_ht` depuis les lignes restantes. Couvre les anciennes analyses en DB créées avant V3.4.11 (sinon le user voit toujours le bug au F5 sans re-uploader).
  - Cas d'origine : devis MOE total 5 647€ TTC mais 3 lignes récap sommées affichaient 11 294€ (= 2× le réel : HT 4 706 + TVA 941 + TTC 5 647).

  **V3.4.7 — Garde plausibilité underprice (commit `3dceae8`)** dans `verdictEngine.ts` ligne ~825 : si `overprice_pct < -0.20` (devis > 20% sous le marché), au lieu d'afficher "X k€ sous la moyenne du marché", on affiche "Comparaison globale indicative — la fourchette marché agrégée n'est pas représentative sur ce profil de devis". Cas d'origine : multi-devis SALLEM affichait "170.8 k€ sous la moyenne" en Vert (PDF non segmenté + bounds gonflés par cumul postes hétérogènes). Aberration qui décrédibilisait l'analyse.

  **V3.4.17 — 3 gardes structurelles scoring + détection clauses abusives (2026-05-19)** :
  - **Garde 1 — Clauses contractuelles litigieuses** : nouveau champ `clauses_litigieuses[]` extrait par Gemini sur le texte libre du devis (CGV, bas de page, MAJUSCULES). 5 types reconnus : `devis_facture_si_non_signe` (ROUGE, illégal sans accord préalable Code conso L113-3), `pas_de_retractation` (ROUGE, loi Hamon 2014), `penalite_annulation_excessive` (ORANGE, > 15% du montant), `soustraitance_libre` (ORANGE), `modification_unilaterale` (ORANGE). Validation post-extraction : type whitelist + citation ≥ 10 chars + cap 5 clauses max. Nouveau composant `BlockClausesLitigieuses.tsx` affiché entre BlockEntreprise et BlockPrixMarche uniquement si ≥ 1 clause. **Règle absolue** : Gemini ne doit JAMAIS fabriquer une citation — elle doit être présente mot pour mot dans le PDF. Si le pattern n'est pas trouvé, on n'inclut pas la clause.
  - **Garde 2 — Unités manquantes globales** : dans `conclusion.ts`, calcul `unitMissingRatio = lignes sans unité / total lignes`. Si > 50% → bascule `comparison_indicative=true` + escalade verdict `signer → signer_avec_negociation` + action prioritaire "Demandez à l'artisan un devis détaillé avec UNITÉS PRÉCISÉES (m², ml, U ou forfait) pour CHAQUE ligne". Cas d'origine : devis AEB Rénovation n°23130 où la colonne "Qté" n'a aucune étiquette d'unité — l'IA matchait le catalogue à l'aveugle et sortait des faux positifs "Anomalie marché" ininterprétables. Détection unité manquante : `unit === "" || /^\d+$/.test(unit)` (le 2e cas couvre le bug Gemini où la qty est extraite comme unite).
  - **Garde 3 — Cohérence groupement ↔ lignes** : pour chaque groupe Gemini, vérifie que `Math.abs(devis_total_ht - Σ devis_lines.amount_ht) > 50 € ET delta > 10% du total`. Si oui → groupe mathématiquement invalide (Gemini a probablement inventé le total ou mal regroupé). Bascule `comparison_indicative=true`. Log warning `[conclusion] V3.4.17 groupement invalide`. Cas observé : "Pose carrelage 25.3 articles · 189€" alors que les vraies lignes carrelage du devis étaient 705€ + 815€ — incohérence aberrante non détectée avant V3.4.17.
  - **Anti-régression** : devis avec unités explicites + groupes cohérents → 0 garde active → comportement inchangé. Devis étranger (V3.4.14) → bypass conservé. Hard block company_status → reste prioritaire ROUGE.

  **V3.4.15 — Cohérence visuel / verdict + retrait wording arbitraires (2026-05-18)** trois bugs structurels fixés en un commit :
  - **Bug 1 — Front affichait "🔴 Anomalie marché" tandis que verdict restait VERT** : duplication de logique. Front (`classifyRow` dans `quoteGlobalAnalysis.ts`) classait en anomalie par ratio devis/marketMax > 2, mais back (`computeServerSurcout`) EXCLUAIT ces postes via `hasSurfaceUnitMismatch` → surcoût serveur faible, verdict VERT. Fix structurel = nouveau type `ItemClassification: "surface_mismatch"` partagé front+back via `src/lib/analyse/surfaceUtils.ts`. Le poste est marqué jaune "🟡 Surface à vérifier" au lieu de rouge "🔴 Anomalie marché" — c'est honnête (sans surface, on n'a pas le droit d'affirmer qu'il y a anomalie). Escalade auto du verdict mono-devis `signer → a_negocier` si ≥2 postes "suspects" (surface mismatch + ratio prix > 3× marché max), hard block company_status reste prioritaire. Le compteur `nbSurfaceMismatch` est exposé par `analyzeQuoteGlobal` + `GlobalAnalysisCard` affiche une sous-ligne factuelle "X postes à clarifier — facturé en unité/forfait sans surface précisée".
  - **Bug 2 — Phrase générique 8/12 m²** : `conclusion.ts:1278` hardcodait "Si < 8 m² le prix est élevé, négociez ; si > 12 m² le prix est cohérent." Seuils arbitraires faux pour 80% des postes (peinture, doublage, ragréage… ont des seuils m² très différents). Fix : retrait complet de la 2e phrase, on garde uniquement la demande factuelle de surface.
  - **Bug 3 — Note Google 3.3/5 affichée VERTE "point conforme"** : `render.ts:150` pushait dans `points_ok` (rendu vert UI) si `google_note < 4.0`, créant une incohérence avec le bandeau orange "Réputation moyenne" affiché juste au-dessus. Fix : push dans `alertes` (orange) au lieu de `points_ok`, wording renforcé qui invite à lire les avis récents.
  - **Anti-régression** : devis FR avec carrelage en m² + qty correcte → mismatch=false, classification standard préservée. Devis Belgique (V3.4.14) bypass complet conservé. Devis ANC réhabilitation forfait → hors-scope surface_mismatch (pas prestation surfacique). Le champ `nbSurfaceMismatch` est optionnel dans `GlobalAnalysis` pour la compat caches pré-V3.4.15.

  **V3.4.14 — Détection devis étranger + bypass catalogue marché (2026-05-16)** dans `supabase/functions/analyze-quote/country.ts` (nouveau) + `extract.ts` + `conclusion.ts` :
  - **Helper `detectQuoteCountry(extracted)`** : agrège 4 signaux (préfixe IBAN BE/LU/CH/DE, préfixe TVA intracom `BE1000162842`, mots-clés adresse "Belgique"/"Luxembourg"/..., taux TVA non-FR 6%/21%/17%/19%). IBAN ou TVA préfixe = signal FORT (gagne seul). Adresse = signal modéré (gagne sans contradiction). Taux TVA seul = pas assez (peut être DOM-TOM mal extrait). FR par défaut.
  - **`extract.ts`** : prompt Gemini IBAN renforcé pour scanner TOUTES les pages (l'IBAN d'un devis multi-pages est presque toujours sur la dernière page, ratés systématiques avant le fix). Nouveau champ `tva_intracom` extrait séparément. `country_code` + `is_foreign_quote` ajoutés à `ExtractedData`.
  - **`conclusion.ts` sortie anticipée** : si `is_foreign_quote=true` → ConclusionData synthétique sans appel Gemini ni matching catalogue. `verdict_decisionnel="signer_avec_negociation"`, `surcout_global={0,0}`, `comparison_indicative=true`, nouveau champ `foreign_quote{country_code,country_label}`. Actions dédiées : registre commerce local + devis concurrents locaux.
  - **`ConclusionIA.tsx`** : nouvelle bannière ambre 🌍 "Devis {pays} détecté" affichée AVANT le verdict, masque le hero surcout (`showAccusatoryHero` ANDé avec `!isForeignQuote`), explique que sécurité paiement (IBAN, acompte) ET structure restent fiables mais comparaison prix non applicable.
  - **Cas d'origine** : devis Casafit (Belgique) — IBAN BE86 non détecté (prompt ne forçait pas le scan dernière page) + faux surcoût +1500€ généré par comparaison au catalogue FR (TVA 6% réno BE vs catalogue FR posé à 20%).
  - **Anti-régression** : les analyses FR classiques ne sont pas affectées (`country_code="FR"`/`is_foreign=false` par défaut). Bypass kick uniquement si 1 signal FORT (IBAN/TVA préfixe non-FR) ou 1 signal modéré confirmé.
  - **Limite** : analyses étrangères déjà uploadées AVANT le déploiement gardent leur ancienne extraction (pas de `is_foreign_quote` en `raw_text`) → re-upload requis. Les nouvelles analyses partent directement avec la détection.

  **V3.4.14 — Enrichissement catalogue ANC + prestations techniques sous-couvertes (2026-05-16)** migration `20260516140000_market_prices_anc_technique_enrichment.sql` :
  - **+17 entrées** dont l'entrée structurelle `anc_rehabilitation_complete` 14-25k€ qui fix À TERME le cas V3.4.13 (devis ANC réhabilitation complète 22k€ matché à `micro_station_epuration` seul → fausse anomalie +11k€). Avant : seuls `fosse_septique_installation` et `micro_station_epuration` couvraient l'ANC en forfait isolé. La V3.4.13 reste utile comme filet (cas restants où le catalogue sous-couvre toujours).
  - Couvre aussi : filtre à sable drainé (8-14k), filtre planté/phytoépuration (9-16k), tertre infiltration (10-18k), épandage souterrain (6-10k), étude pédologique préalable (0.6-1.5k), terrassement spécifique ANC (2.5-5.5k).
  - Prestations techniques sous-couvertes : géothermie verticale (forage par ml 90-200€) + horizontale (forfait 4-9k), cuve eau pluie enterrée (3.5-8k) vs aérienne (0.4-1.8k), élévateur PMR plateforme (8-18k), bardage HPL haut gamme (95-180€/m²) + mélèze (75-150€/m²), domotique studio (1.5-4.5k) vs maison complète (4.5-14k), photovoltaïque granulaire par kWc (1700-2400€).
  - **`generic_family`** populé pour fallback matcher V3.6 : `anc_filiere` (regroupe les 4 filières de traitement → si Gemini signature trop générique "Création système ANC", fallback sur la famille moyenne), `domotique`, `bardage_exterieur`.
  - **Anti-régression** : avant toute future modif catalogue, vérifier qu'aucune entrée FR retournée par `matchMarketCategory` ne s'écrase sur les nouvelles `anc_*`. Les fourchettes ANC sont assez hautes (14-25k forfait) — un mismatch sur un petit poste plomberie générique le placerait dans une fourchette aberrante.

  **V3.4.13 — Garde plausibilité UPSIDE symétrique (2026-05-16)** dans `verdictEngine.ts` ligne ~862 + nouveau flag `comparison_indicative` dans `ConclusionData` :
  - Si `overprice_pct > +0.50` (devis +50% au-dessus du marché) ET aucune anomalie identifiée poste par poste (`sanitizedAnomalies.length === 0` ET `wa.anomalies_count === 0`), c'est presque toujours un catalogue qui **SOUS-COUVRE** la vraie prestation.
  - Côté `conclusion.ts` : flag `comparison_indicative: true` set dans `ConclusionData`.
  - Côté `ConclusionIA.tsx` : `showAccusatoryHero` set à `false` si `isComparisonIndicative` → le hero "+X €" alarmiste est masqué, remplacé par un encadré ambre "Comparaison globale indicative — la fourchette marché agrégée semble sous-couvrir la prestation".
  - Cas d'origine : devis ANC réhabilitation complète 22k€ matché à un seul "micro-station" forfait 7-14k€ → "+11 100€ écart" alarmiste contredit par conclusion textuelle "ce qui justifie le montant global".
  - **Seuil 50% asymétrique** (vs 20% pour V3.4.7 underprice) : les sous-estimations catalogue sont plus dispersées que les sur-estimations. Un vrai poste peut facilement valoir 1.5× le standard sans être anormal (haut de gamme, technique).

  **V3.4.7 — Wording "dépassent largement" amplitude-aware** dans `ConclusionIA.tsx` ligne 297-311 : adapter selon verdict :
  - `refuser` → "dépass(ent) **largement** les prix du marché"
  - `signer` → "présent(ent) un **léger écart** vs marché"
  - `a_negocier` → "au-dessus du marché à renégocier"
  Cas d'origine : Kern Vert + 3 postes / 267€ total / 90€/poste affichait "dépassent **largement**" → contradictoire avec pastille Verte.

  **V3.4.8 (commit `6150512`)** — 3 fixes extraction issus du batch baseline 93 devis :
  - **TTC < HT swap** : dans `extract.ts`, si `parsed.totaux.ht > parsed.totaux.ttc × 1.10` → swap automatique avec log warning (impossible avec TVA française normale, signe que Gemini a inversé).
  - **Sanitization nom entreprise** : `sanitizeEntrepriseNom` rejette si commence par minuscule OU matche 12 patterns de blabla légal observés ("Pour le client...", "détient la certification...", "se réserve le droit...", "s prestataires jusqu'au...", etc.). Sinon Gemini sortait des fragments de phrases comme nom d'entreprise.
  - **Garde non-postes financiers dans matcher** : `NON_WORK_KEYWORDS` ("acompte", "solde", "capital", "prime cee", "reste à facturer", etc.) → retour `no_match` direct si `domain="autre"` + keywords matchent. Bloque les libellés purement financiers du polluer le matching catalogue.

  **Tests anti-régression V3.6 + V3.4.x** : `supabase/functions/analyze-quote/market-matcher.test.ts` (17 cas), `src/lib/analyse/verdictEngine.test.ts` (27 cas). À relancer avant toute modif matcher/scoring : `npx tsx <path>`. Cas critiques couverts : Thouret room=null + catalog cuisine = REJECT, SALLEM terrassement → enrobé = REJECT (V3.6.1 domain guard), MOE/architecte/diagnostic = NO_MATCH, validateSignature avec subcategory "autre" sur domain "autre" = OK.

- **2 jeux de valeurs distincts pour `verdict_global` (RÈGLE CRITIQUE — bug détecté 2026-05-13)** : il existe DEUX sets de valeurs dans `verdict_global` selon la source. Tout mapping qui ignore un set fait diverger pastille header vs bandeau verdict.
  - **Set #1 — `conclusion_ia.verdict_global`** (mono-devis, type `ConclusionData`, cf. `conclusion.ts:1253` GLOBAL_MAP) :
    - `"dans_la_norme"` → VERT
    - `"eleve_justifie"` → ORANGE (cher mais justifié — **piège : ne JAMAIS tomber en VERT par défaut**)
    - `"a_negocier"` → ORANGE
    - `"a_risque"` → ROUGE
  - **Set #2 — `global_metrics.verdict_global`** (multi-devis, calculé par `computeGlobalFromSegments`) :
    - `"signer"` → VERT
    - `"a_negocier"` → ORANGE
    - `"refuser"` → ROUGE

  Bug d'origine : `Carrelage LEONARD` affichait Feu Vert sur la page mais ROUGE dans l'admin. Cause : le mapping admin ne gérait que set #2 → `verdict_global="dans_la_norme"` retournait null → fallback sur la colonne legacy `score`.

  **Fix appliqué (commit `3c36029`)** : 3 endroits avec mapping complet des 2 sets :
  - `src/pages/api/admin/devis.ts` (API admin liste des devis)
  - `src/components/pages/AnalysisResult.tsx` `effectiveScore` (pastille header)
  - `supabase/migrations/20260513150000_derive_display_score_full_mapping.sql` (fonction SQL pour `admin_kpis_*` views)

  **Anti-régression** : tout nouveau composant qui lit `verdict_global` DOIT supporter les 2 sets. Ne JAMAIS écrire un `switch` avec seulement `signer/refuser` OU seulement `dans_la_norme/a_risque` — toujours les 8 valeurs.

- **verdictEngine V3.3.1 — architecture cohérence absolue (2026-05-11)** : moteur à 4 couches de défense en profondeur qui garantit qu'**aucun écran ne peut afficher simultanément rouge + signer + payé en trop**.

  **COUCHE 1 — `computeVerdict` (V3.1, seuils alignés V3.2.1)** dans `src/lib/analyse/verdictEngine.ts` :
  - Décision par `weighted_anomalies` : poids ≥ 30% → refuser, ≥ 10% → a_negocier, sinon signer.
  - **Escalade matérielle** : si `anomalies_count >= 2` ET `surcout_total > 1 000€` ET `poids > 5%` → a_negocier même si poids cumulé < 10%. Évite à la fois (a) le bug Kern (3 anomalies mais poids 49% qualifié "modéré" par anciens seuils 20/50) et (b) le faux orange sur micro-écarts (devis 48k€ avec 180€ d'écart = 0.4%).
  - Hard block priorité 0 : entreprise en cessation/liquidation/radiée → REFUSER forcé.

  **COUCHE 2 — Garde de cohérence finale** dans `src/pages/api/analyse/[id]/conclusion.ts` :
  - Si `preEngine.verdict === "signer"` mais `isMaterialServerSurcout(surcoutMax, totalHT, marketPosition.totalDevis)` = true → escalade auto en `signer_avec_negociation`. `isMaterialServerSurcout` = triple garde matérielle (>1 000€ ABSOLU ET >3% du devis RELATIF, avec fallback `marketPosition.totalDevis` si `totalHT` manque). Cf. fonction `isMaterialServerSurcout` ligne ~42.
  - `totalHT` résolu en 3 niveaux : `extracted_data.totaux.ht` → `extracted.totaux.ht` (legacy) → somme des `devis_total_ht` du priceData. Sans ça, certaines analyses anciennes sortaient `totalHT=null` → garde inopérante.

  **COUCHE 3 — Honnêteté plutôt que faux compteurs** :
  - Si la garde de cohérence escalade SANS qu'aucune anomalie ne soit identifiée (`preMajorAnomalies = 0` ET `wa.anomalies_count = 0`), on PREPEND une raison HONNÊTE : *"⚠️ Écart détecté : l'estimation serveur indique un surcoût d'environ X € sur les postes comparables, mais l'analyse poste par poste n'a pas identifié de ligne anormalement chère. À approfondir avec l'artisan."*
  - **Ne JAMAIS** falsifier `anomalies_count = Math.max(2, ...)` pour forcer un wording cohérent — c'est de la falsification de donnée métier qui se retournera contre nous quand un user demandera "lesquelles sont ces 2 anomalies ?" (elles n'existent pas).

  **COUCHE 4 — Sanitization LLM en 3 niveaux** dans `conclusion.ts:sanitizeLLMText` :
  - `ALWAYS_FORBIDDEN` (peu importe verdict) : "prix attractif", "globalement cohérent", "sous la moyenne du marché", "compétitif", "cohérent avec les prix du marché".
  - `CONDITIONAL_FORBIDDEN` (si verdict ≠ signer) : "vous pouvez signer", "bon devis", etc.
  - `POSITIVE_PRICE_TERMS` (si `hasServerSurcout` matériel) : "avantageux", "bonne affaire".
  - Appliqué sur `phrase_intro`, `justifications`, `anomalies[].explication`, `actions_avant_signature`, ET **`verdict_reasons.summary` + `reasons[]`** (V3.3 — éviter qu'un wording déterministe oublié contredise le verdict).

  **Source unique de vérité pour la pastille** (V3.3) : `effectiveScore` dans `AnalysisResult.tsx` lit `conclusion_ia.verdict_global` (ou `conclusionIaLive`) en priorité, exactement comme le multi-devis lit `global_metrics.verdict_global`. Plus de divergence pastille header vs bandeau verdict. **Ne jamais** revenir à un recompute `computeVerdict` côté client en source primaire.

  **ENGINE_VERSION + cache invalidation automatique** : `conclusion_ia.engine_version` stocké à chaque génération. Au cache hit, si version DB ≠ `ENGINE_VERSION` constante du code → régénération forcée automatique (pas besoin de bouton "Régénérer"). À **incrémenter à chaque changement de logique scoring** (ex: 3.3 → 3.3.1).

  État courant : **`ENGINE_VERSION = "3.5.11"`** (`src/pages/api/analyse/[id]/conclusion.ts`). Historique complet des versions V3.4.17 → V3.5.11 (cause racine + fix + anti-régression de chaque bump) dans [`HISTORY.md`](HISTORY.md).

  **Invariants ACTIFS** que toute modif scoring doit respecter (= les gardes en place qu'il ne faut PAS supprimer) :
  - **Bypass précoces dans `conclusion.ts`** (avant verdictEngine + matching catalogue), tous suivant le même pattern : `is_foreign_quote` (V3.4.14), `estimation_courtier` (V3.4.20), `hors_scope_categorie` (V3.4.28), `is_incomplete_quote` (V3.5.1). Génèrent un `ConclusionData` synthétique + bannière UI dédiée + masquage `BlockPrixMarche`.
  - **Garde critère rouge > bypass** (V3.5.6) : si `criteres_rouges.length > 0` (parsé depuis `analysis.score` ou fallback `raw_text.scoring`), AUCUN bypass ne peut écraser le verdict ROUGE — l'incomplete_quote / hors_scope ne masquent JAMAIS un vrai risque juridique/financier.
  - **Garde fail-safe entreprise radiée** (V3.5.2) : si `criteres_rouges` contient un libellé matchant `/radi[eé]{1,2}/i`, force `verdict="a_risque"` quel que soit `preEngine.verdict`. Double défense serveur (`conclusion.ts`) + client (`AnalysisResult.tsx:effectiveScore`).
  - **5 wordings contextuels hard block** (V3.5.8 `conclusion.ts:1419`) : ne JAMAIS retomber sur le générique "entreprise radiée ou paiement suspect" — chaque flag a son wording dédié (`company_status`, `acompte_cumule_excessif`, `absence_assurance`, `siret_invalide`, `paiement_cash_suspect`, `iban_suspect`).
  - **Acompte cumulé = étapes pré-prestation UNIQUEMENT** (V3.5.9 `score.ts`) : set `PRE_PRESTATION_ETAPES = { signature, demarrage, livraison_materiaux }`. Les jalons d'avancement (`intermediaire`, `revue_chantier`, `fin_travaux`) sont EXCLUS car ils correspondent à de la valeur déjà délivrée. Ne JAMAIS revenir à `etape !== "reception"` (le bug V3.1).
  - **3 gardes sémantiques matcher vectoriel** (V3.5.9 `market-matcher-vectorial.ts`) : `hasLexicalOverlap()` (0 token en commun → rejet), `isSupplyVsLaborMismatch()` (fourniture vs pose antonymes → rejet), `isImplausiblyHighRatio()` (devis > 8× catalogue max → rejet). Parcours top-5 candidats, garde le premier qui passe les 3 gardes.
  - **Filtre lignes titre de section** (V3.5.10 `extract.ts` post-RECAP_PATTERNS) : pour chaque ligne L avec `qty=1/null` et `montant ≥ 100€`, si Σ(L_{i+1}..L_{i+K}) ≈ L.montant (tolérance 5€ ou 2%) avec K ∈ [2, 6] enfants → L est un titre de section hiérarchique (N) dont le total = sous-lignes (N.M) → DROP. Nécessaire avec le pipeline vectoriel V3.5.0 (1 ligne = 1 groupe) car V3.4.25 (qui opérait sur le groupement V3.6) ne kicke plus.
  - **Classification `low_confidence_match`** (V3.5.11 `quoteGlobalAnalysis.ts:classifyRowEnriched`) : si `vectorial.confidence !== "high"` (similarity < 0.85) ET ratio devis/marché < 2.0 → anomalie/survalue downgradée vers `low_confidence_match`. UI : badge gris "⚪ Comparaison incertaine" au lieu de "🔴 Anomalie marché". Compté dans `nbNormal` pour ne pas polluer le verdict global. **Anomalies franches** (ratio ≥ 2× max marché) restent rouge même en medium confidence — un ratio 8× ne peut pas être expliqué par un mauvais matching.
  - **Audit log fire-and-forget** (V3.5.11 `match-audit-log` table + `matchSingleLineVectorial`) : chaque match (high/medium/low/no_match) écrit dans `match_audit_log` avec description, top-5 candidats, rejected_reasons, engine_version. Permet rétro-analyse + calibration des seuils confidence + dataset gold standard pour Phase 2 (taxonomie hiérarchique, plan dormant `docs/plans/2026-06-09-taxonomie-hierarchique-anti-hallucination.md`). Ne JAMAIS bloquer le pipeline si l'insert échoue.
  - **Filtre matchs hallucinés serveur ET client** (V3.4.24 + V3.4.28) : `devis_total > 8 × theoreticalMaxHT` (groupes inventés) ET `devisTotalHT < theoreticalMinHT * 0.10` (matchs absurdes). Double garde car si seul le client filtre, le serveur calcule encore le verdict sur priceData pollué.
  - **3 défenses anti-action absurde "Vérifiez Infogreffe"** (V3.4.26 + V3.4.27) : `EXTERNAL_VERIF_PATTERNS` côté serveur + règle 8bis prompt Gemini. VMD fait DÉJÀ la vérif INSEE/Pappers, ne JAMAIS demander au user de refaire le travail sur un site externe.
  - **Whitelist `typeDocument` alignée avec le prompt** (piège V3.4.21) : tout commit qui étend l'enum `type_document` dans le prompt Gemini DOIT mettre à jour le `.includes([...])` de validation côté serveur AVANT le push. Sinon le doc est silencieusement dégradé en `type='autre'` → bypass jamais déclenché.

  **Test unitaire** : `npx tsx src/lib/analyse/verdictEngine.test.ts` (39 cas, 0 régression). Cas critiques anti-régression :
  - Kern Terrassement (3 anomalies carrelage × 21% du devis) → escalade a_negocier ✓
  - Devis 48k€ + 180€ surcoût (0.4%) → reste signer (pas de faux orange) ✓
  - Entreprise "active" + prix attractif → signer ✓
  - Entreprise radiée + prix attractif → REFUSER ✓

- **TDZ (Temporal Dead Zone) dans les edge functions et composants React** : tout `const`/`let` déclaré APRÈS son utilisation dans le même scope → `ReferenceError: Cannot access 'X' before initialization`. En prod, Vite renomme les variables → message illisible ("Cannot access 'G' before initialization"). Trois cas vécus : (1) `effectiveScore` useMemo référençant une variable déclarée 250 lignes plus bas dans `AnalysisResult.tsx`, (2) `isMultipleQuotes` déclaré ligne 871 utilisé ligne 672 dans `analyze-quote/index.ts`, (3) `preMajorAnomalies` déclaré dans un bloc `else` utilisé hors de ce bloc dans `conclusion.ts`. **Avant tout refacto sur ces fichiers** : vérifier l'ordre de déclaration des variables utilisées dans les useMemo et les early-exit.

- **Wording "Comptes non déposés" → "Comptes non accessibles" (2026-05-06)** : le wording accusatoire "comptes non déposés depuis X années / obligation légale" a été remplacé par "Comptes non accessibles publiquement" + contexte pédagogique (déclaration de confidentialité = procédure légale fréquente) + badge ORANGE au lieu de ROUGE. Fichiers concernés : `score.ts`, `render.ts`, `BlockEntreprise.tsx`, `entrepriseUtils.ts`. Le filtre de détection dans `entrepriseUtils.ts` cherche désormais `"comptes non accessibles"` (pas `"comptes non déposés"`).

- **verdictEngine — source de vérité unique (règle absolue, 2026-05-01)** : `src/lib/analyse/verdictEngine.ts` est le SEUL endroit où la logique de verdict est écrite. Utilisé dans `conclusion.ts` (serveur, override du verdict LLM) ET dans `AnalysisResult.tsx` (client, `effectiveScore`). **Ne jamais** écrire une logique de verdict locale dans un composant ou une route API — importer `computeVerdict`. Helpers à réutiliser : `computeMarketBounds`, `countMajorAnomalies`, `extractFlagsFromCriteria`, `extractCompanyRisk`, `extractCompanyStatusFromCriteria`, `normalizeCompanyStatus`.

- **Entreprise à risque juridique → verdict REFUSER forcé (règle absolue, 2026-05-03)** : une entreprise en cessation, liquidation, redressement judiciaire ou radiée force un verdict REFUSER **sans exception**, indépendamment du prix, des anomalies, de l'ancienneté ou du score global. Implémenté en priorité 0 dans `computeVerdict()` via le champ `company_status` de `VerdictInput` + `normalizeCompanyStatus()`. `extractCompanyStatusFromCriteria(criteres_rouges)` extrait le statut brut depuis les critères. `hard_block_reason === "company_status"` distingue ce cas du hard block classique (flags). **Ne jamais placer cette logique dans un composant ou le LLM** — uniquement dans `verdictEngine.ts`. Test unitaire : `npx tsx src/lib/analyse/verdictEngine.test.ts` (27 cas, 0 régression). Anti-régression : une entreprise "active" avec prix attractif doit toujours produire "signer".

- **effectiveScore figé si `conclusion_ia` null au chargement** (bug détecté 2026-05-01, commit `bb7a9a1`) : quand `analysis.conclusion_ia` est null (première visite, conclusion pas encore générée), `effectiveScore` se calcule à partir de `analysis.score` uniquement. Quand `ConclusionIA` génère ensuite le verdict, il ne met à jour que son propre state local — `analysis` dans le parent n'est jamais mis à jour. Fix : prop `onVerdictReady(rawJson)` dans `ConclusionIA` → `setConclusionIaLive(rawJson)` dans `AnalysisResult` → `effectiveScore` utilise `conclusionIaLive ?? analysis.conclusion_ia`. **Ne pas supprimer `onVerdictReady`** ni `conclusionIaLive`.

- **Cohérence UI V3.3.1 — 6 règles inviolables (2026-05-11)** : règles d'affichage dans `ConclusionIA.tsx` qui forment un filet de sécurité ULTIME. Même si une couche amont laisse passer une incohérence, l'UI ne peut PAS afficher simultanément un verdict positif ET un chiffre alarmiste.
  - **RÈGLE 1** : badge document (pastille header) = `conclusion_ia.verdict_global` mappé. ⚠️ **2 sets de valeurs distinctes** : mono-devis (`dans_la_norme`→VERT, `eleve_justifie`/`a_negocier`→ORANGE, `a_risque`→ROUGE) ET multi-devis (`signer`→VERT, `a_negocier`→ORANGE, `refuser`→ROUGE). Cf. piège dédié "2 jeux de valeurs distincts pour `verdict_global`" plus haut. Jamais un recompute legacy indépendant.
  - **RÈGLE 2** : interdiction du chiffre accusatoire si verdict=signer. Variable `showAccusatoryHero = hasSurcout && !isVerdictSigner` contrôle l'affichage du hero "+X €".
  - **RÈGLE 3** : le hero "+X €" en gros s'affiche UNIQUEMENT si verdict ∈ {a_negocier, ne_pas_signer}. Si verdict=signer + delta détecté → on déplace l'info en bloc soft amber discret sous le verdict (transparence sans accusation).
  - **RÈGLE 4** : si surcout > 0 ET `anomalies_count === 0` → wording "écart estimatif vs fourchettes marché" / "Comparaison globale indicative" — jamais "payé en trop".
  - **RÈGLE 5** : reasons cohérents. Dans `generateVerdictReasons` case signer, si `overprice > 0 OU wa.surcout_total > 0` mais 0 anomalie identifiée → "ℹ️ Quelques écarts estimatifs sans anomalie majeure identifiée". Plus jamais "0 poste à vérifier" + delta financier visible.
  - **RÈGLE 6** : tout composant qui affiche un score/badge/verdict doit lire la même source unique. Composants concernés : `AnalysisResult.tsx`, `ConclusionIA.tsx`, `verdictEngine.ts`, `conclusion.ts`, `scoreUtils.tsx`. `getScoreBadge` est un pure mapping affichage — sa cohérence dépend de l'input qu'on lui passe, qui doit toujours dériver de `verdict_global`/`verdict_decisionnel`.
  - **handleCopy** : le message à copier suit le wording verdict. Si signer + delta : "Écart estimatif vs marché : ~X € (indicatif, aucune anomalie majeure identifiée)". Si autre verdict : "Montant à renégocier estimé : ~X €".

- **Unités forfait françaises non reconnues** (bug détecté 2026-05-01, commit `6e9ea11`) : `"F"` et `"fft"` sont des abréviations courantes de "forfait" dans les devis BTP français. `FORFAIT_UNIT_KEYWORDS` ne contenait que le mot complet → les groupes `"Dépose carrelage 2F"` traités comme tarifs unitaires → comparaison m² invalide → fausses anomalies. Fix : ajouter `"f"`, `"fft"`, `"ff"`, `"ens"` dans `FORFAIT_UNIT_KEYWORDS` (`conclusion.ts`) et `FORFAIT_UNITS` (`market-prices.ts`).

- **Fourniture+pose vs hors-fourniture** (bug détecté 2026-05-01, commit `96fae4c`) : Gemini peut choisir `carrelage_sol_mo` (hors-fourniture) même quand les descriptions contiennent "Fourniture pose". La validation Level 1 accepte car l'identifiant existe dans le catalogue → comparaison fausse. Fix serveur dans `market-prices.ts` étape 3b-bis : si descriptions contiennent "fourniture" + "pose" et job_type se termine par `_mo` → remplace par `_fourniture_pose` si l'entrée catalogue existe. **Ne pas supprimer cette étape.**

- **Message générique "Si < 8 m² le prix est élevé…" — bool brut remplacé par score de confidence (V3.2.3, 2026-05-11)** : symptôme historique = `hasSurfaceUnitMismatch()` retournait `true` à tort sur des groupes où la surface était connue ailleurs → action "Demandez la surface" envoyée à un user qui l'avait déjà fournie → perte de crédibilité. Évolution :
  - **`extractKnownSurface(lines)`** scanne les `devis_lines` ET les descriptions : si au moins une ligne m² existe → `hasSurfaceUnitMismatch()` retourne false.
  - **`surfaceMismatchConfidence(group): number` (0-1)** dans `conclusion.ts` agrège 5 signaux convergents (label match, ≥1 description match, ≥2 descriptions match, unité explicite, absence de m² connu, qty ∈ [1,2]).
  - **Seuil `SURFACE_MISMATCH_ACTION_THRESHOLD = 0.70`** : on ne génère une action surface QUE si confidence ≥ 0.70. Cap à 2 actions max, dédupliquées par `job_type_label`. Trade-off assumé : faux négatifs (rater un mismatch réel) > faux positifs (générer une action absurde). La crédibilité passe avant l'exhaustivité.
  - **Ne pas revenir à un bool brut** : une mauvaise extraction d'unité par Gemini suffit à déclencher le message ridicule sans le seuil.

### Frontend / React

- **React hooks après conditional return (Error #310)** : dans `AnalysisResult.tsx`, les hooks (`useState`, `useRef`) doivent être déclarés AVANT tout `if (loading) return`. Sinon React voit un nombre de hooks différent entre renders → crash production.
- **Flexbox overflow** : un `flex-1` sans `min-w-0` permet aux enfants de dépasser le conteneur. Toujours ajouter `min-w-0` sur les div `flex-1` contenant du texte long.
- **`index.css` : `overflow-x` racine DOIT rester `clip`, jamais `hidden` (2026-06-11)** : `overflow-x: hidden` sur `html`/`body` casse `position: sticky` (le header GMC/VMD ne colle plus au scroll) car ça crée un conteneur de défilement ≠ viewport. `clip` tue le scroll horizontal SANS cet effet. Ne jamais repasser à `hidden` (vu : 2 blocs `@layer base` en conflit). Détail transversal : `brain/LEARNINGS.md` 2026-06-11.
- **Image/texte non-cassable dans un item grid → `min-width: 0` (grid blowout, 2026-06-11)** : un item grid (`min-width:auto` par défaut) contenant une `<img>` ou un texte non-cassable (ex. fausse barre d'URL) gonfle sa colonne au-delà de la piste → débordement à droite, **MASQUÉ par `overflow-x: clip`** donc ça ressemble à un défaut de **centrage**, pas à un overflow. Mettre `min-width:0` sur l'item. Vu sur `/beta` (fenêtres-captures décentrées sur mobile).
- **Stale closure dans setState** : dans `usePlanning.ts` (et autres hooks d'état complexe), toujours `setState(s => ...)` pour lire l'état courant dans les callbacks. Fermer sur la variable d'état donne une version figée.
- **Admin visualisant l'analyse d'un tiers → redirect home** : `AnalysisResult.tsx` filtrait `.eq("user_id", user.id)`. Si admin ouvre l'analyse d'un autre utilisateur → 0 résultats → redirect. Fix (commit `56e4100`) : vérification admin role **inline** dans `fetchAnalysis` (pas via le state async `isAdmin`), puis query sans filtre `user_id` si admin. Sur not-found en mode admin → redirect vers `/admin`, pas vers home.
- **Props manquantes dans sous-composants internes → crash prod masqué** (bug détecté 2026-05-06, commit `fcd1908`) : `ConclusionDisplay` (composant interne de `ConclusionIA`) utilisait `onCopy?.()` dans `handleCopy` sans que `onCopy` soit dans ses propres props. En dev : pas d'erreur visible (TypeScript signalait `Cannot find name 'onCopy'` mais sans bloquer). En prod (code minifié) : Vite renomme `onCopy` en `G` → `ReferenceError: Cannot access 'G' before initialization` → crash page blanche. Fix : ajouter `onCopy?: () => void` aux props de `ConclusionDisplay` + le passer depuis `ConclusionIA`. **Règle** : toujours corriger les erreurs TypeScript sur les composants d'analyse — en prod, un nom de variable manquant devient une lettre aléatoire et le message d'erreur devient illisible.

- **Cockpit `<main>` overflow — Trésorerie + Assistant + Messagerie en `overflow-hidden` (règle, 2026-05-19)** : ces 3 onglets sont des layouts pleine hauteur type appli avec scroll interne propre (sidebar de liste, scroll messages, 3 colonnes…). Ils NE DOIVENT PAS vivre dans un `<main>` `overflow-y-auto pb-32`. Piège CSS : `overflow-y: auto` + `overflow-x: visible` → le navigateur recompute `overflow-x` à `auto` → un sous-composant qui déborde d'un pixel fait apparaître une scrollbar horizontale → toute la page glisse et la sidebar sort de l'écran (cas vu sur Messagerie 2026-05-19). Tout nouvel onglet "pleine hauteur" doit rejoindre la liste `overflow-hidden` dans `ChantierCockpit.tsx`.

- **`ChantierAssistantChat size="full"` — pas de `max-h` viewport hardcodée (piège, 2026-05-19)** : l'ancien `max-h-[calc(100vh-8rem)]` devient faux dès qu'un header partagé existe au-dessus (cas du `cr-project-header` 2026-05-16) → bande vide sous le chat. Utiliser `h-full min-h-0 w-full`. Ne pas réintroduire de `max-h-[calc(...)]` sur ce conteneur.

- **Alertes IA — clic = effacer (UX, 2026-05-19)** : `AlertsPane` n'affiche QUE les alertes non lues (`visibleInsights = insights.filter(i => !i.read_by_user)`). Cliquer marque lue → sort de la liste immédiatement. L'historique reste dans le Journal. Ne pas revenir à "alerte lue grisée visible dans le panneau".

- **Récit du jour — parseur markdown léger (2026-05-19)** : `JournalChantierSection.renderDigestBody` parse `**gras**`, puces `-/*/•` rendues en chevron `›`, listes numérotées, titres, citations. **Lignes vides ignorées** (pas de `<br>` par ligne vide). Avant : rendu naïf qui laissait `*`/`**` littéraux et faisait un `<br>` par ligne vide → aération excessive. Ne pas revenir à `entry.body.split('\n').map(...)` brut.

### Astro / Vercel

- **Astro 5 `output: 'hybrid'` supprimé** : utiliser `output: 'static'` avec un adapter — les pages avec `export const prerender = false` sont rendues côté serveur automatiquement.
- **Variables d'env Vercel côté client** : seules les variables préfixées `PUBLIC_` sont exposées au client. `VITE_SUPABASE_URL` ne marche pas → `PUBLIC_SUPABASE_URL` et `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- **Fire-and-forget sur serverless ne marche pas** : Vercel coupe la fonction dès que la réponse HTTP est envoyée. Pour un side-effect critique (cache invalidation, write DB), `await` est obligatoire — sinon le write peut être perdu en plein vol.
- **CSP `connect-src` (header global dans `vercel.json`) bloque les fetch/XHR navigateur vers tout host externe non listé** : symptôme `(blocked:csp)` dans Network + `xhr.onerror` générique → on croit à une erreur réseau/CORS ou au navigateur du user, alors que c'est le site qui se bloque lui-même. Lire la **Console** ("violates ... connect-src") pour le host manquant, l'ajouter à `connect-src`, redeploy + **hard-refresh** (la CSP est figée avec le document). Hosts ajoutés pour l'import carrousel marketing : `https://*.backblazeb2.com` (PUT B2 pré-signé) + `https://marketing-render.messagingme.app`. Idem limite Vercel 4,5 Mo body → les gros uploads passent par B2 pré-signé, pas par une route Vercel.

### Supabase / DB

- **ES256 JWT et `verify_jwt`** : Supabase Auth signe les JWT avec ES256, le runtime edge function ne le supporte pas → "Invalid JWT". Solution : `verify_jwt = false` dans `config.toml`. Chaque fonction admin vérifie le rôle manuellement. ⚠️ Le flag CLI `--no-verify-jwt` n'existe plus dans les versions récentes (`unknown flag` error) — utiliser **uniquement** la config TOML. Deploy : `npx supabase functions deploy <name>` (sans flag, le CLI lit `config.toml`).
- **Flags CLI incohérents entre `db push` et `functions deploy` (piège détecté 2026-05-28)** : `npx supabase db push` accepte `--linked` (pas `--project-ref`), MAIS `npx supabase functions deploy` accepte `--project-ref` (pas `--linked`). C'est l'inverse, c'est piégeant. Commande correcte pour deploy : `npx supabase functions deploy <name> --project-ref vhrhgsqxwvouswjaiczn` OU `npx supabase functions deploy <name>` (auto-détection si projet lié). Pour `db push` : `npx supabase db push --linked`. Ne JAMAIS mixer.
- **`functions deploy` upload le code LOCAL — pas main remote (piège détecté 2026-05-23)** : `npx supabase functions deploy <name>` lit le dossier `supabase/functions/<name>/` de **ton clone local actuel**. Si tu n'as pas fait `git pull origin main` récemment, tu pousseras une version périmée. Cas vécu : flip Phase F vectorisation, `secret MARKET_MATCHER_VECTORIAL=on` set côté Supabase, MAIS code déployé daté de 2 jours avant les commits Phase C-F (donc sans la garde `VECTORIAL_MODE`). Résultat : V3.6 continue de tourner en prod silencieusement. **Symptôme diagnostique** : log `[MarketPrices] startup — vectorial_mode=X` absent côté Supabase Functions logs. **Règle** : toujours `git pull origin main` AVANT chaque `functions deploy`. Idéalement, automatiser via le workflow GitHub Action `.github/workflows/deploy-edge-functions.yml` (créé 2026-05-21) qui se déclenche sur push main qui touche `supabase/functions/**`.
- **RLS sur tables côté frontend** : les edge functions bypass RLS via `service_role_key`, mais le frontend utilise `anon key`. Si on requête une table sans policy SELECT pour `anon` depuis le client, on obtient un tableau vide **sans erreur**. Toujours vérifier qu'une policy `anon` existe.
- **RLS nouvelles tables — wrapper auth.uid()** : `auth.uid()` appelé seul = 1 éval par ligne. Toujours écrire `(select auth.uid())` dans les nouvelles policies. Voir migrations `20260226` et `20260401400000` pour les patterns corrects.
- **Planning API — batch DB** : utiliser `Promise.all` pour les UPDATE simultanés sur `lots_chantier`. Les boucles `for` séquentielles peuvent provoquer des deadlocks Postgres sous charge.
- **`lots_chantier.updated_at` ne s'auto-update pas** : pas de trigger. Si on a besoin de tracker un changement par horodatage, soit ajouter un trigger soit `update({...payload, updated_at: new Date().toISOString()})`.

### Edge functions

- **Logs — fuites de secrets** : les `catch` blocks peuvent logger des objets Error contenant des clés API ou Bearer tokens. Solution : toujours `error.message` (pas l'objet complet) + masquer avec regex `Bearer\s+[a-zA-Z0-9_.-]+` → `Bearer ***`.

- **Helper partagé `_shared/gemini-fetch.ts` (2026-05-09)** : tout nouveau call Gemini doit passer par `fetchGeminiWithRetry()` (retry 429/5xx + backoff exponentiel + jitter + timeout dur) ou `fetchWithTimeout()` (timeout sans retry). Ne pas faire de `fetch()` brut sur `generativelanguage.googleapis.com` — un 429 transitoire fait abandonner silencieusement. Exception documentée : `extract.ts` utilise un AbortController custom car chaque tentative ~40s vs budget Supabase 60s. Quand on étend l'agent-orchestrator (5 fetchs Gemini), utiliser `maxAttempts: 2` max pour respecter le budget time par tour.

- **Toujours sanitize les sorties LLM avant injection HTML** (2026-05-09) : tout `dangerouslySetInnerHTML` qui affiche du contenu généré par un LLM (Gemini agent, chat, suggestions) DOIT passer par `sanitizeForRender()` de `@/lib/blog/blogUtils` (DOMPurify allowlist-based). Vu : `ScreenAmeliorations.tsx`. Sans ça, un LLM jailbreaké ou un prompt injection peut produire `<script>` ou des handlers `onerror`. Idem pour les contenus externes non maîtrisés (ex: `body_html` d'emails entrants SendGrid → sanitize obligatoire).

- **Types info-only exclus du panneau Alertes — liste ET compteur (règle, 2026-05-10, étendu 2026-05-17)** : le panneau Alertes IA + le badge sidebar `assistant` + le badge FAB ne montrent QUE les `agent_insights` actionnables. **3 types sont exclus** : `digest` (résumé quotidien — visible dans Journal), `conversation_summary` (résumé de run : "Aucun nouveau message", "Digest du soir" — ce n'est pas une alerte), `lot_status_change` (changement statut — info). Implémenté dans `src/pages/api/chantier/[id]/agent-insights.ts` via `.not('type', 'in', '(digest,conversation_summary,lot_status_change)')` sur le `countRes` **ET sur la liste** (quand aucun `type` précis n'est demandé en query param). Avant le 2026-05-17 la liste affichait ces 3 types — Julien a demandé de les retirer (« c'est pas des alertes »). **Si on ajoute un nouveau type "info-only"** : l'ajouter aux deux exclusions.

- **Un seul agent IA cockpit — `agent-orchestrator` (règle absolue, 2026-05-10)** : tous les chats agent du cockpit chantier (onglet Assistant `AssistantTriPane` + widget `AssistantWidget` FAB+bulle sur la home) appellent `/api/chantier/[id]/assistant/message` qui délègue à l'edge function `agent-orchestrator` (Gemini 2.5-flash, function calling, peut prendre des actions). **Ne jamais réintroduire** un endpoint chat parallèle type `/api/chantier/chat` (le legacy "Maître d'œuvre" Gemini 2.0-flash, supprimé le 2026-05-10) — ça crée 2 historiques disjoints, 2 personas IA distincts, et plante l'UX. La table `chantier_assistant_messages` est la **source unique** de l'historique. Le widget homepage et l'onglet Assistant lisent/écrivent dans la même thread → cohérence par construction.

- **Rate limit emails sortants — 5/contact/24h enforcé côté API ET agent** (2026-05-09) : le cap est appliqué à la fois dans `src/pages/api/chantier/[id]/messages.ts` (avant INSERT) ET dans `supabase/functions/agent-orchestrator/tools/comm.ts:252-267` (avant l'appel API). Source unique de vérité = `chantier_messages` (count outbound sur 24h). Ne jamais ajouter une nouvelle voie d'envoi qui bypass ce check — sinon boucle agent / clic excessif user → spam. Si on ajoute un canal alternatif (web push, autre email provider), répliquer le check en amont.

- **`order ascending + limit` sur une table de conversation = anti-pattern (bug détecté 2026-05-17)** : sur `chantier_assistant_messages`, faire `.order('created_at', { ascending: true }).limit(N)` renvoie les **N plus ANCIENS** messages. Sur un thread > N, les échanges récents sont coupés → le user voit sa conversation « s'effacer » au rechargement, ET l'agent reçoit un historique périmé (jamais le contexte récent) donc « ne garde pas la trace ». **Toujours** `order descending + limit + reverse` pour récupérer les N plus récents en ordre chronologique. Fix appliqué dans `thread.ts` (limit 100) et `assistant/message.ts` (limit 40). Le webhook whapi (`whapi.ts:334`) faisait déjà correctement `descending + reverse` — c'était le bon pattern de référence.

- **Téléphone du propriétaire = `user_metadata.phone`, PAS `user.phone` (bug détecté 2026-05-17)** : le champ natif `auth.users.phone` n'est rempli que par l'auth SMS (jamais utilisée ici). Le numéro saisi dans Settings va dans `raw_user_meta_data.phone`. `context.ts` lisait uniquement `ownerData.user.phone` → `ownerPhone` toujours null → les messages WhatsApp du propriétaire (canal owner) étaient traités comme « numéro inconnu » par l'agent. Fix : lire `user_metadata?.phone ?? user.phone`. Tout code qui résout le téléphone d'un user doit faire ce fallback (cf. `getClientPhone` dans `whatsapp.ts` qui le faisait déjà correctement).

- **Envoi WhatsApp = TOUJOURS via un groupe `@g.us`, jamais en 1-à-1 (règle absolue, 2026-05-17)** : whapi refuse l'envoi à un numéro individuel (`33...@s.whatsapp.net`) → `401 "need channel authorization for send message"`. De plus le webhook whapi ne capte les messages entrants que depuis des groupes (`@g.us`) — un 1-à-1 ne serait jamais lu en retour. `send_whatsapp_message` a un garde-fou qui rejette tout `to` non-`@g.us`. Pour écrire à un contact, l'agent utilise `send_whatsapp_to_contact` (résout le contact → groupe existant via `group_jid` OU crée un groupe dédié à 3 via `create_dedicated`). `list_artisan_whatsapp_targets` liste les groupes existants d'un contact pour que l'agent propose le choix du canal. Ne jamais réintroduire l'option d'envoi à un numéro individuel.

- **Cohérence photo ↔ lot — edge function `photo-coherence-check` (2026-05-17)** : analyse l'**IMAGE** de la photo via Gemini Vision et la compare au lot affecté. Si incohérent → insight `risk_detected` avec `source_event.check = 'photo_lot_coherence'`, **visible uniquement dans le panneau Alertes IA** — alerte silencieuse, AUCUN WhatsApp ni message conversation (choix produit explicite de Julien). Déclenchée par `wa-photo-describe` (arrivée d'une photo dont le lot vient du hint numéro, sans caption mismatch) et par `PATCH documents/[docId]` (réaffectation manuelle d'une photo). Points clés :
  - **Modèle `gemini-2.0-flash`** (multimodal, PAS 2.5-flash) : 2.5-flash consomme le budget tokens en thinking et tronque le JSON → `parse_failed`. Cf. piège Gemini.
  - **Ré-analyse TOUJOURS l'image**, jamais la `vision_description` stockée — celle-ci peut être absente ou être le placeholder d'échec `"Photo WhatsApp (description automatique indisponible)"`. La description fraîche est ré-enregistrée au passage (heal).
  - **Photos exclues du contrôle par mots-clés** dans `PATCH documents/[docId]` (`updated.document_type !== 'photo'`) : pour les photos seul le contrôle image fait foi (le nom de fichier est souvent générique).
  - **`photo-coherence-check` est le SEUL gestionnaire des insights `photo_lot_coherence`** : il les dismiss puis ré-insère lui-même → l'auto-dismiss du PATCH les exclut via `.neq('source_event->>check', 'photo_lot_coherence')`.
  - Le ping WhatsApp proactif de l'ancien caption-mismatch a été retiré — toutes les alertes de cohérence photo passent par les Alertes IA.
  - `AssistantTriPane` : le panneau Alertes IA poll désormais toutes les 20 s (visibility-aware) — avant, `useAgentInsights` ne fetchait qu'au mount, une alerte créée serveur restait invisible jusqu'à un refresh manuel.

- **Journal de chantier — récit + timeline (2026-05-17)** : la journée du Journal est en 2 blocs. **Récit** = digest narratif IA (`chantier_journal.body`) — le digest 19h ne contient PLUS le pied-de-page « Décisions/Alertes » (retiré de `index.ts`). **Timeline** = endpoint `GET /journal/timeline?from=&to=` qui agrège 4 sources : `chantier_activity` (changements de statut) + `documents_chantier.created_at` (dépôts) + `agent_insights` (alertes, types actionnables) + `chantier_assistant_messages.tool_calls` (décisions IA). **Anti-doublon** : les tools de statut (`update_lot_status`, `update_devis_statut`, `mark_lot_completed`) sont exclus de l'extraction des décisions IA car déjà tracés dans `chantier_activity`. Les messages WhatsApp individuels ne sont JAMAIS dans la timeline.
  - `chantier_activity` : table d'événements horodatés, alimentée par le helper `logChantierActivity()` (`apiHelpers.ts`, insert via service_role). Instrumenté dans `documents/[docId]` PATCH (devis/facture statut), `lots` PATCH (statut lot), et `planning` PATCH (décalages structurels — durées, délais, dépendances, dates ; ajouté 2026-05-19, skippe le recompact pur). `actor` = `agent` si appel via `X-Agent-Key`, sinon `user`. **Si tu ajoutes une route qui change un statut, appelle `logChantierActivity`** sinon l'événement manque dans la timeline.
  - Export PDF (jsPDF) + Excel/CSV via `src/lib/chantier/journalExport.ts` — jour affiché ou plage. ⚠️ jsPDF encode en WinAnsi : `pdfSafe()` retire les caractères hors Latin-1 (flèches, emoji) sinon charabia dans le PDF.

- **Dédup `agent_insights` par identité stable (règle absolue, 2026-05-19)** : `agent-checks` (cron) ET `POST /api/chantier/[id]/agent-insights` dédupliquent par identité de la condition — `source_event.check` + entité (`lot_id` / `payment_event_id` / `document_id`) côté agent-checks ; `titre` côté POST pour `log_insight` (qui passe `source_event:{}` vide). **PAS de fenêtre de temps** sur les types alerte : une condition qui persiste = UNE alerte refresh in-place. Si `body` OU `severity` change → `read_by_user=false` + `created_at=now()` → re-notification (ex: « 2 factures sans preuve » → « 3 factures »). Sinon refresh silencieux, flags intacts. Fenêtre 24h gardée UNIQUEMENT pour types info (`digest`, `conversation_summary`, `lot_status_change`). Ne JAMAIS revenir à une dédup-par-titre+window pour alertes — c'était le bug "alerte revient tous les jours" (avant 2026-05-18).

- **Confirmation "oui" → `endsWith("?")` (règle, 2026-05-19)** : dans `handleInteractive`, `assistantProposedAction` se déclenche dès que le dernier message de l'IA finit par `?` (signal le plus universel d'une question/proposition), pas seulement sur les patterns d'action étroits. Couplé à un `userMessageForLLM` étoffé (« oui — je confirme. Exécute… ») qui contourne le bug content-vide de gemini-2.5-flash sur message court. Ne JAMAIS resserrer ce déclencheur — la version étroite ratait « tu veux que j'envoie un message ? » → user dit « oui » → IA répondait « je n'ai pas saisi ta demande ».

- **WhatsApp groupe vs contact — 2 cas distincts (règle absolue, 2026-05-19)** : si l'utilisateur désigne un GROUPE par son nom (« envoie dans Groupe principal ») → `list_chantier_groups` → `send_whatsapp_message(to=JID)` directement, AUCUNE recherche de contact (le destinataire est forcément membre du groupe — l'owner l'y a ajouté). Si l'utilisateur nomme une PERSONNE sans préciser le canal → ancien protocole `list_artisan_whatsapp_targets` / `send_whatsapp_to_contact`. **Filet code** : `send_whatsapp_to_contact` en mode `group_jid` ne hard-fail PLUS si le contact est absent de `contacts_chantier` — seul le groupe doit appartenir au chantier. Le mode `create_dedicated` continue d'exiger un contact valide (besoin du téléphone). Double couverture du bug "contact introuvable" : prompt + code.

- **`request_clarification` neutralisé + retiré du schéma (règle absolue, 2026-05-19)** : un participant d'un groupe WhatsApp est forcément quelqu'un que le propriétaire a ajouté — ce n'est JAMAIS un inconnu. Le tool ne crée plus ni tâche urgente « Identifier le contact » ni alerte « numéro inconnu » (handler no-op). Schéma retiré de `BATCH_SCHEMAS` → Gemini ne peut plus l'appeler (plus fiable qu'une consigne de prompt). Ne JAMAIS réintroduire ni le tool dans le schéma ni la règle « cas D = numéro inconnu » dans le prompt — c'était le bug "identifier le contact <num du user>" qui revenait au digest.

- **Digest 19h n'écrit plus dans `chantier_assistant_messages` (2026-05-19)** : il polluait le fil de conversation de l'onglet Assistant. Il vit désormais UNIQUEMENT dans `chantier_journal` (Récit du jour) + le canal WhatsApp privé. Ne pas réintroduire l'insert (autour des lignes ~190-205 d'`agent-orchestrator/index.ts`).

- **Audit agent IA — outils ajoutés + décisions design (2026-05-19)** :
  - `get_chantier_data` nouveaux `query_type` : `list_tasks` (tâches avec id) + `list_payment_events` (échéancier — anti-doublon `add_payment_event`).
  - `list_documents` enrichi : `montant`, `montant_paye`, `devis_statut`, `facture_statut`, `depense_type`, `parent_devis_id`, `avenant_motif` → identification fiable des devis pour `update_devis_statut` / `register_avenant`.
  - `complete_task` accepte `task_id` (UUID, matching fiable) ; fallback `titre` conservé pour rétro-compat.
  - `register_payment` re-fetch frais (`montant`, `montant_paye`, `facture_statut`) juste avant le write → fenêtre de race réduite ~100× + garde `already_paid` si facture soldée entre-temps. **PAS atomique strict** — si un jour collision constatée, faire une RPC SQL `apply_payment_atomic`.
  - **Décisions délibérées (ne PAS « réparer »)** :
    - **`register_avenant` continue d'écrire en direct dans `documents_chantier`** (pas via route API). L'avenant apparaît déjà au Journal (created_at + tool_call), ownership validé dans le tool. Le rerouter = risque sans gain fonctionnel.
    - **Contexte agent figé en cours de run** : non corrigé. Mitigé par construction — chaque tool planning RENVOIE l'état recalculé dans son résultat, donc l'agent voit du frais pour le tool suivant.

### Multi-devis — règles d'architecture (2026-05-04)

- **RÈGLE ABSOLUE : un PDF multi-artisans = N analyses indépendantes.** Jamais de mélange de lignes entre artisans, jamais de verdict calculé sur des données croisées.

- **`attributeGroupsToSegments` — matching STRICT 3 niveaux** (ne pas revenir au fuzzy) :
  - Niveau 1 : exact match `normalizeStrict(devis_line.description)` = `normalizeStrict(seg.lignes.libelle)` — la description ET le libellé viennent de la même extraction Gemini, doivent être identiques.
  - Niveau 2 : fallback `lot_type` du groupe vs `lot_type` du segment.
  - Niveau 3 : fallback proportionnel (segment le plus volumineux) + warning.
  - INTERDIT : scoring probabiliste, token-overlap — supprimé le 2026-05-04.
  - En cas d'ambiguïté : log `[MultiDevis] WARN` + assigne au premier gagnant (pas de drop silencieux).

- **`computeGlobalFromSegments` — delta sur segments avec données marché uniquement** : `overprice_total` et `overprice_pct` ne comptent que les segments avec `has_market_data = true`. `total_devis_ht` reste Σ ALL pour information. Ne jamais revenir à l'ancienne formule qui gonflait le surcoût avec les segments hors-catalogue.

- **`conclusion.ts` mode multi — source de vérité = `global_metrics`** : quand `isMultipleQuotes = true`, le `preEngine` est construit depuis `global_metrics` pré-calculé (pas depuis `computeVerdict` appliqué sur `priceData` mélangé). Le bloc `multiDevisBlock` injecté dans le prompt liste les verdicts par artisan + contraintes LLM strictes : INTERDIT "cohérent" si ≥1 artisan à risque.

- **`AnalysisResult.tsx` — `effectiveScore` multi lit `verdict_global` directement** : mapping inline `verdict_global → VERT/ORANGE/ROUGE`, jamais via `score_legacy` (champ intermédiaire supprimé de la chaîne critique).

- **Logs de diagnostic** : en cas de doute sur l'attribution, chercher `[MultiDevis]` dans Supabase Dashboard → Functions → analyze-quote. `WARN` = fallback déclenché (problème de matching). Absence de WARN = matching niveau 1 exact pour tous les groupes.

### Multi-domaine GMC ↔ VMD — pièges auth

- **Loop auth GMC↔VMD (bug corrigé 2026-05-08)** : `postLoginRedirect.ts` appelait `hasGmcAccess()` même quand `currentBrand === 'gmc'`. Si l'email n'était pas allowlisté → `targetBrand = 'vmd'` → SSO handoff *inverse* → user renvoyé sur vmd.fr → clique "Mon Chantier" → retour sur gmc.fr landing → boucle. **Fix** : si `currentBrand === 'gmc'` → toujours `window.location.href = '/mon-chantier'` sans aucune vérification allowlist. La logique allowlist ne s'applique que depuis vmd.fr. **Règle** : ne jamais remettre de `hasGmcAccess()` dans la branche `currentBrand === 'gmc'` de ce helper.

- **Header VMD "Mon Chantier" → href vers landing (bug corrigé 2026-05-08)** : les deux liens "Mon Chantier" pointaient vers `gerermonchantier.fr/` (landing) au lieu de `gerermonchantier.fr/mon-chantier`. Un user connecté qui ne passait pas le check allowlist (dynamic import échouant silencieusement) se retrouvait sur la landing, pas sur son espace. Fix : href hardcodé vers `/mon-chantier` + click handler sans allowlist (SSO handoff pour tout user connecté). **Règle** : ne jamais remettre de vérification `hasGmcAccess` dans le click handler "Mon Chantier" du Header VMD — le contrôle d'accès vit côté serveur sur gmc.fr.

- **`GoogleSignInButton` param `?redirect=` vs `?next=` (bug corrigé 2026-05-08)** : `GoogleSignInButton` construisait le callback URL avec `callbackUrl.searchParams.set("redirect", ...)` → URL générée = `/auth/callback?redirect=/mon-chantier`. La whitelist Supabase est configurée avec le pattern `?next=*`. `?redirect=` ≠ `?next=*` → Supabase rejetait le `redirectTo` silencieusement et renvoyait sur la Site URL (vmd.fr) au lieu de gmc.fr. Fix : param renommé `"next"` dans `GoogleSignInButton.tsx`. `auth/callback.astro` lit déjà les deux params (`next` en priorité, `redirect` en fallback). Fix complémentaire dans `Login.tsx` : sur gmc.fr sans `?redirect=` explicite dans l'URL, `redirectAfter` est défaulté à `"/mon-chantier"` pour garantir la présence de `?next=` dans le callback URL et matcher le pattern Supabase. **Règle** : le callback URL pour Google OAuth doit toujours contenir `?next=` pour matcher la whitelist Supabase. Ne jamais utiliser `?redirect=` comme seul param dans `redirectTo`.

### Module Chantier — pièges spécifiques

- **`contacts_chantier` colonnes** : la colonne téléphone est `telephone` (pas `phone`), le rôle est `role` (pas `metier`). `context.ts` agent doit utiliser `c.telephone` et `c.role`.
- **`paymentEventsRes` clé** : GET `/payment-events` retourne `{ payment_events: [...] }`, pas `{ data: [...] }`. Toujours accéder via `res?.payment_events`.
- **`depense_type` ticket/achat/frais = toujours payé** : `ticket_caisse`, `achat_materiaux`, `frais` sont comptés en `paye` dans `budget.ts` quelle que soit `facture_statut`. UI : badge "Payé" statique sans dropdown. Pas d'alerte "Devis manquant" pour ces types (constante `SANS_DEVIS_TYPES` dans `BudgetTab.tsx`). Ne jamais les faire passer par le flux `a_payer`.
- **`a_payer` réconcilié — règle absolue (2026-05-17)** : dans `budget.ts`, le reste à payer d'une facture `recue`/`payee_partiellement` = `Math.max(0, montant - paye)` où `paye` est réconcilié (paiements Échéancier `payment_events` inclus). **Ne JAMAIS revenir à `recue → a_payer = montant`** : une facture `recue` soldée via l'Échéancier (statut jamais repassé à `payee`) compterait encore en entier → faux "à régler" + double-comptage dans Flux certains. Le bug existe à DEUX endroits : `buildArtisanGroups` ET l'agrégation principale — corriger les deux ensemble. `ticket_caisse`/`frais` (`alwaysPaid`) → `a_payer = 0`. L'API expose `a_payer` par facture. Côté accueil, le compteur "à régler" + l'alerte dérivent de cette donnée réconciliée (jamais de `facture_statut` brut) — `ChantierCockpit` fetch `/budget` → `factureActions`, passe `BudgetSnapshot` à `DashboardHome`. Le filtre BudgetTab "À payer" (`unpaid`) inclut les factures partielles (`r.lot.totaux.a_payer > 0`), cohérent avec le camembert.
- **Planning — `date_fin_souhaitee` objectif persistant (2026-05-17)** : `chantiers.date_fin_souhaitee` = objectif de livraison (saisi à la genèse OU via "Modifier la date de fin" du planning, qui le persiste désormais). `date_debut_chantier` = ancre du CPM (toujours présente, calculée à rebours via `computeStartDateFromEnd` si on a démarré par une date de fin). Réception **estimée** = `max(lot.date_fin)`, dérivée, jamais stockée. L'API planning gère/renvoie `dateFinSouhaitee` (GET + PATCH) ; `usePlanning` l'expose ; le header planning affiche réception estimée + badge dépassement vs objectif.
- **Sous-planning avancé — pièges (premium, 2026-06-08)** :
  - **Le lot reste l'unité de budget/devis/statut/intervenant.** La sous-phase n'affine QUE l'ordonnancement (`lot_subphases`). NE JAMAIS descendre budget/facture/statut au niveau sous-phase sans repenser tout le blast radius (budget, accueil, agent-checks, agent) — c'est précisément ce que l'Option A évite. `lot.date_fin` reste rempli (= max des sous-phases) → accueil/bulle planning/`estimatedEnd` marchent sans modif.
  - **`recomputeChantierDates` est subphase-aware et behavior-preserving** : sans sous-phase il reproduit EXACTEMENT l'ancien recompute (`computePlanningDates` + estimate). Ne jamais remettre un recompute inline lot-only dans `planning.ts` — passer par le helper.
  - **`forwardPass` est le coeur CPM UNIQUE** (partagé `computePlanningDates` + `computeAdvancedPlanning`). `buildAdvancedNodeGraph` = unique source de l'éclatement entrée/sortie d'un lot conteneur (réutilisé par le calcul ET la garde anti-cycle `wouldCreateCycle`). Ne pas dupliquer.
  - **Convention d'arête `from`/`to` INVERSE du temps** : `from` = dépendant (successeur), `to` = prédécesseur (se termine AVANT). Documentée sur `PlanningEdge`. Variables logiques nommées `dependent`/`dependency`. Source classique de bugs si inversé.
  - **`PlanningEdgeRow` (= `PlanningEdge` + `id`)** : les arêtes renvoyées par l'API portent leur `id` ; le hook les type `PlanningEdgeRow[]` pour permettre la suppression. Ne pas retomber sur `PlanningEdge[]` (perte de l'id → impossible de supprimer).
  - **Ne JAMAIS faire passer les sous-phases par `inferDefaultPredecessors`** (heuristique sur le nom → deps auto-circulaires).
  - **Gate premium = serveur (`requireAdvancedPlanning`)** sur TOUTES les écritures sous-phase ; le hook `useAdvancedPlanningAccess` + le toggle ne sont QUE cosmétiques. Habilités V1 = admin + allowlist GMC ; 1 seul `TODO` dans `getAdvancedPlanningAccess` pour brancher le tier d'abonnement.
  - **Vue avancée = MÊME Gantt** (`PlanningTimeline` avec prop `advanced`), PAS un composant séparé (l'ancienne `SubPlanningView` % a été supprimée — Option B). Tout le rendu avancé (sous-barres, bouton découper, panneau) est derrière `if (advanced)` → simplifié byte-identique. D&D des sous-phases = `SubphaseBar` : **horizontal = décalage (délai), vertical sur une autre sous-phase = créer une dépendance** (cross-métier inclus, garde anti-cycle serveur 409 → toast). Alignement gauche/droite garanti par construction (même `laneSubphases`, mêmes hauteurs `LOT_ROW_HEIGHT`/`SUBPHASE_ROW_HEIGHT`). Limites V1 : pas d'optimisme sur la création de dépendance (refetch ~400ms), pas de drag inter-lanes des sous-phases. Plan : `docs/plans/2026-06-08-sous-planning-dnd-option-B.md`.
  - **Tests à relancer avant toute modif** : `npx tsx src/lib/chantier/planningUtils.subphases.test.ts` (56) + `npx tsx src/lib/auth/advancedPlanningAccess.test.ts` (10). Le test d'équivalence "zéro sous-phase = `computePlanningDates`" + le verrou de comportement protègent contre une régression du refactor `forwardPass`.
- **`tools.ts` priorite enum** : doit être `["urgent", "important", "normal"]` — jamais `"low"` (rejeté silencieusement par `taches.ts`).
- **WhatsApp messages — `group_id TEXT`** : `chantier_whatsapp_messages.group_id` est un TEXT stockant le JID brut (ex: `120363xxxxx@g.us`), **pas** un UUID FK vers `chantier_whatsapp_groups`. Intentionnel — la table messages est antérieure à la table groups. Ne pas migrer en UUID FK sans plan de migration des données.
- **Planning D&D — ne pas reset `delai_avant_jours=0`** : la position visuelle du drag DOIT être convertie en `delai_avant_jours` (jours ouvrés depuis le predecessor.date_fin OU startDate). Sinon le serveur CPM recompute à zéro et la modif visuelle ne persiste pas. Cf. `PlanningTimeline.handleLotMoveWithLane`.
- **`arrange_lot` legacy → modèle DAG** : `arrange_lot` doit écrire dans `lot_dependencies` (pas seulement `ordre_planning`) et forcer `lane_index = ref.lane_index` pour `chain_after`. Sinon le CPM ignore la nouvelle structure et la lane visuelle saute en haut.
- **Schedule reminder DST** : ne pas demander à l'agent de calculer l'UTC. Toujours `due_at_local + tz` (Europe/Paris) côté agent → conversion serveur via `Intl.DateTimeFormat`. Sinon Gemini se trompe d'1h aux changements d'heure.
- **Token cap = completion_tokens** (pas total_tokens) : `total_tokens` cumule prompt+completion et le prompt grossit à chaque round → triple-comptage. Cap sur `completion_tokens` uniquement (cf. `index.ts` agent-orchestrator).
- **Pending decision flow** : `notify_owner_for_decision` stocke l'`expected_action`, `resolve_pending_decision` l'exécute via dispatcher injecté (pas de re-confirmation 2-tours pour cette exécution — bypass volontaire car owner a déjà confirmé via WhatsApp privé).
- **`agent-scheduled-tick` atomic claim** : RPC `claim_pending_reminders` avec `FOR UPDATE SKIP LOCKED`. Sans ça, 2 ticks concurrents = double envoi WhatsApp. Status passe `pending → firing → fired/failed`.
- **`agent-scheduled-tick` auth = X-Cron-Secret, PAS Bearer** : le vault stocke `service_role_key` au format publishable (`sb_secret_*`, 41 chars) alors que l'edge function lit `SUPABASE_SERVICE_ROLE_KEY` env qui est le JWT (`eyJ...`, ~200 chars). Mismatch silencieux → 403 systématique. Solution : secret dédié `AGENT_CRON_SECRET` (env edge fn + vault `agent_cron_secret`), header `X-Cron-Secret`. Test runtime : trigger manual `net.http_post` + check `_http_response.status_code = 200`.
- **`notify_owner_for_decision` doit être BATCH-safe** : sinon le workflow "détection décision artisan" en mode morning ne s'enclenche jamais (les ACTION tools sont bloqués en morning/evening par le guard `ACTION_TOOL_NAMES`). C'est une notif PRIVÉE au owner (pas un envoi tiers irréversible) → légitime en BATCH.
- **BudgetTab — bouton "Paiement" sans facture doit passer `primaryDocumentId`** (bug corrigé 2026-05-02, commit `531ed07`) : le bouton "Paiement" pour les artisans sans facture ne passait pas `primaryDocumentId` → `VersementsDrawer.addVersement()` utilisait `manuel: true` → cashflow_extras sans source_id → Budget API filtre `.not('source_id', 'is', null)` → versements invisibles. Règle : toujours passer `primaryDocumentId: artisan.devis[0]?.id` + `primaryDocumentType: 'devis'` dans `setVersementsDrawer` pour ce cas.
- **VersementsDrawer — `cashflow_extras` sans `source_id` ne s'affichent PAS dans le Budget** : `payment_events_v` branche 3 expose `source_id = null` pour les cashflow_extras. Le Budget API filtre `.not('source_id', 'is', null)` → ils sont exclus de `eventsPayeByDoc`. Pour qu'un versement impacte la colonne "Payé" du Budget, il doit être dans `cashflow_terms` du document source (branche 2). Règle : pour les versements liés à un devis ou une facture, toujours appender dans `cashflow_terms` (via le variant `addToDocument: true` du POST payment-events). Le `manuel: true` (cashflow_extras) = mouvements flottants (apport, crédit) sans document source.

- **Saisie de dépenses unifiée — 1 seul chemin d'écriture (règle absolue, 2026-05-09)** : depuis `dfda27c`, **toute dépense passe par `DepenseRapideModal`** (`/api/chantier/[id]/documents/depense-rapide`). Cette modal crée une vraie ligne `documents_chantier` (facture + depense_type + lot_id) — visible immédiatement dans Budget, Échéancier ET Accueil. **Ne jamais réintroduire** une UI qui POSTe `manuel: true` à `/payment-events` pour créer un cashflow_extras orphelin. L'ancienne `AddDepenseModal` d'Echeancier (qui faisait ça) a été supprimée. Les deux entry points actuels (bouton "+ Dépense" du BudgetTab ActionBar et bouton "+ Dépense" du panneau Sorties Échéancier) ouvrent **la même modal**. Synchro temps réel via custom event `chantierBudgetChanged` : BudgetTab + Echeancier dispatchent l'event après chaque load + écoutent l'event pour rafraîchir → la dépense apparaît partout sans F5.

- **Acomptes sur devis non signés → `acompte_pending`, exclus du KPI Décaissé (règle absolue, 2026-05-09)** : dans `budget.ts`, si on verse un acompte sur un devis `en_cours`/`recu`, le montant alimente `bucket.totaux.acompte_pending` (pas `acompte`). Le KPI Décaissé du BudgetKpiDashboard utilise `paye + acompte` uniquement → ne se retrouve pas gonflé par des devis non engagés. Une bannière orange dédiée "X € versés sur des devis non signés — signez le devis pour les inclure" notifie l'utilisateur sans cacher l'argent. **Ne jamais merger `acompte_pending` dans `acompte`** : sans cette séparation, le ratio Budget cible / Décaissé devient incohérent (ex: 119% du budget alors que les engagements signés sont bien plus faibles, bug détecté par Julien le 2026-05-09).

- **Allocations de financement multi-source — modèle 3 niveaux (règle absolue, 2026-05-10)** : la jauge "Consommation par source" de TresorerieView (Apport / Crédit / Aides) est désormais alimentée **uniquement** par l'endpoint `GET /api/chantier/[id]/funding-consumption` (Fix #6+#7). L'algorithme à 3 niveaux par paiement, dans cet ordre :
  1. **`cashflow_term.allocations: [{entree_id, amount}, ...]`** = autorité (Fix #6 split multi-source). Stocké dans `documents_chantier.cashflow_terms[i]` JSONB.
  2. **`cashflow_term.funding_source_id`** legacy mono = traité comme 1 allocation 100% (Fix #5, compat-rétro).
  3. **Auto-FIFO chronologique** Apport → Crédit → Aides (Fix #7) si rien d'explicite. Si dépassement de toutes les enveloppes → tout en surplus apport (jauge >100%).
  
  **Ne jamais** stocker `allocations` ET `funding_source_id` ensemble — `allocations` prime. **Ne jamais** réécrire la logique de consommation côté client (ancien `useEntreeConsumption` qui calculait depuis `funding_source_id` legacy supprimé) — un seul algo, côté serveur, testable.
  
  Endpoints qui acceptent `allocations: [...]` dans le body POST : `/documents/depense-rapide`, `/quick-expense`, `/payment-events POST addToDocument`. UI : composant `FundingAllocations` (mode simple ou toggle "Répartir entre plusieurs sources" avec validation total = montant).
  
  **Limite connue** : `cashflow_extras` (table SQL pour mouvements orphelins) n'a pas de colonne `allocations` JSONB, seulement `funding_source_id` mono. Pour splitter un extra, le réconcilier d'abord via `OrphansReconciliationModal`.
- **VersementsDrawer — loading loop sur prop instable** : `loadEvents` ne doit JAMAIS dépendre de `knownEventIds` ni `sourceIds` passés comme props, car ces tableaux sont recréés à chaque render de BudgetTab. Utiliser `useRef` pour capturer les props instables et les lire dans le callback sans les inclure en dépendance. Sans ça : chaque `onRefresh()` déclenche un re-render BudgetTab → nouveau tableau → `loadEvents` change d'identité → `useEffect` reffire → `setLoading(true)` → spinner masque le formulaire.
- **Authorization header dans les fetch chantier** : toujours `Authorization: \`Bearer ${bearer}\`` (avec le préfixe "Bearer "). Un `Authorization: bearer` (sans préfixe) retourne 401 silencieux — le `catch` vide masque l'erreur.
- **Cohérence financière — 5 chiffres clés (2026-05-07)** : le modèle mental est Budget cible → Engagé → Décaissé → À payer → Flux certains. `Décaissé = budget API totaux.paye + totaux.acompte` (PAS la somme des factures payées depuis `documents`). `À payer = budget API totaux.a_payer`. `Flux certains = Décaissé + À payer`. Ne jamais utiliser `totalPaye` (factures seulement) pour représenter le décaissé — toujours l'API budget. Cf. `FEATURES.md § 22` pour le modèle complet.
  - **Affichage harmonisé Budget ↔ Trésorerie (2026-05-09)** : les 5 chiffres apparaissent désormais dans deux composants distincts mais avec **mêmes labels et mêmes valeurs** : `BudgetKpiDashboard` (BudgetTab) et `KpiBandeauCanonique` (TresorerieView en haut, juste sous CoherenceAlertsBanner). Toute modification d'un label/calcul doit se répercuter dans les 2 composants — sinon l'utilisateur voit deux chiffres différents pour la même notion en passant d'un onglet à l'autre.

- **Statut "En litige" — friction volontaire (2026-05-09)** : dans `VersementsDrawer`, cliquer sur le bouton "En litige" ne déclenche PAS directement `onStatutChange('en_litige')`. Le clic ouvre un panel de confirmation inline (`litigeConfirmOpen` state) qui exige une raison textuelle ≥ 10 caractères avant d'appliquer le statut. La raison est gardée en mémoire locale uniquement (pas de persistance backend pour cette session — éviter de toucher l'API). Ne pas court-circuiter ce flow : le statut "en litige" engage la relation contractuelle avec l'artisan, un clic accidentel = perte de confiance.

- **`budgetReel` — source unique de vérité (2026-05-07)** : un seul chiffre, 3 couches de sync. (1) localStorage `budget_reel_${chantierId}` — prioritaire au démarrage dans BudgetTab ET ChantierCockpit. (2) Custom event `budgetReelChanged` — propagation temps réel entre composants (dispatché par TresorerieView ET BudgetTab). (3) DB double : `chantiers.budget` (via PATCH `enveloppePrevue`) ET `chantiers.metadonnees.tresoreieFinancing.budgetReel`. **Ne jamais écrire `budgetReel` dans un seul endroit** — toujours via `persistBudgetReel` (BudgetTab) ou `setCfg+syncServer` (TresorerieView) qui alimentent les deux destinations. `autoUpdateBudget: boolean` dans `FinancingConfig` — après 1ère confirmation manuelle, les dépassements flux certains > budget se corrigent automatiquement sans popup.

- **`PaymentDetailPanel` — split d'échéance (2026-05-07)** : clic sur une ligne d'échéance → panel inline avec contexte document (total/déjà payé/cette échéance), autres termes, édition montant+date+libellé. Si montant réduit → badge "Solde restant X€" + date obligatoire → PATCH terme courant + POST `addToDocument` pour le reste. **Ne pas modifier la logique de détection du split** (`remainder > 1 && newAmount < originalAmount * 0.99`) — en dessous du seuil 1€ on ne crée pas de terme fantôme.

- **`EntreeRow` édition inline (2026-05-07)** : clic sur la ligne → formulaire inline (type, libellé, montant, date, statut). `data-no-edit` sur les boutons toggle/delete pour ne pas déclencher l'édition. Libellé vide au save → fallback `SOURCE_CFG[source_type].label` (même règle que l'ajout). PATCH API `/entrees` accepte désormais `source_type` en plus des autres champs.

- **`BudgetKpiDashboard` — 4 KPIs canoniques (2026-05-08)** : Budget cible · Décaissé · À régler · À venir. Grid mobile = 2 cols, desktop = 4 cols. `À venir = max(0, devis_valides - facture)` représente ce que l'artisan va encore facturer. **Ne jamais retirer le KPI "À venir"** : sans lui, l'utilisateur n'a pas de visibilité sur les engagements signés non encore concrétisés en facture. Le bug `devisValides` undefined (ReferenceError silencieux ligne 538 du `pctDecaisse >= 100 && devisValides > 0` check) a été corrigé en déclarant explicitement `const devisValides = totaux?.devis_valides ?? 0;` en haut du composant — toujours déclarer ces alias au début, jamais inline dans le JSX.

- **`buildRow.reste` — formule défensive (2026-05-08)** : `reste = facture > 0 ? max(0, facture - totalPaye) : max(0, devis_valides - totalPaye)`. **Ne jamais revenir** à `reste = max(0, facture - totalPaye)` seul : sur un devis signé sans facture émise mais avec acompte versé, l'ancienne formule retournait 0 (le `Math.max(0, ...)` masquait l'acompte). La nouvelle formule reflète le vrai engagement restant : si pas de facture, le reste à payer = montant du devis - acomptes déjà versés.

- **V3.4.16 — Cohérence KPIs Budget : 4 bugs structurels (2026-05-18)** liés à des trous dans la logique d'agrégation. À NE PAS recréer :
  1. **Devis 100% soldé par acompte sans facture émise = statut "Payée"** : dans `BudgetTab.buildRow`, la branche `payStatut = 'paid'` exigeait `facture > 0`. Conséquence : un devis intégralement payé via acomptes restait coincé en `'partial'` (chip "Acompte" violette). Fix : ajout `else if (facture === 0 && devis_valides > 0 && totalPaye >= devis_valides) payStatut = 'paid'` AVANT la branche `partial`. **Règle** : toute condition de complétude de paiement doit considérer les 2 voies (avec ET sans facture).
  2. **Alerte dépassement budget cible (5% tolérance BTP)** : avant V3.4.16, `pctDecaisse >= 100` affichait juste "Tout soldé" en vert, même si `decaisse = 111% × effectiveReel`. Désormais flag `overBudget = decaisse > effectiveReel × 1.05` → donut rouge + sub-label "⚠️ Dépassement de +X € (Y%)" dans Décaissé ET Budget Cible. **Tolérance 5%** = arrondis BTP classiques absorbés. **Ne jamais retirer** sans alternative équivalente — c'est le seul signal visible du dépassement.
  3. **Wording "X paiements en retard — 0 € à régulariser" est interdit** (contradictoire). Dans `Echeancier.tsx` les alertes paiements retard distinguent désormais `lateTotal > 0` (alerte rouge "à régulariser") de `lateTotal === 0` (alerte ambre info "à confirmer — déjà couverts par acompte — marquez comme payé pour clore"). Cas typique : "solde à réception facture" en retard temporel mais soldé via acompte. **Si tu ajoutes un nouveau wording d'alerte avec un total et un compteur**, vérifie systématiquement le cas `total === 0 && count > 0`.
  4. **`totaux.a_venir` doit être calculé PAR ARTISAN, jamais globalement** : avant V3.4.16, `aVenir = max(0, devisValides - facture - acompte)` au niveau global. Les acomptes versés sur l'artisan A "compensaient" l'écart devis-facture de l'artisan B → soldes restants invisibles. Fix : nouveau champ `totaux.a_venir` calculé côté `budget.ts` comme **SUM par artisan sans-facture** de `bucket.artisans[].totaux.a_payer` (qui contient déjà le bon calcul `devis_valides - acompte` au niveau artisan, ligne ~127 de `buildArtisanGroups`). Front `BudgetTab.tsx:435` lit `totaux.a_venir` avec fallback sur l'ancien calcul (compat caches API). **Règle absolue** : tout chiffre "reste à payer par artisan" ne peut être calculé qu'**au niveau artisan**, jamais en soustrayant des totaux globaux qui mélangent les comptes.

- **PlanningBubble — 3 états (completed / overdue / nominal) V3.4.15+ (2026-05-18)** : la bulle Planning de l'accueil affichait toujours "Livraison estimée [date initiale]" même quand la date était dépassée → mensonge visible. Désormais `DashboardHome` calcule un `planningState` via useMemo depuis `lots + docs + planning` :
  - `completed` : tous les lots sont (a) `statut === 'termine'`/`'contrat_signe'` OU (b) ≥1 facture `payee`/`payee_partiellement`. Wording "Livré le [max(facture.created_at)]" + chip vert "✓ Terminé" + CTA "Cliquez pour confirmer la réception et clôturer le chantier".
  - `overdue` : ≥1 lot non terminé ET endDate (finSouhaitee ?? estimatedEnd) < aujourd'hui. Wording "Date initialement prévue" (factuel, pas "estimée"=mensonge) + chip ambre "🟡 À ajuster" + CTA "Cliquez pour mettre à jour la date prévue avec votre artisan".
  - `nominal` : cas standard, inchangé.
  **Règles** :
  - **AUCUNE alerte journalière "en retard de X jours"** — anxiogène et faux dans 80% des cas. Le user reste maître de la date.
  - **AUCUNE notification, AUCUN toast, AUCUN insight `agent_insights`** créé sur ces états.
  - Le compteur `weeks` "≈ N sem." n'apparaît plus que sur state="nominal" (incohérent sur completed/overdue).
  - CSS : `.cr-plan-completed` (barre verte uniforme), `.cr-plan-overdue` (barre pointillée ambre après 50%), `.cr-plan-chip.ok` (chip vert sage), `.cr-plan-chip.warn` (chip ambre), `.cr-plan-footer-invite` (ligne dashed top + couleur contextuelle).

- **`updateEndDate` ne réécrit plus `dateDebutChantier` si chantier déjà démarré (V3.4.16+, 2026-05-18)** : avant ce fix, `usePlanning.updateEndDate(newEnd)` appelait systématiquement `computeStartDateFromEnd(lots, newEnd)` qui calcule la date de début en remontant via le CPM. Sur un chantier déjà démarré (ex: démarré 31/03/2026 et user veut décaler la fin du 27/04 au 01/07), la date de début était écrasée à 04/06/2026 (= 01/07 - 27j ouvrés de durée totale) → ABERRANT. Désormais 2 branches : (a) chantier pas démarré (`startDate < today`) → comportement historique préservé ; (b) chantier déjà démarré (`startDate >= today` est faux, donc `startDate < today`) → on garde `dateDebutChantier` réel et on persiste UNIQUEMENT `dateFinSouhaitee` comme **objectif** (les dates des lots ne sont PAS recalculées). Le CPM peut produire un `estimatedEnd` différent de l'objectif — c'est OK, ça mesure l'écart objectif/réalité sans mentir sur le passé. **Règle** : toute modification de date de fin sur un chantier en cours doit préserver la date de début réelle.

- **Event `chantierPlanningChanged` pour refresh cross-écran (V3.4.16+, 2026-05-18)** : `usePlanning.patchPlanning()` dispatche désormais `window.dispatchEvent(new CustomEvent('chantierPlanningChanged', { detail: { chantierId } }))` après chaque PATCH réussi (mirroir du pattern `chantierBudgetChanged`). `DashboardHome` écoute cet event et incrémente un `planningRefreshKey` qui force le refetch du snapshot de la bulle Planning. **Sans ce dispatch**, modifier la date depuis l'onglet Planning ne mettait PAS à jour la bulle de l'accueil (sauf F5 manuel). **Règle** : tout hook qui mute des données partagées entre écrans (planning, budget, etc.) doit dispatcher un event custom. Tout consommateur cross-écran doit l'écouter via `useEffect`.

- **FeedbackModal — triggers + Trustpilot (V3.4.15+, 2026-05-18)** : 2 triggers seulement, premier gagne (`triggeredRef`) :
  - **Auto scroll ≥ 90%** (`SCROLL_BOTTOM_THRESHOLD = 0.90`) : déclenché sur le scroll de la page. Le user a parcouru toute l'analyse → moment de valeur. Seuil 90% (et pas 60% comme V3.4.13) pour éviter d'interrompre la lecture.
  - **Manuel via `openFeedback("manual_copy")`** : appelé par `onCopy` de `ConclusionIA` (clic "Copier le message pour négocier").
  - Anti-spam : `localStorage["vmdf_feedback_shown"]` TTL 7 jours.
  **Trustpilot** :
  - Le bloc Trustpilot dans `FeedbackModal` step "done" est conditionné `choice === "positive"` UNIQUEMENT (cf. ligne 316). **Jamais sur neutral/negative** (pas adapté).
  - **2 sources Trustpilot supprimées** dans `AnalysisResult.tsx` (commit `f1ffcfc`) : (a) modal popup auto 5s après chargement (trop tôt) ; (b) bandeau in-body "Votre analyse est prête 🎉" affiché systématiquement. **Ne jamais réintroduire** ces sources — le user ne doit voir Trustpilot qu'après avoir explicitement signalé une expérience positive.

- **Devis pending visibles, mais non comptés dans `devis_valides` (2026-05-08)** : depuis `a9cfe67`, `budget.ts` expose TOUS les devis (y compris `en_cours` / `recu`) au frontend. La séparation entre "engagement réel" (devis signés) et "devis en attente de signature" se fait via la condition `statut === 'valide' || statut === 'attente_facture'`. **Règle absolue** : ne jamais ré-introduire un `continue` qui drop les devis pending dans l'agrégation `lotMap`. Mais aussi : `bucket.totaux.devis_valides` ne doit être incrémenté que si `isSigned`, et `buildArtisanGroups` doit filtrer avec `isSigned()` avant la réduction. Sans ces filtres, les devis pending gonfleraient l'engagement et le KPI "À venir" deviendrait incohérent. Frontend : `BudgetTab` détecte `isFullyPending` (devis tous pending + 0 facture) → ligne en `bg-amber-50/30` + badge `Clock "À signer"`, montant grisé italique avec sous-label "non signé". Bannière en haut du tableau si `pendingDevisCount > 0`.

- **Apport personnel = résidu calculé, pas une mesure (2026-05-08)** : dans `TresorerieView`, `apport = max(0, budgetRef - creditMontant - totalAides)`. C'est un plan de financement (résidu), pas une consommation mesurée. La consommation réelle vient de `payment_events.funding_source_id` via `useEntreeConsumption`. Badge "calculé" + tooltip explicite ajoutés pour éviter la confusion. **Ne pas mélanger** ces deux notions : le plan dans la jauge de gauche, la consommation réelle dans les compteurs de droite.

---

## Règles importantes

- **Git workflow — main only** : jamais de branches `claude/<nom>-<hash>` ni de worktrees. Commit et push directement sur `main`. Ne pas utiliser `superpowers:using-git-worktrees` sur ce projet.
- **Header / Footer** existent en 2 versions : `layout/Header.tsx` (React) + `astro/Header.astro`. Toute modif doit être faite dans les **2**. **Plus le Header GMC** `gmc-landing/Header.astro` (pour gerermonchantier.fr) qui est encore une 3e variante — toute modif d'auth state visible dans les headers doit synchroniser les 3.
- **shadcn-ui** (`src/components/ui/`) : ne pas modifier manuellement (exception documentée : `button.tsx` contient `touch-manipulation` dans la base CVA).
- **types.ts** (`src/integrations/supabase/`) : auto-généré, ne pas modifier. Régénérer : `npx supabase gen types typescript --project-id vhrhgsqxwvouswjaiczn > src/integrations/supabase/types.ts`.
- **Alias** : `@/` → `src/`.
- **Interface** en français, **code** en anglais.
- **Params dynamiques** : `[id].astro` et `[slug].astro` — les composants React extraient les params de `window.location.pathname`.
- **Commandes** : `npm run dev` | `npm run build` | `npm run preview` | `npm run lint`.

- **Inscription OBLIGATOIRE pour analyser un devis (règle absolue, 2026-05-11)** : `/nouvelle-analyse` redirige vers `/inscription?returnTo=/nouvelle-analyse` si l'utilisateur n'a pas de compte permanent. **Ne JAMAIS** réintroduire un `signInAnonymously()` automatique dans `NewAnalysis.tsx` ni ailleurs dans le funnel d'analyse.
  - Contexte : entre le 02/05 et le 11/05/2026, un `signInAnonymously()` automatique avait été introduit dans `NewAnalysis.tsx` (useEffect au mount). Conséquence : 0 nouveau compte permanent enregistré pendant 9 jours alors que le site recevait du trafic. Les visiteurs analysaient gratuitement en mode anonyme et ne se convertissaient jamais en compte permanent → 0 email récolté, 0 base de relance, 0 visibilité pipeline.
  - Le hook `useAnonymousAuth` reste exposé (rétrocompat pour les comptes anonymes legacy créés entre le 02/05 et le 11/05 qui peuvent encore se convertir via `convertToPermanent` dans le PremiumGate), mais aucun composant ne déclenche `signInAnonymously()` automatiquement.
  - Côté admin : `/api/admin/users.ts` expose désormais `total_anonymous` et `anonymous_by_day` pour mesurer le funnel anonyme legacy (utile pour relance ciblée).
  - **Anti-régression** : si un futur changement réintroduit `signInAnonymously()` au mount d'une page produit, on perd à nouveau la base d'emails. Tout changement de funnel doit être discuté avant.

---

## Multi-domaine — verifiermondevis.fr ↔ gerermonchantier.fr

Le projet sert **deux domaines depuis le même build Vercel** : VMD (analyse de devis) et GMC (cockpit chantier). Mêmes routes Astro, branding adaptatif côté serveur, accès produit gating par allowlist.

### Architecture

| Domaine | Sert | Page d'accueil servie |
|---|---|---|
| `(www.)verifiermondevis.fr` | Landing VMD + analyse de devis + cockpit chantier (legacy) | `src/pages/index.astro` (SSR) |
| `(www.)gerermonchantier.fr` | Landing GMC + cockpit chantier | `src/pages/gmc-home.astro` (prerendered, redirigé via `src/middleware.ts` quand le host est gmc) |

Le middleware Astro (`src/middleware.ts`) intercepte uniquement le path `/` et fait un 302 vers `/gmc-home` quand le host est gerermonchantier. Toutes les autres routes (`/mon-chantier/*`, `/auth/*`, `/api/*`, etc.) sont partagées entre les deux domaines.

### Modules clés

| Fichier | Rôle |
|---|---|
| `src/lib/auth/brand.ts` | `detectBrandFromHost(host)` (server-side) + `getBrand()` (client) + `VMD_CONFIG` / `GMC_CONFIG` (titres, sous-titres, redirect par défaut) |
| `src/lib/auth/gmcAccess.ts` | `hasGmcAccess(email)` — **source unique** de l'allowlist GMC. Aujourd'hui hardcodée `["julien@messagingme.fr", "bridey.johan@gmail.com"]`. À remplacer par lecture DB quand on ouvrira GMC. |
| `src/lib/auth/postLoginRedirect.ts` | Helper post-login : calcule la cible naturelle selon `hasGmcAccess`, fait SSO handoff cross-brand si nécessaire, fallback hard redirect. |
| `src/lib/auth/ssoHandoffClient.ts` | `navigateToGmc(targetPath)` : pour les liens VMD-side qui doivent envoyer l'utilisateur sur gmc.fr (e.g. bandeau "Mon chantier" sur le tableau de bord). |
| `src/lib/auth/signOut.ts` | `signOutCrossDomain()` : déco serveur-side `scope: 'global'` + redirect chain pour vider localStorage de l'autre origin. |
| `src/pages/api/sso/handoff.ts` | Endpoint POST qui génère un magic link Supabase via `auth.admin.generateLink({ type: 'magiclink' })` (admin API → **pas d'email envoyé**). Vérifie le JWT du caller via service_role. |
| `src/pages/auth/clear-session.astro` | Cible de la redirect chain logout. Vide localStorage de son origin, redirige vers `?return=` (whitelist d'origines validée). |

### Règles à respecter

- **NE JAMAIS DUPLIQUER l'allowlist** : importer `hasGmcAccess` depuis `@/lib/gmcAccess`. Sinon drift assuré quand on ajoute un user. Une seule exception légitime : `astro/Header.astro` ligne ~197 où `ADMIN_EMAILS` contrôle le lien `/admin` (admin platform role, distinct de l'accès GMC).
- **NE JAMAIS rediriger directement vers `/mon-chantier*` depuis une page VMD** sans SSO handoff. Sinon l'utilisateur reste sur `verifiermondevis.fr/mon-chantier/...` au lieu de `gerermonchantier.fr/mon-chantier/...`. Utiliser `navigateToGmc(targetPath)` du helper `ssoHandoffClient`. Cas typique : tout `<a href="/mon-chantier...">` dans Dashboard.tsx, layout/Header.tsx, AnalysisResult.tsx, SimulateurAidesCard.tsx.
- **Liens INTRA-cockpit** (composants sous `src/components/chantier/cockpit/*`) gardent les paths relatifs `/mon-chantier/...` — ils s'exécutent déjà sur gmc.fr post-SSO, pas besoin de cross-domain handoff.
- **Pages d'auth** (connexion / inscription / mot-de-passe-oublié / reset-password) lisent le brand côté serveur via `Astro.request.headers.get('host')` + `detectBrandFromHost()`, passent la prop `brand` au composant React via `<XApp brand={brand} client:only="react" />`. Les composants `Login.tsx` etc. acceptent une prop optionnelle `brand` qui override la détection runtime `getBrand()`.
- **Auth callback OAuth Google** : `auth/callback.astro` lit `next` (et `redirect` legacy) depuis la URL et délègue à `performPostLoginRedirect`. Pour le SSO handoff, le magic link redirige vers `gmc.fr/auth/callback?next=/mon-chantier#access_token=...`.
- **Logout** : tous les boutons "Déconnexion" (3 emplacements actuels : `astro/Header.astro` inline, `layout/Header.tsx` React, `gmc-landing/Header.astro` inline, plus le cockpit GMC dans `Sidebar.tsx`, `MonChantierHub.tsx`, `ScreenPrompt.tsx`) appellent `signOutCrossDomain('/')` du helper partagé. Ne jamais réinventer le flow déco — il faut le scope global + redirect chain pour que les 2 origines soient déco.
- **CSP `frame-ancestors 'none'` empêche les iframes** vers le projet (vercel.json header global). Si on a besoin d'embed cross-domain, OUBLIER l'iframe — utiliser une redirect chain ou un nouveau path avec CSP override spécifique.

### Pré-requis Supabase pour le SSO

Dashboard → Authentication → URL Configuration → **Redirect URLs** doit contenir :
- `https://gerermonchantier.fr/auth/callback?next=*`
- `https://www.gerermonchantier.fr/auth/callback?next=*`
- `https://www.verifiermondevis.fr/auth/callback?next=*`

Sans ces URLs, le magic link `generateLink({ type: 'magiclink', options: { redirectTo: ... } })` rejette `redirectTo` → 500 silencieux côté SSO endpoint.

### DNS (côté OVH, déjà configuré)

- `gerermonchantier.fr` → A record `216.198.79.1`
- `www.gerermonchantier.fr` → CNAME vers `*.vercel-dns-017.com.`

---

## Tracking / Pixels publicitaires (2026-06-05)

Tout le tracking vit dans `src/layouts/BaseLayout.astro`, conditionné au consentement cookies (la fonction `loadTrackingScripts()` ne tourne qu'après clic « Accepter » ou si `localStorage['cookie-consent'] === 'accepted'`). RGPD : la bannière nomme explicitement Google Analytics ET Meta/Facebook.

- **Meta Pixel UNIQUE** : ID `1006152355233216`, mutualisé VMD + GMC (le layout est partagé, un seul `fbq('init', ...)` couvre les 2 domaines). Vérifié au runtime : `connect.facebook.net/en_US/fbevents.js` + `facebook.com/tr?id=1006152355233216&ev=PageView`. Portfolio Meta Business « Gerermonchantier », `business_id=4998931600333136`.
- **Google Analytics = 2 streams SÉPARÉS** (asymétrie VOLONTAIRE, ne pas « harmoniser » avec le pixel) : détection `window.location.hostname` au runtime dans le `<script is:inline>` du `<head>`, `G-NE80KQDS6W` pour gerermonchantier, `G-HJFMR8ST50` sinon (VMD + dev local). Le choix ne peut PAS se faire au build (même build Vercel pour les 2 domaines).
- **`gtag` est exposé en `window.gtag`** par le script inline, donc `loadTrackingScripts()` (script bundlé, déféré) peut l'appeler. Ne pas casser cette exposition.
- **CAPI gateway stape.de** (`capig.stape.de`) branchée côté config Meta du pixel. ⚠️ **Était BLOQUÉE par la CSP** : le `connect-src` de `vercel.json` ne l'autorisait pas, donc les events CAPI navigateur→passerelle étaient refusés en silence (le pixel image `facebook.com/tr` passait, lui, via `img-src`). **Fixé 2026-06-12** (commit `3351077`) : ajout de `capig.stape.de` + `www.facebook.com` + `connect.facebook.net` au `connect-src`. Vérifié en prod sur GMC **et** VMD (même `vercel.json`) : `POST capig.stape.de → 200`, 0 erreur console. Dédup navigateur+CAPI assurée par Meta via `event_id` (cf. tag « Multiple » sur PageView ci-dessous).
- **Alerte Events Manager « Improve your rate of Meta Pixel events covered by Conversions API » = optimisation jaune, PAS une panne (2026-06-12)** : diagnostic de couverture, pas une erreur. L'écart « le serveur envoie X events de moins que le pixel sur 7 j » (vu : -215) était un **artefact de la période où `capig.stape.de` était CSP-bloqué** (CAPI muette pendant que le pixel firait) → se résorbe seul une fois débloqué (commit `3351077`). Re-vérifier ~19 juin. 2e levier suggéré par Meta = aligner les clés de dédup (`event_id`).
- **Segmentation** : un seul pixel, mais audiences à créer par URL côté Ads Manager (`contient verifiermondevis.fr` vs `gerermonchantier.fr`). Vérif des 2 domaines dans Meta Business : voir `TODO.md`.
- **Compte publicitaire pour annoncer = GMC `2084133708982860`** (dans le portefeuille Gerermonchantier `4998931600333136`, **relié** au pixel — vérifié Events Manager → pixel GMC VMD → Paramètres → Partage → Comptes publicitaires). Le pixel/ensemble de données s'appelle « **GMC VMD** », créé le 5 juin 2026.
- **⚠️ Piège compte pub** : il existe un 2e compte pub `1279407743853166` **HORS** du portefeuille Gerermonchantier. Le sélectionner dans Events Manager affiche un écran « Bienvenue / Connecter des données » **vide** — ce n'est PAS un pixel cassé, juste le mauvais compte/portefeuille en haut à droite. **Toujours annoncer depuis GMC `2084133708982860`** (un compte hors-portefeuille ne voit ni le pixel ni ses audiences). Pour retrouver le pixel : sélecteur en haut à droite → portefeuille Gerermonchantier → Ensembles de données → GMC VMD.
- **Événements câblés** (via helper `src/lib/integrations/metaPixel.ts` : `trackPixel`/`trackPixelOnce`, no-op silencieux sans consentement cookies) : `PageView` auto (`BaseLayout.astro:400`), **`Lead`** (`AnalysisResult.tsx:1272`, `trackPixelOnce` dédupliqué par analyse, `content_name='analyse_devis'`), **`CompleteRegistration`** (`Register.tsx:136`, à l'inscription). Ils n'apparaissent dans Events Manager qu'après une vraie conversion avec consentement (pixel neuf + faible volume = table vide pour ces events, normal).
- **Event `Prospect`** visible dans Events Manager = event **navigateur** (Meta : source « Site web »), 1 occurrence, **absent du code VMD** (grep `fbq`/`trackPixel` → rien), **pas** une conversion perso, **pas** GTM/stape. Inspection live du site (2026-06-08) : un seul pixel `1006152355233216`, scripts tiers = pixel Meta + GA4 + jQuery + **widget chat MessagingMe**. Source la plus probable de `Prospect` = le **widget MessagingMe** (`ai.messagingme.app/widget/...`, partage le même `fbq`, fire à l'engagement chat). À confirmer en capturant le réseau pendant une interaction chat. ⚠️ `Prospect` ≠ les events serveur de stape.de (ceux-là = la CAPI, invisibles dans le navigateur, et expliquent le tag « Multiple » sur PageView).
- **Piège pixel-avant-redirection (fix 2026-06-08)** : `fbq('track', ...)` juste avant un `window.location.href` perd l'event (la navigation coupe la requête GET du pixel). `CompleteRegistration` était perdu (inscription email) / totalement absent (Google OAuth). Fix : délai 400 ms avant la redirection dans `Register.tsx` (+ flag `redirecting` anti double-submit) ET `callback.astro` (bloc `isNewUser`). **Ne pas retirer ces délais.** Robuste à terme = CompleteRegistration en CAPI serveur. Détail : `brain/LEARNINGS.md` 2026-06-08.

---

## Conventions mobile

Patterns établis pendant les passes mobile (Axe 2 + Quick Wins P0 cockpit). Tout est **additif** via prefixes Tailwind (`sm:`/`md:`/`lg:`) → zero régression desktop.

### Inputs numériques
Tout `<input type="number">` doit avoir `inputMode` :
- **Décimaux** (prix, surface) : `inputMode="decimal"` → pavé numérique avec `.`
- **Entiers** (quantité, année) : `inputMode="numeric"` → pavé numérique sans `.`

### Touch targets
- `Button` (shadcn) : `touch-manipulation` déjà dans la base CVA → supprime le 300ms tap delay iOS.
- **Minimum 44×44px** pour toute cible tactile (WCAG). `p-3` ou `h-11 w-11` sur les icon buttons.

### Safe-area iOS (notch + gesture bar)
Pour tout élément fixé en bas (bottom-sheet, cookie banner, drawer fullscreen) :
```tsx
className="... pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-0"
```

### Drawers fullscreen mobile (slide-right)
```tsx
<div className="fixed inset-0 bg-black/40 sm:bg-black/20 z-40" onClick={onClose} />
<div className="fixed right-0 top-0 bottom-0 w-full sm:w-[400px] bg-white shadow-2xl z-50 flex flex-col">
  <div className="flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
```

### Tableaux denses mobile
```tsx
<div className="flex-1 overflow-auto overscroll-x-contain">
  <table className="min-w-[Npx] w-full table-fixed">
```
- `overscroll-x-contain` évite les interférences avec pull-to-refresh
- `min-w-[Npx]` = somme des largeurs du `<colgroup>`

### Grid responsive dense (KPI dashboards)
```tsx
<div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
```

### Barre filtres + CTA (pattern ActionBar)
```tsx
<div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 md:flex-wrap">
  <div className="relative w-full md:flex-1 md:min-w-[180px] md:max-w-xs">…</div>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:contents">
    <select className="w-full md:w-auto">…</select>
  </div>
  <div className="hidden md:block md:flex-1" />
  <button className="w-full md:w-auto">CTA</button>
</div>
```
`md:contents` fait disparaître le wrapper grid sur desktop → les selects deviennent enfants directs du flex parent.

### 2-panneaux liste/détail mobile (pattern Messagerie)
```tsx
<div className={`w-full lg:w-80 ${mobileShowThread ? "hidden lg:flex" : "flex"}`}>...</div>
<div className={`flex-1 ${mobileShowThread ? "block" : "hidden lg:block"}`}>...</div>
```
Bouton retour `lg:hidden` dans le header du panneau détail.

### Composants mobile dédiés via `useIsMobile()` (refonte cockpit GMC 2026-05-13)

Pour les écrans **trop complexes pour du responsive Tailwind** (TresorerieView 1385 lignes / 8 breakpoints, Echeancier 1987 lignes / 8 breakpoints — quasi rien repensé tactile), pattern dédié :

```tsx
// src/hooks/useIsMobile.ts — matchMedia 767px, compat Safari <14
import { useIsMobile } from '@/hooks/useIsMobile';

export default function TresorerieView(props) {
  // ... hooks data (partagés mobile/desktop, AVANT le check isMobile)
  const isMobile = useIsMobile();
  const [forceDesktop, setForceDesktop] = useState(false);

  if (isMobile && !forceDesktop) {
    return <TresorerieMobile {...computedProps} onOpenComplexAction={() => setForceDesktop(true)} />;
  }

  return (
    <>
      {isMobile && forceDesktop && (
        <button onClick={() => setForceDesktop(false)} className="md:hidden ...">← Retour vue mobile</button>
      )}
      {/* Vue desktop complète */}
    </>
  );
}
```

**Règles** :
1. **Les hooks data restent dans le composant parent** (`useBudget`, `useFinancingConfig`, etc.). On ne duplique JAMAIS la logique data dans la version mobile — uniquement le rendu.
2. **Le check `isMobile` arrive APRÈS tous les hooks** (sinon `Cannot use hooks conditionally`).
3. **Pattern `forceDesktop`** : pour les actions complexes (édition plan financement, détail par artisan) pas encore migrées en drawer mobile dédié → on bascule l'utilisateur en vue desktop avec un bouton "← Retour vue mobile" visible.
4. **Composant mobile reçoit des valeurs déjà calculées en props** (pas de re-fetch). Conserve la cohérence avec la version desktop.
5. **Composants mobile vivent à côté du desktop** : `TresorerieMobile.tsx` dans `cockpit/tresorerie/` (pas un sous-dossier `mobile/` qui éparpille).

**Quand utiliser `useIsMobile()` vs Tailwind `md:hidden`** :
- ✅ Tailwind `sm:`/`md:` pour les **ajustements** (taille typo, padding, grid-cols, drawer side vs fullscreen).
- ✅ `useIsMobile()` quand mobile et desktop ont **des UX fondamentalement différentes** (hero KPI + 2 actions vs tableau dense, timeline verticale vs grid 3 colonnes, etc.). Le critère : > 50% du JSX diffère.

**Composants mobile-dédiés existants** (cockpit GMC) :
- `TresorerieMobile.tsx` — hero KPI + 2 actions + plan financement condensé + PlanEditDrawer (inputs gros doigts)
- `EcheancierMobile.tsx` — timeline verticale + 3 chips filtre + FAB rond bas-droite (Versement/Dépense)
- `BottomNav.tsx` — 5 onglets fixes en bas (Accueil/Budget/Planning/Documents/Plus). "Plus" → bottom sheet avec onglets secondaires. Remplace la sidebar slide-from-left sur mobile uniquement.
- `PullToRefresh.tsx` (Vague B1) — geste tirer-pour-rafraîchir natif. Wrap autour du contenu scrollable. Désactivé si scrollTop > 0 ou si refresh déjà en cours. PointerEvents (touch + stylet). Indicateur visible uniquement sur mobile (`lg:hidden`).
- `EmptyState.tsx` (Vague B3) — composant unifié pour les listes vides. Impose icône + titre + sous-titre + CTA optionnel. Pattern mobile-first (padding généreux, CTA pleine largeur). À utiliser à la place du HTML inline pour homogénéiser.

**Utilitaires mobile** (Vague B) :
- `@/lib/chantier/haptics` — `haptic("success" | "warning" | "error" | "light" | "selection")` qui wrap `navigator.vibrate()`. Patterns sémantiques (`success` = double-tap court, `warning` = double-tap marqué, `error` = triple-tap). iOS Safari ignore silencieusement (Apple bride). Désactivable globalement via `localStorage["haptics_disabled"]="1"`.
- `@/hooks/useScrollIntoViewOnFocus` (Vague B5) — scroll auto l'input dans la zone visible quand le clavier mobile apparaît. Délai 350ms (le temps que viewport-resize stabilise). Désactivé sur desktop (≥ 1024px).
- `@/hooks/useIsMobile` — matchMedia 767px, déjà documenté plus haut.

**Pattern optimistic UI + haptics** (à généraliser sur les toggles statut) : on update le state LOCAL immédiatement (`setEntrees(prev => prev.map(...))`) + on call `haptic("selection")` au tap, puis on lance la requête. En cas d'échec API : rollback state + `haptic("error")`. L'utilisateur voit le toggle bascule instantanément même sur 3G lente. Implémenté dans `EcheancierMobile.toggleEntreeStatut` et `deleteEntree`.

**Pattern overflow horizontal** (Vague B5) : tout `overflow-x-auto` doit être complété par `overscroll-x-contain` pour empêcher le swipe horizontal de déclencher le back-gesture iOS Safari. Find/replace simple à appliquer dès qu'un nouveau bloc scrollable horizontal est ajouté.

**Pattern wrapper export default** (pour respecter Rules of Hooks) : quand l'ancien composant a beaucoup de hooks (ex: Echeancier 1900+ lignes), on **wrap** au lieu de mettre le check `isMobile` dans le composant existant. Le wrapper export default ne fait que router :
```tsx
export default function Echeancier(props) {
  const isMobile = useIsMobile();
  const [forceDesktop, setForceDesktop] = useState(false);
  if (isMobile && !forceDesktop) return <EcheancierMobile {...props} />;
  return <EcheancierDesktop {...props} />;
}
function EcheancierDesktop(props) { /* 1900 lignes de hooks + JSX */ }
```
Sinon les hooks de la version desktop seraient appelés conditionnellement → crash "Rendered fewer hooks than expected".

État P0 mobile cockpit → voir `WIP.md`.

### Accessibilité — règles aria-label (Vague C 2026-05-16)

Pattern systématique pour tout bouton icon-only (close X, delete, search clear, edit, ...) :
```tsx
<button onClick={onClose} aria-label="Fermer le détail artisan" className="...">
  <X className="h-4 w-4" aria-hidden="true" />
</button>
```
Règles inviolables :
1. **Tout `<button>` qui ne contient QUE des icônes Lucide doit avoir `aria-label`** — phrase courte explicite ("Fermer le formulaire", "Supprimer cet acompte", "Annuler la saisie d'acompte"), pas "Fermer" générique.
2. **Toute icône Lucide à l'intérieur d'un bouton avec aria-label doit avoir `aria-hidden="true"`** — sinon le screen reader lit deux fois le label.
3. **Tout `<div className="fixed inset-0 ..." role="dialog">` doit avoir `aria-modal="true"` ET `aria-label` ou `aria-labelledby`** — le titre `<h2>` peut être référencé via `aria-labelledby="modalTitle-id"`.
4. **Tout backdrop overlay (la div semi-transparente cliquable derrière la modal) doit avoir `aria-hidden="true"`** — c'est purement décoratif, le screen reader ne doit pas l'annoncer.

Composants à jour : `BudgetTab` (4 boutons), `Echeancier` (3 boutons), `DepenseRapideModal` (close + role dialog), `BottomNav` (close menu Plus), `ScreenQualification` (remove + cancel + add inputs).

### `useIsMobile()` — pattern d'amplification tactile minimal (Vague C polish)

Quand on ne veut PAS faire un split mobile/desktop complet (pattern `useIsMobile()` + composant dédié, cf. plus haut), mais qu'on veut quand même que les zones tactiles principales du composant s'agrandissent sur mobile :

```tsx
const isMobile = useIsMobile();
// ... pass to child via prop
<ActionBar isMobile={isMobile} ... />

// Dans ActionBar :
const inputClass = isMobile
  ? "w-full h-11 text-sm ..."           // 44px tactile WCAG sur mobile
  : "w-full py-2 text-[12px] ...";      // sizing dense desktop
```

À utiliser sur les composants à fort trafic où un split complet serait disproportionné (BudgetTab, FinancementTab à terme). Documenter à chaque fois ce qui est mobile-amplifié (input search ? CTAs ?) vs ce qui reste desktop-dense.

---

## Refonte V3.5 vectorisation catalogue market_prices — en cours (2026-05-21)

> Plan validé après le bug PH VISION ("Pose extracteur/WC = 3900€" qui regroupait à tort tout le bloc Sanitaires). Le pipeline V3.6 actuel (Phase 2 = groupement Gemini avant matching catalogue) produit régulièrement des regroupements aberrants. Solution : vectorisation pgvector + matching ligne-par-ligne (1 ligne devis = 1 embedding = similarity search top-5 dans le catalogue 911 entries).

**Décisions architecturales validées** :
- **Embedding provider** : Gemini `text-embedding-004` (768 dim, gratuit, dans le projet). Plus tard : `gemini-embedding-001` (3072 dim, plus précis, demande migration `vector(3072)`).
- **Affichage** : 1 ligne devis = 1 carte (maximum de transparence, pagination)
- **Rollout** : feature flag `MARKET_MATCHER_VECTORIAL=true/false` (false par défaut = ZÉRO impact prod tant qu'on flip pas)

**Phases A→F** (commits séparés, validation entre chaque) :

| Phase | État | Détail |
|---|---|---|
| **A — Migration SQL** | ✅ Pushée (commit `72c6ff9`) + appliquée prod | pgvector enabled + colonne `market_prices.embedding vector(768)` + index HNSW + RPC `search_market_prices_v2(query_embedding, threshold, count)` |
| **B — Script seed** | ✅ Livrée + exécutée prod (commits `72c6ff9` + `0d7c443` + `551208f`) | `scripts/seed_market_prices_embeddings.mjs` embed les 911 entrées via Gemini `gemini-embedding-001` + `outputDimensionality:768` (~46s, ~0.02€). Idempotent. 911/911 embedded. |
| **C — Refonte market-prices.ts** | ✅ Livrée (commits `d49dc90` + `1537b38`) | 5 sous-phases : C.1 helper vectoriel + classification confidence, C.2 feature flag `MARKET_MATCHER_VECTORIAL=off\|shadow\|on` + extension `JobTypePriceResult.vectorial`, C.3 adapter `conclusion.ts`, C.4 tests unitaires (23 cas), C.5 shadow run via `EdgeRuntime.waitUntil`. Shadow activé en prod le 2026-05-21. |
| **D — Adaptation UI** | ✅ Livrée (commit à venir, 2026-05-22) | Nouveau `VectorialPriceList.tsx` : 3 sections (Comparables fiables / incertains / Non comparables) + badge confidence high/medium/low/no_match avec tooltip + pagination 15/section + top-5 candidats catalogue alternatifs. `BlockPrixMarche` détecte `vectorial` dans rows → délègue. |
| **E — Script analyse shadow logs** | ✅ Livré (commit à venir, 2026-05-22) | `scripts/analyze_vectorial_shadow_logs.mjs` parse les logs `[V35_VECTORIAL_SHADOW]` exportés depuis Supabase, produit rapport markdown avec volumétrie + distribution confidence + dispersion V3.6/vectoriel + top jobs + cas divergents + checklist Phase F automatisée. Mode `--demo` pour tester. **À lancer dans 24-48h** sur ~30+ analyses naturelles. |
| **F — Rollout** | ✅ FLIPPÉ EN PROD (2026-05-22) | `MARKET_MATCHER_VECTORIAL=on` set côté Supabase secrets + bump ENGINE_VERSION 3.4.28 → 3.5.0 (invalidation cache massive). Décision sur la base de logs shadow CYRIL CATEZ (devis travaux 17 645€, 29 lignes) : V3.6 sortait 3 labels 100% hallucinés (`isolation_phonique_cloison` à 6671€ alors que la vraie iso = 500€, `enduit_de_lissage_plafond` empilait 3 prestations distinctes, `menuiserie_taux_horaire` au lieu de `pose_porte`), vectoriel sortait ~25/29 labels corrects + récupérait la niche SDB et le coffrage placo que V3.6 perdait. Rollback express : `npx supabase secrets set MARKET_MATCHER_VECTORIAL=off --project-ref vhrhgsqxwvouswjaiczn`. Limite connue : confidence distribuée majoritairement en "medium" (similarity 0.70-0.85) car les libellés catalogue sont plus courts que les descriptions devis verbeuses → UI affiche beaucoup de badges ambre 🟡 "Match plausible". Recalibrage seuils possible en V3.5.1 après observation 7j (descendre HIGH 0.85 → 0.78). |

**Anti-régression garanti** : Phases A+B sont 100% additives (colonne nullable + script externe). V3.6 actuel continue de fonctionner exactement comme avant tant que Phase F n'est pas déclenchée.

---

## Bug B2 quota dépassé sur bucket marketing (2026-05-21)

**Symptôme** : tous les téléchargements de carrousels marketing retournent `502 "Image X indisponible"` parce que le proxy `/api/admin/marketing/img` reçoit `403 download_cap_exceeded` de Backblaze B2.

**Cause** : Le bucket `verifiermondevismarketing` a explosé son cap mensuel de bande passante (free tier = 1 GB/jour). Le proxy Vercel est censé cacher les images sur le CDN pour éviter de retaper B2 à chaque vue, mais les `?v=<timestamp>` qui changent à chaque regen + premier accès à un asset (jamais en cache CDN) tapent quand même B2.

**Fix temporaire** : Julien augmente le cap dans https://secure.backblaze.com/b2_buckets.htm → Bucket Settings → Caps and Alerts → "Daily Download Bandwidth Cap" à 10 GB ($0.01/GB au-delà du free 1 GB = ~$1.50/mois si on tape 5 GB/jour, négligeable).

**Fix long terme à envisager** si récidive : migration B2 → Cloudflare R2 (free tier 10 GB storage + bande passante ILLIMITÉE gratuite). ~2-3h de boulot : export PNG, mise à jour `preview_urls` en DB, adaptation du proxy. Plus jamais ce problème.

**Investigation à faire si récidive** : pourquoi le quota explose-t-il ? Hypothèses : cache CDN Vercel ne fonctionne pas (vérifier les headers en prod), bots scrapers, `?v=` cache-buster qui invalide le cache à chaque regen. Audit dans `src/pages/api/admin/marketing/img.ts`.

---

## Monitoring & alertes prod — 2 systèmes complémentaires (2026-05-21)

> Section ajoutée après un **incident silencieux** : la régression V3.4.20 sur l'analyse VMD est passée 2 jours sans alerte mail. Diagnostic : le cron `system-health-alerts` créé en 2026-02-28 avait été supprimé par le commit `ff69caa` (2026-03-14) et jamais restauré → 80 jours sans surveillance volumétrique. Restauré explicitement le 2026-05-21 via migration `20260521_001_restore_system_health_alerts_cron.sql`.

**2 crons complémentaires, à ne JAMAIS confondre** :

| Cron | Fréquence | Edge function | Rôle | Email si |
|---|---|---|---|---|
| `system-health-alerts` | */5 min | `system-alerts` | Surveillance **volumétrique** : analyses bloquées > 15 min, pic 3+ erreurs en 30 min, taux d'échec > 50% sur 1h (si ≥ 4 analyses) | Immédiat dès qu'une catégorie matche |
| `analysis-maintenance` | */15 min | `analysis-maintenance` | Réparation **individuelle** : retry analyses error/failed jusqu'à 2 fois, email si retry effectué OU échec persistant après 2 tentatives | Conditionnel (au moins 1 retry ou 1 persistent) |

Destinataires alignés des 2 systèmes : `julien@messagingme.fr` + `bridey.johan@gmail.com`. Le commentaire TODO Resend dans `system-alerts/index.ts` ("from=alerts@verifiermondevis.fr une fois domaine vérifié") reste valide mais n'empêche pas les envois aujourd'hui (utilise `from=onboarding@resend.dev`).

**⚠️ Angle mort connu (à addresser)** : un **mauvais verdict** (ex: ROUGE faux comme dans V3.4.20) n'est PAS une erreur technique (pas d'exception, status=`completed` dans la DB). Aucun des 2 crons ne le détecte. Le seul signal aujourd'hui = feedback utilisateur via la modal `FeedbackModal` (chips négatifs `faux_radiee`, `mauvaise_entreprise`, etc., visibles dans `/admin` section "Anomalies bloquantes"). À ajouter en Phase ultérieure : un cron qui surveille les pics de feedbacks négatifs et alerte (genre 3+ feedbacks `faux_radiee` en 1h → email).

**Vérifications post-déploiement migration** (SQL Editor Supabase) :

```sql
-- Le cron existe-t-il et est-il actif ?
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'system-health-alerts';

-- A-t-il tourné récemment et avec succès ?
SELECT jobname, runid, status, return_message, start_time
FROM cron.job_run_details
WHERE jobname = 'system-health-alerts'
ORDER BY start_time DESC
LIMIT 10;
```

Si jamais une migration cron est supprimée pour cleanup, **TOUJOURS** créer une nouvelle migration explicite qui restaure le cron. Ne JAMAIS supposer qu'une migration ré-ajoutée dans le repo sera ré-appliquée automatiquement par `supabase db push` (elle ne le sera pas si le fichier a déjà été marqué appliqué dans `supabase_migrations.schema_migrations`).

---

## GMC trial + paywall — plan figé Phase 2 (2026-05-20)

> Plan de monétisation GMC validé conjointement (audit + décisions Johan, à confirmer par Julien avant attaque code Phase 3). Cf. `TODO.md` section "GMC — Monétisation" pour le détail granulaire et `wip.md` pour l'état d'avancement.

**Modèle commercial** :
- Trial 15 jours sans CB, ancré sur `auth.users.created_at` (PAS de colonne `trial_started_at` ajoutée).
- 4 SKU Stripe alignés avec `src/components/gmc-landing/Pricing.astro` : `gmc_essentiel_{monthly,annual}` 12€/120€ (1 chantier), `gmc_multi_{monthly,annual}` 25€/210€ (illimité).
- Post-trial : **read-only complet** + paywall 403 sur écritures (PAS blocage total — choix RGPD-friendly + conversion).
- Grace period past_due = 7 jours.
- Limite chantier Essentiel (1 chantier max) = **hors scope V1 paywall**, à coder dans une phase ultérieure.

**Helper central** :
- `src/lib/auth/accessControl.ts` (à créer) — `getAccessState(userId)` retourne `'trial_active' | 'trial_expired' | 'subscribed' | 'subscribed_past_due' | 'beta' | 'admin' | 'blocked'`.
- `src/lib/api/apiHelpers.ts` — ajout `requirePremium(request, opts)` qui combine `requireAuth` + `getAccessState` + 403 si bloqué sur opérations d'écriture.
- `src/lib/api/aiQuota.ts` (à créer) — `requireAIQuota(supabase, userId, product)` qui incrémente atomiquement `ai_usage_monthly` via RPC SQL.

**Quota IA pendant trial** :
- 30 appels/mois (UTC) sur actions coûteuses uniquement : `generer`, `ameliorer`, `regenerer`, `analyser`, `assistant/message` (agent-orchestrator).
- Gratuites pendant trial : `conseils`, `qualifier`, `describe`, `extract-invoice` (légères Gemini).
- Subscribed = 500/mois. Beta + admin = illimité.

**Allowlist Johan + Julien** :
- INSERT explicite par email dans la migration A : `is_beta_tester=true`, `beta_expires_at=NULL`.
- `hasGmcAccess()` (actuellement allowlist hardcodée `["julien@messagingme.fr","bridey.johan@gmail.com"]` dans `src/lib/auth/gmcAccess.ts`) lira la DB après migration douce 30j (OR entre les 2 sources, puis suppression de l'allowlist).

**Analytics segmentation** :
- Tous les events Amplitude/tracking incluent `userTier: 'trial' | 'beta' | 'active' | 'expired' | 'admin'`. Séparation stricte. Permet de mesurer la conversion trial→active par segment indépendamment.

**Stratégie zéro downtime — 6 phases** (chaque commit revertable indépendamment) :
- Phase A : migration SQL (4 colonnes ajoutées avec DEFAULT, table `ai_usage_monthly` nouvelle, INSERT idempotent Johan+Julien). Non-breaking.
- Phase B : helpers `accessControl.ts` + `aiQuota.ts` créés, pas encore appelés.
- Phase C : endpoint `/api/gmc/access-state` + hook `useAccessState`. Pas encore consommé par l'UI.
- Phase D : composants UI (`TrialBanner`, `PaywallScreen`, `AdminOverrideBadge`, `AIQuotaIndicator`) — read-only de l'état, jamais bloquant.
- Phase E : gating progressif des 19 endpoints GMC (12 IA + 7 destructifs). Tests anti-régression `accessControl.test.ts` avant chaque endpoint.
- Phase F : Stripe checkout GMC (`/api/gmc/checkout`) + webhook adapté pour `product='gmc'` via metadata. Tester en Stripe test mode d'abord.

**Endpoints concernés** :
- **Premium uniquement (12)** : `chantier/generer`, `chantier/ameliorer`, `chantier/conseils`, `chantier/qualifier`, `chantier/[id]/regenerer`, `chantier/[id]/assistant/message`, `chantier/[id]/insights`, `chantier/[id]/documents/[docId]/analyser`, `chantier/[id]/documents/[docId]/describe`, `chantier/[id]/documents/[docId]/extract-invoice`, `chantier/[id]/documents/extract-invoice`, `chantier/[id]/whatsapp` (POST + PATCH).
- **Trial expired = 403 sur DELETE (7)** : `chantier/[id]`, `chantier/[id]/lots/[lotId]`, `chantier/[id]/devis/[devisId]`, `chantier/[id]/contacts`, `chantier/[id]/taches`, `chantier/[id]/entrees`, `chantier/[id]/payment-events`.
- **Trial OK (toutes les autres)** : GET, POST/PATCH non-IA, lecture.

**Sécurité anti-bypass** :
- `getAccessState()` lit toujours la DB (jamais le JWT claim).
- Table `ai_usage_monthly` : RLS empêche INSERT/UPDATE — seul `service_role` écrit via RPC `increment_ai_usage`.
- `requireAuth` extrait `user_id` du JWT décodé, jamais du body.
- Edge functions cron utilisent `X-Agent-Key` → bypass trial volontairement (système, jamais user-initiated). Documenté.

---

## Sécurité

### Principes appliqués
- **Auth JWT côté serveur** : routes sensibles (`create-checkout-session`, `create-portal-session`) vérifient via `supabase.auth.getUser(token)` et extraient `userId` du token (jamais du body).
- **Pas de mutation premium client-side** : `activatePremium()` / `startTrial()` supprimés. Activation uniquement via webhook Stripe.
- **Signature webhook obligatoire** : `stripe-webhook.ts` rejette si `STRIPE_WEBHOOK_SECRET` manquant.
- **SIRET** validé `^\d{14}$` avant injection dans URLs externes. `encodeURIComponent()` systématique.
- **Pas de SQL brut** : toujours le client paramétré (`.eq()`, `.upsert()`, `.rpc()`).

### Points d'attention non corrigés
- **Prompt injection** : texte PDF concaténé dans prompts Gemini. Mitigation : délimiteurs `[DATA]` à ajouter si risque augmente.
- **CORS `*`** sur API mutation. À restreindre à `https://www.verifiermondevis.fr` en prod.
- **`analyze-quote` ownership** : edge function ne vérifie pas que le caller est propriétaire. Protection : analysisId = UUID non prédictibles.
- **XSS** : `ScreenAmeliorations.tsx` utilise `dangerouslySetInnerHTML` sur du texte IA non sanitizé. `blogUtils.ts` SSR : regex de sanitization faible.

### Variables d'env sensibles (Vercel uniquement)

| Variable | Usage |
|---|---|
| `STRIPE_SECRET_KEY` | API Stripe server-side |
| `STRIPE_WEBHOOK_SECRET` | Vérification signature webhook (obligatoire prod) |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypass RLS dans les API routes |
| `GOOGLE_API_KEY` | Gemini (extraction, groupement, résumé, agent) |
| `GOOGLE_PLACES_API_KEY` | Notes et avis Google Places |
| `AGENT_SECRET_KEY` | Auth inter-service edge functions → API routes (header `X-Agent-Key`) |
| `WHAPI_TOKEN` | API whapi.cloud (groupes WhatsApp) |
| `SENDGRID_API_KEY` | Email envoi/inbound |

---

## Architecture chantier — résumés

Pour le détail complet (modèle CPM, agent IA dual-mode, pipeline de génération, écrans cockpit, hooks matériaux) → `DOCUMENTATION.md` § 20.

### Planning CPM
- **DAG multi-parent** : `lots_chantier` (durée + délai + lane_index) + `lot_dependencies` (Finish-to-Start).
- Dates **dérivées** via tri topologique (Kahn) + forward pass (`src/lib/chantier/planningUtils.ts`).
- API `/api/chantier/[id]/planning` : GET / PATCH (recompute global), `/shift-lot` (cascade ou détaché).
- Frontend : `PlanningTimeline.tsx` (Gantt drag/resize), `usePlanning.ts` (state + reqSeqRef anti-rollback réseau).
- **Sous-planning avancé (premium, 2026-06-08)** : sous-phases intra-lot + dépendances cross-métier, **drag & drop sur le Gantt unifié**. Tables `lot_subphases` + `planning_subphase_deps`. CPM unifié `computeAdvancedPlanning` (coeur partagé `forwardPass`, le lot avec sous-phases est un conteneur aux dates dérivées min/max). Recompute serveur `recomputeChantierDates` (subphase-aware, identique sans sous-phase). Gate premium `requireAdvancedPlanning`. UI : toggle Simplifié/Avancé dans `PlanningChantier` qui passe une prop `advanced` à `PlanningTimeline` ; en avancé le MÊME Gantt affiche les sous-phases en **sous-barres draggables** (`SubphaseBar` : horizontal = délai, vertical = créer une dépendance) + bouton « découper » → `SubphasePanel`. Tout le code avancé est derrière `if (advanced)` → mode simplifié byte-identique (zéro régression). `SubPlanningView` (ancienne vue % séparée) **supprimée**. Détail complet : `DOCUMENTATION.md` § 22.

### Agent IA orchestrator (Pilote de Chantier)
- Edge function `agent-orchestrator` (Gemini 2.5-flash, function calling).
- **Mode** configurable par user : `edge_function` (défaut) | `openclaw` (en cours, voir WIP.md) | `disabled`.
- Triggers : upload document, message WhatsApp, email entrant, affectation lot, cron 19h Paris.
- **Architecture modulaire `tools/`** (P2) : 11 modules par domaine (planning, status, tasks, finance, documents, contacts, scheduled, insights, comm, read) + dispatcher avec check collision noms au boot.
- **Tools livrés** (cf. `FEATURES.md § 14` pour le détail par tool) :
  - Lecture : `get_chantier_summary`, `get_chantier_planning`, `get_chantier_data`, `get_contacts_chantier`, `get_recent_photos`, `list_chantier_groups`, `get_message_read_status`
  - Planning : `update_planning`, `shift_lot`, `arrange_lot`, `update_lot_dates`, `update_lot_status`, `mark_lot_completed`
  - Tâches : `create_task`, `complete_task`
  - Frais & paiements (vague 1+2) : `register_expense`, `register_payment` (matching A/B/C/D/E), `add_payment_event`
  - Statuts (vague 1) : `update_devis_statut`
  - Documents (vague 1) : `move_document_to_lot`
  - Contacts (vague 1) : `update_contact` (normalisation tel)
  - Communication (vague 2+3) : `send_whatsapp_message`, `send_email` (cap 5/24h), `create_owner_whatsapp_channel`
  - Décisions (P1) : `notify_owner_for_decision`, `resolve_pending_decision`
  - Programmation (vague 3) : `schedule_reminder`, `cancel_reminder`
  - Mémoire : `log_insight`, `request_clarification`
- `MAX_TOOL_ROUNDS = 8` + `MAX_TOTAL_TOKENS_PER_RUN = 30k` sur completion_tokens (P3).
- **Fan-out cron** (P4) : mode dispatcher fire 1 invocation indépendante par chantier (cap 200), avec garde-fou anti-loop `_dispatched: true`.
- **Pas de cache contexte** (supprimé 2026-04-23) — fresh fetch à chaque appel via `context.ts` avec timeouts AbortController.
- Auth inter-service : `requireChantierAuthOrAgent` accepte JWT user OU header `X-Agent-Key`.

### Canal proactif WhatsApp (vague 3)
- `chantier_whatsapp_groups.is_owner_channel BOOLEAN` + UNIQUE partial index (1 canal owner par chantier).
- API `/api/chantier/[id]/whatsapp` accepte `{ is_owner_channel: true }` — récupère phone via auth admin en mode agent.
- Webhook whapi route les messages owner channel en mode `interactive` avec historique 20 derniers msgs restauré + concaténation multi-msg même batch.
- Edge function `agent-scheduled-tick` (cron 15min) : **auth via header `X-Cron-Secret = AGENT_CRON_SECRET`** (pas Bearer — le vault stocke le format publishable `sb_secret_*` ≠ JWT que l'edge fn attend, mismatch silencieux). Secret partagé : env edge fn `AGENT_CRON_SECRET` + vault `agent_cron_secret`. RPC `claim_pending_reminders` FOR UPDATE SKIP LOCKED → atomic claim. Process parallèle batches 8.
- Tables : `agent_pending_decisions` (P1, expiry cron quotidien 04h UTC), `agent_scheduled_actions` (vague 3, status pending|firing|fired|cancelled|failed).
- **`notify_owner_for_decision` est BATCH-safe** (déplacé depuis ACTION_SCHEMAS) — sinon le workflow "détection décision artisan" en mode morning est inopérant. Pré-validation `expected_action.tool` contre `ALL_TOOL_NAMES` (rejet si Gemini hallucine un nom inconnu).
- **`schedule_reminder` pré-check owner channel** : refus immédiat si pas de canal configuré → l'agent peut proposer `create_owner_whatsapp_channel` au lieu de promettre un rappel qui ne partira jamais.

### Catégorie `frais` (déclaration sans pièce)
- `documents_chantier.depense_type` étendu à `'frais'` (CHECK constraint élargi).
- Tool agent `register_expense` (défaut `frais`). UI distincte : badge ambre 📝, section "Frais annexes déclarés" dans LotDetail / IntervenantsListView, catégorie dans DocumentsView, exclus de l'alerte "Devis manquant".

### Fil d'activité Assistant chantier — 3 colonnes (2026-05-08)
- Onglet Assistant rendu par `AssistantTriPane.tsx` :
  - **Alertes (gauche, 300px)** — `agent_insights` (hook `useAgentInsights`, partagé avec toasts + badge sidebar). Click = `markAsRead`. Bouton "Tout marquer lu" si `unreadCount > 0`.
  - **Chat (centre, flex-1)** — `ChantierAssistantChat size="full"`.
  - **Décisions IA (droite, 300px)** — tool_calls mutateurs du jour via `/api/chantier/[id]/assistant/activity-feed`, reset minuit Paris, auto-refresh 20s.
- **Mobile** : tabs en haut (Alertes / Chat / Décisions) — un seul panel visible, compteurs sur les tabs.
- **Cohérence badges sidebar** (règle absolue, ne jamais réintroduire le bug d'origine) : chaque badge pointe vers le contenu réel de l'onglet.
  - `documents` → `devisActions` (`devis_statut = 'recu'`)
  - `tresorerie` → `factureActions` (`facture_statut = 'recue' | 'payee_partiellement'`)
  - `assistant` → `agentInsights.unreadCount` (alertes IA non lues, rouge si critical)
  - `urgentActions = factureActions + devisActions` reste le KPI "actions en attente" sur DashboardHome — **ne pas l'utiliser sur le badge `assistant`** (c'était le bug avant 2026-05-08, le badge pointait sur un onglet sans contenu lié).
- Digest journal quotidien (19h) annexe au markdown body 3 sections : ⚙️ Décisions / ⚠️ Alertes / ❓ Clarifications.

---

## UX/UI → voir [`UX-AUDIT.md`](UX-AUDIT.md)

Audit UX complet daté du 2026-05-02. Score global : **3.4/10**. Corrections critiques C1→C4 en cours dans `WIP.md § 21`.  
**Règle** : tout changement UX majeur → mettre à jour le statut dans `UX-AUDIT.md`. Refaire un audit tous les 2-3 mois.

---

## Backlog & travail en cours

- **Backlog (à faire, pas commencé)** → [`TODO.md`](TODO.md)
- **En cours / partiellement fait / bloqué** → [`WIP.md`](WIP.md)

À mettre à jour à chaque session : ajouter au TODO quand on identifie quelque chose, migrer vers WIP quand on attaque, retirer du WIP quand c'est fini (et ajouter à `FEATURES.md` si user-facing).
