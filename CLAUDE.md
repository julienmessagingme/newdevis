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
| `/comprendre-votre-score` | `comprendre-votre-score.astro` | `ComprendreScoreApp` → `ComprendreScore` |

## Ajouter une page

1. `src/components/pages/MaPage.tsx` — composant React
2. `src/components/app/MaPageApp.tsx` — wrapper `<ReactApp><MaPage /></ReactApp>`
3. `src/pages/ma-page.astro` — `<MaPageApp client:only="react" />` avec `export const prerender = false`

## Organisation du code

- **`lib/*Utils.ts`** : Logique métier externalisée par domaine (`entrepriseUtils`, `devisUtils`, `securiteUtils`, `contexteUtils`, `urbanismeUtils`, `architecteUtils`, `blogUtils`, `scoreUtils`). Les composants `analysis/Block*.tsx` importent depuis ces fichiers.
- **`components/admin/`** : Module blog admin complet (`BlogPostList`, `BlogPostEditor`, `BlogDialogs`, `AiGenerationPanel`, `ManualWriteEditor`, `RichTextToolbar`, `ImageManagement`, `blogTypes`)
- **`components/funnel/`** : Tunnel de conversion (`FunnelStepper`, `PremiumGate`). PremiumGate est intégré dans `BlockPrixMarche` via props (`showGate`, `onAuthSuccess`, `convertToPermanent`) — affiché uniquement quand le bloc est collapsé et l'utilisateur anonyme.
- **`components/analysis/`** : 18 composants dont `DocumentRejectionScreen`, `ExtractionBlocker`, `OcrDebugPanel` (lazy-loaded via `React.lazy` + `Suspense` dans `AnalysisResult.tsx`)
- **`supabase/functions/analyze-quote/`** : Pipeline modulaire (9 fichiers : `index`, `extract`, `verify`, `score`, `render`, `summarize`, `market-prices`, `utils`, `types`)
- **Hooks** : 6 hooks dont `useAnonymousAuth.ts` (auth anonyme), `useMarketPriceEditor.ts` (édition interactive prix marché)

## Supabase

### Tables (7)
- `analyses` — analyses de devis (table principale). Colonne `market_price_overrides` (JSONB) pour les éditions utilisateur sur les prix marché.
- `analysis_work_items` — lignes de travaux détaillées par analyse. Colonne `job_type_group` (TEXT) pour le rattachement au job type IA.
- `blog_posts` — articles de blog (avec workflow IA, images cover + mid)
- `company_cache` — cache vérification entreprise (recherche-entreprises.api.gouv.fr). Purge auto quotidienne via cron.
- `market_prices` — référentiel prix marché (~267 lignes). RLS avec policy `market_prices_public_read` (accès anon + authenticated en lecture). Utilisé côté backend (edge functions via service_role) ET côté frontend (calculatrice homepage via anon key).
- `post_signature_tracking` — suivi post-signature
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

### Flux frontend

- **`useMarketPriceAPI.ts`** : transforme les données brutes en `JobTypeDisplayRow[]`. Calcule `theoreticalMin/Avg/MaxHT` = Σ(price × mainQuantity + fixed) par prix matché. Verdict basé sur comparaison devisTotalHT vs theoreticalAvgHT.
- **`BlockPrixMarche.tsx`** : affiche des cartes collapsibles par job type (lignes détaillées + jauge MarketPositionAnalysis). Supporte le drag & drop de lignes entre job types et la modification de quantité.
- **`useMarketPriceEditor.ts`** : gère l'état mutable (déplacements de lignes, quantités modifiées). Persiste les modifications dans `analyses.market_price_overrides` (JSONB). Quand une ligne est déplacée, seul `devis_total_ht` change (prix théorique inchangé). Quand la quantité change, `theoreticalXxxHT` est recalculé.

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

## Authentification et navigation admin

- **Login avec redirect** : `Login.tsx` supporte `?redirect=` query param. Après connexion, redirige vers le path spécifié au lieu de `/tableau-de-bord`.
- **Pages admin protégées** : `Admin.tsx` et `AdminBlog.tsx` vérifient le rôle admin via `user_roles` query (pas via l'edge function). Si accès refusé, proposent un bouton "Se connecter en admin" qui fait `signOut()` + redirect vers `/connexion?redirect=/admin`.
- **Navigation inter-admin** : Barre de navigation sous le Header avec liens KPIs / Blog.
- **Reset mot de passe** : `ForgotPassword.tsx` envoie un email via `supabase.auth.resetPasswordForEmail()` avec `redirectTo` vers `/reset-password`. `ResetPassword.tsx` écoute l'event `PASSWORD_RECOVERY` via `onAuthStateChange` puis appelle `supabase.auth.updateUser({ password })`. Configurer l'URL dans Supabase Dashboard > Authentication > URL Configuration > Redirect URLs.
- **Admins** : `julien@messagingme.fr`, `bridey.johan@gmail.com` (rôle `admin` dans `user_roles`)

## Règles importantes

- **Header/Footer** existent en 2 versions : `layout/Header.tsx` (React) + `astro/Header.astro`. Toute modif doit être faite dans les 2.
- **shadcn-ui** (`src/components/ui/`) : ne pas modifier manuellement
- **types.ts** (`src/integrations/supabase/`) : auto-généré, ne pas modifier
- **Alias** : `@/` → `src/`
- **Interface** en français, **code** en anglais
- **Params dynamiques** : `[id].astro` et `[slug].astro` — les composants React extraient les params de `window.location.pathname`
- **Commandes** : `npm run dev` | `npm run build` | `npm run preview` | `npm run lint`
