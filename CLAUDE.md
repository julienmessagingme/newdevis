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
| `/contact` | `contact.astro` | *(statique Astro — formulaire Web3Forms)* |
| `/mentions-legales` | `mentions-legales.astro` | *(statique Astro)* |
| `/confidentialite` | `confidentialite.astro` | *(statique Astro)* |
| `/cgu` | `cgu.astro` | *(statique Astro)* |
| `/simulateur-valorisation-travaux` | `simulateur-valorisation-travaux.astro` | `SimulateurScoresApp` → `SimulateurScores` *(simulateur IVP/IPI)* |
| `/valorisation-travaux-immobiliers` | `valorisation-travaux-immobiliers.astro` | *(statique Astro — page SEO valorisation)* |
| `/sitemap-blog.xml` | `sitemap-blog.xml.ts` | *(endpoint SSR — sitemap dynamique blog)* |

### API Routes (Astro SSR)

| Route | Fichier | Rôle |
|---|---|---|
| `/api/geo-communes` | `api/geo-communes.ts` | Résolution code postal → communes via geo.api.gouv.fr |
| `/api/market-prices` | `api/market-prices.ts` | Prix immobiliers DVF par commune (table `dvf_prices_yearly`) |
| `/api/strategic-scores` | `api/strategic-scores.ts` | Calcul scores IVP/IPI depuis `strategic_matrix` |
| `/api/debug-supabase` | `api/debug-supabase.ts` | Diagnostic connexion Supabase (dev/debug) |

## Ajouter une page

1. `src/components/pages/MaPage.tsx` — composant React
2. `src/components/app/MaPageApp.tsx` — wrapper `<ReactApp><MaPage /></ReactApp>`
3. `src/pages/ma-page.astro` — `<MaPageApp client:only="react" />` avec `export const prerender = false`

## Organisation du code

- **`lib/*Utils.ts`** : Logique métier externalisée par domaine (`entrepriseUtils`, `devisUtils`, `securiteUtils`, `contexteUtils`, `urbanismeUtils`, `architecteUtils`, `blogUtils`, `scoreUtils`). `lib/constants.ts` contient les constantes partagées. Les composants `analysis/Block*.tsx` importent depuis ces fichiers.
- **`components/admin/`** : Module blog admin complet (`BlogPostList`, `BlogPostEditor`, `BlogDialogs`, `AiGenerationPanel`, `ManualWriteEditor`, `RichTextToolbar`, `ImageManagement`, `blogTypes`)
- **`components/funnel/`** : Tunnel de conversion (`FunnelStepper`, `PremiumGate`). PremiumGate est intégré dans `BlockPrixMarche` via props (`showGate`, `onAuthSuccess`, `convertToPermanent`) — affiché uniquement quand le bloc est collapsé et l'utilisateur anonyme.
- **`components/analysis/`** : 20 composants dont `DocumentRejectionScreen`, `ExtractionBlocker`, `OcrDebugPanel` (lazy-loaded via `React.lazy` + `Suspense` dans `AnalysisResult.tsx`), `StrategicBadge` (affichage scores IVP/IPI), `UrbanismeAssistant` (assistant urbanisme). `BlockPrixMarche` inclut un `StepIndicator` interne (stepper visuel 2 étapes : Affectation des postes → Analyse des prix).
- **`supabase/functions/analyze-quote/`** : Pipeline modulaire (10 fichiers : `index`, `extract`, `verify`, `score`, `render`, `summarize`, `market-prices`, `domain-config`, `utils`, `types`)
- **`utils/generatePdfReport.ts`** : Génération PDF côté client via `jsPDF`. Structuré par blocs (entreprise, devis, sécurité, contexte) en miroir du frontend. Utilise les mêmes utils métier (`entrepriseUtils`, `securiteUtils`, etc.).
- **`lib/domainConfig.ts`** : Registre frontend des blocs visibles par domaine (`travaux`, `auto`, `dentaire`). Conditionne l'affichage des blocs dans `AnalysisResult`.
- **Hooks** : 6 hooks dont `useAnonymousAuth.ts` (auth anonyme), `useMarketPriceEditor.ts` (édition interactive prix marché)

