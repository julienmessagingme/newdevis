# WIP — Features en cours, à finir, à valider

Document vivant — état réel des chantiers en cours sur GérerMonChantier. Différent de `FEATURES.md` qui décrit ce qui MARCHE en prod. Ici on liste ce qui est commencé sans être complètement fini, les idées en discussion, les dettes techniques, et les choses à valider après le prochain déploiement.

**Légende** :
- 🟢 Quasi prêt — manque test ou polish
- 🟡 En route — moitié fait, sait ce qui manque
- 🟠 En réflexion — décidé mais pas commencé
- 🔴 Bloqué / à arbitrer
- ✅ Fait → à archiver à la prochaine revue

---

## NEW. Audit structure code — étapes 1-4 + 7 livrées, suite à programmer

🟢 **Étapes 1-4 + 7 livrées 2026-05-08/09**. Voir CLAUDE.md section "Structure du code" pour le layout final.

### Livré
- ✅ **Étape 1** (`cf359fd`) : `DashboardPremium` (wrapper de 34 lignes inutile) inliné, `DashboardUnified.tsx` → `ChantierCockpit.tsx`. Dead state nettoyé dans ChantierDetail.
- ✅ **Étape 2** (`cf359fd`) : `EcheancierRefonte.tsx` → `Echeancier.tsx`.
- ✅ **Étape 3** (`65e6cb4`) : `cockpit/` partitionné — 47 fichiers à plat → 9 sous-dossiers (`assistant/`, `budget/`, `contacts/`, `documents/`, `financing/`, `lots/`, `messagerie/`, `planning/`, `tresorerie/`).
- ✅ **Étape 4** (`b1de1d2`) : `DashboardWidgets.tsx` (8 exports dont 5 dead) supprimé, les 3 utilisés inlinés dans DashboardHome.
- ✅ **Étape 7** (`5d6ff19` + `8b07ec1`) : `lib/` partitionné — 38 fichiers à plat → 6 sous-dossiers (`analyse/`, `chantier/`, `auth/`, `integrations/`, `api/`, `blog/`). 249 imports mis à jour automatiquement (sed) dans 164 fichiers consommateurs.

Bilan TS pour les 5 étapes : **0 nouvelle erreur introduite**. Le repo a perdu ~600 lignes de code mort (DashboardPremium + DashboardWidgets dead exports + dead state ChantierDetail) et tout est rangé par domaine.

### Reste à faire

Étapes 5, 6, 8, 9, 10 (BudgetTab, Trésorerie consolidation, Header×3, AnalysisResult, tests) → [`TODO.md`](TODO.md) section "Refacto code".

---

## NEW. Saisie de dépenses unifiée — 1 seul chemin d'écriture

🟢 **Livré 2026-05-09 (commits `0a9dc03` Bug A + `dfda27c` Option 2). À valider E2E par Julien.**

### Problème d'origine identifié par Julien
1. **Bug A** : ISO & FACE 64 (devis 43 508 € en `en_cours`) faisait gonfler le KPI Décaissé à 119% du budget cible (88 138 € au lieu de ~18 000 € attendus). Cause : les `evDevisPaid` (paiements rattachés au devis via Échéancier) étaient ajoutés à `bucket.totaux.acompte` même quand le devis n'était pas signé.
2. **Bug B** : Dépenses créées dans Échéancier ("Matériau carrelage 10 000 €", "maçon au black 5 000 €") invisibles dans Budget et Accueil. Cause : `cashflow_extras` orphelins (`manuel: true`, `source_id null`) → filtre `.not('source_id', 'is', null)` les exclut.
3. **Bug C (architectural)** : 3 chemins de saisie indépendants (Échéancier / Budget / Accueil) avec modèles de stockage différents → 3 vérités qui ne se parlent pas.

### Livré

**Bug A — `acompte_pending` séparé**
- `budget.ts` : nouveau champ `totaux.acompte_pending` distinct de `acompte`. Si devis non signé → l'acompte versé alimente `acompte_pending` (l'argent est sorti mais ne fausse pas le KPI Décaissé).
- BudgetTab : bannière orange dédiée "X € d'acomptes versés sur des devis non signés — signez le devis pour les inclure dans le suivi".

**Option 2 — Échéancier devient une vue projetée**
- Le bouton "+ Dépense" de l'Échéancier ouvre désormais le **DepenseRapideModal du Budget** (lots fetchés lazy via `/api/chantier/[id]/lots`).
- Toute dépense saisie crée une vraie ligne `documents_chantier` (facture + depense_type + lot_id) → visible immédiatement dans Budget ET Accueil.
- L'ancienne `AddDepenseModal` (POST `/payment-events` `manuel: true` → `cashflow_extras` orphelins) supprimée.

**Synchro inter-écran via event `chantierBudgetChanged`**
- `BudgetTab.useBudgetData` : `refresh` wrappé → dispatch après chaque `load` 
- `Echeancier` : listener qui refresh `payment_events` + entrées
- `BudgetTab` : listener qui re-fetch budget data
- → saisie dans Échéancier apparaît dans Budget sans recharger ; modif dans Budget remonte dans Échéancier

### À valider E2E par Julien

- [ ] Sur le chantier "Portail, Clôture et Terrasse Bois" — recharger après deploy : KPI Décaissé doit baisser (acomptes ISO & FACE 64 sortis), bannière orange "X € d'acomptes versés sur des devis non signés" affichée.
- [ ] Test 1 : créer une dépense via "+ Dépense" Échéancier → onglet Budget → la voir apparaître immédiatement (sans F5) dans le tableau.
- [ ] Test 2 : modifier statut d'une facture dans Budget → onglet Échéancier → la voir mise à jour.
- [ ] Test 3 : signer le devis ISO & FACE 64 (changer statut) → bannière orange disparaît, montant bascule de `acompte_pending` vers `acompte` → KPI Décaissé reflète maintenant l'argent réellement engagé.

### Migration data des cashflow_extras orphelins existants (optionnelle)

Pour les chantiers déjà existants, les `cashflow_extras` créés avant ce fix restent orphelins. Pas de migration auto pour l'instant — l'utilisateur peut soit les supprimer manuellement, soit les rattacher à un lot via une UI à concevoir. À évaluer selon le volume.

---

## NEW. Audit Budget & Trésorerie — 8/10 atteint

🟢 **Vagues 1+2 livrées 2026-05-08 (commits `c063196` + `a9cfe67`). Cible 8/10 atteinte. Vague 3 = polish 9-10/10.**

### Score : ~8/10 (était ~5.5/10 avant audit)

### Vague 1 — livrée 2026-05-08
- [x] **4e KPI "À venir"** (devis signés non encore facturés, donut violet) + grid 2 cols mobile / 4 cols desktop
- [x] **Fix `devisValides` undefined** dans `BudgetKpiDashboard` (ReferenceError silencieux ligne 538)
- [x] **Formule `reste` corrigée** dans `buildRow` : si pas de facture, `reste = devis_valides - acomptes` au lieu de `0 - acompte`
- [x] **Auto-expand ≤4 lots** au 1er chargement + bouton "Tout développer / Tout réduire"
- [x] **`alertOverrun` visible dans la colonne FACTURÉ** : badge rouge "+XX€" si facture > devis × 1.05
- [x] **Terminologie cohérente** : "Budget de référence" → "Budget cible" dans TresorerieView

### Vague 2 — livrée 2026-05-08
- [x] **C1 · Devis non signés visibles** (impact MAX) — `budget.ts` n'exclut plus les devis `en_cours/recu`. Bannière ambre "X devis reçus en attente de signature". Lignes artisan en bg-amber-50/30 avec nom gris italique + badge Clock "À signer". Colonne ENGAGÉ montant grisé italique + sous-label "non signé". `buildArtisanGroups` filtre `isSigned()` avant agrégation pour ne pas gonfler le total engagé.
- [x] **C2 · Empty state pédagogique** — Tableau desktop vide : icône + "Pilotez votre budget en 3 étapes" + 3 cartes cliquables (Ajouter devis / Saisir dépense / Définir budget cible). Variante mobile simplifiée.
- [x] **C3 · Apport "calculé" explicite** — Badge "calculé" + tooltip détaillant la formule `budget - crédit - aides` + sous-label "ce qu'il vous reste à apporter". Évite que l'utilisateur prenne ce résidu pour une mesure.

### Vague 3 — polish pour 9-10/10 (optionnelle)

- [ ] **C4 · Mobile audit visuel sur 2 chantiers types** (~1h)
  - Vérifier KPIs grid 2x2 lisibles à 360px (iPhone SE) sur un chantier vide et un chantier dense
  - Vérifier que la bannière "X devis en attente" + ActionBar ne s'empilent pas mal
  - Capturer screenshots pour archive

- [ ] **C5 · `DonutRing` dupliqué** (~30min, dette technique)
  - Composant défini dans `BudgetTab.tsx` (ligne ~315) et `TresorerieView.tsx` (ligne ~305) avec signatures différentes (`track` prop). Extraire dans `src/components/chantier/cockpit/shared/DonutRing.tsx`.

- [ ] **C6 · Tests E2E sur 5 scénarios chantier types** (~3h)
  - (1) Chantier vide → empty state visible
  - (2) Chantier avec 2 devis en_cours uniquement → bannière + lignes en attente
  - (3) Chantier avec mix signés + pending + factures → table mixte
  - (4) Facture > devis × 1.05 → badge "+XX€" rouge dans colonne FACTURÉ
  - (5) Acompte versé sur devis sans facture → reste = devis - acompte (pas 0)

