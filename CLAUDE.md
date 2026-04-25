# CLAUDE.md — VerifierMonDevis.fr

Plateforme d'analyse de devis d'artisans + module **GérerMonChantier**. Stack : Astro 5 + React 18 islands + Supabase + Tailwind/shadcn-ui · Vercel (`@astrojs/vercel`, `output: 'static'`).

## 📚 Où trouver quoi

Ce fichier = **règles + pièges + décisions récentes** pour ne pas casser quand on code. C'est tout. Les tableaux exhaustifs (routes, tables, composants) sont **ailleurs** :

| Tu cherches… | Fichier |
|---|---|
| **Ce que l'utilisateur peut faire** (features prod, point de vue user) | [`FEATURES.md`](FEATURES.md) |
| **Ce qui est en cours / pas fini / idée** (OpenClaw, dette, backlog) | [`WIP.md`](WIP.md) |
| **Référence technique exhaustive** (toutes les routes, schéma DB, pipeline, deploy) | [`DOCUMENTATION.md`](DOCUMENTATION.md) |
| **Règles + pièges + décisions** | ← ce fichier |

**Si tu ajoutes une info** :
- Un user peut faire ça aujourd'hui ? → `FEATURES.md`
- C'est partiellement fait, en réflexion, dette ? → `WIP.md`
- C'est exhaustif et stable (route, table, composant) ? → `DOCUMENTATION.md`
- C'est une règle / un piège / une décision récente que Claude doit savoir ? → ici

### Workflow obligatoire à chaque session

1. **Quand on commence un truc nouveau** (feature, refacto, exploration) → ajouter une entrée 🟡 dans `WIP.md` immédiatement.
2. **Quand on finit et que ça marche en prod** → déplacer l'entrée WIP vers `FEATURES.md` (en retirer du WIP).
3. **Quand on bloque** ou qu'on change d'avis → mettre 🔴 dans WIP avec la raison.
4. **Quand on change un comportement, une règle, une décision** qui doit survivre les sessions → ajouter ici (CLAUDE.md, sections "Pièges connus" ou "Règles importantes").
5. **Quand on ajoute un truc structurel** (route API, table DB, edge function, composant majeur) → mettre à jour `DOCUMENTATION.md`.

À l'ouverture d'une session : **toujours ouvrir `WIP.md`** pour reprendre là où on s'était arrêté. Si l'utilisateur dit "on bosse sur X", on commence par `WIP.md` pour voir si X y est déjà.

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

- **2.5-flash "thinking" budget** : ce modèle utilise une partie du `max_tokens` pour son raisonnement interne. Avec `max_tokens: 4096`, le thinking peut consommer ~3000 tokens → JSON tronqué → parsing échoue → toutes les lignes dans "Autre". Solution : `max_tokens: 32768` pour `extract.ts`, **16384 minimum** pour l'agent orchestrator.
- **2.5-flash trop créatif pour le catalogue** : invente des `job_types` qui n'existent pas dans `market_prices`. Solution : utiliser **gemini-2.0-flash** pour `market-prices.ts` + validation serveur stricte.
- **2.5-flash réécrit les textes** lors de l'extraction. Solution : instruction explicite "COPIE MOT POUR MOT" + template JSON avec "TEXTE EXACT copié mot pour mot depuis le devis".
- **Prompt "plus de types = mieux"** a causé 1 groupe par ligne de devis. Solution : cibler explicitement 3-7 groupes avec regroupement large.
- **gemini-2.5-flash sur message court "oui"** après une longue proposition assistant → retourne content vide et `completion_tokens:0`. Compensation dans `index.ts` : injection système "l'utilisateur CONFIRME, appelle le tool maintenant".

### Frontend / React