## Supabase

### Tables (12)
- `analyses` — analyses de devis (table principale). Colonne `market_price_overrides` (JSONB) pour les éditions utilisateur sur les prix marché. Colonne `domain` (TEXT, default `'travaux'`) pour le multi-vertical. **Limite 10 par utilisateur** : les plus anciennes sont purgées automatiquement par le pipeline.
- `analysis_work_items` — lignes de travaux détaillées par analyse. Colonne `job_type_group` (TEXT) pour le rattachement au job type IA.
- `blog_posts` — articles de blog (avec workflow IA, images cover + mid)
- `company_cache` — cache vérification entreprise (recherche-entreprises.api.gouv.fr). Purge auto quotidienne via cron.
- `document_extractions` — cache OCR par hash SHA-256 du fichier (provider, parsed_data, quality_score)
- `dvf_prices` — cache prix immobiliers DVF par commune (code INSEE, prix/m² maison et appartement, nb ventes). Source : data.gouv.fr. RLS lecture publique.
- `market_prices` — référentiel prix marché (~267 lignes). Colonne `domain` (TEXT, default `'travaux'`). RLS avec policy `market_prices_public_read` (accès anon + authenticated en lecture). Utilisé côté backend (edge functions via service_role) ET côté frontend (calculatrice homepage via anon key).
- `post_signature_tracking` — suivi post-signature
- `price_observations` — **données "gold" big data** : snapshot des groupements job type par analyse. Colonne `domain` (TEXT, default `'travaux'`). Survit à la suppression des analyses (pas de FK CASCADE). Voir section dédiée ci-dessous.
- `strategic_matrix` — matrice IVP (Indice de Valorisation Patrimoniale) / IPI (Indice de Performance Investisseur). Scores 0-10 par critère et par job type (9 critères + recovery_rate). RLS lecture publique. Utilisée par `/api/strategic-scores` et le pipeline `analyze-quote`.
- `user_roles` — rôles (admin/moderator/user)
- `zones_geographiques` — coefficients géographiques par code postal

### Edge Functions (8)
| Fonction | JWT | Rôle |
|---|---|---|
| `analyze-quote` | false | Pipeline principal d'analyse de devis |
| `extract-document` | false | OCR et extraction de texte (interne) |
| `parse-quote` | false | Parsing structuré via Gemini |
| `analyze-attestation` | false | Analyse d'attestations d'assurance |
| `admin-kpis` | false | KPIs dashboard admin (vérifie admin role en interne) |
| `generate-blog-article` | false | Génération articles via Claude API (vérifie admin role en interne) |
| `generate-blog-image` | false | Génération images via fal.ai (vérifie admin role en interne) |
| `publish-scheduled-posts` | false | Cron publication blog programmée |

> **`verify_jwt = false` sur TOUTES les fonctions** : Supabase Auth signe les JWT avec ES256, mais le runtime edge `verify_jwt` ne supporte pas cet algorithme → "Invalid JWT". Chaque fonction admin vérifie le rôle en interne via `user_roles`.

### Storage (2 buckets)
- `devis` — fichiers PDF/images uploadés (privé, user-scoped)
- `blog-images` — images de couverture et mi-texte (public, admin-only write)

### Crons
- `purge-expired-company-cache` — quotidien 03h UTC, nettoie les entrées expirées
- `publish-scheduled-blog-posts` — toutes les 15 min, publie les articles programmés

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

## SEO et données structurées

### BaseLayout.astro — props SEO
`BaseLayout.astro` accepte des props SEO optionnelles : `canonical`, `ogType`, `ogImage`, `jsonLd` (objet Schema.org), `breadcrumbs` (tableau `{name, url}`). Toute page qui a besoin de données structurées les passe via ces props.