### Notes sur le scoring

- 5.5/10 → fonctionnel mais bugs visibles (devisValides ReferenceError, reste à 0 sur acompte, devis pending invisibles)
- 6.5/10 → bugs corrigés + KPI "À venir" comble le manque le plus visible (vague 1)
- **8/10 → devis pending visibles + empty state + apport clarifié (vague 2 — atteint)**
- 9-10/10 → mobile audit + DonutRing factorisé + tests E2E (vague 3, optionnelle)

---

## NEW. Onglet Assistant chantier — refacto 3 colonnes + cohérence badges sidebar

🟢 **Livré 2026-05-08 — à tester E2E.**

### Problème d'origine
- Badge sidebar `Assistant chantier` affichait `⚠ 2 actions` en comptant des factures à régler + devis à valider — mais ces actions ne sont **pas** dans l'onglet Assistant. Click sur le badge → page sans contenu lié → confusion.
- L'onglet Assistant était en 2 colonnes (chat + feed unifié décisions+alertes mélangées), pas en 3 (Alertes / Chat / Décisions séparés).

### Livré
- **`AssistantTriPane.tsx`** (nouveau) — 3 colonnes desktop + tabs mobile (Alertes / Chat / Décisions). `AgentActivityFeed.tsx` supprimé (remplacé).
- **Alertes (gauche, 300px)** = `agent_insights` du hook `useAgentInsights` partagé. Click ligne = `markAsRead`. Bouton "Tout marquer lu" si non-lus > 0.
- **Chat (centre)** = `ChantierAssistantChat size="full"` inchangé.
- **Décisions IA (droite, 300px)** = tool_calls mutateurs du jour, source `/api/chantier/[id]/assistant/activity-feed`, auto-refresh 20s, reset à minuit.
- **Cohérence badges sidebar** dans `ChantierCockpit.tsx` — `urgentActions` splitté en `factureActions` + `devisActions` + `agentInsights.unreadCount` :
  - Badge `documents` → `⚠ N` devis à valider (au lieu du compteur total qui était noise)
  - Badge `tresorerie` → **NEW** `⚠ N` factures à régler
  - Badge `assistant` → `⚠ N alertes` (rouge si critical, orange sinon, ✓ OK vert sinon)
  - Le KPI home "actions en attente" garde le total `urgentActions = factureActions + devisActions`.

### À valider
- [ ] Sur un chantier avec factures `recue` + devis `recu` + insights non lus → 3 badges distincts dans sidebar (documents, tresorerie, assistant)
- [ ] Click sur "Assistant chantier" → 3 colonnes visibles (lg) ou tabs (mobile)
- [ ] Click sur une alerte non-lue → passe en lu (point bleu disparaît)
- [ ] "Tout marquer lu" décrémente le badge sidebar à 0 → repasse à `✓ OK`

---

## NEW. Landing publique gerermonchantier.fr + multi-domaine + SSO cross-domaine

🟢 **Livré 2026-05-07/08 — en prod, à valider E2E par Julien.**

### Architecture finale (déviation du plan initial)

Plan initial = "rewrite Vercel edge + un seul build". Ça n'a pas marché : `vercel.json` rewrites avec `has.host` ne s'appliquaient pas à la racine `/` car l'adapter Astro sert son `index.html` directement et bypass les rewrites Vercel pour ce path.

**Solution livrée** : middleware Astro `src/middleware.ts` qui intercepte uniquement `/` et fait un 302 vers `/gmc-home` quand le host est gerermonchantier. Pour permettre au middleware de tourner au runtime, `index.astro` est passé à `prerender = false` (la home VMD devient SSR — coût perf léger, mitigé par edge cache).

### Composants livrés

**Landing GMC (gerermonchantier.fr/)** :
- `src/pages/gmc-home.astro` (prerendered)
- `src/components/gmc-landing/` : Header, Logo, Hero, HouseIllustration (SVG animé), HowItWorks (toggle "Je démarre / J'ai déjà mes devis" avec hash anchor `#etapes-start`/`#etapes-resume`), Features, PiloteSection (avec OpenClaw + MCP), Pricing (toggle mensuel/annuel), FinalCTA, Footer
- Image hero : 1Mo PNG → 84KB AVIF + 47KB AVIF mobile (480w) via `<picture>` srcset

**Pages d'auth brandées par host** :
- `connexion.astro`, `inscription.astro`, `mot-de-passe-oublie.astro`, `reset-password.astro` lisent `Astro.request.headers.get('host')` côté serveur et passent la prop `brand` au composant React
- `Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx` acceptent prop `brand` (avec fallback `getBrand()` si non fournie)
- `BrandLogo.tsx` : SVG inline GMC OU image WebP VMD selon brand
- `BaseLayout.astro` : nouveau prop `siteName` pour adapter `og:site_name`

