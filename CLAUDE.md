# CLAUDE.md - VerifierMonDevis.fr

Plateforme d'analyse de devis d'artisans. Stack : **Astro 5 + React 18 islands + Supabase + Tailwind/shadcn-ui**. Déployé sur **Vercel** (`@astrojs/vercel` adapter, `output: 'static'`). Voir `DOCUMENTATION.md` pour le détail complet.

## Pattern critique : Islands Astro + React

**NE JAMAIS** passer un composant React comme enfant dans un fichier `.astro` — il sera rendu en HTML statique sans event handlers. Utiliser les wrappers dans `src/components/app/` :
```tsx
// src/components/app/LoginApp.tsx
import ReactApp from "@/components/ReactApp";
import Login from "@/components/pages/Login";
export default function LoginApp() { return <ReactApp><Login /></ReactApp>; }
```
Pages Astro : `<LoginApp client:only="react" />` — toujours `client:only`, jamais `client:load`.

## Routes

| Route | Page Astro | Wrapper → Composant |
|---|---|---|
| `/` | `index.astro` | *(statique)* |
| `/connexion` | `connexion.astro` | `LoginApp` → `Login` |
| `/inscription` | `inscription.astro` | `RegisterApp` → `Register` |
| `/tableau-de-bord` | `tableau-de-bord.astro` | `DashboardApp` → `Dashboard` |
| `/nouvelle-analyse` | `nouvelle-analyse.astro` | `NewAnalysisApp` → `NewAnalysis` |
| `/analyse/:id` | `analyse/[id].astro` | `AnalysisResultApp` → `AnalysisResult` |
| `/admin` | `admin/index.astro` | `AdminApp` → `Admin` |
| `/admin/blog` | `admin/blog.astro` | `AdminBlogApp` → `AdminBlog` |
| `/blog` | `blog/index.astro` | `BlogApp` → `Blog` |
| `/blog/:slug` | `blog/[slug].astro` | `BlogArticleApp` → `BlogArticle` |
| `/mot-de-passe-oublie` | `mot-de-passe-oublie.astro` | `ForgotPasswordApp` → `ForgotPassword` |
| `/reset-password` | `reset-password.astro` | `ResetPasswordApp` → `ResetPassword` |
| `/parametres` | `parametres.astro` | `SettingsApp` → `Settings` |
| `/comprendre-score` | `comprendre-score.astro` | `ComprendreScoreApp` → `ComprendreScore` |
| `/faq` | `faq.astro` | *(statique Astro — accordéons `<details>`)* |
| `/qui-sommes-nous` | `qui-sommes-nous.astro` | *(statique Astro)* |
| `/contact` | `contact.astro` | *(statique Astro — formulaire Web3Forms + enquête satisfaction)* |
| `/mentions-legales` | `mentions-legales.astro` | *(statique Astro)* |
| `/confidentialite` | `confidentialite.astro` | *(statique Astro)* |
| `/cgu` | `cgu.astro` | *(statique Astro)* |
| `/pass-serenite` | `pass-serenite.astro` | `PassSereniteApp` → `PassSerenite` *(page souscription premium)* |
| `/simulateur-valorisation-travaux` | `simulateur-valorisation-travaux.astro` | `SimulateurScoresApp` → `SimulateurScores` *(simulateur IVP/IPI)* |
| `/valorisation-travaux-immobiliers` | `valorisation-travaux-immobiliers.astro` | *(statique Astro — page SEO valorisation)* |
| `/sitemap-blog.xml` | `sitemap-blog.xml.ts` | *(endpoint SSR — sitemap dynamique blog)* |
| `/mon-chantier` | `mon-chantier.astro` | `MonChantierHubApp` → `MonChantierHub` *(hub chantiers)* |
| `/mon-chantier/nouveau` | `mon-chantier/nouveau.astro` | `NouveauChantierApp` → `NouveauChantier` *(création IA)* |
| `/mon-chantier/:id` | `mon-chantier/[id].astro` | `ChantierDetailApp` → `ChantierDetail` *(détail chantier)* |
| `/premium` | `premium.astro` | *(page premium)* |

### API Routes (Astro SSR)

| Route | Fichier | Rôle |
|---|---|---|
| `/api/geo-communes` | `api/geo-communes.ts` | Résolution code postal → communes via geo.api.gouv.fr |
| `/api/market-prices` | `api/market-prices.ts` | Prix immobiliers DVF par commune (table `dvf_prices_yearly`) |
| `/api/strategic-scores` | `api/strategic-scores.ts` | Calcul scores IVP/IPI depuis `strategic_matrix` |
| `/api/newsletter` | `api/newsletter.ts` | Inscription newsletter + webhook MessagingMe |
| `/api/postal-lookup` | `api/postal-lookup.ts` | Lookup code postal → communes (DVF) |
| `/api/rental-prices` | `api/rental-prices.ts` | Prix locatifs par commune |
| `/api/create-checkout-session` | `api/create-checkout-session.ts` | Création session Stripe Checkout (Pass Sérénité) |
| `/api/create-portal-session` | `api/create-portal-session.ts` | Portail client Stripe |
| `/api/stripe-webhook` | `api/stripe-webhook.ts` | Webhook Stripe (souscription, annulation, échec paiement) |
| `/api/premium/*` | `api/premium/` | Statut et essai premium |
| `/api/chantier/*` | `api/chantier/` | Module chantier complet (26 routes dont lots, devis, contacts, messagerie, chat, matériaux, planning, whatsapp — voir `DOCUMENTATION.md` §20) |
| `/api/chantier/[id]/planning` | `api/chantier/[id]/planning.ts` | GET lots + date_debut_chantier / PATCH recalcul cascade dates via computePlanningDates (Promise.all batch) |
| `/api/chantier/[id]/whatsapp` | `api/chantier/[id]/whatsapp.ts` | POST créer groupe whapi + membres / PATCH ajouter participants |
| `/api/chantier/[id]/whatsapp-groups` | `api/chantier/[id]/whatsapp-groups.ts` | GET groupes avec membres imbriqués (2 requêtes, pas de N+1) |
| `/api/chantier/[id]/whatsapp-messages` | `api/chantier/[id]/whatsapp-messages.ts` | GET messages filtrés par `?groupJid=` — limit 200 |
| `/api/webhooks/whapi` | `api/webhooks/whapi.ts` | Webhook whapi : messages entrants + events (join/leave/remove/delete groupe). Toujours 200. |
| `/api/webhooks/inbound-email` | `api/webhooks/inbound-email.ts` | Webhook SendGrid Inbound Parse (réception réponses artisans) |
| `/api/chantier/[id]/agent-insights` | `api/chantier/[id]/agent-insights.ts` | GET (list + unread_count, filtres ?unread/type/limit), POST (create avec dedup 24h, auth X-Agent-Key ou JWT), PATCH (mark read single/all) |
| `/api/chantier/agent-config` | `api/chantier/agent-config.ts` | GET config agent (defaults edge_function), PUT upsert mode + credentials OpenClaw |
| `/api/chantier/[id]/journal` | `api/chantier/[id]/journal.ts` | GET journal entries (?date, ?from&to range, default latest) |
| `/api/chantier/[id]/agent-retry` | `api/chantier/[id]/agent-retry.ts` | POST re-trigger agent après clarification (invalidate cache + re-run) |
| `/api/chantier/[id]/taches` | `api/chantier/[id]/taches.ts` | GET/POST/PATCH/DELETE checklist tâches |
| `/api/chantier/[id]/budget` | `api/chantier/[id]/budget.ts` | GET budget avec buildConseils() (6 types de conseils) |
| `/api/chantier/assistant` | `api/chantier/assistant.ts` | POST analyse Gemini MOE (action prioritaire, alertes, recommandations). Détection mismatch devis↔lot via `detectDevisType`. |
| `/api/chantier/[id]/documents/register` | `api/chantier/[id]/documents/register.ts` | POST enregistrement document + trigger agent-checks |
| `/api/chantier/[id]/documents/[docId]/describe` | `api/chantier/[id]/documents/[docId]/describe.ts` | POST Gemini Vision auto-description (photo/plan/assurance) + mismatch lot |

## Ajouter une page

