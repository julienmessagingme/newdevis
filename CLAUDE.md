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
| `/blog` | `blog/index.astro` | `BlogApp` → `Blog` |

## Ajouter une page

1. `src/components/pages/MaPage.tsx` — composant React
2. `src/components/app/MaPageApp.tsx` — wrapper `<ReactApp><MaPage /></ReactApp>`
3. `src/pages/ma-page.astro` — `<MaPageApp client:only="react" />` avec `export const prerender = false`

## Organisation du code

- **`lib/*Utils.ts`** : Logique métier externalisée par domaine (`entrepriseUtils`, `devisUtils`, `securiteUtils`, `contexteUtils`, `urbanismeUtils`, `architecteUtils`, `blogUtils`, `scoreUtils`). Les composants `analysis/Block*.tsx` importent depuis ces fichiers.
- **`components/admin/`** : Module blog admin complet (`BlogPostList`, `BlogPostEditor`, `BlogDialogs`, `blogTypes`)
- **`components/funnel/`** : Tunnel de conversion (`FunnelStepper`, `PremiumGate`)
- **`components/analysis/`** : 18 composants dont `DocumentRejectionScreen`, `ExtractionBlocker`, `OcrDebugPanel`
- **`supabase/functions/analyze-quote/`** : Pipeline modulaire (7 fichiers : `index`, `extract`, `verify`, `score`, `render`, `n8n`, `utils`, `types`)
- **Hooks** : 5 hooks dont `useAnonymousAuth.ts` (auth anonyme)

## Règles importantes

- **Header/Footer** existent en 2 versions : `layout/Header.tsx` (React) + `astro/Header.astro`. Toute modif doit être faite dans les 2.
- **shadcn-ui** (`src/components/ui/`) : ne pas modifier manuellement
- **types.ts** (`src/integrations/supabase/`) : auto-généré, ne pas modifier
- **Alias** : `@/` → `src/`
- **Interface** en français, **code** en anglais
- **Params dynamiques** : `[id].astro` et `[slug].astro` — les composants React extraient les params de `window.location.pathname`
- **Commandes** : `npm run dev` | `npm run build` | `npm run preview` | `npm run lint`