**SSO handoff cross-domaine** :
- `POST /api/sso/handoff` : génère magic link Supabase (admin API, pas d'email envoyé) avec `redirectTo` sur l'autre origine
- `src/lib/postLoginRedirect.ts` : helper post-login (Login.tsx + auth/callback.astro)
- `src/lib/ssoHandoffClient.ts` : helper pour les liens VMD vers /mon-chantier (Dashboard, layout/Header, AnalysisResult, SimulateurAidesCard)
- `auth/callback.astro` accepte `next` param + délègue au helper

**Logout cross-domaine** :
- `src/lib/signOut.ts` : `signOutCrossDomain()` (global scope + redirect chain pas iframe car CSP `frame-ancestors 'none'`)
- `src/pages/auth/clear-session.astro` : page cible de la redirect chain (whitelist d'origines validée anti open-redirect)
- Bouton Déconnexion ajouté dans : `gmc-landing/Header.astro` (user dropdown), `astro/Header.astro` (existant), `layout/Header.tsx` (existant), `chantier/cockpit/Sidebar.tsx`, `pages/MonChantierHub.tsx`, `chantier/nouveau/ScreenPrompt.tsx`

**Tracking acquisition** :
- `signup_source` (`verifiermondevis` | `gerermonchantier`) envoyé au webhook `/api/webhook-registration` pour analytics. Whitelist côté API anti-pollution.

### Pré-requis prod (à vérifier)

- Supabase Dashboard → Auth → URL Configuration → Redirect URLs contient :
  - `https://gerermonchantier.fr/auth/callback?next=*`
  - `https://www.gerermonchantier.fr/auth/callback?next=*`
  - `https://www.verifiermondevis.fr/auth/callback?next=*`
  (Julien a confirmé avoir ajouté.)

### Fix loop auth GMC↔VMD (2026-05-08)

Trois bugs corrigés qui créaient une boucle : login gmc.fr → vmd.fr → gmc.fr landing → vmd.fr…

**Bug 1 — `postLoginRedirect.ts`** : quand `currentBrand === 'gmc'` et `hasGmcAccess() === false`,
l'user était renvoyé sur vmd.fr (SSO handoff inverse). Fix : si on est sur gmc.fr → toujours `/mon-chantier`,
sans vérifier l'allowlist. Le contrôle d'accès GMC est géré côté middleware Astro, pas dans le helper.

**Bug 2 — `Header.astro` (VMD)** : les deux hrefs "Mon Chantier" pointaient vers `gerermonchantier.fr/`
(landing) au lieu de `gerermonchantier.fr/mon-chantier`. Corrigé. Le click handler ne vérifie plus
l'allowlist : SSO handoff pour tous les users connectés (le contrôle d'accès vit côté GMC).

**Bug 3 — `GoogleSignInButton.tsx` + `Login.tsx`** : `GoogleSignInButton` utilisait
`callbackUrl.searchParams.set("redirect", ...)` → URL générée = `/auth/callback?redirect=/mon-chantier`.
La whitelist Supabase est `?next=*`. Mismatch silencieux → Supabase ignore `redirectTo` → repasse
sur Site URL (vmd.fr). Fix : param renommé `"next"`. Sur gmc.fr, `Login.tsx` force
`redirectAfter = '/mon-chantier'` si pas de redirect explicite, pour toujours avoir `?next=` dans l'URL.

**Prérequis Supabase (confirmé OK par Julien)** :
`https://gerermonchantier.fr/auth/callback?next=*` dans Auth → URL Configuration → Redirect URLs.

### À valider E2E (browser)

- [ ] Login Julien sur vmd.fr/connexion → URL bascule sur gerermonchantier.fr/mon-chantier (handoff)
- [ ] Click bandeau Chantier sur vmd.fr/tableau-de-bord → idem (handoff)
- [ ] Login Julien sur gmc.fr/connexion → **reste sur gmc.fr/mon-chantier** (pas de handoff inutile, pas de boucle)
- [ ] Click "Mon Chantier" sur vmd.fr (connecté) → SSO handoff → gmc.fr/mon-chantier ✓
- [ ] Click "Mon Chantier" sur vmd.fr (non connecté) → gerermonchantier.fr/mon-chantier (login là-bas)
- [ ] Logout depuis gmc.fr ou vmd.fr → user déco des deux domaines (rouvrir l'autre, vérifier /connexion)
- [ ] Bouton Déconnexion visible sur gmc.fr/ (Espace dropdown), gmc.fr/mon-chantier (sidebar), gmc.fr/mon-chantier/nouveau (header)

### Reste à faire (v2)

- Migration DB `signup_source` + `has_gmc_access` (aujourd'hui = allowlist hardcodée dans `src/lib/gmcAccess.ts`)
- Image OG dédiée `og-gmc.png` (1200x630) — actuellement la landing GMC utilise hero-illustration.png comme OG
- Bouton "Importer mes devis VMD" sur la landing GMC → flow cross-app
- Sitemap.xml dédié pour gerermonchantier.fr
- Webhook email `/api/webhooks/inbound-email.ts` : ligne 273 génère URL hardcodée `https://www.verifiermondevis.fr/mon-chantier/...` — à brand-adapter pour les chantiers GMC
- Quand Stripe sera prêt : remplacer la logique allowlist par vraie souscription, proposer 15j gratuits aux non-allowlistés qui cliquent "Mon chantier"

---

## 22. Multi-devis — PDF contenant plusieurs artisans

🟢 **Architecture complète + 7 règles de fiabilité implémentées (2026-05-04). À déployer + valider.**

RÈGLE ABSOLUE : UN PDF MULTI-ENTREPRISE = N ANALYSES INDÉPENDANTES.

### Ce qui est fait (sessions 2026-05-03 → 2026-05-04)

#### Architecture initiale (2026-05-03)
- `verdict-utils.ts` (nouveau) : copie Deno-compatible de `verdictEngine.ts`
- `index.ts` phase 2.5 : analyse par segment, stocke `segment_analyses` + `global_metrics` dans `raw_text`
- `MultiDevisBlock.tsx` : verdicts par artisan, badge global, récap vert/orange/rouge
- `AnalysisResult.tsx` : parse `segment_analyses` + `global_metrics`, `effectiveScore` multi

#### 7 règles de fiabilité (2026-05-04)

**RÈGLE 1 — Matching STRICT** (`verdict-utils.ts` → `attributeGroupsToSegments`):
- Remplace l'ancien fuzzy token-overlap par 3 niveaux déterministes :
  - Niveau 1 : exact match `normalizeStrict(devis_line.description)` = `normalizeStrict(seg.lignes.libelle)`
  - Niveau 2 : fallback `lot_type` du groupe vs `lot_type` du segment
  - Niveau 3 : fallback proportionnel (segment le plus volumineux) + warning
- Libellés ambigus (même texte chez 2 artisans) marqués `-1` → pas d'attribution silencieuse
- Logs `[MultiDevis] WARN` explicites pour chaque fallback

**RÈGLE 4 — Agrégation stricte** (`computeGlobalFromSegments`):
- `verdict_global` = worst verdict (inchangé)
- `overprice_total` / `overprice_pct` = calculé UNIQUEMENT sur segments avec `has_market_data = true`
- `total_devis_ht` = Σ ALL segments (inchangé, pour information complète)
- Avant : les segments hors-catalogue gonflaient le surcoût calculé

**RÈGLE 5 — LLM contraint** (`conclusion.ts`):
- Mode multi-devis détecté via `document_detection.multiple_quotes + segment_analyses`
- `preEngine` construit depuis `global_metrics` (pas recalculé depuis `priceData` mélangé)
- Bloc `multiDevisBlock` injecté dans le prompt :
  - Verdicts par artisan avec nom, lot_type, total, écart marché
  - Liste des artisans à risque
  - Contraintes LLM strictes : INTERDIT "cohérent" si ≥1 à risque, INTERDIT "signer" si verdict ≠ signer
  - LLM explicite que `verdict_global` est PRÉ-CALCULÉ, il ne le redécide pas
- Contexte entreprise adapté : "N artisans (voir détail ci-dessus)" au lieu d'un seul nom

**RÈGLE 3+6 — Source unique de vérité UI** (`AnalysisResult.tsx`):
- `effectiveScore` multi-devis lit `globalMetrics.verdict_global` directement
- Mapping inline `verdict_global → VERT/ORANGE/ROUGE` (pas via `score_legacy`)
- Élimine toute dépendance à un champ intermédiaire

### À déployer
- [ ] `supabase functions deploy analyze-quote` (verdict-utils.ts modifié)
- [ ] `vercel deploy` (conclusion.ts + AnalysisResult.tsx)

### À valider après déploiement
- [ ] PDF test (14 devis, 11 artisans, ~223k€ HT) : vérifier logs `[MultiDevis]` dans Supabase Dashboard
- [ ] Vérifier que chaque artisan a son verdict indépendant dans sa card
- [ ] Vérifier que 0 warning WARN = matching exact niveau 1 pour tous les groupes
- [ ] Vérifier que `global_metrics.verdict_global` = worst verdict des segments
- [ ] Cas test RÈGLE 7 : 3 segments (bon + surévalué + critique) → 3 verdicts distincts + global = refuser

### Restant
- Vérification SIRET par artisan (aujourd'hui = seulement le 1er artisan vérifié)
- Export PDF résumé multi-artisans

---

## 21. Plan UX/UI — Amélioration continue GMC (Audit 2026-05-02)

🟡 **En cours — corrections critiques priorisées une par une, validées par le Product Owner.**

Audit complet → voir [`UX-AUDIT.md`](UX-AUDIT.md) (baseline + historique des itérations).
Backlog des items pas encore commencés → voir [`TODO.md`](TODO.md).

### Problèmes critiques — historique

| # | Problème | Statut | Commit |
|---|----------|--------|--------|
| C1 | Bouton direct "Enregistrer paiement" sur chaque ligne artisan | ✅ Fait | `6be85c8` |
| C2 | Supprimer messages techniques de l'UI (legacy, migrer, cashflow) | ✅ Fait | `c697b3c` |
| C3 | KPIs header orientés action (X€ à payer, alertes) | ✅ Fait | `c588f59` |
| C4 | État vide + progression d'onboarding | ✅ Fait | `62234d9` |

### Problèmes importants — historique

| # | Problème | Statut |
|---|----------|--------|
| I1 | Statut "En litige" = confirmation requise | ✅ Fait 2026-05-09 (panel inline + raison ≥ 10 chars) |
| I2 | Sous-lignes devis masquées par défaut dans Budget | ✅ Fait `ebe745c` |
| I4 | "Reste" en orange → neutre sauf retard réel | ✅ Fait `2d16ca2` (desktop) + 2026-05-09 (mobile) |
| I6 | Dépense rapide mieux visible | ✅ Fait 2026-05-03 |

I3 (Surface persistante Assistant IA) et I5 (Vue expert toggle) → `TODO.md`.

### AUDIT #2 — sprint correctifs 2026-05-09

10 fixes livrés en une session (Vague A + B + C). Score global 6.7 → 7.6/10.

**Corrigés** : N1 (reste mobile gris) · N3 (bandeau 5 KPIs canoniques en Trésorerie) · N4 (cue visuel split échéance) · N5a (sidebar 280px mobile + safe-area) · N6a (touch targets 44×44) · N6b (PanneauDetail safe-area) · N6c (inputMode numeric durée) · N7 (code mort `cfg.tvaOn`) · I1 (confirmation litige) · I4 (reste mobile, régression partielle audit #1).

Items pas attaqués (jugés trop risqués pour la session "no breaking") déplacés dans [`TODO.md`](TODO.md) : I3, I5, N5b (cards intervenants mobile), N5c (touch events Planning), pencil edit LotDetail.

Voir [`UX-AUDIT.md`](UX-AUDIT.md) "Sprint correctifs 2026-05-09" pour le détail.

---

## 21bis. Phase F — Dashboard `/admin/marketing` (gerermonchantier-marketing)

🟢 **Code livré 2026-05-03. Tests TS/build OK sur les nouveaux fichiers. Reste : config env Vercel + DNS + smoke prod.**

Suite des phases A/0/B/C/D/E livrées dans le repo `gerermonchantier-marketing` (cf wip.md là-bas). C'est l'UI admin qui consomme l'API FastAPI marketing pour permettre à Julien de gérer les carrousels générés par les agents IA (lister, prévisualiser, télécharger ZIP, marquer publié, kill switch).

### Architecture livrée

**Sécurité — proxy serveur obligatoire (delta vs spec wip.md du repo marketing)**
La spec disait "fetch côté frontend avec sb_publishable_*". Refusé : aurait exposé `MARKETING_API_BEARER_TOKEN` dans le bundle JS. Toutes les requêtes passent par des routes Astro server-side qui :
1. Vérifient JWT user + rôle admin (helper `requireAdmin`)
2. Appellent FastAPI avec le Bearer token côté serveur
3. Pour les requêtes Supabase (liste/détail posts), utilisent `service_role` + `.schema('marketing' as never)` puisque le types.ts auto-généré ne couvre que le schema `public`.

**Routes API créées** (toutes sous `/api/admin/marketing/`) :
- `GET /status` — proxy `/api/status` (kill switch + recent_runs + ready_to_publish)
- `POST /kill-switch` — proxy avec validation reason obligatoire si pause + cap 500 chars
- `GET /posts` — Supabase direct, filtres status/persona/platform/dates avec whitelist serveur
- `GET /posts/[id]` — détail + assets jointes
- `GET /posts/[id]/zip` — stream proxy (forward body + Content-Disposition + Content-Length)
- `POST /posts/[id]/publish` — proxy mark-published

**Page UI** : `/admin/marketing.astro` → `AdminMarketingApp` → page React `AdminMarketing` avec :
- KillSwitchToggle (icône état + dialog pause avec reason obligatoire)
- 4 cartes KPI rapides (affichés / approuvés / publiés / rejetés-failed)
- Filtres : status / persona / platform / dates (avec reset)
- Liste posts (table avec covers thumbnails)
- Dialog détail : CarouselPreview (slide-by-slide avec dots) + caption + hashtags + CTA + boutons download ZIP / mark-published

**Pattern réutilisable** : nouveau helper `src/lib/adminAuth.ts:requireAdmin(request)` factorise le check JWT + role admin (réutilisable pour futures routes admin).

**Bouton "Marketing"** ajouté à `AdminHeader.tsx` à côté de "Blog" (pattern cohérent).

### Code review effectuée (règle Julien)

3 findings, tous fixés :
- **HIGH** `AdminMarketing.tsx` : un seul useEffect `[fetchStatus, fetchPosts]` re-déclenchait `fetchStatus` à chaque changement de filtre. Split en 2 useEffects.
- **MEDIUM** `KillSwitchToggle.tsx` : affichait "Système actif" pendant le loading initial (status null) → trompeur. Ajout d'un état "Vérification en cours".
- **MEDIUM** `kill-switch.ts` route serveur : pas de cap longueur sur `reason` (le frontend mettait `maxLength=500` mais un appel direct API bypassait). Cap serveur 500.

### Reste à faire côté Julien (config infra, hors code newdevis)

Cf `gerermonchantier-marketing/todo.md` Phase E/F :
- [ ] DNS Cloudflare `marketing.messagingme.app` → 146.59.233.252 (Proxied + SSL Full strict)
- [ ] Build + run du container marketing-agents sur le VPS (RUNBOOK sections 2→6)
- [ ] **Côté newdevis (Vercel)** : ajouter 2 env vars
  - `MARKETING_API_URL` = `https://marketing.messagingme.app` (ou `http://localhost:8082` en dev)
  - `MARKETING_API_BEARER_TOKEN` = même valeur que `API_BEARER_TOKEN` côté FastAPI
- [ ] Smoke test : ouvrir `/admin/marketing`, vérifier que la liste des posts s'affiche (vide au début, normal), vérifier que le kill switch toggle fonctionne, lancer un run de DRY_RUN=true côté FastAPI, télécharger le ZIP du premier post généré.

### Pièges connus

- **MARKETING_API_BEARER_TOKEN ne doit JAMAIS être préfixé `PUBLIC_` ni `VITE_`.** Sinon il finirait dans le bundle JS client. Le helper `marketingApi.ts` lit `process.env.MARKETING_API_BEARER_TOKEN ?? import.meta.env.MARKETING_API_BEARER_TOKEN` — Vercel injecte via `process.env` au runtime.
- **Schema Supabase non typé** : les requêtes `.schema('marketing' as never)` perdent les types Supabase. On cast les rows manuellement via les types dans `src/types/marketing.ts`. Si un champ DB change, mettre à jour ce fichier.
- **Stream ZIP** : la route `/zip.ts` retourne `new Response(upstream.body, ...)`. Sur Vercel Node runtime OK, surveiller le timeout fonction (60s Pro, 300s avec `maxDuration`). Pour un carrousel ~5MB largement OK.
- **Validation date_to** : `${dateTo}T23:59:59.999Z` est UTC, donc le filtre coupe la dernière heure en heure française. Acceptable pour un dashboard interne.

### Backend marketing — état infra (mise à jour 2026-05-03)

Le déploiement Phase E (backend Python sur VPS) est **LIVE** :
- URL : `https://marketing.messagingme.app`
- Container `gmc-marketing-agents` Up healthy sur VPS OVH (NPM proxy id=13, cert LE id=14)
- Scheduler in-process actif, premier tick auto demain 9h Paris en `DRY_RUN=true`
- Env vars Vercel (MARKETING_API_URL + MARKETING_API_BEARER_TOKEN) chargées par Julien

Du coup côté Phase F : il ne reste plus que le smoke prod après push sur Vercel (ouvrir `/admin/marketing`, vérifier que la liste s'affiche, tester kill switch toggle, télécharger un ZIP quand un post sera créé).

---

## 20. Bug versements Budget — unification + fix source de vérité

✅ **Implémenté et déployé (2026-04-30). Commits `payment-events.ts` + `VersementsDrawer.tsx` + `BudgetTab.tsx` → push `00a2046`.**
✅ **Bug complémentaire corrigé (2026-05-02). Commit `531ed07` — bouton "Paiement" (sans facture) ne passait pas `primaryDocumentId` → versements allaient dans `cashflow_extras` (source_id=null) → invisibles dans Budget. Fix : on passe maintenant `primaryDocumentId: artisan.devis[0].id` + `primaryDocumentType: 'devis'` → versements sauvegardés dans `cashflow_terms` du devis → comptabilisés dans la colonne Payé.**

### Problèmes constatés (rapport user 2026-04-30)

1. **Bouton "+ Ajouter un versement" ne fait rien (ou quasi rien)** — `VersementsDrawer`
2. **Modifier un acompte sur une facture écrase l'acompte précédent** — input inline `BudgetTab`
3. **Deux flows différents pour la même action** — input inline facture vs VersementsDrawer

### Diagnostic technique

#### Bug #1 — Loading loop dans VersementsDrawer

`loadEvents` est un `useCallback` qui dépend de `knownEventIds`. BudgetTab passe `knownEventIds` comme `[...eventIds, ...allPendingEvents.map(e => e.id)]` — **nouvelle référence tableau à chaque render**. Quand BudgetTab re-render (ex: `onRefresh` appelé), `knownEventIds` change d'identité → `loadEvents` change → `useEffect` reffire → `setLoading(true)` → le contenu est remplacé par le spinner → l'état `showForm` (qui a été mis à `true` par le clic) est masqué ou perdu dans la foulée.

Même problème avec `sourceIds` : `artisan.devis.map(d => d.id)` = nouvelle référence à chaque render.

Second bug silencieux : `Authorization: bearer` (sans préfixe `Bearer `) → 401 probable sur l'API → `setLoading(false)` quand même → spinner disparaît → liste vide → pas d'erreur affichée.

#### Bug #2 — Inline acompte écrase la valeur précédente

`saveInlineAcompte` fait `PATCH /api/chantier/[id]/documents/[factureId]` avec `{ factureStatut: 'payee_partiellement', montantPaye }`. C'est un simple `UPDATE documents_chantier SET montant_paye = X`. La valeur précédente est perdue. Pas de cumul, pas d'historique.

#### Bug #3 — cashflow_extras sans source_id ne s'affichent pas dans le Budget

`VersementsDrawer` crée des `cashflow_extras` via `POST { manuel: true }`. L'API insère dans `cashflow_extras` **sans** `source_id`. La VIEW `payment_events_v` (branche 3) expose ces extras avec `source_id = null`. Budget API filtre `.not('source_id', 'is', null)` → les cashflow_extras sans source_id sont exclus de `eventsPayeByDoc` → la colonne "Payé" du Budget ne change pas après un versement. C'est pour ça que "rien ne se passe" visuellement.

#### Architecture source de vérité (rappel)

| Couche | Source | Budget l'utilise ? |
|--------|--------|--------------------|
| `cashflow_terms` JSONB dans `documents_chantier` | devis/facture versements | ✅ oui (branche 2 VIEW) |
| `cashflow_extras` | mouvements manuels flottants | ❌ non (branche 3, source_id=null) |
| `documents_chantier.montant_paye` | legacy acompte facture | ✅ fallback si pas cashflow_terms |

Pour qu'un versement impacte le Budget → il doit être dans `cashflow_terms` du document source.

### Plan d'implémentation

#### 1. `payment-events.ts` — Nouveau variant POST `addToDocument`

```typescript
if (body.addToDocument === true) {
  // Appende un term dans documents_chantier.cashflow_terms
  // Génère un event_id UUID (pour compatibilité VIEW branche 2)
  // Si sourceType = 'facture' + status = 'paid' :
  //   recalcule montant_paye = sum(cashflow_terms paid) + amount
  //   updates facture_statut = 'payee' | 'payee_partiellement'
}
```

#### 2. `VersementsDrawer.tsx` — 3 fixes

- **Stabiliser loadEvents** : `useRef` sur les props instables (sourceIds, knownEventIds) + `refreshKey` state. loadEvents ne dépend plus de props changeantes.
- **Fixer Authorization header** : `Authorization: bearer` → `Authorization: \`Bearer ${bearer}\``
- **Ajouter props** `primaryDocumentId?: string` + `primaryDocumentType?: 'devis' | 'facture'` : quand fournis, `addVersement()` utilise `addToDocument: true` au lieu de `manuel: true`

#### 3. `BudgetTab.tsx` — Unification

- **Étendre le type `versementsDrawer`** : ajouter `primaryDocumentId?` + `primaryDocumentType?`
- **Remplacer l'inline acompte facture** : clic sur "Saisir acompte" / "acompte: Xk€" → `setVersementsDrawer({ ..., primaryDocumentId: primaryFacture.id, primaryDocumentType: 'facture' })` au lieu d'ouvrir l'input inline
- **Supprimer `saveInlineAcompte`** (la fonction qui fait le PATCH direct `montant_paye`)
- `saveInlineAcompteDevis` (pour devis sans facture) → inchangé (utilise correctement payment_events PATCH)

### Fichiers à modifier

| Fichier | Changement |
|---------|------------|
| `src/pages/api/chantier/[id]/payment-events.ts` | Nouveau variant POST `addToDocument` |
| `src/components/chantier/cockpit/VersementsDrawer.tsx` | Fix loading loop + auth header + props primaryDocument |
| `src/components/chantier/cockpit/BudgetTab.tsx` | Unification facture → VersementsDrawer, suppression saveInlineAcompte |

### Ce qui NE change PAS

- `saveInlineAcompteDevis` (devis sans facture) — déjà correct via PATCH payment_events
- L'API `PATCH payment-events` — inchangée
- La VIEW `payment_events_v` — inchangée (cashflow_terms branche 2 gère déjà les event_id stables)
- Le flow Échéancier — inchangé

---

## 25. verdictEngine V1→V3 — moteur de verdict déterministe

✅ **V1 déployée (2026-05-01, commit `f462dcc`). V3 pondérée déployée (2026-05-06, commit `7a45610`).**

### V1 — Source de vérité unique (2026-05-01)
Résout la contradiction entre badge header et ConclusionIA. `src/lib/verdictEngine.ts` est le seul endroit où le verdict est calculé — importé par `conclusion.ts` (serveur) et `AnalysisResult.tsx` (client).

### V3 — Anomalies pondérées par poids dans le devis (2026-05-06)
Résout les faux verdicts "Refuser" causés par un poste isolé cher sur un devis globalement correct. Nouvelle fonction `computeWeightedAnomalies()` : analyse poste par poste, calcule le poids de chaque anomalie dans le total HT. Verdict basé sur `poids_anomalies` (< 20% = signer, 20-50% = négocier, ≥ 50% = refuser). Cf. `FEATURES.md § 20`.

### Règle absolue
Ne jamais recalculer le verdict ailleurs. Importer `computeVerdict` depuis `verdictEngine.ts`.

---

## 26. Fixes TDZ (Temporal Dead Zone) — crashes production (2026-05-06)

✅ **Corrigés et déployés. Commits `a4b6326`, `b36b1be`, `e280a10`.**

3 bugs TDZ distincts causant des crashes page blanche ou erreurs 502 :

1. **`AnalysisResult.tsx`** : `effectiveScore` useMemo référençait `documentDetection` (ligne ~767) déclaré après early returns. Fix : parse inline dans le useMemo.
2. **`analyze-quote/index.ts`** : `const isMultipleQuotes` déclaré à la ligne 871, utilisé à la ligne 672. Fix : déclaration déplacée avant l'utilisation.
3. **`conclusion.ts`** : `preMajorAnomalies` déclaré dans un bloc `else` (scope limité), utilisé hors du bloc. Fix : `let preMajorAnomalies = 0` avant le `if/else`.

---

## 27. Wording "Comptes non déposés" → neutre (2026-05-06)

✅ **Corrigé et déployé.**

Remplacement du wording accusatoire "Comptes non déposés depuis X années / obligation légale" par "Comptes non accessibles publiquement" avec contexte pédagogique (déclaration de confidentialité = pratique légale fréquente) et badge ORANGE au lieu de ROUGE. Modifié dans `score.ts`, `render.ts`, `BlockEntreprise.tsx`, `entrepriseUtils.ts`.

---

## 28. Alerte admin + maintenance automatique des analyses en erreur (2026-05-06)

✅ **Implémenté et déployé. Commit `d72587f`.**

Voir `FEATURES.md § 21` pour le détail fonctionnel.

### Architecture déployée
- Edge function `analysis-maintenance` (cron `*/15 * * * *`, retry max 2, fenêtre 4h)
- `alertAdminOnFailure()` dans `analyze-quote` — alerte immédiate Resend à la 1ère erreur
- Migration `20260506120000_analysis_maintenance_cron.sql` — à appliquer avec `npx supabase db push`
- Destinataires : `julien@messagingme.fr` + `bridey.johan@gmail.com`

### ⚠️ À faire
- Appliquer la migration cron : `npx supabase db push`

---

## 24. FeedbackModal post-analyse

✅ **Implémenté et déployé (2026-05-01). Commits `ec1daf1` → `e2604ba`.**

### Ce qui a été fait
- Composant `FeedbackModal.tsx` + hook `useFeedback()` — source de vérité unique
- Intégré dans `AnalysisResult.tsx` + prop `onCopy` dans `ConclusionIA` (trigger sur "Copier message")
- API route `POST /api/activate-chantier` — lit userId depuis JWT, écrit `user_metadata.gerer_mon_chantier_access`
- Tracking Amplitude : `feedback_open`, `feedback_choice`, `feedback_text`, `reward_activated`, `reward_skipped`, `trustpilot_click`

### À faire encore
- Supprimer l'ancien modal Trustpilot legacy (`showTrustpilotModal` dans `AnalysisResult.tsx`) une fois qu'on confirme que le nouveau flow couvre le même besoin
- Monitorer le taux de réponse et conversion Trustpilot via Amplitude
- Vérifier que `user_metadata.gerer_mon_chantier_access` est bien lu côté GMC pour débloquer l'accès

---

## 23. Score badge cohérence + fausses anomalies marché (devis KERN)

✅ **Corrigé et déployé (2026-05-01). Commits `bb7a9a1` → `6e9ea11`.**

### Problèmes corrigés

1. **Feu Vert header ≠ Feu Orange ConclusionIA** : `effectiveScore` lisait `parsed?.verdict` au lieu de `parsed?.verdict_decisionnel` → toujours `undefined` → badge jamais mis à jour. Fix : bon nom de champ + callback `onVerdictReady` dans `ConclusionIA` pour mettre à jour le badge dès la génération même si `conclusion_ia` était null au chargement.

2. **Fausse anomalie carrelage fourniture vs hors-fourniture** : Gemini choisissait `carrelage_sol_mo` pour "Fourniture pose dalle céramique". Validation Level 1 l'acceptait (identifiant exact dans catalogue). Fix : override serveur post-Gemini dans `market-prices.ts` — si descriptions contiennent "fourniture" + "pose" et job_type est `_mo` → swap vers `_fourniture_pose`.

3. **Fausses anomalies unité forfait "F"** : `"F"` (abréviation française de "forfait" dans les devis BTP) non reconnu → comparaison m² invalide → anomalies fantômes sur "Dépose carrelage 2F", "Habillage escalier 2F". Fix : ajout de `"f"`, `"fft"`, `"ff"`, `"ens"` dans `FORFAIT_UNIT_KEYWORDS` (`conclusion.ts`) et `FORFAIT_UNITS` (`market-prices.ts`).

---

## 21. Hallucinations analyse devis — entête entreprise + escalier + surfaces

✅ **Corrigé et déployé (2026-04-30). Commit `a9bd773`.**

### Problèmes constatés

1. **"Pompe + filtre piscine" halluciné** sur un devis de pavage/escalier : la société KERN TERRASSEMENT a "Piscine" dans son en-tête commercial. Gemini lisait cet en-tête et assignait `categorie: "piscine"` → domaine piscine déclenché → catalogue `pompe_piscine` inclus → groupes inventés.
2. **"Pose monte-escalier"** au lieu de "Carrelage escalier" : Gemini confondait "escalier" (maçonnerie/carrelage) avec l'entrée catalogue `monte_escalier` (équipement mécanique).
3. **Surface doublée** (136 m² au lieu de 65 m²) : plusieurs opérations sur la même surface physique additionnées à tort (fond de forme 65m² + concassé 65m² + pavé 65m² = 136 affiché).

### Fixes

- **`domain-config.ts` extractionSystemPrompt** : règle critique — `categorie` doit venir des lignes de travaux UNIQUEMENT, jamais de l'en-tête entreprise.
- **`domain-config.ts` marketPriceExpertPrompt** : 2 règles absolues — (1) en-tête entreprise ≠ travaux, (2) escalier maçonnerie/carrelage ≠ monte-escalier.
- **`market-prices.ts` filterRelevantPrices** : domaine `piscine` ne se déclenche plus sur le champ `category` (qui peut être contaminé par l'en-tête), seulement sur les `description` des lignes.
- **`market-prices.ts` règle VRD/pavage** : renforcée avec exemple explicite fond de forme + concassé + pavé = 1 seule surface.

---

## 1. Intégration OpenClaw (mode agent alternatif)

🟡 **Partiellement implémentée — utilisable mais incomplète.**

### Ce qui marche
- UI Settings (`Settings.tsx`) : choix du mode `edge_function` / `openclaw` / `disabled`, formulaire URL + token + agent_id
- API `/api/chantier/agent-config` GET/PUT pour persister la config
- Helper `triggerAgentIfOpenClaw(event)` dans `apiHelpers.ts` qui forward un event à l'instance OpenClaw du user

### Ce qui manque
- **Le chat user → OpenClaw n'est pas branché.** Quand l'utilisateur tape dans le chat de l'onglet Assistant, on appelle toujours `edge_function` (= notre Gemini). Si mode = openclaw, ses messages devraient être routés vers son instance OpenClaw, pas vers nous. Aujourd'hui le toggle openclaw ne change quasi rien côté chat.
- Triggers actifs uniquement sur :
  - Webhook WhatsApp entrant (`webhooks/whapi.ts`)
  - Webhook email entrant (`webhooks/inbound-email.ts`)
- Triggers manquants pour mode openclaw :
  - Upload de document
  - Affectation de lot à un document
  - Cron quotidien 19h (digest)
  - Création de chantier
- **Pas de feedback côté UI** : l'utilisateur ne sait pas si l'instance OpenClaw a bien reçu l'event ni si elle a répondu.
- Pas de page de doc pour expliquer comment configurer son instance OpenClaw (URL exposée publiquement, format event attendu, etc.)

### Décisions à prendre
- Quand mode = openclaw : on désactive complètement le chat edge_function, ou on offre les 2 (chat user → notre IA, événements → OpenClaw) ?
- Format événement standard à exposer (schéma JSON publique) ?

---

## 2. Suivi des décisions IA — fil d'activité

🟢 **Live mais à monitorer.**

### Ce qui marche (deployé 2026-04-25)
- Onglet Assistant en 2 colonnes (chat à gauche, fil d'activité à droite)
- Reset à minuit Paris
- Mélange tool_calls + agent_insights, tri chrono desc
- Auto-refresh toutes les 20s
- Daily digest 19h annexe maintenant 3 sections déterministes au journal (décisions / alertes / clarifications)

### À valider après usage réel
- L'affichage des libellés decisions (ex: "Lot décalé +5j (cascade)") couvre-t-il bien tous les cas d'usage ? Ajouter des branches dans `formatDecision()` au fur et à mesure des feedbacks.
- Le reset à minuit Paris utilise une approximation UTC+2 (DST). En hiver ça décale d'1h. Acceptable pour l'instant — à corriger si les utilisateurs voient apparaître des items "d'hier" entre minuit et 1h du matin.
- ✅ Auto-refresh 20s pause si onglet en background (2026-05-09) : `AssistantTriPane.tsx:380-405` écoute `visibilitychange`, stop le `setInterval` quand `document.hidden=true`, fetch immédiat de rattrapage au retour. Économise ~3 fetch/min par onglet inactif.

---

## 3. Catégorie "frais" — déclaration sans pièce jointe

🟢 **Live, à finir d'instrumenter.**

### Ce qui marche (deployé 2026-04-23)
- Tool agent `register_expense` avec dialogue "pour quel lot ?"
- Création / réutilisation auto d'un lot "Divers" si l'utilisateur n'a pas de lot précis
- Affichage dans Budget/Trésorerie (badge ambre "📝 X€ frais"), dans LotDetail (section dédiée), dans IntervenantsListView, dans DocumentsView (catégorie "Frais déclarés")
- API `/api/chantier/[id]/documents/depense-rapide` accepte auth agent
- Type `DepenseType` étendu, migration DB CHECK constraint en place
- `noDevis` ignore les frais (plus d'alerte "Devis manquant" sur frais isolés)

### Ce qui manque / améliorations
- **Bouton manuel "Déclarer un frais" depuis l'UI** (pas seulement via chat). Aujourd'hui un user qui n'utilise pas le chat ne peut pas en créer. Ajouter dans `DepenseRapideModal` une option "frais" et un raccourci dans l'onglet Budget.
- Pas de moyen de joindre une preuve a posteriori à un frais (transformer un frais en ticket_caisse une fois la pièce uploadée).
- Pas de section "Frais annexes" dans le tableau Budget agrégé du chantier (visible seulement par lot).

### ✅ Cohérence des 3 voies de saisie de dépense (résolu 2026-04-28)

Refactor en 5 PRs (PR1→PR5) — voir [`CASHFLOW-REFACTOR.md`](CASHFLOW-REFACTOR.md). Architecture finale :
- `documents_chantier.cashflow_terms` JSONB = source des versements de devis/facture
- `cashflow_extras` table = mouvements purs sans pièce (déblocage crédit, apport)
- VIEW `payment_events_v` = consommée par Échéancier/Trésorerie/Budget
- Table `payment_events` legacy supprimée

Plus de désync possible architecture-level. Frais visibles dans Échéancier (gain de feature). Statuts dérivés d'une seule règle.

À déplacer vers `FEATURES.md` après stabilisation des tests E2E.

---

## 4. Planning CPM — points restants

🟡 **Modèle solide mais features encore en route.**

Hérité de la session précédente (cf. CLAUDE.md "TODO — prochaine session") :

1. `chantier-qualifier` edge function : ajouter une question "date de démarrage souhaitée" lors de la création.
2. `LotIntervenantCard.tsx` : afficher "S3–S5 · 2 semaines" (semaine de début → semaine de fin) sur les cartes lot.
3. `LotDetail.tsx` : section Planning éditable inline (durée + recompute cascade visible).
4. `DashboardHome.tsx` : intégrer le `PlanningWidget` mini-Gantt entre la barre de progression et les recos IA.

### À valider en prod
- `arrange_lot` (chain_after / parallel_with) écrit maintenant dans `lot_dependencies` (au lieu de `ordre_planning` legacy). Vérifier en prod que la lane visuelle suit bien (corrigé 2026-04-23).
- D&D persiste `delai_avant_jours` correctement (corrigé 2026-04-23). Re-tester drag de Carreleur.

---


## 8. WhatsApp multi-groupes — feature complète mais peu testée prod

🟢 **Live, à valider en conditions réelles.**

Toute la chaîne marche en théorie :
- Création groupe via API whapi (`/api/chantier/[id]/whatsapp`)
- Stockage `chantier_whatsapp_groups` + `chantier_whatsapp_members`
- Webhook `whapi.ts` reçoit messages + events (join/leave)
- UI `WhatsAppGroupsPanel` + `WhatsAppThread` avec bulles colorées par rôle

Scénario prod à valider end-to-end : créer un groupe → vérifier que les membres apparaissent → recevoir un message → confirmer que les bulles s'affichent avec les bons rôles → tester le filtre par groupe.

---

## 9. Vue mobile — passes restantes

🟡 **En cours — refacto UX mobile "orienté action" (session 2026-05-03).**

### Fait (session 2026-05-03)
- ✅ ÉTAPE 1 : Table 9 colonnes cachée sur mobile (`sm:hidden`) — remplacée par cartes artisans
- ✅ ÉTAPE 2 : `ArtisanCardMobile` dans BudgetTab (nom, lot, budget, payé/restant, barre progression, boutons Payer/Voir)
- ✅ ÉTAPE 3 : `NextActionsMobile` en haut de DashboardHome — bloc "À faire" (€ à payer, devis à valider, intervenants sans devis) avec CTA "Voir mes actions"
- ✅ ÉTAPE 4 : Footer sticky mobile dans ChantierCockpit — CTA "👉 Continuer mon chantier"
- ✅ ÉTAPE 5 : Bandeau assistant sticky mobile — "💬 L'assistant a X recommandations →" si `totalAlertCount > 0`
- ✅ ÉTAPE 6 : KpiCard "Intervenants" masquée sur mobile (`hidden sm:block`)
- ✅ ÉTAPE 8 : BudgetProgressBars → bouton "Affiner" + bottom sheet détail par poste (mobile)

### Restant

Étapes 7, 9, 10 (touch targets 44px, AnalysisResult collapse mobile, homepage résultat visuel) + Planning Gantt mobile + ContactsSection/DocumentsView mobile → [`TODO.md`](TODO.md) section "Vue mobile — passes restantes".

---


## 12. Architecture agent IA — évolution

🟡 **En cours d'implémentation** (session 2026-04-26).

Diagnostic post-revue : l'archi actuelle (1 edge function Deno + Gemini function calling + boucle 3 rounds + history 20 msgs) est solide pour aujourd'hui mais va plafonner sur 3 axes : workflows multi-tour pendants, croissance du nombre de tools (17 → 25+), croissance du nombre de chantiers actifs.

**Pas de rewrite**, évolution incrémentale.

### 🔴 P1 — `agent_pending_decisions` table + tool `notify_owner_for_decision`
**Pourquoi maintenant** : sans store explicite, la feature "décision à prendre" (artisan demande +800€ → agent demande au user → user répond 4h plus tard) sera fragile. La conversation history (20 msgs) ne suffit pas comme mémoire.
**Quoi** : table `agent_pending_decisions(id, chantier_id, source_event, question, expected_action_payload jsonb, expires_at, status pending|resolved|expired|cancelled)` + tool `notify_owner_for_decision(question, action_payload, expires_in_hours)` qui crée la ligne + envoie WhatsApp privé. Quand le user répond OUI/NON dans le canal privé, l'orchestrator récupère la pending non-expirée la plus récente et exécute.

### 🟡 P2 — Modularisation `tools.ts`
**Pourquoi maintenant** : avec 25+ tools à venir, le switch/case dans 1 fichier de 842 lignes devient ingérable.
**Quoi** : split par domaine
```
supabase/functions/agent-orchestrator/tools/
  index.ts         ← dispatcher + ACTION_TOOLS guard
  read.ts          ← get_chantier_summary, get_chantier_data, etc.
  planning.ts      ← update_planning, shift_lot, arrange_lot
  documents.ts     ← move_document_to_lot, register_payment
  finance.ts       ← register_expense, add_payment_event
  comm.ts          ← send_whatsapp_message, send_email, notify_owner_for_decision
  scheduled.ts    ← schedule_reminder
  status.ts        ← update_lot_status, mark_lot_completed, update_devis_statut
  contacts.ts      ← update_contact
```
Chaque module exporte `{ schemas: [...], handlers: { name: handler } }`. L'index assemble.

### 🟢 P3 — `MAX_TOOL_ROUNDS = 8` + cap tokens cumulés
**Pourquoi** : un workflow type "Reçoit msg artisan → vérifie planning → propose au user → notif 2 autres artisans → update planning → add payment_event" = 5-7 tool_calls. Aujourd'hui MAX=3 → l'agent abandonne en plein milieu.
**Quoi** : passer à 8 rounds. Ajouter un cap `MAX_TOTAL_TOKENS_PER_RUN = 100000` pour couper net si emballement.

P4-P10 (Fan-out cron, POC Claude Sonnet, multi-agents, framework agent, state machine, canaux alternatifs) → [`TODO.md`](TODO.md) section "Architecture agent IA — évolutions à programmer".

---

## 13. Tools agent IA — vagues à implémenter

🟢 **Vagues 1, 2, 3 livrées 2026-04-26.** Reste à câbler (UI activation owner channel + 8 triggers proactifs) → [`TODO.md`](TODO.md).

### ✅ Vague 1 — LIVRÉE 2026-04-26

`register_payment` (matching A/B/C/D/E + match faible/fort), `update_devis_statut`, `move_document_to_lot`, `update_contact` (avec normalisation téléphone). Cf. `FEATURES.md § 14.B/C/D/E` pour le détail.

### ✅ Vague 2 — LIVRÉE 2026-04-26

`add_payment_event(label, amount, due_date)` (avec validation YYYY-MM-DD strict) et `send_email(contact_id, subject, body)` (rate-limit 5/contact/24h, sanitize CRLF subject, fallback userName via auth admin en mode agent). Cf. `FEATURES.md § 14.C` et `§ 14.G`.

### ✅ Vague 3 — LIVRÉE 2026-04-26

- **Canal WhatsApp privé owner** : flag `chantier_whatsapp_groups.is_owner_channel = true`, contrainte unique partial index. Tool `create_owner_whatsapp_channel`. Webhook whapi route les messages owner channel en mode `interactive` avec historique 20 derniers msgs restauré.
- **`schedule_reminder(due_at_local, tz, reminder_text, lot_id?)`** : table `agent_scheduled_actions` avec status `pending|firing|fired|cancelled|failed`. Cap 30 rappels pending par chantier. Format heure locale + tz côté agent — serveur convertit UTC via `Intl.DateTimeFormat` (gère DST).
- **`cancel_reminder(reminder_id)`** : annule un pending. L'agent voit la liste dans le contexte (limit 10 plus proches).
- **Edge function `agent-scheduled-tick`** : cron pg_cron toutes les 15min. Auth Bearer service_role OU X-Cron-Secret. RPC `claim_pending_reminders` avec FOR UPDATE SKIP LOCKED → atomic claim. Process parallèle batches 8.
- **Workflow décision à prendre** : tool `notify_owner_for_decision` (P1) + `resolve_pending_decision` (livrés round précédent). Section prompt "DÉTECTION DE DÉCISION À ARBITRER" et "DÉCISIONS EN ATTENTE".

### Reste à câbler

UI activation canal owner WhatsApp + 8 triggers proactifs → [`TODO.md`](TODO.md) section "Tools agent IA — vague 3 reste à câbler".

---

## 14. Versements échelonnés + cohérence Budget

✅ **Livré 2026-04-28, à valider en prod.**

### Ce qui a été livré
- **`VersementsDrawer.tsx`** : drawer slide-right plein écran mobile / 400px desktop. Affiche les versements passés (payés) + les échéances en attente liées à un artisan. Créer / modifier (label + montant + date) / supprimer chaque versement.
- **Règle plafond** : la somme des versements ne peut pas dépasser le budget engagé (cap validé à la saisie).
- **Prompt justificatif** : après chaque création de versement, invite à joindre un justificatif.
- **API `payment-events.ts`** : PATCH supporte `due_date` + `label`. POST supporte `paid: true`. DELETE endpoint ajouté.
- **Prop chain `initialEnveloppePrevue`** : `ChantierCockpit → TresoreriePanel → BudgetTab → BudgetKpiDashboard`. Valeur depuis `chantiers.enveloppe_prevue` (DB), plus d'auto-init localStorage.
- **`ticket_caisse` + `achat_materiaux` + `frais` = toujours Payé** : badge statique vert sans dropdown. Comptés en `paye` dans les totaux (plus de faux "à payer"). Plus d'alerte "Devis manquant" pour ces types.

### À valider
- Flux complet versements : créer → cashflow → modifier → supprimer → refresh immédiat.
- Cap plafond bloque bien un ajout dépassant le budget engagé.
- Un ticket de caisse n'apparaît plus dans le solde "à payer".

---

## 15. Fix analyse devis — géolocalisation ABF + prix marché

✅ **Déployé et validé en prod 2026-04-29 (commit final `02cdbbb`).**

### Géolocalisation ABF (`verify.ts`)
`if (hasAddressData)` — tente la géolocalisation dès qu'on a `code_postal` OU `ville` OU `adresse_chantier` (avant : bloqué si `code_postal` null).

### Prix marché (`market-prices.ts`) — fix complet validé
**Cause racine** : catalogue 470+ entrées envoyé entier à Gemini-2.0-flash → le modèle inventait des identifiants → tout finissait dans "Autre" → "Aucun poste avec référence de prix marché". L'Indice Stratégique Immobilier tombait aussi (il dépend des mêmes matched groups).

**Architecture de résolution — 3 couches indépendantes** :

**Couche 1 — Pré-filtrage catalogue** (`filterRelevantPrices`) :
- Détecte les domaines du devis via ~180 triggers de mots-clés
- Réduit 470+ → ~20-80 entrées avant l'appel Gemini
- Fallback : catalogue complet si < 8 entrées

**Couche 2 — Matching 5 niveaux sur les identifiants Gemini** :
- L1 exact (+ trim espaces)
- L2 normalized (lowercase + underscores)
- L3 préfixe bidirectionnel
- L4 token-boundary substring (`"pose_carrelage_sol_fourniture"` → `"carrelage_sol"`)
- L5 sémantique : scoring de tokens sur label + descriptions, indépendant du respect des identifiants

**Couche 3 — Fallback d'urgence** (`matchedGroups === 0`) :
- Si Gemini API fail, timeout ou JSON invalide → 0 groupes
- Matching direct par `categorie` des work items (issus de l'extraction Phase 1)
- Complètement indépendant de Gemini pour cette phase

---

## 18. Refonte UX écran d'analyse — unification source de vérité

✅ **Déployé 2026-04-30 (commits `eaacc07` → `b36c1c3`).**

### Problèmes corrigés
Plusieurs composants calculaient et affichaient indépendamment le verdict, le surcoût et les actions → contradictions frontales visibles par l'utilisateur.

### Structure avant / après

| Élément | Avant | Après |
|---|---|---|
| Verdict | 3 sources (Score Hero + GlobalAnalysisCard + ConclusionIA) | 1 seule (ConclusionIA) |
| Surcoût | 2 valeurs différentes (+10k–19k vs +13k–25k) | 1 seule (ConclusionIA) |
| Plan d'action | 2 listes indépendantes | 1 seule (ConclusionIA) |
| Verdict visible | Nécessitait un clic | Automatique au chargement |

### Fichiers modifiés

**`src/hooks/useConclusionIA.ts`** :
- Auto-trigger `generate()` au mount si `initialRaw` est null (plus de clic nécessaire)
- Les appels suivants utilisent le cache DB (`analyses.conclusion_ia`)

**`src/components/analysis/ConclusionIA.tsx`** :
- Suppression de l'état CTA "Obtenir le verdict expert"
- Affichage automatique du spinner de chargement
- Bouton "Réessayer" visible uniquement en cas d'erreur réseau
- Bouton "Copier les points à négocier" → clipboard (verdict + surcoût + 3 actions)

**`src/components/analysis/GlobalAnalysisCard.tsx`** (refonte complète) :
- SUPPRIMÉ : titre verdict ("Devis à risque élevé" / "Devis à négocier") → source de vérité = ConclusionIA
- SUPPRIMÉ : section "SURCOÛT ESTIMÉ" → source de vérité = ConclusionIA
- SUPPRIMÉ : section "PLAN D'ACTION" → source de vérité = ConclusionIA
- CONSERVÉ : décompte des 4 catégories de postes (Prix correct / Légèrement élevé / Surévalué / Prix anormal)
- Renommé : "Anomalie majeure" → "Prix anormal"

**`src/components/analysis/BlockPrixMarche.tsx`** :
- Titre : "Analyse Prix & Cohérence Marché" → "Analyse des postes"

**`src/components/pages/AnalysisResult.tsx`** :
- Score Hero "FEU ORANGE" remplacé par barre de contexte compacte (fichier + date + chip score)
- Bloc "Nos recommandations" supprimé (contradisait l'analyse prix)
- ConclusionIA remonté en position 1 (above the fold)
- StrategicBadge (IVP/IPI) déplacé en bas de page
- Bloc "Comment interpréter ce score ?" redondant supprimé

### Règle d'architecture établie
**ConclusionIA est la seule source de vérité pour le verdict, le surcoût et les actions.** Aucun autre composant ne doit afficher ces trois éléments. `GlobalAnalysisCard` = statistiques de répartition des postes uniquement.

---

## 17. Fix verdict expert — message générique surface

✅ **Déployé 2026-04-30 (commit `99b6e27`).**

### Problème
Le verdict expert injectait systématiquement "Demandez la surface exacte en m² pour X — Si < 8 m² le prix est élevé, négociez ; si > 12 m² le prix est cohérent" même quand les surfaces étaient explicitement présentes dans les lignes du devis (ex: "Achat carreaux mur 15.36 m²").

### Cause
`hasSurfaceUnitMismatch()` dans `conclusion.ts` détectait un "mismatch" sur les groupes de pose (unité = forfait) sans vérifier si les autres lignes du même groupe avaient une quantité m² explicite.

### Fix
- `extractKnownSurface(lines)` : scanne les `devis_lines` du groupe, cumule les quantités des lignes avec unité m². Retourne `null` si aucune trouvée.
- `hasSurfaceUnitMismatch()` : retourne `false` si `extractKnownSurface` trouve une surface — le message générique n'est pas injecté.
- Cas résolu : devis carrelage avec pose en forfait + achat carreaux en m² dans le même groupe → surface connue, pas de fausse alerte.

---

## 19. Optimisation homepage copy + UX finale écran analyse

✅ **Déployé 2026-04-30 (commit `4442e11`).**

### Homepage (`index.astro` + `HowItWorksSection.tsx`)
- **H1** : "Votre devis est-il trop cher ?" — question directe orientée décision
- **Sous-titre** : promesse en 2 lignes (uploadez PDF, 60s, détecte prix anormaux, quoi négocier)
- **CTA** : "Voir si je paye trop cher →" (remplace "Analyser mon devis gratuitement")
- **Micro-copy CTA** : "Gratuit · Sans inscription · Résultat immédiat"
- **3 proof bullets** : économies 1 200–4 500 €, 470+ postes, résultat < 1min
- **Meta title/description** alignés avec le nouveau positionnement
- **HowItWorks** : étapes réorientées verdict/négociation, sous-titre "3 étapes. Moins d'une minute."

### ConclusionIA (`ConclusionIA.tsx`)
- **Surcoût géant** : chiffre central (midpoint arrondi à 100€) en `text-5xl/6xl`, fourchette en sous-label
- **Verdict labels décisionnels** : "🟠 À négocier — prix au-dessus du marché" / "🔴 Ne signez pas — anomalies majeures détectées"
- **Ligne justificatrice** dynamique : "→ N postes dépassent largement les prix du marché"
- **Crédibilité** : "Analyse basée sur des milliers de prix travaux en France"
- **CTA remonté** juste après le verdict, pleine largeur, `📋 Copier le message pour négocier`
- **Micro-copy** : "Voici exactement quoi dire à votre artisan :"
- **Max 3 anomalies** visible + expand "Voir les X autres anomalies"
- **Max 3 actions** visible + expand "+X autres points"
- **Loader 3 étapes** animées (✓ / pulse / cercle) — jamais d'écran vide

---

## 16. Score HubSpot — Tap Targets + JS Libraries

✅ **Livré 2026-04-28.**

Rapport HubSpot : Mobile 20/30 (FAIL Tap Targets) + Security 5/10 (FAIL Secure JS Libraries).

### Tap Targets corrigés
Tous les éléments interactifs sur la landing portés à ≥ 44px sur mobile :
- Cookie banner "Refuser"/"Accepter" : `h-9` → `h-11` mobile (`sm:h-9` desktop inchangé)
- Newsletter : bouton × `p-1` → `p-3`, submit `h-10` → `h-11`, "Non merci" + `py-3`
- Menu mobile Header : bouton "En savoir plus" + `py-3`, liens sous-menu + `py-3 block`, liens utilisateur `py-1.5` → `py-3`

### JS Libraries
`npm update` — toutes les dépendances montées dans leur plage semver (`@supabase/supabase-js` 2.90→2.105, `dompurify` 3.3→3.4, `jspdf` 4.0→4.2, etc.).

3 CVE restantes (astro XSS `define:vars`, `@astrojs/vercel` path override, `vite` esbuild) nécessitent des upgrades majeurs (astro 5→6, vercel adapter 9→10). **Non appliquées** : `define:vars` n'est pas utilisé dans le projet (XSS non exploitable), les deux autres sont server-side (non détectables par le scanner browser). À traiter quand Astro 6 sera stable et que la migration sera planifiée.

---

## 16. Dette technique — whapi read receipts & queries

🟡 **Backlog technique issu du code review** — pas bloquant, à traiter quand on retouche les zones concernées.

### `[whapi-read-receipts]`

- [ ] **Batcher les upserts statuts dans le webhook** — `src/pages/api/webhooks/whapi.ts`
  La boucle `for...of statuses` fait 1 SELECT + 1 UPSERT par status. Sur un groupe de 20+ membres lisant simultanément, whapi peut envoyer 50+ statuts en un seul batch → 100+ requêtes série. Fix : grouper par `message_id`, 1 `select().in()` pour les lookups chantier_id, puis `Promise.all` sur les upserts.

- [ ] **Logger `outgoingRes.error` explicitement** — `supabase/functions/agent-orchestrator/context.ts`
  Si la requête `whatsapp_outgoing_messages` plante (table absente, timeout), l'erreur est avalée silencieusement via `outgoingRes.data ?? []`. Ajouter un `console.error('[context] outgoing read receipts query failed:', outgoingRes.error.message)`.

- [ ] **Renommer `group_jid` → `chat_jid`** dans `whatsapp_outgoing_messages` — migration future
  Le digest du soir envoie en DM (`@s.whatsapp.net`), pas dans un groupe. La colonne s'appelle `group_jid` mais peut contenir un JID personnel. Créer une migration `ALTER TABLE whatsapp_outgoing_messages RENAME COLUMN group_jid TO chat_jid` et mettre à jour les refs dans `index.ts` et `context.ts`.

- [ ] **Batcher le lookup chantier_id dans le bloc statuts** — `src/pages/api/webhooks/whapi.ts`
  Le bloc statuts fait un SELECT par `message_id` distinct pour résoudre le `chantier_id`. Grouper les `message_id` uniques et faire un seul `select().in()` avant la boucle d'upsert.

---

## 29. UX Échéancier & Entrées — session 2026-05-07 ✅ En prod

### Fait cette session

- **Libellé entrées non-bloquant** : fallback sur le nom du type si champ vide ; libellé pré-rempli à l'ouverture du modal (`AddEntreeModal`)
- **Édition inline entrées** : clic sur une entrée → formulaire inline (type, libellé, montant, date, statut) + PATCH API étendu (`source_type` ajouté)
- **Panel détail échéance** (`PaymentDetailPanel`) : 3 cartes contexte (total/déjà payé/cette échéance), autres termes du document, édition + split automatique (PATCH + POST addToDocument)
- **Badge inline "Flux certains"** sur la ligne "Budget de référence" en Trésorerie : remplace l'ancienne bannière séparée — bouton "Actualiser à X€ ?" à côté du chiffre
- **Source unique de vérité `budgetReel`** : TresorerieView + BudgetTab écrivent dans les 2 localStorage (`budget_reel_*` + `tresorerie_v3_*`) + les 2 champs DB (`chantiers.budget` + `metadonnees.tresoreieFinancing`) + dispatche `budgetReelChanged` → plus de divergence entre onglets
- **Auto-update budget** : flag `autoUpdateBudget` dans `FinancingConfig` — après 1ère confirmation manuelle, les dépassements suivants sont mis à jour silencieusement sans popup

### Reste à faire / valider en prod

- [ ] Tester le split d'échéance (modifier 60% → 30% + 30% avec date) sur un vrai devis
- [ ] Vérifier que BudgetTab et homepage affichent bien 67k€ après modification dans Trésorerie (sans rechargement)
- [ ] Valider l'auto-update : modifier budget une fois → vérifier que les dépassements suivants s'auto-corrigent

---

## 26. PaiementDrawer — drawer unifié paiement (homepage + budget) 🟡

**Objectif** : éliminer la confusion entre "Enregistrer un paiement" homepage et "Payer" dans Budget. Un seul composant visuel, deux contextes.

**Architecture décidée** :
- `PaiementDrawer.tsx` (nouveau) — deux modes :
  - **Libre** (depuis homepage, sans contexte) → appelle `/api/chantier/[id]/quick-expense`
  - **Contextualisé** (depuis Budget, avec artisan + facture + montant restant pré-remplis) → appelle `/api/chantier/[id]/payment-events` avec `addToDocument: true`
- Footer réassurance : "Tous les paiements sont automatiquement pris en compte dans votre budget"
- Wording uniforme : "💸 Enregistrer un paiement" partout
- `VersementsDrawer` conservé pour l'historique complet

**Points d'entrée** :
1. `ActionCenter` dans `DashboardHome` (mode libre) — remplace le drawer inline actuel
2. Bouton "💸 Payer cette facture" sur les lignes facture dans `BudgetTab` (mode contextualisé)

**État** : 🟡 en cours — implémentation à démarrer.

---

## Comment maintenir ce document

- Quand on **commence** une feature → ajouter une section ici avec 🟡
- Quand on la **finit en prod** → soit on supprime la section (si stable), soit on la garde avec ✅ jusqu'à la prochaine revue puis on l'archive
- Quand on **change d'avis** ou on **bloque** → 🔴 + raison
- Réfléchir à passer en revue ce doc à chaque session de travail (au début ou à la fin)
- `FEATURES.md` ne décrit que ce qui est ⚙️ stable en prod. Tout le reste vit ici.