1. `src/components/pages/MaPage.tsx` — composant React
2. `src/components/app/MaPageApp.tsx` — wrapper `<ReactApp><MaPage /></ReactApp>`
3. `src/pages/ma-page.astro` — `<MaPageApp client:only="react" />` avec `export const prerender = false`

## Organisation du code

- **`lib/*Utils.ts`** : Logique métier externalisée par domaine (`entrepriseUtils`, `devisUtils`, `securiteUtils`, `contexteUtils`, `urbanismeUtils`, `architecteUtils`, `blogUtils`, `scoreUtils`). `lib/constants.ts` contient les constantes partagées. Les composants `analysis/Block*.tsx` importent depuis ces fichiers.
- **`components/admin/`** : Module blog admin complet (`BlogPostList`, `BlogPostEditor`, `BlogDialogs`, `AiGenerationPanel`, `ManualWriteEditor`, `RichTextToolbar`, `ImageManagement`, `blogTypes`)
- **`components/chantier/`** : Module gestion de chantier complet (~45 composants). Création IA (ScreenModeSelection → ScreenPrompt → Qualification → Génération), dashboard (budget, lots, contacts, timeline, documents, conseils IA, chat expert, matériaux, planning). Sous-dossiers : `cockpit/` (CockpitV1, ConceptionPage, PanneauDetail, SimulateurOptions, TimelineHorizontale, ContactsSection), `cockpit/budget/` (12 sous-compos extraits de BudgetTresorerie : BudgetAffinageModal, BudgetGauge, LotBreakdown, AlertesIA, TresoreriePhases, FacturesPaiements, QuickActions, ProjectHeader, ReliabilityBadge, BudgetComparaison, BudgetExplication, BudgetKpiCard), `cockpit/planning/` (PlanningTimeline — Gantt drag/resize sticky col gauche, PlanningWidget — mini-résumé vue d'ensemble), `lots/` (LotCard, LotGrid, LotDetail), `nouveau/` (DashboardChantier, MaterialSelector, ScreenModeSelection, etc.). Voir `DOCUMENTATION.md` §20 pour le détail.
- **`components/funnel/`** : Tunnel de conversion (`FunnelStepper`, `PremiumGate`, `PassSereniteGate`). PremiumGate est intégré dans `BlockPrixMarche` via props (`showGate`, `onAuthSuccess`, `convertToPermanent`) — affiché uniquement quand le bloc est collapsé et l'utilisateur anonyme.
- **`components/analysis/`** : 20 composants dont `DocumentRejectionScreen`, `ExtractionBlocker`, `OcrDebugPanel` (lazy-loaded via `React.lazy` + `Suspense` dans `AnalysisResult.tsx`), `StrategicBadge` (affichage scores IVP/IPI), `UrbanismeAssistant` (assistant urbanisme). `BlockPrixMarche` inclut un `StepIndicator` interne (stepper visuel 2 étapes : Affectation des postes → Analyse des prix).
- **`supabase/functions/analyze-quote/`** : Pipeline modulaire (10 fichiers : `index`, `extract`, `verify`, `score`, `render`, `summarize`, `market-prices`, `domain-config`, `utils`, `types`)
- **`utils/generatePdfReport.ts`** : Génération PDF côté client via `jsPDF`. Structuré par blocs (entreprise, devis, sécurité, contexte) en miroir du frontend. Utilise les mêmes utils métier (`entrepriseUtils`, `securiteUtils`, etc.).
- **`lib/domainConfig.ts`** : Registre frontend des blocs visibles par domaine (`travaux`, `auto`, `dentaire`). Conditionne l'affichage des blocs dans `AnalysisResult`.
- **`lib/budgetAffinageData.ts`** — ELEMENT_DEFS, TRADE_QUESTION_DEFS, computeRefinedRange, computeScore (pure TS, extrait du monolithe BudgetTresorerie)
- **`lib/budgetHelpers.ts`** — fmtK, fmtFull, PHASE_LABELS/COLORS
- **`lib/planningUtils.ts`** — computePlanningDates(), computeStartDateFromEnd(), addBusinessDays(), formatDuration() (pure TS, partagé entre `usePlanning.ts` et l'API route planning)
- **`data/MATERIALS_MAP.ts`** : Catalogue statique de 17 types de chantier × 3+ options matériaux (prix, durabilité, entretien, images). Auto-détection via `detectChantierType()`.
- **Hooks** : 15+ hooks dont `useAnonymousAuth.ts` (auth anonyme), `useMarketPriceEditor.ts` (édition interactive prix marché), `useMaterialAI.ts` (suggestions matériaux Gemini), `useMaterialDetection.ts` (détection type catalogue), `useMaterialSuggestions.ts` (catalogue matériaux dynamique), `usePlanning.ts` (lots + dates planning, moveLot, updateEndDate, recompute), `useAgentInsights.ts` (agent insights CRUD), `useChantierJournal.ts` (journal navigation ← →), `useTaches.ts` (tâches checklist), `useAgentConfig.ts` (config agent mode)
- **Legacy** : `cockpit/useInsights.ts` — ancien système Gemini MOE (insights per-lot éphémères). Utilisé par 6 composants (BudgetTresorerie, AnalyseDevisSection, LotCard, LotIntervenantCard, BudgetKpiCard, dashboardHelpers). **Ne pas supprimer** — à migrer vers `agent_insights` dans une future itération.
- **`components/chantier/cockpit/AssistantChantierSection.tsx`** : Centre de pilotage IA refactoré — clarifications urgentes, tâches (via useTaches), alertes unifiées (merge Gemini + agent insights dédupliqué), recommandations, liens journal/chat.
- **`components/chantier/cockpit/JournalChantierSection.tsx`** : Journal de chantier UX livre — navigation flèches ← →, mini calendrier 14j avec dots sévérité, markdown body du digest IA quotidien.

## Supabase

### Tables (31)
- `analyses` — analyses de devis (table principale). Colonne `market_price_overrides` (JSONB) pour les éditions utilisateur sur les prix marché. Colonne `domain` (TEXT, default `'travaux'`) pour le multi-vertical. **Limite 10 par utilisateur** : les plus anciennes sont purgées automatiquement par le pipeline.
- `analysis_work_items` — lignes de travaux détaillées par analyse. Colonne `job_type_group` (TEXT) pour le rattachement au job type IA.
- `blog_posts` — articles de blog (avec workflow IA, images cover + mid)
- `chantiers` — projets de chantier (nom, emoji, budget, phase, type_projet, project_mode, metadonnees JSON, `date_debut_chantier DATE`). Colonne `project_mode` (TEXT, CHECK: 'guided'|'flexible'|'investor'). Voir `DOCUMENTATION.md` §20.
- `lots_chantier` — lots de travaux par chantier (nom, statut, job_type, budget min/avg/max). Colonnes planning : `duree_jours INT`, `date_debut DATE`, `date_fin DATE`, `ordre_planning INT`, `parallel_group INT`. FK chantiers CASCADE.
- `todo_chantier` — checklist par chantier (titre, priorité, done). FK chantiers CASCADE.
- `chantier_updates` — journal des modifications IA par chantier. FK chantiers CASCADE.
- `documents_chantier` — documents attachés aux chantiers (devis, factures, photos, plans). FK chantiers CASCADE.
- `contacts_chantier` — carnet de contacts par chantier (nom, email, téléphone, SIRET, rôle, notes). Colonne `contact_category` (artisan|architecte|maitre_oeuvre|bureau_etudes|client|autre). FK chantiers CASCADE, FK lots_chantier SET NULL. Source : 'manual'|'devis'|'facture'. RLS user-scoped.
- `chantier_conversations` — conversations email par chantier (1 par contact). Contient reply_address unique pour SendGrid Inbound Parse. FK chantiers CASCADE, FK contacts_chantier SET NULL. RLS user-scoped.
- `chantier_messages` — messages email (outbound/inbound). FK chantier_conversations CASCADE. Direction, subject, body_text, body_html, status. RLS via join sur conversations.user_id.
- `chantier_whatsapp_groups` — groupes WhatsApp par chantier (N groupes possibles). Colonnes : `group_jid TEXT` (JID whapi), `invite_link`, `name`. UNIQUE(group_jid). FK chantiers CASCADE. RLS user-scoped via chantiers.
- `chantier_whatsapp_members` — membres par groupe. Colonnes : `phone TEXT`, `name`, `role` (gmc/client/artisan), `status` (active/left/removed), `left_at`. UNIQUE(group_id, phone). FK groups CASCADE.
- `chantier_whatsapp_messages` — messages WhatsApp reçus via webhook whapi. `id TEXT PK` (whapi msg id — idempotent). `group_id TEXT` = JID brut (**pas une FK UUID** — intentionnel, antérieur aux groups table). RLS user-scoped via chantiers.
- `company_cache` — cache vérification entreprise (recherche-entreprises.api.gouv.fr). Purge auto quotidienne via cron.
- `document_extractions` — cache OCR par hash SHA-256 du fichier (provider, parsed_data, quality_score)
- `dvf_prices` — cache prix immobiliers DVF par commune (code INSEE, prix/m² maison et appartement, nb ventes). Source : data.gouv.fr. RLS lecture publique.
- `market_prices` — référentiel prix marché (~267 lignes). Colonne `domain` (TEXT, default `'travaux'`). Colonnes `ratio_materiaux` / `ratio_main_oeuvre` pour la ventilation. RLS avec policy `market_prices_public_read` (accès anon + authenticated en lecture). Utilisé côté backend (edge functions via service_role) ET côté frontend (calculatrice homepage via anon key).
- `newsletter_subscriptions` — inscriptions newsletter (email unique)
- `post_signature_tracking` — suivi post-signature
- `price_observations` — **données "gold" big data** : snapshot des groupements job type par analyse. Colonne `domain` (TEXT, default `'travaux'`). Survit à la suppression des analyses (pas de FK CASCADE). Voir section dédiée ci-dessous.
- `rental_prices` — prix locatifs par commune (loyer/m² maison et appartement)
- `strategic_matrix` — matrice IVP (Indice de Valorisation Patrimoniale) / IPI (Indice de Performance Investisseur). Scores 0-10 par critère et par job type (9 critères + recovery_rate). RLS lecture publique. Utilisée par `/api/strategic-scores` et le pipeline `analyze-quote`.
- `subscriptions` — abonnements premium (stripe_customer_id, stripe_subscription_id, lifetime_analysis_count)
- `user_roles` — rôles (admin/moderator/user)
- `zones_geographiques` — coefficients géographiques par code postal
- `agent_insights` — observations de l'agent IA (checks SQL + LLM). Types : planning_impact, budget_alert, payment_overdue, conversation_summary, risk_detected, digest, lot_status_change, needs_clarification. Sévérité info/warning/critical. RLS user-scoped + INSERT scoped. Index dedup unique `(chantier_id, title, day)`.
- `agent_config` — configuration dual-mode par user. `agent_mode` : edge_function (défaut) | openclaw | disabled. Credentials OpenClaw optionnels. RLS user-scoped.
- `agent_runs` — log des runs LLM par chantier (morning/evening). Messages analysés, insights créés, actions prises, tokens consommés.
- `chantier_journal` — journal de chantier, 1 page/jour (livre UX). Body markdown (digest IA), alerts_count, max_severity. UNIQUE(chantier_id, journal_date). RLS user-scoped.
- `agent_context_cache` — cache du contexte hydraté (JSON). Invalidé quand documents/planning/contacts changent. TTL 4h. Pas de RLS (service_role only).

### Edge Functions (14)
| Fonction | JWT | Rôle |
|---|---|---|
| `analyze-quote` | false | Pipeline principal d'analyse de devis. Enrichit `documents_chantier.nom` post-analyse + détection mismatch lot. |
| `extract-document` | false | OCR et extraction de texte (interne) |
| `parse-quote` | false | Parsing structuré via Gemini |
| `analyze-attestation` | false | Analyse d'attestations d'assurance |
| `admin-kpis` | false | KPIs dashboard admin (vérifie admin role en interne) |
| `generate-blog-article` | false | Génération articles via Claude API (vérifie admin role en interne) |
| `generate-blog-image` | false | Génération images via fal.ai (vérifie admin role en interne) |
| `publish-scheduled-posts` | false | Cron publication blog programmée |
| `chantier-generer` | false | Génération plan chantier complet via Gemini |
| `chantier-qualifier` | false | Questions contextuelles pour qualifier un projet |
| `system-alerts` | false | Alertes système |
| `read-invoice` | false | Lecture/extraction factures |
| `agent-checks` | false | 7 checks SQL déterministes ($0) : budget overrun, paiements en retard, lots sans devis, facture litige, budget global, devis à relancer, preuves manquantes. Trigger : upload document. |
| `agent-orchestrator` | false | Agent IA temps réel Gemini 2.5 Flash. Context builder (from_me, group→lot mapping, cache 4h). 6 tools function calling. Cron 19h → digest journal. |

> **`verify_jwt = false` sur TOUTES les fonctions** : Supabase Auth signe les JWT avec ES256, mais le runtime edge `verify_jwt` ne supporte pas cet algorithme → "Invalid JWT". Chaque fonction admin vérifie le rôle en interne via `user_roles`.

### Storage (3 buckets)
- `devis` — fichiers PDF/images uploadés (privé, user-scoped)
- `blog-images` — images de couverture et mi-texte (public, admin-only write)
- `chantier-documents` — documents de chantier (privé, user-scoped via RLS)

### Crons
- `purge-expired-company-cache` — quotidien 03h UTC, nettoie les entrées expirées
- `publish-scheduled-blog-posts` — toutes les 15 min, publie les articles programmés
- `agent-orchestrator-evening-digest` — quotidien 17h UTC (19h Paris), digest journal de chantier

### Index de performance
- `idx_analyses_user_status_created` — `analyses(user_id, status, created_at DESC)` — dashboard utilisateur
- `idx_work_items_job_type_group` — `analysis_work_items(job_type_group)` — regroupement prix marché
- `idx_extractions_file_hash` — `document_extractions(file_hash)` — déduplication documents
- `idx_blog_posts_workflow_status` — `blog_posts(workflow_status)` — filtres admin blog
- `idx_price_obs_job_type` — `price_observations(job_type_label)` — agrégation par job type
- `idx_price_obs_catalog` — `price_observations(catalog_job_types)` GIN — recherche par identifiant catalogue
- `idx_price_obs_zip` — `price_observations(zip_code)` — filtrage géographique
- `idx_analyses_domain` — `analyses(domain)` — filtrage multi-vertical
- `idx_market_prices_domain` — `market_prices(domain)` — filtrage multi-vertical
- `idx_price_obs_domain` — `price_observations(domain)` — filtrage multi-vertical
- `idx_strategic_matrix_job_type` — `strategic_matrix(job_type)` — lookup scores IVP/IPI
- `idx_dvf_prices_code_insee` — `dvf_prices(code_insee)` — lookup prix immobiliers par commune
- `idx_lots_planning` — `lots_chantier(chantier_id, ordre_planning)` — tri planning par chantier
- `idx_wa_members_group_id` — `chantier_whatsapp_members(group_id)` — webhook + RLS + CASCADE
- `idx_conv_contact_id` — `chantier_conversations(contact_id)` — ON DELETE SET NULL
- `idx_contacts_lot_id` / `idx_contacts_devis_id` / `idx_contacts_analyse_id` — FK SET NULL sur contacts_chantier
- `idx_insights_chantier` — `agent_insights(chantier_id, created_at DESC)` — liste insights par chantier
- `idx_insights_unread` — `agent_insights(chantier_id, read_by_user) WHERE NOT read_by_user` — badge unread
- `idx_insights_dedup` — `agent_insights(chantier_id, title, date_trunc('day', created_at AT TIME ZONE 'UTC'))` UNIQUE — déduplication
- `idx_agent_runs_chantier` — `agent_runs(chantier_id, created_at DESC)` — dernier run par chantier
- `idx_journal_chantier` — `chantier_journal(chantier_id, journal_date DESC)` — navigation journal

### Régénérer les types
```bash
npx supabase gen types typescript --project-id vhrhgsqxwvouswjaiczn > src/integrations/supabase/types.ts
```

## Prix marché (market_prices)

La comparaison de prix marché utilise la table `market_prices` (~220 lignes) avec un **système hiérarchique par job type**.

### Format de données

Le backend retourne un format hiérarchique `JobTypePriceResult[]` (stocké dans `raw_text.n8n_price_data`). Chaque job type contient :
- `job_type_label` : libellé ("Pose carrelage sol")
- `catalog_job_types` : identifiants catalogue matchés
- `main_unit` / `main_quantity` : unité et quantité principales (déterminées par Gemini)
- `devis_lines[]` : lignes du devis rattachées (index, description, montant, quantité, unité)
- `devis_total_ht` : somme des montants des lignes
- `prices[]` : prix marché matchés depuis le catalogue

**Rétrocompatibilité** : le frontend détecte l'ancien format (présence de `description` sans `job_type_label`) et bascule sur `processLegacyWorkItems()`.

### Flux backend (`market-prices.ts`)

1. **Chargement** : `lookupMarketPrices()` récupère les ~220 lignes de `market_prices`
2. **Catalogue** : construit un Set de `job_type` valides + une Map `catalogLabels` pour forcer les libellés catalogue (pas ceux de Gemini)
3. **Identification IA** : Gemini (gemini-2.0-flash) regroupe les postes du devis en 3-7 GRANDS types de travaux. Regroupement large (prépa + fourniture + accessoires + finitions = même groupe). Choisit le bon variant fourniture/hors fourniture.
4. **Validation serveur** : filtre les `job_types` inventés (pas dans le catalogue), remplace le label Gemini par le label catalogue (`catalogLabels.get(validatedJobTypes[0])`)
5. **Gestion "Autre"** : les groupes sans match catalogue valide + les lignes orphelines (non assignées par Gemini) → fusionnés dans un groupe "Autre" avec `job_types: []`
6. **Construction** : pour chaque job type, construit `devis_lines[]` et calcule `devis_total_ht` (somme des montants HT)
7. **Stockage** : `index.ts` stocke `job_type_group` sur chaque `analysis_work_items`
8. **Snapshot** : `index.ts` insère dans `price_observations` (hors groupe "Autre") pour conservation big data
9. **Purge** : en fin de pipeline, supprime les analyses au-delà de 10 par utilisateur (fichiers storage inclus). Les `price_observations` survivent (pas de FK).

### Flux frontend

- **`useMarketPriceAPI.ts`** : transforme les données brutes en `JobTypeDisplayRow[]`. Calcule `theoreticalMin/Avg/MaxHT` = Σ(price × mainQuantity + fixed) par prix matché. Verdict basé sur comparaison devisTotalHT vs theoreticalAvgHT.
- **`BlockPrixMarche.tsx`** : affiche des cartes collapsibles par job type (lignes détaillées + jauge MarketPositionAnalysis). Supporte le drag & drop de lignes entre job types et la modification de quantité.
- **`useMarketPriceEditor.ts`** : gère l'état mutable (déplacements de lignes, quantités modifiées). Persiste les modifications dans `analyses.market_price_overrides` (JSONB) **ET met à jour `price_observations`** avec les données corrigées. Quand une ligne est déplacée, seul `devis_total_ht` change (prix théorique inchangé). Quand la quantité change, `theoreticalXxxHT` est recalculé.

### Format des overrides (`market_price_overrides`)

```json
{
  "quantity_overrides": { "Pose carrelage sol": 35 },
  "line_reassignments": { "3": "Peinture murs" },
  "validated_at": "2026-02-13T..."
}
```

### Décisions clés

- Gemini ne fait PAS de calcul de prix — il identifie, groupe et matcher. Toute arithmétique est en JS.
- **Regroupement large** : viser 3-7 groupes. Préparation + fournitures + accessoires + finitions → même groupe que le travail principal. Frais divers → rattachés au groupe principal le plus gros.
- Chaque ligne du devis = UN SEUL job type (pas de double comptage).
- Version fourniture/hors fourniture : Gemini en choisit UNE SEULE selon le contenu du devis.
- **Validation stricte** : les `job_types` retournés par Gemini sont filtrés contre le Set des identifiants catalogue valides. Les inventés sont supprimés. Le label est forcé depuis le catalogue.
- Les frais fixes (`fixed_min/avg/max_ht`) s'ajoutent une seule fois par job_type, indépendamment de la quantité.
- **Drag & drop** : HTML5 natif, pas de lib externe. Persisté via bouton Save.
- **Quantité éditable** : click sur la quantité → input inline. Recalcule prix théorique et verdict.

**Ajouter un prix** : INSERT dans `market_prices` avec les colonnes `job_type, label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht, fixed_min_ht, fixed_avg_ht, fixed_max_ht, zip_scope, notes`.

### Extraction conditionnelle — Devis menuiseries

Le prompt d'extraction (`domain-config.ts`, règle 8) contient une **logique conditionnelle** pour les devis de menuiseries (fenêtres, baies vitrées, portes-fenêtres). Ces devis ont une structure particulière : blocs composés par pièce avec des sous-éléments techniques sans prix individuel, un forfait pose (MO) séparé, et un SOUS-TOTAL par bloc.

**Stratégie** : Gemini détecte automatiquement ce type de devis et applique une extraction différente :
- 1 ligne par bloc SOUS-TOTAL (pas 1 ligne par sous-élément)
- Le libellé inclut la pièce + le titre du bloc avec dimensions
- Le montant = SOUS-TOTAL (fourniture + pose incluse)
- Classification basée sur le texte du devis : "Porte-fenêtre" → porte-fenêtre, "Châssis composé" → baie vitrée, "Fenêtre" → fenêtre

**Approche actuelle** : prompt unique (1 seul appel Gemini). Si on constate des interférences sur les devis non-menuiserie, passer en 2 passes (1 appel type-detection + 1 appel extraction spécifique).

**Entrées `market_prices` menuiseries** : `porte_fenetre_pvc_fourniture_pose` (moy 1200€), `porte_fenetre_alu_fourniture_pose` (moy 1800€), `baie_vitree_pvc_fourniture_pose` (moy 2300€), `baie_vitree_alu_fourniture_pose` (moy 3200€), `chassis_compose_pvc_fourniture_pose` (moy 2800€), `evacuation_dechets_menuiserie` (forfait moy 150€).

## Price Observations (données big data)

Table `price_observations` — données "gold" pour le benchmarking prix par job type et zone géographique. **Survit à la suppression des analyses** (pas de FK CASCADE).

### Structure

Une ligne par job type par analyse :
- `job_type_label` (TEXT) — ex: "Pose carrelage sol"
- `catalog_job_types` (TEXT[]) — identifiants catalogue matchés
- `main_unit` / `main_quantity` — unité et quantité (après correction utilisateur)
- `devis_total_ht` (NUMERIC) — somme des montants des lignes du groupe
- `line_count` (INTEGER) — nombre de lignes dans le groupe
- `devis_lines` (JSONB) — détail : `[{description, amount_ht, quantity, unit}]`
- `zip_code` (TEXT) — code postal du chantier

### Alimentation

1. **Pipeline** (`analyze-quote/index.ts`) : INSERT automatique après le groupement IA (hors groupe "Autre")
2. **Corrections utilisateur** (`useMarketPriceEditor.ts`) : UPDATE quand l'utilisateur valide ses corrections drag-and-drop

### Requête type (prix moyen au m² par job type et zone)

```sql
SELECT job_type_label, LEFT(zip_code, 2) as dept,
       AVG(devis_total_ht / NULLIF(main_quantity, 0)) as prix_moyen_unitaire,
       COUNT(*) as nb_observations
FROM price_observations
WHERE 'carrelage_sol' = ANY(catalog_job_types)
GROUP BY job_type_label, LEFT(zip_code, 2);
```

### Limite 10 analyses par utilisateur

Le pipeline `analyze-quote` purge automatiquement les analyses au-delà de 10 par utilisateur en fin de traitement. Les fichiers storage associés sont aussi supprimés. Les `price_observations` ne sont pas affectées car il n'y a pas de FK CASCADE — elles s'accumulent indéfiniment pour le benchmarking.

## Calculatrice homepage (`DevisCalculatorSection.tsx`)

Estimateur de prix sur la page d'accueil. Requête directe Supabase sur `market_prices` (plus de webhook N8N).

- **`JobTypeSelector.tsx`** : combobox custom avec recherche accent-insensitive. Charge dynamiquement les types de travaux depuis `market_prices` au mount (déduplique par `job_type`, préfère l'entrée avec `notes === "Base"`). ~233 types disponibles.
- **Calcul local** : `total = (price_unit × qty) + fixed`, puis `applyZoneCoefficient(total, zip)`.
- **Unité dynamique** : le champ quantité adapte son label/placeholder selon l'unité du type sélectionné (m², ml, forfait, heure, unité, etc.).

## Vérification entreprise (`verify.ts`)

Phase 2 du pipeline — 100% appels API déterministes, pas d'IA. Aucune API payante.

### APIs appelées
1. **recherche-entreprises.api.gouv.fr** (gratuit, sans clé) → identité entreprise : nom, date création, statut actif/cessé, adresse siège, procédure collective. Résultat caché dans `company_cache` (TTL 30 jours, provider: `"recherche-entreprises"`).
2. **data.economie.gouv.fr** (gratuit, sans clé) → ratios financiers INPI/BCE : chiffre d'affaires, résultat net, taux d'endettement, ratio de liquidité, autonomie financière, marge EBE, capacité de remboursement. Dataset `ratios_inpi_bce`, multi-exercices (jusqu'à 5 ans).
3. **OpenIBAN** → validation IBAN, pays, banque
4. **Google Places** (`GOOGLE_PLACES_API_KEY`) → note et avis
5. **ADEME RGE** → qualifications RGE (si travaux énergie)
6. **Géorisques** (via api-adresse.data.gouv.fr + georisques.gouv.fr) → risques naturels, zone sismique
7. **GPU/IGN** → patrimoine protégé

### Scoring financier (score.ts)
- **ROUGE** : procédure collective, taux d'endettement > 200%, pertes > 20% du CA, paiement espèces, acompte > 50%
- **ORANGE** : endettement 100-200%, liquidité < 80%, note Google < 4.0, entreprise < 2 ans, acompte 30-50%
- **VERT** : entreprise immatriculée, résultat net positif, autonomie financière > 30%, IBAN FR valide, bonne note Google

## Modèles IA par tâche

| Tâche | Modèle | Pourquoi |
|---|---|---|
| Extraction OCR (`extract.ts`) | gemini-2.5-flash | Puissance OCR + raisonnement nécessaires pour parser des documents complexes |
| Groupement prix marché (`market-prices.ts`) | gemini-2.0-flash | Obéissance aux règles catalogue, pas de créativité — le modèle thinking invente des identifiants |
| Résumés lignes de travaux (`summarize.ts`) | gemini-2.0-flash | Tâche simple, pas besoin de raisonnement complexe |

**Endpoint** : `generativelanguage.googleapis.com/v1beta/openai/chat/completions` (OpenAI-compatible, Bearer auth)

## Pièges connus

- **Gemini 2.5-flash "thinking" budget** : Ce modèle utilise une partie du `max_tokens` pour son raisonnement interne. Avec `max_tokens: 4096`, le thinking peut consommer ~3000 tokens → JSON de sortie tronqué → parsing échoue → toutes les lignes dans "Autre". Solution : `max_tokens: 32768` pour extract.ts.
- **Gemini 2.5-flash trop créatif pour le catalogue** : Invente des `job_types` qui n'existent pas dans la table `market_prices`. Solution : utiliser gemini-2.0-flash pour market-prices.ts + validation serveur stricte.
- **Gemini 2.5-flash réécrit les textes** : Lors de l'extraction, au lieu de copier le libellé mot pour mot, il "résume" ou "reformule". Solution : instruction explicite "COPIE MOT POUR MOT" + template JSON avec "TEXTE EXACT copié mot pour mot depuis le devis".
- **Prompt "plus de types = mieux"** : L'instruction "en cas de doute, plus de types" a causé la création d'1 groupe par ligne de devis. Solution : cibler explicitement 3-7 groupes avec regroupement large.
- **Flexbox overflow** : Un `flex-1` sans `min-w-0` permet aux enfants de dépasser le conteneur parent. Toujours ajouter `min-w-0` sur les div flex-1 contenant du texte long.
- **RLS sur `market_prices`** : Les edge functions utilisent `service_role_key` (bypass RLS), mais le frontend utilise `anon key`. Si on ajoute une requête frontend sur une table sans policy SELECT pour `anon`, la requête retourne un tableau vide sans erreur. Solution : toujours vérifier qu'une policy RLS existe pour `anon` quand on requête depuis le client.
- **ES256 JWT et `verify_jwt`** : Supabase Auth utilise ES256 pour signer les JWT. Le runtime edge function `verify_jwt` ne le supporte pas → renvoie "Invalid JWT" sur chaque appel. Solution : `verify_jwt = false` dans `config.toml` + déployer avec `--no-verify-jwt`. Chaque fonction admin vérifie le rôle manuellement.
- **Logs edge functions — fuites de secrets** : Les `catch` blocks peuvent logger des objets Error contenant des clés API ou Bearer tokens dans les headers. Solution : toujours utiliser `error.message` (pas l'objet complet) + masquer les tokens avec regex `Bearer\s+[a-zA-Z0-9_.-]+` → `Bearer ***`.
- **Astro 5 `output: 'hybrid'` supprimé** : L'option `hybrid` n'existe plus en Astro 5. Utiliser `output: 'static'` avec un adapter — les pages avec `export const prerender = false` seront rendues côté serveur automatiquement.
- **Variables d'env Vercel côté client** : En Astro sur Vercel, seules les variables préfixées `PUBLIC_` sont exposées au client. `VITE_SUPABASE_URL` ne marche pas → utiliser `PUBLIC_SUPABASE_URL` et `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- **React hooks après conditional return (Error #310)** : Dans `AnalysisResult.tsx`, les hooks (`useState`, `useRef`) doivent être déclarés AVANT tout `if (loading) return` ou `if (!data) return`. Sinon React voit un nombre de hooks différent entre les renders → crash production "Too many re-renders" (Error #310).
- **Planning — stale closure dans setState** : dans `usePlanning.ts`, toujours `setState(s => ...)` pour lire l'état courant dans les callbacks (moveLot, etc.) — fermer sur la variable d'état donne une version figée au moment de l'appel.
- **Planning API — batch DB** : utiliser `Promise.all` pour les UPDATE simultanés sur `lots_chantier`. Les boucles `for` séquentielles peuvent provoquer des deadlocks Postgres sous charge.
- **contacts_chantier colonnes** : la colonne téléphone est `telephone` (pas `phone`), le rôle est `role` (pas `metier`). Les API routes retournent `select('*')` donc les champs existent mais avec les noms DB. `context.ts` agent doit utiliser `c.telephone` et `c.role`.
- **paymentEventsRes clé** : GET `/payment-events` retourne `{ payment_events: [...] }`, pas `{ data: [...] }`. Toujours accéder via `res?.payment_events`.
- **tools.ts priorite** : l'enum doit être `["urgent", "important", "normal"]` — jamais `"low"` (rejeté silencieusement par `taches.ts`).
- **WhatsApp messages — group_id TEXT** : `chantier_whatsapp_messages.group_id` est un TEXT stockant le JID brut (ex: `120363xxxxx@g.us`), **pas** un UUID FK vers `chantier_whatsapp_groups`. Intentionnel — la table messages est antérieure à la table groups. Ne pas essayer de le migrer en UUID FK sans plan de migration des données.
- **RLS nouvelles tables — toujours wrapper** : `auth.uid()` appelé seul = 1 éval par ligne. Toujours écrire `(select auth.uid())` dans les nouvelles policies. Voir migrations 20260226 et 20260401400000 pour les patterns corrects.

## SEO et données structurées

### BaseLayout.astro — props SEO
`BaseLayout.astro` accepte des props SEO optionnelles : `canonical`, `ogType`, `ogImage`, `jsonLd` (objet Schema.org), `breadcrumbs` (tableau `{name, url}`). Toute page qui a besoin de données structurées les passe via ces props.

### Assets SEO
- OG image : `public/og-image.png` 1200×630 — référencé dans BaseLayout.astro. **Ne pas reconvertir en SVG.**
- Logos : `public/images/logo.webp` + `logo-detoure.webp` (-87% vs PNG). **Ne pas reconvertir en PNG.**
- robots.txt : Disallow `/api/`, règles AI crawlers (GPTBot, CCBot, ClaudeBot, etc.)

### JSON-LD par page
- **Global** (toutes les pages) : `Organization` (logo, email, description) + `WebSite` (SearchAction)
- **Global** (si `breadcrumbs` fourni) : `BreadcrumbList` automatique
- `/faq` : `FAQPage` avec `mainEntity` généré depuis le tableau `faqs`
- `/qui-sommes-nous` : `AboutPage` avec `Organization` en `mainEntity`
- `/comprendre-score` : `HowTo` (étapes du scoring)
- `/blog` : `CollectionPage`
- `/blog/:slug` : `Article` (titre, auteur, dates, image) — données récupérées côté serveur dans le frontmatter Astro via `supabase.from("blog_posts").select()`

### Sitemaps
- `public/sitemap.xml` — pages statiques (16 URLs — dont /pass-serenite, /premium, /calculette-travaux, /simulateur-valorisation-travaux)
- `src/pages/sitemap-blog.xml.ts` — endpoint SSR dynamique, requête les `blog_posts` publiés dans Supabase
- `public/robots.txt` référence les deux sitemaps

## Pass Sérénité (abonnement premium Stripe)

Abonnement mensuel à 4,99€ TTC via Stripe Checkout. Donne accès aux analyses illimitées + rapport PDF + tri par type de travaux.

### Modèle freemium

- **Gratuit** : 5 analyses à vie (compteur `lifetime_analysis_count` dans `subscriptions`)
- **Pass Sérénité** : analyses illimitées, rapport PDF, tri par type de travaux
- **Gate** : à la 6e analyse, l'analyse tourne mais les résultats sont bloqués par `PassSereniteGate` (redirection vers `/pass-serenite`)
- **PDF** : verrouillé pour les utilisateurs gratuits (toast avec lien vers `/pass-serenite`)

### Compteur d'analyses

- **Incrémentation** : RPC `increment_analysis_count(p_user_id)` — upsert atomique dans `subscriptions`, appelé par `analyze-quote/index.ts` en début de pipeline
- **Dashboard** : affiche "X/5 analyses utilisées" ou badge "Pass Sérénité" si abonné
- **Header** : lien "Pass Sérénité" dans le dropdown utilisateur (entre Paramètres et Administration), avec check vert si abonné

### Stripe

- **Price ID** : `price_1T9rrRF67GfPqM0XxH5rRrDM` (live, abonnement mensuel 4,99€)
- **Checkout** : `/api/create-checkout-session` crée une session Stripe Checkout, lie le `stripe_customer_id` à l'utilisateur dans `subscriptions`
- **Webhook** : `/api/stripe-webhook` gère 4 events : `checkout.session.completed` (active la souscription), `customer.subscription.updated` (met à jour le statut), `customer.subscription.deleted` (désactive), `invoice.payment_failed` (marque `past_due`)
- **Vérification signature** : optionnelle via `STRIPE_WEBHOOK_SECRET` (fallback JSON parse sans secret en dev)

### Variables d'environnement Stripe

| Variable | Où | Usage |
|---|---|---|
| `PUBLIC_STRIPE_PUBLISHABLE_KEY` | Vercel + `.env` | Clé publique Stripe (côté client) |
| `STRIPE_SECRET_KEY` | Vercel uniquement | Clé secrète Stripe (API routes serveur) |
| `STRIPE_WEBHOOK_SECRET` | Vercel uniquement | Secret de signature webhook (optionnel en dev) |

### Fichiers clés

- `src/components/pages/PassSerenite.tsx` — page de souscription (hero, 4 features, comparaison, CTA)
- `src/components/funnel/PassSereniteGate.tsx` — gate affichée quand > 5 analyses
- `src/pages/api/create-checkout-session.ts` — création session Stripe
- `src/pages/api/stripe-webhook.ts` — webhook handler
- `src/lib/subscription.ts` — `getSubscriptionInfo()` avec `lifetimeAnalysisCount`
- `src/hooks/usePremium.ts` — hook React (`isPremium`, `lifetimeAnalysisCount`)
- `supabase/migrations/20260311120000_add_stripe_pass_serenite.sql` — colonnes Stripe + RPC compteur

### Colonnes ajoutées à `subscriptions`

- `stripe_customer_id` (TEXT) — ID client Stripe
- `stripe_subscription_id` (TEXT) — ID souscription Stripe
- `lifetime_analysis_count` (INTEGER, DEFAULT 0) — compteur d'analyses à vie

## Cookie consent RGPD

Bandeau cookie dans `BaseLayout.astro` avec boutons **Accepter / Refuser**. Stockage dans `localStorage('cookie-consent')` : `'accepted'` ou `'rejected'`.

- **Si accepté** : appelle `loadTrackingScripts()` qui injecte GA + Meta Pixel dans le DOM (actuellement commentés, prêts à activer)
- **Si refusé** : rien n'est chargé, le bandeau ne réapparaît plus
- **Nouveau visiteur** : le bandeau s'affiche

**À configurer** : remplacer `G-XXXXXXXXXX` (Google Analytics) et `XXXXXXXXXXXXXXX` (Meta Pixel ID) dans `BaseLayout.astro` puis décommenter le code.

## Page Contact (Web3Forms)

`src/pages/contact.astro` — formulaire serverless via Web3Forms (POST vers `api.web3forms.com/submit`). Champs : nom, email, catégorie (select), message. Protection anti-bot par honeypot (`<input type="checkbox" name="botcheck" class="hidden">`). Redirection vers `/contact?success=true` après envoi. Clé Web3Forms configurée : `0bdbe892-3eef-4a5e-9915-87d190d6e145`.

### Enquête de satisfaction

La page contact gère aussi les retours d'enquête de satisfaction par email. Quand un utilisateur clique sur un smiley dans l'email d'enquête, il arrive sur `/contact?rating=X&user=email`. Le script :
1. Masque le formulaire classique
2. Affiche un message de remerciement avec l'emoji correspondant
3. Envoie la note via Web3Forms (sujet : "Enquete satisfaction - Note X/5")
4. Propose un lien pour laisser un message complémentaire

Le template HTML de l'email d'enquête est dans `emails/enquete-satisfaction.html` (variables : `{{first_name}}`, `{{email}}`, `{{unsubscribe_url}}`).

## Webhooks MessagingMe (CRM)

Intégration avec MessagingMe pour le suivi des utilisateurs. Webhooks entrants (incoming webhooks) déclenchés automatiquement.

### Webhook inscription (`Register.tsx`)
- **URL** : `https://ai.messagingme.app/api/iwh/25a2bb855e30cf49b1fc2aac9697478c`
- **Déclenchement** : après `supabase.auth.signUp()` réussi (fire & forget)
- **Payload** : `{ event, email, phone, first_name, last_name, accept_commercial, source, registered_at }`
- **Téléphone** : format international (`+33612345678`) — sélecteur de pays avec 14 indicatifs (France par défaut)

### Webhook newsletter (`/api/newsletter.ts`)
- **URL** : `https://ai.messagingme.app/api/iwh/fa98aca201609862553a50cbdda5b8db`
- **Déclenchement** : après upsert dans `newsletter_subscriptions` (try/catch, non-bloquant)
- **Payload** : `{ event, email, source, subscribed_at }`

### Sélecteur indicatif pays (inscription)

`Register.tsx` inclut un sélecteur de pays (`COUNTRY_CODES`, 14 pays) avec drapeaux emoji et indicatifs. Le numéro est validé selon le nombre de chiffres du pays sélectionné. Le format stocké dans Supabase et envoyé au webhook est international (ex: `+33612345678` — le 0 initial est supprimé automatiquement).

## Architecture multi-verticale (domain)

Préparation pour supporter d'autres domaines que "travaux" (auto, dentaire, etc.) **sans changer le fonctionnement actuel**. Tout est `DEFAULT 'travaux'`, zéro régression.

- **Migration** : `20260215140000_add_domain_columns.sql` — colonne `domain` + index sur `analyses`, `market_prices`, `price_observations`
- **Backend** : `supabase/functions/analyze-quote/domain-config.ts` — config centralisée par domaine (prompts IA, assurances, certifications, labels). `getDomainConfig(domain)` est appelé par `extract.ts`, `market-prices.ts`, `score.ts`, `render.ts`.
- **Frontend** : `src/lib/domainConfig.ts` — registre des blocs visibles par domaine. `AnalysisResult` utilise `getVisibleBlocks(domain)` pour conditionner l'affichage.
- **Type** : `DomainType = 'travaux' | 'auto' | 'dentaire'` défini dans `analyze-quote/types.ts`

## Barre de progression (analyse en cours)

`AnalysisResult.tsx` affiche une barre de progression animée pendant le polling de l'analyse. Le backend émet des messages préfixés `[1/5]`, `[2/5]`, etc. dans `analyses.status_message`. Le frontend parse ces préfixes via `parseStepFromMessage()` et affiche l'étape courante avec icône + pourcentage. Des messages d'attente rotatifs (`WAITING_MESSAGES`) se succèdent toutes les 5 secondes.

## Widget MessagingMe

Script chat widget chargé dans `<head>` de `BaseLayout.astro` : `<script src="https://ai.messagingme.app/widget/f236879w135897.js" async>`. Présent sur toutes les pages.

## Messagerie chantier (SendGrid)

Onglet "Messagerie" dans la sidebar du dashboard chantier. Emails (SendGrid) + groupes WhatsApp réels (whapi.cloud).

### Architecture email

- **Envoi** : API route `POST /api/chantier/[id]/messages` → SendGrid Mail API
- **Réception** : SendGrid Inbound Parse → webhook `POST /api/webhooks/inbound-email`
- **Reply-to** : adresse unique par conversation `chantier-{id}+{convId}@{REPLY_EMAIL_DOMAIN}`
- **Templates** : fichier statique `src/data/MESSAGE_TEMPLATES.ts` avec interpolation de variables

### API Routes messagerie

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/chantier/[id]/conversations` | Liste des conversations |
| GET | `/api/chantier/[id]/conversations/[convId]` | Messages + mark read |
| PATCH | `/api/chantier/[id]/conversations/[convId]` | Marquer comme lu |
| POST | `/api/chantier/[id]/messages` | Envoyer un message |
| POST | `/api/webhooks/inbound-email` | Webhook SendGrid (pas de JWT) |

### Variables d'environnement

| Variable | Où | Usage |
|---|---|---|
| `SENDGRID_API_KEY` | Vercel | Envoi/notification email via SendGrid |
| `REPLY_EMAIL_DOMAIN` | Vercel | Sous-domaine reply (default: `reply.verifiermondevis.fr`) |

### Configuration SendGrid requise

1. Domain Authentication pour le domaine d'envoi
2. MX record `reply.verifiermondevis.fr` → `mx.sendgrid.net`
3. Inbound Parse webhook URL → `https://www.verifiermondevis.fr/api/webhooks/inbound-email`

### Composants

- `MessagerieSection.tsx` — orchestrateur (2 colonnes desktop, vue unique mobile)
- `ConversationList.tsx` — liste des conversations avec search, badges unread
- `ConversationThread.tsx` — fil de messages avec bulles, auto-scroll
- `MessageComposer.tsx` — zone de saisie + templates + WhatsApp
- `TemplateSelector.tsx` — dropdown de templates avec interpolation
- `useConversations.ts` / `useMessages.ts` — hooks de données

### WhatsApp groupes (whapi.cloud)

Intégration whapi pour créer de vrais groupes WhatsApp depuis le cockpit chantier. N groupes par chantier.

- **Création** : `POST /api/chantier/[id]/whatsapp` → `createWhatsAppGroup()` dans `whapiUtils.ts` → INSERT `chantier_whatsapp_groups` + `chantier_whatsapp_members`
- **Participants** : sélection dans une modale (contacts du chantier). Client + GMC (33633921577) toujours inclus. Rôles : `gmc` / `client` / `artisan`.
- **Webhook** : `POST /api/webhooks/whapi` reçoit messages (`payload.messages[]`) + events (`payload.events[]`). Lookup groupe via `group_jid`. Toujours répondre 200 (whapi retry sur non-2xx).
- **Thread** : `WhatsAppThread.tsx` — bulles colorées par rôle : gmc→`#DCF8C6` droite, client→`#DBEAFE` droite, artisan→blanc gauche. Props : `userPhone`, `groupJid`, `groupName`.
- **Panel** : `WhatsAppGroupsPanel.tsx` — liste groupes + membres dépliables + modale création. `onGroupCreated: () => void` → re-fetch complet (pas d'append partiel).
- **Pattern fetch** : `fetchWaGroups` = `useCallback([chantierId, token])` dans `MessagerieSection.tsx` — évite la boucle infinie si on met `waGroups` en dépendance.
- **Env** : `WHAPI_TOKEN` (Vercel) — utilisé dans `whapiUtils.ts`

## Email marketing (SMTP OVH + MessagingMe)

- **Adresse expéditeur** : `contact@verifiermondevis.fr` (hébergé OVH)
- **SMTP** : `ssl0.ovh.net`, port 587 (STARTTLS)
- **Plateforme d'envoi** : MessagingMe (envoi d'emails marketing/transactionnels via workflows)
- **Templates email** : `emails/enquete-satisfaction.html` — enquête de satisfaction (5 smileys cliquables)
- **Webhooks CRM** : inscription + newsletter poussés vers MessagingMe (voir section dédiée)

## Authentification et navigation admin

- **Login avec redirect** : `Login.tsx` supporte `?redirect=` query param. Après connexion, redirige vers le path spécifié au lieu de `/tableau-de-bord`.
- **Pages admin protégées** : `Admin.tsx` et `AdminBlog.tsx` vérifient le rôle admin via `user_roles` query (pas via l'edge function). Si accès refusé, proposent un bouton "Se connecter en admin" qui fait `signOut()` + redirect vers `/connexion?redirect=/admin`.
- **Navigation inter-admin** : Barre de navigation sous le Header avec liens KPIs / Blog.
- **Reset mot de passe** : `ForgotPassword.tsx` envoie un email via `supabase.auth.resetPasswordForEmail()` avec `redirectTo` vers `/reset-password`. `ResetPassword.tsx` écoute l'event `PASSWORD_RECOVERY` via `onAuthStateChange` puis appelle `supabase.auth.updateUser({ password })`. Configurer l'URL dans Supabase Dashboard > Authentication > URL Configuration > Redirect URLs.
- **Paramètres du compte** : `Settings.tsx` (`/parametres`) permet de modifier prénom, nom, téléphone via `supabase.auth.updateUser({ data })` et de changer le mot de passe. Auth guard redirige vers `/connexion`. Accessible depuis le bouton Settings du dashboard.
- **Admins** : `julien@messagingme.fr`, `bridey.johan@gmail.com` (rôle `admin` dans `user_roles`)

## Sécurité

### Principes appliqués

- **Authentification JWT côté serveur** : les API routes sensibles (`create-checkout-session`, `create-portal-session`) vérifient le JWT via `supabase.auth.getUser(token)` et extraient le `userId` du token (jamais du body).
- **Pas de mutation client-side** : `activatePremium()` et `startTrial()` ont été supprimés de `lib/subscription.ts`. Toute activation premium passe par le webhook Stripe côté serveur.
- **Signature webhook obligatoire** : `stripe-webhook.ts` rejette les requêtes si `STRIPE_WEBHOOK_SECRET` n'est pas configuré (pas de fallback JSON.parse).
- **Pas de debug endpoint en prod** : `/api/debug-supabase` supprimé.

### Validation des entrées

- **SIRET** : validé `^\d{14}$` avant injection dans les URLs d'API externes (`verify.ts`). `encodeURIComponent()` appliqué systématiquement.
- **Supabase queries** : toutes les requêtes DB utilisent le client paramétré (`.eq()`, `.upsert()`, `.rpc()`). Pas de SQL brut.
- **Inputs utilisateur dans prompts IA** : les libellés du devis (issus du PDF) sont injectés dans les prompts Gemini (`market-prices.ts`, `summarize.ts`). Risque de prompt injection. Défense partielle : validation catalogue strict des `job_types` retournés.

### Points d'attention (non corrigés)

- **Prompt injection** : le texte du PDF est concaténé directement dans les prompts Gemini. Mitigation : délimiteurs `[DATA]` à ajouter si le risque augmente.
- **CORS `*`** : les API routes mutation utilisent `Access-Control-Allow-Origin: *`. À restreindre à `https://www.verifiermondevis.fr` en production.
- **`analyze-quote` ownership** : la edge function ne vérifie pas que le caller est le propriétaire de l'analyse. Protection : les analysisId sont des UUID non prédictibles.
- **`webhook-registration`** : endpoint non authentifié qui forward vers le CRM MessagingMe. Rate limiting absent.
- **XSS** : `ScreenAmeliorations.tsx` utilise `dangerouslySetInnerHTML` sur du texte IA non sanitizé. `blogUtils.ts` SSR utilise un regex de sanitization faible (DOMPurify côté client uniquement).
- **GA et RGPD** : le script `gtag.js` se charge avant le consentement cookie (Consent Mode v2 est configuré mais le script est fetché).

### Variables d'environnement sensibles (Vercel uniquement)

| Variable | Obligatoire | Usage |
|---|---|---|
| `STRIPE_SECRET_KEY` | Oui | API Stripe server-side |
| `STRIPE_WEBHOOK_SECRET` | **Oui (obligatoire en prod)** | Vérification signature webhook |
| `SUPABASE_SERVICE_ROLE_KEY` | Oui | Bypass RLS dans les API routes |
| `GOOGLE_API_KEY` | Oui | Gemini (extraction, groupement, résumé) |
| `GOOGLE_PLACES_API_KEY` | Oui | Notes et avis Google Places |
| `AGENT_SECRET_KEY` | Oui (quand agent actif) | Auth inter-service edge functions → API routes (header `X-Agent-Key`) |

## Règles importantes

- **Header/Footer** existent en 2 versions : `layout/Header.tsx` (React) + `astro/Header.astro`. Toute modif doit être faite dans les 2.
- **shadcn-ui** (`src/components/ui/`) : ne pas modifier manuellement
- **types.ts** (`src/integrations/supabase/`) : auto-généré, ne pas modifier
- **Alias** : `@/` → `src/`
- **Interface** en français, **code** en anglais
- **Params dynamiques** : `[id].astro` et `[slug].astro` — les composants React extraient les params de `window.location.pathname`
- **Commandes** : `npm run dev` | `npm run build` | `npm run preview` | `npm run lint`

## Agent IA — Pilote de Chantier

Architecture temps réel + digest quotidien. Design doc : `docs/plans/2026-04-05-agent-orchestration-design.md`. Plan : `docs/plans/2026-04-05-agent-orchestration-plan.md`.

### Triggers temps réel
- **Upload document** → `agent-checks` (SQL, $0) fire-and-forget depuis `register.ts`/`depense-rapide.ts`. L'`agent-orchestrator` (Gemini) fire après extraction IA (`analyze-quote`/`extract-invoice`/`describe`).
- **Message WhatsApp** → `agent-orchestrator` fire-and-forget depuis `whapi.ts` (mode edge_function) ou `triggerAgentIfOpenClaw` (mode openclaw).
- **Email entrant** → `agent-orchestrator` fire-and-forget depuis `inbound-email.ts`.
- **Affectation lot (PATCH [docId])** → `agent-checks` + `agent-orchestrator` + mismatch detection via `detectDevisType`.

### Mismatch detection (document ↔ lot)
Détection basée sur le **contenu** (pas le nom de fichier). Points de détection :
- `analyze-quote/index.ts` — post-analyse devis : enrichit `documents_chantier.nom` (artisan + résumé) + compare avec lot
- `extract-invoice.ts` — post-extraction facture : même logique
- `describe.ts` — post-description photo/plan/assurance : même logique
- `[docId].ts` PATCH — réaffectation lot : compare nom enrichi vs nouveau lot
- Utilise `detectDevisType()` de `utils/extractProjectElements.ts` partout. Edge function réplique le mapping inline (Deno, pas d'import TS).

### Cache contexte
- `agent_context_cache` table — `context.ts` lit le cache (TTL 4h), rebuild si invalidé ou expiré, UPSERT après rebuild.
- Données **cachées** (static) : budget_conseils, lots enrichis, contacts (+phoneToContact map), payment_events, overdue_payments.
- Données **toujours fresh** (dynamic) : messages WhatsApp, insights du jour, tâches, risk_alerts, owner_pending_questions.
- **Invalidé** quand : POST/PATCH/DELETE contacts, POST lots, PATCH planning, POST agent-retry, DELETE/PATCH documents, POST payment-events, POST depense-rapide.
- **Attention colonnes** : `contacts_chantier` a `telephone` (pas `phone`) et `role` (pas `metier`). `context.ts` utilise les bons noms.

### Optimisations coût
- **Debounce WhatsApp** (`whapi.ts`) : `Set<string> agentTriggerChantierIds` → 1 trigger/chantier/batch webhook (pas 1/message).
- **Cooldown 60s** (`index.ts`) : skip si `lastRun < 60s` pour `morning` (pas `evening`). Loggé.
- **Cron soir** : `chantiers WHERE phase != 'reception'` (tous actifs). Early-exit `morning` only — soir toujours digest.
- **Parallélisation cron** : `Promise.allSettled` par batches de 3.
- **max_tokens** : 16384 (pas 4096 — thinking budget gemini-2.5-flash).

### Auth agent → API routes
- `requireChantierAuthOrAgent` (`apiHelpers.ts`) : accepte JWT (user) OU X-Agent-Key (agent inter-service).
- Routes migrées : `budget.ts` GET, `contacts.ts` GET, `payment-events.ts` GET, `taches.ts` CRUD, `planning.ts` GET/PATCH, `lots.ts` GET/POST/PATCH.
- `tools.ts` appelle `/agent-insights` (pas `/insights` legacy) et `/taches` (pas `/todos`).
- `tools.ts` priorite enum : `[urgent, important, normal]` (aligné avec `taches.ts`).

### Dual-mode
- `edge_function` (défaut) : Gemini 2.5 Flash, on paie.
- `openclaw` : instance user, user paie. Stateful, multi-tour, proactif.
- Config : `/api/chantier/agent-config` + Settings page (`AgentConfigCard`).

### Utilitaires agent
- `src/lib/lotUtils.ts` — `getSemanticEmoji(lotName)` : emoji sémantique par keyword matching (🏠 toiture, ⚡ élec, 🚿 plomberie, etc.). Fallback 📦. Utilisé dans 3 composants (UploadDocumentModal, DocumentsView, AddDocumentModal).
- `paymentEventsRes` clé de réponse API : `payment_events` (pas `.data`).

## TODO — prochaine session

### 🔴 Vérifier cron digest 19h (premier tir ce soir)
Le pg_cron `agent-orchestrator-evening-digest` est en place (17h UTC = 19h Paris). Vérifier demain matin : `SELECT * FROM chantier_journal ORDER BY created_at DESC LIMIT 5`. Si vide → checker les logs edge-function.

### 🔴 Tester WhatsApp multi-groupes (feature complète, non testée en prod)
Fichiers clés : `WhatsAppGroupsPanel.tsx`, `MessagerieSection.tsx`, `WhatsAppThread.tsx`, `api/chantier/[id]/whatsapp.ts`, `api/webhooks/whapi.ts`
Scénarios : créer groupe → membres visibles → message entrant → bulles par rôle → filtre par groupe

### 🟡 Cron timeout >10 chantiers — fan-out pattern
Actuellement batches de 3 séquentiels. 10+ chantiers = timeout edge function 60s. Solution : edge function "dispatcher" qui fire N appels indépendants.

### 🟡 assistant.ts DevisInfo interface manque lot_id/lot_nom (type debt)
Le spread runtime fonctionne mais le type TS ne déclare pas ces champs → mismatch detection silencieusement cassée au niveau type. Fix : ajouter `lot_id?: string | null; lot_nom?: string | null` à l'interface `DevisInfo`.

### 🟡 Migrer useInsights (legacy) vers agent_insights
6 composants dépendent de `cockpit/useInsights.ts` (Gemini MOE call éphémère). À terme, remplacer par des agent_insights persistants. Composants : BudgetTresorerie, AnalyseDevisSection, LotCard, LotIntervenantCard, BudgetKpiCard, dashboardHelpers.

### 🟡 Planning — 4 tâches restantes
1. `supabase/functions/chantier-qualifier/index.ts` — ajouter question date de démarrage
2. `LotIntervenantCard.tsx` — affichage "S3–S5 · 2 semaines"
3. `LotDetail.tsx` — section Planning éditable (durée inline + recalcul cascade)
4. `DashboardHome.tsx` — intégrer `PlanningWidget` entre progression et reco IA
