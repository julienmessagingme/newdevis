# CLAUDE.md - VerifierMonDevis.fr

Plateforme d'analyse de devis d'artisans. Stack : **Astro 5 + React 18 islands + Supabase + Tailwind/shadcn-ui**. Voir `DOCUMENTATION.md` pour le détail complet.

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

## Ajouter une page

1. `src/components/pages/MaPage.tsx` — composant React
2. `src/components/app/MaPageApp.tsx` — wrapper `<ReactApp><MaPage /></ReactApp>`
3. `src/pages/ma-page.astro` — `<MaPageApp client:only="react" />` avec `export const prerender = false`

## Organisation du code

- **`lib/*Utils.ts`** : Logique métier externalisée par domaine (`entrepriseUtils`, `devisUtils`, `securiteUtils`, `contexteUtils`, `urbanismeUtils`, `architecteUtils`, `blogUtils`, `scoreUtils`). Les composants `analysis/Block*.tsx` importent depuis ces fichiers.
- **`components/admin/`** : Module blog admin complet (`BlogPostList`, `BlogPostEditor`, `BlogDialogs`, `AiGenerationPanel`, `ManualWriteEditor`, `RichTextToolbar`, `ImageManagement`, `blogTypes`)
- **`components/funnel/`** : Tunnel de conversion (`FunnelStepper`, `PremiumGate`)
- **`components/analysis/`** : 18 composants dont `DocumentRejectionScreen`, `ExtractionBlocker`, `OcrDebugPanel`
- **`supabase/functions/analyze-quote/`** : Pipeline modulaire (8 fichiers : `index`, `extract`, `verify`, `score`, `render`, `summarize`, `market-prices`, `utils`, `types`)
- **Hooks** : 6 hooks dont `useAnonymousAuth.ts` (auth anonyme), `useMarketPriceEditor.ts` (édition interactive prix marché)

## Supabase

### Tables (7)
- `analyses` — analyses de devis (table principale). Colonne `market_price_overrides` (JSONB) pour les éditions utilisateur sur les prix marché.
- `analysis_work_items` — lignes de travaux détaillées par analyse. Colonne `job_type_group` (TEXT) pour le rattachement au job type IA.
- `blog_posts` — articles de blog (avec workflow IA, images cover + mid)
- `company_cache` — cache vérification entreprise (Pappers ou recherche-entreprises.api.gouv.fr). Purge auto quotidienne via cron.
- `market_prices` — référentiel prix marché (~220 lignes, remplace N8N+Excel)
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
| `admin-kpis` | **true** | KPIs dashboard admin |
| `generate-blog-article` | **true** | Génération articles via Claude API |
| `generate-blog-image` | **true** | Génération images via fal.ai |
| `publish-scheduled-posts` | **true** | Cron publication blog programmée |

### Storage (2 buckets)
- `devis` — fichiers PDF/images uploadés (privé, user-scoped)
- `blog-images` — images de couverture et mi-texte (public, admin-only write)

### Crons
- `purge-expired-company-cache` — quotidien 03h UTC, nettoie les entrées expirées
- `publish-scheduled-blog-posts` — toutes les 15 min, publie les articles programmés

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
2. **Identification IA** : Gemini identifie les types de travaux, détermine quantité/unité, et affecte chaque ligne du devis à EXACTEMENT UN job type. Chaque prestation distincte = un job type. Il choisit le bon variant fourniture/hors fourniture.
3. **Construction backend** : pour chaque job type, construit `devis_lines[]` et calcule `devis_total_ht` (somme des montants HT)
4. **Stockage** : `index.ts` stocke `job_type_group` sur chaque `analysis_work_items`

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
- **Granularité** : prestations distinctes = job types distincts (carrelage sol ≠ faïence murale). En cas de doute, plus de types plutôt que moins.
- Chaque ligne du devis = UN SEUL job type (pas de double comptage).
- Version fourniture/hors fourniture : Gemini en choisit UNE SEULE selon le contenu du devis.
- Les frais fixes (`fixed_min/avg/max_ht`) s'ajoutent une seule fois par job_type, indépendamment de la quantité.
- **Drag & drop** : HTML5 natif, pas de lib externe. Persisté via bouton Save.
- **Quantité éditable** : click sur la quantité → input inline. Recalcule prix théorique et verdict.

**Ajouter un prix** : INSERT dans `market_prices` avec les colonnes `job_type, label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht, fixed_min_ht, fixed_avg_ht, fixed_max_ht, zip_scope, notes`.

## Vérification entreprise (`verify.ts`)

Phase 2 du pipeline — 100% appels API déterministes, pas d'IA.

### APIs appelées
1. **Pappers** (`PAPPERS_API_KEY`) → immatriculation, ancienneté, bilans, procédure collective, adresse
2. **recherche-entreprises.api.gouv.fr** (gratuit, sans clé) → fallback automatique si Pappers non configuré. Fournit : nom, date création, statut actif/cessé, adresse siège, procédure collective. Ne fournit PAS les bilans financiers détaillés.
3. **OpenIBAN** → validation IBAN, pays, banque
4. **Google Places** (`GOOGLE_PLACES_API_KEY`) → note et avis
5. **ADEME RGE** → qualifications RGE (si travaux énergie)
6. **Géorisques** (via api-adresse.data.gouv.fr + georisques.gouv.fr) → risques naturels, zone sismique
7. **GPU/IGN** → patrimoine protégé

### Fallback Pappers → API gratuite
- Si `PAPPERS_API_KEY` n'est pas configuré, `verify.ts` appelle `recherche-entreprises.api.gouv.fr/search?q={siret}` automatiquement
- Résultat caché dans `company_cache` avec `provider: "recherche-entreprises"` (même TTL que Pappers : 30 jours)
- Endpoint défini dans `utils.ts` (`RECHERCHE_ENTREPRISES_API_URL`)

## Règles importantes

- **Header/Footer** existent en 2 versions : `layout/Header.tsx` (React) + `astro/Header.astro`. Toute modif doit être faite dans les 2.
- **shadcn-ui** (`src/components/ui/`) : ne pas modifier manuellement
- **types.ts** (`src/integrations/supabase/`) : auto-généré, ne pas modifier
- **Alias** : `@/` → `src/`
- **Interface** en français, **code** en anglais
- **Params dynamiques** : `[id].astro` et `[slug].astro` — les composants React extraient les params de `window.location.pathname`
- **Commandes** : `npm run dev` | `npm run build` | `npm run preview` | `npm run lint`
