# Documentation technique - VerifierMonDevis.fr

## Table des matières

### Partie 1 — VerifierMonDevis (analyse de devis)

1. [Présentation du projet](#1-présentation-du-projet)
2. [Stack technique](#2-stack-technique)
3. [Architecture](#3-architecture)
4. [Installation et démarrage](#4-installation-et-démarrage)
5. [Structure des fichiers](#5-structure-des-fichiers)
6. [Pages et routing](#6-pages-et-routing)
7. [Composants](#7-composants)
8. [Base de données](#8-base-de-données)
9. [Authentification](#9-authentification)
10. [Pipeline d'analyse des devis](#10-pipeline-danalyse-des-devis)
11. [Edge Functions Supabase](#11-edge-functions-supabase)
12. [Système de scoring](#12-système-de-scoring)
13. [APIs externes](#13-apis-externes)
14. [Système de style et design](#14-système-de-style-et-design)

### Partie 2 — Infra commune (auth, déploiement, conventions)

14b. [Intégrations externes (CRM & Email)](#14b-intégrations-externes-crm--email)
15. [Configuration](#15-configuration)
16. [Déploiement](#16-déploiement)
17. [Patterns et conventions](#17-patterns-et-conventions)
18. [Guide de développement](#18-guide-de-développement)
19. [Dépannage](#19-dépannage)

### Partie 3 — GérerMonChantier (cockpit chantier — produit principal)

20. [Cockpit chantier — vue d'ensemble](#20-cockpit-chantier--vue-densemble)
21. [Budget & Trésorerie](#21-budget--trésorerie)
22. [Planning CPM (Critical Path Method)](#22-planning-cpm-critical-path-method)
23. [Lots, intervenants, contacts, formalités](#23-lots-intervenants-contacts-formalités)
24. [Documents — storage, upload, analyse intra-chantier](#24-documents--storage-upload-analyse-intra-chantier)
25. [Messagerie & WhatsApp](#25-messagerie--whatsapp)
26. [Assistant IA (cockpit)](#26-assistant-ia-cockpit)
27. [Actions proactives — décisions & actions programmées](#27-actions-proactives--décisions--actions-programmées-vague-3)

---

## 1. Présentation du projet

Deux produits sous le même domaine `verifiermondevis.fr`, partageant base utilisateurs, catalogue prix et pipeline d'analyse :

### VerifierMonDevis (VMD) — lead magnet (gratuit / freemium)
Service web d'analyse de devis d'artisans. L'application :
- Extrait le contenu du devis via OCR (PDF, images) — pipeline `analyze-quote` Gemini 2.5-flash
- Vérifie l'entreprise auprès du registre national (recherche-entreprises.api.gouv.fr, INPI, Google Places, ADEME RGE)
- Compare les prix au marché local via le catalogue interne `market_prices` (911 entries, 2026-05-21)
- Vérifie les assurances et certifications
- Produit un **score de fiabilité** : VERT (confiance), ORANGE (vigilance), ROUGE (danger)
- Fournit des recommandations personnalisées
- Pass Sérénité (4,99€/mois Stripe) débloque les analyses illimitées + rapport PDF + tri par type de travaux

**Rôle business** : VMD est un **outil d'acquisition**. Il capture une audience qualifiée (gens qui ont déjà un projet travaux concret), génère du SEO long-tail, établit la crédibilité, et convertit vers le produit principal GérerMonChantier.

### GérerMonChantier (GMC) — produit principal (en cours de monétisation)
Outil complet de pilotage d'un chantier de rénovation, de la conception à la réception. Couvre les 5 phases (conception → planification → devis → financier → exécution & réception). Inclut un **agent IA "Pilote de Chantier"** (Gemini 2.5-flash function calling) qui réagit aux événements (WhatsApp, email, upload doc) et envoie des notifications proactives via un canal WhatsApp privé dédié.

Cf. `FEATURES.md` pour la liste exhaustive des features fonctionnelles GMC + les 7 ponts d'intégration VMD ↔ GMC (compte unique, market_prices mutualisé, contacts auto-créés depuis analyses, etc.).

### Flux utilisateur principal — VMD

```
Inscription → Upload du devis → Analyse automatique (30-60s)
→ Score + détails → Export PDF → Suivi post-signature (optionnel)
→ [Conversion GMC] Création d'un chantier + import des devis analysés
```

---

## 2. Stack technique

### Frontend

| Technologie | Version | Rôle |
|---|---|---|
| Astro | 5.17.1 | Framework SSG/SSR, routing fichier, pages statiques |
| React | 18.3.1 | Composants interactifs (islands architecture) |
| TypeScript | 5.8.3 | Typage statique |
| Tailwind CSS | 3.4.17 | Framework CSS utility-first |
| shadcn-ui | - | Bibliothèque de composants (Radix UI + Tailwind) |
| TanStack Query | 5.83.0 | Gestion d'état serveur, cache, fetch |
| React Hook Form | 7.61.1 | Gestion de formulaires |
| React Hook Form | 7.61.1 | Gestion de formulaires |
| Zod | 3.25.76 | Validation de schémas |
| Sonner | 1.7.4 | Notifications toast |
| Lucide React | 0.462.0 | Icônes SVG |
| Recharts | 2.15.4 | Graphiques et visualisations (admin) |
| jsPDF | 4.0.0 | Génération de rapports PDF côté client |
| DM Sans | - | Typographie (@fontsource) |

### Backend

| Technologie | Rôle |
|---|---|
| Supabase | Auth, PostgreSQL, Storage, Edge Functions, Realtime |
| Deno | Runtime des Edge Functions |
| Google Gemini | Extraction IA des données du devis + OCR Vision |
| AWS Textract | OCR de documents scannés |

### Build et outils

| Outil | Version | Rôle |
|---|---|---|
| Vite | 5.4.19 | Build et dev server |
| @vitejs/plugin-react-swc | 3.11 | Compilation React ultra-rapide |
| ESLint | 9.32.0 | Linting |
| PostCSS / Autoprefixer | - | Post-processing CSS |
| @astrojs/vercel | 9.0.4 | Adapter Vercel pour SSR/SSG |
| @astrojs/sitemap | 3.7.0 | Génération automatique du sitemap |

---

## 3. Architecture

### Vue d'ensemble

```
┌─────────────────────────────────────────────┐
│                  FRONTEND                    │
│  Astro (SSG) + React Islands (client:only)  │
│  Landing (statique) + App (dynamique)       │
└──────────────┬──────────────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────────────┐
│                 SUPABASE                     │
│  ┌──────────┐ ┌─────────┐ ┌──────────────┐ │
│  │   Auth   │ │ Storage │ │  PostgreSQL   │ │
│  │  (JWT)   │ │ (files) │ │   (données)   │ │
│  └──────────┘ └─────────┘ └──────────────┘ │
│  ┌──────────────────────────────────────┐   │
│  │        Edge Functions (Deno)         │   │
│  │  analyze-quote │ extract-document    │   │
│  │  parse-quote   │ admin-kpis          │   │
│  └──────────┬───────────────────────────┘   │
└─────────────┼───────────────────────────────┘
              │
┌─────────────▼───────────────────────────────┐
│            APIS EXTERNES                     │
│  Pappers │ ADEME │ Georisques │ OpenIBAN    │
│  Google Places │ Gemini │ AWS Textract      │
│  recherche-entreprises.api.gouv.fr          │
└─────────────────────────────────────────────┘
```

### Architecture Astro Islands

Le frontend combine deux approches :

**Pages statiques** (pré-rendues au build) :
- Landing page (`/`)
- CGU (`/cgu`)
- 404

**Pages dynamiques** (React client-only) :
- Toutes les pages app (`/connexion`, `/tableau-de-bord`, `/analyse/:id`, etc.)
- Rendues côté client uniquement via `client:only="react"`
- Ont `export const prerender = false` dans le frontmatter Astro

### Pattern Wrapper

Chaque page dynamique utilise un composant wrapper autonome pour éviter le piège des slots Astro :

```
Page Astro (.astro)
  └── Wrapper App (components/app/XxxApp.tsx)  ← client:only="react"
        └── ReactApp (providers: QueryClient, Tooltip, Toaster)
              └── Composant Page (components/pages/Xxx.tsx)
```

---

## 4. Installation et démarrage

### Prérequis

- Node.js >= 18
- npm
- Compte Supabase (pour le backend)

### Installation

```bash
cd devis-clarity
npm install
```

### Variables d'environnement

Créer un fichier `.env` à la racine :

```bash
# Client Supabase (exposées au frontend via VITE_ et PUBLIC_)
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=votre_clé_publique
VITE_SUPABASE_PROJECT_ID=votre_project_id
PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=votre_clé_publique
```

Les secrets des edge functions (GEMINI_API_KEY, PAPPERS_API_KEY, etc.) sont configurés directement dans le dashboard Supabase, pas dans le `.env` local.

### Commandes

```bash
npm run dev       # Serveur de développement (http://localhost:4321)
npm run build     # Build de production (./dist/)
npm run preview   # Prévisualiser le build de production
npm run lint      # Linting ESLint
```

---

## 5. Structure des fichiers

```
devis-clarity/
├── src/
│   ├── pages/                          # Pages Astro (routing = structure fichiers)
│   │   ├── index.astro                 # Landing page (statique)
│   │   ├── connexion.astro             # Page de connexion
│   │   ├── inscription.astro           # Page d'inscription
│   │   ├── tableau-de-bord.astro       # Dashboard utilisateur
│   │   ├── nouvelle-analyse.astro      # Formulaire de nouvelle analyse
│   │   ├── cgu.astro                   # Conditions générales (statique)
│   │   ├── comprendre-score.astro      # Explication du système de score
│   │   ├── contact.astro               # Formulaire de contact (Web3Forms) + enquête satisfaction
│   │   ├── confidentialite.astro       # Politique de confidentialité
│   │   ├── faq.astro                   # FAQ (statique, accordéons)
│   │   ├── mentions-legales.astro      # Mentions légales
│   │   ├── mot-de-passe-oublie.astro   # Mot de passe oublié
│   │   ├── parametres.astro            # Paramètres du compte
│   │   ├── qui-sommes-nous.astro       # Qui sommes-nous
│   │   ├── reset-password.astro        # Réinitialisation mot de passe
│   │   ├── simulateur-valorisation-travaux.astro  # Simulateur IVP/IPI
│   │   ├── valorisation-travaux-immobiliers.astro # Page SEO valorisation
│   │   ├── pass-serenite.astro        # Souscription Pass Sérénité
│   │   ├── premium.astro              # Page premium
│   │   ├── mon-chantier.astro         # Hub chantiers (liste)
│   │   ├── mon-chantier-old.astro     # Ancien hub (backup)
│   │   ├── 404.astro                   # Page d'erreur (statique)
│   │   ├── analyse/
│   │   │   └── [id].astro             # Résultat d'analyse (dynamique)
│   │   ├── mon-chantier/
│   │   │   ├── nouveau.astro          # Création nouveau chantier
│   │   │   └── [id].astro             # Détail d'un chantier
│   │   ├── api/
│   │   │   ├── geo-communes.ts        # API résolution code postal → communes
│   │   │   ├── market-prices.ts       # API prix immobiliers DVF
│   │   │   ├── strategic-scores.ts    # API calcul scores IVP/IPI
│   │   │   ├── newsletter.ts          # API inscription newsletter + webhook MessagingMe
│   │   │   ├── postal-lookup.ts       # API lookup code postal → communes (DVF)
│   │   │   ├── rental-prices.ts       # API prix locatifs par commune
│   │   │   ├── transfer-analysis.ts   # API transfert analyse entre utilisateurs
│   │   │   ├── create-checkout-session.ts   # Création session Stripe Checkout
│   │   │   ├── create-portal-session.ts     # Portail client Stripe
│   │   │   ├── stripe-webhook.ts            # Webhook Stripe
│   │   │   ├── webhook-registration.ts      # Webhook inscription → CRM
│   │   │   ├── premium/
│   │   │   │   ├── start-trial.ts     # Démarrage essai premium
│   │   │   │   └── status.ts          # Statut abonnement premium
│   │   │   └── chantier/              # Module chantier (voir section dédiée)
│   │   │       ├── index.ts           # Liste/création chantiers
│   │   │       ├── [id].ts            # Détail chantier
│   │   │       ├── [id]/documents.ts  # Documents d'un chantier
│   │   │       ├── [id]/documents/[docId].ts      # Document individuel
│   │   │       ├── [id]/documents/[docId]/analyser.ts # Analyser un document
│   │   │       ├── [id]/devis/index.ts  # Devis d'un chantier
│   │   │       ├── [id]/devis/[devisId].ts  # Devis individuel
│   │   │       ├── generer.ts         # Proxy edge function chantier-generer
│   │   │       ├── qualifier.ts       # Qualification IA (questions contextuelles)
│   │   │       ├── sauvegarder.ts     # Sauvegarde résultat IA en base
│   │   │       ├── ameliorer.ts       # Amélioration IA d'un chantier existant
│   │   │       ├── conseils.ts        # Conseils maître d'œuvre IA
│   │   │       └── synthese.ts        # Synthèse IA du chantier
│   │   ├── blog/
│   │   │   ├── index.astro            # Liste des articles
│   │   │   └── [slug].astro           # Article individuel
│   │   └── admin/
│   │       ├── index.astro            # Dashboard admin
│   │       └── blog.astro             # Gestion blog admin
│   │
│   ├── components/
│   │   ├── app/                        # Wrappers React autonomes par page
│   │   │   ├── LoginApp.tsx
│   │   │   ├── RegisterApp.tsx
│   │   │   ├── DashboardApp.tsx
│   │   │   ├── NewAnalysisApp.tsx
│   │   │   ├── AnalysisResultApp.tsx
│   │   │   ├── AdminApp.tsx
│   │   │   ├── AdminBlogApp.tsx
│   │   │   ├── BlogApp.tsx
│   │   │   ├── BlogArticleApp.tsx
│   │   │   ├── ComprendreScoreApp.tsx
│   │   │   ├── ForgotPasswordApp.tsx
│   │   │   ├── ResetPasswordApp.tsx
│   │   │   ├── SettingsApp.tsx
│   │   │   ├── PassSereniteApp.tsx
│   │   │   ├── SimulateurScoresApp.tsx
│   │   │   ├── MonChantierHubApp.tsx
│   │   │   ├── ChantierDetailApp.tsx
│   │   │   └── NouveauChantierApp.tsx
│   │   │
│   │   │
│   │   ├── pages/                      # Composants React de page (logique + UI)
│   │   │   ├── Login.tsx               # Formulaire de connexion
│   │   │   ├── Register.tsx            # Formulaire d'inscription
│   │   │   ├── Dashboard.tsx           # Tableau de bord (liste analyses)
│   │   │   ├── NewAnalysis.tsx         # Upload et soumission de devis
│   │   │   ├── AnalysisResult.tsx      # Affichage détaillé des résultats
│   │   │   ├── Admin.tsx               # Dashboard admin (KPIs)
│   │   │   ├── AdminBlog.tsx           # CRUD blog admin
│   │   │   ├── Blog.tsx                # Liste articles blog
│   │   │   ├── BlogArticle.tsx         # Article de blog
│   │   │   ├── ComprendreScore.tsx     # Page explicative scoring
│   │   │   ├── ForgotPassword.tsx     # Mot de passe oublié
│   │   │   ├── ResetPassword.tsx      # Réinitialisation mot de passe
│   │   │   ├── Settings.tsx           # Paramètres du compte
│   │   │   ├── PassSerenite.tsx       # Page souscription premium
│   │   │   ├── MonChantierHub.tsx     # Hub/liste des chantiers
│   │   │   ├── ChantierDetail.tsx     # Détail d'un chantier
│   │   │   ├── NouveauChantier.tsx    # Création nouveau chantier (IA)
│   │   │   ├── Index.tsx               # (ancien) Landing page React
│   │   │   ├── CGU.tsx                 # Conditions générales
│   │   │   └── NotFound.tsx            # Page 404
│   │   │
│   │   ├── ui/                         # Composants shadcn-ui (16 composants)
│   │   │   ├── badge.tsx               # Badges et étiquettes
│   │   │   ├── button.tsx              # Boutons
│   │   │   ├── card.tsx                # Cartes conteneur
│   │   │   ├── checkbox.tsx            # Cases à cocher
│   │   │   ├── collapsible.tsx         # Sections pliables
│   │   │   ├── dialog.tsx              # Modales/dialogues
│   │   │   ├── input.tsx               # Champs de saisie
│   │   │   ├── label.tsx               # Labels de formulaire
│   │   │   ├── progress.tsx            # Barres de progression
│   │   │   ├── select.tsx              # Listes déroulantes
│   │   │   ├── tabs.tsx                # Onglets
│   │   │   ├── textarea.tsx            # Zones de texte
│   │   │   ├── toast.tsx               # Notifications Radix
│   │   │   ├── toaster.tsx             # Conteneur de toasts
│   │   │   ├── tooltip.tsx             # Infobulles
│   │   │   └── sonner.tsx              # Toast Sonner
│   │   │
│   │   ├── analysis/                   # Blocs d'affichage résultats d'analyse
│   │   │   ├── index.ts               # Exports + fonctions de filtre
│   │   │   ├── BlockEntreprise.tsx     # Vérification entreprise
│   │   │   ├── BlockDevis.tsx          # Détails du devis
│   │   │   ├── BlockDevisMultiple.tsx  # Comparaison multi-devis
│   │   │   ├── BlockPrixMarche.tsx     # Comparaison prix marché
│   │   │   ├── BlockSecurite.tsx       # Assurances et sécurité
│   │   │   ├── BlockContexte.tsx       # Contexte géographique
│   │   │   ├── BlockUrbanisme.tsx      # Urbanisme et réglementations
│   │   │   ├── BlockArchitecte.tsx     # Conformité architecture
│   │   │   ├── MarketPositionAnalysis.tsx  # Positionnement prix
│   │   │   ├── MarketComparisonGauge.tsx   # Jauge visuelle prix (SVG)
│   │   │   ├── AdaptedAnalysisBanner.tsx   # Bandeau mode dégradé
│   │   │   ├── DocumentRejectionScreen.tsx # Écran rejet de document non-devis
│   │   │   ├── ExtractionBlocker.tsx       # Blocage si extraction échouée
│   │   │   ├── OcrDebugPanel.tsx           # Panneau debug OCR (dev)
│   │   │   ├── InfoTooltip.tsx         # Infobulles pédagogiques
│   │   │   ├── PedagogicExplanation.tsx # Explications contextuelles
│   │   │   ├── MissingDataActions.tsx  # Actions données manquantes
│   │   │   ├── StrategicBadge.tsx      # Badge scores IVP/IPI
│   │   │   └── UrbanismeAssistant.tsx  # Assistant urbanisme
│   │   │
│   │   ├── landing/                    # Sections de la landing page
│   │   │   ├── HeroSection.tsx         # Section hero principale
│   │   │   ├── HowItWorksSection.tsx   # Comment ça marche (3 étapes)
│   │   │   ├── DevisCalculatorSection.tsx  # Calculateur rapide
│   │   │   ├── ScoringExplainedSection.tsx # Explication du scoring
│   │   │   ├── RisksSection.tsx        # Éducation sur les risques
│   │   │   ├── PostSignatureValueSection.tsx # Valeur suivi post-signature
│   │   │   ├── DisclaimerSection.tsx   # Mentions légales
│   │   │   ├── CTASection.tsx          # Call-to-action
│   │   │   └── JobTypeSelector.tsx     # Sélecteur de type de travaux
│   │   │
│   │   ├── layout/                     # Layout React
│   │   │   ├── Header.tsx              # Header React (pages app)
│   │   │   └── Footer.tsx              # Footer React
│   │   │
│   │   ├── astro/                      # Layout Astro
│   │   │   ├── Header.astro            # Header Astro (landing, pages statiques)
│   │   │   └── Footer.astro            # Footer Astro
│   │   │
│   │   ├── blog/                       # Composants blog
│   │   │   ├── ArticleCard.tsx         # Carte article dans la liste
│   │   │   ├── ArticleContent.tsx      # Rendu article complet
│   │   │   └── BlogCTA.tsx             # CTA dans les articles
│   │   │
│   │   ├── admin/                      # Composants admin
│   │   │   ├── AdminCharts.tsx         # Graphiques KPI (Recharts)
│   │   │   ├── AiGenerationPanel.tsx   # Génération d'articles via Claude API
│   │   │   ├── BlogDialogs.tsx         # Modales suppression/planification
│   │   │   ├── BlogPostEditor.tsx      # Éditeur d'articles (rich text + HTML + aperçu)
│   │   │   ├── BlogPostList.tsx        # Liste des articles admin
│   │   │   ├── ImageManagement.tsx     # Gestion images (upload + génération IA fal.ai)
│   │   │   ├── ManualWriteEditor.tsx   # Rédaction manuelle d'articles
│   │   │   ├── RichTextToolbar.tsx     # Éditeur rich text (contentEditable)
│   │   │   └── blogTypes.tsx           # Types TypeScript admin blog
│   │   │
│   │   ├── chantier/                   # Module gestion de chantier (voir §20)
│   │   │   ├── dashboard/
│   │   │   │   └── AddChantierCard.tsx # Carte ajout nouveau chantier
│   │   │   ├── nouveau/               # Écrans création chantier
│   │   │   │   ├── ScreenPrompt.tsx    # Saisie description libre
│   │   │   │   ├── ScreenQualification.tsx # Questions contextuelles IA
│   │   │   │   ├── ScreenGenerating.tsx    # Animation génération
│   │   │   │   ├── ScreenWow.tsx           # Écran résultat "wow"
│   │   │   │   ├── ScreenAmeliorations.tsx # Améliorations IA
│   │   │   │   ├── DashboardChantier.tsx   # Dashboard principal chantier
│   │   │   │   ├── DocumentsSection.tsx    # Section documents
│   │   │   │   └── BudgetFiabilite.tsx     # Indicateur fiabilité budget
│   │   │   ├── lots/                  # Gestion des lots de travaux
│   │   │   │   ├── LotGrid.tsx        # Grille de lots
│   │   │   │   ├── LotCard.tsx        # Carte lot individuel
│   │   │   │   └── LotDetail.tsx      # Détail d'un lot (documents, prix)
│   │   │   ├── devis/
│   │   │   │   └── ComparateurDevis.tsx # Comparateur de devis par lot
│   │   │   ├── financement/
│   │   │   │   └── SimulationFinancement.tsx # Simulateur crédit
│   │   │   ├── BudgetGlobal.tsx       # Vue budget global (camembert + lignes)
│   │   │   ├── BudgetTab.tsx          # Onglet budget dans le dashboard
│   │   │   ├── VersementsDrawer.tsx   # Drawer versements échelonnés par artisan
│   │   │   ├── ChantierTimeline.tsx   # Timeline roadmap chantier
│   │   │   ├── ConseilsChantier.tsx   # Conseils maître d'œuvre (IA)
│   │   │   ├── JournalChantier.tsx    # Journal des modifications IA
│   │   │   ├── NextActionCard.tsx     # Carte prochaine action
│   │   │   └── SyntheseChantier.tsx   # Synthèse IA du chantier
│   │   │
│   │   ├── tracking/                   # Suivi post-signature
│   │   │   ├── PostSignatureTrackingSection.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── funnel/                     # Composants de tunnel/conversion
│   │   │   ├── FunnelStepper.tsx       # Stepper de progression (étapes)
│   │   │   ├── PremiumGate.tsx         # Gate pour fonctionnalités premium
│   │   │   └── PassSereniteGate.tsx    # Gate Pass Sérénité (> 5 analyses)
│   │   │
│   │   ├── ReactApp.tsx                # Wrapper providers (Query, Tooltip, Toaster)
│   │   ├── SEOHead.tsx                 # Balises SEO dynamiques
│   │   ├── NavLink.tsx                 # Lien de navigation actif
│   │   ├── WorkTypeSelector.tsx        # Sélecteur hiérarchique types de travaux
│   │   └── AttestationUpload.tsx       # Upload attestation assurance
│   │
│   ├── hooks/
│   │   ├── useMarketPriceAPI.ts        # Hook prix marché (lecture + calcul théorique)
│   │   ├── useMarketPriceEditor.ts    # Hook édition interactive prix marché (DnD, quantités)
│   │   ├── useZoneCoefficient.ts       # Hook coefficient géographique
│   │   ├── useAnonymousAuth.ts         # Hook authentification anonyme
│   │   ├── use-mobile.tsx              # Hook détection mobile
│   │   └── use-toast.ts               # Hook notifications toast
│   │
│   ├── lib/
│   │   ├── utils.ts                    # Utilitaires CSS (cn, clsx)
│   │   ├── constants.ts                # Constantes partagées
│   │   ├── domainConfig.ts             # Registre blocs visibles par domaine
│   │   ├── workTypeReferentiel.ts      # Référentiel 100+ types de travaux
│   │   ├── scoreUtils.tsx              # Utilitaires score (icônes, badges, couleurs)
│   │   ├── entrepriseUtils.ts          # Utilitaires bloc entreprise
│   │   ├── devisUtils.ts              # Utilitaires bloc devis
│   │   ├── securiteUtils.ts           # Utilitaires bloc sécurité
│   │   ├── contexteUtils.ts           # Utilitaires bloc contexte géo
│   │   ├── urbanismeUtils.ts          # Utilitaires bloc urbanisme
│   │   ├── architecteUtils.ts         # Utilitaires bloc architecte
│   │   ├── blogUtils.ts              # Utilitaires blog (fetch, formatage)
│   │   ├── subscription.ts           # Logique abonnement premium
│   │   ├── formalitesLinks.ts        # Catalogue liens .gouv.fr pour formalités chantier
│   │   └── prompts/
│   │       └── chantier-ia.ts        # Prompts IA module chantier
│   │
│   ├── integrations/supabase/
│   │   ├── client.ts                   # Configuration client Supabase
│   │   └── types.ts                    # Types TS auto-générés depuis le schéma DB
│   │
│   ├── layouts/
│   │   └── BaseLayout.astro            # Layout HTML de base (head, meta, body)
│   │
│   ├── types/
│   │   ├── chantier-ia.ts             # Types IA chantier (ChantierIAResult, LotChantier, etc.)
│   │   └── chantier-dashboard.ts      # Types dashboard (PhaseChantier, PHASE_LABELS)
│   │
│   ├── utils/
│   │   ├── generatePdfReport.ts        # Génération rapport PDF (jsPDF)
│   │   ├── chantier/
│   │   │   ├── calcBudgetFromDocuments.ts  # Calcul budget depuis documents attachés
│   │   │   ├── calcLotBudget.ts            # Calcul budget par lot (market_prices)
│   │   │   ├── getNextAction.ts            # Prochaine action prioritaire
│   │   │   └── groupDocumentsByLot.ts      # Groupement documents par lot
│   │   └── devis/
│   │       └── compareQuotes.ts            # Comparaison de devis par lot
│   │
│   ├── App.css                         # (legacy) Styles Vite — non utilisé
│   ├── main.tsx                        # Point d'entrée React
│   ├── vite-env.d.ts                   # Déclarations types Vite
│   └── index.css                       # Styles globaux + variables Tailwind
│
├── supabase/
│   └── functions/                      # Edge Functions Deno (12 fonctions)
│       ├── analyze-quote/              # Orchestrateur principal (modulaire)
│       │   ├── index.ts               # Point d'entrée, orchestration pipeline
│       │   ├── extract.ts             # Appels extraction OCR
│       │   ├── verify.ts              # Vérifications parallèles (Pappers, ADEME, etc.)
│       │   ├── score.ts               # Algorithme de scoring
│       │   ├── render.ts             # Génération des alertes/points OK/recommandations
│       │   ├── summarize.ts          # Résumé des lignes de travaux (gemini-2.0-flash)
│       │   ├── market-prices.ts     # Groupement par job type + prix marché (gemini-2.0-flash)
│       │   ├── domain-config.ts     # Config centralisée par domaine (prompts, labels)
│       │   ├── utils.ts              # Fonctions utilitaires partagées
│       │   └── types.ts              # Types TypeScript de la pipeline
│       ├── extract-document/index.ts   # OCR et extraction de texte
│       ├── parse-quote/index.ts        # Parsing structuré via Gemini
│       ├── analyze-attestation/index.ts # Analyse attestation assurance
│       ├── generate-blog-article/index.ts # Génération articles IA (Claude API)
│       ├── generate-blog-image/index.ts   # Génération images IA (fal.ai)
│       ├── admin-kpis/index.ts         # API KPIs admin
│       ├── publish-scheduled-posts/index.ts # Publication programmée blog (cron)
│       ├── system-alerts/index.ts      # Alertes système
│       ├── read-invoice/index.ts       # Lecture/extraction factures
│       ├── chantier-generer/index.ts   # Génération plan chantier IA (Gemini)
│       └── chantier-qualifier/index.ts # Qualification projet (questions IA)
│
├── public/
│   ├── images/                         # Assets statiques (logos, etc.)
│   ├── demo/                           # Vidéo démo landing GMC (motion design React)
│   │   ├── index.html                  # Page /demo/ — transpilée en navigateur (Babel)
│   │   ├── animations.jsx              # Moteur Stage/Sprite/easings
│   │   ├── video-scenes.jsx            # La vidéo : 12 scènes, ~60s, 1920×1080
│   │   └── vendor/                     # React 18 + Babel UMD servis en local
│   ├── favicon.ico                     # Favicon du site
│   ├── placeholder.svg                 # Placeholder image
│   ├── robots.txt                      # Directives pour les crawlers
│   └── sitemap.xml                     # Sitemap pour le SEO
│
├── astro.config.mjs                    # Configuration Astro
├── tailwind.config.ts                  # Configuration Tailwind + thème
├── tsconfig.json                       # Configuration TypeScript
├── postcss.config.js                   # Configuration PostCSS
├── package.json                        # Dépendances et scripts
├── .env                                # Variables d'environnement (NON commité)
├── CLAUDE.md                           # Contexte pour Claude Code
└── DOCUMENTATION.md                    # Ce fichier
```

---

## 6. Pages et routing

### Routing Astro

Le routing est basé sur la structure des fichiers dans `src/pages/`. Chaque fichier `.astro` correspond à une URL.

### Pages statiques (pré-rendues)

Ces pages sont générées au build et servies comme HTML statique :

| Fichier | URL | Description |
|---|---|---|
| `index.astro` | `/` | Landing page avec hero, calculator, sections |
| `cgu.astro` | `/cgu` | Conditions générales d'utilisation |
| `faq.astro` | `/faq` | FAQ (accordéons `<details>`) |
| `qui-sommes-nous.astro` | `/qui-sommes-nous` | Page "Qui sommes-nous" |
| `contact.astro` | `/contact` | Formulaire de contact (Web3Forms) + enquête satisfaction |
| `mentions-legales.astro` | `/mentions-legales` | Mentions légales |
| `confidentialite.astro` | `/confidentialite` | Politique de confidentialité |
| `valorisation-travaux-immobiliers.astro` | `/valorisation-travaux-immobiliers` | Page SEO valorisation immobilière |
| `404.astro` | `/*` | Page d'erreur 404 |

La landing page utilise des composants React avec `client:load` et `client:visible` pour une hydratation progressive.

### Pages dynamiques (SSR/client-only)

Ces pages ont `export const prerender = false` et sont rendues côté serveur ou client :

| Fichier | URL | Description | Auth |
|---|---|---|---|
| `connexion.astro` | `/connexion` | Formulaire de connexion | Non |
| `inscription.astro` | `/inscription` | Formulaire d'inscription | Non |
| `tableau-de-bord.astro` | `/tableau-de-bord` | Dashboard avec liste des analyses | Oui |
| `nouvelle-analyse.astro` | `/nouvelle-analyse` | Upload et soumission de devis | Oui |
| `analyse/[id].astro` | `/analyse/:id` | Résultat détaillé d'une analyse | Oui |
| `comprendre-score.astro` | `/comprendre-score` | Explication interactive du scoring | Non |
| `blog/index.astro` | `/blog` | Liste des articles de blog | Non |
| `blog/[slug].astro` | `/blog/:slug` | Article de blog individuel | Non |
| `admin/index.astro` | `/admin` | Dashboard administration | Admin |
| `admin/blog.astro` | `/admin/blog` | Gestion des articles blog | Admin |
| `mot-de-passe-oublie.astro` | `/mot-de-passe-oublie` | Formulaire mot de passe oublié | Non |
| `reset-password.astro` | `/reset-password` | Réinitialisation du mot de passe | Non |
| `parametres.astro` | `/parametres` | Paramètres du compte utilisateur | Oui |
| `simulateur-valorisation-travaux.astro` | `/simulateur-valorisation-travaux` | Simulateur IVP/IPI valorisation travaux | Non |
| `pass-serenite.astro` | `/pass-serenite` | Page souscription Pass Sérénité | Non |
| `premium.astro` | `/premium` | Page premium | Non |
| `mon-chantier.astro` | `/mon-chantier` | Hub chantiers (liste) | Oui |
| `mon-chantier/nouveau.astro` | `/mon-chantier/nouveau` | Création nouveau chantier | Oui |
| `mon-chantier/[id].astro` | `/mon-chantier/:id` | Détail d'un chantier | Oui |

### API Routes (Astro SSR)

| Fichier | URL | Description |
|---|---|---|
| `api/geo-communes.ts` | `/api/geo-communes` | Résolution code postal → communes (geo.api.gouv.fr) |
| `api/market-prices.ts` | `/api/market-prices` | Prix immobiliers DVF par commune et type de bien |
| `api/strategic-scores.ts` | `/api/strategic-scores` | Calcul scores IVP/IPI depuis la matrice stratégique |
| `api/newsletter.ts` | `/api/newsletter` | Inscription newsletter + webhook MessagingMe |
| `api/postal-lookup.ts` | `/api/postal-lookup` | Lookup code postal → communes (table DVF) |
| `api/rental-prices.ts` | `/api/rental-prices` | Prix locatifs par commune (table `rental_prices`) |
| `api/transfer-analysis.ts` | `/api/transfer-analysis` | Transfert analyse entre utilisateurs |
| `api/create-checkout-session.ts` | `/api/create-checkout-session` | Création session Stripe Checkout (Pass Sérénité) |
| `api/create-portal-session.ts` | `/api/create-portal-session` | Portail client Stripe |
| `api/stripe-webhook.ts` | `/api/stripe-webhook` | Webhook Stripe (souscription, annulation, échec) |
| `api/webhook-registration.ts` | `/api/webhook-registration` | Webhook inscription → CRM MessagingMe |
| `api/premium/start-trial.ts` | `/api/premium/start-trial` | Démarrage essai premium |
| `api/premium/status.ts` | `/api/premium/status` | Statut abonnement premium |
| `api/chantier/index.ts` | `/api/chantier` | GET liste / POST création chantiers |
| `api/chantier/[id].ts` | `/api/chantier/:id` | GET/PATCH/DELETE chantier |
| `api/chantier/generer.ts` | `/api/chantier/generer` | Proxy vers edge function chantier-generer |
| `api/chantier/qualifier.ts` | `/api/chantier/qualifier` | Qualification IA (questions contextuelles Gemini) |
| `api/chantier/sauvegarder.ts` | `/api/chantier/sauvegarder` | Sauvegarde résultat IA en base + lots + tâches |
| `api/chantier/ameliorer.ts` | `/api/chantier/ameliorer` | Amélioration IA d'un chantier existant |
| `api/chantier/conseils.ts` | `/api/chantier/conseils` | Conseils maître d'œuvre IA (Gemini) |
| `api/chantier/synthese.ts` | `/api/chantier/synthese` | Synthèse IA du chantier (Gemini) |
| `api/chantier/[id]/documents.ts` | `/api/chantier/:id/documents` | CRUD documents chantier |
| `api/chantier/[id]/documents/[docId].ts` | `/api/chantier/:id/documents/:docId` | Document individuel |
| `api/chantier/[id]/documents/[docId]/analyser.ts` | `/api/chantier/:id/documents/:docId/analyser` | Déclencher analyse d'un document |
| `api/chantier/[id]/devis/index.ts` | `/api/chantier/:id/devis` | Liste devis d'un chantier |
| `api/chantier/[id]/devis/[devisId].ts` | `/api/chantier/:id/devis/:devisId` | Détail devis individuel |
| `api/portfolio/summary.ts` | `/api/portfolio/summary` | GET — résumé léger par chantier (5 KPI budget + planning) pour le compte. Gate Multi (`getPortfolioAccess`), lecture seule, fan-out HTTP interne plafonné vers `budget` + `planning`, isolation d'erreur par chantier. |
| `api/portfolio/contacts.ts` | `/api/portfolio/contacts` | GET — annuaire artisans dédupliqué + conflits de ressources (matching tél/SIRET/nom + chevauchement de lots). Gate Multi, lecture seule. |
| `api/portfolio/cashflow.ts` | `/api/portfolio/cashflow` | GET — projection trésorerie mensuelle (sorties par mois). Gate Multi, fan-out vers `payment-events`, lecture seule. |
| `api/health.ts` | `/api/health` | Health check ops — ping Supabase + check env vars. 200 si tout OK, 503 sinon. Pas de check externe (Gemini, whapi, SendGrid) pour ne pas gonfler la latence — leurs APIs ont leurs propres SLA. Réponse JSON `{ status, checks }`. |

### Pages dynamiques avec paramètres

- `analyse/[id].astro` : L'ID est extrait de `window.location.pathname` par le composant React
- `blog/[slug].astro` : Le slug est extrait de la même manière

---

## 7. Composants

### 7.1 ReactApp (providers)

`src/components/ReactApp.tsx` est le wrapper qui fournit les providers React à toutes les pages :

```tsx
const ReactApp = ({ children }) => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />      {/* Notifications Radix */}
      <Sonner />       {/* Notifications Sonner */}
      {children}
    </TooltipProvider>
  </QueryClientProvider>
);
```

### 7.2 Composants d'analyse

Ces composants affichent les résultats détaillés sur la page `/analyse/:id` :

**Blocs principaux :**
- **BlockEntreprise** : Identification entreprise (SIRET formaté, nom officiel, badge "active/radiée"), données financières (bilans, capitaux propres, procédure collective), ancienneté avec date de création, réputation Google. Utilise données Pappers/recherche-entreprises + `raw_text` JSON. Logique métier dans `lib/entrepriseUtils.ts`.
- **BlockDevis** : Détails du devis (montants HT/TTC, TVA, conditions de paiement, acompte). Logique dans `lib/devisUtils.ts`.
- **BlockPrixMarche** : Cartes collapsibles par job type avec lignes détaillées, jauge visuelle (`MarketComparisonGauge` SVG + `MarketPositionAnalysis`), drag & drop de lignes entre job types, quantité éditable.
- **BlockSecurite** : Assurances (RC Pro, Décennale), certifications RGE. Logique dans `lib/securiteUtils.ts`.
- **BlockContexte** : Informations géographiques (zone, coefficient, risques naturels). Logique dans `lib/contexteUtils.ts`.
- **BlockUrbanisme** : Urbanisme (PLU, monuments historiques, servitudes). Logique dans `lib/urbanismeUtils.ts`.
- **BlockArchitecte** : Conformité architecturale (seuils, obligations). Logique dans `lib/architecteUtils.ts`.
- **BlockDevisMultiple** : Comparaison de plusieurs devis côte à côte.

**Composants auxiliaires :**
- **DocumentRejectionScreen** : Écran affiché quand le document uploadé n'est pas un devis.
- **ExtractionBlocker** : Blocage de l'affichage si l'extraction OCR a échoué.
- **OcrDebugPanel** : Panneau de debug OCR (développement uniquement).
- **AdaptedAnalysisBanner** : Bandeau informant que l'analyse est en mode dégradé.
- **InfoTooltip** : Infobulles pédagogiques pour chaque critère.
- **PedagogicExplanation** : Explications contextuelles détaillées.
- **MissingDataActions** : Actions proposées quand des données sont manquantes.
- **StrategicBadge** : Badge affichant les scores IVP/IPI (Indice de Valorisation Patrimoniale / Indice de Performance Investisseur) avec breakdown par critère.
- **UrbanismeAssistant** : Assistant urbanisme interactif.

Chaque bloc utilise des **fonctions de filtre** exportées depuis `analysis/index.ts` :
```typescript
filterOutEntrepriseItems(pointsOk, alertes)  // → données entreprise
filterOutDevisItems(pointsOk, alertes)        // → données devis
filterOutPriceItems(pointsOk, alertes)        // → données prix
filterOutSecuriteItems(pointsOk, alertes)     // → données sécurité
filterOutContexteItems(pointsOk, alertes)     // → données contexte
```

La logique métier de chaque bloc est externalisée dans `src/lib/*Utils.ts` pour faciliter les tests et réduire la taille des composants.

### 7.3 Composants landing

Les sections de la landing page sont des composants React indépendants, hydratés progressivement via les directives Astro :

- `client:load` : Hydratation immédiate (HeroSection)
- `client:visible` : Hydratation quand visible dans le viewport (toutes les autres sections)

**Landing GMC (`src/components/gmc-landing/`)** — composants `.astro` purs servant `gerermonchantier.fr/` (Header, Logo, Hero, HouseIllustration, HowItWorks, Features, PiloteSection, Pricing, FinalCTA, Footer) :

- `Logo.astro` accepte un prop `wordmark` (défaut `true`) — `false` rend uniquement le badge SVG sans le texte ni le tagline.
- `Header.astro` est responsive : sous 640px, logo en badge seul, bouton "Connexion" visible, CTA raccourci en "Démarrer". C'est l'une des **3 variantes de Header** (cf. `layout/Header.tsx`, `astro/Header.astro`) — toute modif d'état d'auth doit être synchronisée sur les trois.
- `Hero.astro` contient un bouton "Voir une démo en 60 s" qui ouvre `/demo/?embed=1` dans une modale iframe.

**Vidéo démo (`public/demo/`)** — page statique servie hors pipeline Astro. `index.html` charge React 18 + Babel UMD locaux (`vendor/`) et transpile `animations.jsx` (moteur `Stage`/`Sprite`) + `video-scenes.jsx` (12 scènes, ~60s) **en navigateur**. La vidéo est l'export d'un bundle claude.ai/design : pour la mettre à jour, remplacer `video-scenes.jsx` puis ajuster la durée dans le bouton du Hero et la meta description de `demo/index.html`.

### 7.4 Composants blog

- **ArticleCard** : Carte de prévisualisation d'un article (titre, extrait, date) dans la liste du blog.
- **ArticleContent** : Rendu HTML complet d'un article.
- **BlogCTA** : Call-to-action intégré dans les articles pour inciter à utiliser le service.

### 7.5 Composants admin

- **AdminCharts** : Graphiques KPI avec Recharts (analyses/jour, distribution scores, etc.).
- **BlogPostList** : Liste des articles blog côté admin avec statut, workflow et actions.
- **BlogPostEditor** : Éditeur complet d'article avec 3 onglets (rich text / HTML / aperçu), sidebar images + métadonnées + SEO, bouton publier.
- **AiGenerationPanel** : Génération d'articles via Claude API avec pitch, mots-clés, longueur et URLs sources.
- **ManualWriteEditor** : Rédaction manuelle d'articles avec rich text editor et gestion d'images.
- **RichTextToolbar** : Éditeur rich text basé sur `contentEditable` + `document.execCommand` (H1/H2/H3, gras, italique, listes, emojis).
- **ImageManagement** : Gestion images cover + mi-texte (upload fichier ou génération IA via fal.ai).
- **BlogDialogs** : Modales de suppression et de planification.
- **blogTypes** : Types TypeScript partagés pour le module admin blog.

### 7.6 Composants funnel

- **FunnelStepper** : Composant stepper visuel pour guider l'utilisateur à travers les étapes (upload → analyse → résultat).
- **PremiumGate** : Gate conditionnelle pour les fonctionnalités premium / à venir.

### 7.8 Composants chantier

Voir la [section 20 — Module Chantier](#20-module-chantier-mon-chantier) pour le détail complet.

Module complet avec ~20 composants dans `src/components/chantier/` :
- **Création** : `ScreenPrompt`, `ScreenQualification`, `ScreenGenerating`, `ScreenWow` — tunnel de création avec IA
- **Dashboard** : `DashboardChantier`, `SyntheseChantier`, `BudgetGlobal`, `BudgetFiabilite`, `NextActionCard`, `ChantierTimeline`
- **Lots** : `LotGrid`, `LotCard`, `LotDetail` — gestion des lots de travaux avec prix de référence
- **Documents** : `DocumentsSection` — upload, classement, rattachement à un lot
- **IA** : `ConseilsChantier`, `JournalChantier`, `ScreenAmeliorations` — conseils maître d'œuvre et journal des modifications
- **Finance** : `SimulationFinancement`, `BudgetTab` — simulation crédit et onglet budget
- **Comparaison** : `ComparateurDevis` — comparateur de devis par lot

### 7.9 Composants shadcn-ui

16 composants UI pré-construits dans `src/components/ui/` : badge, button, card, checkbox, collapsible, dialog, input, label, progress, select, tabs, textarea, toast, toaster, tooltip, sonner. Ce sont des composants Radix UI stylisés avec Tailwind. **Ne pas les modifier manuellement** — utiliser la CLI shadcn pour les mettre à jour.

---

## 8. Base de données

### Schéma PostgreSQL (Supabase)

#### Table `analyses` (table centrale)

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Identifiant unique |
| `user_id` | uuid | Référence auth.users |
| `file_name` | text | Nom du fichier uploadé |
| `file_path` | text | Chemin dans Supabase Storage |
| `status` | text | État : pending, processing, completed, error |
| `score` | text | Résultat : VERT, ORANGE, ROUGE |
| `resume` | text | Résumé en 1-2 phrases |
| `raw_text` | text | Texte OCR brut |
| `alertes` | jsonb | Tableau d'alertes (⚠️/❌) |
| `points_ok` | jsonb | Tableau de points positifs (✓) |
| `recommandations` | jsonb | Tableau de recommandations |
| `types_travaux` | jsonb | Types de travaux détectés |
| `attestation_analysis` | jsonb | Analyse de l'attestation d'assurance |
| `attestation_comparison` | jsonb | Comparaison attestation/devis |
| `assurance_level2_score` | text | Score détaillé assurance |
| `market_price_overrides` | jsonb | Éditions utilisateur prix marché (quantités, réaffectations) |
| `created_at` | timestamptz | Date de création |

#### Table `document_extractions` (cache OCR)

| Colonne | Type | Description |
|---|---|---|
| `file_hash` | text | Hash SHA-256 du fichier (clé primaire) |
| `ocr_provider` | text | Provider utilisé (pdf, textract, gemini) |
| `ocr_status` | text | Statut OCR |
| `parsed_data` | jsonb | Données structurées extraites |
| `quality_score` | numeric | Score de qualité OCR |
| `pages_count` | integer | Nombre de pages |

#### Table `company_cache` (cache entreprises)

| Colonne | Type | Description |
|---|---|---|
| `siren` | text | Numéro SIREN |
| `siret` | text | Numéro SIRET |
| `provider` | text | Source (pappers ou recherche-entreprises) |
| `payload` | jsonb | Données complètes |
| `status` | text | Statut de la vérification |
| `expires_at` | timestamptz | Expiration du cache (30j succès, 1j 404, 1h erreur). Purgé quotidiennement par cron. |

#### Table `zones_geographiques` (coefficients géo)

| Colonne | Type | Description |
|---|---|---|
| `prefixe_postal` | text | Préfixe code postal (75, 13, 69...) |
| `type_zone` | text | petite_ville, ville_moyenne, grande_ville |
| `coefficient` | numeric | Multiplicateur (0.90 à 1.20) |

#### Table `analysis_work_items` (lignes de travaux)

| Colonne | Type | Description |
|---|---|---|
| `analysis_id` | uuid | Référence analyses |
| `description` | text | Description du poste |
| `category` | text | Catégorie de travaux |
| `amount_ht` | numeric | Montant HT |
| `quantity` | numeric | Quantité |
| `unit` | text | Unité (m², ml, forfait) |
| `job_type_group` | text | Rattachement au job type IA |

#### Table `blog_posts`

| Colonne | Type | Description |
|---|---|---|
| `slug` | text | URL-friendly identifiant |
| `title` | text | Titre de l'article |
| `content_html` | text | Contenu HTML |
| `excerpt` | text | Extrait/résumé |
| `category` | text | Catégorie |
| `tags` | text[] | Tags |
| `cover_image_url` | text | Image de couverture |
| `mid_image_url` | text | Image mi-texte (affichée en 2 colonnes) |
| `status` | text | draft, published |
| `workflow_status` | text | manual, ai_draft, ai_reviewed, scheduled, published, rejected |
| `ai_generated` | boolean | Généré par IA |
| `ai_model` | text | Modèle IA utilisé |
| `ai_prompt` | text | Prompt de génération |
| `scheduled_at` | timestamptz | Date de publication programmée |
| `reviewed_by` | uuid | Validé par (user_id) |
| `reviewed_at` | timestamptz | Date de validation |
| `published_at` | timestamptz | Date de publication |
| `seo_title` | text | Titre SEO |
| `seo_description` | text | Description SEO |

#### Table `post_signature_tracking`

| Colonne | Type | Description |
|---|---|---|
| `analysis_id` | uuid | Référence analyses |
| `user_id` | uuid | Référence auth.users |
| `is_signed` | boolean | Devis signé |
| `signed_date` | date | Date de signature |
| `work_start_date` | date | Début des travaux |
| `work_end_date` | date | Fin des travaux |
| `work_completion_status` | text | Statut d'avancement |

#### Table `user_roles`

| Colonne | Type | Description |
|---|---|---|
| `user_id` | uuid | Référence auth.users |
| `role` | text | admin, moderator, user |

#### Table `strategic_matrix` (scores IVP/IPI)

| Colonne | Type | Description |
|---|---|---|
| `job_type` | text | Identifiant du type de travaux (clé primaire) |
| `value_intrinseque` | numeric(4,1) | Score valeur intrinsèque (0-10) |
| `liquidite` | numeric(4,1) | Score liquidité (0-10) |
| `attractivite` | numeric(4,1) | Score attractivité (0-10) |
| `energie` | numeric(4,1) | Score performance énergétique (0-10) |
| `reduction_risque` | numeric(4,1) | Score réduction de risque (0-10) |
| `impact_loyer` | numeric(4,1) | Score impact sur le loyer (0-10) |
| `vacance` | numeric(4,1) | Score réduction vacance (0-10) |
| `fiscalite` | numeric(4,1) | Score avantage fiscal (0-10) |
| `capex_risk` | numeric(4,1) | Score risque CAPEX (0-10) |
| `recovery_rate` | numeric(4,3) | Taux de récupération à la revente (0-1) |

IVP = 0.30×value + 0.25×liquidité + 0.20×attractivité + 0.15×énergie + 0.10×réduction_risque. IPI = 0.35×loyer + 0.25×vacance + 0.20×énergie + 0.10×fiscalité + 0.10×(5-capex).

#### Table `dvf_prices` (prix immobiliers DVF)

| Colonne | Type | Description |
|---|---|---|
| `code_insee` | text | Code INSEE commune (clé primaire) |
| `commune` | text | Nom de la commune |
| `prix_m2_maison` | numeric | Médiane prix/m² maison (€) |
| `prix_m2_appartement` | numeric | Médiane prix/m² appartement (€) |
| `nb_ventes_maison` | int | Nombre de ventes maison retenues |
| `nb_ventes_appartement` | int | Nombre de ventes appartement retenues |
| `period` | text | Période de calcul (ex: "12m") |

Source : Demandes de Valeurs Foncières (data.gouv.fr). Données publiques, RLS lecture publique.

#### Table `chantiers` (gestion de chantier)

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Identifiant unique |
| `user_id` | uuid | Référence auth.users |
| `nom` | text | Nom du chantier |
| `emoji` | text | Emoji représentatif |
| `description` | text | Description courte |
| `budget` | numeric | Budget total estimé |
| `phase` | text | Phase actuelle (idee, preparation, autorisations, travaux, finitions, reception, termine) |
| `emoji_phase` | text | Emoji de la phase actuelle |
| `type_projet` | text | Type (pergola, terrasse, salle_de_bain, cuisine, extension, etc.) |
| `metadonnees` | text | JSON sérialisé (roadmap, artisans, formalites, aides, lignesBudget, etc.) |
| `mensualite` | numeric | Mensualité crédit si financement |
| `duree_credit` | integer | Durée crédit en mois |
| `date_debut_souhaitee` | timestamptz | Date de démarrage souhaitée |
| `created_at` | timestamptz | Date de création |

#### Table `lots_chantier` (lots de travaux)

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Identifiant unique |
| `chantier_id` | uuid | Référence chantiers (CASCADE) |
| `nom` | text | Nom du lot (ex: "Plomberie") |
| `statut` | text | a_trouver, a_contacter, ok |
| `ordre` | integer | Ordre d'affichage |
| `emoji` | text | Emoji du lot |
| `role` | text | Rôle/description de l'artisan |
| `job_type` | text | Identifiant catalogue market_prices |
| `quantite` | numeric | Quantité estimée |
| `unite` | text | Unité (m², ml, forfait, etc.) |
| `budget_min_ht` | numeric | Budget min (calculé depuis market_prices) |
| `budget_avg_ht` | numeric | Budget moyen |
| `budget_max_ht` | numeric | Budget max |
| `materiaux_ht` | numeric | Part matériaux |
| `main_oeuvre_ht` | numeric | Part main d'œuvre |
| `divers_ht` | numeric | Part divers |

#### Table `todo_chantier` (checklist)

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Identifiant unique |
| `chantier_id` | uuid | Référence chantiers (CASCADE) |
| `titre` | text | Titre de la tâche |
| `priorite` | text | urgent, important, normal |
| `done` | boolean | Tâche terminée |
| `ordre` | integer | Ordre d'affichage |

#### Table `chantier_updates` (journal IA)

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Identifiant unique |
| `chantier_id` | uuid | Référence chantiers (CASCADE) |
| `modification` | text | Description de la modification |
| `changes` | text | JSON sérialisé des changements (ChangeItem[]) |
| `created_at` | timestamptz | Date de la modification |

#### Table `documents_chantier`

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Identifiant unique |
| `chantier_id` | uuid | Référence chantiers (CASCADE) |
| `lot_id` | uuid | Référence lots_chantier (nullable) |
| `analyse_id` | uuid | Référence analyses (nullable, lien vers analyse créée) |
| `document_type` | text | devis, facture, photo, plan, autorisation, assurance, autre |
| `depense_type` | text | facture / ticket_caisse / achat_materiaux / frais |
| `devis_statut` | text | en_cours / a_relancer / valide / attente_facture |
| `facture_statut` | text | recue / payee / payee_partiellement / en_litige |
| `montant` | numeric | Montant total TTC |
| `montant_paye` | numeric | Montant payé (si partiel) |
| `payment_terms` | jsonb | Conditions de paiement extraites par IA (single object: pct, delai_jours, type_facture, numero_facture) |
| `cashflow_terms` | jsonb | **Array** des versements dérivés. Chaque élément : `{ event_id, amount, due_date, status, label, funding_source_id? }`. Source de vérité pour la VIEW `payment_events_v` (cf. § Architecture cashflow) |
| `parent_devis_id` | uuid | Self-ref pour avenants (montant = supplément seul) |
| `avenant_motif` | text | Description de l'avenant |
| `devis_validated_at` | timestamptz | Horodatage de validation devis |
| `source` | text | manual_upload / manual_entry / verifier_mon_devis / agent_avenant |
| `nom`, `nom_fichier` | text | Nom affiché / nom de fichier original |
| `bucket_path` | text | Chemin dans le bucket Storage (UNIQUE) |
| `taille_octets`, `mime_type` | — | Métadonnées physiques |

#### Table `newsletter_subscriptions`

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Identifiant unique |
| `email` | text | Email (unique) |
| `subscribed_at` | timestamptz | Date d'inscription |

#### Table `rental_prices` (prix locatifs)

| Colonne | Type | Description |
|---|---|---|
| `code_insee` | text | Code INSEE commune |
| `loyer_m2_maison` | numeric | Loyer médian/m² maison |
| `loyer_m2_appartement` | numeric | Loyer médian/m² appartement |

#### Table `subscriptions` (abonnements premium)

| Colonne | Type | Description |
|---|---|---|
| `user_id` | uuid | Référence auth.users |
| `stripe_customer_id` | text | ID client Stripe |
| `stripe_subscription_id` | text | ID souscription Stripe |
| `status` | text | active, canceled, past_due |
| `lifetime_analysis_count` | integer | Compteur analyses à vie |

### Vues SQL

- **`admin_kpis_usage`** : Nombre d'analyses, taux de complétion, analyses par jour
- **`admin_kpis_scoring`** : Distribution des scores (% vert/orange/rouge)
- **`admin_kpis_tracking`** : KPIs de suivi post-signature

---

## 9. Authentification

### Flux d'inscription

1. L'utilisateur remplit : prénom, nom, email, téléphone (avec sélecteur indicatif pays, +33 par défaut, 14 pays supportés), mot de passe (min 8 caractères)
2. Acceptation obligatoire des CGU
3. Option : accepter les offres commerciales
4. Appel `supabase.auth.signUp()` avec les metadata utilisateur (téléphone au format international : `+33612345678`)
5. Webhook fire & forget vers MessagingMe (CRM) avec email, téléphone, nom, prénom, accept_commercial
6. Redirection vers `/tableau-de-bord`

### Flux de connexion

1. L'utilisateur entre email + mot de passe
2. Appel `supabase.auth.signInWithPassword()`
3. Succès : token JWT stocké dans `localStorage`, redirection vers `/tableau-de-bord`
4. Erreur : toast d'erreur affiché

### Gestion de session

- **Stockage** : `localStorage` (côté client uniquement)
- **Rafraîchissement** : automatique via le client Supabase
- **Vérification** : chaque page protégée appelle `supabase.auth.getUser()`
- **Déconnexion** : `supabase.auth.signOut()` + redirection vers `/`

### Protection des routes

Les composants React des pages protégées vérifient l'authentification au montage :

```typescript
useEffect(() => {
  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = '/connexion';
      return;
    }
    // ... charger les données
  };
  checkAuth();
}, []);
```

### Rôles

La table `user_roles` associe un rôle à chaque utilisateur. Les pages admin vérifient le rôle :
- `/admin/*` → rôle `admin` requis

---

## 10. Pipeline d'analyse des devis

### Vue d'ensemble du pipeline

```
┌──────────┐    ┌──────────────────┐    ┌──────────────┐
│  Upload   │───▶│  extract-document │───▶│  parse-quote  │
│  (client) │    │  (OCR)           │    │  (Gemini AI)  │
└──────────┘    └──────────────────┘    └──────┬───────┘
                                                │
                ┌───────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────┐
│                  analyze-quote                        │
│  (orchestrateur)                                      │
│                                                       │
│  ┌─────────────┐  ┌───────────┐  ┌────────────────┐ │
│  │   Pappers    │  │   IBAN    │  │   Prix marché   │ │
│  │  (SIRET)     │  │  check    │  │ (market_prices) │ │
│  └─────────────┘  └───────────┘  └────────────────┘ │
│  ┌─────────────┐  ┌───────────┐  ┌────────────────┐ │
│  │    ADEME     │  │  Google   │  │   Georisques    │ │
│  │   (RGE)      │  │  Places   │  │   (risques)     │ │
│  └─────────────┘  └───────────┘  └────────────────┘ │
│                                                       │
│  → Calcul du score (VERT / ORANGE / ROUGE)           │
│  → Génération des alertes, points OK, recommandations │
└──────────────────────────────────────────────────────┘
```

### Étape 1 : Upload du fichier

Le composant `NewAnalysis.tsx` :
1. Valide le fichier (PDF/JPG/PNG, max 10 MB)
2. Crée un enregistrement dans `analyses` (status: "pending")
3. Upload le fichier vers Supabase Storage : `devis/{user_id}/{timestamp}.{ext}`
4. Appelle la edge function `analyze-quote`

### Étape 2 : Extraction de texte (OCR)

La edge function `extract-document` :
1. Vérifie le cache (`document_extractions`) via hash SHA-256
2. Si cache miss, tente l'extraction par ordre de priorité :
   - **PDF natif** : extraction directe du texte (rapide, gratuit)
   - **AWS Textract** : OCR pour PDF scannés et images
   - **Gemini Vision** : fallback pour documents complexes
3. Retourne : texte brut, blocs structurés, score de qualité

### Étape 3 : Parsing structuré

La edge function `parse-quote` envoie le texte OCR à **Google Gemini** avec un prompt structuré pour extraire :
- Informations entreprise (nom, SIRET, adresse, assurances)
- Informations client (adresse chantier, code postal)
- Liste détaillée des travaux (libellé, catégorie, montant, quantité, unité)
- Conditions de paiement (acompte, modes de paiement)
- Totaux (HT, TVA, TTC)
- Anomalies détectées par l'IA

### Étape 4 : Vérifications parallèles

`analyze-quote` lance en parallèle :

| Vérification | API | Données retournées |
|---|---|---|
| Entreprise | Pappers / recherche-entreprises.api.gouv.fr | SIRET actif, ancienneté, capital, procédure collective |
| IBAN | openiban.com | Validité du RIB/IBAN |
| RGE | ADEME | Certifications énergie renouvelable |
| Avis | Google Places | Note et nombre d'avis Google |
| Risques | Georisques | Risques naturels sur la zone |
| Urbanisme | GPU (api.gpu-national.fr) | Proximité monuments historiques (ABF) |
| Prix marché | Table market_prices + Gemini | Groupement par job type, fourchette min/moy/max |

**Géolocalisation (verify.ts)** : la requête est construite depuis `adresse_chantier + code_postal + ville` (les 3 concaténés si disponibles). Le bloc s'active dès qu'AU MOINS un de ces champs est non-null — la présence du `code_postal` seul n'est plus requise. Sans géolocalisation réussie, `patrimoine_status = "inconnu"` et le bloc ABF/GPU est skippé.

**Prix marché (market-prices.ts)** — architecture de résolution en 3 couches indépendantes (validée prod 2026-04-29, en cours de refonte V3.5) :

**Couche 1 — Pré-filtrage catalogue** (`filterRelevantPrices`) :
Le catalogue `market_prices` compte **911 entrées** (état 2026-05-21). Envoyer tout à Gemini-2.0-flash provoque des inventions d'identifiants. La fonction détecte les domaines de travaux présents dans les descriptions via ~180 triggers de mots-clés (carrelage, peinture, plomberie, menuiserie, chauffage, etc.) et réduit le catalogue à ~20-80 entrées avant l'appel Gemini. Fallback : catalogue complet si < 8 entrées filtrées.

**Couche 2 — Matching 5 niveaux** sur les identifiants retournés par Gemini :
- L1 : exact match (+ trim)
- L2 : normalized exact (lowercase + underscores)
- L3 : préfixe bidirectionnel (`"carrelage_sol"` → `"carrelage_sol_fourniture_pose"` ✓)
- L4 : token-boundary substring (`"pose_carrelage_sol_fourniture"` → `"carrelage_sol"` ✓)
- L5 : scoring sémantique de tokens sur label + descriptions du groupe (indépendant du respect des identifiants par Gemini)
- Group-L5 : même scoring au niveau groupe entier si `job_types: []`

**Couche 3 — Fallback d'urgence** (si `matchedGroups === 0`) :
Si Gemini API fail, timeout ou JSON invalide → 0 groupes. Matching direct par champ `categorie` des work items issus de l'extraction Phase 1, complètement sans Gemini. L'Indice Stratégique Immobilier™ dépend des mêmes `matched groups` — il tombe si cette pipeline échoue.

**Diagnostic si régression** : logs Supabase → Functions → analyze-quote → chercher `[MarketPrices] Gemini raw response` (raw Gemini), `ALL 5 LEVELS FAILED` (couche 2 manquante), `Emergency fallback` (couche 3 déclenchée).

**Refonte V3.5 — Vectorielle (LIVE en prod depuis 2026-05-22)** :
La cause racine des regroupements aberrants (ex: PH VISION "Pose extracteur/WC = 3900€ tout-le-bloc-Sanitaires", placo TCE "Peinture salle de bain pièce 26 040€") était l'étape **groupement Gemini Phase 2** qui regroupait N lignes devis en M groupes avant matching catalogue. Solution livrée : **1 ligne devis = 1 embedding** matché individuellement au catalogue via similarity search vectorielle (pgvector + HNSW + cosine).

| Phase | Statut | Description |
|---|---|---|
| A — Migration pgvector | ✅ Livrée 2026-05-21 | `20260521_002_market_prices_vectorization.sql` ajoute colonne `embedding vector(768)` + index HNSW + RPC `search_market_prices_v2` |
| B — Seed embeddings | ✅ Livrée 2026-05-21 | `scripts/seed_market_prices_embeddings.mjs` embed les 911 entries via Gemini `gemini-embedding-001` + `outputDimensionality:768`. Seed exécuté en prod : 911/911 OK. |
| C — Refonte edge function | ✅ Livrée 2026-05-21 | 5 sous-phases : helper `market-matcher-vectorial.ts` + feature flag `MARKET_MATCHER_VECTORIAL=off\|shadow\|on` + adapter `conclusion.ts` (skip garde "groupement invalide" en mode vectoriel) + 23 tests unitaires + shadow run via `EdgeRuntime.waitUntil` |
| D — UI vectorielle | ✅ Livrée 2026-05-22 | Nouveau composant `VectorialPriceList.tsx` : 3 sections (Comparables fiables / Incertains / Non comparables) + badge confidence high/medium/low/no_match + pagination 15/section + top-5 candidats catalogue alternatifs. `BlockPrixMarche` bascule automatiquement quand le shape vectoriel est détecté |
| E — Script analyse shadow | ✅ Livré 2026-05-22 | `scripts/analyze_vectorial_shadow_logs.mjs` parse les logs `[V35_VECTORIAL_SHADOW]` et sort un rapport markdown avec checklist Phase F automatisée |
| F — Bascule prod | ✅ FLIPPÉ 2026-05-22 | `MARKET_MATCHER_VECTORIAL=on` set côté Supabase secrets + bump ENGINE_VERSION 3.4.28 → 3.5.0. Validé en live sur le devis CYRIL CATEZ le 2026-05-23 : 29 cartes ligne par ligne au lieu des 3 groupes hallucinés V3.6. Rollback express : `npx supabase secrets set MARKET_MATCHER_VECTORIAL=off` |

Le code V3.6 (3 couches groupement Gemini + matching) reste dans le code derrière le flag, prêt à servir en rollback. 2 bugs résiduels documentés dans `WIP.md` section V3.5.1 (faux positifs anomalies sur forfaits + cohérence verdict/encadré comparison_indicative) à arbitrer après ~10-20 analyses naturelles post-flip.

### Étape 5 : Scoring et résultat

L'algorithme de scoring pondère tous les critères pour produire un verdict final. Voir la section [Système de scoring](#12-système-de-scoring).

---

## 11. Edge Functions Supabase

### analyze-quote (orchestrateur)

**Dossier** : `supabase/functions/analyze-quote/` (9 fichiers modulaires) — `verify_jwt = false`

Point d'entrée principal. Orchestre toute la pipeline d'analyse :
1. Récupère le fichier depuis Storage
2. Appelle `extract-document`
3. Appelle `parse-quote`
4. Lance les vérifications en parallèle
5. Calcule le score
6. Met à jour la table `analyses`

**Modules internes :**
| Fichier | Rôle |
|---|---|
| `index.ts` | Point d'entrée, orchestration de la pipeline |
| `extract.ts` | Appels vers l'edge function d'extraction OCR |
| `verify.ts` | Vérifications parallèles (Pappers, ADEME, Google Places, Georisques, IBAN) |
| `score.ts` | Algorithme de calcul du score (VERT/ORANGE/ROUGE) |
| `render.ts` | Génération des alertes, points OK et recommandations textuelles |
| `summarize.ts` | Résumé des lignes de travaux (gemini-2.0-flash) |
| `market-prices.ts` | Groupement par job type + lookup prix marché (gemini-2.0-flash) |
| `utils.ts` | Fonctions utilitaires partagées entre modules |
| `types.ts` | Types TypeScript de la pipeline d'analyse |

### extract-document (OCR) — `verify_jwt = false`

**Fichier** : `supabase/functions/extract-document/index.ts`

Gère l'extraction de texte avec fallback multi-provider :
- Vérifie le cache par hash SHA-256
- Tente PDF text → Textract → Gemini Vision
- Stocke le résultat en cache

### parse-quote (IA) — `verify_jwt = false`

**Fichier** : `supabase/functions/parse-quote/index.ts`

Extraction structurée du devis via Google Gemini :
- Envoie le texte OCR avec un prompt formaté
- Retourne un JSON structuré avec toutes les données du devis
- Détecte le type de document (devis_travaux, facture, etc.)

### admin-kpis — `verify_jwt = false`

**Fichier** : `supabase/functions/admin-kpis/index.ts`

API pour le dashboard admin : retourne les KPIs depuis les vues SQL. Vérifie le rôle admin en interne via `user_roles`.

### generate-blog-article — `verify_jwt = false`

**Fichier** : `supabase/functions/generate-blog-article/index.ts`

Génération d'articles de blog via **Claude API** (`claude-sonnet-4-20250514`) :
- Accepte : pitch, mots-clés, longueur cible, URLs sources
- Retourne un article HTML structuré avec titre, slug, extrait, SEO
- Insert direct dans `blog_posts` en brouillon (`workflow_status: ai_draft`)
- Vérifie le rôle admin en interne via `user_roles`

### generate-blog-image — `verify_jwt = false`

**Fichier** : `supabase/functions/generate-blog-image/index.ts`

Génération d'images via **fal.ai** (Flux Schnell) :
- Accepte : postId, type (cover/mid), prompt
- Génère l'image, l'uploade dans le bucket `blog-images`
- Met à jour `blog_posts.cover_image_url` ou `mid_image_url`
- Vérifie le rôle admin en interne via `user_roles`

### publish-scheduled-posts — `verify_jwt = false`

**Fichier** : `supabase/functions/publish-scheduled-posts/index.ts`

Cron (toutes les 15 min) qui publie les articles programmés dont `scheduled_at` est passé.

> **Note** : `verify_jwt = false` sur **TOUTES** les edge functions. Supabase Auth signe les JWT avec ES256, incompatible avec le runtime `verify_jwt`. Les fonctions admin vérifient le rôle en interne via la table `user_roles`.

### analyze-attestation — `verify_jwt = false`

**Fichier** : `supabase/functions/analyze-attestation/index.ts`

Analyse d'attestation d'assurance (décennale, RC Pro) et comparaison avec les données du devis.

### chantier-generer — `verify_jwt = false`

**Fichier** : `supabase/functions/chantier-generer/index.ts`

Génération d'un plan complet de chantier via **Gemini 2.0 Flash** :
- Accepte : description du projet (texte libre ou formulaire guidé) + réponses de qualification
- Enrichissement géographique automatique (code postal → coefficient zone via `zones_geographiques`)
- Retourne un `ChantierIAResult` complet : nom, emoji, budget, roadmap, artisans, formalités, tâches, aides, financement
- Calcule des `estimationSignaux` (fiabilité de l'estimation : localisation, budget, date, surface connues)

### chantier-qualifier — `verify_jwt = false`

**Fichier** : `supabase/functions/chantier-qualifier/index.ts`

Génère 4-5 questions contextuelles via Gemini pour qualifier un projet avant génération du plan.

### system-alerts — `verify_jwt = false`

**Fichier** : `supabase/functions/system-alerts/index.ts`

Surveillance santé du pipeline d'analyse de devis. Envoie un email Resend à **`julien@messagingme.fr` + `bridey.johan@gmail.com`** quand des analyses se bloquent ou échouent en série.

**Trigger** : pg_cron job `system-health-alerts` toutes les 5 minutes (migration originale `supabase/migrations/20260228.sql`, restaurée explicitement par `supabase/migrations/20260521_001_restore_system_health_alerts_cron.sql` après suppression accidentelle entre 2026-03-14 et 2026-05-21) → `POST /functions/v1/system-alerts` avec Bearer service_role.

**3 health checks lancés en parallèle** (`Promise.all`) :

| Check | Sévérité | Condition | Fenêtre |
|---|---|---|---|
| `checkStuckAnalyses` | **CRITIQUE** | analyses en `pending`/`processing` depuis > 15 min | max 24h (pour ne pas re-signaler des analyses mortes depuis des jours) |
| `checkErrorSpike` | **ERREUR** | ≥ 3 analyses en `error`/`failed` | sur 30 min |
| `checkHighErrorRate` | **WARNING** | taux d'erreur > 50% (min 4 analyses pour éviter faux positifs sur faible volume) | sur 1h |

**Email Resend** :
- From : `VerifierMonDevis <onboarding@resend.dev>` (domaine `verifiermondevis.fr` pas encore vérifié — TODO en haut du fichier pour passer à `alerts@verifiermondevis.fr`).
- To : `julien@messagingme.fr` + `bridey.johan@gmail.com` (alignés depuis 2026-05-21 avec `analysis-maintenance` et `analyze-quote`).
- HTML coloré par sévérité (rouge/orange/jaune) + tableau des analyses concernées (8 premiers chars de l'ID, statut, date Paris, error_message tronqué à 80 chars) + CTA vers `/admin`.
- **Idempotency-Key** = `{category}_{ids_fingerprint}` où `ids_fingerprint` = jointure triée des 8 premiers chars des IDs concernés. Conséquence : mêmes analyses bloquées = même clé = Resend dédoublonne et ne renvoie pas. Une nouvelle analyse bloquée = clé différente = email envoyé. Pas de cap horaire dur — c'est l'idempotency Resend qui fait le dédoublonnage.

**Variables d'env** requises côté edge fn : `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**Logs** : `Alert sent: {category} (idempotency: {key})` en cas de succès, `Resend error ({status}): {body}` en cas d'échec API. Le résultat de chaque tick est loggé en JSON (`alerts_triggered`, `alerts_sent`, `send_errors`) pour audit.

### read-invoice — `verify_jwt = false`

**Fichier** : `supabase/functions/read-invoice/index.ts`

Lecture et extraction de données de factures.

> **Note** : `verify_jwt = false` sur **TOUTES** les edge functions (12 au total). Supabase Auth signe les JWT avec ES256, incompatible avec le runtime `verify_jwt`. Les fonctions admin vérifient le rôle en interne.

---

## 12. Système de scoring

### Les trois niveaux

| Score | Couleur | Signification |
|---|---|---|
| **VERT** | 🟢 `#22C55E` | Confiance — entreprise vérifiée, prix cohérent, devis conforme |
| **ORANGE** | 🟠 `#F97316` | Vigilance — alertes mineures (entreprise jeune, prix en limite haute) |
| **ROUGE** | 🔴 `#EF4444` | Danger — alertes majeures (SIRET invalide, prix anormal, procédure collective) |

### Critères de scoring

**Entreprise** (positif / négatif) :
- ✓ SIRET trouvé et actif → +points
- ✓ Entreprise > 3 ans → +points
- ✓ Pas de procédure collective → +points
- ✓ Capital social positif → +points
- ✗ SIRET introuvable → -gros malus
- ✗ Procédure collective → -gros malus
- ✗ Capital négatif → -malus

**Devis** (positif / négatif) :
- ✓ Prix cohérent avec le marché → +points
- ✓ Détail chiffré (matériaux/main d'œuvre) → +points
- ✓ Échéancier de paiement clair → +points
- ✓ Dates valides → +points
- ✗ Prix 50%+ au-dessus du marché → -gros malus
- ✗ Prix suspicieusement bas (70%- sous le marché) → -malus
- ✗ Description vague des travaux → -malus
- ✗ Acompte > 30% → -malus

**Localisation** :
- Coefficient géographique appliqué aux fourchettes de prix (0.9x-1.2x)

### Classes CSS

```css
/* Vert */
.text-score-green          /* Texte vert */
.bg-score-green-bg         /* Fond vert clair */
.text-score-green-foreground /* Texte sur fond vert */

/* Orange */
.text-score-orange
.bg-score-orange-bg
.text-score-orange-foreground

/* Rouge */
.text-score-red
.bg-score-red-bg
.text-score-red-foreground
```

---

## 13. APIs externes

| API | Usage | Authentification |
|---|---|---|
| **Pappers** | Vérification SIRET/SIREN, santé financière | Clé API (optionnel) |
| **recherche-entreprises.api.gouv.fr** | Fallback entreprise si Pappers non configuré (nom, statut, adresse, date création) | Public (gratuit) |
| **Google Gemini** | Extraction OCR (2.5-flash), groupement prix (2.0-flash), résumés (2.0-flash) | Clé API |
| **Claude API** | Génération d'articles de blog | Clé API (ANTHROPIC_API_KEY) |
| **fal.ai** | Génération d'images de blog (Flux Schnell) | Clé API (FAL_API_KEY) |
| **AWS Textract** | OCR de documents scannés | Clé AWS |
| **ADEME** | Vérification certification RGE | Clé API |
| **Google Places** | Avis et notes entreprise | Clé API |
| **Georisques** | Risques naturels par localisation | Public |
| **GPU** | Urbanisme, monuments historiques | Public |
| **OpenIBAN** | Validation de RIB/IBAN | Public |
| **API Adresse** | Validation d'adresses françaises | Public |

---

## 14. Système de style et design

### Tailwind CSS

Configuration dans `tailwind.config.ts`. Le thème utilise des variables CSS HSL :

```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --primary: 217 91% 60%;
  --primary-foreground: 0 0% 100%;
  --muted: 240 4.8% 95.9%;
  --accent: 240 4.8% 95.9%;
  --border: 240 5.9% 90%;
  --ring: 217 91% 60%;
  /* ... */
}
```

### Typographie

- Police principale : **DM Sans** (Google Fonts via @fontsource)
- Font-weight : 400 (body), 500 (medium), 600 (semibold), 700 (bold)

### Container

- Max-width : 1400px (`2xl`)
- Padding : 2rem
- Centré automatiquement

### Animations

Animations customs définies dans Tailwind :
- `fade-in` : Apparition en fondu
- `slide-in-right` : Glissement depuis la droite
- `scale-in` : Zoom in
- `accordion-down/up` : Ouverture/fermeture accordion

### Breakpoints

Breakpoints Tailwind standard : `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px), `2xl` (1400px)

---

## 14b. Intégrations externes (CRM & Email)

### MessagingMe (CRM)

Widget chat + plateforme d'envoi d'emails marketing/transactionnels.

- **Widget chat** : script chargé dans `BaseLayout.astro` (`<script src="https://ai.messagingme.app/widget/f236879w135897.js" async>`), présent sur toutes les pages.
- **Webhooks entrants** : les événements utilisateur sont poussés vers MessagingMe via des incoming webhooks (POST JSON).

| Événement | Webhook URL | Déclenché depuis | Payload |
|---|---|---|---|
| Inscription | `iwh/25a2bb855e30cf49b1fc2aac9697478c` | `Register.tsx` | email, phone, first_name, last_name, accept_commercial, source, registered_at |
| Newsletter | `iwh/fa98aca201609862553a50cbdda5b8db` | `/api/newsletter.ts` | email, source, subscribed_at |

### SMTP OVH

- **Adresse** : `contact@verifiermondevis.fr`
- **Serveur** : `ssl0.ovh.net`, port 587 (STARTTLS)
- **Usage** : envoi d'emails marketing/transactionnels depuis MessagingMe (enquêtes satisfaction, newsletters)

### Web3Forms

Formulaire de contact serverless (pas de backend nécessaire). POST vers `api.web3forms.com/submit`.
- **Clé** : `0bdbe892-3eef-4a5e-9915-87d190d6e145`
- **Formulaire classique** : nom, email, catégorie, message → `/contact?success=true`
- **Enquête satisfaction** : `/contact?rating=X&user=email` → envoi automatique de la note via Web3Forms + page de remerciement

### Templates email

| Fichier | Usage | Variables |
|---|---|---|
| `emails/enquete-satisfaction.html` | Enquête satisfaction (5 smileys cliquables) | `{{first_name}}`, `{{email}}`, `{{unsubscribe_url}}` |

---

## 15. Configuration

### `astro.config.mjs`

```javascript
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://verifiermondevis.fr',
  integrations: [react(), tailwind({ applyBaseStyles: false }), sitemap()],
  output: 'static',                    // SSG par défaut
  adapter: vercel(),                   // Adapter Vercel (SSR pour pages prerender=false)
  vite: {
    resolve: { alias: { '@': '/src' } }, // Alias d'import
  },
});
```

### `tsconfig.json`

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

### Alias d'import

Tous les imports utilisent l'alias `@/` qui pointe vers `src/` :
```typescript
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
```

---

## 16. Déploiement

### Build de production

```bash
npm run build
```

Produit un dossier `dist/` contenant :
- Pages statiques pré-rendues (HTML)
- Fonctions serverless Vercel pour les pages dynamiques (`prerender = false`)
- Assets optimisés (JS, CSS, images)

### Hébergement

Le projet utilise l'adapter `@astrojs/vercel`. Il est déployé sur **Vercel** avec support natif Astro (pages statiques + fonctions serverless pour les routes dynamiques et API routes).

### Variables d'environnement en production

Les variables `VITE_*` et `PUBLIC_*` doivent être définies au moment du build (elles sont inlinées dans le JS client).

Les secrets des edge functions sont configurés dans le dashboard Supabase.

### CI — workflows GitHub Actions

Définis dans `.github/workflows/` :

- **`supabase-types-drift.yml`** — vérifie que `src/integrations/supabase/types.ts` est à jour avec le schéma Supabase distant. Tourne sur chaque PR qui modifie `supabase/migrations/**` ou `types.ts`. Sans ce check, une migration qui ajoute une colonne peut être déployée sans régénérer `types.ts` → la TS compile mais les nouveaux champs sont invisibles côté code (silently `undefined`). Pré-requis : secret repo `SUPABASE_ACCESS_TOKEN` (token personnel généré via https://supabase.com/dashboard/account/tokens). Si la check fail, régénérer localement : `npx supabase gen types typescript --project-id vhrhgsqxwvouswjaiczn > src/integrations/supabase/types.ts`.

- **`seo-agent.yml`** — agent SEO (analyse périodique).

### Health check ops

`/api/health` (cf. § 6 API Routes) — endpoint à brancher sur un monitoring externe (UptimeRobot, BetterUptime, Vercel monitoring) pour alerter en cas de panne Supabase ou variable d'env manquante.

---

## 17. Patterns et conventions

### Langue

- **Interface** : Français (textes, labels, messages d'erreur)
- **Code** : Anglais (noms de variables, composants, fonctions)

### Nommage

| Élément | Convention | Exemple |
|---|---|---|
| Composants React | PascalCase | `BlockEntreprise.tsx` |
| Fichiers utilitaires | camelCase | `workTypeReferentiel.ts` |
| Pages Astro | kebab-case | `tableau-de-bord.astro` |
| Variables CSS | kebab-case | `--score-green` |
| Classes Tailwind | kebab-case | `text-primary-foreground` |

### Composants

- **Fonctionnels uniquement** (pas de classes React)
- **Hooks** pour la logique d'état et d'effet
- **Props typées** avec TypeScript interfaces
- **Pas de prop drilling excessif** — les composants pages gèrent l'état principal

### Notifications

```typescript
import { toast } from "sonner";

toast.success("Connexion réussie !");
toast.error("Email ou mot de passe incorrect");
toast.info("Analyse en cours...");
```

### Icônes

Uniquement **Lucide React** :
```typescript
import { Shield, ArrowRight, CheckCircle2 } from "lucide-react";
```

### CSS

Uniquement **Tailwind CSS** — pas de CSS modules ni de styled-components.

Utilitaire `cn()` pour merger des classes conditionnelles :
```typescript
import { cn } from "@/lib/utils";
<div className={cn("base-class", isActive && "active-class")} />
```

### Formulaires

**React Hook Form** + **Zod** pour la validation :
```typescript
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
```

### Data fetching

**TanStack React Query** pour le cache et les requêtes :
```typescript
const { data, isLoading } = useQuery({
  queryKey: ['analyses'],
  queryFn: () => supabase.from('analyses').select('*'),
});
```

---

## 18. Guide de développement

### Ajouter un nouveau composant UI

Utiliser la CLI shadcn pour ajouter des composants :
```bash
npx shadcn-ui@latest add [component-name]
```

Ne **pas** modifier manuellement les fichiers dans `src/components/ui/`.

### Ajouter une nouvelle page

Voir la section dans [CLAUDE.md](./CLAUDE.md#ajouter-une-nouvelle-page) pour le guide étape par étape.

### Ajouter un nouveau bloc d'analyse

1. Créer le composant dans `src/components/analysis/BlockNouvelElement.tsx`
2. Ajouter la fonction de filtre dans `src/components/analysis/index.ts`
3. Intégrer dans `AnalysisResult.tsx`

### Ajouter une edge function

1. Créer le dossier `supabase/functions/nom-fonction/`
2. Créer `index.ts` avec le handler Deno
3. Déployer via `supabase functions deploy nom-fonction`
4. Configurer les secrets via le dashboard Supabase

### Modifier le schéma DB

1. Modifier via le dashboard Supabase (SQL Editor)
2. Régénérer les types : `npx supabase gen types typescript --project-id=xxx > src/integrations/supabase/types.ts`
3. Mettre à jour les composants qui utilisent les nouveaux champs

---

## 19. Dépannage

### Le bouton de connexion ne fonctionne pas

**Cause** : Composant React passé comme enfant (slot) d'un autre composant React dans un fichier `.astro` avec `client:only`. Le composant enfant est rendu en HTML statique sans event handlers.

**Solution** : Utiliser les wrappers dans `src/components/app/`. Voir le pattern dans [CLAUDE.md](./CLAUDE.md).

### La page affiche du contenu mais rien n'est interactif

**Même cause** que ci-dessus. Le HTML est affiché mais React n'a pas attaché les event handlers.

### Erreur "supabase is not defined" ou connexion échoue

**Vérifier** : Les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` sont définies dans `.env`. Redémarrer le serveur dev après modification du `.env`.

### L'analyse reste bloquée en "processing"

**Vérifier** :
1. Les secrets des edge functions sont configurés dans le dashboard Supabase
2. La edge function `analyze-quote` n'a pas de timeout
3. Les APIs tierces (Pappers, Gemini) sont accessibles

### Les styles ne s'appliquent pas

**Vérifier** : Le fichier `src/index.css` est bien importé dans le layout. Les variables CSS `--primary`, `--background`, etc. sont définies.

### Page 404 sur une route dynamique

**Vérifier** : La page `.astro` a bien `export const prerender = false` dans le frontmatter.

### Le PDF ne se génère pas

**Vérifier** : jsPDF est correctement importé. Le composant a accès aux données d'analyse complètes.

---

## 20. Cockpit chantier — vue d'ensemble

Module de gestion de projet de travaux avec génération IA. Permet à un particulier de créer, piloter et suivre un chantier de A à Z.

> Le cockpit chantier est désormais le **produit principal** (GérerMonChantier) — VMD reste le lead magnet. Cette section et les suivantes (§ 20-27) couvrent l'architecture cockpit. Pour les concepts purement analyse de devis, voir § 1-19.

### Vue d'ensemble du flux

```
Choix du mode (guided/flexible/investor)
  → Description projet (texte libre)
    → Qualification IA (4-5 questions Gemini)
      → Génération plan complet (edge function chantier-generer)
        → Cockpit chantier (budget, planning, lots, documents, messagerie, assistant IA)
```

### Modes de projet (`project_mode`)

3 modes de gestion disponibles, choisis à la création du chantier (`ScreenModeSelection`) :

- **Guidé** (`guided`) : mode pédagogique pas-à-pas, conseils détaillés, idéal débutants
- **Flexible** (`flexible`) : mode libre, dashboard complet, pour utilisateurs expérimentés
- **Investisseur** (`investor`) : focus trésorerie et rentabilité, métriques financières

Le mode est stocké dans `chantiers.project_mode` (TEXT, nullable pour rétrocompatibilité). Il conditionne l'affichage des conseils et l'UI du dashboard.

### Flux utilisateur de création

1. **Mode** (`ScreenModeSelection`) : choix du mode de gestion (guided/flexible/investor)
2. **Saisie** (`ScreenPrompt`) : l'utilisateur décrit son projet en texte libre ou via formulaire guidé
3. **Qualification** (`ScreenQualification`) : Gemini génère 4-5 questions contextuelles (budget, date, localisation, surfaces…). 3 questions fixes sont injectées si non détectées dans la description (budget_tranche, date_debut, code_postal)
4. **Génération** (`ScreenGenerating`) : appel edge function `chantier-generer` → plan complet JSON
5. **Wow** (`ScreenWow`) : affichage animé des stats (budget, durée, artisans, formalités)
6. **Sauvegarde** (`/api/chantier/sauvegarder`) : persiste en base (chantiers + lots_chantier + todo_chantier)
7. **Cockpit** (`ChantierCockpit`) : pilotage complet du chantier

### Sections du cockpit

`ChantierCockpit.tsx` (orchestrateur) route entre 9 onglets via la sidebar :

- **Accueil** (`DashboardHome`) : cockpit refondu (design GMC navy/crème) — header, stepper de démarrage, 3 quick actions, bulle Planning + panneau Intervenants (cartes `ProCard`), carte budget + tuiles À régler/À traiter + alerte IA
- **Budget & Trésorerie** (`tresorerie/TresoreriePanel`) : 4 onglets internes — Budget · Trésorerie · Échéancier · Preuves de financement (cf. § 21)
- **Planning** (`PlanningChantier` + `planning/PlanningTimeline`) : Gantt drag/resize avec dépendances DAG (cf. § 22)
- **Documents** (`documents/DocumentsView`) : upload, analyse, classement (cf. § 24)
- **Contacts** (`contacts/ContactsSection`) : intervenants, artisans, rôles
- **Messagerie** (`messagerie/MessagerieSection`) : email + WhatsApp multi-groupes (cf. § 25)
- **Journal** (`assistant/JournalChantierSection`) : digest quotidien IA (cf. § 26)
- **Assistant chantier** (`assistant/AssistantTriPane`) : 3 colonnes alertes/chat/décisions (cf. § 26)
- **Paramètres** (`UserCoordonnees`) : coordonnées utilisateur

### Cockpit — composants orchestrateurs racine

Vivent à `src/components/chantier/cockpit/` (racine, pas dans un sous-dossier domaine) :

- **`ChantierCockpit.tsx`** : orchestrateur principal — state global du chantier (`result`, `documents`, `chantierId`, `token`), routing entre `activeSection`, gestion des modals (upload, ajout intervenant, chat drawer). Anciennement `DashboardUnified` (renommé 2026-05-08).
- **`Sidebar.tsx`** : navigation gauche navy, logo cliquable, sections, badges (`navBadges`), carte profil → menu.
- **`DashboardHome.tsx`** : vue Accueil refondue (design GMC) — composants `PlanningBubble` + `ProCard` (cartes intervenant) + carte budget/tuiles. Styles dans `src/styles/cockpit-refonte.css` (classes `cr-*` scopées `.gmc-cockpit`). Reçoit le budget réconcilié (`BudgetSnapshot`) depuis `ChantierCockpit` ; fetch lui-même le planning pour la bulle.
- **`PageHeader.tsx`** : header de page partagé.
- **`useInsights.ts`** : hook legacy d'alertes Gemini MOE (à migrer vers `agent_insights` — cf. WIP).

### Cohérence badges sidebar (règle absolue, 2026-05-08)

Chaque badge ⚠ N pointe vers l'onglet où l'action se résout. **Ne pas réutiliser un compteur global sur un onglet qui n'expose pas le contenu correspondant** — c'était le bug d'origine, le badge `assistant` pointait vers un onglet sans contenu lié.

| Onglet | Compteur | Source |
|---|---|---|
| `documents` | `documents.length` | nombre total de documents présents |
| `tresorerie` | `factureActions` | factures avec `a_payer > 0` (reste à régler réconcilié, paiements Échéancier déduits) |
| `messagerie` | `msgUnread` | messages non lus |
| `assistant` | `agentInsights.unreadCount` | alertes IA non lues (rouge si critical) |
| `urgentActions = factureActions + devisActions` | KPI home "À traiter" uniquement |

### Accueil refondu — composants (design GMC, 2026-05-16/17)

- **3 quick actions** (`cr-quick-row`) : Enregistrer un paiement → `PaiementDrawer` · Ajouter un devis ou facture → `onAddDoc` · Ajouter un artisan → `onAddIntervenant`.
- **Stepper de démarrage** : N/4 étapes (chantier / 1er artisan / 1er devis / budget), masqué une fois complet.
- **`PlanningBubble`** : flèche temporelle début→fin + jalons RDV, cliquable → onglet Planning ; CTA "Définir le planning" si pas de dates.
- **`ProCard`** : carte intervenant = métier + état + dernière action + date. Clic → détail lot.
- **Tuile "À régler"** cliquable → Budget filtré "À payer" (`sessionStorage.cockpitBudgetFilter`). **Tuile "À traiter"** → popover liste (factures + devis).

### Sidebar — Menu allégé (2026-05-06)

- Suppression du groupe "Devis & Finances" (doublon avec homepage)
- `documents` intégré dans le groupe "Projet" (entre Planning et les items Équipe)
- Import `FileSearch` retiré

### Types principaux (`types/chantier-ia.ts`)

- `ChantierIAResult` : résultat complet de la génération IA (nom, budget, roadmap, artisans, formalités, tâches, aides, lots, estimationSignaux)
- `LotChantier` : lot de travaux avec prix de référence (job_type → market_prices)
- `EstimationSignaux` : signaux de fiabilité (hasLocalisation, hasBudget, hasDate, hasSurface, typeProjetPrecis, nbLignesBudget)
- `TypeProjet` : enum des types (renovation_maison, salle_de_bain, cuisine, extension, terrasse, pergola, isolation, toiture, piscine, electricite, plomberie, autre)
- `PhaseChantier` : phases (idee, preparation, autorisations, travaux, finitions, reception, termine)
- `ProjectMode` : mode de gestion ('guided' | 'flexible' | 'investor')

### API Routes chantier — vue d'ensemble

| Route | Méthode | Description | IA |
|---|---|---|---|
| `/api/chantier` | GET | Liste chantiers de l'utilisateur + devis associés | Non |
| `/api/chantier` | POST | Création manuelle d'un chantier | Non |
| `/api/chantier/:id` | GET | Détail complet (meta, lots, todos, documents) | Non |
| `/api/chantier/:id` | PATCH | Mise à jour (phase, budget, meta) | Non |
| `/api/chantier/:id` | DELETE | Suppression chantier + lots + todos + documents | Non |
| `/api/chantier/generer` | POST | Proxy vers edge function chantier-generer | Gemini |
| `/api/chantier/qualifier` | POST | Questions contextuelles pour qualification | Gemini |
| `/api/chantier/sauvegarder` | POST | Sauvegarde résultat IA → DB (chantiers + lots + todos) | Non |
| `/api/chantier/ameliorer` | POST | Amélioration IA d'un chantier existant | Gemini |
| `/api/chantier/conseils` | POST | Conseils maître d'œuvre (3-5 conseils typés) | Gemini |
| `/api/chantier/synthese` | POST | Synthèse courte du chantier (3 phrases max) | Gemini |
| `/api/chantier/materiaux` | POST | Génération 3 options matériaux pour une étape | Gemini |
| `/api/portfolio/summary` | GET | Portefeuille Multi : résumé léger par chantier (budget + planning), fan-out interne | Non (gate Multi) |
| `/api/portfolio/contacts` | GET | Portefeuille Multi : annuaire unifié + conflits de ressources | Non (gate Multi) |
| `/api/portfolio/cashflow` | GET | Portefeuille Multi : projection trésorerie mensuelle (fan-out payment-events) | Non (gate Multi) |

**Portefeuille multi-chantier (offre Multi, lecture seule)** : les 3 routes `/api/portfolio/*` réutilisent les moteurs existants via **fan-out HTTP interne plafonné** (`originFromRequest` + Bearer forwardé), jamais de recalcul de KPI. Gate serveur `getPortfolioAccess` (alias de `getAdvancedPlanningAccess` : admin + allowlist GMC + abonné Multi) dans `src/lib/auth/portfolioAccess.ts`. Logique pure testée : `src/lib/chantier/portfolio{Summary,Conflicts,Timeline,Cashflow}.ts` (+ tests Vitest). UI : `src/pages/mon-chantier/portefeuille.astro` → `PortefeuillePage.tsx`.

Routes spécialisées (documents, lots, devis, planning, payment-events, assistant…) couvertes dans les sections dédiées (§ 21-26).

---

## 21. Budget & Trésorerie

L'écran financier du cockpit. Onglet `Budget & Trésorerie` rendu par `tresorerie/TresoreriePanel.tsx` avec 4 sous-onglets : **Budget** (BudgetTab) · **Trésorerie** (TresorerieView) · **Échéancier** (Echeancier) · **Preuves** (FinancementTab).

### BudgetTresorerie — 12 sous-composants

`tresorerie/BudgetTresorerie.tsx` orchestre l'écran financier. Sous-composants dans `cockpit/budget/` :

| Composant | Rôle |
|---|---|
| `BudgetAffinageModal` | Modal d'affinage budget (questions par corps de métier) |
| `BudgetGauge` | Jauge visuelle budget consommé/restant |
| `LotBreakdown` | Détail budget par lot |
| `AlertesIA` | Alertes générées par l'IA sur le budget |
| `TresoreriePhases` | Trésorerie par phase de chantier |
| `FacturesPaiements` | Suivi factures et paiements |
| `QuickActions` | Actions rapides budget |
| `ProjectHeader` | En-tête projet avec infos clés |
| `ReliabilityBadge` | Badge fiabilité estimation |
| `BudgetComparaison` | Comparaison budget initial vs réel |
| `BudgetExplication` | Explication détaillée du budget IA |
| `BudgetKpiCard` | Carte KPI budget (réutilisable) |

Données partagées :
- `src/lib/chantier/budgetAffinageData.ts` — `ELEMENT_DEFS`, `TRADE_QUESTION_DEFS`, `computeRefinedRange()`, `computeScore()` (pure TS, extrait du monolithe `BudgetTresorerie`)
- `src/lib/chantier/budgetHelpers.ts` — `fmtK()`, `fmtFull()`, `PHASE_LABELS`, `PHASE_COLORS`

### Architecture cashflow — VIEW dérivée + 2 sources

Refactorée en 5 PRs (avril 2026) pour éliminer la désynchronisation entre Budget, Échéancier et Trésorerie. Avant : 3 voies de saisie créaient 3 objets différents (`payment_events` legacy, doublons potentiels, statuts incohérents). Après : sources distinctes par usage + une VIEW de lecture unique.

#### Modèle

```
documents_chantier (devis, facture, ticket, frais)
  ├─ cashflow_terms JSONB (array de versements)
  └─ depense_type IN ('frais','ticket_caisse') → event auto-paid

cashflow_extras (mouvements sans pièce — déblocage crédit, apport)
  └─ funding_source_id → chantier_entrees

       ↓ UNION ALL ↓

VIEW payment_events_v (consommée par Échéancier / Trésorerie / Budget API)
```

#### Tables

**`cashflow_extras`** (créée PR1) — mouvements financiers purs sans pièce justificative.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `project_id` | uuid | FK chantiers ON DELETE CASCADE |
| `label` | text | NOT NULL, length > 0 |
| `amount` | numeric(12,2) | NOT NULL, > 0 |
| `due_date` | date | NOT NULL |
| `status` | text | pending / paid / late / cancelled |
| `paid_at` | timestamptz | Auto-set par trigger au passage status=paid (reset si revert) |
| `funding_source_id` | uuid | FK chantier_entrees ON DELETE SET NULL |
| `financing_source` | text | apport / credit / maprime / cee / eco_ptz / mixte (legacy, non utilisé) |
| `notes` | text | — |
| `created_by` | uuid | Auto-rempli par trigger BEFORE INSERT depuis auth.uid() |

Triggers : `updated_at`, `created_by`, `paid_at`. RLS via `(select auth.uid())` wrapper.

**`documents_chantier.cashflow_terms`** (ajoutée PR2) — array JSONB de versements dérivés du devis/facture.

```json
[
  { "event_id": "uuid", "amount": 3000, "due_date": "2026-05-01", "status": "pending", "label": "Acompte 30%" },
  { "event_id": "uuid", "amount": 7000, "due_date": "2026-06-30", "status": "pending", "label": "Solde 70%" }
]
```

CHECK constraint `jsonb_typeof(cashflow_terms) = 'array'`. Le `event_id` est un UUID stable identifiant chaque versement (utilisé comme `id` dans la VIEW pour permettre PATCH/DELETE 1:1).

#### VIEW `payment_events_v`

3 branches en UNION ALL :

1. **Frais & ticket_caisse auto-paid** : 1 row par doc avec `depense_type IN ('frais','ticket_caisse')`. `id = uuid_generate_v5(uuid_ns_url(), 'cashflow:{doc.id}:auto')`, `status='paid'`, `due_date=created_at::date`. Non modifiable directement (PATCH/DELETE renvoient 422).
2. **Versements documents** : explose `cashflow_terms` array. `id = (term->>'event_id')::uuid`, `term_index = idx-1`, `source_id = doc.id`. Filter `jsonb_array_length > 0` pour masquer les devis remplacés par une facture (override implicite via `cashflow_terms = []`).
3. **Mouvements manuels** : pull-through de `cashflow_extras` (filter `status != 'cancelled'`). `source_id = null`, `term_index = null`, `lot_id = null` (extras sont globaux au chantier).

Colonnes exposées : `id, project_id, source_type ('devis'|'facture'|'manuel'|'frais'), source_id, term_index, lot_id, amount, due_date, status, label, funding_source_id, origin ('document'|'extra'), created_at`.

### Voies de saisie unifiées (refacto 2026-05-09 — Option 2)

**Règle absolue** : 1 seul chemin de saisie utilisateur pour les dépenses → `DepenseRapideModal` du Budget. Plus de désync architecture-level. Statut auto-dérivé par la VIEW depuis depense_type + facture_statut + cashflow_terms.

| Voie | Cible | Visible Budget | Visible Échéancier |
|---|---|---|---|
| Agent IA `register_expense` (frais déclaré) | `documents_chantier` `depense_type='frais'` | ✅ alwaysPaid | ✅ via VIEW branche 1 |
| UI `+ Dépense` Budget OU Échéancier → `DepenseRapideModal` | `documents_chantier` `depense_type='ticket_caisse'\|'achat_materiaux'\|'frais'` | ✅ | ✅ via VIEW branche 1 |
| UI `+ Document > Achat/Ticket` (AddDocumentModal) | `documents_chantier` `depense_type='ticket_caisse'\|'achat_materiaux'` | ✅ | ✅ via cashflow_terms (si analyse) |
| Devis upload (analyze-quote edge fn) | `documents_chantier.cashflow_terms` (array) | ✅ | ✅ N versements |
| Facture upload | `documents_chantier.cashflow_terms` + override parent_devis | ✅ | ✅ remplace devis |
| Agent IA `add_payment_event` (mouvement global, e.g. apport) | `cashflow_extras` | ❌ par design | ✅ via VIEW branche 3 |

**Suppression** : l'ancienne `AddDepenseModal` (POST `/payment-events` `manuel: true` → cashflow_extras orphelins) supprimée. Le bouton `+ Dépense` Échéancier ouvre désormais le `DepenseRapideModal` du Budget (lots fetchés lazy via `/api/chantier/[id]/lots`).

**Synchro inter-écran via `chantierBudgetChanged`** : `BudgetTab.useBudgetData.refresh` dispatche un `CustomEvent('chantierBudgetChanged')` après chaque load. `Echeancier` et `BudgetTab` écoutent et re-fetch → saisie dans Échéancier visible immédiatement dans Budget sans reload.

### Bug A — `acompte_pending` séparé (2026-05-09)

**Règle** : un acompte versé sur un devis non signé alimente `totaux.acompte_pending`, **pas** `totaux.acompte`. Le KPI Décaissé ne compte que `acompte` (= devis signés). Le `acompte_pending` est exposé en bannière orange dédiée dans `BudgetTab` : "X € d'acomptes versés sur des devis non signés — signez le devis pour les inclure dans le suivi".

**Pourquoi** : avant ce fix, les `evDevisPaid` (paiements rattachés au devis via Échéancier) gonflaient le KPI Décaissé même quand le devis n'était pas signé (cas réel : ISO & FACE 64, 43 508 €, faisait passer le KPI à 119% du budget).

**Quand le devis bascule en signé** → les versements migrent automatiquement de `acompte_pending` vers `acompte`. Pas de duplication de données — c'est calculé à la volée par `budget.ts` selon `devis_statut`.

**Ne pas réintroduire le bug** : si on touche `bucket.totaux.acompte` dans `budget.ts`, vérifier que la condition `devis_statut === 'signe' || devis_statut === 'contrat_signe'` est respectée. Sinon → KPI Décaissé faussé.

### Génération des `cashflow_terms`

`src/lib/chantier/paymentEvents.ts` contient le pipeline :
1. `extractConditionsFromAnalyse` : lit `analyses.raw_text` JSON (résultat Gemini)
2. `transformToPaymentEvents` : calcule montants + dates + génère un `event_id = randomUUID()` par event
3. `writeCashflowTermsForDoc` : UPDATE `documents_chantier.cashflow_terms` (REPLACE l'array entier — idempotent)
4. `overridePreviousDevisEvents` (si facture) : vide `cashflow_terms` du devis parent → la VIEW exclut automatiquement

Idempotence par construction (REPLACE de l'array). Non-bloquant en cas d'erreur (logs `[paymentEvents] writeCashflowTerms error`).

### Edge functions impactées

- **`analyze-quote`** (post-extraction) : génère les events inline + écrit `cashflow_terms`. Code dupliqué de `paymentEvents.ts` car edge function ne peut pas importer depuis `src/`.
- **`agent-checks`** : lit `payment_events_v` (CHECK 2 Overdue payments).

### `payment-events.ts` — endpoints (refactor cashflow PR1-PR5)

Lecture sur la VIEW `payment_events_v`. Écriture dual-routée selon `origin` du flux.

- `GET` : retourne `{ payment_events: [...] }` (clé `payment_events`, pas `data`) pour un chantier. La VIEW UNION 3 sources : (1) frais/ticket auto-paid dérivés de `documents_chantier.depense_type`, (2) versements explicites de devis/facture depuis `cashflow_terms`, (3) mouvements manuels de `cashflow_extras`. Champs exposés : `id, project_id, source_type, source_id, term_index, lot_id, amount, due_date, status, label, funding_source_id, origin, created_at` + enrichissements API (`source_name`, `lot_nom`, `artisan_nom`, `proof_doc_*`, `amount_estimate`).
- `POST` :
  - **manuel** (`{ manuel: true, label, amount, dueDate, paid? }`) : INSERT dans `cashflow_extras` avec UUID partagé (re-fetch via la VIEW pour la réponse).
  - **analyse** (`{ analyseId, sourceType, sourceId, originalDevisId? }`) : déclenche `generatePaymentEventsFromAnalyse` qui écrit dans `documents_chantier.cashflow_terms`. Si `originalDevisId` fourni pour une facture, vide le `cashflow_terms` du devis parent (override implicite).
- `PATCH` : Body `{ id, status?, amount?, due_date?, label?, funding_source_id? }`.
  - **422** si `source_type='frais'` (modifier le doc parent à la place).
  - Lookup VIEW pour récupérer `origin` + `source_id`/`term_index`.
  - Si `origin='extra'` → UPDATE `cashflow_extras`.
  - Si `origin='document'` → read-modify-write sur `cashflow_terms[term_index]`.
  - **Solde restant** : si `status='paid'` avec `amount < planned×99%`, append/update un term "Solde restant — …" dans `cashflow_terms`. Si retour à `pending`, le term Solde restant est filtré.
- `DELETE` : Body `{ id }`. Refuse 422 pour les frais. Sinon DELETE `cashflow_extras` OU retire le term de `cashflow_terms`.

### TresorerieView

`components/chantier/cockpit/tresorerie/TresorerieView.tsx` (1093 lignes) — onglet "Trésorerie" dans `TresoreriePanel`. Données chargées depuis `/api/chantier/[id]/budget`.

#### 2 sections actives

- **Plan de financement** — grande jauge colorée + 3 cartes : Apport (`#6366f1`), Crédit (`#f97316`), Aides (`#10b981`). Config persistée en localStorage avec sync serveur via PATCH `metadonnees`.
- **Consommation par source** — 3 donuts restants + barres artisans. Sous-composant `ArtisanPaymentDetail` extrait en accordéon (replié par défaut, doublon avec `BudgetTab`). Icône chevron animé (rotate-180 à l'ouverture).

> **Section supprimée (2026-05-05)** : la section "Projection trésorerie" (graphique SVG multi-courbes par artisan + 3 cartes insights) a été entièrement retirée de `TresorerieView`.

#### Hooks internes

| Hook | Source | Description |
|---|---|---|
| `useBudget(chantierId, token)` | interne | Fetch `/api/chantier/[id]/budget` |
| `useFinancingConfig(chantierId, token, initial)` | interne | localStorage `tresorerie_v3_{chantierId}` + `budget_reel_{chantierId}`, sync PATCH metadonnees |

#### Lib associée (`src/lib/chantier/financingUtils.ts`)

| Export | Type | Description |
|---|---|---|
| `fmtEur` | fonction | Formatage montant en euros |
| `WORK_TYPES_EFFY` | constante | Types de travaux éligibles Effy |
| `detectBracket` | fonction | Détection tranche revenus MPR |
| `MPR_RATES` | constante | Taux d'aide MaPrimeRénov' par tranche |
| `MPR_CAP` | constante | Plafonds MPR |
| `CEE_AMOUNT` | constante | Montants forfaitaires CEE |
| `EffyWorkType` | type | Union des types de travaux Effy |
| `MprBracket` | type | Union des tranches de revenus MPR |

### Echeancier — Registre en accordéon + filtres (2026-05-06)

`tresorerie/Echeancier.tsx` (anciennement `EcheancierRefonte.tsx`, renommé 2026-05-08). Le tableau "Registre des paiements effectués" est dans un accordéon `PaidEventsAccordion` (replié par défaut). Quand ouvert : 2 filtres au-dessus de la liste — sélecteur artisan (`filterArtisan`) + sélecteur tri (`PaidSort` : `date_desc | date_asc | amount_desc | amount_asc`). Mobile-first : filtres full-width en flex-wrap.

### AddDocumentModal et DepenseRapideModal

#### `AddDocumentModal` (`cockpit/documents/AddDocumentModal.tsx`)

Modal d'ajout de document avec deux modes :
- **Upload fichier classique** — sélection + upload vers bucket `chantier-documents`
- **Dépense rapide sans fichier** — délègue à `DepenseRapideModal`

#### `DepenseRapideModal` (`cockpit/budget/DepenseRapideModal.tsx`)

Modal pour enregistrer une dépense sans fichier attaché.

| Champ | Valeurs possibles |
|---|---|
| `documentType` (type de dépense) | `facture` \| `ticket_caisse` \| `achat_materiaux` \| `frais` |
| `factureStatut` (statut) | `recue` \| `payee` \| `payee_partiellement` \| `en_litige` |

**Règles de gestion par `depense_type` dans `budget.ts`** :
- `ticket_caisse`, `achat_materiaux`, `frais` → toujours comptés en `paye` quelle que soit la valeur de `facture_statut` (jamais en `a_payer`).
- Ces trois types n'ont pas de devis par définition → exclus de l'alerte "Devis manquant" ET de l'alerte "Facture manquante" (constante `SANS_DEVIS_TYPES` dans `BudgetTab.tsx`).
- UI : affichage d'un badge "Payé" statique sans dropdown de changement de statut.

### Catégorie `frais` (déclarations sans pièce jointe)

Distinction sémantique entre tickets/factures (avec pièce uploadable) et frais déclarés au chat (sans justificatif).

**DB** :
- `documents_chantier.depense_type` CHECK étendu : `facture | ticket_caisse | achat_materiaux | frais`
- Migration `20260423150000_add_frais_depense_type.sql`
- Type TS : `DepenseType = 'facture' | 'ticket_caisse' | 'achat_materiaux' | 'frais'`

**Backend** :
- `POST /api/chantier/[id]/documents/depense-rapide` accepte agent auth
- Validation : `VALID_DEPENSE_TYPES` inclut `'frais'`

**Tool agent** :
- `register_expense` défaut `'frais'`
- Si `lot_name` fourni : `ilike('nom', lot_name)` puis fallback `POST /lots` (auto-inférence durée + deps)
- Prompt : agent demande "pour quel lot ?" si non précisé. Fallback `lot_name="Divers"` → crée/réutilise le lot Divers.

**UI** :
- `FacturesPaiements.tsx` : icône StickyNote ambre, label "Frais déclarés le JJ/MM", badge figé "Déclaré" (pas de dropdown statut)
- `LotDetail.tsx` : section ambre "Frais annexes déclarés" sous Devis & Factures
- `IntervenantsListView.tsx` : chip ambre "📝 X€" dans la colonne nb devis
- `LotIntervenantCard.tsx` : badge ambre "📝 X€ frais" à côté de devis/photos
- `AnalyseDevisSection.tsx` : section ambre "Frais annexes déclarés" sous chaque card lot
- `DocumentsView.tsx` : section "Frais déclarés" (📝 ambre) ouverte par défaut
- `documentFilters.ts` : `getFraisDeclares()`, `getDevisEtFactures()` exclut désormais les frais
- `BudgetTab.tsx` : `noDevis` ignore les frais → un lot avec un frais seul ne déclenche plus "Devis manquant"
- `BudgetTab.tsx` — colonne PAYÉ : quand `isSolde` (totalPaye ≥ budget), le montant s'affiche en vert "réglé" quelle que soit la source (acompte ou facture payée).
- `BudgetTab.tsx` — alerte "Facture manquante" : badge ambre ⚠ dans la cellule artisan quand : artisan a un devis validé (devis_valides > 0) ET pas de facture réelle (hors `ticket_caisse`/`achat_materiaux`/`frais`) ET non soldé. Cliquable pour ouvrir le modal d'ajout de document.

### Fiabilité de l'estimation (`BudgetFiabilite`)

L'indicateur de fiabilité est calculé côté edge function à partir de signaux factuels (aucune IA) :
- **hasLocalisation** : zone géo connue → prix ajustés
- **hasBudget** : budget cible renseigné → calibrage
- **hasDate** : date de début → roadmap temporelle
- **hasSurface** : dimensions détectées → quantités précises
- **typeProjetPrecis** : type ≠ "autre" → prix catalogue pertinents
- **nbLignesBudget** : ≥ 4 lignes → budget détaillé

Score affiché en pourcentage avec libellé (Estimation approximative → Estimation fiable → Estimation très détaillée).

### Migrations 2026-04-03

#### `20260403120000_add_menuiserie_accessoires.sql`

3 nouveaux prix dans `market_prices` :

| `job_type` | Label | Unité | Prix min–max HT |
|---|---|---|---|
| `grille_entree_air` | Grille d'entrée d'air auto-réglable | unité | 14–45 € |
| `mortaise_grille_ventilation` | Mortaise menuiserie existante + grille | forfait | 60–180 € |
| `differentiel_disjoncteur_lot` | Lot différentiel 30mA + disjoncteur | forfait | 100–280 € |

#### `20260403130000_add_work_type_distribution_view.sql`

Vue `admin_kpis_work_type_distribution` : répartition des types de travaux analysés (exclut 2 comptes admin), dominant type par analyse, top 30.

#### `20260403140000_add_facture_statut_litige.sql`

Table `documents_chantier` :
- Contrainte `facture_statut` mise à jour : ajout de `'en_litige'` (existaient déjà `recue` / `payee` / `payee_partiellement`)
- Nouvelle colonne `depense_type TEXT DEFAULT 'facture'` CHECK (`facture` | `ticket_caisse` | `achat_materiaux`)

### Fichier de tracking refactor

`CASHFLOW-REFACTOR.md` à la racine — log d'exécution PR1→PR5 (à supprimer après stabilisation des tests E2E).

---

## 22. Planning CPM (Critical Path Method)

Planification temporelle des lots de chantier avec vue Gantt drag/resize. Modèle **DAG multi-parent** standard MS Project / Primavera, remplace l'ancien `ordre_planning` linéaire.

### Source de vérité (BDD)

- `lots_chantier.duree_jours` — durée en jours ouvrés
- `lots_chantier.delai_avant_jours` — délai avant démarrage (décalage sans cascade)
- `lots_chantier.lane_index` — lane visuelle explicite (0 = main, 1+ = side lanes, NULL = first-fit)
- `lot_dependencies (lot_id, depends_on_id)` — arêtes du DAG (Finish-to-Start, multi-parent)

### Dérivé (recalculé, non stocké)

- `date_debut` / `date_fin` — recomputés par `computePlanningDates` (`src/lib/chantier/planningUtils.ts`)
- Lanes visuelles — first-fit par date avec préférence pour `lane_index` si défini

### Algo `computePlanningDates`

1. Tri topologique Kahn sur le DAG (prédécesseurs en premier)
2. Forward pass : `date_debut = max(startDate, max(dep.date_fin)) + addBusinessDays(delai_avant_jours)`, `date_fin = addBusinessDays(date_debut, duree_jours)`
3. Cycles gérés gracieusement (lots restants placés à startDate)

### Flux modifications

- D&D utilisateur (`PlanningTimeline.handleLotMoveWithLane`) : drop sur ghost row → indépendant ; drop sur lane existante → predecessor = dernier lot dont le centre ≤ drop X. Transfert auto : quand X bouge, ses ex-successeurs perdent X et héritent des ex-prédécesseurs de X. Position visuelle convertie en `delai_avant_jours` (jours ouvrés depuis predecessor.date_fin OU startDate).
- Race conditions : `usePlanning.reqSeqRef` ignore les réponses périmées (l'optimiste local reste, la réponse la plus récente écrase).

### API routes

- `GET /api/chantier/[id]/planning` → `{ dateDebutChantier, dateFinSouhaitee, lots, dependencies }`
- `PATCH /api/chantier/[id]/planning` → recompute global CPM ; accepte/renvoie `dateDebutChantier` + `dateFinSouhaitee` (objectif persistant)
- `POST /api/chantier/[id]/planning/shift-lot` → `{ lot_id, jours, cascade, raison }`
- `DELETE /api/chantier/[id]/lots/[lotId]` → cascade : transfert deps (A→X→B avec X supprimé → A→B) + recompute
- `POST /api/chantier/[id]/lots` → `inferDefaultPredecessors` basé sur TRADE_DURATIONS métier

### Migrations clés

- `20260329120000_add_planning_columns.sql` (originale) — `lots_chantier` : `duree_jours INT`, `date_debut DATE`, `date_fin DATE`, `ordre_planning INT`, `parallel_group INT` ; `chantiers.date_debut_chantier DATE` ; index `idx_lots_planning ON lots_chantier(chantier_id, ordre_planning)`
- `20260422230000_lot_dependencies_cpm.sql` — création table + backfill depuis dates existantes (A.fin = B.debut ⇒ A → B)
- `20260423090000_lot_lane_index.sql` — colonne `lane_index`
- `20260422220000_lots_chantier_delai_avant_jours.sql` — colonne `delai_avant_jours`

### Lib partagée (`src/lib/chantier/planningUtils.ts`)

| Fonction | Signature | Description |
|---|---|---|
| `addBusinessDays` | `(date, days) → Date` | Ajoute N jours ouvrés (skip weekends) |
| `computePlanningDates` | `(lots, startDate) → lots[]` | Recalcule toutes les dates, gère DAG + parallel_group legacy |
| `computeStartDateFromEnd` | `(lots, endDate) → lots[]` | Calcul inverse depuis date de fin |
| `formatDuration` | `(days) → string` | "2 semaines", "3 jours" |
| `getWeekNumber` | `(date, startDate) → number` | Numéro semaine relative S1, S2… |

### Hook (`src/hooks/usePlanning.ts`)

State : `lots`, `startDate`, `totalWeeks`, `loading`. Actions : `moveLot()`, `updateEndDate()`, `recompute()`. Utilise `setState(s => ...)` pour éviter les stale closures dans les callbacks.

### Composants (`components/chantier/cockpit/planning/`)

- `PlanningTimeline.tsx` — Gantt drag/resize, colonnes hebdomadaires S1..Sn, colonne gauche sticky, scroll horizontal mobile
- `PlanningWidget.tsx` — mini-résumé vue d'ensemble : durée totale, date début→fin, mini-barres colorées, lien "Voir le planning"

### Règles métier

- Ghost row = indépendant (deps vides, pas hériter du partner)
- Drop sur lane existante = chaîne au predecessor. Side lane vide → indépendant.
- Couleur stable : `getLotColor(lot.id)` hash djb2, indépendant de l'ordre
- Lanes (rendu) : pass 1 place les lots avec `lane_index` explicite, pass 2 first-fit pour le reste

### Intégration IA

L'edge function `chantier-generer` génère `duree_jours_estime`, `ordre_planning`, `parallel_group` pour chaque lot. `sauvegarder.ts` stocke ces valeurs et appelle `computePlanningDates()` si `date_debut_chantier` est disponible. L'agent IA peut modifier le planning via `update_planning`, `shift_lot`, `arrange_lot` (cf. § 26).

### Sous-planning avancé (sous-phases — feature premium, 2026-06-08)

Découpe d'un lot en **sous-phases** ordonnançables, avec dépendances **cross-métier** (ex : l'électricité démarre quand la sous-phase « mise en eau » du plombier est finie). Le lot reste l'unité de budget/devis/statut/intervenant ; la sous-phase n'affine QUE l'ordonnancement.

**Tables** (migrations `20260608_001` + `20260608_002`) :
- `lot_subphases` (`id, lot_id FK CASCADE, chantier_id FK CASCADE, nom, ordre, duree_jours, delai_avant_jours, date_debut, date_fin, statut a_faire|en_cours|termine, lane_index`). Dates DÉRIVÉES par le CPM.
- `planning_subphase_deps` — arêtes du graphe avancé, colonnes FK nullables `from_lot_id`/`from_subphase_id`/`to_lot_id`/`to_subphase_id` (exactement une de chaque côté, au moins une sous-phase). Convention : `from` = dépendant, `to` = prédécesseur. `ON DELETE CASCADE` → suppression auto des arêtes.
- RLS dérivée du `lot_id` (ownership via `lots_chantier → chantiers`) + cohérence `chantier_id` + validation des endpoints à l'écriture.

**CPM avancé** (`planningUtils.ts`) :
- `buildAdvancedNodeGraph(lots, subphases, lotDeps, edges)` → graphe de noeuds unifié `lot:<id>`/`sub:<id>` (lot avec sous-phases = conteneur, dates dérivées min/max ; éclatement entrée/sortie pour les arêtes lot↔lot).
- `computeAdvancedPlanning(...)` → dates lots + sous-phases. SANS sous-phase = identique à `computePlanningDates` (test d'équivalence + verrou).
- `computeAdvancedStartDateFromEnd(...)` — variante node-aware de `computeStartDateFromEnd`.
- `hasCycleInNodeDeps(nodeDeps, nodeIds)` — Kahn, utilisé par la garde anti-cycle.
- Tests : `planningUtils.subphases.test.ts` (56 cas).

**Helper serveur** (`src/lib/chantier/planningServer.ts`) : `recomputeChantierDates` (subphase-aware, behavior-preserving sans sous-phase), `loadSubphases`/`loadSubphaseDeps`, `wouldCreateCycle` (même normalisation que le CPM).

**API** (toutes les écritures premium-gated via `requireAdvancedPlanning`) :
- `GET/PATCH /planning` renvoient en plus `subphases` (groupé par lot) + `subphaseDeps`.
- `POST /api/chantier/[id]/lots/[lotId]/subphases` (défaut `duree_jours=1`).
- `PATCH/DELETE /api/chantier/[id]/subphases/[subId]`.
- `POST/DELETE /api/chantier/[id]/subphases/deps` (gardes : cycle 409, lot↔sa-propre-sous-phase, appartenance chantier, doublon 409).

**Habilitation premium** (`src/lib/auth/advancedPlanningAccess.ts`) : `getAdvancedPlanningAccess`/`canUseAdvancedPlanning`/`requireAdvancedPlanning`. V1 = admin + allowlist GMC ; 1 seul `TODO` pour brancher le tier d'abonnement. Endpoint `GET /api/gmc/advanced-planning-access` + hook `useAdvancedPlanningAccess` (UI uniquement). Tests : `advancedPlanningAccess.test.ts` (10 cas).

**Hook** : `usePlanning` expose `subphases`/`subphaseDeps` (type `PlanningEdgeRow` avec `id`) + actions `addSubphase`/`updateSubphase`/`deleteSubphase`/`addSubphaseDep`/`removeSubphaseDep` (non-optimistes : endpoint + refetch silencieux, retournent `{ok,error}`).

**UI** : toggle Simplifié/Avancé dans `PlanningChantier` (cadenas + upsell si non premium, préférence localStorage). Vue avancée = `planning/SubPlanningView.tsx` (timeline % lots + sous-bandes) + `planning/SubphasePanel.tsx` (CRUD + constructeur de dépendances cross-métier). La vue simplifiée `PlanningTimeline` est inchangée.

### PVReceptionModal — Pré-remplissage automatique (2026-05-06)

`lots/PVReceptionModal.tsx` — fetch parallèle (`Promise.all`) au mount :
1. `supabase.auth.getSession()` → `user_metadata` → `mo_nom`, `mo_adresse`
2. `GET /api/chantier/[id]/contacts` → contact `role=entreprise_generale` → `entrepreneur_nom`, `entrepreneur_adresse`, `entrepreneur_siret`
3. `GET /api/chantier/[id]/budget` → devis noms → `contrat_ref`

Tracking des champs auto-remplis via `Set<keyof PVData>` (state `autofilled`). Badge "✓ Pré-rempli" vert sur les champs concernés + fond `bg-emerald-50/40`. La modification manuelle retire le badge.

---

## 23. Lots, intervenants, contacts, formalités

### Catalogue matériaux (`data/MATERIALS_MAP.ts`)

Registre statique de 17 types de chantier avec options matériaux :
- Carrelage, Parquet, Peinture, Salle de bain, Cuisine, Terrasse, Isolation, Toiture, Pergola, Extension, Piscine, Électricité, Plomberie, Rénovation maison, Façade, Menuiseries, Autre
- Chaque type : 3+ options (économique/intermédiaire/premium) avec `priceMin/Max` par unité, tags durabilité/entretien, URLs images
- Auto-détection via `detectChantierType(typeProjet, keywords)` → match par mots-clés
- Option "Autre / Je ne sais pas" ajoutée automatiquement à chaque type

### Hooks matériaux

- **`useMaterialAI.ts`** : détecte les étapes nécessitant un choix matériau → appel `/api/chantier/materiaux` (Gemini) → 3 options générées
- **`useMaterialDetection.ts`** : wrapper React pour `detectChantierType()` (lookup catalogue statique)
- **`useMaterialSuggestions.ts`** : catalogue dynamique de cartes matériaux par type de projet (5 catégories hardcodées : revêtement, terrasse, façade, isolation, salle de bain, toiture)

### Rattachement devis aux lots

3 modes d'ajout de devis depuis un lot (`AjouterDevisModal`, modal 3 tabs) :
1. **Importer depuis mes analyses** : rattache une analyse VerifierMonDevis existante → auto-populate artisan
2. **Uploader un devis** : upload PDF + lance l'analyse VerifierMonDevis + crée `devis_chantier` avec `lot_id`
3. **Saisie manuelle** : prix + coordonnées artisan (accord verbal, sans devis officiel)

**Pont DocumentsSection** : quand un utilisateur uploade un devis via l'onglet Documents et clique "Analyser", un `devis_chantier` est automatiquement créé et rattaché au lot du document.

**Création de lot inline** : partout où un sélecteur de lot apparaît (`LotSelector`), l'utilisateur peut créer un nouveau lot via "+ Créer un lot" (POST `/api/chantier/:id/lots`).

Composants clés :
- `LotSelector.tsx` : dropdown de lots + création inline, réutilisé dans AjouterDevisModal et DocumentsSection
- `AjouterDevisModal.tsx` : modal 3 tabs, pré-sélection lot si ouvert depuis LotCard
- Table `devis_chantier.lot_id` : FK vers `lots_chantier` (ON DELETE SET NULL)

### Comparateur de devis (`ComparateurDevis`)

Compare plusieurs devis rattachés au même lot. Utilise `compareQuotes.ts` pour extraire et aligner les postes de travaux depuis les analyses liées.

### Contacts chantier — colonnes et index supplémentaires

La table `contacts_chantier` a été enrichie :

| Colonne | Type | Comportement | Description |
|---|---|---|---|
| `lot_id` | UUID FK → `lots_chantier` | ON DELETE SET NULL | Lot rattaché au contact |
| `devis_id` | UUID FK | ON DELETE SET NULL | Devis d'origine |
| `analyse_id` | UUID FK | ON DELETE SET NULL | Analyse source |
| `source` | TEXT | CHECK ('manual','devis','facture') | Origine du contact |

Index FK associés : `idx_contacts_lot_id`, `idx_contacts_devis_id`, `idx_contacts_analyse_id`.

### Enrichissement géographique

L'edge function `chantier-generer` enrichit automatiquement le prompt si un code postal est détecté :
1. Détecte le code postal dans les réponses de qualification (ou résout le nom de ville via `geo.api.gouv.fr`)
2. Lookup dans `zones_geographiques` → type_zone + coefficient
3. Injecte dans le prompt : "Zone géographique : grande_ville (coefficient : 1.15)"
4. Gemini ajuste les estimations de budget en conséquence

### Liens formalités (`formalitesLinks.ts`)

Catalogue de ~15 mappings mot-clé → URL officielle .gouv.fr pour les formalités administratives (déclaration préalable, permis de construire, Consuel, DT-DICT, etc.). Chaque entrée contient un lien primaire (formulaire CERFA) et optionnellement un lien secondaire (fiche pratique).

---

## 24. Documents — storage, upload, analyse intra-chantier

### Storage

**Bucket `chantier-documents`** : documents de chantier (privé, user-scoped via RLS). Upload via `/api/chantier/:id/documents`, URLs signées (TTL 1h) pour la lecture.

### API Routes documents

| Méthode | Route | Description |
|---|---|---|
| GET/POST | `/api/chantier/:id/documents` | CRUD documents d'un chantier |
| GET/PATCH/DELETE | `/api/chantier/:id/documents/:docId` | Document individuel (URL signée à la lecture) |
| POST | `/api/chantier/:id/documents/:docId/analyser` | Déclenche analyse d'un document |
| POST | `/api/chantier/:id/documents/extract-invoice` | Extraction Gemini d'une facture uploadée : `artisan_nom`, `montant_total`, `type_facture` (acompte/solde/facture), `pct_acompte`, `date_facture`. Body : `{ bucketPath }`. Non-bloquant, `confidence: 'low'` si échec. Modèle : gemini-2.0-flash, timeout 8s. |
| POST | `/api/chantier/:id/documents/depense-rapide` | Enregistre une dépense rapide sans fichier. Body : `{ nom, documentType, depenseType, montant, factureStatut, lotId?, montantPaye? }` |
| POST | `/api/chantier/:id/documents/register` | Enregistre un document en base après upload storage |

### Modals d'upload

Voir § 21 "AddDocumentModal et DepenseRapideModal" pour le détail. `AddDocumentModal` est dans `cockpit/documents/`, `DepenseRapideModal` dans `cockpit/budget/` (ils sont liés par le mode "dépense rapide sans fichier").

---

## 25. Messagerie & WhatsApp

### WhatsApp multi-groupes

Intégration whapi.cloud pour créer et gérer de vrais groupes WhatsApp depuis le cockpit chantier. N groupes par chantier.

#### Tables

| Table | Colonnes clés | Notes |
|---|---|---|
| `chantier_whatsapp_groups` | `id UUID PK`, `chantier_id UUID FK`, `name TEXT`, `group_jid TEXT UNIQUE`, `invite_link TEXT`, `is_owner_channel BOOLEAN`, `created_at` | Un chantier peut avoir N groupes. `is_owner_channel` flagge le canal privé owner (cf. § 25.3). |
| `chantier_whatsapp_members` | `id UUID PK`, `group_id UUID FK→chantier_whatsapp_groups`, `phone TEXT`, `name TEXT`, `role TEXT` (gmc/client/artisan), `status TEXT` (active/left/removed), `joined_at`, `left_at` | UNIQUE(group_id, phone). Cascade delete si groupe supprimé. |
| `chantier_whatsapp_messages` | `id TEXT PK` (whapi msg id — idempotent), `chantier_id UUID`, `group_id TEXT` (JID brut, **pas FK UUID**), `from_number TEXT`, `from_me BOOLEAN`, `type TEXT`, `body TEXT`, `media_url TEXT`, `timestamp TIMESTAMPTZ` | RLS SELECT via `chantier_id`. `group_id` est un TEXT JID brut (ex: `120363xxxxx@g.us`) — intentionnel, antérieur à la table groups. |

> **Point important** : `chantier_whatsapp_messages.group_id` n'est pas une FK UUID vers `chantier_whatsapp_groups`. Les messages orphelins persistent si un groupe est supprimé. Ne pas migrer en UUID FK sans plan de migration des données.

#### API Routes

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/chantier/:id/whatsapp-groups` | Groupes + membres imbriqués (2 requêtes, pas de N+1) |
| DELETE | `/api/chantier/:id/whatsapp-groups?groupId=<uuid>` | Supprime groupe (membres supprimés en cascade) |
| POST | `/api/chantier/:id/whatsapp` | Crée groupe whapi + INSERT `chantier_whatsapp_groups` + `chantier_whatsapp_members`. Accepte `{ is_owner_channel: true }` pour créer un canal privé (cf. § 25.3). |
| PATCH | `/api/chantier/:id/whatsapp` | Ajoute participants à un groupe existant |
| GET | `/api/chantier/:id/whatsapp-messages?groupJid=<jid>` | Messages filtrés par groupe, limit 200 |
| POST | `/api/webhooks/whapi` | Webhook whapi : messages entrants + events (join/leave/remove/delete). Toujours 200. |

**Webhook whapi events** : `group.participants.add` via PUT, `group.participants.remove` via PATCH. Whapi ne supporte pas l'event delete de groupe côté webhook.

**Config webhook whapi** : URL `https://www.verifiermondevis.fr/api/webhooks/whapi`, events actifs : messages POST + groups POST/PUT/PATCH.

#### Composants

- `WhatsAppGroupsPanel.tsx` — liste groupes, membres dépliables, modale création avec sélection participants, bouton supprimer groupe
- `WhatsAppThread.tsx` — bulles colorées par rôle : gmc→`#DCF8C6` droite, client→`#DBEAFE` droite, artisan→blanc gauche. Props : `userPhone`, `groupJid`, `groupName`
- `MessagerieSection.tsx` — orchestrateur messagerie (email + WhatsApp). `fetchWaGroups` = `useCallback([chantierId, token])`. Reset automatique du thread actif si le groupe est supprimé (useEffect sur `waGroups`).

#### Lib

- `src/lib/integrations/whapiUtils.ts` — `formatPhone()`, `createWhatsAppGroup()`, `addGroupParticipants()`
- `GMC_PHONE = '33633921577'` — toujours inclus dans les groupes, rôle `'gmc'`

### Messagerie email — précisions SendGrid Inbound Parse

La table `chantier_conversations` expose une colonne `reply_address` : adresse unique de la forme `chantier-{id}+{convId}@{REPLY_EMAIL_DOMAIN}`. Cette adresse est utilisée comme `Reply-To` sur les emails sortants, ce qui permet à SendGrid Inbound Parse de router les réponses des artisans vers le webhook `POST /api/webhooks/inbound-email`.

**Flux réception** : artisan répond à l'email → SendGrid détecte le sous-domaine `reply.verifiermondevis.fr` → POST multipart vers `/api/webhooks/inbound-email` → parsing de l'adresse `reply_address` → INSERT dans `chantier_messages` (direction `inbound`).

### Canal WhatsApp privé owner (vague 3 — 2026-04-26)

Canal de notification owner ↔ agent pour les rappels, alertes, décisions à arbitrer.

**DB** :
- `chantier_whatsapp_groups.is_owner_channel BOOLEAN DEFAULT FALSE`
- `UNIQUE INDEX uq_owner_channel_per_chantier (chantier_id) WHERE is_owner_channel = TRUE` — un seul canal owner par chantier
- Migration `20260426150000_vague3_proactive_channel.sql`

**API** :
- `POST /api/chantier/[id]/whatsapp` accepte `{ is_owner_channel: true }` :
  - Si canal owner existe déjà → retourne `{ already_exists: true, group: ... }` (idempotent)
  - Sinon : récupère phone du user (mode JWT via `auth.getUser(token)` ; mode agent via `auth.admin.getUserById(user_id)`), force participants = [user_phone] + GMC, INSERT avec flag
- Route migrée vers `requireChantierAuthOrAgent` (l'agent peut créer via `create_owner_whatsapp_channel`)

**Tool agent** :
- `create_owner_whatsapp_channel()` : appelle l'API ci-dessus, retourne `{ ok, group_jid, already_exists?, message }`

**Webhook routing** :
- `lookupGroupByJid` retourne désormais `is_owner_channel`. Passe en `.maybeSingle()` (résilient aux doublons / JID inconnus)
- Quand un message arrive dans un groupe avec `is_owner_channel=true` → accumulé dans `ownerChannelMsgs.set(chantier_id, [...bodies])` (concaténation multi-msg même batch)
- Au moment du dispatch agent : si owner channel msg → mode `interactive` avec `user_message: bodies.join('\n')` ET `conversation_history: <20 derniers msgs depuis chantier_assistant_messages>` (sinon l'agent perd le contexte des messages proactifs précédents)
- Si pas de msg owner → mode `morning` standard

---

## 26. Assistant IA (cockpit)

L'agent IA "Pilote de Chantier" : architecture temps réel + digest quotidien. Edge function `agent-orchestrator` (Gemini 2.5-flash, function calling).

### Triggers temps réel

- Upload document → `agent-checks` (SQL déterministe, $0) fire-and-forget. L'orchestrator (Gemini) fire après extraction IA.
- Message WhatsApp → `agent-orchestrator` depuis `whapi.ts` (mode `edge_function`) ou `triggerAgentIfOpenClaw` (mode openclaw)
- Email entrant → `agent-orchestrator` depuis `inbound-email.ts`
- Affectation lot → `agent-checks` + orchestrator + mismatch detection via `detectDevisType`

### Mismatch detection (document ↔ lot)

**Documents (devis / factures)** : détection par mots-clés du contenu via `detectDevisType()` (`utils/extractProjectElements.ts`). Points : `analyze-quote/index.ts`, `extract-invoice.ts`, `describe.ts`, `[docId].ts` PATCH. Edge function réplique le mapping inline (Deno). Les **photos sont exclues** de ce contrôle (`document_type !== 'photo'`) — leur nom est souvent générique.

**Photos** : edge function `photo-coherence-check` (`verify_jwt=false`) — analyse l'**image** via Gemini Vision (`gemini-2.0-flash`) et la compare au lot affecté. Incohérence → insight `risk_detected` avec `source_event.check='photo_lot_coherence'`, visible uniquement dans le panneau Alertes IA (aucun WhatsApp, aucun message conversation). Déclenchée par `wa-photo-describe` (arrivée d'une photo) et `[docId].ts` PATCH (réaffectation manuelle). Seul gestionnaire des insights `photo_lot_coherence` (dismiss puis ré-insère). Ré-analyse toujours l'image (jamais la `vision_description` stockée, qui peut être le placeholder d'échec) et la répare au passage.

### Pas de cache contexte (suppression 2026-04-23)

- `context.ts` : fresh fetch à chaque appel via APIs internes + Supabase (~5-7 requêtes, < 300ms)
- `safeFetchJson` avec AbortController 5s timeout par appel
- Fallback : si l'API planning retourne 0 lots mais DB > 0, query DB directement

### Tools agent (`supabase/functions/agent-orchestrator/tools.ts`)

| Tool | Mode | Usage |
|---|---|---|
| `get_chantier_summary` | batch + interactive | Infos générales, budget, lots |
| `get_chantier_planning` | batch + interactive | Ordre lots, dates, durées, dépendances |
| `get_chantier_data` | batch + interactive | Requêtes ad-hoc (count devis, sum travaux…) |
| `get_contacts_chantier` | batch + interactive | Contacts filtrés par lot/rôle |
| `get_recent_photos` | batch + interactive | Photos WhatsApp + descriptions Vision IA |
| `list_chantier_groups` | batch + interactive | Groupes WhatsApp avec membres |
| `get_message_read_status` | batch + interactive | Accusés de lecture WhatsApp |
| `update_planning` | interactive | `lot_id, duree_jours?, delai_avant_jours?, depends_on_ids?` — `depends_on_ids` remplace la liste complète |
| `shift_lot` | interactive | `lot_id, jours, cascade, raison`. Protocole 2 tours dans le prompt si successeurs détectés. |
| `arrange_lot` | interactive | `mode: chain_after \| parallel_with`. Modèle CPM DAG : écrit `lot_dependencies` + force `lane_index = ref.lane_index` pour chain_after. |
| `update_lot_dates` | interactive | Legacy (compat). Préférer `shift_lot`. |
| `update_lot_status` / `mark_lot_completed` | interactive | Statut lot |
| `create_task` / `complete_task` | interactive | Checklist (priorite : urgent/important/normal) |
| `register_expense` | interactive | `amount, label, lot_id? OR lot_name?, vendor?, depense_type?` (défaut `frais`). Si `lot_name` fourni, recherche/crée le lot. |
| `send_whatsapp_message` | interactive | Envoi dans un GROUPE WhatsApp (`@g.us`) déjà connu — typiquement le canal owner. Garde-fou : rejette tout `to` non-`@g.us` (whapi refuse le 1-à-1). Confirmation explicite obligatoire. |
| `send_whatsapp_to_contact` | interactive | Écrit à un contact via un groupe : `group_jid` (groupe existant) OU `create_dedicated:true` (crée un groupe à 3 — owner + GMC + contact). LE tool pour « écris un WhatsApp à l'artisan X ». |
| `list_artisan_whatsapp_targets` | batch + interactive | Liste les groupes WhatsApp existants où un contact est présent — appelé avant `send_whatsapp_to_contact` pour proposer le choix du canal. |
| `log_insight` / `request_clarification` | interactive | Mémoire long-terme + clarifications |

### Optimisations coût

- Debounce WhatsApp (`whapi.ts`) : `Set<string>` pour 1 trigger/chantier/batch webhook
- Cooldown 60s pour `morning` (skip si lastRun < 60s) — pas pour `evening`
- Cron soir : `chantiers WHERE phase != 'reception'`
- Parallélisation cron : `Promise.allSettled` par batches de 3
- `max_tokens: 16384` (pas 4096 — thinking budget)

### Auth agent → API routes

- `requireChantierAuthOrAgent` (`apiHelpers.ts`) : accepte JWT user OU header `X-Agent-Key`
- Routes migrées : `budget.ts` GET, `contacts.ts` GET, `payment-events.ts` GET/POST/PATCH/DELETE, `taches.ts` CRUD, `planning.ts` GET/PATCH, `lots.ts` GET/POST/PATCH, `documents/depense-rapide.ts` POST

### Dual-mode

- `edge_function` (défaut) : Gemini 2.5 Flash, on paie
- `openclaw` : instance user, user paie. Stateful, multi-tour. **Implémentation partielle — voir `WIP.md`.**
- `disabled` : agent inactif
- Config : `/api/chantier/agent-config` GET/PUT, UI dans `Settings` (`AgentConfigCard`)

### Tables associées

- `agent_insights` — observations (planning_impact, budget_alert, payment_overdue, conversation_summary, risk_detected, digest, lot_status_change, needs_clarification). Sévérité info/warning/critical. Index dedup unique.
- `agent_runs` — log des runs LLM (morning/evening). Messages analysés, insights créés, actions prises, tokens.
- `agent_config` — configuration dual-mode par user.
- `chantier_journal` — journal de chantier, 1 page/jour. `body` markdown = **récit narratif seul** (le pied-de-page Décisions/Alertes a été retiré 2026-05-17). alerts_count, max_severity.
- `chantier_activity` — événements horodatés (changements de statut surtout) alimentant la **timeline** du Journal. Colonnes : `occurred_at`, `category`, `actor` (user/agent/system), `summary`, `detail`, `metadata` JSONB. Insert via helper `logChantierActivity()` (`apiHelpers.ts`, service_role). RLS SELECT owner uniquement.
- `chantier_assistant_messages` — historique chat user/agent. `tool_calls` JSONB pour traçabilité. Lecture : toujours `order created_at descending + limit + reverse` (jamais `ascending + limit` qui coupe les messages récents).
- ~~`agent_context_cache`~~ — table dépréciée 2026-04-23 (peut être droppée).

### Widget homepage — FAB + bulle (refacto 2026-05-10)

`assistant/AssistantWidget.tsx` — bouton flottant en bas-**gauche** du cockpit (le bas-droite est réservé au widget WhatsApp / support tiers pour éviter la collision), accessible depuis tous les onglets sauf l'onglet Assistant lui-même (caché via prop `hidden`). Click → bulle popover 380×600px desktop ouvrant aussi côté gauche, fullscreen mobile.

**Architecture — un seul agent, deux surfaces** :
- Le widget **partage la même thread** que l'onglet Assistant (`chantier_assistant_messages`). Click "↗ Ouvrir l'Assistant complet" → ferme la bulle + navigateTo('assistant'). L'historique du widget apparaît automatiquement dans la colonne Chat de l'onglet (cohérence par construction).
- Endpoint backend identique : `POST /api/chantier/[id]/assistant/message` (puis edge function `agent-orchestrator`, Gemini 2.5-flash, function calling). Pas de chat parallèle. Le legacy `/api/chantier/chat` ("Maître d'œuvre" Gemini 2.0-flash) a été supprimé le 2026-05-10.

**État vide — greeting + 6 suggestions** :
- 3 chips Q&A (fond blanc) : "📋 Démarches admin urgentes ?", "💰 Suis-je éligible aux aides ?", "⚠️ Quels risques actuels ?"
- 3 chips Actions (fond ambre) : "✅ Crée une tâche pour demain", "📅 Décale un lot dans le planning", "💬 Envoie un WhatsApp à un artisan"
- Différenciation visuelle Q&A vs Action assumée (montre que l'agent peut **agir**, pas juste répondre).

**Refresh** : pas de polling auto. Refetch de l'historique à chaque ouverture du widget (pour voir les messages proactifs du cron 19h ou alertes critiques arrivés entre-temps).

**Encart "✅ Action prise"** : si la réponse `assistant/message` retourne `tools_executed.length > 0`, un encart vert apparaît juste sous le message assistant avec la liste des tools mutateurs exécutés. Visible uniquement après envoi (la GET `/thread` ne sélectionne pas le champ `tool_calls` côté backend — limitation acceptable).

**Badge FAB** : compteur d'agent_initiated messages non lus (cron digest 19h, alertes proactives). Lit `unread_count` depuis GET `/assistant/thread`. Le GET marque comme lus les messages agent_initiated → le badge se vide quand l'user ouvre le widget.

**FAB design** :
- Position `fixed bottom-6 left-6` (lg: bottom-8 left-8) — **bas-gauche** pour éviter la collision avec le widget WhatsApp/support en bas-droite
- 56×56px, gradient `from-indigo-500 to-violet-600`, icône Sparkles
- Hover scale 1.05, tooltip desktop sort vers la droite "Assistant chantier"
- Safe-area iOS via `marginBottom: 'env(safe-area-inset-bottom)'`

**Mobile** : la bulle devient un overlay plein écran avec backdrop noir 30% — comportement standard pattern bottom-sheet.

### Onglet Assistant chantier — 3 colonnes (refacto 2026-05-08)

Rendu par `assistant/AssistantTriPane.tsx`. Layout 3 colonnes desktop, tabs mobile.

**Layout desktop (lg+)** : `flex-row`, 3 panneaux côte-à-côte.
- **Alertes (gauche, w-[300px])** — `agent_insights` du hook `useAgentInsights` partagé. 30 derniers jours. Click ligne = `markAsRead(id)`. Bouton "Tout marquer lu" si `unreadCount > 0`.
- **Chat (centre, flex-1)** — `ChantierAssistantChat size="full"` inchangé.
- **Décisions IA (droite, w-[300px])** — tool_calls mutateurs du jour, fetch `/api/chantier/[id]/assistant/activity-feed`, auto-refresh 20s, reset visuel à minuit Paris.

**Layout mobile** : tabs en haut (Alertes / Chat / Décisions), un seul panel visible. Compteurs sur les tabs (unreadCount alertes + count décisions du jour).

**Source de données — 2 fetchs distincts** :
- Alertes : `useAgentInsights(chantierId, token)` (partagé avec toasts + badge sidebar). Endpoint `/api/chantier/[id]/agent-insights?limit=30`.
- Décisions : fetch interne dans `AssistantTriPane`, endpoint `/api/chantier/[id]/assistant/activity-feed`.

**API `/api/chantier/[id]/assistant/activity-feed`** :
- Fenêtre temporelle : `created_at >= startOfDay(Paris)`. Approximation UTC+2 (DST hiver/été : 1h de décalage acceptable).
- Filtre `MUTATION_TOOLS` : exclut les GET passifs.
- Retour : `{ since, decisions, insights }`. Le champ `insights` n'est plus consommé par le frontend (alertes viennent de `useAgentInsights`) mais reste pour rétro-compat.

**Icônes catégories décisions** : 📅 planning, 💰 frais, ✅ statut, ☑️ tâche, 💬 WhatsApp, 🔔 clarification, 💡 insight, ⚙️ default.
**Icônes catégories alertes** : 🔔 clarification, 🔴 critique, 💰 budget, 📅 planning, ⏰ retard, 🔄 changement, ⚠️ risque, 💭 résumé conv, 📌 default.

**Footer panneau Décisions** : "Voir journal complet" → `navigateTo('journal')`.

**Avant 2026-05-08 (déprécié)** : layout 2 colonnes via `AgentActivityFeed.tsx` (fichier supprimé), feed unifié décisions + insights. Le bandeau alertes du haut avait été supprimé en 2026-04-25 et tout centralisé dans le feed unique. Le refacto 2026-05-08 sépare alertes (gauche) et décisions (droite) en panneaux distincts pour clarifier la hiérarchie cognitive (problèmes à traiter vs ce qui a été fait).

### Journal de chantier — récit + timeline (2026-05-17)

Rendu par `assistant/JournalChantierSection.tsx`. La journée est en **2 blocs distincts** :

**Bloc 1 — Récit du jour** : le digest narratif rédigé par l'IA à 19h Paris (cron `agent-orchestrator`), stocké dans `chantier_journal.body`. Depuis 2026-05-17 le body ne contient QUE le récit — le pied-de-page déterministe « ⚙️ Décisions / ⚠️ Alertes / ❓ Clarifications » a été retiré (déplacé dans la timeline).

**Bloc 2 — Timeline horodatée** : endpoint `GET /api/chantier/[id]/journal/timeline?from=<ISO>&to=<ISO>`. Agrège 4 sources pour la fenêtre demandée :
- `chantier_activity` → changements de statut (catégorie `status_change`)
- `documents_chantier.created_at` → dépôts de documents (`document`)
- `agent_insights` → alertes émises (`alert`, types actionnables — exclut digest/conversation_summary/lot_status_change)
- `chantier_assistant_messages.tool_calls` → décisions prises par l'IA (`decision`), **hors** tools de statut (`update_lot_status`, `update_devis_statut`, `mark_lot_completed`) déjà tracés dans `chantier_activity` → évite le doublon.

Les messages WhatsApp individuels ne sont JAMAIS dans la timeline. `from`/`to` sont calculés client-side à minuit locale.

**Export** : `src/lib/chantier/journalExport.ts` — PDF (jsPDF, `pdfSafe()` retire les caractères hors Latin-1) et Excel/CSV (séparateur `;` + BOM UTF-8). Export du jour affiché OU d'une plage de dates (modale).

Garantit la mémoire long-terme : le panneau Assistant montre **aujourd'hui**, le Journal montre **chaque jour archivé**.

---

## 27. Actions proactives — décisions & actions programmées (vague 3)

Permet à l'agent de devenir autonome sur les rappels, alertes, décisions à arbitrer. Le canal WhatsApp privé owner (cf. § 25.3) est le canal de sortie de ces actions proactives.

### Actions programmées

**Table `agent_scheduled_actions`** :
- `id, chantier_id, due_at TIMESTAMPTZ, action_type ('reminder'|'auto_message'), payload JSONB, status ('pending'|'firing'|'fired'|'cancelled'|'failed'), fired_at, fired_result JSONB, source TEXT, created_at`
- Index `(due_at) WHERE status='pending'` pour le scan cron
- RLS user-scoped read + cancel-only update

**RPC `claim_pending_reminders(batch_limit INT)`** :
- `SELECT FOR UPDATE SKIP LOCKED` → `UPDATE status='firing'` atomique
- Empêche double envoi en cas de chevauchement de 2 ticks concurrents
- `SECURITY DEFINER`, exécutable uniquement par `service_role`

**Tools agent** :
- `schedule_reminder(due_at_local, tz, reminder_text, lot_id?)` : `due_at_local` = heure LOCALE (YYYY-MM-DDTHH:MM), serveur convertit UTC via `Intl.DateTimeFormat` (gère DST). Cap **30 rappels pending par chantier**. Refus si `due_at < now-5min`.
- `cancel_reminder(reminder_id)` : annule un pending. Vérifie ownership chantier + statut. L'agent voit la liste dans le contexte (`scheduled_reminders`, limit 10 plus proches dans `context.ts`).

**Edge function `agent-scheduled-tick`** :
- `verify_jwt = false` côté `config.toml`
- Auth manuelle : Bearer service_role OU header X-Cron-Secret = `AGENT_SECRET_KEY`
- Workflow :
  1. `claim_pending_reminders(50)` — atomic claim
  2. Pré-fetch `chantier_whatsapp_groups.group_jid WHERE is_owner_channel=true IN (chantier_ids)`
  3. Process actions en parallèle batches de 8 (vs séquentiel — gain : 50/8×8s = 50s pire cas, sous 60s edge fn timeout)
  4. Pour chaque : si pas de owner channel → status='failed' avec raison ; sinon envoi WhatsApp `⏰ Rappel : {text}` → status='fired' ou 'failed' avec `fired_result JSONB`

**Cron pg_cron** :
- Job 28 : `agent-scheduled-tick` toutes les 15min (`*/15 * * * *`)
- Pattern `Authorization: Bearer ${service_role_key from vault}` (cohérent avec les autres crons)

### Workflow décision à prendre

Pas un nouveau tool — orchestré par 2 tools existants :
- `notify_owner_for_decision(question, expected_action, ...)` : crée ligne `agent_pending_decisions` + envoie WhatsApp dans canal owner via `findOwnerChannelJid` (helper avec fallback "premier groupe créé" pour rétrocompat). L'`expected_action` stockée en JSONB = `{ tool, args }` à exécuter si confirmation.
- `resolve_pending_decision(decision_id, answer)` : `isPositive(answer)` (avec pré-check négatif "ok mais en fait non" → false). Si OUI → exécute l'`expected_action` via le dispatcher injecté. Si NON → marque `cancelled`. By-pass volontaire du protocole 2-tours pour `send_whatsapp_message` etc. (l'owner a déjà confirmé via WhatsApp privé).

Déclenché par le prompt section "DÉTECTION DE DÉCISION À ARBITRER" : *"Quand un message externe propose un changement (montant, date, ajout/retrait), tu DOIS notifier le owner via `notify_owner_for_decision` et NE PAS répondre à l'artisan tant que le owner n'a pas validé."*

### Triggers proactifs WhatsApp privé — état

8 triggers identifiés (cf. `WIP § 12`). État actuel :
- ✅ Clarification urgente (`request_clarification`) — routée via `agent_insights`, visible Activité IA
- ⏳ Alerte critique (`severity=critical`) — à câbler vers WhatsApp owner channel
- ⏳ Paiement en retard — détecté par `agent-checks`, à router
- ⏳ Lot bloqué sans devis 14j — à ajouter dans `agent-checks`
- ✅ Rappel programmé — implémenté via `agent-scheduled-tick`
- ⏳ Déblocage attendu non reçu — nécessite tracking sur `payment_events` type entrée
- ⏳ Action automatique prise — à câbler dans `log_insight`
- ✅ Décision à prendre — implémenté via `notify_owner_for_decision`

UI Settings checkboxes par catégorie à venir pour activer/désactiver chaque trigger (sinon spam).
