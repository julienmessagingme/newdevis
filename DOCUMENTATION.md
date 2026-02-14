# Documentation technique - VerifierMonDevis.fr

## Table des matières

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
15. [Configuration](#15-configuration)
16. [Déploiement](#16-déploiement)
17. [Patterns et conventions](#17-patterns-et-conventions)
18. [Guide de développement](#18-guide-de-développement)
19. [Dépannage](#19-dépannage)

---

## 1. Présentation du projet

**VerifierMonDevis.fr** est un service web gratuit qui permet aux particuliers français d'analyser les devis d'artisans avant de les signer. L'application :

- Extrait le contenu du devis via OCR (PDF, images)
- Vérifie l'entreprise auprès du registre national (Pappers/SIRET)
- Compare les prix au marché local
- Vérifie les assurances et certifications
- Produit un **score de fiabilité** : VERT (confiance), ORANGE (vigilance), ROUGE (danger)
- Fournit des recommandations personnalisées

### Flux utilisateur principal

```
Inscription → Upload du devis → Analyse automatique (30-60s)
→ Score + détails → Export PDF → Suivi post-signature (optionnel)
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
| @astrojs/node | 9.5.2 | Adapter Node.js pour SSR |
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
│   │   ├── 404.astro                   # Page d'erreur (statique)
│   │   ├── analyse/
│   │   │   └── [id].astro             # Résultat d'analyse (dynamique)
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
│   │   │   └── ComprendreScoreApp.tsx
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
│   │   │   └── MissingDataActions.tsx  # Actions données manquantes
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
│   │   ├── tracking/                   # Suivi post-signature
│   │   │   ├── PostSignatureTrackingSection.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── funnel/                     # Composants de tunnel/conversion
│   │   │   ├── FunnelStepper.tsx       # Stepper de progression (étapes)
│   │   │   └── PremiumGate.tsx         # Gate pour fonctionnalités premium
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
│   │   ├── workTypeReferentiel.ts      # Référentiel 100+ types de travaux
│   │   ├── scoreUtils.tsx              # Utilitaires score (icônes, badges, couleurs)
│   │   ├── entrepriseUtils.ts          # Utilitaires bloc entreprise
│   │   ├── devisUtils.ts              # Utilitaires bloc devis
│   │   ├── securiteUtils.ts           # Utilitaires bloc sécurité
│   │   ├── contexteUtils.ts           # Utilitaires bloc contexte géo
│   │   ├── urbanismeUtils.ts          # Utilitaires bloc urbanisme
│   │   ├── architecteUtils.ts         # Utilitaires bloc architecte
│   │   └── blogUtils.ts              # Utilitaires blog (fetch, formatage)
│   │
│   ├── integrations/supabase/
│   │   ├── client.ts                   # Configuration client Supabase
│   │   └── types.ts                    # Types TS auto-générés depuis le schéma DB
│   │
│   ├── layouts/
│   │   └── BaseLayout.astro            # Layout HTML de base (head, meta, body)
│   │
│   ├── utils/
│   │   └── generatePdfReport.ts        # Génération rapport PDF (jsPDF)
│   │
│   ├── App.css                         # (legacy) Styles Vite — non utilisé
│   ├── main.tsx                        # Point d'entrée React
│   ├── vite-env.d.ts                   # Déclarations types Vite
│   └── index.css                       # Styles globaux + variables Tailwind
│
├── supabase/
│   └── functions/                      # Edge Functions Deno (8 fonctions)
│       ├── analyze-quote/              # Orchestrateur principal (modulaire)
│       │   ├── index.ts               # Point d'entrée, orchestration pipeline
│       │   ├── extract.ts             # Appels extraction OCR
│       │   ├── verify.ts              # Vérifications parallèles (Pappers, ADEME, etc.)
│       │   ├── score.ts               # Algorithme de scoring
│       │   ├── render.ts             # Génération des alertes/points OK/recommandations
│       │   ├── summarize.ts          # Résumé des lignes de travaux (gemini-2.0-flash)
│       │   ├── market-prices.ts     # Groupement par job type + prix marché (gemini-2.0-flash)
│       │   ├── utils.ts              # Fonctions utilitaires partagées
│       │   └── types.ts              # Types TypeScript de la pipeline
│       ├── extract-document/index.ts   # OCR et extraction de texte
│       ├── parse-quote/index.ts        # Parsing structuré via Gemini
│       ├── analyze-attestation/index.ts # Analyse attestation assurance
│       ├── generate-blog-article/index.ts # Génération articles IA (Claude API)
│       ├── generate-blog-image/index.ts   # Génération images IA (fal.ai)
│       ├── admin-kpis/index.ts         # API KPIs admin
│       └── publish-scheduled-posts/index.ts # Publication programmée blog (cron)
│
├── public/
│   ├── images/                         # Assets statiques (logos, etc.)
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

### 7.7 Composants shadcn-ui

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

### Vues SQL

- **`admin_kpis_usage`** : Nombre d'analyses, taux de complétion, analyses par jour
- **`admin_kpis_scoring`** : Distribution des scores (% vert/orange/rouge)
- **`admin_kpis_tracking`** : KPIs de suivi post-signature

---

## 9. Authentification

### Flux d'inscription

1. L'utilisateur remplit : prénom, nom, email, téléphone (10 chiffres), mot de passe (min 8 caractères)
2. Acceptation obligatoire des CGU
3. Option : accepter les offres commerciales
4. Appel `supabase.auth.signUp()` avec les metadata utilisateur
5. Redirection vers `/tableau-de-bord`

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
| Urbanisme | GPU | Proximité monuments historiques |
| Prix marché | Table market_prices + Gemini | Groupement par job type, fourchette min/moy/max |

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

### admin-kpis — `verify_jwt = true`

**Fichier** : `supabase/functions/admin-kpis/index.ts`

API pour le dashboard admin : retourne les KPIs depuis les vues SQL. Requiert authentification admin.

### generate-blog-article — `verify_jwt = true`

**Fichier** : `supabase/functions/generate-blog-article/index.ts`

Génération d'articles de blog via **Claude API** (`claude-sonnet-4-20250514`) :
- Accepte : pitch, mots-clés, longueur cible, URLs sources
- Retourne un article HTML structuré avec titre, slug, extrait, SEO
- Insert direct dans `blog_posts` en brouillon (`workflow_status: ai_draft`)

### generate-blog-image — `verify_jwt = true`

**Fichier** : `supabase/functions/generate-blog-image/index.ts`

Génération d'images via **fal.ai** (Flux Schnell) :
- Accepte : postId, type (cover/mid), prompt
- Génère l'image, l'uploade dans le bucket `blog-images`
- Met à jour `blog_posts.cover_image_url` ou `mid_image_url`

### publish-scheduled-posts — `verify_jwt = true`

**Fichier** : `supabase/functions/publish-scheduled-posts/index.ts`

Cron (toutes les 15 min) qui publie les articles programmés dont `scheduled_at` est passé.

### analyze-attestation — `verify_jwt = false`

**Fichier** : `supabase/functions/analyze-attestation/index.ts`

Analyse d'attestation d'assurance (décennale, RC Pro) et comparaison avec les données du devis.

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

## 15. Configuration

### `astro.config.mjs`

```javascript
export default defineConfig({
  site: 'https://verifiermondevis.fr',
  integrations: [react(), tailwind({ applyBaseStyles: false }), sitemap()],
  output: 'static',                    // SSG par défaut
  adapter: node({ mode: 'standalone' }), // SSR pour pages dynamiques
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
- Serveur Node.js pour les pages dynamiques
- Assets optimisés (JS, CSS, images)

### Hébergement

Le projet utilise l'adapter `@astrojs/node` en mode `standalone`. Il peut être déployé sur :

- **Vercel** : Support natif Astro + Node
- **Netlify** : Via adapter spécifique (remplacer node par netlify)
- **Render / Railway / Fly.io** : Conteneur Node.js
- **AWS / GCP / Azure** : Via Docker

### Variables d'environnement en production

Les variables `VITE_*` et `PUBLIC_*` doivent être définies au moment du build (elles sont inlinées dans le JS client).

Les secrets des edge functions sont configurés dans le dashboard Supabase.

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
