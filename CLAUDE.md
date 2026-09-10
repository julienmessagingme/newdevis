# CLAUDE.md — VerifierMonDevis.fr

Plateforme d'analyse de devis d'artisans + module **GérerMonChantier**. Stack : Astro 5 + React 18 islands + Supabase + Tailwind/shadcn-ui · Vercel (`@astrojs/vercel`, `output: 'static'`).

---

## 🟢 REFONTE EN COURS (2026-06-23+) — LIRE EN PREMIER

L'outil d'analyse de prix est en **refonte structurée en 4 maillons** :
**Lire juste → Comparer à vraie référence → Verdict honnête → Apprendre**.

📖 **Source de vérité** : [`docs/refonte/PLAN.md`](docs/refonte/PLAN.md) — boussole de la refonte avec phases, principes inviolables, décisions validées.

### État au 2026-08-29

| Maillon | Phase | Statut |
|---|---|---|
| 1 — Lire juste | Phase 3.3 câblée (V2 primaire + fallback V1) + gardes extraction 2026-08 (ligne récap, devises hors-Europe, acompte `etape="autre"`) | 🟢 **en prod** — reste Phase 3.4 (cleanup + bump `ENGINE_VERSION` → `2.0.0-refonte`) |
| 2 — Comparer à vraie référence | Catalogue 891 → **916 entrées** (mining de 237 analyses, 2026-08-27). Couverture mesurée le 2026-08-30 sur 100 devis FR : **médiane 31 %** du montant — mais 46 % du montant est rapproché en confiance MOYENNE et seulement 13 % sans rapprochement : le plafond est la **qualité du matching**, pas la taille du catalogue (détail `DOCUMENTATION.md` § 29.4) | 🟡 **entrées composites à instruire** (`TODO.md`) — ⚠️ ne PAS baisser le seuil de confiance : la moitié de la bande 0,75–0,77 est fausse. 19 fourchettes restent à relire par Julien (`source LIKE 'mining stock 2026-08-27%'`) |
| 3 — Verdict honnête | Phase 4 tranches 1 + 2 livrées + conseils retenue de garantie / dommages-ouvrage + message copiable unique déterministe | 🟢 **en prod** — cf. `FEATURES.md § 23` |
| 4 — Apprendre | `/admin/reviews` + **agent relecteur IA** (`ai-review-agent`, cron */10 min) + **boucle de capture des issues** (`analysis_outcomes`, email J+15) | 🟢 **en prod** — Phase C (validation auto) toujours conditionnée à 50+ revues humaines |

### Livré le 2026-06-30 (mega session)

1. **Comparateur de devis V1** EN PROD — migration `comparisons` + helper `verdictEngine.ts` (perimeter commun + score multi-critères 40/25/20/15 + verdict conditionnel + 3 leviers) + 5 endpoints API + 3 pages React (`ComparateurAccueil`/`Nouveau`/`Result`) + bouton "Comparer des devis" dans Dashboard
2. **3 patches Phase 3.2 V2** : `is_foreign_quote` (Stone Gardens BE), `type_document=estimation_courtier` (FONCIA/syndics), IBAN avec lettre au milieu (Côte Maison Travaux W40 validé OpenIBAN)
3. **TikTok Pixel** câblé (`D902V4RC77UB3EFMQVB0`) miroir de Meta
4. **SEO Bloc A — Quick wins** : `@astrojs/sitemap` installé + `sitemap-index.xml` au build + 19 redirects 301 pour consolider l'autorité sur futures URLs cocon + `GmcGatewayBanner` (4 variantes UTM) intégré dans `AnalysisResult.tsx`
5. **SEO Bloc B — Fondation cocon sémantique** : `src/lib/seo/schemaOrg.ts` (Article/HowTo/FAQ/Breadcrumb/SoftwareApp/Product) + `internalLinking.ts` (17 pages pivots avec topics) + 4 composants SEO (`Breadcrumb`/`TableOfContents`/`FAQ`/`RelatedGuides`) + `PillarPage.tsx` template + page pilier démo `/guides/devis-travaux` (9 sections + 6 FAQs + JSON-LD complet)
6. **SEO Bloc C — Études VMD différenciatrices** : script `generate-etudes-vmd.ts` génère 5 JSON dans `src/data/etudes-vmd/` + route Astro statique `/etudes-vmd/[slug]` + 3 pages riches en prod (`postes-surfactures` 347 analyses, `prix-variables` 347 analyses, `erreurs-tva` 313 analyses) — les 2 autres (`erreurs-frequentes`, `oublis-frequents`) ont peu de data faute de revues humaines (5-6 corrections)
7. **Plan complet Observatoire** livré dans le chat (rebrand `/etudes-vmd` → `/observatoire/`, 80-330 pages générées, architecture Materialized Views + script hebdo) — code Quick wins à attaquer demain

### Ce qui reste

- 🟡 **Phase 1.7 application** (1-2h) — Julien relit `RAPPORT-RECALIBRAGE.md` + écrit SQL d'ajustement fourchettes (script déjà livré, peinture/placo/carrelage métiers prioritaires)
- 🟡 **Phase 1.8 application** (~30 min) — Julien relit `RAPPORT-UNITES.md` + normalisations SQL (script déjà livré)
- 🟡 **Phase 2.4 — 9 revues restantes** sur 15 cibles (6 faites : Travaux Maçonnerie, Mélier Cognac, Toiture Boxes, ALES n°467, DUBOIS clavier, devis_arcs.pdf). Phase B `ai-prepare-reviews` accélère désormais la revue.
- 🟡 **Phase 3.2 monitoring — go/no-go du 2026-08-14 : GO CONDITIONNEL** (analyse dédupliquée par Johan+Claude). 186 comparaisons → 78 analyses uniques (le script `phase3-analyze-shadow.ts` déduplique désormais — les rejeux de test du 30/06 gonflaient les divergences 19.9%→11.5%). Critères : success 96.2% ✓ · durée 1.57× (1.48× sur flux naturel) ≈✓ · divergences 11.5% ✗ MAIS l'arbitrage manuel des 4 cas naturels montre : 3× = **NIC SIRET halluciné par V2** (complétait un SIREN 9 chiffres en 14 avec 5 chiffres inventés — patch prompt livré 2026-08-14, règle « recopie telle quelle, jamais compléter ») + 1× = nuance `hors_scope` vs `autre` (impact faible). Aucune divergence montants/IBAN sur le flux naturel. **Patch SIRET VALIDÉ le 2026-08-14 soir par replay ciblé** (`replay-shadow-v2.ts --ids`, 6 analyses dont le témoin Mailliane V2.pdf qui divergeait au 30/06) : 6/6 SIRET identiques V1=V2, y compris SIREN 9 chiffres recopié tel quel et siret=null non inventé. **Plus d'attente de flux naturel — GO Phase 3.3.** Le chemin critique restant est du CODE : le mode `EXTRACT_V2_ENABLED=on` est déclaré (`extract_shadow.ts`) mais PAS câblé dans `index.ts` — il faut écrire le chemin « V2 primaire + fallback V1 automatique » (~1 session), puis flip du secret avec rollback instantané (`on`→`shadow`).
- 🟡 **2 pages /etudes-vmd vides** : `erreurs-frequentes` + `oublis-frequents` (0 stats car peu de corrections dans la table). À fixer : (a) fallback "Données en cours d'accumulation" si stats.length===0 OU (b) attendre que Phase 2.4 remplisse la table OU (c) élargir la requête pour piocher dans `conclusion_ia.anomalies` direct (pas seulement les revues humaines).
- 🟡 **Observatoire** — plan complet livré dans chat 2026-06-30. Quick wins (~3h) : rebrand `/etudes-vmd` → `/observatoire`, 6 Materialized Views, templates métier/chantier, extension script `generate-observatoire.ts` → 60 pages d'un coup. Ensuite : 13 régions + 96 départements + 150 prix par job_type (V2/V3).
- 🟡 **Phase 3.3 — câblage mode "on" LIVRÉ le 2026-08-14** : `index.ts` route désormais l'extraction selon `EXTRACT_V2_ENABLED` — mode `on` = **V2 primaire** (domaine travaux uniquement, budget soft 60s) + **fallback V1 automatique** (échec/timeout V2, tracé dans `extract_comparisons` via `recordV2PrimaryFailure`) + **shadow inversé** (`runInvertedShadowV1` : V1 en background, mêmes rôles de colonnes → `phase3-analyze-shadow.ts` valide tel quel). Rollback express : `npx supabase secrets set EXTRACT_V2_ENABLED=shadow --project-ref vhrhgsqxwvouswjaiczn` (effet au prochain cold start). Reste Phase 3.4 : cleanup + bump `ENGINE_VERSION` → `"2.0.0-refonte"` après stabilisation.
- 🟡 **Phase 4 — tranche 1 LIVRÉE le 2026-08-15** : nouveau module déterministe [`src/lib/analyse/leviersBuilder.ts`](src/lib/analyse/leviersBuilder.ts) (17 tests vitest) → 2 nouveaux champs optionnels `ConclusionData.verdict_ligne` (verdict 1 ligne, **motif TOUJOURS nommé**, marge chiffrée) + `ConclusionData.leviers` (max 3, hiérarchisés puissant/important/bonus : entreprise > clauses rouges > quantités > espèces > **acompte 31-50% + comptes opaques (escaladé puissant, prio 82 — règle validée Johan 2026-08-20)** > acompte>50% > surcoût matériel > acompte 31-50% seul > clauses oranges > devis>12 mois > assurance > références fallback). Signaux `comptes_opaques`/`comptes_depuis` détectés depuis les critères scoring (`/comptes non (accessibles|publiés|déposés)/`) ; comptes opaques SEULS = zéro levier (le conseil de prudence de la fiche rendez-vous couvre, cf. `PreparationSections.conseilsPrudence`). Branchés dans `conclusion.ts` (chemin standard, best-effort try/catch) + hero `AvisSurLeDevis` (verdict_ligne prime sur les heuristiques) + nouveau composant `LeviersNegociation` dans `AvisEtPreparation`. Le levier « date devis > 12 mois » clôt la moitié Phase 4 du bug DEVIS-DATE. Fallback intégral pour les conclusions pré-Phase 4 (champs absents → UI historique). **Tranche 2 LIVRÉE le 2026-08-20** : `Levier.type` machine-lisible (12 types) ; message copiable ALIGNÉ sur les leviers (`levierQuestion` déterministe par type, questions leviers en tête du mail/SMS/WhatsApp, cap 5) ; fiche dédupliquée par sujet (`LEVIER_TOPIC_PATTERNS`) ; garde équipement partagée action V3.4.17 ↔ levier quantités (`unitsMissingEffective` — plus jamais « 1 ligne sur 1 ») ; leviers STRUCTURELS générés SOUS bypass incomplete_quote (quantités par définition + acompte/clauses/âge depuis critères, best-effort) et rendus par `AvisEtPreparation` sous la bannière (hors_scope/étranger/courtier restent sans leviers, voulu) ; détail poste-par-poste déjà replié (BlockPrixMarche `defaultOpen=false` sous « Aller plus loin »). Replays d'acceptance passés (Toiture Boxes / Maçonnerie 35 570 / Mélier / DUBOIS) — ⚠️ 2 specs d'acceptance de juin sont PÉRIMÉES : DUBOIS attendu « ne pas signer » mais la garde petit-devis V3.5.3 (validée Julien 03/07 sur CE devis) donne « à négocier » ; Mélier attendu « signer » mais le moteur actuel chiffre un écart matériel → « à négocier » avec postes nommés. **`ENGINE_VERSION = "1.2.0-refonte"`** — le stock régénère lazy à la visite ; effet de bord assumé : les analyses à signaux risqués repassent en `pending_review` à leur 1re revisite (Piste C by design, vu sur les replays — les review_status des replays ont été restaurés à la main).
- 🔴 **Phase C — validation auto contrôlée** — à coder quand 50+ revues humaines accumulées dans `analysis_corrections` (calibration confidence IA validatrice vs humain)

### Ce qui s'ARRÊTE immédiatement (rappel)

- ❌ **Plus de bumps `ENGINE_VERSION`** pour patcher un cas user signalé. Ne bumper qu'après livraison de phase (1.6 → 1.0.1, 3.x → 2.0.0, etc.).
- ❌ **Plus de "Garde n°X" inline** qui s'empile dans `extract.ts` / `verdictEngine.ts` / `market-matcher-vectorial.ts` / `score.ts` / `conclusion.ts`.
- ❌ **Plus de fix réactifs ad hoc** sur les bugs signalés. Chaque bug → **entrée dans [`docs/refonte/BUGS-A-CORRIGER.md`](docs/refonte/BUGS-A-CORRIGER.md)** qui devient un cas test du filet anti-régression de la phase qui le couvre.

### Filets de sécurité actifs pendant la refonte

1. **Piste C élargie au ratio aberrant** (`detectReviewTriggers` ratio > 5×) → analyse passe en `pending_review`, bannière bleue masque l'anomalie.
2. **Écran `/admin/reviews`** (Phase 2 livrée) → Julien peut désormais valider/corriger/rejeter les pending_review en quelques secondes. Chaque action écrit dans `analysis_corrections` (socle gold standard pour Phase 3 anti-régression).

### À chaque nouvelle session

Ouvrir [`docs/refonte/PLAN.md`](docs/refonte/PLAN.md) **AVANT** ce CLAUDE.md, et [`docs/refonte/BUGS-A-CORRIGER.md`](docs/refonte/BUGS-A-CORRIGER.md) si un user signale un bug. Pas de saut de phase. Pas de patch parallèle.

---

## 📚 Où trouver quoi

Ce fichier = **règles + pièges + décisions récentes** pour ne pas casser quand on code. C'est tout. Les tableaux exhaustifs (routes, tables, composants) sont **ailleurs** :

