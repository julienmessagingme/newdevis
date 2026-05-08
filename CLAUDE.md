# CLAUDE.md — VerifierMonDevis.fr

Plateforme d'analyse de devis d'artisans + module **GérerMonChantier**. Stack : Astro 5 + React 18 islands + Supabase + Tailwind/shadcn-ui · Vercel (`@astrojs/vercel`, `output: 'static'`).

## 📚 Où trouver quoi

Ce fichier = **règles + pièges + décisions récentes** pour ne pas casser quand on code. C'est tout. Les tableaux exhaustifs (routes, tables, composants) sont **ailleurs** :

| Tu cherches… | Fichier |
|---|---|
| **Ce que l'utilisateur peut faire** (features prod + pain résolu + avantage marché + détail des 7 agents IA) | [`FEATURES.md`](FEATURES.md) |
| **Ce qui est en cours / pas fini / idée** (OpenClaw, dette, backlog) | [`WIP.md`](WIP.md) |
| **Référence technique exhaustive** (toutes les routes, schéma DB, pipeline, deploy) | [`DOCUMENTATION.md`](DOCUMENTATION.md) |
| **Plan de test E2E agent IA** (10 scénarios + cas d'erreur, avec 3 numéros WhatsApp GMC `+33633921577`/USER/ARTISAN + outils debug SQL) | [`TEST-PLAN-AGENT-IA.md`](TEST-PLAN-AGENT-IA.md) |
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

- **verdictEngine V3 — anomalies pondérées par poids (2026-05-06)** : `computeWeightedAnomalies(priceData, totalDevis)` dans `verdictEngine.ts` calcule poste par poste le poids des anomalies (> 30% au-dessus du marché) dans le total HT. `VerdictInput.weighted_anomalies` alimente `computeVerdict` : poids < 20% → signer, 20-50% → a_negocier, ≥ 50% → refuser. **Ne pas revenir à `overprice_pct` global pour les décisions prix** — il fausse le verdict sur les devis avec un seul poste cher isolé. Appelé dans `AnalysisResult.tsx` (client) et `conclusion.ts` (serveur).

- **TDZ (Temporal Dead Zone) dans les edge functions et composants React** : tout `const`/`let` déclaré APRÈS son utilisation dans le même scope → `ReferenceError: Cannot access 'X' before initialization`. En prod, Vite renomme les variables → message illisible ("Cannot access 'G' before initialization"). Trois cas vécus : (1) `effectiveScore` useMemo référençant une variable déclarée 250 lignes plus bas dans `AnalysisResult.tsx`, (2) `isMultipleQuotes` déclaré ligne 871 utilisé ligne 672 dans `analyze-quote/index.ts`, (3) `preMajorAnomalies` déclaré dans un bloc `else` utilisé hors de ce bloc dans `conclusion.ts`. **Avant tout refacto sur ces fichiers** : vérifier l'ordre de déclaration des variables utilisées dans les useMemo et les early-exit.

- **Wording "Comptes non déposés" → "Comptes non accessibles" (2026-05-06)** : le wording accusatoire "comptes non déposés depuis X années / obligation légale" a été remplacé par "Comptes non accessibles publiquement" + contexte pédagogique (déclaration de confidentialité = procédure légale fréquente) + badge ORANGE au lieu de ROUGE. Fichiers concernés : `score.ts`, `render.ts`, `BlockEntreprise.tsx`, `entrepriseUtils.ts`. Le filtre de détection dans `entrepriseUtils.ts` cherche désormais `"comptes non accessibles"` (pas `"comptes non déposés"`).

- **verdictEngine — source de vérité unique (règle absolue, 2026-05-01)** : `src/lib/verdictEngine.ts` est le SEUL endroit où la logique de verdict est écrite. Utilisé dans `conclusion.ts` (serveur, override du verdict LLM) ET dans `AnalysisResult.tsx` (client, `effectiveScore`). **Ne jamais** écrire une logique de verdict locale dans un composant ou une route API — importer `computeVerdict`. Helpers à réutiliser : `computeMarketBounds`, `countMajorAnomalies`, `extractFlagsFromCriteria`, `extractCompanyRisk`, `extractCompanyStatusFromCriteria`, `normalizeCompanyStatus`.

- **Entreprise à risque juridique → verdict REFUSER forcé (règle absolue, 2026-05-03)** : une entreprise en cessation, liquidation, redressement judiciaire ou radiée force un verdict REFUSER **sans exception**, indépendamment du prix, des anomalies, de l'ancienneté ou du score global. Implémenté en priorité 0 dans `computeVerdict()` via le champ `company_status` de `VerdictInput` + `normalizeCompanyStatus()`. `extractCompanyStatusFromCriteria(criteres_rouges)` extrait le statut brut depuis les critères. `hard_block_reason === "company_status"` distingue ce cas du hard block classique (flags). **Ne jamais placer cette logique dans un composant ou le LLM** — uniquement dans `verdictEngine.ts`. Test unitaire : `npx tsx src/lib/verdictEngine.test.ts` (27 cas, 0 régression). Anti-régression : une entreprise "active" avec prix attractif doit toujours produire "signer".

- **effectiveScore figé si `conclusion_ia` null au chargement** (bug détecté 2026-05-01, commit `bb7a9a1`) : quand `analysis.conclusion_ia` est null (première visite, conclusion pas encore générée), `effectiveScore` se calcule à partir de `analysis.score` uniquement. Quand `ConclusionIA` génère ensuite le verdict, il ne met à jour que son propre state local — `analysis` dans le parent n'est jamais mis à jour. Fix : prop `onVerdictReady(rawJson)` dans `ConclusionIA` → `setConclusionIaLive(rawJson)` dans `AnalysisResult` → `effectiveScore` utilise `conclusionIaLive ?? analysis.conclusion_ia`. **Ne pas supprimer `onVerdictReady`** ni `conclusionIaLive`.

- **Unités forfait françaises non reconnues** (bug détecté 2026-05-01, commit `6e9ea11`) : `"F"` et `"fft"` sont des abréviations courantes de "forfait" dans les devis BTP français. `FORFAIT_UNIT_KEYWORDS` ne contenait que le mot complet → les groupes `"Dépose carrelage 2F"` traités comme tarifs unitaires → comparaison m² invalide → fausses anomalies. Fix : ajouter `"f"`, `"fft"`, `"ff"`, `"ens"` dans `FORFAIT_UNIT_KEYWORDS` (`conclusion.ts`) et `FORFAIT_UNITS` (`market-prices.ts`).

- **Fourniture+pose vs hors-fourniture** (bug détecté 2026-05-01, commit `96fae4c`) : Gemini peut choisir `carrelage_sol_mo` (hors-fourniture) même quand les descriptions contiennent "Fourniture pose". La validation Level 1 accepte car l'identifiant existe dans le catalogue → comparaison fausse. Fix serveur dans `market-prices.ts` étape 3b-bis : si descriptions contiennent "fourniture" + "pose" et job_type se termine par `_mo` → remplace par `_fourniture_pose` si l'entrée catalogue existe. **Ne pas supprimer cette étape.**

- **Message générique "Si < 8 m² le prix est élevé…" même quand la surface est connue** : symptôme = `hasSurfaceUnitMismatch()` retourne `true` sur un groupe de pose (unité = forfait) même si une ligne "achat matériaux" du même groupe précise la surface en m². Cause : la fonction vérifiait uniquement l'unité du groupe (`main_unit`), pas les `devis_lines` individuelles. **Fix dans `src/pages/api/analyse/[id]/conclusion.ts`** : `extractKnownSurface(lines)` scanne les `devis_lines` du groupe — si au moins une ligne a une unité m² avec une quantité > 0, `hasSurfaceUnitMismatch()` retourne `false` et le message générique n'est pas injecté. **Ne pas supprimer ce guard** : sans lui, tout devis carrelage/parquet avec pose forfait + achat m² séparés déclenche un faux message de mise en garde.

### Frontend / React

- **React hooks après conditional return (Error #310)** : dans `AnalysisResult.tsx`, les hooks (`useState`, `useRef`) doivent être déclarés AVANT tout `if (loading) return`. Sinon React voit un nombre de hooks différent entre renders → crash production.
- **Flexbox overflow** : un `flex-1` sans `min-w-0` permet aux enfants de dépasser le conteneur. Toujours ajouter `min-w-0` sur les div `flex-1` contenant du texte long.
- **Stale closure dans setState** : dans `usePlanning.ts` (et autres hooks d'état complexe), toujours `setState(s => ...)` pour lire l'état courant dans les callbacks. Fermer sur la variable d'état donne une version figée.
- **Admin visualisant l'analyse d'un tiers → redirect home** : `AnalysisResult.tsx` filtrait `.eq("user_id", user.id)`. Si admin ouvre l'analyse d'un autre utilisateur → 0 résultats → redirect. Fix (commit `56e4100`) : vérification admin role **inline** dans `fetchAnalysis` (pas via le state async `isAdmin`), puis query sans filtre `user_id` si admin. Sur not-found en mode admin → redirect vers `/admin`, pas vers home.
- **Props manquantes dans sous-composants internes → crash prod masqué** (bug détecté 2026-05-06, commit `fcd1908`) : `ConclusionDisplay` (composant interne de `ConclusionIA`) utilisait `onCopy?.()` dans `handleCopy` sans que `onCopy` soit dans ses propres props. En dev : pas d'erreur visible (TypeScript signalait `Cannot find name 'onCopy'` mais sans bloquer). En prod (code minifié) : Vite renomme `onCopy` en `G` → `ReferenceError: Cannot access 'G' before initialization` → crash page blanche. Fix : ajouter `onCopy?: () => void` aux props de `ConclusionDisplay` + le passer depuis `ConclusionIA`. **Règle** : toujours corriger les erreurs TypeScript sur les composants d'analyse — en prod, un nom de variable manquant devient une lettre aléatoire et le message d'erreur devient illisible.

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
- **VersementsDrawer — loading loop sur prop instable** : `loadEvents` ne doit JAMAIS dépendre de `knownEventIds` ni `sourceIds` passés comme props, car ces tableaux sont recréés à chaque render de BudgetTab. Utiliser `useRef` pour capturer les props instables et les lire dans le callback sans les inclure en dépendance. Sans ça : chaque `onRefresh()` déclenche un re-render BudgetTab → nouveau tableau → `loadEvents` change d'identité → `useEffect` reffire → `setLoading(true)` → spinner masque le formulaire.
- **Authorization header dans les fetch chantier** : toujours `Authorization: \`Bearer ${bearer}\`` (avec le préfixe "Bearer "). Un `Authorization: bearer` (sans préfixe) retourne 401 silencieux — le `catch` vide masque l'erreur.
- **Cohérence financière — 5 chiffres clés (2026-05-07)** : le modèle mental est Budget cible → Engagé → Décaissé → À payer → Flux certains. `Décaissé = budget API totaux.paye + totaux.acompte` (PAS la somme des factures payées depuis `documents`). `À payer = budget API totaux.a_payer`. `Flux certains = Décaissé + À payer`. Ne jamais utiliser `totalPaye` (factures seulement) pour représenter le décaissé — toujours l'API budget. Cf. `FEATURES.md § 22` pour le modèle complet.

- **`budgetReel` — source unique de vérité (2026-05-07)** : un seul chiffre, 3 couches de sync. (1) localStorage `budget_reel_${chantierId}` — prioritaire au démarrage dans BudgetTab ET ChantierCockpit. (2) Custom event `budgetReelChanged` — propagation temps réel entre composants (dispatché par TresorerieView ET BudgetTab). (3) DB double : `chantiers.budget` (via PATCH `enveloppePrevue`) ET `chantiers.metadonnees.tresoreieFinancing.budgetReel`. **Ne jamais écrire `budgetReel` dans un seul endroit** — toujours via `persistBudgetReel` (BudgetTab) ou `setCfg+syncServer` (TresorerieView) qui alimentent les deux destinations. `autoUpdateBudget: boolean` dans `FinancingConfig` — après 1ère confirmation manuelle, les dépassements flux certains > budget se corrigent automatiquement sans popup.

- **`PaymentDetailPanel` — split d'échéance (2026-05-07)** : clic sur une ligne d'échéance → panel inline avec contexte document (total/déjà payé/cette échéance), autres termes, édition montant+date+libellé. Si montant réduit → badge "Solde restant X€" + date obligatoire → PATCH terme courant + POST `addToDocument` pour le reste. **Ne pas modifier la logique de détection du split** (`remainder > 1 && newAmount < originalAmount * 0.99`) — en dessous du seuil 1€ on ne crée pas de terme fantôme.

- **`EntreeRow` édition inline (2026-05-07)** : clic sur la ligne → formulaire inline (type, libellé, montant, date, statut). `data-no-edit` sur les boutons toggle/delete pour ne pas déclencher l'édition. Libellé vide au save → fallback `SOURCE_CFG[source_type].label` (même règle que l'ajout). PATCH API `/entrees` accepte désormais `source_type` en plus des autres champs.

- **`BudgetKpiDashboard` — 4 KPIs canoniques (2026-05-08)** : Budget cible · Décaissé · À régler · À venir. Grid mobile = 2 cols, desktop = 4 cols. `À venir = max(0, devis_valides - facture)` représente ce que l'artisan va encore facturer. **Ne jamais retirer le KPI "À venir"** : sans lui, l'utilisateur n'a pas de visibilité sur les engagements signés non encore concrétisés en facture. Le bug `devisValides` undefined (ReferenceError silencieux ligne 538 du `pctDecaisse >= 100 && devisValides > 0` check) a été corrigé en déclarant explicitement `const devisValides = totaux?.devis_valides ?? 0;` en haut du composant — toujours déclarer ces alias au début, jamais inline dans le JSX.

- **`buildRow.reste` — formule défensive (2026-05-08)** : `reste = facture > 0 ? max(0, facture - totalPaye) : max(0, devis_valides - totalPaye)`. **Ne jamais revenir** à `reste = max(0, facture - totalPaye)` seul : sur un devis signé sans facture émise mais avec acompte versé, l'ancienne formule retournait 0 (le `Math.max(0, ...)` masquait l'acompte). La nouvelle formule reflète le vrai engagement restant : si pas de facture, le reste à payer = montant du devis - acomptes déjà versés.

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
| `src/lib/brand.ts` | `detectBrandFromHost(host)` (server-side) + `getBrand()` (client) + `VMD_CONFIG` / `GMC_CONFIG` (titres, sous-titres, redirect par défaut) |
| `src/lib/gmcAccess.ts` | `hasGmcAccess(email)` — **source unique** de l'allowlist GMC. Aujourd'hui hardcodée `["julien@messagingme.fr", "bridey.johan@gmail.com"]`. À remplacer par lecture DB quand on ouvrira GMC. |
| `src/lib/postLoginRedirect.ts` | Helper post-login : calcule la cible naturelle selon `hasGmcAccess`, fait SSO handoff cross-brand si nécessaire, fallback hard redirect. |
| `src/lib/ssoHandoffClient.ts` | `navigateToGmc(targetPath)` : pour les liens VMD-side qui doivent envoyer l'utilisateur sur gmc.fr (e.g. bandeau "Mon chantier" sur le tableau de bord). |
| `src/lib/signOut.ts` | `signOutCrossDomain()` : déco serveur-side `scope: 'global'` + redirect chain pour vider localStorage de l'autre origin. |
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

## TODO → voir [`WIP.md`](WIP.md)

Toutes les features en cours, partiellement implémentées, idées et dette technique sont centralisées dans **`WIP.md`** à la racine du repo. À mettre à jour à chaque session quand on commence/finit/bloque quelque chose.