### JSON-LD par page
- **Global** (toutes les pages) : `Organization` (logo, email, description)
- **Global** (si `breadcrumbs` fourni) : `BreadcrumbList` automatique
- `/faq` : `FAQPage` avec `mainEntity` généré depuis le tableau `faqs`
- `/qui-sommes-nous` : `AboutPage` avec `Organization` en `mainEntity`
- `/comprendre-score` : `HowTo` (étapes du scoring)
- `/blog` : `CollectionPage`
- `/blog/:slug` : `Article` (titre, auteur, dates, image) — données récupérées côté serveur dans le frontmatter Astro via `supabase.from("blog_posts").select()`

### Sitemaps
- `public/sitemap.xml` — pages statiques (12 URLs)
- `src/pages/sitemap-blog.xml.ts` — endpoint SSR dynamique, requête les `blog_posts` publiés dans Supabase
- `public/robots.txt` référence les deux sitemaps

## Cookie consent RGPD

Bandeau cookie dans `BaseLayout.astro` avec boutons **Accepter / Refuser**. Stockage dans `localStorage('cookie-consent')` : `'accepted'` ou `'rejected'`.

- **Si accepté** : appelle `loadTrackingScripts()` qui injecte GA + Meta Pixel dans le DOM (actuellement commentés, prêts à activer)
- **Si refusé** : rien n'est chargé, le bandeau ne réapparaît plus
- **Nouveau visiteur** : le bandeau s'affiche

**À configurer** : remplacer `G-XXXXXXXXXX` (Google Analytics) et `XXXXXXXXXXXXXXX` (Meta Pixel ID) dans `BaseLayout.astro` puis décommenter le code.

## Page Contact (Web3Forms)

`src/pages/contact.astro` — formulaire serverless via Web3Forms (POST vers `api.web3forms.com/submit`). Champs : nom, email, catégorie (select), message. Protection anti-bot par honeypot (`<input type="checkbox" name="botcheck" class="hidden">`). Redirection vers `/contact?success=true` après envoi.

**À configurer** : remplacer `VOTRE_CLE_WEB3FORMS_ICI` par la clé d'accès obtenue sur web3forms.com.

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

## Authentification et navigation admin

- **Login avec redirect** : `Login.tsx` supporte `?redirect=` query param. Après connexion, redirige vers le path spécifié au lieu de `/tableau-de-bord`.
- **Pages admin protégées** : `Admin.tsx` et `AdminBlog.tsx` vérifient le rôle admin via `user_roles` query (pas via l'edge function). Si accès refusé, proposent un bouton "Se connecter en admin" qui fait `signOut()` + redirect vers `/connexion?redirect=/admin`.
- **Navigation inter-admin** : Barre de navigation sous le Header avec liens KPIs / Blog.
- **Reset mot de passe** : `ForgotPassword.tsx` envoie un email via `supabase.auth.resetPasswordForEmail()` avec `redirectTo` vers `/reset-password`. `ResetPassword.tsx` écoute l'event `PASSWORD_RECOVERY` via `onAuthStateChange` puis appelle `supabase.auth.updateUser({ password })`. Configurer l'URL dans Supabase Dashboard > Authentication > URL Configuration > Redirect URLs.
- **Paramètres du compte** : `Settings.tsx` (`/parametres`) permet de modifier prénom, nom, téléphone via `supabase.auth.updateUser({ data })` et de changer le mot de passe. Auth guard redirige vers `/connexion`. Accessible depuis le bouton Settings du dashboard.
- **Admins** : `julien@messagingme.fr`, `bridey.johan@gmail.com` (rôle `admin` dans `user_roles`)

## Règles importantes

- **Header/Footer** existent en 2 versions : `layout/Header.tsx` (React) + `astro/Header.astro`. Toute modif doit être faite dans les 2.
- **shadcn-ui** (`src/components/ui/`) : ne pas modifier manuellement
- **types.ts** (`src/integrations/supabase/`) : auto-généré, ne pas modifier
- **Alias** : `@/` → `src/`
- **Interface** en français, **code** en anglais
- **Params dynamiques** : `[id].astro` et `[slug].astro` — les composants React extraient les params de `window.location.pathname`
- **Commandes** : `npm run dev` | `npm run build` | `npm run preview` | `npm run lint`