- **React hooks après conditional return (Error #310)** : dans `AnalysisResult.tsx`, les hooks (`useState`, `useRef`) doivent être déclarés AVANT tout `if (loading) return`. Sinon React voit un nombre de hooks différent entre renders → crash production.
- **Flexbox overflow** : un `flex-1` sans `min-w-0` permet aux enfants de dépasser le conteneur. Toujours ajouter `min-w-0` sur les div `flex-1` contenant du texte long.
- **Stale closure dans setState** : dans `usePlanning.ts` (et autres hooks d'état complexe), toujours `setState(s => ...)` pour lire l'état courant dans les callbacks. Fermer sur la variable d'état donne une version figée.

### Astro / Vercel

- **Astro 5 `output: 'hybrid'` supprimé** : utiliser `output: 'static'` avec un adapter — les pages avec `export const prerender = false` sont rendues côté serveur automatiquement.
- **Variables d'env Vercel côté client** : seules les variables préfixées `PUBLIC_` sont exposées au client. `VITE_SUPABASE_URL` ne marche pas → `PUBLIC_SUPABASE_URL` et `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- **Fire-and-forget sur serverless ne marche pas** : Vercel coupe la fonction dès que la réponse HTTP est envoyée. Pour un side-effect critique (cache invalidation, write DB), `await` est obligatoire — sinon le write peut être perdu en plein vol.

### Supabase / DB

- **ES256 JWT et `verify_jwt`** : Supabase Auth signe les JWT avec ES256, le runtime edge function ne le supporte pas → "Invalid JWT". Solution : `verify_jwt = false` dans `config.toml` + déployer avec `--no-verify-jwt`. Chaque fonction admin vérifie le rôle manuellement.
- **RLS sur tables côté frontend** : les edge functions bypass RLS via `service_role_key`, mais le frontend utilise `anon key`. Si on requête une table sans policy SELECT pour `anon` depuis le client, on obtient un tableau vide **sans erreur**. Toujours vérifier qu'une policy `anon` existe.
- **RLS nouvelles tables — wrapper auth.uid()** : `auth.uid()` appelé seul = 1 éval par ligne. Toujours écrire `(select auth.uid())` dans les nouvelles policies. Voir migrations `20260226` et `20260401400000` pour les patterns corrects.
- **Planning API — batch DB** : utiliser `Promise.all` pour les UPDATE simultanés sur `lots_chantier`. Les boucles `for` séquentielles peuvent provoquer des deadlocks Postgres sous charge.
- **`lots_chantier.updated_at` ne s'auto-update pas** : pas de trigger. Si on a besoin de tracker un changement par horodatage, soit ajouter un trigger soit `update({...payload, updated_at: new Date().toISOString()})`.

### Edge functions

- **Logs — fuites de secrets** : les `catch` blocks peuvent logger des objets Error contenant des clés API ou Bearer tokens. Solution : toujours `error.message` (pas l'objet complet) + masquer avec regex `Bearer\s+[a-zA-Z0-9_.-]+` → `Bearer ***`.

### Module Chantier — pièges spécifiques

- **`contacts_chantier` colonnes** : la colonne téléphone est `telephone` (pas `phone`), le rôle est `role` (pas `metier`). `context.ts` agent doit utiliser `c.telephone` et `c.role`.
- **`paymentEventsRes` clé** : GET `/payment-events` retourne `{ payment_events: [...] }`, pas `{ data: [...] }`. Toujours accéder via `res?.payment_events`.
- **`tools.ts` priorite enum** : doit être `["urgent", "important", "normal"]` — jamais `"low"` (rejeté silencieusement par `taches.ts`).
- **WhatsApp messages — `group_id TEXT`** : `chantier_whatsapp_messages.group_id` est un TEXT stockant le JID brut (ex: `120363xxxxx@g.us`), **pas** un UUID FK vers `chantier_whatsapp_groups`. Intentionnel — la table messages est antérieure à la table groups. Ne pas migrer en UUID FK sans plan de migration des données.
- **Planning D&D — ne pas reset `delai_avant_jours=0`** : la position visuelle du drag DOIT être convertie en `delai_avant_jours` (jours ouvrés depuis le predecessor.date_fin OU startDate). Sinon le serveur CPM recompute à zéro et la modif visuelle ne persiste pas. Cf. `PlanningTimeline.handleLotMoveWithLane`.
- **`arrange_lot` legacy → modèle DAG** : `arrange_lot` doit écrire dans `lot_dependencies` (pas seulement `ordre_planning`) et forcer `lane_index = ref.lane_index` pour `chain_after`. Sinon le CPM ignore la nouvelle structure et la lane visuelle saute en haut.

---

## Règles importantes

- **Git workflow — main only** : jamais de branches `claude/<nom>-<hash>` ni de worktrees. Commit et push directement sur `main`. Ne pas utiliser `superpowers:using-git-worktrees` sur ce projet.
- **Header / Footer** existent en 2 versions : `layout/Header.tsx` (React) + `astro/Header.astro`. Toute modif doit être faite dans les **2**.
- **shadcn-ui** (`src/components/ui/`) : ne pas modifier manuellement (exception documentée : `button.tsx` contient `touch-manipulation` dans la base CVA).
- **types.ts** (`src/integrations/supabase/`) : auto-généré, ne pas modifier. Régénérer : `npx supabase gen types typescript --project-id vhrhgsqxwvouswjaiczn > src/integrations/supabase/types.ts`.
- **Alias** : `@/` → `src/`.
- **Interface** en français, **code** en anglais.
- **Params dynamiques** : `[id].astro` et `[slug].astro` — les composants React extraient les params de `window.location.pathname`.
- **Commandes** : `npm run dev` | `npm run build` | `npm run preview` | `npm run lint`.

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

État P0 mobile cockpit → voir `WIP.md`.

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
- Dates **dérivées** via tri topologique (Kahn) + forward pass (`src/lib/planningUtils.ts`).
- API `/api/chantier/[id]/planning` : GET / PATCH (recompute global), `/shift-lot` (cascade ou détaché).
- Frontend : `PlanningTimeline.tsx` (Gantt drag/resize), `usePlanning.ts` (state + reqSeqRef anti-rollback réseau).

### Agent IA orchestrator (Pilote de Chantier)
- Edge function `agent-orchestrator` (Gemini 2.5-flash, function calling).
- **Mode** configurable par user : `edge_function` (défaut) | `openclaw` (en cours, voir WIP.md) | `disabled`.
- Triggers : upload document, message WhatsApp, email entrant, affectation lot, cron 19h Paris.
- Tools agent disponibles : `update_planning`, `shift_lot`, `arrange_lot`, `register_expense`, `mark_lot_completed`, `send_whatsapp_message`, `create_task`, `complete_task`, `log_insight`, `request_clarification` (+ outils lecture). Détail dans `tools.ts`.
- **Pas de cache contexte** (supprimé 2026-04-23) — fresh fetch à chaque appel via `context.ts` avec timeouts AbortController.
- Auth inter-service : `requireChantierAuthOrAgent` accepte JWT user OU header `X-Agent-Key`.

### Catégorie `frais` (déclaration sans pièce)
- `documents_chantier.depense_type` étendu à `'frais'` (CHECK constraint élargi).
- Tool agent `register_expense` (défaut `frais`). UI distincte : badge ambre 📝, section "Frais annexes déclarés" dans LotDetail / IntervenantsListView, catégorie dans DocumentsView, exclus de l'alerte "Devis manquant".

### Fil d'activité Assistant chantier (24h)
- Onglet Assistant en 2 colonnes : chat à gauche, `AgentActivityFeed` à droite.
- Mélange tool_calls mutateurs + agent_insights du jour, **reset à minuit Paris**.
- API `/api/chantier/[id]/assistant/activity-feed`. Auto-refresh 20s.
- Digest journal quotidien (19h) annexe au markdown body 3 sections : ⚙️ Décisions / ⚠️ Alertes / ❓ Clarifications.

---

## TODO → voir [`WIP.md`](WIP.md)

Toutes les features en cours, partiellement implémentées, idées et dette technique sont centralisées dans **`WIP.md`** à la racine du repo. À mettre à jour à chaque session quand on commence/finit/bloque quelque chose.