| Tu cherches… | Fichier |
|---|---|
| **Ce que l'utilisateur peut faire** (features prod + pain résolu + avantage marché + détail des 7 agents IA) | [`FEATURES.md`](FEATURES.md) |
| **Ce qu'on a commencé et pas encore fini** (en cours, partiellement implémenté, bloqué) | [`WIP.md`](WIP.md) |
| **Backlog — ce qu'on doit/veut faire mais qu'on n'a pas commencé** | [`TODO.md`](TODO.md) |
| **Référence technique exhaustive** (toutes les routes, schéma DB, pipeline, deploy) | [`DOCUMENTATION.md`](DOCUMENTATION.md) |
| **Comment marche le moteur de scoring, étape par étape** (qui décide quoi, déterministe vs LLM, limites assumées) — à lire avant d'expliquer la chaîne à quelqu'un | [`DOCUMENTATION.md` § 29](DOCUMENTATION.md) |
| **Ce que coûte une analyse** (modèle de coût mesuré, paliers d'alerte) | [`DOCUMENTATION.md` § 28](DOCUMENTATION.md) |
| **Plan de test E2E agent IA** (10 scénarios + cas d'erreur, avec 3 numéros WhatsApp GMC `+33633921577`/USER/ARTISAN + outils debug SQL) | [`TEST-PLAN-AGENT-IA.md`](TEST-PLAN-AGENT-IA.md) |
| **Historique détaillé V3.x du moteur de scoring** (cause racine + fix + anti-régression de chaque bump ENGINE_VERSION jusqu'à V3.5.16 inclus) | [`HISTORY.md`](HISTORY.md) |
| **🟢 Refonte en cours** (PLAN.md, BUGS-A-CORRIGER.md, RUSTINES.md, catalogue-classement/) | [`docs/refonte/`](docs/refonte/) |
| **Règles + pièges + décisions** | ← ce fichier |

**Si tu ajoutes une info** :
- Un user peut faire ça aujourd'hui ? → `FEATURES.md`
- C'est commencé mais pas terminé / bloqué / en réflexion active ? → `WIP.md`
- C'est une idée / un fix identifié mais qu'on n'a pas attaqué ? → `TODO.md`
- C'est exhaustif et stable (route, table, composant) ? → `DOCUMENTATION.md`
- C'est une règle / un piège / une décision récente que Claude doit savoir ? → ici

**Règle absolue WIP vs TODO** : un item ne va dans `WIP.md` qu'à partir du moment où on l'attaque (premier commit, première décision, premier code). Tant que c'est un "à faire" non démarré, c'est `TODO.md` exclusivement. Ne jamais polluer WIP avec du backlog non commencé — ça brouille la lecture "où on en est".

### 🔴 RÈGLE ABSOLUE — documenter AVANT de committer (Johan, 2026-08-29)

**La mise à jour de la doc fait partie du commit, pas d'un passage ultérieur.** Concrètement : quand un chantier est prêt à être committé, on écrit d'abord l'entrée `WIP.md` / `FEATURES.md` / `CLAUDE.md` / `DOCUMENTATION.md` qui va avec, puis on committe **le code et la doc ensemble**. Pas de « je documenterai à la fin de la session ».

Pourquoi c'est une règle et pas un conseil : une session entière (2026-08-27/29 — agent relecteur IA, boucle de capture des issues, tests d'intérêt, 4 crons réparés, catalogue 891→916) est partie en prod avec **zéro ligne de doc**, et le tableau de la refonte en tête de ce fichier affichait encore des statuts de juin. Le contexte de conversation est résumé quand il se remplit : ce qui n'est pas écrit dans un fichier est perdu, et Johan doit tout réexpliquer à la session suivante. Documenter à la fin = documenter depuis un résumé approximatif.

Exception unique : un fix trivial sans décision derrière (typo, renommage local). Dès qu'il y a une **décision**, un **piège** ou une **capacité utilisateur**, elle s'écrit avant le `git commit`.

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

- 🔴 **UNE SEULE VOIX SUR « CONNAISSONS-NOUS CE PRIX ? » (2026-09-10, devis AQUIVOLTAIQUE, retour Johan)** : la même page disait trois choses différentes. En tête : *« aucune des prestations de ce devis ne correspond à un tarif de référence que nous puissions opposer »*. Dans la répartition : des postes comptés **« Prix correct »** en vert. Dans le détail : *« Marché : 900 € – 2 200 € · **Plutôt cher** »*, *« Marché : 1 400 € – 3 500 € · **Dans la norme** »*. Consigne Johan : *« soit on connaît les prix soit on ne les connaît pas. »*
  **Chaque affichage avait sa propre règle, et c'est ça le défaut** — pas l'une des trois en particulier. Le serveur ne compte comme comparables que les groupes rapprochés en **confiance haute** (`conclusion.ts`, V3.5.13) ; l'UI affichait une fourchette et un verdict dès qu'une entrée catalogue avait été trouvée, quelle que soit la qualité du rapprochement. Sur le devis signalé, les 10 postes sortent en `medium` (0,767 au mieux), `low` ou `no_match` : **couverture 0 %**, et sept cartes portant un verdict de prix.
  **Mesuré sur le stock au 2026-09-10** : **37 analyses sur les 40** qui annoncent « rien de comparable » affichaient quand même au moins un verdict de prix ; **59 % de toutes les cartes** portant un verdict reposaient sur un rapprochement non fiable. Après correction : **37 → 4**, et les 4 restants sont des devis à 1-4 % de couverture où une ligne EST réellement comparée (formulation ajustée, cf. `aucuneReferenceDuTout`).
  La règle vit désormais dans [`referenceOpposable.ts`](src/lib/analyse/referenceOpposable.ts) (6 tests) et gouverne les trois affichages : le verdict de tête, la répartition, et chaque carte.
  - ⚠️ **L'asymétrie était le cœur du problème, et elle flattait toujours dans le même sens.** La garde de confiance existait depuis le 2026-06-09 (V3.5.11) mais ne se déclenchait **que sur `anomalie` et `survalue`** : on refusait d'ACCUSER sur un rapprochement incertain, on continuait d'ABSOUDRE dessus. Le poste ressortait « normal », donc **vert**. Un doute doit produire un doute, jamais un satisfecit. Elle est remontée en **garde 0** de `classifyRowEnriched` : sans référence sûre, ni le ratio, ni la garde surface, ni l'upgrade ligne ne veulent dire quoi que ce soit — ils raisonnent tous sur un chiffre auquel nous ne croyons pas.
  - **Un seul libellé pour un seul fait : « Prix non vérifiable »**, avec son explication. « Comparaison incertaine » laissait entendre qu'une comparaison avait quand même eu lieu — le lecteur se rabattait alors sur la fourchette affichée juste en dessous. La fourchette approchante n'est plus dans l'en-tête de carte : elle passe au dépli, **nommée pour ce qu'elle est** (« la référence la plus proche que nous ayons trouvée »).
  - **On ne se tait pas, on explique** : chaque carte non vérifiable dit pourquoi et vers quoi (« un second devis est le seul comparatif réel sur ce poste »), et la répartition porte sa ligne « N postes non vérifiables — ni bon marché ni cher : nous ne pouvons pas le dire ».
  - ⚠️ **Le titre d'une carte non vérifiable est la LIGNE DU DEVIS, pas notre étiquette catalogue.** Une carte titrée « Remplacement onduleur photovoltaïque » présente notre hypothèse comme le nom du poste, alors que le devis dit « Huawei onduleur hybride SUN2000L ». Même correction dans la phrase du verdict, qui citait comme exemples de postes *sans* référence… **les noms de trois entrées de notre catalogue**.
  - 🔴 **CE SEUIL N'EST PAS UN CURSEUR D'AFFICHAGE.** Le réflexe, devant −59 % de verdicts, est d'élargir à `medium`. **La bande 0,75–0,77 est fausse une fois sur deux** (mesure du 2026-08-30) : on n'obtiendrait pas plus de postes comparables, seulement plus de verdicts faux — exactement le défaut du 2026-09-04. Le levier pour couvrir davantage de postes est le **catalogue** et le **matcher**, jamais ce garde.
  - **L'auteur du feedback négatif est un employé de l'entreprise émettrice du devis** (analyse déposée à 18 h 20, avis négatif à 18 h 23, sans commentaire ni motif). On ne saura pas ce qu'il reprochait — mais la contradiction ci-dessus suffit à l'expliquer, et **il n'était pas nécessaire de la lui faire trouver.**

- **CONTRÔLE D'ABSENCE — ne jamais réclamer une quantité qui est écrite au devis (2026-08-30)** : `diagnostiquerQuantites()` (`src/lib/analyse/surfaceManquante.ts`) distingue « le devis est muet sur les quantités » de « nous les avons ratées à l'extraction ». Tant qu'une surface est écrite quelque part (`surfaceEcriteNonExtraite`), l'action « demandez un devis détaillé avec les unités » est **supprimée** : réclamer à l'artisan ce que son devis contient déjà fait perdre la confiance d'un coup. Mesure sur 220 devis FR : **133 (60 %) sans aucune quantité exploitable**, dont **3 seulement** où la surface était écrite — rare, mais entièrement détectable. C'est aussi la brique préalable pour **poser une question à l'utilisateur** (« quelle est la surface de la salle de bains ? ») : on ne la posera que sur une absence réelle. ⚠️ Piège rencontré en l'écrivant : `\b` est ASCII et ne borne pas « m² » — « 45 m² au total » n'était pas reconnu alors que « 45 m2 » l'était. Utiliser une anticipation négative, jamais `\b`, après un caractère non-ASCII. 14 tests.

- **Ajouter une entrée au catalogue = 3 gestes, jamais 1 (2026-08-30)** : (1) l'INSERT — attention, `metier` est contraint par `check_metier_enum`, reprendre une valeur existante (`maconnerie_structure`, `bardage_exterieur`, `plomberie_sanitaires`…) ; (2) **`node scripts/seed_market_prices_embeddings.mjs`** — sans embedding l'entrée existe mais reste **introuvable** par la recherche vectorielle ; (3) **vérifier en direct** que la description réelle du devis la remonte bien en tête. Le libellé doit être écrit **comme les artisans rédigent**, pas comme nous classons : « Lot plomberie complet d'un logement » ne remontait sur rien (0,73), « Plomberie et sanitaires — installation complète d'un logement » remonte en tête à 0,764 sur la ligne « Plomberie, Sanitaire (suivant plan) ». Enfin, une fourchette se **source** (web, barème) — jamais depuis nos propres devis, ce serait circulaire.

- **PROMOTION LEXICALE — le mot pour mot prime sur deux centièmes de similarité (2026-08-30)** : « Ponçage plafond et mur » trouvait « Ponçage murs et plafonds », la bonne entrée, à 0,762 — donc SOUS le seuil HIGH de 0,77 — et sortait du verdict en « comparaison incertaine ». `hasStrongLexicalMatch()` promeut un match `medium` en `high` quand (1) le nom de tête du libellé catalogue est présent dans la ligne, (2) ≥ 80 % de ses mots significatifs le sont, (3) le garde fourniture/pose passe. Les qualificatifs entre parenthèses du libellé sont ignorés, et le singulier/pluriel normalisé (« murs » ↔ « mur » : sans ça, le cas le plus évident du stock échouait). **Ne PAS remplacer ça par une baisse du seuil global** : l'inspection de la bande 0,75–0,77 montre que la moitié des rapprochements y sont faux (« ossature bois » → *clôture bois occultante*). Effet mesuré : 11 % du montant classé « moyen » promu. 5 tests dans `market-matcher-vectorial.test.ts`.

- **PROMOTION LEXICALE, SUITE — et surtout : LE PROBLÈME N'EST PAS LA RÈGLE, CE SONT NOS LIBELLÉS (2026-09-10)** : après le correctif de cohérence du 10/09, la question devenait « où récupérer les postes devenus *Prix non vérifiable* ? ». La bande de confiance moyenne pèse **854 groupes et 814 942 €, soit 47 % du montant rapproché** — c'est là qu'est l'argent. Deux changements livrés, mesurés avant/après sur le stock dédupliqué (103 documents) :
  - **Les qualificatifs de tarif ne comptent plus contre la ligne.** « Tableau électrique **neuf** » et « Tableau électrique 4 rangées norme NFC 15-100 » désignent la même chose ; aucun artisan n'écrit « neuf », et son absence faisait tomber la couverture à 2/3 au lieu de 2/2. Liste `QUALIFICATIFS_TARIF` volontairement courte — n'y entrent que des mots dont l'absence ne change pas la NATURE de l'ouvrage. ⚠️ « rénovation », « extérieur », « métallique », « bois » n'y ont pas leur place : ils distinguent des tarifs réellement différents.
  - **Garde de portée** : une ligne qui annonce un LOT ENTIER ne se compare pas au tarif d'un de ses composants. « Réfection totale du système électrique » (5 378 €) se promouvait sur « Tableau électrique neuf » — les mots concordent, le périmètre non. ⚠️ « l'ensemble de… » a été **retiré** de cette liste après mesure : la tournure dit le plus souvent l'étendue d'une prestation unique (« l'ensemble de la peinture plafond »), pas un lot multi-métiers ; elle faisait perdre trois promotions justes pour en bloquer une douteuse.
  - 🔴 **LE OU EST DÉLIBÉRÉ, ET C'EST LA LEÇON RÉUTILISABLE.** La première version REMPLAÇAIT la règle d'origine par la nouvelle : mesurée, elle gagnait 9 promotions et en **perdait 26** — le plancher de deux mots discriminants tuait les libellés courts qui marchaient déjà. Un correctif ne doit pas défaire ce qu'il ne visait pas : la règle est désormais « ancienne condition **OU** nouvelle », strictement additive. **Sans la mesure avant/après, ce commit partait en prod en régression nette.**
  - **Résultat : 73 → 77 promotions, +9 503 €, zéro perte.** Les 4 gagnées ont été relues une par une (3 tableaux électriques, 1 porte de garage sectionnelle) : toutes justes.
  - 🔴 **LE PLAFOND EST MESURÉ, ET IL EST BAS — ne pas remettre d'énergie dans la règle.** L'entonnoir de la bande moyenne : **54 % des groupes (461, 408 k€) échouent parce que le nom de tête de NOTRE libellé est absent de la ligne**, 37 % parce que moins de 80 % des mots y sont, et **0** à cause de la garde fourniture/pose. Relâcher la règle du nom de tête n'ajoute que **7 groupes (8 222 €), dont 2 faux** (« Pose de porte de douche » → *Création niche de douche*) — testé, écarté. La cause est ailleurs : nos libellés sont écrits dans un autre registre que les devis — tête de catégorie (« **Porte** coulissante galandage » contre « Coulissant à galandage 2 vantaux »), préfixe générique (« **Travaux** de préparation et application de deux couches de peinture » contre « Mise en Peinture Calista Mat »), morphologie (« coulissante » ≠ « coulissant », la lemmatisation ne coupe que le -s/-x final). **Le levier restant est la RÉÉCRITURE des libellés** (règle déjà posée le 2026-08-30, jamais appliquée aux entrées anciennes) ou l'ajout d'alias embarqués dans l'embedding — pas une règle de promotion plus maligne.
  - ⚠️ **La confiance est calculée à l'analyse et STOCKÉE** : ce correctif ne change rien au stock, il agit sur les analyses à venir. Le +9 503 € est une projection de la règle sur les données passées, pas un gain rétroactif.

- 🔴 **RÉÉCRIRE LES LIBELLÉS DU CATALOGUE : HYPOTHÈSE MESURÉE, PUIS ABANDONNÉE (2026-09-10)** — et le vrai chiffre était ailleurs. L'entonnoir du 10/09 disait que 54 % de la bande de confiance moyenne échoue parce que le nom de tête de NOTRE libellé est absent de la ligne de devis (« **Porte** coulissante galandage » contre « Coulissant à galandage 2 vantaux »). La conclusion évidente — réécrire les libellés en mettant l'objet en tête — a été construite, mesurée de bout en bout, et **refusée**.
  - **Le harnais d'abord** : [`scripts/rejeu-rapprochement.mjs`](scripts/rejeu-rapprochement.mjs) rejoue tout le stock hors production — il reconstitue le texte de requête EXACT de la prod (description + `Catégorie :` + `Unité :`, la catégorie étant retrouvée dans `extracted.travaux`), embarque une fois (cache disque), charge les 919 vecteurs du catalogue et classe en local. ⚠️ **Il se vérifie avant de servir** : top-1 identique à la prod sur 67 % des lignes, et surtout **écart de similarité médian NUL** quand il concorde — c'est ça qui prouve la mécanique, pas le taux de concordance (les divergences viennent du catalogue qui a changé depuis les analyses anciennes).
  - **Variante A — « Objet — action »** (`Chauffe-eau — remplacement`) : **0 gain, 18 pertes**. Toutes les similarités BAISSENT. Le tiret cadratin fait une phrase moins naturelle, et l'embedding le sent. Réfutée net.
  - **Variante B — « Objet (action) »** (`Chauffe-eau (remplacement)`) : +82/−6 en brut, ramenée à **+28/−7 (+7 899 € contre −2 348 €)** une fois les faux rapprochements écartés. Sur 815 000 € de bande moyenne, c'est **0,7 %** — et la relecture des 28 gains en trouve **4 faux** (« Sous-couche pour parquet flottant » → *Parquet flottant (pose)*, « Pose de porte de douche » → *Niche de douche (création)*). Un gain marginal payé en faux positifs opposables : abandonné.
  - **Deux gardes écrites pour l'occasion ont été RETIRÉES faute d'effet mesurable** : `isRemovalVsInstallMismatch` (déposer n'est pas poser) ne se déclenche **jamais** sur le catalogue actuel, et le plancher de deux mots ne retirait que 2 promotions. La règle du fichier — « plus de garde n°X qui s'empile » — s'applique à moi aussi : une garde sans mesure ne rentre pas.
  - 🟢 **CE QUE LA MESURE A TROUVÉ À LA PLACE, ET QUI VAUT DIX FOIS PLUS.** Rejouer le stock sur le catalogue d'AUJOURD'HUI : **440 lignes passent en confiance haute contre 2 qui la perdent** (336 529 €). La part vérifiable du montant passe de **37 % (telle que stockée) à 56 %**, la couverture MÉDIANE par devis de **29 % à 63 %**, et le nombre de devis dont aucun poste n'est chiffrable de **30 à 17 sur 100**. Autrement dit : le « 63 % non vérifiable » mesuré la veille décrit un corpus rapproché contre des catalogues périmés, pas ce que l'outil sait faire aujourd'hui. **Tout chiffre de couverture tiré du stock est un chiffre d'archive** — il faut le rejouer avant de le citer, et avant d'en déduire un chantier.
  - ⚠️ Le 56 % est un PLAFOND : le classement local n'applique pas les gardes de rejet de la production (métier exclusif, overlap lexical, ratio invraisemblable), qui renverraient une partie des `no_match → high` à `no_match`. Les transitions `medium → high` (339 lignes) sont le noyau solide.

- 🔴 **L'EMBEDDING N'EST PAS LE PROBLÈME — NI SA DIMENSION, NI LA COMPOSITION DU TEXTE (2026-09-10, banc de mesure)** : dernier levier « technique » supposé, fermé par la mesure. Banc : [`scripts/banc-embedding.mjs`](scripts/banc-embedding.mjs), 317 paires d'étalon.
  - **Le modèle est matriochka** : tronquer un vecteur 3 072 à ses 768 premières composantes puis le renormaliser donne un cosinus de **1,000000** avec ce que l'API renvoie pour `outputDimensionality=768`. Une seule passe d'embedding suffit donc à comparer toutes les dimensions — et surtout, **le 768 ne perd rien que le 3 072 saurait rattraper** : rang 1 à **56 % en 768, 56 % en 1 536, 56 % en 3 072**. Migrer la colonne `vector(768)` ne servirait à rien. Question close.
  - **La composition du texte ne fait pas davantage** : six variantes (libellé seul / + précisions / actuelle, croisées avec requête brute ou enrichie de la catégorie et de l'unité) tiennent toutes entre **49 % et 57 %** de rang 1. Le meilleur gagne **un point** sur la configuration en production. Question close.
  - 🔴 **LE VRAI RÉSULTAT : L'ESPACE EST SATURÉ.** La bonne entrée devance sa poursuivante de **0,006 en médiane** (0,778 contre 0,769). Toute la discrimination se joue dans quelques millièmes. Deux textes SANS AUCUN RAPPORT (« plancher poutrelles-hourdis » et « peinture murs et plafonds ») sortent à **0,85** l'un de l'autre. **L'échelle absolue de similarité ne veut rien dire** — d'où la fragilité chronique du seuil, descendu de 0,85 à 0,77 en juin faute de pouvoir l'atteindre. Ne plus raisonner en « il faut monter la similarité » : c'est un raisonnement sur une règle sans graduations.
  - 🟢 **CE QUI OUVRE LA SUITE : la recherche TROUVE, elle ne CLASSE pas.** Rang de la bonne entrée sur l'étalon : **1er dans 56 % des cas, dans les 3 premiers dans 78 %, dans les 5 premiers dans 86 %**. L'écart entre 56 % et 86 % est le gisement — et il ne se récupère ni par un meilleur vecteur ni par un meilleur libellé, mais par un **re-classement du top-5 avec les signaux non vectoriels qu'on a déjà** (recouvrement lexical, compatibilité d'unité, métier, plausibilité de prix). Aujourd'hui `matchSingleLineVectorial` prend le top-1 et descend la liste tant qu'une garde rejette : c'est un filtre, pas un classement.
  - ⚠️ **L'étalon est construit lexicalement** (une seule entrée dont tous les mots du libellé figurent dans la ligne) — c'est ce qui le rend indépendant du vectoriel qu'il juge. **Il ne peut donc PAS valider un re-classement lexical** : ce serait circulaire. Mesurer cette piste demandera un échantillon relu à la main.

- 🔴 **ÉTALON HUMAIN DU RAPPROCHEMENT — 150 LIGNES RELUES PAR JOHAN LE 2026-09-10, ET LE RÉSULTAT FAIT MAL** : première mesure de la QUALITÉ du rapprochement contre un jugement humain, et non contre une règle automatique. Feuille construite par [`scripts/feuille-relecture-rapprochement.mjs`](scripts/feuille-relecture-rapprochement.mjs) : 150 lignes de devis tirées au sort (120 incertaines + 30 témoins déjà en confiance haute, mélangés et non signalés), chacune avec les 5 candidats du catalogue, **sans leurs fourchettes de prix** — sinon le relecteur choisit celle qui tombe juste et l'étalon devient circulaire.

  | | jugeables | bonne réponse au rang 1 | au rang 2-5 | aucune ne convient |
  |---|---:|---:|---:|---:|
  | Incertaines (masquées aujourd'hui) | 111 | **33 %** | 23 % | 43 % |
  | **Témoins (prix AFFICHÉ aujourd'hui)** | 29 | **62 %** | 31 % | 7 % |
  | Ensemble | 140 | 39 % | 25 % | 36 % |

  - 🔴 **LE CHIFFRE QUI COMPTE : SUR LES PRIX QUE NOUS AFFICHONS COMME VÉRIFIÉS, LE POSTE DE RÉFÉRENCE EST LE BON DANS 62 % DES CAS.** Près de quatre sur dix sont comparés à une autre prestation que la leur — et **7 lignes sur 140 n'ont AUCUNE bonne réponse dans le catalogue alors que leur similarité dépasse 0,77**, donc sont chiffrées quand même. Ce n'est pas un défaut d'affichage (corrigé le 10/09) : c'est un défaut de FOND, et il était invisible tant qu'on mesurait le rapprochement avec des règles automatiques.
  - **Le re-classement du top-5 est confirmé comme levier, et son plafond est chiffré** : 25 % des lignes jugeables ont leur bonne réponse au rang 2-5 — dont **19 au rang 2** et 16 au rang 3+. Un re-classement parfait porterait l'ensemble de 39 % à 64 %, et les témoins de 62 % à 93 %. L'écart de similarité entre le mauvais premier et la bonne réponse est de **0,0088 en médiane** : c'est bien un problème de départage, pas de recherche.
  - 🔴 **MAIS LE PLUS GROS BLOC N'EST PAS LÀ : 36 % des lignes n'ont AUCUNE bonne réponse parmi les cinq** (43 % dans la bande incertaine). Aucune règle de classement ne récupérera celles-là — c'est du catalogue manquant, ou des lignes qui n'ont pas à être chiffrées.
  - **Trois familles de manques reviennent, nommées par le relecteur** : les **déposes** (« c'est une dépose, aucun candidat n'en est une » — L007, L028, L051, L141, L150), les **lignes de chantier non-travaux** (démarches administratives, Consuel, Dommage-Ouvrage, éco-participation, suivi de travaux, livraison, location de matériel : une quinzaine de lignes), et des **variantes matière absentes** — gouttière **aluminium** citée deux fois (L064, L098), menuiseries **avec volet roulant intégré** deux fois (L058, L130).
  - **10 lignes sur 150 sont INJUGEABLES même par un humain** (« Larg 1300 mm × Haut 1660 mm », « des bastaing sabots et aggloméré de 22 mm au »). C'est une borne dure : aucune amélioration du moteur ne les rattrapera, et c'est utile de le savoir avant de se fixer un objectif.
  - ⚠️ **Limites à garder en tête** : un seul relecteur, une seule passe, quelques réponses données comme peu sûres ; et les candidats ont été calculés sur le catalogue d'AUJOURD'HUI alors que le groupe témoin tient son statut du catalogue de l'époque — ce qui joue plutôt en notre faveur, pas contre.
  - ⚠️ **L'étalon ne peut PAS vivre dans le dépôt** : il contient des lignes de devis de clients réels et le dépôt est public. Il est aujourd'hui en local (`relecture-reponses.json` + `relecture-rapprochement.cle.json`, tous deux dans `.gitignore`). **À persister dans une table Supabase** — un fichier sur un poste est un actif qu'on perdra (`TODO.md`).

- 🔴 **LES MÊMES 150 LIGNES RELUES PAR L'IA — ET LA PRIORITÉ S'INVERSE (2026-09-10, idée Johan)** : gemini-2.5-pro a reçu **exactement** ce que Johan avait — même ligne, même contexte, mêmes cinq candidats sans leurs prix, même consigne — à une différence près : **l'ordre des candidats est tiré au hasard pour chaque ligne**, sinon on ne distingue pas un jugement d'un réflexe « je prends le premier ». (Vérifié : quand elle choisit, elle tombe sur le top-1 vectoriel dans 52 % des cas malgré le mélange — c'est du signal, pas de l'ancrage.)
  - **L'IA est un meilleur juge que notre top-1** : elle est d'accord avec Johan sur **55 %** des 140 lignes tranchées, contre **39 %** pour le top-1 vectoriel.
  - **Elle est beaucoup plus prudente** : 81 « aucun ne convient » contre 50 pour Johan. Elle refuse 34 fois là où il a choisi — et **n'invente un rapprochement que 7 fois** sur les 50 où il dit qu'il n'y en a pas. Sa faiblesse n'est pas l'hallucination, c'est l'abstention.
  - ⚠️ **DEUX JUGES COMPÉTENTS NE S'ACCORDENT QUE SUR 55 % DES CAS.** C'est le résultat le plus structurant : la tâche est en partie subjective, et **un étalon bâti sur un seul relecteur a ce plafond-là**. L'étalon de référence est donc le **CONSENSUS** — les **77 lignes** où les deux juges disent la même chose. Toute mesure future se fait dessus.
  - 🔴 **SUR CE CONSENSUS, LA PRIORITÉ N'EST PAS CELLE QUE J'AVAIS ANNONCÉE.** **42 des 77 lignes (55 %) n'ont AUCUNE entrée valable dans le catalogue.** Et sur les 35 où une bonne réponse existe, **le top-1 vectoriel est le bon dans 77 % des cas**. Autrement dit : **le matcher est correct, c'est le catalogue qui manque.** Le « 39 % » brut mélangeait les deux problèmes et faisait accuser le mauvais coupable — j'avais conclu au re-classement, la mesure dit le catalogue.
  - **L'IA en garde-fou plutôt qu'en sélectionneur — mesuré, et c'est un arbitrage, pas une évidence** : sur les 48 lignes que l'outil chiffre aujourd'hui (similarité ≥ 0,77), **19 reposent sur une référence fausse**. L'IA en bloquerait **9 sur 19 (47 %)**, mais bloquerait aussi **7 des 29 bonnes (24 %)**. Elle attrape la moitié des erreurs et coûte un quart des prix justes : à trancher en produit, pas en technique.
  - **Plusieurs désaccords donnent raison à l'IA**, avec des motifs solides : « Pose de carrelage avec fourniture de la colle » → elle choisit *Pose carrelage sol (hors fourniture)* en notant que le carrelage n'est pas fourni ; « Point d'applique, hors installation » → elle refuse les postes de pose. Le relecteur humain le dit lui-même : il ne détient pas la vérité absolue. **Ne pas traiter les réponses humaines comme un oracle.**

- **CATALOGUE — HUIT ENTRÉES DÉSIGNÉES PAR L'ÉTALON, DEUX DOUBLONS TRANCHÉS (2026-09-10, validé Johan)** : migration `20260910140000`, catalogue **919 → 925** entrées. Ce ne sont pas des idées mais des trous constatés — chaque entrée cite dans `source` la ligne de l'étalon qui l'a fait apparaître. Gouttière **aluminium** (45-105 €/ml), **couvertine** alu (50-100 €/ml), **liteaunage** (15-50 €/m²), **dépose de couverture** (20-30 €/m²), **dépose d'appareil sanitaire** (80-300 €/u), **fenêtre** et **porte-fenêtre PVC avec volet roulant intégré** (700-1 800 et 1 150-2 800 €/u), **attestation Consuel** (77-235 €/u).
  - **Le Consuel est la seule entrée du catalogue au prix PUBLIC et exact** : 76,37 € (vert), 144,67 € (jaune, habitation), 233,62 € (contre-visite), tarifs 2026. Sur la ligne qui l'a motivée, l'artisan facturait 170 € l'unité — marge légitime, désormais vérifiable.
  - **Vérifié en direct, troisième geste obligatoire** : 11 des 12 lignes réelles concernées remontent la nouvelle entrée **en tête** (couvertine 0,829, dépose de tuiles 0,829, liteaunage 0,787, dépose sanitaire 0,786…). La 12ᵉ (« NAISSANCE G300 », un accessoire de gouttière) reste sur « Pose gouttière » — acceptable.
  - **Aucune régression** : `score-rapprochement.mjs` donne 27/35 avant comme après. Les 8 entrées n'ont délogé aucune bonne réponse.
  - 🟢 **LE GAIN, MESURÉ APRÈS RE-SOUMISSION DES 11 LIGNES** (le score ne pouvait pas le voir seul : elles étaient jugées « aucune entrée valable », vrai des cinq candidats de l'époque, faux depuis qu'une sixième existe) :

    | Étalon de consensus | avant | après |
    |---|---:|---:|
    | Lignes sans aucune entrée valable | 42 / 77 (**55 %**) | 33 / 76 (**43 %**) |
    | Bonne réponse trouvée en 1er | 27 / 35 (**77 %**) | 35 / 43 (**81 %**) |
    | Témoins (prix déjà affichés) | 12 / 15 | 13 / 16 |

    ⚠️ **Ces chiffres valent pour l'étalon à 76 lignes.** Deux lignes de ravalement y ont été versées le soir même (les enduits à la chaux du devis COUREL, 79 % de son montant, tous deux rapprochés en confiance HAUTE d'un *Enduit chaux intérieur (tadelakt/stucolustro)*) : l'étalon compte 78 lignes et le score descend à **35/44 (80 %)**, dont **13/17 sur les témoins**. C'est le comportement voulu — capter un échec réel fait BAISSER le score, et c'est ce qui rend la mesure utile. ⚠️ Sur la première de ces deux lignes, la bonne entrée existe et arrive **2ᵉ à 0,0037 de similarité** : trente-sept dix-millièmes séparent un enduit décoratif d'intérieur d'un enduit de façade, sur 6 020 €. Aucun réglage de seuil ne corrige ça — seul un départage par les mots le peut.

    **Les 8 nouvelles entrées sortent toutes en tête sur les lignes qui les ont motivées.** Deux lignes restent sans réponse et disent pourquoi : « Dépose de deux rangées de tuiles » est facturée au **ml** (faîtières) quand notre entrée est au **m²**, et « NAISSANCE G300 » est un **accessoire** de gouttière, pas du mètre linéaire posé. ⚠️ **Toute évolution du catalogue périme l'étalon sur les lignes qu'elle comble** : il faut re-soumettre celles-là, sinon le score sous-estime durablement le catalogue.
  - **Deux doublons supprimés**, tranchés sur sources et non au jugé : *semelle filante béton* (80-200 €/ml conservé, 180-520 supprimé — les sources convergent sur 80-200 pour le cas courant ; ⚠️ c'était pourtant la PLUS utilisée du stock, 3 rapprochements contre 1 : **l'usage ne fait pas la justesse**) et *écran de sous-toiture HPV* (8-32 et 5-14 fusionnés en **6-20 €/m²**, sourcé). Recherche systématique menée sur les 919 entrées à périmètre et unité égaux : **seulement 2 vrais doublons**, ce n'est pas un mal systémique. ⚠️ Un premier détecteur en annonçait 49 — il supprimait justement les mots qui distinguent « pose seule » de « fourni+posé ».

- 🔴 **TROIS FRAIS DE CHANTIER ÉCARTÉS PLUTÔT QUE TARIFÉS — ET UNE POMPE À BÉTON AJOUTÉE (2026-09-10, validé Johan)** : sur les six familles de lignes « non-travaux » relevées par l'étalon, **une seule est chiffrable** — la pompe à béton (entrée créée, 300-900 € forfait, retrouvée à **0,806** sur la ligne réelle). Les trois autres sont écartées par `estFraisNonChiffrable()`, chacune pour une raison propre : l'**éco-participation** est un barème réglementé PAR PRODUIT qui change au 1er août 2026 puis au 1er janvier 2027 — aucune valeur écrite ne resterait vraie ; le **dommages-ouvrage** est une prime d'assurance à 1-3 % du montant des travaux, un pourcentage qu'une entrée ne sait pas exprimer, et il est déjà traité par le levier `assurance_do_montant` ; la **livraison / amenée-repli / logistique** va de 120 € à 825 € sous le même intitulé selon la distance et l'engin.
  - 🔴 **LE FRAIS DOIT ÊTRE L'OBJET DE LA LIGNE : la garde ne cherche que dans les 40 PREMIERS CARACTÈRES.** Sans cette ancre, deux lignes de **volet roulant** — vrais travaux, rapprochés en confiance haute — étaient écartées parce que leur fiche produit se termine par « Dont éco-contribution REP PMCB : 0,52 € HT ».
  - ⚠️ **« livraison » a été RETIRÉ de la garde après mesure.** Même ancré en tête, il écartait « Livraison, installation et étanchéité de la baignoire » et « Fourniture et livraison du mobilier de cuisine » — deux vrais travaux en confiance HAUTE — pour n'attraper qu'**une seule** ligne de logistique. Seul « frais de livraison » reste, sans ambiguïté.
  - **Mesuré** : 25 lignes écartées sur 1 938 (**1,3 %**), 11 prestations intellectuelles et 14 frais, toutes légitimes, et **zéro bonne réponse de l'étalon détruite**. 14 tests, dont un par piège rencontré.
  - 🔴 **LA LEÇON, VALABLE POUR TOUTE GARDE FUTURE** : les deux faux positifs n'ont PAS été vus à la relecture du code, mais par le contrôle automatique contre l'étalon. **Une garde se mesure contre les bonnes réponses connues avant d'être livrée**, jamais après.

- 🔴 **GARDE PRESTATIONS INTELLECTUELLES — RÉTABLIE APRÈS QUATRE MOIS D'ABSENCE (2026-09-10, validé Johan)** : `estPrestationIntellectuelle()` dans `market-matcher-vectorial.ts`, appelée **avant l'embedding** (inutile de payer un appel Gemini pour une ligne qu'aucune entrée ne peut chiffrer). Maîtrise d'œuvre, bureau d'études, honoraires, permis de construire, déclaration préalable, démarches administratives, suivi de chantier, géomètre, relevé topographique : leur prix dépend du chantier — un pourcentage du montant des travaux — pas d'un tarif unitaire.
  - **L'équivalent existait en V3.6** (`isNonWorkSignature`, mai 2026) et **n'a jamais été reporté lors du passage au matcher vectoriel** : ces lignes cherchaient un prix depuis quatre mois. C'est la relecture du 10/09 qui l'a rendu visible.
  - 🔴 **NE PAS RECOPIER LA LISTE DE MAI : ELLE EST PÉRIMÉE.** Elle bloquait « diagnostic », « audit » et « expertise » — or le catalogue compte désormais **24 diagnostics réglementaires avec de vrais prix** (DPE 90-220 €, amiante 80-180 €, Carrez 70-150 €, étude thermique RE2020 400-1 200 €). Les bloquer détruirait des rapprochements justes. « étude » seul n'est donc pas bloquant : seules les études de conception le sont (sol, structure, faisabilité, exécution, géotechnique).
  - **Mesuré avant de livrer** : 11 lignes écartées sur 1 929 (0,6 %), toutes légitimes — dont « ETUDE STRUCTURE OUVERTURE MUR PORTEUR » qui était rapprochée d'« Ouverture mur porteur », soit le prix des travaux opposé au prix de l'étude. Et **zéro bonne réponse de l'étalon détruite**. 14 tests.
  - ⚠️ Piège rencontré : « suivi **des** travaux » est la forme courante sur les devis ; n'accepter que « de » ratait le cas réel qui a motivé la garde.
  - ⚠️ **Le harnais de test de ce fichier appelait `fn()` HORS du `try`** : un échec synchrone tuait tout le fichier au lieu d'être compté, ne laissant qu'une pile d'appels. La suite ne « passait » que tant qu'elle passait. Corrigé le 2026-09-10.

- **GARDE D'UNITÉ — un prix au m² ne se compare pas à un forfait (2026-08-30, cas ALES sdb)** : une ligne « Dépose totale des cloisons » facturée 8 950 € en forfait (unité `U`, quantité 1) était comparée à un catalogue 15–40 €/m². Le calcul faisant `40 × 1 = 40 €` de référence, il en sortait 8 910 € de « surcoût » — un montant né d'une multiplication par une quantité inexistante. Sur ce seul devis, 5 groupes étaient dans ce cas : écart annoncé 8 868–12 669 € sur un devis de 22 150 €, ramené à **1 070–1 528 €** par la garde. `hasIncomparableUnit()` dans `conclusion.ts` : si le tarif catalogue est unitaire ET métrique (m²/ml/m³) alors que la ligne de devis n'a pas de quantité dans cette unité, le groupe est exclu de `computeServerSurcout`. Complète `hasSurfaceUnitMismatch` (qui ne couvrait que les libellés « surfaciques »). ⚠️ Le matcher continue de PRODUIRE ces matchs — seul le chiffrage les ignore ; la garde côté matcher reste au backlog.

- **ON NE CHIFFRE QUE CE QU'ON PEUT NOMMER (2026-08-30, cas ALES sdb)** : le levier annonçait « 7 405 à 13 751 € » en ne citant qu'un poste à 887 €, et le hero reprenait le même agrégat. Un montant que le détail ne justifie pas est indéfendable face à l'artisan et détruit la confiance. Nouveau signal `surcout_nomme` (somme des `surcout_estime` des anomalies nommées) : le levier `surcout_postes` ET `verdict_ligne` ne chiffrent QUE ce montant. Sans poste nommé, on garde le libellé estimatif global sans l'attribuer à une ligne précise.

- **Ne pas réclamer ce que le devis prévoit déjà (2026-08-30, cas ALES sdb)** : le devis prévoyait « 5 % en fin de travaux » et on conseillait quand même « demandez une retenue de garantie de 5 % ». Signal `solde_final_pct` (dernière échéance à `fin_travaux`/`reception`/`solde`) → le conseil devient « transformez ces 5 % en véritable retenue ». La nuance juridique est réelle et doit rester dite : un **solde versé à l'achèvement n'est PAS une retenue de garantie**, qui se conserve un an après la réception et se libère à la levée des réserves.

- **AUCUN MONTANT SANS POSTE NOMMÉ — l'invariant, et ses 4 fuites (2026-09-05, retour Johan)** : la règle du 2026-08-30 (« on ne chiffre que ce qu'on peut nommer ») était énoncée mais **pas appliquée** : le code gardait partout un repli qui affichait quand même l'agrégat. Mesure avant correctif : **22 analyses sur 69 annonçant un montant (32 %) n'avaient AUCUNE anomalie bornée pour l'étayer**, dont une à 37 951 €. Quatre chemins produisaient le chiffre, il fallait les fermer tous les quatre — en fermer trois laissait le défaut intact :
  1. `surcoutMin/Max` reprenait **`parsed.surcout_global`, le chiffre écrit par Gemini**, dès que `computeServerSurcout` rendait 0. **Supprimé** : le montant ne vient plus que du calcul serveur ou de la somme des anomalies bornées.
  2. `buildVerdictLigne` avait une branche « aucun poste nommé : on reste sur l'agrégat » → *« quelques postes dépassent les fourchettes (X–Y € d'écart estimé) »*. **Supprimée.**
  3. `verdict_ligne.marge` ne dépendait que de `surcout.max >= 300`. **Exige désormais `anomalies_postes.length > 0`.**
  4. Le levier `surcout_postes` sortait sans nom (« Négociez les postes au-dessus du marché » + fourchette). **`aDesPostes` devient une condition, plus seulement un wording.**
  ⚠️ Pour ne pas PERDRE d'information en se taisant, `computeServerSurcout` retourne maintenant **les postes qui composent l'écart** (`{label, ecart}`, triés) ; `anomalies_postes` et `surcout_nomme` s'en servent en dernier ressort quand Gemini n'a nommé aucune anomalie. Les 20 cas où l'écart était réel mais anonyme deviennent donc **nommés**, pas silencieux — seuls restent muets ceux qu'aucune ligne ne porte. Un chemin hérité côté UI (`AvisSurLeDevis`, conclusions sans `verdict_ligne`) exigeait aussi d'être fermé : il annonçait « environ X € peuvent être renégociés » sur le seul `surcout_global.max > 0`. **Un test de 2026-08-30 a changé de sens** (il vérifiait le repli anonyme) : c'est délibéré et commenté sur place.

- **UN ÉCART QU'AUCUNE FOURCHETTE NE BORNE N'EST PAS UN MONTANT (2026-09-05, cas EC'eau, climatisation 12 666 € HT)** : la page annonçait « un poste dépasse les fourchettes du marché, environ 1 000 € d'écart » et « marge de négociation : 800 à 1 200 € » — au-dessus de **12 postes affichés « prix correct »**, d'un seul « légèrement élevé », et d'un paragraphe disant qu'on n'avait pas pu comparer. L'utilisateur ne pouvait rattacher ces 1 000 € à rien. Origine : Gemini avait produit une anomalie sur « Ensemble des prestations de climatisation » avec **`fourchette_min` ET `fourchette_max` à `null`**, un `surcout_estime` de 1 000 €, et pour explication *« les prix de référence marché sont absents […] le surcoût estimé représente une marge de négociation potentielle »* — soit : il n'y a pas de référence, donc j'invente une marge. **Deux trous, pas un.** (1) Une anomalie sans aucune borne ne peut plus porter de `surcout_estime` — un écart se calcule CONTRE quelque chose (2 anomalies sur 117 dans le stock : rare, mais indéfendable face à l'artisan, qui demandera « 1 000 € par rapport à quoi ? »). (2) Surtout, le repli de `surcoutMin/Max` reprenait **`parsed.surcout_global`, le chiffre de Gemini**, dès que `computeServerSurcout` rendait 0 — c'est-à-dire précisément quand tous les groupes avaient été écartés pour confiance insuffisante. C'est de là que venaient réellement les 800–1 200 €, et la garde sur les anomalies seule ne l'aurait **PAS** attrapé. Nouveau verrou `surcoutInterdit` = `rienDeComparable && serverSurcout.max <= 0` ⇒ surcoût nul. Le repli LLM survit quand une part réelle du devis a été rapprochée.

- **GARDE 4 DU MATCHER — MÉTIERS À PÉRIMÈTRE EXCLUSIF (2026-09-05, cas EC'eau)** : la ligne « Mise en service comprenant : Mise en pression azote / Tirage au vide / Mise en gaz / Délivrance du cerfa » d'un devis de **climatisation** a été rapprochée de **« Mise en service piscine / hivernage »**. Les 3 gardes existantes laissent toutes passer : « mise en service » est commun aux deux libellés (overlap lexical OK), ce n'est pas un antonyme fourniture/pose, le ratio de prix est plausible. Aucune ne regardait de quel **métier** relève l'entrée catalogue — le champ existe pourtant, **renseigné sur les 919 entrées** (33 métiers distincts), il n'était simplement pas remonté par la recherche vectorielle (migration `20260905120000`, colonne ajoutée en fin de table de retour de `search_market_prices_v2`). ⚠️ **La règle n'est PAS « même métier des deux côtés »** — ce serait faux et destructeur : une ligne de plomberie dans un devis de salle de bains se compare légitimement à une entrée `carrelage_faience`, et le devis n'a de toute façon pas de métier fiable au niveau de la ligne. La règle est étroite : **7 métiers désignent un OUVRAGE à part entière** (`ouvrages_piscine`, `ouvrages_anc`, `ouvrages_ascenseur`, `ouvrages_geothermie`, `ouvrages_photovoltaique`, `diagnostic_reglementaire`, `prestations_intellectuelles`) ; leur tarif n'est un comparatif valable que si la ligne **ou le contexte du devis** mentionne cet ouvrage. Le contexte = concaténation des libellés du devis, pour ne pas rejeter la ligne « Local technique » d'un vrai devis de piscine. **Mesuré sur 2 224 groupes du stock : 16 rejets, soit 0,72 %**, et tous de vrais faux positifs — « Plage en wedi » (receveur de douche) → *plage piscine bois*, « DCL » (dispositif de connexion luminaire) → *diagnostic électricité*, « échelle à toit et harnais » → *mise en conformité sécurité piscine*. Le seul faux rejet du banc de mesure (« Label RE2020 » → *Étude thermique RE2020*) a été corrigé en ajoutant `re2020|rt2012|thermique` au marqueur. **Garde inopérante et jamais bloquante si la RPC ne renvoie pas `metier`** (déploiement partiel). 7 tests.

- **UNE CONCLUSION ÉCRITE PAR UN HUMAIN NE SE FAIT PAS ÉCRASER PAR LA MACHINE (2026-09-04)** : l'invalidation du cache ne regardait que `engine_version`. Un bump régénérait donc TOUT, y compris les analyses qu'un expert avait réécrites — verdict corrigé, surcoût annulé, anomalies décochées et `expert_message` remplacés par une sortie machine fraîche, **en silence, à la première revisite**. Mesuré juste avant le bump 1.2.0 : **22 analyses `corrected`, dont 3 portant un message affiché au client**. Le cache sert désormais la conclusion telle quelle quand `review_status === "corrected"`, quelle que soit la version du moteur. Distinction qui porte toute la règle : **`corrected` = un humain a réécrit le CONTENU → intouchable** ; **`validated` = un humain a approuvé le contenu machine → régénérable**, c'est le comportement voulu puisque le moteur progresse. Échappatoire délibérée : `force: true` dans le body régénère quand même. ⚠️ La note de 2026-08-27 (« persistConclusion conserve `review_status` ») ne protégeait que le STATUT, jamais le contenu — c'est précisément le trou que ce filet ferme. **Tout futur bump d'`ENGINE_VERSION` doit vérifier ce qu'il écrase, pas seulement ce qu'il améliore.**

- **LE PLAFOND DE PAGES ÉTAIT SUPPOSÉ, IL EST MAINTENANT MESURÉ (2026-09-07)** : les 8 pages venaient d’UN échec observé le 03/09 (11 pages fusionnées, `AI_TIMEOUT` à 93 s) sur un fichier qu’on n’a plus. Mesure refaite avec la configuration exacte de production (gemini-2.5-flash, `thinkingBudget: 0` — en place depuis avril, donc pas l’explication —, 32 768 tokens, plafond edge 80 s) : **3 pages/6 lignes → 8,1 s · 15 pages/84 lignes → 28,8 s · 18 pages/91 lignes → 32,8 s**, tous `finishReason: STOP`, JSON complet. Il restait **plus de 45 s de marge**. Ce qui pilote le temps n’est pas le nombre de PAGES mais le nombre de LIGNES à écrire : 91 lignes ne consomment que 7 975 tokens sur 32 768. Plafond porté à **15** — borne mesurée deux fois — sans aller à 18, faute de mesure au-delà.

- **⚠️ LE DOCUMENT FUSIONNÉ NE PLANTAIT PAS : IL PRODUISAIT UNE CHIMÈRE (2026-09-07)** : c’est le résultat le plus important de cette mesure, et il renverse la lecture initiale. Les 18 pages de « Devis complets.pdf » passent l’extraction en 32,8 s — mais elles rendent **91 lignes mélangeant DEUX devis, sous un seul en-tête et un seul total**. Une analyse qui a l’air correcte et qui est fausse : bien pire qu’un refus. **Le découpage n’est donc PAS un contournement de la limite de pages, c’est une correction à part entière** — il tourne désormais dès qu’un PDF a au moins 3 pages, quelle que soit sa longueur totale (en dessous, deux devis n’y tiennent pas et on épargne à l’envoi courant le coût de la lecture du texte).

- **OUVRIR UNE ANALYSE D’UN LOT NE DOIT PAS FAIRE PERDRE LES AUTRES (2026-09-07, retour Johan)** : « si j’envoie les 2 analyses et que j’ouvre celle qui est finie, la 2e je ne la retrouve pas ». Elle existait pourtant en base — **rien ne la reliait à celle affichée**. Nouvelle colonne `analyses.batch_id` (migration `20260907150000`, nullable, index partiel) : identifiant du DOCUMENT d’origine, partagé par les analyses issues du même PDF découpé. `AnalysisResult` va chercher les sœurs et affiche, **avant le verdict**, « ce devis provient d’un document qui en contenait N » avec un lien vers chacune (celles encore en cours sont montrées en pointillés, pas cachées) et le bouton de comparaison quand toutes sont prêtes. La requête est scopée `user_id` en plus de la RLS : un lot n’appartient qu’à celui qui l’a déposé.

- **LIMITE DURE DE 3 DEVIS PAR LOT (2026-09-07, décision Johan)** : le premier réglage demandait confirmation au-delà de 5. Trop : chaque devis d’un lot est une analyse à suivre, une revue humaine possible et **une page de plus à retrouver**. `DEVIS_MAX_PAR_LOT = 3`, appliqué au lancement (message explicite, pas de blocage muet) et au pré-cochage — au-delà, les devis restent listés et l’utilisateur choisit LESQUELS trois analyser d’abord.

- **LOT CONSENTI — plusieurs analyses depuis un document, sans décider à la place de l’utilisateur (2026-09-07)** : après découpage, les devis sont proposés **tous cochés** ; l’utilisateur décoche ce qu’il ne veut pas et lance d’un geste. Les deux risques du lot silencieux disparaissent parce que chaque analyse reste un acte confirmé : **analyses non voulues** (un document peut contenir un devis ET une facture) et surtout **compteurs faussés** — des analyses créées mais jamais ouvertes gonfleraient le nombre d’analyses qui sert au funnel visites → analyses et à l’observatoire, et on mesurerait notre propre automatisme.
  ⚠️ **Écrit à CÔTÉ de `handleSubmit`, jamais dedans.** Ce chemin est le plus critique du produit — chaque analyse y passe. La mécanique vit dans [`analysesEnLot.ts`](src/lib/analyse/analysesEnLot.ts) (7 tests) ; `NewAnalysis.tsx` ne fait que la brancher. Vérifié au diff : 163 ajouts, 16 suppressions, et les 16 sont l’ancien sélecteur à choix unique du matin même — `handleSubmit` et `uploadFile` sont intacts.
  **L’écran de suivi n’est pas un ornement** : sans lui un lot est une attente muette (38 s en médiane par devis, 194 s au 90ᵉ centile) et un échec sur l’un des devis passerait inaperçu. Les analyses ne sont donc PAS attendues séquentiellement — elles sont lancées à la suite, puis les statuts sont interrogés toutes les 3 s, chaque devis prêt étant ouvrable pendant que les autres tournent. **Un devis en échec n’emporte jamais les autres** (test dédié). Garde-fou : au-delà de 5 devis, confirmation demandée — un document de dix devis est plus probablement une erreur de dépôt qu’une intention.
  Dès que deux analyses sont prêtes, un bouton mène au comparateur : c’est le gain final, il exigeait jusqu’ici deux dépôts séparés.

- **UNE LIBÉRATION DE RESSOURCE NE DOIT JAMAIS POUVOIR FAIRE ÉCHOUER CE QU’ELLE CONCLUT (2026-09-07)** : le découpage ne partait pas, et le diagnostic a demandé DEUX correctifs successifs. (1) Le worker pdf.js était déclaré avec `new URL("pdfjs-dist/build/…", import.meta.url)` — **Vite ne résout pas les specifiers de PAQUET dans `new URL()`**, seulement les chemins relatifs ; l’asset n’était même pas émis. Corrigé par l’import `?url`. (2) Surtout : `lireTextePages` finissait par `doc.destroy()`. **En pdf.js v6 `destroy()` appartient à la TÂCHE DE CHARGEMENT, pas au document** — vérifié en navigateur : `doc.destroy` vaut `undefined`, `tache.destroy` est une fonction. Les 18 pages étaient donc lues correctement, puis l’exception du nettoyage remontait au `catch` qui rendait un tableau vide : **le nettoyage jetait tout le travail**, et l’utilisateur voyait « document trop long » sur un document parfaitement lisible. La libération est désormais isolée dans son propre `try`, après constitution du résultat.
  ⚠️ Ce qui a permis de trancher : les trois cas de « rien à découper » avaient d’abord été distingués dans le journal. Sans ça, `[decoupe] texte illisible` et `[decoupe] un seul devis détecté` étaient le même silence — et j’ai supposé deux fois au lieu de mesurer. **Un chemin d’échec muet coûte plus cher que le bug qu’il masque.**

- **DÉCOUPAGE DES PDF MULTI-DEVIS DANS LE NAVIGATEUR (2026-09-07, demande Johan)** : réparer la garde des 8 pages ne faisait que mieux refuser — « les utilisateurs ne vont pas redécouper leur devis, ils vont abandonner ». Le document est désormais découpé **sur la machine de l’utilisateur, avant tout envoi**. Deux modules : [`decoupeDevis.ts`](src/lib/analyse/decoupeDevis.ts) porte la RÈGLE (pure, 14 tests) et [`pdfDecoupeNavigateur.ts`](src/lib/analyse/pdfDecoupeNavigateur.ts) les entrées/sorties (`pdfjs-dist` pour lire le texte, `pdf-lib` pour écrire, tous deux en `import()` dynamique — seul celui qui dépose un gros PDF les paie).
  **La règle ne devine pas, elle suit des IDENTIFIANTS** : un devis change quand son NUMÉRO change ou quand le SIRET de l’émetteur change. Une page sans identifiant (CGV, suite de tableau, page de photos) n’ouvre JAMAIS un nouveau devis. Principe assumé : rater une frontière donne un devis un peu trop gros — désagréable ; en inventer une coupe un devis en deux et fausse les deux analyses — inacceptable.
  Vérifié sur le document réel (« Devis complets.pdf », 18 pages) : 2 devis trouvés à la bonne frontière — n° 00003 pages 1-3, puis D0174 pages 4-18 (même entreprise, deux devis) — et les deux PDF produits se relisent correctement.
  ⚠️ **On ne lance PAS les analyses en chaîne** : la soumission redirige vers `/analyse/[id]`, donc une file d’attente en mémoire serait perdue et la promesse « les autres vous seront proposés » serait fausse. L’utilisateur CHOISIT le devis à analyser ; il redépose le document pour le suivant. Moins fluide qu’un traitement en lot, mais vrai.
  🟡 **Limite constatée sur ce cas** : le second devis fait **15 pages à lui seul**, donc au-delà du plafond d’extraction — le découpage ne le sauve pas. Le plafond de 8 pages vient d’une mesure faite sur un PDF FUSIONNÉ (11 pages, `AI_TIMEOUT` à 93 s) ; un devis unique et structuré n’est pas le même exercice. **À mesurer avant de le relever** (`TODO.md`).

- **LE GARDE-FOU DES 8 PAGES AVALAIT LES PDF QU’IL VISE (2026-09-06, cas « Devis complets.pdf », 18 pages)** : `comptePagesPdf` renvoyait `null` — donc laissait passer — dès qu’il voyait un flux d’objets compressés `/ObjStm`. Or **les PDF fusionnés par les outils grand public en contiennent systématiquement** (iLovePDF ici) : les gros documents multi-devis, ceux que la garde devait arrêter, passaient tous. Vérifié sur ce fichier : `/ObjStm` présent, mais `/Count 18` ET 18 objets `/Type /Page`, parfaitement lisibles et **concordants**. La règle n’est plus « ObjStm ⇒ je renonce » mais « je renonce si je n’ai pas deux signaux qui concordent ». Conséquence réelle : ce devis a été analysé **en silence sur son premier devis seulement**, sans que rien ne le signale à l’utilisateur.

- **UNE NOTE N’EST PAS UNE RÉPUTATION (2026-09-06, cas Les Artisans de l’Habitat)** : la fiche affirmait « l’entreprise est bien notée par ses clients » sur la foi d’un **5/5 établi sur UN SEUL avis**, pour une entreprise de 3 ans. Seuil posé à **10 avis** dans `render.ts` (le point vert devient une ligne informative en dessous) ET dans `simplifyPointOk` (`preparationBuilder.ts`, qui lit le nombre dans le libellé). Le seuil porte sur le NOMBRE d’avis, pas sur l’âge : 2 avis à six mois sont aussi peu concluants que 2 avis à dix ans. On ne se tait pas pour autant — on donne le chiffre sans en tirer de jugement.

- **PLUS DE PRÉNOM DEVINÉ DANS LE TITRE (2026-09-06)** : « Les Artisans de l’Habitat » donnait « **Préparez votre rendez-vous avec Les** ». Le titre est désormais toujours générique (« avec l’artisan ») : aucune heuristique ne sera fiable sur toutes les raisons sociales, et la personnalisation ne vaut pas un nom tronqué en tête de page. `extractArtisanFirstName` est malgré tout durci (liste d’articles et de mots de métier) car il sert encore la salutation du message copiable — « Bonjour Les » serait pire.

- **UNE CORRECTION QUI NE VA PAS JUSQU’AU HERO NE SERT À RIEN (2026-09-05, devis cuisine)** : le rattrapage de [`decide.ts`](src/pages/api/admin/reviews/[id]/decide.ts) ne se déclenchait QUE si le surcoût tombait à **zéro**. L’expert avait ramené 579–1 075 € à **600–800 €** et écrit un message client ; la page a continué d’afficher « un poste dépasse les fourchettes du marché (environ 827 € d’écart) » et « marge : 579 à 1 075 € » — le hero contredisait la correction qui venait d’être faite, et le correctif `deriveMotifHero` livré la veille n’était jamais appelé puisqu’il vivait dans la branche non prise. Le rattrapage tourne désormais **dès qu’un montant OU un verdict est corrigé**, extrait dans `resyncVerdictLigne()` : motif repris du `expert_message`, et **marge recalculée depuis les chiffres de l’expert** (`null` s’il a tout annulé) — jamais ceux d’avant. ⚠️ Le correctif ne rejoue pas les conclusions déjà écrites : celle du jour a été réparée à la main.

- **LE MOTIF DU HERO VIENT DE L'EXPERT, PAS DU PREMIER LEVIER (2026-09-04, cas DEV-202608-1)** : après correction, le rattrapage de [`decide.ts`](src/pages/api/admin/reviews/[id]/decide.ts) reprenait aveuglément le titre du premier levier restant. L'expert avait passé le verdict à **« ne pas signer »** parce que l'entreprise a **cessé son activité le 01/09/2025 — un an avant la date du devis** ; le hero annonçait « faites chiffrer par un second devis les prestations spécifiques (~2 200 €) » sous une pastille rouge, et la vraie raison n'apparaissait que dans l'encadré expert, plus bas. Règle : **quand l'expert a écrit un `expert_message`, sa PREMIÈRE PHRASE est le motif** — c'est lui qui vient de trancher, le levier n'est qu'un reste du calcul automatique qu'il corrige. Extrait dans [`src/lib/analyse/motifHero.ts`](src/lib/analyse/motifHero.ts) (13 tests) plutôt qu'empilé dans la route. Gardes : découpe < 30 caractères (abréviation type « Cf. ») ou phrase > 240 (pas une accroche) ⇒ **retour au fallback levier** — mieux vaut un motif faible qu'une phrase coupée ; un sigle en tête reste capitalisé (« SIREN … », pas « sIREN »). ⚠️ Ne PAS utiliser `expert_notes` ici : ce sont les notes INTERNES (« faux rouge », « bug d'extraction Gemini »), jamais montrables au client.

- **ON N'AFFIRME PAS UNE CONFORMITÉ TARIFAIRE SANS AVOIR COMPARÉ (2026-09-04, cas DEV-202608-1)** : un devis de 2 200 € facturant « 22 jours de Constructeur Bois » a reçu le verdict **« dans la norme — signer »** alors que sa seule ligne rapprochée sortait avec une fourchette **0–0 €** et la mention « prestation spécifique, pas de référence standardisée ». Mesure sur les 164 dernières analyses : **29 ont une couverture de 0 %, dont 14 affirment « dans la norme »** — et aucune n'était marquée « comparaison indicative ». Soit **8,5 % du stock** portant une affirmation que rien ne soutient, de 168 € à 19 150 € de devis. Le moteur avait des sorties anticipées pour l'étranger, le courtier, le hors-scope et le devis incomplet, mais aucune pour le cas le plus simple : *nous n'avons pas su chiffrer*. Trois verrous posés ensemble, car chacun seul se contourne : (1) `rienNestComparable()` dans [`leviersBuilder.ts`](src/lib/analyse/leviersBuilder.ts) — seuil `COUVERTURE_MIN_POUR_AFFIRMER_PCT = 5`, volontairement bas pour que l'affirmation soit *« nous n'avons rien pu comparer »*, vérifiable et non discutable (un seuil intermédiaire ouvrirait le débat « alors vous avez comparé, oui ou non ? », zone déjà traitée par le levier « second avis ») ; (2) la garde de verdict dans `conclusion.ts` interdit `dans_la_norme` et bascule en **`eleve_justifie`** — valeur neutre déjà utilisée par les bypass hors-scope, ORANGE côté couleur, et qui côté utilisateur ne pilote QUE la couleur puisque le texte vient de `verdict_ligne`. **Surtout PAS `a_negocier`** : réclamer une négociation sans le moindre écart chiffré serait le conseil intempestif proscrit ; (3) un niveau 0 de `sanitizeLLMText` retire les affirmations de prix des textes de Gemini — sans lui, « les prix pratiqués sont corrects » revenait dans la phrase d'intro juste au-dessus d'un verdict disant l'inverse. Le levier « second avis » passe de `bonus` à `important`, perd son plancher de 1 000 € et cesse d'écrire « une partie de ce devis » quand c'est le tout. ⚠️ Les signaux de FAIT (entreprise à risque, clause rouge, espèces, acompte, quantités) dominent toujours : ils restent vrais sans référentiel de prix. 9 tests.

- **UN SIRET INTROUVABLE NE DIT RIEN DE L'ENTREPRISE — repli SIREN obligatoire (2026-09-04, cas Damien Dubourg EI)** : le devis `DEV-202608-1` imprimait le SIRET `883135345 00030`. La recherche par établissement renvoie **0 résultat** — ce NIC n'existe dans aucun registre. On s'arrêtait là, avec un bandeau orange « SIRET non trouvé, vous pouvez vérifier sur societe.com ou infogreffe.fr », et l'analyse concluait **« dans la norme — signer »**. Or les 9 premiers chiffres d'un SIRET sont **toujours** le SIREN, et `q=883135345` retourne l'unité légale en un appel : *DAMIEN DUBOURG (KONTRECHAN)*, `etat_administratif="C"`, **cessée**. Nous avions donc conseillé de signer le devis d'une entreprise qui n'existe plus, tout en demandant à l'utilisateur d'aller faire lui-même la vérification que nous venions de rater. Le repli est posé dans [`verify.ts`](supabase/functions/analyze-quote/verify.ts) **avant** le fallback par nom (qui échouait ici : le devis écrit « Damien Dubourg El » — un « EI » océrisé en « El » — quand la raison sociale est « DAMIEN DUBOURG (KONTRECHAN) »). `resolveCompanyStatus` reçoit quand même le SIRET du devis : s'il figure dans `matching_etablissements` on garde son état exact, sinon la règle 3 s'applique. Nouveau signal **ORANGE** `etablissement_introuvable` (entreprise trouvée par SIREN, SIRET du devis inconnu) — jamais rouge : un NIC obsolète ou une coquille de saisie sont bien plus fréquents qu'une fraude, et il est tu quand l'entreprise est déjà radiée. ⚠️ **Règle générale : « 0 résultat » d'un fournisseur externe est un défaut de notre requête jusqu'à preuve du contraire, pas un fait sur le monde.**

- **Relecture IA écartée ≠ relecture plantée (2026-09-04)** : sur ce même devis à 2 200 € HT, l'écran de revue affichait un encadré vide avec « ACCORD : ? », qui se lit comme un plantage. C'était en réalité `{skipped:"montant_sous_seuil", montant_ht:2200, seuil:5000}` — le garde de proportion voulu (cf. § coûts). `AdminReviews.tsx` traitait `status:"running"` et `error`, mais pas `skipped`. **Tout nouvel état de `ai_review_opinion` doit avoir sa branche d'affichage** : un panneau muet fait perdre du temps à chercher une panne qui n'existe pas.

- 🔴 **UN ENVOI QUI ÉCHOUE EN SILENCE EST PIRE QUE PAS D'ENVOI (2026-09-08)** : Julien a testé une correction d'analyse le 06/09 et **n'a rien reçu**. La décision était bien enregistrée (`analysis_corrections`, statut `corrected`, destinataire `julien.dumas@gmail.com`) et le code d'envoi tournait — mais son échec ne laissait qu'une ligne de log, invisible depuis l'écran de revue. On croyait l'utilisateur prévenu.
  `sendReviewNotificationEmail` retourne désormais `{ ok, raison }` au lieu d'un booléen, la raison remonte jusqu'à `/admin/reviews` (« Décision enregistrée, mais l'utilisateur n'a PAS été prévenu — … ») et le corps de la réponse de Resend est repris tel quel : c'est lui qui porte la vraie cause (domaine non vérifié, clé révoquée, destinataire refusé). ⚠️ `admin-correct-review.ts` testait `sent ? … : …` — **un objet est toujours vrai**, le script aurait affiché « envoyé » sur un échec.
- **BOUTON « TESTER L'ENVOI » — SAVOIR AVANT, PAS APRÈS (2026-09-10, demande Johan)** : le correctif du 09/09 fait remonter la raison exacte d'un échec d'e-mail jusqu'à l'écran de revue, mais on ne l'apprend qu'en traitant une VRAIE revue — donc sur le dos d'un vrai utilisateur. Le jour où un artisan est venu tester son propre devis, ça ne suffisait plus : *« il faut qu'on soit pro et vérifier qu'il parte bien »*. `POST /api/admin/test-email` envoie la notification par **exactement le même chemin de code** (même fonction, même clé, même expéditeur, même gabarit) et affiche le résultat dans le bandeau existant.
  - ⚠️ **Le destinataire n'est JAMAIS choisi par l'appelant** : il est lu dans le jeton de l'admin connecté. Sinon la route deviendrait un moyen d'envoyer un e-mail à n'importe qui depuis notre domaine.
  - ⚠️ **La route n'écrit rien** — ni `review_status`, ni `conclusion_ia`, ni `analysis_corrections`. C'est un test d'acheminement, pas une décision. Le nom de fichier affiché dans le mail le dit en toutes lettres, pour qu'il ne puisse pas être pris pour une vraie notification.
  - En cas d'échec, la réponse joint `diagnosticCleResend()` : de quoi distinguer « aucune clé dans l'environnement Vercel » de « clé présente mais refusée par Resend » — les deux pannes qu'on a confondues le 08/09.

- **PROPOSER LA COMPARAISON QUAND ELLE A UN SENS (2026-09-08, demande Johan)** : la même personne a déposé deux devis de climatisation de **prestataires différents** à quelques minutes d’intervalle ; l’outil les a comptés comme deux analyses sans lien, alors que le comparateur répond exactement à sa question. Il exigeait deux dépôts puis une navigation délibérée — personne ne le trouvait. La règle vit dans [`devisApparentes.ts`](src/lib/analyse/devisApparentes.ts) (13 tests), l’endpoint `GET /api/analyse/[id]/devis-apparente` ne fait que réunir les candidats.
  - ⚠️ **PAS de détection par métier** : `work_type` et `domain` sont vides ou constants sur le stock (`domain = "travaux"` pour tout le monde), et « même métier » se tromperait — deux devis de plomberie peuvent porter sur deux chantiers sans rapport. On compare **le vocabulaire des lignes de travaux**, ce que les devis DISENT.
  - 🔴 **DEUX SIGNAUX, PAS UN — et c’est la mesure qui l’a imposé.** À 0,60 de recouvrement on **rate le cas signalé** (les deux devis de clim ne sont qu’à **0,47**) ; à 0,50 on attrape « devis toiture ⟷ devis charpente », deux **lots d’un même chantier** et non deux offres concurrentes. D’où le second signal : **deux offres pour le même périmètre ont des montants du même ordre** (rapport ≤ 2). Il écarte les paires au vocabulaire proche mais au périmètre sans rapport — mesuré ×98, ×26, ×19 sur le stock. Résultat : **19 propositions sur 585 paires (3 %)**, la paire de clim incluse (0,47 · ×1,06).
  - ⚠️ **Ne pas resserrer davantage le rapport de montants** : deux vrais concurrents peuvent différer de 80 %, et c’est précisément là que comparer sert le plus. Un seuil à ×1,5 ne garderait que les paires déjà semblables, celles où il n’y a rien à décider.
  - **Exclusions indispensables** : même fichier redéposé (le nom à l’index de copie près), même entreprise, et **recouvrement ≥ 0,9 = le même devis** — un autre prestataire n’écrit jamais le même devis. Sans elles, les meilleures paires du stock étaient toutes des redépôts, à 1,00.
  - **La bannière est une QUESTION**, jamais une affirmation : la règle ne sait pas que c’est le même chantier. Elle s’efface si le devis appartient déjà à un lot (`batch_id`), sinon deux invitations à comparer se contrediraient.
- 🔴 **UNE DATE N’EST PAS UN NUMÉRO DE DEVIS — et un fragment de CGV ne s’analyse pas (2026-09-08, devis D-261053)** : la page de conditions générales portait « le présent devis **21.09.2026** est valable trois mois ». Lue comme un numéro, la date différait de « D261053 » : le découpage a ouvert un **second devis sur cette seule page**. Ce fragment — RIB, CGV et total — est parti en analyse et en est ressorti **ORANGE avec « environ 210 à 390 € » de marge**, alors qu’il ne contenait aucune prestation.
  Deux correctifs, à deux étages :
  1. **Découpage** — `estUneDate()` rejette les dates, et une page de CGV / RIB / mentions légales (`estPageAnnexe`) **n’ouvre jamais** un devis : elle appartient au précédent. ⚠️ Le test porte sur la forme **BRUTE, avant normalisation** — les séparateurs sont ce qui distingue une date d’une référence. Une fois retirés, « 2026-0417 » (vrai numéro) et « 21.09.2026 » donnent tous deux huit chiffres, et le premier se lit comme un 17 avril : **mon premier correctif rejetait de vrais numéros.**
  2. **Analyse** — `aucuneLigneTravaux` : sans **une seule ligne de travaux extraite**, aucun chiffrage, aucune anomalie. La marge venait d’une anomalie nommée « Prestation de conseil et d’étude technique » que Gemini avait **inventée en lisant les CGV**. La règle du 05/09 (« aucun montant sans poste nommé ») était respectée *à la lettre* : le poste existait, mais dans aucune ligne du devis. Cette garde est indépendante du découpage — elle tient même si celui-ci se trompe à nouveau.
- 🔴 **4e FAUX POSITIF DO — LA RÈGLE CHANGE DE NATURE (2026-09-08, devis de climatisation)** : le conseil s’est déclenché sur **« Extension de garantie 5 ans »**. Le mot `extension` suffisait, et sept lignes du même devis étaient concernées. Consigne Johan : *« resserre vraiment, sinon on sera obligé de l’arrêter. »*
  Les quatre incidents partagent une seule faille : **un NOM structurel isolé** — l’« IPE » d’un poêle (indice environnemental), « sous dalle béton » (support), « extension de garantie » (contrat). Un nom seul ne dira jamais si on TOUCHE à l’ouvrage. La règle exige donc désormais **une ACTION portée sur un ÉLÉMENT PORTEUR dans la même ligne** ; seule une courte liste de termes qui n’existent que dans le gros œuvre (`mur porteur`, `longrine`, `radier`, `linteau`, `IPN/HEA + section`, `ossature bois`, `semelle de fondation`…) se suffit à elle-même. `surélévation` et `agrandissement` sont classés comme ACTIONS, pas comme objets.
  ⚠️ **La fenêtre entre l’action et l’objet est le cœur de la règle, et elle est MESURÉE.** À 40 caractères, « Démolition **carrelage** scellé au sol **sur dalle béton** » passait : le voisinage confond proximité et complément d’objet — ce qu’on démolit, c’est le carrelage. À **25**, la phrase est écartée (28 caractères séparent les deux) alors que « Réfection complète de la charpente » (15) et « Dépose de l’ancienne couverture » (14) passent. **Élargir cette fenêtre réintroduit des faux positifs : le re-mesurer sur le corpus avant d’y toucher.**
  **Mesuré sur les 429 devis du stock** : 39 déclenchements avant, 50 après — le resserrement fait perdre **2 devis seulement** (la semelle d’une clôture, à raison ; et le devis de clim signalé) et en récupère 13 qui étaient **ratés** : ouverture de mur porteur, étaiement de plancher, maison ossature bois, réfection de couverture. Resserrer la règle l’a rendue à la fois plus juste et plus complète. 21 tests.
- **UN ÉLÉMENT STRUCTUREL CITÉ COMME SUPPORT N’EST PAS UN TRAVAIL DESSUS (2026-09-07, 3e faux positif DO)** : le conseil dommages-ouvrage s’est déclenché sur **« Faux plafonds Type F530 Sous Dalle Béton »** — un faux plafond ne touche évidemment pas la structure. Même schéma que l’« IPE » du poêle : le mot structurel dit **où** la prestation se fixe, pas ce qu’on touche. `SUPPORT_RE` neutralise donc la mention quand elle est introduite par une préposition de localisation (« sous / sur / contre / le long de / fixé à » + dalle, plancher, charpente, poutre, mur porteur…), **sauf** si `ACTION_SUR_STRUCTURE_RE` porte une action explicite dessus (reprise, ouverture, dépose, démolition, renfort, réfection). « faux plafond » et « plafond suspendu » rejoignent par ailleurs la liste hors périmètre. ⚠️ Piège rencontré en l’écrivant : mon premier test affirmait que « Démolition du plancher bois » devait déclencher — **faux**, « plancher » n’est délibérément PAS dans `STRUCTUREL_RE`. C’était le test qui avait tort, pas le code : vérifier la liste avant d’écrire l’attendu. 19 tests.

- **PÉRIMÈTRE DO — module unique et testé (2026-09-03, cas SOLTANI)** : sur un devis de poêle à bois à 5 500 €, le conseil dommages-ouvrage s'est déclenché sur **« IPE= 0,5 »** — l'Indice de Performance Environnementale du poêle, lu comme une poutre IPE en acier. Le devis ne comportait qu'un percement de mur pour la grille d'aération obligatoire. La détection vit désormais dans [`src/lib/analyse/grosOeuvre.ts`](src/lib/analyse/grosOeuvre.ts) (11 tests), plus dans deux regex dupliquées et divergentes. Trois durcissements : les sigles de profilés exigent une **section chiffrée** (`poutre HEA 180`, jamais `IPE` seul) ; **« ossature métallique » retiré** (dans 99 % des devis c'est le rail d'une cloison placo) ; percement, carottage, ventouse, grille, aération, tubage, placo et cloison sont **hors périmètre**. Définition de référence, service-public.fr : « travaux de construction, d'extension ou de rénovation du **gros œuvre (ossature du bâtiment)** ». **Règle Johan : un conseil intempestif est contre-productif** — sur ce levier, rater un cas limite coûte moins cher qu'en inventer un.

- **RÉCLAMER UNE QUANTITÉ N'A DE SENS QUE SI SON ABSENCE BLOQUE (2026-09-03, cas SOLTANI)** : on affichait « exigez les quantités précises (m², ml) » sur un devis de poêle où un poêle, un kit et une plaque sont naturellement quantifiés à l'unité — et où le tubage portait ses 7,5 ml. Le discriminant n'est ni le libellé ni la référence produit : c'est le **tarif de référence** auquel la ligne est rapprochée. On réutilise `hasIncomparableUnit` (déjà utilisé pour exclure ces groupes du chiffrage) et on n'affiche le levier que si **≥ 25 % du montant** est bloqué par une unité incomparable. Mesuré : 0 % sur le devis poêle (levier supprimé), 51 % sur ALES (levier conservé).

- **Un acompte adossé à la LIVRAISON n'est pas un acompte à réduire (2026-09-03, cas SOLTANI)** : « 40 % à la commande + 40 % à la livraison dépôt » sort à 80 % dans le cumul, et on réclamait « 30 % maximum ». Payer du matériel effectivement livré est une contrepartie réelle. Signal `acompte_livraison_pct` → nouveau levier `acompte_livraison` : **exiger la preuve** (bon de livraison signé, photo au dépôt au nom du client, numéro de série) plutôt que baisser le pourcentage. Le levier passe en `securiser` et porte sa question dédiée dans le message copiable.

- **Chaque conseil porte son POURQUOI, en langage clair (2026-08-30, règle Johan)** : « le client ne doit pas se demander pourquoi, on doit lui donner les explications simples, claires et précises à chaque argument donné ». Le conseil DO cite désormais la LIGNE du devis qui le déclenche (`gros_oeuvre_motif`) et déroule la chaîne : on touche à un élément porteur → la solidité de l'ouvrage est en jeu → c'est le champ d'application de la DO (art. L242-1). Le mécanisme est expliqué en clair (« si une fissure ou un affaissement apparaît dans les 10 ans, elle paie tout de suite sans attendre qu'un tribunal désigne un responsable ») plutôt qu'en invoquant « la garantie décennale », qui ne dit rien à un particulier. **Tout nouveau levier doit nommer le fait du devis qui le déclenche.**

- **Périmètre DO resserré au critère légal (2026-08-30)** : `travaux_gros_oeuvre` se déclenchait sur le simple mot « charpente », donc sur un « traitement de charpente au xylophène » — de l'entretien. Critère retenu (art. L242-1 + doctrine DGCCRF/service-public) : les travaux doivent être susceptibles de **compromettre la solidité de l'ouvrage** ou de le rendre impropre à sa destination. On exige désormais une ACTION structurelle explicite (extension, surélévation, mur porteur, IPN/HEA, linteau, fondations, réfection de charpente/toiture…) **sur une ligne qui ne soit pas de l'entretien** (traitement, xylophène, nettoyage, peinture, ravalement).

- **Ne jamais conseiller d'acheter ce qui est DÉJÀ sur le devis (2026-08-29, cas 25030)** : le devis facturait une ligne « Dommage Ouvrage 4 176,14 € » et le levier conseillait quand même d'en souscrire une, avec un bouton « recevoir une proposition » par-dessus. Signal `assurance_do_montant` (somme des lignes matchant `/dommages?[-\s]ouvrage/i`) → le levier bascule sur le type `dommages_ouvrage_verification` : on réclame l'**attestation nominative** (assureur, n° de police, date d'effet antérieure à l'ouverture du chantier) au lieu de vendre un doublon, et le bloc d'intérêt DO ne s'affiche pas. **Tout conseil d'achat doit d'abord vérifier que la prestation n'est pas déjà au devis.** Faits juridiques vérifiés : l'obligation DO pèse sur le **maître d'ouvrage** (art. L242-1), elle n'est **jamais incluse d'office en CCMI**, mais le constructeur peut être mandaté pour la souscrire (ce cas). Ordre de grandeur : **1 à 3 %** du montant des travaux, davantage en construction neuve — pas « 2 à 5 % » (corrigé après vérification, la ligne du devis était à 1,9 %).

- **Une correction d'expert doit AJOUTER, pas seulement retirer (2026-08-29)** : après correction, la page annonçait « ce devis nous paraît négociable » sans plus aucun chiffre ni argument — on avait retiré le faux sans rien mettre à la place. Nouveau champ `conclusion_ia.expert_message`, saisi dans l'écran de revue et rendu par `AvisSurLeDevis` sous l'encadré « Vérifié par un expert VerifierMonDevis ». **Distinct des `expert_notes` internes**, qui parlent de « faux rouge » et de « bug d'extraction Gemini » et ne doivent JAMAIS être montrées au client.

  **Deux textes, deux destinataires** : le relecteur IA produit `notes_expert_proposees` (internes, jargon autorisé) ET `message_client_propose` (client), chacun avec son bouton de pré-remplissage dans l'écran de revue. Règles du texte client, dans le prompt de l'agent : vouvoiement, 2 à 4 paragraphes, montants vérifiables, et surtout — **dire une comparaison fausse par la RAISON, jamais par l'anecdote**. Premier jet observé : « nous avions comparé la pompe à béton à une pompe à chaleur », ce qui étale nos ratés au lieu de protéger le client. La bonne forme est « cette ligne est un forfait, elle ne peut pas être comparée à un prix au m² ».

- **JAMAIS afficher le taux de couverture marché à l'utilisateur (2026-08-29)** : « prix dans le marché sur les postes comparables (~41 % du devis) » se lisait comme un aveu de faiblesse de l'analyse. La part non comparée n'est PAS un défaut du référentiel : ce sont des prestations qu'AUCUN référentiel ne couvre (sur-mesure, réglementaire, désamiantage). On nomme leur NATURE et le montant, jamais la proportion. `comparable_coverage_pct` reste une donnée INTERNE (signaux Phase 4, prompt Gemini avec interdiction explicite de la citer, KPI catalogue).

- **Décision d'expert préservée aux régénérations (2026-08-27)** : `persistConclusion` conserve `review_status` si un humain a déjà statué (`validated` / `corrected` / `rejected`) — seul le contenu de la conclusion est mis à jour. Avant ce correctif, toute régénération (bump `ENGINE_VERSION`, revisite, replay) rejouait `detectReviewTriggers` et renvoyait l'analyse en `pending_review`, ce qui polluait la file et donnait l'impression que la décision n'avait pas été prise en compte. L'email expert et la notif Telegram sont gatés sur le statut FINAL, pas sur `trigger.shouldReview`.

- **Tests d'intérêt = mesure, pas de lead (2026-08-27/29)** : `lead_interest(topic)` + `POST /api/analyse/[id]/interest` mesurent la demande sur `dommages_ouvrage` et `credit`. **Aucun lead n'est transmis à un tiers** et le libellé de remerciement le dit (« dès qu'un partenaire sera en place ») — ne jamais promettre un devis qu'on ne peut pas fournir. Verdicts à 3 mois (27/11 et 29/11), seuil de décision 15 % de clics ; règle Johan : aucun clic à 3 mois = piste abandonnée. Toute mention du parcours des fondateurs (banque/assurance) reste **biographique et au passé** — jamais de conseil personnalisé en assurance ou crédit (ORIAS / IOBSP).

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

  État courant : **`ENGINE_VERSION = "1.2.0-refonte"`** (Phase 4 tranches 1+2, 2026-08-20) (`src/pages/api/analyse/[id]/conclusion.ts`). Reset 2026-06-23 pour marquer la refonte (cf. [`docs/refonte/PLAN.md`](docs/refonte/PLAN.md)). Historique complet des versions V3.4.17 → V3.5.16 (cause racine + fix + anti-régression de chaque bump) dans [`HISTORY.md`](HISTORY.md).

  **Invariants ACTIFS** que toute modif scoring doit respecter (= les gardes en place qu'il ne faut PAS supprimer) :
  - **Bypass précoces dans `conclusion.ts`** (avant verdictEngine + matching catalogue), tous suivant le même pattern : `is_foreign_quote` (V3.4.14), `estimation_courtier` (V3.4.20), `hors_scope_categorie` (V3.4.28), `is_incomplete_quote` (V3.5.1). Génèrent un `ConclusionData` synthétique + bannière UI dédiée + masquage `BlockPrixMarche`.
  - **Garde critère rouge > bypass** (V3.5.6) : si `criteres_rouges.length > 0` (parsé depuis `analysis.score` ou fallback `raw_text.scoring`), AUCUN bypass ne peut écraser le verdict ROUGE — l'incomplete_quote / hors_scope ne masquent JAMAIS un vrai risque juridique/financier.
  - **Garde fail-safe entreprise radiée** (V3.5.2) : si `criteres_rouges` contient un libellé matchant `/radi[eé]{1,2}/i`, force `verdict="a_risque"` quel que soit `preEngine.verdict`. Double défense serveur (`conclusion.ts`) + client (`AnalysisResult.tsx:effectiveScore`).
  - **5 wordings contextuels hard block** (V3.5.8 `conclusion.ts:1419`) : ne JAMAIS retomber sur le générique "entreprise radiée ou paiement suspect" — chaque flag a son wording dédié (`company_status`, `acompte_cumule_excessif`, `absence_assurance`, `siret_invalide`, `paiement_cash_suspect`, `iban_suspect`).
  - **Acompte cumulé = étapes pré-prestation UNIQUEMENT** (V3.5.9 `score.ts`) : set `PRE_PRESTATION_ETAPES = { signature, demarrage, livraison_materiaux }`. Les jalons d'avancement (`intermediaire`, `revue_chantier`, `fin_travaux`) sont EXCLUS car ils correspondent à de la valeur déjà délivrée. Ne JAMAIS revenir à `etape !== "reception"` (le bug V3.1).
  - **3 gardes sémantiques matcher vectoriel** (V3.5.9 `market-matcher-vectorial.ts`) : `hasLexicalOverlap()` (0 token en commun → rejet), `isSupplyVsLaborMismatch()` (fourniture vs pose antonymes → rejet), `isImplausiblyHighRatio()` (devis > 8× catalogue max → rejet). Parcours top-5 candidats, garde le premier qui passe les 3 gardes.
  - **Filtre lignes titre de section** (V3.5.10 `extract.ts` post-RECAP_PATTERNS) : pour chaque ligne L avec `qty=1/null` et `montant ≥ 100€`, si Σ(L_{i+1}..L_{i+K}) ≈ L.montant (tolérance 5€ ou 2%) avec K ∈ [2, 6] enfants → L est un titre de section hiérarchique (N) dont le total = sous-lignes (N.M) → DROP. Nécessaire avec le pipeline vectoriel V3.5.0 (1 ligne = 1 groupe) car V3.4.25 (qui opérait sur le groupement V3.6) ne kicke plus.
  - **Classification `low_confidence_match`** (V3.5.11 `quoteGlobalAnalysis.ts:classifyRowEnriched`) : si `vectorial.confidence !== "high"` (similarity < 0.85) ET ratio devis/marché < 2.0 → anomalie/survalue downgradée vers `low_confidence_match`. UI : badge gris "⚪ Comparaison incertaine" au lieu de "🔴 Anomalie marché". Compté dans `nbNormal` pour ne pas polluer le verdict global. **MAJ 2026-08-27 (cas ZANNOU v2)** : l'override « anomalie franche » (ratio ≥ 2× restait rouge en medium) est SUPPRIMÉ — prémisse démentie (élimination amiante 1 000 € matchée à Diagnostic amiante 80-180 € = 5,6× ET matching faux) et le verdict V3.5.13 excluait déjà ces groupes → carte rouge sous verdict vert = contradiction interdite. Règle : confidence < high = JAMAIS de carte rouge.
  - **Audit log fire-and-forget** (V3.5.11 `match-audit-log` table + `matchSingleLineVectorial`) : chaque match (high/medium/low/no_match) écrit dans `match_audit_log` avec description, top-5 candidats, rejected_reasons, engine_version. Permet rétro-analyse + calibration des seuils confidence + dataset gold standard pour Phase 2 (taxonomie hiérarchique, plan dormant `docs/plans/2026-06-09-taxonomie-hierarchique-anti-hallucination.md`). Ne JAMAIS bloquer le pipeline si l'insert échoue.
  - **Filtre confidence avant verdict expert** (V3.5.13 `conclusion.ts` + `index.ts:744`) : les groupes `vectorial.confidence !== "high"` sont retirés du `priceData` envoyé à Gemini (verdict expert) ET au `computeServerSurcout`. Évite que Gemini génère des "anomalies" sur des matchs incertains, downgradées ensuite à 0€ par V3.5.11 mais qui restaient affichées dans la liste. Côté UI VectorialPriceList (qui lit `n8n_price_data` complet via le client), les cards "Comparaison incertaine" sont préservées — cohérence honnête. **Propagation** : `index.ts` doit inclure le champ `vectorial` dans le mapping `n8nPriceDataForFrontend` (V3.6 legacy ne l'a pas, garde permissive).
  - **Revue humaine assistée Piste C** (V3.5.16 `conclusion.ts:persistConclusion` + migration `20260615_001_review_status_analyses.sql`) : toute analyse touchant un signal "à risque" (verdict ROUGE, surcout > 2k€, ≥2 anomalies, bypass actif) passe en `review_status = 'pending_review'` → email Resend à `bridey.johan@gmail.com` + bandeau bleu UI "Validation expert en cours sous 24h". L'expert valide/corrige via SQL/admin → l'analyse devient definitive. Constitue le dataset gold standard pour la Piste B (taxonomie métier hiérarchique). Le helper `persistConclusion` REMPLACE les 5 UPDATE `conclusion_ia` épars du pipeline. Fallback rétrocompat si migration pas appliquée (skip review_status, persist conclusion_ia seul).
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
- **Échappement unicode en TEXTE JSX = affiché LITTÉRALEMENT (2026-06-18)** : une apostrophe écrite en échappement `U+2019` (forme « backslash-u-2019 ») dans du contenu JSX entre balises s'affiche brute à l'écran, ce n'est PAS interprété (vu : empty state `MonChantierHub` + `ScreenModeSelection`). Mettre une vraie apostrophe. Dans une **string JS** `"…"` (ex. `ProjectHeader`) l'échappement EST interprété → OK.

- **Cockpit `<main>` overflow — Trésorerie + Assistant + Messagerie en `overflow-hidden` (règle, 2026-05-19)** : ces 3 onglets sont des layouts pleine hauteur type appli avec scroll interne propre (sidebar de liste, scroll messages, 3 colonnes…). Ils NE DOIVENT PAS vivre dans un `<main>` `overflow-y-auto pb-32`. Piège CSS : `overflow-y: auto` + `overflow-x: visible` → le navigateur recompute `overflow-x` à `auto` → un sous-composant qui déborde d'un pixel fait apparaître une scrollbar horizontale → toute la page glisse et la sidebar sort de l'écran (cas vu sur Messagerie 2026-05-19). Tout nouvel onglet "pleine hauteur" doit rejoindre la liste `overflow-hidden` dans `ChantierCockpit.tsx`.

- **`ChantierAssistantChat size="full"` — pas de `max-h` viewport hardcodée (piège, 2026-05-19)** : l'ancien `max-h-[calc(100vh-8rem)]` devient faux dès qu'un header partagé existe au-dessus (cas du `cr-project-header` 2026-05-16) → bande vide sous le chat. Utiliser `h-full min-h-0 w-full`. Ne pas réintroduire de `max-h-[calc(...)]` sur ce conteneur.

- **Alertes IA — clic = effacer (UX, 2026-05-19)** : `AlertsPane` n'affiche QUE les alertes non lues (`visibleInsights = insights.filter(i => !i.read_by_user)`). Cliquer marque lue → sort de la liste immédiatement. L'historique reste dans le Journal. Ne pas revenir à "alerte lue grisée visible dans le panneau".

- **Récit du jour — parseur markdown léger (2026-05-19)** : `JournalChantierSection.renderDigestBody` parse `**gras**`, puces `-/*/•` rendues en chevron `›`, listes numérotées, titres, citations. **Lignes vides ignorées** (pas de `<br>` par ligne vide). Avant : rendu naïf qui laissait `*`/`**` littéraux et faisait un `<br>` par ligne vide → aération excessive. Ne pas revenir à `entry.body.split('\n').map(...)` brut.

### Astro / Vercel

- **`vercel.json` : AUCUNE propriété inconnue tolérée — pas de clés commentaires (incident 2026-08-02→04)** : des clés `_note_...` ajoutées comme pseudo-commentaires dans les objets `redirects` ont fait échouer la validation du schéma Vercel → **TOUS les déploiements en échec pendant 2 jours** (9 commits jamais arrivés en prod), silencieusement — `npm run build` local passe (la validation est côté Vercel uniquement) et aucun des 3 systèmes de monitoring ne surveille les deploys Vercel. Symptôme : `gh api repos/<owner>/<repo>/commits/<sha>/status` → `Vercel: failure`. Règle : toute justification d'une entrée `vercel.json` va dans le message de commit, JAMAIS dans le JSON. Après tout commit touchant `vercel.json`, vérifier le statut du deploy.

- **`prerender = false` + `fs.readdirSync` en runtime = trou noir silencieux (piège vécu 2026-07-01)** : le hub `/observatoire` lisait les JSON via `fs.readdirSync('./src/data/observatoire')` avec `prerender = false`. En dev + build ça marche. En prod Vercel serverless, le runtime SSR **n'embarque PAS `src/` dans le bundle** → `fs.readdirSync` retourne un array vide **silencieusement** → les 3 sections études/chantiers/métiers du hub apparaissaient VIDES en prod alors qu'aucune erreur ne remontait. **Règle** : toute page Astro qui lit des fichiers du repo (JSON, MD) DOIT avoir `export const prerender = true` (défaut Astro `output:'static'`). Ne mettre `prerender = false` QUE si la page a besoin de state runtime (auth, formulaire dynamique). Cf. `/observatoire/index.astro`, `/observatoire/chantiers/index.astro`, `/observatoire/metiers/index.astro` — 3 pages `prerender=true` qui listent les data JSON.
- **🔴 `client:only` sur une page SEO = contenu ABSENT du HTML (2026-09-07)** : `/observatoire/metiers/[slug]` rendait sa page en `<ObservatoireMetierApp client:only="react" />`. Le fichier servi faisait 27 Ko **sans une ligne du texte** : ni le H1, ni les prix, ni les conseils — tout était reconstruit côté navigateur. Sur une page dont la seule raison d'être est le référencement, c'est le défaut le plus coûteux possible (Google exécute le JS, mais avec un délai et un budget de rendu ; les autres moteurs et les aperçus de partage ne voient rien). La règle « toujours `client:only`, jamais `client:load` » de ce fichier protège les composants **interactifs** — sans elle leurs gestionnaires d'événements sont perdus. Elle ne s'applique pas à un composant sans état ni gestionnaire : **sans aucune directive**, Astro le rend en HTML au build (texte indexable, zéro JS envoyé). Vérifié après bascule : 42 Ko dont tout le contenu, `astro-island` absent. ⚠️ Avant de basculer, vérifier que la page ET tous ses composants sont exempts de `useState`/`useEffect`/`window` ; y ajouter la moindre interactivité obligerait à repasser en île. **Les pages chantier et études sont dans le même cas** (`TODO.md`).
- **CTA "Piloter mon chantier" pour non-connectés → landing `/`, PAS `/mon-chantier` (piège vécu 2026-07-01)** : sur gmc.fr, `/mon-chantier` (route `mon-chantier.astro` + `MonChantierHub`) redirige vers `/connexion?redirect=/mon-chantier` ([MonChantierHub.tsx:324](src/components/pages/MonChantierHub.tsx:324)) quand pas de session — tombe sur une page de login vide, sans mention de l'essai gratuit 30j. **Règle** : tout CTA GMC affiché sur VMD (Observatoire, `PourAllerPlusLoin` post-verdict, `ComparateurResult`) qui vise à convertir un prospect DOIT pointer vers `https://www.gerermonchantier.fr/` (landing `gmc-home.astro`), pas `/mon-chantier`. La landing détecte l'auth et propose "Tester gratuitement 30j" aux non-connectés, "Retour à mon cockpit" aux connectés.
- **Astro 5 `output: 'hybrid'` supprimé** : utiliser `output: 'static'` avec un adapter — les pages avec `export const prerender = false` sont rendues côté serveur automatiquement.
- **Variables d'env Vercel côté client** : seules les variables préfixées `PUBLIC_` sont exposées au client. `VITE_SUPABASE_URL` ne marche pas → `PUBLIC_SUPABASE_URL` et `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- 🔴 **`import.meta.env.<SECRET>` CÔTÉ SERVEUR = CODE SUPPRIMÉ DU BUNDLE (2026-09-08)** : Vite **remplace `import.meta.env.X` par sa valeur AU BUILD**. Pour une variable non préfixée `PUBLIC_`, absente de l'environnement de build Vercel, cette valeur est `undefined` — donc le `if (RESEND_API_KEY)` qui suit est toujours faux, et **le bundler supprime tout le bloc d'envoi**. Le code compile, les tests passent, et les emails ne partent jamais : aucune erreur nulle part.
  Mesuré en cherchant `api.resend.com` dans les fonctions servies du build du 08/09 : **`desinscription`, `gmc-feedback` et `stripe-webhook` → 0 occurrence**, tout le code d'envoi avait disparu ; `decide` et `conclusion`, qui lisaient `process.env`, étaient intacts. Les trois routes mortes ont été remises en service.
  **Règle : côté serveur, un secret se lit au RUNTIME via `process.env`**, jamais via `import.meta.env`. La clé Resend passe désormais par [`src/lib/integrations/resendKey.ts`](src/lib/integrations/resendKey.ts) — un seul endroit, et le piège y est expliqué. ⚠️ Ne jamais « simplifier » en revenant à `import.meta.env`.
  ⚠️ **Piège de renommage rencontré en corrigeant** : dans `stripe-webhook.ts`, la constante s'appelait déjà `resendApiKey` ; importer la fonction du même nom rendait `if (!resendApiKey)` **toujours faux** (une fonction est vraie) et aurait envoyé son code source en guise de jeton. Vérifier les collisions de nom quand on remplace une constante par un appel.
- **Fire-and-forget sur serverless ne marche pas** : Vercel coupe la fonction dès que la réponse HTTP est envoyée. Pour un side-effect critique (cache invalidation, write DB), `await` est obligatoire — sinon le write peut être perdu en plein vol.
- **`new URL(request.url).origin` = `https://localhost` en SSR Vercel (2026-06-18)** : c'est l'URL interne du runtime serverless, pas le domaine public → les `success_url`/`cancel_url`/`return_url` Stripe pointaient vers localhost après paiement. Utiliser **`originFromRequest(request)`** (`apiHelpers`, dérive du header `Host`, comme `middleware.ts`), JAMAIS `request.url`, pour toute URL absolue. Appliqué aux 4 endpoints checkout/portail (GMC + VMD Pass Sérénité).
- **CSP `connect-src` (header global dans `vercel.json`) bloque les fetch/XHR navigateur vers tout host externe non listé** : symptôme `(blocked:csp)` dans Network + `xhr.onerror` générique → on croit à une erreur réseau/CORS ou au navigateur du user, alors que c'est le site qui se bloque lui-même. Lire la **Console** ("violates ... connect-src") pour le host manquant, l'ajouter à `connect-src`, redeploy + **hard-refresh** (la CSP est figée avec le document). Hosts ajoutés pour l'import carrousel marketing : `https://*.backblazeb2.com` (PUT B2 pré-signé) + `https://marketing-render.messagingme.app`. Idem limite Vercel 4,5 Mo body → les gros uploads passent par B2 pré-signé, pas par une route Vercel. 📖 **Contrat complet du couplage** (secrets partagés `MARKETING_RENDER_TOKEN` ↔ `RENDER_TOKEN`, endpoints, CSP, contrat DB, table « change X ici → change Y là ») : `../gerermonchantier-marketing/docs/INTEGRATION-newdevis.md`.

### Supabase / DB

- **ES256 JWT et `verify_jwt`** : Supabase Auth signe les JWT avec ES256, le runtime edge function ne le supporte pas → "Invalid JWT". Solution : `verify_jwt = false` dans `config.toml`. Chaque fonction admin vérifie le rôle manuellement. ⚠️ Le flag CLI `--no-verify-jwt` n'existe plus dans les versions récentes (`unknown flag` error) — utiliser **uniquement** la config TOML. Deploy : `npx supabase functions deploy <name>` (sans flag, le CLI lit `config.toml`).
- **Flags CLI incohérents entre `db push` et `functions deploy` (piège détecté 2026-05-28)** : `npx supabase db push` accepte `--linked` (pas `--project-ref`), MAIS `npx supabase functions deploy` accepte `--project-ref` (pas `--linked`). C'est l'inverse, c'est piégeant. Commande correcte pour deploy : `npx supabase functions deploy <name> --project-ref vhrhgsqxwvouswjaiczn` OU `npx supabase functions deploy <name>` (auto-détection si projet lié). Pour `db push` : `npx supabase db push --linked`. Ne JAMAIS mixer.
- **`functions deploy` upload le code LOCAL — pas main remote (piège détecté 2026-05-23)** : `npx supabase functions deploy <name>` lit le dossier `supabase/functions/<name>/` de **ton clone local actuel**. Si tu n'as pas fait `git pull origin main` récemment, tu pousseras une version périmée. Cas vécu : flip Phase F vectorisation, `secret MARKET_MATCHER_VECTORIAL=on` set côté Supabase, MAIS code déployé daté de 2 jours avant les commits Phase C-F (donc sans la garde `VECTORIAL_MODE`). Résultat : V3.6 continue de tourner en prod silencieusement. **Symptôme diagnostique** : log `[MarketPrices] startup — vectorial_mode=X` absent côté Supabase Functions logs. **Règle** : toujours `git pull origin main` AVANT chaque `functions deploy`. Idéalement, automatiser via le workflow GitHub Action `.github/workflows/deploy-edge-functions.yml` (créé 2026-05-21) qui se déclenche sur push main qui touche `supabase/functions/**`.
- **RLS sur tables côté frontend** : les edge functions bypass RLS via `service_role_key`, mais le frontend utilise `anon key`. Si on requête une table sans policy SELECT pour `anon` depuis le client, on obtient un tableau vide **sans erreur**. Toujours vérifier qu'une policy `anon` existe.
- **RLS nouvelles tables — wrapper auth.uid()** : `auth.uid()` appelé seul = 1 éval par ligne. Toujours écrire `(select auth.uid())` dans les nouvelles policies. Voir migrations `20260226` et `20260401400000` pour les patterns corrects.
- **Planning API — batch DB** : utiliser `Promise.all` pour les UPDATE simultanés sur `lots_chantier`. Les boucles `for` séquentielles peuvent provoquer des deadlocks Postgres sous charge.
- **`lots_chantier.updated_at` ne s'auto-update pas** : pas de trigger. Si on a besoin de tracker un changement par horodatage, soit ajouter un trigger soit `update({...payload, updated_at: new Date().toISOString()})`.

### Edge functions

- **Mesure d'audience FIRST-PARTY, pas GA4 (2026-09-04, demande Johan)** : le funnel « visites → analyses » exige que les deux bouts soient mesurés pareil. GA4 ne compte que les visiteurs ayant accepté les cookies ; rapporter nos analyses — comptées à 100 % en base — à ce dénominateur amputé donnerait un taux de conversion faussement flatteur. D'où la table `site_visits`, alimentée par un beacon dans `BaseLayout` (`/api/track/visit`) et lue par `/api/admin/visits-kpis`. **RGPD** : aucun cookie, aucun identifiant persistant — `visitor_hash` = SHA-256(IP + user-agent + sel + **jour**), donc rotatif quotidiennement ; ni IP ni user-agent conservés ; purge à 13 mois (`purge_site_visits()`, **pas encore branchée sur un cron** — cf. `TODO.md`). **Exclusion de l'équipe à la source** : le beacon est placé APRÈS le garde `vmd_internal` (flag posé à vie dès la première visite d'`/admin`), et la route ignore de toute façon `/admin`, `/api`, `/auth` et les robots déclarés. ⚠️ Le compteur démarre au déploiement : aucun historique antérieur n'existe, l'UI le dit explicitement plutôt que d'afficher un graphique vide.

- **🔴 `analyses.status` n'accepte PAS « failed » — spinner éternel (incident 2026-09-03)** : la contrainte n'autorise que `completed` / `pending` / `processing` / `error`. Or `analyze-quote` écrivait `status: "failed"` sur deux chemins d'échec (coupe-circuit et erreur d'extraction) : **l'UPDATE était silencieusement rejeté par Postgres**, l'analyse restait en `processing`, et l'utilisateur regardait un spinner qui ne s'arrêtait jamais. **11 analyses étaient dans cet état, la plus ancienne depuis 177 jours** — trois utilisateurs n'ont jamais eu ni résultat ni message. Corrigé, et deux filets ajoutés : `analysis-maintenance` fait désormais basculer en `error` toute analyse restée en `processing` plus de 15 min (en conservant l'étape atteinte dans le message), et le contrôle de longueur PDF évite d'y arriver. ⚠️ `document_extractions.status` accepte, lui, `failed` — d'où la confusion : **vérifier la contrainte de CHAQUE table avant d'écrire un statut**. Un UPDATE Supabase rejeté ne lève rien côté client si l'erreur n'est pas lue.

- **Un PDF de plus de 8 pages ne passe pas l'extraction (2026-09-03)** : mesuré deux fois sur un `ilovepdf_merged_compressed.pdf` de 11 pages (466 Ko, PDF texte) — `AI_TIMEOUT` après 93 s. Le fichier passait toutes les validations (bien en dessous des 10 Mo) puis échouait une minute et demie plus tard. `verifierLongueurPdf()` (`src/lib/analyse/comptePagesPdf.ts`) compte les pages **dans le navigateur, sans bibliothèque**, et refuse à l'upload en expliquant d'envoyer les devis un par un. ⚠️ En cas de doute (flux d'objets compressés `/ObjStm`), la fonction renvoie `null` et **laisse passer** : rater un gros PDF est bénin, refuser un devis d'une page qu'on aurait su lire est inacceptable.

- **Le coupe-circuit d'extraction se nourrit lui-même (2026-09-03)** : `checkCircuitBreaker` bloque 30 min après un échec sur le même `file_hash`, et le chemin de blocage **écrit à son tour une ligne d'échec** dans `document_extractions`. Le message dit « relance manuelle requise » alors que le bouton de relance de `ExtractionBlocker` rappelle la même fonction, se fait bloquer, et affiche quand même « Analyse relancée avec succès ». Pour lever un verrou en urgence : repasser la ligne `error_code='CIRCUIT_BREAKER'` en `status='created'` (les statuts valides sont `created` / `parsing` / `parsed` / `failed`), la trace de l'erreur reste dans `error_details`.

- **⚠️ CRONS : JAMAIS `current_setting('app.settings.*')` (incident 2026-08-29)** : ces paramètres n'existent PAS sur ce projet Supabase. Tout cron planifié avec ce motif échoue à CHAQUE exécution (`unrecognized configuration parameter`) **en silence** — aucune alerte, la fonctionnalité paraît vivante. 4 crons ont été trouvés morts d'un coup : `feedback-spike-alerts` (2 mois), `gmc-weekly-report` (1 mois), `vmd-outcome-scheduler` et `ai-review-agent`. **Motif à utiliser** (celui des crons qui marchent) : URL en dur `https://vhrhgsqxwvouswjaiczn.supabase.co/functions/v1/<fn>`, headers `jsonb_build_object('Content-Type','application/json')`, **aucun header Authorization** (les fonctions cron sont en `verify_jwt=false`). **Après toute création/modification de cron, vérifier obligatoirement** : `select public.admin_cron_status('<jobname>');` (RPC service_role, retourne les jobs + les 20 derniers runs avec leurs erreurs).

- **Analyse `pending_review` = AUCUN montant affiché (2026-08-30)** : le bandeau bleu annonçait « verdict provisoire » pendant que le hero affirmait « 7 405–13 751 € d'écart » — un client pouvait aller négocier sur un chiffre que nous savions déjà faux. Prop `provisoire` (dérivée de `review_status === "pending_review"`) passée à `AvisSurLeDevis` (le résumé garde le montant du DEVIS et remplace l'écart par « en cours de vérification par notre expert ») et à `LeviersNegociation` (le levier `surcout_postes` est retiré — c'est le seul qui chiffre un écart ; clauses, acompte et assurance restent, ils reposent sur des faits du devis). **Tout nouvel affichage chiffré d'un écart doit respecter ce drapeau.**

- **L'écran de revue ne met plus en avant `action_recommandee` (2026-08-30)** : ce champ et la `confiance` sont MESURÉS non fiables (cf. banc de test) ; ils passent en bas du bloc avec la mention de leur fiabilité. Les **points vérifiés** et les **drapeaux** passent devant : c'est là qu'est l'information.

- **🔴 Le relecteur IA ne peut PAS publier seul — mesuré le 2026-08-30** : banc de test sur les 37 analyses du gold standard (rejouées sur leur snapshot d'AVANT correction) + **16 analyses témoins jamais signalées**. Il ne rate rien (**0 faux OK** sur 22 analyses corrigées par l'expert) mais **il ne discrimine pas** : « corriger » sur 37/37 du gold standard ET sur **15/16 des témoins**. Sa confiance ne discrimine pas davantage (0,95 sur des désaccords). Un seuil de matérialité ajouté au prompt n'a rien changé — c'est un comportement de fond, pas un défaut d'instruction. **Conclusion : il détecte, il ne décide pas.** Son rendement réel est d'exposer nos bugs récurrents pour les corriger EN DUR (le « forfait comparé à un prix au m² » qu'il signalait a été supprimé par la garde d'unité). Rouvrir la Phase C exigerait de lui demander des **affirmations vérifiables en code**, pas un jugement global. Rapport complet et commandes : [`docs/refonte/RAPPORT-RELECTEUR-IA.md`](docs/refonte/RAPPORT-RELECTEUR-IA.md).

- **Relecteur IA sur GEMINI depuis le 2026-08-30** : `ai-review-agent` appelle `gemini-2.5-pro` par défaut (`providers.ts`, bascule `AI_REVIEW_PROVIDER=claude` pour revenir à Opus). Raisons : **0,017 € la relecture contre ~0,85 €** (mesuré en prod), **grounding Google gratuit** sous 1 500 requêtes/jour, et qualité équivalente sur le cas ALES — mêmes défauts trouvés (faux positif forfait vs m², quantités absentes, mur porteur sans étude structure), en 36 s contre 61 s. Le PDF passe par **URL signée** (`file_data.file_uri`), que Gemini accepte : ni téléchargement ni base64 dans le worker. ⚠️ **Le secret Supabase s'appelle `GOOGLE_AI_API_KEY`**, pas `GOOGLE_API_KEY` (ce dernier est le nom côté Vercel) — 8 autres edge functions lisent déjà `GOOGLE_AI_API_KEY`. L'indépendance vis-à-vis du pipeline ne vient plus du fournisseur mais du modèle (pro contre flash), du prompt, et des sources (PDF d'origine + web) que le pipeline n'a jamais vues. **Le prompt est une source unique** (`prompt.ts`) importée par la fonction ET par `scripts/benchmark-ai-reviewer.ts` — sans quoi le taux d'accord mesuré ne voudrait plus rien dire.

- **Historique Claude — ⚠️ PAS de `speed:"fast"` (2026-08-29)** : le mode rapide n'est **pas ouvert sur notre organisation** (`rate limit of 0 fast mode input tokens per minute`) → **429 immédiat sur chaque appel**. Ajouté un temps pour « tenir dans le budget edge », il a en réalité éteint le relecteur pour TOUTES les analyses. Mesures de référence sans mode rapide, sur le plus gros devis en base (25030, 82 lignes, 219 k€) : **49 s sans PDF, 58 s avec PDF** — le budget edge (~400 s) n'a jamais été le facteur limitant, et le contournement « pas de PDF au-delà de 55 lignes » a été supprimé (l'avis avec PDF est nettement meilleur : il recalcule les €/m² réels et voit les clauses). Réglages actuels : `effort: low`, 2 recherches web max, PDF joint jusqu'à 8 Mo, claim `{status:"running", attempt}`, 3 tentatives. **Sur 429/5xx, la cause API est consignée dans `last_error`** et reprise dans le message d'abandon — sans ça, une erreur de quota se déguise en « devis trop lourd » et le diagnostic part dans le mur. **Ne jamais lui faire écrire la conclusion** : il produit un AVIS, l'humain tranche. Son taux d'accord se mesure contre `analysis_corrections` (prérequis de la Phase C).

  **⚠️ « Rejeter » ne corrige RIEN (piège d'écran, 2026-08-29)** : dans `/api/admin/reviews/[id]/decide.ts`, `action="rejected"` remet simplement `review_status='auto_approved'` et **ne touche pas à `conclusion_ia`** — la conclusion part telle quelle. C'est l'action « le déclencheur de revue était excessif », PAS « l'analyse était fausse ». Dès qu'une anomalie ou un montant doit disparaître, l'action est **`corrected`**, seule à réécrire ce que voit l'utilisateur. Le prompt du relecteur explicite désormais les 3 actions, parce qu'il avait recommandé « rejeter » tout en invalidant deux anomalies — ce qui les aurait laissées affichées.

  **Correction = resynchroniser TOUT ce qui dérive du surcoût (2026-08-29)** : `verdict_ligne`, `leviers` et `anomalies` sont bâtis AVANT la revue à partir du surcoût automatique, et **l'écran de revue n'expose que le verdict et le surcoût** — l'expert ne peut retirer ni un levier ni une anomalie. L'écran expose désormais une **case à cocher par anomalie** (décocher = retirer de la page utilisateur), et `decide.ts` garde un filet quand l'expert n'a rien décoché : surcoût ramené à 0 ⇒ levier `surcout_postes` retiré, `verdict_ligne` réécrit (marge à `null`, motif repris du premier levier restant, montant du devis conservé), et **anomalies de PRIX uniquement** supprimées. ⚠️ Le discriminant est `surcout_estime > 0` : les anomalies **qualitatives** (« devis daté dans le futur », quantité incohérente, prix anormalement BAS) ont légitimement un surcoût nul et doivent survivre — les vider en bloc ferait disparaître de vraies alertes. Sans ce rattrapage l'utilisateur voyait « 0 € » au-dessus d'un « Détail des 2 anomalies », et le hero affichait encore « X–Y € d'écart estimé » juste sous un verdict corrigé. **Tout nouveau champ dérivé du surcoût doit être ajouté à ce rattrapage.**

  **⚠️ « Credit balance too low » est un 400, PAS une erreur d'analyse (2026-08-30)** : quand le compte API Anthropic est à sec, chaque appel renvoie un `400 invalid_request_error` dont le message parle de solde. Classé comme un 4xx définitif, il estampillait l'analyse en erreur — qui n'aurait alors JAMAIS été reprise après rechargement, faisant perdre en silence toutes les relectures de la panne. `ai-review-agent` détecte désormais ce motif (`/credit balance|billing|insufficient.quota|payment required/` ou 402) et **remet l'analyse dans la file intacte, sans consommer de tentative**. Le seul symptôme visible reste le log — d'où l'intérêt de vérifier `analyses.ai_review_opinion` quand la file de revue stagne.

  **Garde de proportion + coûts** : la relecture ne part que si le devis dépasse `MIN_QUOTE_HT = 5 000 € HT`, sauf critère rouge (la gravité ne dépend pas du montant) ou montant inconnu (l'incertitude est un risque). Un avis coûte ~0,85 € contre ~0,05 € pour tout le pipeline Gemini — **modèle de coût complet, dépendances de facturation et paliers d'alerte : `DOCUMENTATION.md` § 28**. Ne pas confondre l'abonnement Claude Code (outil de dev, aucun lien avec la prod) et la clé API `ANTHROPIC_API_KEY` (facturée à la consommation, utilisée par `ai-review-agent` et `generate-blog-article` uniquement).

  **⚠️ PDF vers une API externe = URL SIGNÉE, jamais base64 dans le worker (2026-08-29)** : `supabase.storage.createSignedUrl(path, 3600)` puis `source: { type: "url", url }`. Le `download()` + encodage base64 d'un PDF de 573 Ko consommait assez de CPU pour que la edge **tue le run en silence** — aucune erreur, aucun log, claim laissé en `running` jusqu'à l'abandon. C'est le mode de panne le plus traître de la plateforme : un dépassement CPU ne lève pas d'exception, il fait disparaître le worker. Vaut pour toute edge function qui manipule un fichier de plus de ~200 Ko.

  **Règle générale qui en découle** : avant d'accuser le budget d'une fonction edge, **mesurer l'appel en local** (script jetable qui rejoue le même prompt). Sur ce seul incident, trois « optimisations » de budget (effort abaissé, PDF supprimé, mode rapide) ont été empilées sur ce qui était un 429 de quota **puis** un dépassement CPU — aucune des trois ne touchait la cause.

- **GMC activation (2026-06-12/13)** : `gmc-on-signup` (Database Webhook sur INSERT `gmc_subscriptions` → welcome + notif admin via Resend), `gmc-ensure-trial` (API route, crée l'essai des inscrits Google OAuth), `gmc-email-scheduler` (cron pg_cron **08:00 UTC, jobid 31** → emails d'engagement essai J1/J3/J7/J14, dédup `gmc_email_log`). Templates email dans `supabase/functions/_shared/gmc-emails.ts`. ⚠️ Migrations GMC appliquées en SQL direct → `migration repair` requis avant tout `db push` (cf. `WIP.md`).

- **⚠️ `/api/gmc/status` (GET) PROVISIONNE un essai (effet de bord volontaire, 2026-06-29)** : si l'utilisateur authentifié n'a AUCUNE ligne `gmc_subscriptions`, le endpoint crée un essai 30j (`upsert ignoreDuplicates`, `signup_source='verifiermondevis'`). C'est le **pont VMD→GMC** : les chemins de signup (trigger + `gmc-ensure-trial`) ne couvrent que les NOUVEAUX comptes, donc un utilisateur **VMD existant** qui entre dans l'app GMC (toutes les surfaces GMC appellent `/api/gmc/status`, quel que soit OAuth/email/SSO) n'avait pas d'essai → bloqué + absent de la séquence -50%. L'INSERT déclenche aussi le welcome GMC + l'entrée dans `gmc-email-scheduler`. Idempotent : un essai **expiré** n'est jamais régénéré (pas d'abus). Ne PAS faire appeler `/api/gmc/status` par une surface VMD (sinon essai accordé à tort) — aujourd'hui c'est 100% GMC.

- **Emails onboarding VMD (2026-06-24/29)** : miroir du système GMC pour les nouveaux comptes VerifierMonDevis. `vmd-on-signup` (welcome + notif admin Julien+Johan) + `vmd-email-scheduler` (cron **08:10 UTC, jobid 33** → séquence E1→E6 sur 18j, dédup `vmd_email_log`, branches premium/déjà-GMC/nb-analyses). Tables `vmd_signups` (+ trigger `auth.users` signup_source='verifiermondevis') + `vmd_email_log`. Webhook DB sur INSERT `vmd_signups`. OAuth Google → `/api/vmd-ensure-signup` (câblé `callback.astro`). Templates HTML **Claude Design** (projet 782fee25, logo base64 inline) dans `supabase/functions/_shared/vmd-emails.ts`. **Compte Resend SÉPARÉ** : secret `RESEND_API_KEY_VMD` (fallback `RESEND_API_KEY`), domaine `verifiermondevis.fr` vérifié, expéditeur `bonjour@verifiermondevis.fr`. Les 2 fonctions VMD = `verify_jwt=false` (config.toml).

- **Webhook Stripe `stripe-webhook.ts` (API route, unique VMD+GMC, 2026-06-18)** : routé par `metadata.product`. ⚠️ L'endpoint **Dashboard Stripe** (mode Live) doit écouter `checkout.session.completed` + `customer.subscription.updated` + **`customer.subscription.deleted`** + **`invoice.payment_failed`** — sinon résiliation immédiate / échec de paiement jamais reflétés (bug vécu : `.deleted` non abonné → abonné résilié resté `active`). Les handlers `.updated`/`.deleted` matchent par **`stripe_subscription_id`** en secours (indépendant de la metadata). `gmc_subscriptions` n'a PAS de colonne `cancel_at_period_end` → une résiliation « fin de période » n'est pas affichée comme « résiliation programmée ».
- **Funnel / nav GMC (2026-06-18)** : « Tester gratuitement » (header `gmc-landing`) → **`/beta`**. `/mon-chantier` (hub `MonChantierHub`) **redirige vers le cockpit si exactement 1 chantier**, SAUF si on arrive avec **`?hub=1`** (entrée « Mes chantiers » du menu picker, 2026-06-24) : on reste alors sur le hub même avec 1 chantier, pour permettre l'**upsell mono→Multi** (carte d'ajout verrouillée → `/gmc-abonnement?plan=multi`). Escape historique pour créer un 2e = CTA « Créer avec l'IA » du cockpit → `/mon-chantier/nouveau`. **Ne jamais re-bloquer le passage mono→multi** : c'est de l'upsell, pas un gate. « Mes chantiers » du header `gmc-landing` est visible pour **tout user connecté** (l'allowlist `hasGmcAccess` ne gate PLUS la nav UI ; l'accès réel reste serveur via l'abonnement). Section « Suggestions pour préciser votre projet » retirée de `ScreenPrompt` (UX confuse).

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
  - **Gate serveur (`requireAdvancedPlanning`)** sur TOUTES les écritures sous-phase ; le hook `useAdvancedPlanningAccess` + le toggle ne sont QUE cosmétiques. **Le planning avancé = offre Multi** (bandeau cockpit + 4 messages API disent « offre Multi », plus « premium »). Habilités (`getAdvancedPlanningAccess`, MAJ 2026-06-18) : admin + allowlist GMC + **abonné Multi actif** (`computeGmcInfo.isMulti`) ; Essentiel + essai gratuit exclus. Le `TODO` tier-abonnement est FAIT.
  - **Vue avancée = MÊME Gantt** (`PlanningTimeline` avec prop `advanced`), PAS un composant séparé (l'ancienne `SubPlanningView` % a été supprimée — Option B). Tout le rendu avancé (sous-barres, bouton découper, panneau) est derrière `if (advanced)` → simplifié byte-identique. D&D des sous-phases = `SubphaseBar` : **horizontal = décalage (délai), vertical sur une autre sous-phase = créer une dépendance** (cross-métier inclus, garde anti-cycle serveur 409 → toast). Alignement gauche/droite garanti par construction (même `laneSubphases`, mêmes hauteurs `LOT_ROW_HEIGHT`/`SUBPHASE_ROW_HEIGHT`). Limites V1 : pas d'optimisme sur la création de dépendance (refetch ~400ms), pas de drag inter-lanes des sous-phases. Plan : `docs/plans/2026-06-08-sous-planning-dnd-option-B.md`.
  - **Tests à relancer avant toute modif** : `npx tsx src/lib/chantier/planningUtils.subphases.test.ts` (56) + `npx tsx src/lib/auth/advancedPlanningAccess.test.ts` (10). Le test d'équivalence "zéro sous-phase = `computePlanningDates`" + le verrou de comportement protègent contre une régression du refactor `forwardPass`.
- **`tools.ts` priorite enum** : doit être `["urgent", "important", "normal"]` — jamais `"low"` (rejeté silencieusement par `taches.ts`).
- **WhatsApp messages — `group_id TEXT`** : `chantier_whatsapp_messages.group_id` est un TEXT stockant le JID brut (ex: `120363xxxxx@g.us`), **pas** un UUID FK vers `chantier_whatsapp_groups`. Intentionnel — la table messages est antérieure à la table groups. Ne pas migrer en UUID FK sans plan de migration des données.
- **Planning D&D — ne pas reset `delai_avant_jours=0`** : la position visuelle du drag DOIT être convertie en `delai_avant_jours` (jours ouvrés depuis le predecessor.date_fin OU startDate). Sinon le serveur CPM recompute à zéro et la modif visuelle ne persiste pas. Cf. `PlanningTimeline.handleLotMoveWithLane`.
- **Suppression d'un lot — cascade FK (2026-06-15)** : `DELETE /lots/[lotId]` supprime le lot ; en DB `documents_chantier`/`devis_chantier`/`contacts_chantier` sont **SET NULL** (→ « non affectés », PAS supprimés, récupérables/réassignables) et `lot_dependencies`/`lot_subphases`/`planning_subphase_deps` **CASCADE**. L'endpoint transfère les deps (A→X→B ⇒ A→B) + recompute le planning + invalide le cache agent. **`deleteLot` (ChantierCockpit) DOIT refléter le SET NULL en local** (`setDocuments` lot_id→null) sinon les docs orphelins « disparaissent » jusqu'au refetch + budget faussé ; et vérifier `res.ok` avant de muter (comme `handleDeleteDoc`) → pas de faux succès si le paywall bloque (403). Bouton supprimer sur la carte dashboard (`ProCard`, passée en `<div role=button>` pour imbriquer le bouton) ET la vue tableau, même handler.
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
- **Commandes** : `npm run dev` | `npm run build` | `npm run preview` | `npm run lint` | `npm test` (Vitest).
- **Tests — deux harnais cohabitent** : (1) **Vitest** (`npm test`, `describe/it`) = standard, ex. `src/lib/integrations/stripe-webhook-helpers.test.ts` ; (2) **standalone tsx** (harness maison `check()` + `console.log`, lancés `npx tsx <fichier>`) = `verdictEngine.test.ts`, `advancedPlanningAccess.test.ts`, `planningUtils.subphases.test.ts`, **exclus de `vitest.config.ts`** (pas de `describe/it`). `npm test` ne les exécute donc pas (normal) ; à migrer vers Vitest un jour (TODO Étape 10).

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

Tout le tracking vit dans `src/layouts/BaseLayout.astro`, conditionné au consentement cookies (la fonction `loadTrackingScripts()` ne tourne qu'après clic « Accepter » ou si `localStorage['cookie-consent'] === 'accepted'`). RGPD : la bannière nomme explicitement Google Analytics, Meta/Facebook ET TikTok.

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
- **TikTok Pixel UNIQUE — ID `D902V4RC77UB3EFMQVB0`** (mutualisé VMD + GMC, comme Meta, ajouté 2026-06-27). Snippet inline dans `loadTrackingScripts()` (`BaseLayout.astro`), helper `src/lib/integrations/tiktokPixel.ts` (`trackTikTok` / `trackTikTokOnce`, no-op silencieux sans consentement cookies). Events câblés (en miroir strict de Meta) : `PageView` auto (`ttq.page()` dans le snippet), **`SubmitForm`** (`AnalysisResult.tsx`, `trackTikTokOnce` dédupliqué par analyse, équivalent Meta `Lead`), **`CompleteRegistration`** (`Register.tsx` + `callback.astro` bloc isNewUser, en double avec Meta). CSP : ajout de `https://analytics.tiktok.com` dans `script-src` ET `connect-src` de `vercel.json`. ⚠️ **Même piège pixel-avant-redirection que Meta** : `ttq.track()` juste avant `window.location.href` perd l'event → on bénéficie du même délai 400 ms déjà en place dans `Register.tsx` (`redirecting` flag). Vérification post-déploiement : Chrome extension **TikTok Pixel Helper** + TikTok Events Manager → real-time test events. Account TikTok Ads `GererMonChantier0627`. Events API (CAPI TikTok) **non câblée** — à ajouter si besoin (équivalent CAPI Meta).

---

### Données structurées — deux marques, une seule mise en page (2026-09-07)

- **L’organisation suit désormais le DOMAINE.** `BaseLayout` émettait un `Organization` codé en dur sur VerifierMonDevis.fr — nom, URL, logo, e-mail, `@id` **et sa note Trustpilot** — sur *toutes* les pages des DEUX domaines. Chaque page de gerermonchantier.fr déclarait donc appartenir à VMD et portait ses 24 avis. Vérifié après correction : page GMC → « GérerMonChantier », aucune note ; page VMD → « VerifierMonDevis.fr », 4,7/24.
- ⚠️ **La marque se déduit du `canonical`, PAS de `Astro.request.headers`.** Première tentative avec les en-têtes : elle échoue, les landings sont **prérendues** et Astro avertit à chaque page que les en-têtes n’y existent pas — le repli VMD s’appliquait donc partout, y compris sur GMC. Le `canonical` est connu à la compilation et porte le bon domaine sur toutes les pages GMC de contenu ; repli sur `Astro.url.hostname` pour le SSR.
- **`aggregateRating` de GMC supprimé** : il annonçait « 4,8 sur 42 avis ». Trois vérifications concordantes le contredisent — aucun profil Trustpilot pour gerermonchantier.fr (404), table `gmc_feedback` **vide**, et **14 comptes GMC au total**. 42 avis ne peuvent pas en sortir.
- 🔴 **La note VMD, elle, est VRAIE : 4,7 sur 24 avis**, vérifiée sur le profil Trustpilot public. ⚠️ **Je m’étais trompé** en concluant l’inverse d’un commentaire de code (« 8 avis hardcodés depuis la boîte de réception Trustpilot ») : ces 8 avis sont ceux **recopiés dans le carrousel**, pas le total du profil. Johan a arrêté la suppression à temps. Le commentaire a été corrigé pour que la déduction ne se refasse pas. **Leçon : un commentaire de code n’est pas une source ; le profil public l’est.**
- Ces deux valeurs restent **dupliquées en dur dans six fichiers** — à centraliser (`TODO.md`), sinon elles divergeront au fil des avis et le balisage deviendra faux.

### Page d’accueil VMD — ce qu’elle promet (2026-09-07)

Refonte du hero après audit concurrentiel. **Contexte qui commande tout** : mesuré le 06/09, **151 visiteurs sur 157 ne voient que `/`** (1,14 page par visiteur), 6 atteignent `/nouvelle-analyse`, 5 `/inscription`, 1 analyse aboutit. Tout se joue dans le hero ; ce qui est sous la ligne de flottaison n’est quasiment pas vu.

- **Chiffre du catalogue : 919, pas 470.** L’ancienne valeur annonçait la moitié du référentiel réel. ⚠️ **À réactualiser à chaque enrichissement du catalogue** — c’est une promesse chiffrée affichée en page d’accueil et dans la meta description.
- **Les arguments cités sont les plus forts, pas les plus faciles.** « Avis clients » a disparu (on vient de refuser de l’afficher sous 10 avis) au profit de **radiation / procédure collective**, **santé financière** et **certifications RGE contrôlées dans les registres**. « Mentions absentes » a cédé la place aux **clauses abusives** — cinq types détectés, dont deux illégales, et personne ne l’attend d’un outil de prix.
- **Quatrième ligne, la signature** : « sans commission d’artisan, sans revente de lead ». Seule promesse structurellement incopiable — les comparateurs et plateformes de mise en relation vivent de ça. Elle est vraie aujourd’hui : aucun lead n’est transmis à un tiers. ⚠️ **Si un partenariat rémunéré arrive un jour, cette ligne doit tomber ou être requalifiée le même jour.** Nuance validée par Johan : proposer une DO ou un crédit ne l’affaiblit pas — l’assureur et le prêteur ne sont pas sur le marché de l’artisan, on ne peut pas nous accuser d’affaiblir un devis pour pousser un partenaire.
- 🔴 **L’INSCRIPTION EST ANNONCÉE AVANT LE CLIC.** L’ancienne micro-copie disait « Analyse immédiate · Compte gratuit pour le détail complet » — **c’était faux** : `/nouvelle-analyse` redirige vers `/inscription` sans compte (règle du hard signup du 2026-05-11). Le visiteur cliquait en pensant déposer son PDF et tombait sur un formulaire. Elle dit désormais « Création de compte en 30 secondes, puis analyse immédiate — gratuit ». Décision Johan : **on assume le mur, on ne le déguise pas.**
- Emojis retirés des arguments (ils doublaient les coches SVG et desservaient une promesse de rigueur) ; le bouton secondaire « Qu’est-ce qui est analysé ? » quitte le voisinage du CTA — il détournait du clic au moment de cliquer — et revient en lien discret sous les arguments, avec la mention de la **relecture humaine**.

### Milieu de la home — un bloc au lieu de huit boîtes (2026-09-08)

Retour Johan : *« cette partie du site est un peu triste, ne se démarque pas »*. Le fond gris n’était pas seul en cause : « Comment ça marche ? » puis « Ce que vous obtenez » empilaient **huit boîtes blanches quasi identiques** — même rayon, même bordure, même ombre — dans deux bandes grises successives. Rien ne ressortait parce que tout ressortait pareil. Les deux composants sont remplacés par [`DuDevisAuVerdict.tsx`](src/components/landing/DuDevisAuVerdict.tsx) : le parcours à gauche, **un exemple de résultat à droite**.

- **La redondance était la vraie cause.** L’étape « Verdict clair + arguments prêts » et les cartes « Verdict global » / « Arguments pour négocier » disaient la même chose à trois écrans d’écart. Fusionner supprime le doublon ; ajouter de la couleur ne l’aurait pas fait.
- **On MONTRE la sortie au lieu de la décrire.** C’est le seul actif incopiable de la page — un comparateur peut recopier nos arguments, pas nos fourchettes. Les références affichées dans l’exemple viennent de [`prix/reference`](src/lib/prix/reference.ts) : **si le catalogue bouge, l’exemple ne devient pas faux**.
- ⚠️ **La fiche est un exemple FABRIQUÉ et la page le dit** (« Exemple illustratif »). Ne jamais la faire passer pour l’analyse d’un vrai client, et ne jamais y mettre de données réelles.
- **Emojis retirés** (🔍 💶 📋 🏢 ⚠️) : ce sont les mêmes qu’au hero le 07/09 — ils desservent une promesse de rigueur.
- **Une seule animation, sur l’objet qu’elle décrit** : `.vmd-scan` (`index.css`) fait passer un balayage orange sur la fiche — l’analyse en train de lire le devis. Coupée sous `prefers-reduced-motion`.
- **Rendu SANS directive client** : le composant n’a ni état ni gestionnaire, donc HTML au build et zéro JS. Y ajouter la moindre interactivité obligerait à repasser en île.
- ⚠️ **Piège corrigé au passage : `id="comment-ca-marche"` était EN DOUBLE** — `index.astro` pose un div d’ancrage (pour que le header collant ne recouvre pas le titre) et l’ancien `HowItWorksSection` portait le même id sur sa section. Le lien du menu sautait donc sur le premier, qui est vide. L’id reste sur le div, jamais sur la section.
- `HowItWorksSection.tsx` et `WhatYouGetSection.tsx` sont conservés : ils sont encore référencés par `src/components/pages/Index.tsx`, une home React **orpheline** (importée nulle part). À supprimer ensemble un jour.

### Une seule valorisation dans tout le site (2026-09-08)

Règle Johan : *« il ne peut pas y avoir 2 valorisations différentes dans un même site. »* L’audit du 07/09 en a trouvé partout — peinture « 15 à 35 €/m² » sur une page et « 30 à 60 » sur une autre, quand le catalogue dit 18-65 ; carrelage « 50-130 » contre « 90-170 » alors que le catalogue plafonne à 94 €. Des tableaux écrits à la main divergent un peu plus à chaque enrichissement du catalogue : aucune discipline ne tient sur la durée.

- **Le fichier `src/data/prix/reference.json` est la source unique**, généré depuis `market_prices` par [`scripts/prix/generate-reference.ts`](scripts/prix/generate-reference.ts) et lu au BUILD via [`src/lib/prix/reference.ts`](src/lib/prix/reference.ts) (9 tests). **Toute page qui cite un prix passe par là** — plus aucun nombre en dur.
- ⚠️ **La correspondance poste éditorial → entrée catalogue est un CHOIX, pas une déduction.** Elle est écrite en clair dans le générateur avec le `job_type` exact, pour être relue et contestée. Ne jamais la deviner par mots-clés : « carrelage » désigne 14 entrées du catalogue, de la dépose à la faïence.
- ⚠️ **Un poste manquant fait ÉCHOUER le générateur**, et une clé inconnue fait échouer le build. Afficher « — » à la place d’un prix est pire que ne rien publier.
- ⚠️ **Les tarifs du catalogue sont HORS TAXES** — les pages doivent l’écrire, sinon le lecteur compare un HT à son devis TTC et conclut que l’artisan le vole. Un forfait ne prend pas de suffixe d’unité (« 5 100 à 11 900 € HT/forfait » ne veut rien dire).
- **`CATALOGUE_TAILLE` et `ANALYSES_TOTAL` sont portés par le même fichier** : ce sont des promesses chiffrées affichées au public, et une promesse chiffrée périmée est un mensonge. La page annonçait « +100 devis analysés chaque mois » — vrai en mars-avril (124 puis 104), **faux depuis** (22 en juillet, 29 en août) ; remplacé par un CUMUL, qui ne peut pas se périmer dans le mauvais sens. « -30 % d’écart détecté en moyenne » n’était étayé par aucune mesure : supprimé.
- **Deux provenances fausses corrigées au passage sur `/prix-travaux-maison`** : « issus de l’analyse de milliers de devis réels » et « basées sur des devis réels analysés en 2026 ». Ces fourchettes viennent du RÉFÉRENTIEL, sourcé poste par poste — pas d’une moyenne de nos analyses. Sur une page de prix, une provenance inexacte décrédibilise tout le reste.
- 🟡 **Ce qui reste en dur, volontairement** : les ratios « €/m² de logement » (rafraîchissement 250-400, rénovation lourde 1 200-2 000…). Ce sont des coûts de PROJET par m² habitable, le catalogue n’en contient pas, et ils sont cohérents entre les pages qui les affichent. Les décompositions de FAQ (SDB, cuisine) restent aussi à la main — cf. `TODO.md`.
- **Le fichier est régénéré chaque lundi 05:00 UTC** par [`.github/workflows/refresh-donnees-publiees.yml`](.github/workflows/refresh-donnees-publiees.yml), avec les JSON de l’observatoire. Voir la règle ci-dessous — elle contient un piège de CI qui coûterait cher à redécouvrir.

### Rafraîchir des données publiées qui vivent dans le DÉPÔT (2026-09-08)

`src/data/prix/reference.json` et `src/data/observatoire/**.json` sont des **fichiers du dépôt lus au build**. Le cron Postgres `refresh-observatoire` (04:00 UTC quotidien) rafraîchit les vues matérialisées **côté base uniquement** : il ne peut ni écrire dans le dépôt ni déclencher un déploiement. Sans automatisation, le catalogue s’enrichit et le site continue d’afficher l’état figé au dernier build.

- 🔴 **UN PUSH FAIT AVEC `GITHUB_TOKEN` NE DÉCLENCHE AUCUN WORKFLOW `on: push`.** C’est un garde-fou GitHub contre les boucles. Le workflow appelle donc explicitement `gh workflow run vercel-ci-deploy.yml` après le push (permission `actions: write`). Sans cela, un simple commit laisserait le JSON à quai — **exactement l’incident des « commits dormants » de mai 2026**.
- ⚠️ **Mesuré le 2026-09-08 : `vercel-ci-deploy.yml` se termine en 5 secondes** — ses secrets `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` **ne sont pas configurés**, il sort par son garde. Le déploiement qui aboutit réellement vient de l’**intégration Git de Vercel**, qui réagit au webhook du push (statut de commit `Vercel: success` avec une URL vercel.com). Le commentaire d’en-tête de `vercel-ci-deploy.yml` — « l’intégration Git est cassée depuis que le dépôt est privé » — **ne décrit plus la réalité** : les push de Johan déploient. À nettoyer un jour, mais surtout : ne pas s’appuyer sur ce workflow en croyant qu’il déploie.
- **Conséquence non vérifiable à l’avance** : rien ne garantit que Vercel accepte un commit signé par `github-actions[bot]` (sur le plan Hobby et dépôt privé, il a déjà refusé des commits dont l’auteur n’était pas le propriétaire du projet). Le workflow **le vérifie** au lieu de le supposer : il attend jusqu’à 5 minutes qu’un statut Vercel apparaisse sur le commit, et **échoue bruyamment** sinon, en nommant le remède (renseigner les secrets VERCEL_*). Un échec rouge se voit ; des données à quai, non.
- **Les tests de publication tournent APRÈS génération et AVANT commit.** `reference.test.ts` valide le fichier qui vient d’être écrit (fourchettes cohérentes, moyenne dans les bornes, postes cités par les pages tous présents). Si un test tombe, on ne publie pas : mieux vaut des données d’une semaine que des chiffres indéfendables.
- **Un horodatage qui change n’est pas un changement.** Les deux générateurs réécrivent `genereLe` / `lastGenerated` à chaque exécution : sans exclusion explicite de ces lignes dans le `git diff`, on committerait chaque lundi sans qu’un seul chiffre ait bougé, et l’historique deviendrait illisible.
- Détails d’exécution qui ont chacun leur raison : `fetch-depth: 0` (le clone superficiel fait échouer le `git pull --rebase` d’avant push), `npx --yes tsx@4` (tsx n’est pas une dépendance du projet — sans épinglage, le comportement peut changer d’un lundi à l’autre), `git pull --rebase` (quelqu’un a pu pousser pendant la génération).
- **Secret requis : `SUPABASE_SERVICE_ROLE_KEY`** dans les secrets GitHub Actions. Tant qu’il est absent, le workflow s’arrête proprement avec un avertissement — pas d’échec rouge hebdomadaire qu’on finirait par ignorer.

### Mesurer l’usage des calculettes avant de trancher (2026-09-07)

Mesuré sur 4 jours : **425 visiteurs de la page d’accueil, 1 seul sur `/calculette-travaux`, aucun sur `/simulateur-valorisation-travaux`** (contre 15 sur `/nouvelle-analyse` depuis la même page). Décision Johan : **on garde, on instrumente, on tranche au 07/10/2026** plutôt que de supprimer sur un échantillon de 4 jours.

- **Une vue de page ne suffit pas.** `site_visits` dit combien de gens ARRIVENT sur la calculette, pas combien s’en servent. Nouvelle table `site_events` + route `/api/track/event` : on compte les **calculs aboutis**. Une page très visitée sans aucun calcul et une page jamais atteinte appellent des décisions opposées — il faut les deux chiffres, ils sont côte à côte dans `/admin` (section « Usage des calculettes »).
- **ALLOWLIST obligatoire** dans `/api/track/event` : la route est publique et non authentifiée ; sans liste fermée de noms d’événements elle devient un journal ouvert. Trois événements aujourd’hui : `calculette_travaux_calcul`, `simulateur_valorisation_calcul`, `simulateur_aides_calcul`.
- **RGPD : même régime que `site_visits`** — aucun cookie, empreinte SHA-256 rotative quotidienne, ni IP ni user-agent conservés, et **aucune valeur saisie** (code postal, surface, type de travaux) n’est transmise. Donc pas de gate consentement, contrairement aux pixels publicitaires.
- Le simulateur d’aides est **partagé avec le cockpit GMC** : le comptage est gaté sur la prop `standalone`, sinon l’usage de nos abonnés se mélangerait à la question posée. Il n’a pas de page à lui (carte + fenêtre) : sa colonne « visiteurs » vaut **`null`, pas zéro** — non mesuré n’est pas nul.
- ⚠️ **Ce que la calculette n’est PAS** : elle interroge `market_prices` en direct (catalogue 919 entrées + coefficient de zone). Elle ne contredit donc pas nos prix — les contradictions sont dans les pages d’articles (voir `TODO.md` § audit des prix).

### Observatoire — publier un prix (2026-09-07)

Déclencheur, mot pour mot : *« les prix de l’observatoire n’apportent rien comme information, 1 397 € de panier moyen et alors ? Soit on sort des chiffres clairs, chocs sur les plus gros postes et on en fait une vraie information, sinon ça fait du bruit pour rien. »* Il avait raison, et le défaut était **le même que celui corrigé la veille** sur `/observatoire/prix-variables` : on agrégeait des choses qui ne se comparent pas.

**La règle de publication vit une seule fois**, dans [`src/lib/observatoire/statsPrix.ts`](src/lib/observatoire/statsPrix.ts) (17 tests), partagée par les études thématiques, les 33 pages métier et les pages chantier. Toute nouvelle page de prix passe par là plutôt que de réinventer son agrégation.

- **Une série par (poste, UNITÉ).** La « médiane unitaire » de la page menuiserie mélangeait 121 lignes à l’unité, 3 au mètre linéaire, 1 au m² et 3 forfaits : une poignée de porte et une baie vitrée dans le même chiffre. **Forfaits exclus** (leur périmètre change à chaque devis) et **forfaits déguisés écartés** — une valeur à plus de dix fois la médiane de son propre poste ne décrit pas le même travail (cas réel : « Peinture porte, 1 u, 8 350 € »).
- **Amplitude = P90/P10, jamais max/min**, et **8 observations minimum** (5 sur une page métier, sinon la plupart n’affichent rien). À 5 sans écrêtage, un seul devis atypique titrait « Faux plafond BA13 ×86 » alors que 107 observations sur 107 s’accordaient à 55 €/m².
- **Le fait marquant ne se fait pas sur un accessoire.** Première version : le plus fort écart, point — elle titrait la menuiserie sur « Pose poignée ×8,8 ». Un poste doit peser au moins **un cinquième de la médiane du plus gros poste du métier** pour faire la une. Seuil **relatif** et non absolu : 116 € est un poste central en électricité et une broutille en menuiserie. La menuiserie titre désormais sur *Fenêtre PVC posée : 910 à 2 968 €* (×3,3, 21 devis).
- 🔴 **ON N’INVITE JAMAIS À SOUSTRAIRE « pose seule » DE « fourni + posé ».** Chaque poste porte ce que son prix couvre (déduit du libellé catalogue), et la page le dit — c’est le premier écart entre deux devis, avant même la marge. Mais les deux fourchettes viennent de **devis différents** : en menuiserie l’écart mesuré est de 75 €, ce qui ferait une fenêtre quasi gratuite. C’est un artefact de rapprochement (les lignes classées « Pose fenêtre » comprennent la fenêtre), pas le prix du matériel. La page l’écrit noir sur blanc.
- **Section « postes les plus surfacturés » RETIRÉE** de la page métier. Elle accusait sur des bases indéfendables : « Pose porte de garage +503 % » reposait sur **trois** devis, et « Pose fenêtre +222 % » contredisait le tableau juste au-dessus — ce dépassement mesure notre propre défaut de rapprochement (tarif catalogue main-d’œuvre seule contre lignes fourniture comprise), pas une surfacturation. Le champ reste dans le JSON, rien ne le publie tant qu’il n’est pas calculé à périmètre comparable.
- **Une page sans poste publiable n’affiche AUCUN chiffre** et le dit (« données en cours d’accumulation »). Au 07/09 : 15 métiers et 11 chantiers publient, les autres se taisent. Mieux vaut une page honnête qu’une moyenne qui ne répond à aucune question.
- 🔴 **LE SEUIL COMPTE LES DEVIS, PAS LES LIGNES — ni les analyses.** Deux dérives cumulées, toutes deux mesurées :
  1. **Plusieurs lignes d’un même devis** comptaient chacune pour une observation. « Peinture SDB pièces humides » annonçait *13 devis à 80 € pile*, min = médiane = max : c’était **un** devis répétant la même ligne treize fois. On présentait l’habitude d’un artisan comme un prix de marché.
  2. **Un même PDF re-déposé** crée autant d’analyses que de dépôts. « devis combiné.pdf » figurait **cinq fois** pour le même utilisateur. Mesuré sur le stock : **331 analyses pour 283 documents**, soit 17 % de gonflement — davantage sur les postes rares, ceux qui approchent justement le seuil. La clé de document est `user_id|file_name` (`analyses` ne porte pas de hachage de fichier) ; **on ne déduplique pas entre utilisateurs** — « devis.pdf » est un nom trop courant pour qu’une collision soit un doublon. Effet : menuiserie 91 → 78 devis, salle de bain 10 → 6 postes publiables.
- 🔴 **LA CLASSIFICATION PAR TYPE DE CHANTIER ÉTAIT FAUSSE SUR 12 % DU CORPUS** (196 lignes sur 1 628), pour deux raisons dans le `CASE` SQL d’origine (`mv_observatoire_chantiers`, migration `20260701090000`) :
  - **`ILIKE '%iti%'` attrapait « démol-ITI-on »** → toutes les lignes de démolition comptaient en isolation. La page isolation affichait 83 devis au lieu de 43, et son fait marquant sortait sur… de la plomberie. Les sigles **ITE / ITI se cherchent en mot entier**.
  - **La comparaison était sensible aux accents** : `%fenetre%` ne matche pas « Fenêtre ». La page fenêtres annonçait **2 devis** quand le corpus en contient **56**. Idem gouttière, façade, clôture → toiture 38 → 62, façade 10 → 22, clôture 5 → 17.
  ⚠️ La règle corrigée vit dans `typeDeChantier()` (générateur) **et** dans la migration `20260907200000` ; toute évolution se fait des deux côtés. ⚠️ Et ne pas « améliorer » la liste en passant : un premier jet avait inventé des types `sols`/`placo` absents du dictionnaire tout en perdant `plomberie` et `cloisons` — **deux pages vivantes seraient passées à zéro devis en silence**.

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

## Monitoring & alertes prod — 3 systèmes complémentaires (2026-05-21, +error-tracking 2026-06-15)

> Section ajoutée après un **incident silencieux** : la régression V3.4.20 sur l'analyse VMD est passée 2 jours sans alerte mail. Diagnostic : le cron `system-health-alerts` créé en 2026-02-28 avait été supprimé par le commit `ff69caa` (2026-03-14) et jamais restauré → 80 jours sans surveillance volumétrique. Restauré explicitement le 2026-05-21 via migration `20260521_001_restore_system_health_alerts_cron.sql`.

**2 crons complémentaires, à ne JAMAIS confondre** :

| Cron | Fréquence | Edge function | Rôle | Email si |
|---|---|---|---|---|
| `system-health-alerts` | */5 min | `system-alerts` | Surveillance **volumétrique** : analyses bloquées > 15 min, pic 3+ erreurs en 30 min, taux d'échec > 50% sur 1h (si ≥ 4 analyses) | Immédiat dès qu'une catégorie matche |
| `analysis-maintenance` | */15 min | `analysis-maintenance` | Réparation **individuelle** : retry analyses error/failed jusqu'à 2 fois, email si retry effectué OU échec persistant après 2 tentatives | Conditionnel (au moins 1 retry ou 1 persistent) |

Destinataires alignés des 2 systèmes : `julien@messagingme.fr` + `bridey.johan@gmail.com`. Le commentaire TODO Resend dans `system-alerts/index.ts` ("from=alerts@verifiermondevis.fr une fois domaine vérifié") reste valide mais n'empêche pas les envois aujourd'hui (utilise `from=onboarding@resend.dev`).

**⚠️ Angle mort connu (à addresser)** : un **mauvais verdict** (ex: ROUGE faux comme dans V3.4.20) n'est PAS une erreur technique (pas d'exception, status=`completed` dans la DB). Aucun des 2 crons ne le détecte. Le seul signal aujourd'hui = feedback utilisateur via la modal `FeedbackModal` (chips négatifs `faux_radiee`, `mauvaise_entreprise`, etc., visibles dans `/admin` section "Anomalies bloquantes"). À ajouter en Phase ultérieure : un cron qui surveille les pics de feedbacks négatifs et alerte (genre 3+ feedbacks `faux_radiee` en 1h → email).

**3e système — error-tracking maison (2026-06-15)** : `captureError(source, error, ctx)` ([`errorReporter.ts`](src/lib/integrations/errorReporter.ts) côté Vercel + [`_shared/error-reporter.ts`](supabase/functions/_shared/error-reporter.ts) côté Deno) attrape les **exceptions runtime aux points de fuite silencieuse** (webhook Stripe, photo WhatsApp `whapi.ts:69`, `inbound-email`, agent-orchestrator interactif + batch) → 1 ligne dans la table `error_log` + 1 message Telegram instantané via le bot ops `@Messagingmeapp_bot`. **Best-effort, ne throw jamais.** ⚠️ **Piège : gated sur `TELEGRAM_ERROR_BOT_TOKEN` + `TELEGRAM_ERROR_CHAT_ID`** (Vercel + secrets Supabase) — **no-op silencieux si absentes**. Si tu ne reçois aucune alerte : vérifier que les 2 env vars sont posées des DEUX côtés + **redeploy Vercel** (`import.meta.env` inliné au build). Complète les 2 crons (eux = volumétrique/réparation ; lui = exceptions ponctuelles). L'angle mort « mauvais verdict » reste (pas une exception).

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

> ⚠️ **MAJ 2026-06-14 : monétisation GMC LIVE en prod** (Stripe checkout/portail/webhook routé `metadata.product`, `/api/gmc/status`, page `/gmc-abonnement`, gate 2e chantier via `GMC_PAYMENTS_LIVE`, coupon -50% `Nb2ITi2O`, Phase B emails dans `gmc-email-scheduler`). **Lecture seule J30 câblée** : `hasGmcWriteAccess` + gate dans `requireChantierAuth`/`requireChantierAuthOrAgent` + `sauvegarder`/`generer`/`ameliorer` (method-aware, GET libres, bypass agent) → 403 `gmc_access_expired` après essai expiré. **Comptes offerts** : `gmc_subscriptions.signup_source='comp'` (Julien + Johan en Multi). **Timeline de suivi** : table `gmc_subscription_events`. Ce plan figé est **superseded pour Stripe/SKU/read-only** ; son **quota IA** reste à câbler (hors scope V1). État : `WIP.md` § Monétisation GMC.

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
| `STRIPE_PRICE_GMC_ESSENTIEL_{MONTH,YEAR}`, `STRIPE_PRICE_GMC_MULTI_{MONTH,YEAR}` | Prix GMC Live (12/120 · 25/210). Leur présence ⇒ `GMC_PAYMENTS_LIVE=true` (active checkout GMC + gate 2e chantier). |
| `STRIPE_COUPON_GMC_FIRST_MONTH` | Coupon -50% 1er mois GMC (Live `Nb2ITi2O`, `duration:once`, mensuel) |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypass RLS dans les API routes |
| `GOOGLE_API_KEY` | Gemini (extraction, groupement, résumé, agent) |
| `GOOGLE_PLACES_API_KEY` | Notes et avis Google Places |
| `AGENT_SECRET_KEY` | Auth inter-service edge functions → API routes (header `X-Agent-Key`) |
| `WHAPI_TOKEN` | API whapi.cloud (groupes WhatsApp) |
| `SENDGRID_API_KEY` | Email envoi/inbound |

---

## Architecture chantier — résumés

Pour le détail complet (modèle CPM, agent IA dual-mode, pipeline de génération, écrans cockpit, hooks matériaux) → `DOCUMENTATION.md` § 20.

### Portefeuille multi-chantier (offre Multi, lecture seule, 2026-06-24)
Surface `/mon-chantier/portefeuille` (réservée au palier Multi) qui agrège tous les chantiers du compte : onglets Finances (+ projection trésorerie), Planning (frise consolidée), Contacts unifiés (+ détection de conflits de ressources). Entrée via le menu déroulant du project picker (`Sidebar.tsx`, prop `isMulti` câblée dans `ChantierCockpit` via `/api/gmc/status`).
- **Règle absolue** : NE JAMAIS recalculer un KPI/date/montant. Les 3 endpoints `/api/portfolio/{summary,contacts,cashflow}` font un **fan-out HTTP interne plafonné** vers les routes existantes (`budget`, `planning`, `payment-events`) avec `originFromRequest` + Bearer forwardé. Source unique de vérité, le portefeuille ne peut pas diverger d'un cockpit.
- **Gate serveur** : `getPortfolioAccess` (alias de `getAdvancedPlanningAccess`) dans `src/lib/auth/portfolioAccess.ts`. Cadenas UI = cosmétique, le vrai gate est sur les 3 endpoints (403).
- **Cœurs purs testés** (Vitest) : `src/lib/chantier/portfolio{Summary,Conflicts,Timeline,Cashflow}.ts`. Conflits = honnêteté par confiance (tél normalisé/SIRET = `confirmed`, nom approché conservateur = `to_verify` ; contact sans lot exclu du chevauchement).
- 🟡 connus (`TODO.md`) : dégradation silencieuse si le self-call est bloqué (previews Vercel) ; coût du fan-out à grande échelle (cashflow génère des signed URLs inutiles). Détail : `DOCUMENTATION.md` (routes) + `FEATURES.md § 2bis`.

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
