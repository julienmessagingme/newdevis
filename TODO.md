# TODO.md — Backlog VerifierMonDevis.fr / GérerMonChantier

Backlog = items à faire **non encore commencés**. Dès qu'on attaque un item, il bascule dans `WIP.md`.

Pour le rationnel et l'historique des audits UX, voir `UX-AUDIT.md`.

---

## Scoring V3.x — qualité d'analyse (suite de la stabilisation 2026-05-11)

### P0 — Crédibilité produit critique

- [ ] **V3.4 Niveau 2 — Scoring d'hétérogénéité des groupes (1 j dev)** : remplacer le bool brut `isLikelyHeterogeneousGroup` (Niveau 1, déjà déployé V3.3.4) par un score 0-1 basé sur l'analyse linguistique des descriptions. Algorithme : extraire les mots-clés du `job_type_label`, calculer pour chaque devis_line le `matchScore = |keywords ∩ description| / |keywords|`, moyenne pondérée par montant → `homogeneityScore`. Construire en parallèle le référentiel mots-clés par job_type (carrelage_* : carrelage, dalle, céramique, faïence, carreau, joint, colle ; chape_* : chape, ciment, mortier, ragréage ; etc.). Avantage : graduation au lieu de binaire, couvre les cas où le prix unitaire est élevé mais légitime (carrelage premium dans un groupe homogène). Stub déjà documenté en commentaire dans `src/pages/api/analyse/[id]/conclusion.ts`.

- [ ] **V3.5 Niveau 3 — Refonte du prompt Gemini de groupement (2-3 j dev)** : auditer `supabase/functions/analyze-quote/market-prices.ts` (prompt actuel de groupement), renforcer les règles d'exclusivité : chape ciment JAMAIS dans groupe carrelage, primaire JAMAIS dans groupe revêtement, IP14/IPE/IPN = structure acier (jamais dans revêtement), coupe dalles OK avec carrelage forfait du même poste. Ajouter exemples few-shot. Tester sur les 4 PDFs Desktop (Kern, Zitelec, multi-devis, SDB). Test de non-régression sur les 200+ analyses passées (chercher les groupes qui changent de composition). À sortir en feature flag pour rollback facile. **Vraie solution de fond** — élimine la cause RACINE des faux positifs, pas juste les symptômes. Niveau 1 et 2 deviennent moins critiques (mais restent comme défense en profondeur).

- [ ] **V3.x — Enrichir le catalogue `market_prices` par niveau de gamme** : aujourd'hui le catalogue donne une fourchette unique par `job_type` (ex: carrelage 46-94 €/m²). Cette fourchette ne couvre que le standard et fait sortir en "anomalie" des prestations légitimes haut de gamme (dalle céramique premium à 160 €/m² posée). Plan : ajouter une dimension `qualite: "entree_gamme" | "standard" | "premium"` au catalogue, permettre au LLM de la déduire des descriptions (mots-clés "premium", "haut de gamme", "grand format", noms de fabricants comme Kann, Cinca, Florim…), et ajuster les fourchettes en conséquence. Estimation : 1 semaine + collecte de prix premium par domaine.

- [ ] **V3.x — Audit qualité externe** : faire valider 100 devis par un panel de 3 experts BTP indépendants, mesurer le taux de concordance avec nos verdicts (cible : >85%). Publier le "Rapport de fiabilité 2026" comme argument commercial principal face aux prescripteurs B2B (courtiers, agents immo, marchands de biens). Sans cette caution externe, nos verdicts restent du "trust me bro" attaquable juridiquement.

---

## Marketing / tracking (2026-06-05)

- [ ] **Vérifier les 2 domaines dans Meta Business** : Events Manager → Sécurité de la marque → Domaines (ou Business Settings → Domaines). Ajouter `verifiermondevis.fr` ET `gerermonchantier.fr`. Obligatoire pour l'Aggregated Event Measurement (iOS 14.5+) et la priorisation d'événements. Méthode balise meta : Claude ajoute les 2 `<meta name="facebook-domain-verification">` au `BaseLayout` en 2 min (les fournir). Sinon méthode DNS chez OVH.
- [ ] **Créer les Custom Audiences segmentées par URL** : `contient verifiermondevis.fr` vs `contient gerermonchantier.fr` (un seul pixel mutualisé, on segmente côté Ads Manager).
- [ ] **Événements de conversion GMC restants** : `Lead` (fin d'analyse VMD, `AnalysisResult.tsx:1272`) et `CompleteRegistration` (inscription, `Register.tsx:136`) sont **déjà câblés** via le helper `src/lib/integrations/metaPixel.ts`. Reste à câbler **côté GMC** : `StartTrial` (démarrage du trial 15 j) et `Subscribe` (passage payant Stripe). Note : les events déjà câblés n'apparaissent pas encore dans Events Manager faute de volume (pixel créé le 5 juin, ~85 visites) — c'est normal, pas un bug.
- [ ] **Auditer la passerelle CAPI stape.de** (`capig.stape.de`) : confirmer qui l'a configurée, si on la garde, et quels events elle envoie côté serveur (le tag « Multiple » sur PageView dans Events Manager = pixel navigateur + CAPI serveur). Vérifier la déduplication navigateur↔serveur quand le volume sera suffisant (au 8 juin, Meta affiche « analyse de dédup en cours », pas assez de données). Bonus : envoyer `CompleteRegistration` via cette CAPI = la solution robuste (le délai 400 ms dans `Register.tsx`/`callback.astro` n'est qu'un stopgap navigateur). **MAJ 12 juin** : la CAPI était CSP-bloquée jusqu'au commit `3351077` → maintenant `POST capig.stape.de → 200` prouvé live (GMC + VMD). Le diagnostic Events Manager « Improve rate of events covered by CAPI » (serveur -215 events vs pixel /7 j) = **artefact du blocage, pas une panne** ; re-vérifier ~19 juin que l'écart se résorbe (sinon creuser : stape forwarde-t-il 100 % à Meta ?).
- [ ] **Identifier l'event `Prospect`** (Events Manager → source « Site web », navigateur, 1 event, hors code VMD, hors GTM/stape/conversion-perso). Inspection live 2026-06-08 : très probablement déclenché par le **widget chat MessagingMe** (`ai.messagingme.app/widget/...`, partage le `fbq` de la page). À confirmer en capturant le réseau pendant une interaction chat, puis décider si on le garde / le renomme.
- [ ] **Landing `/beta` — captures produit dédiées mobile (optionnel, mineur)** : les 4 captures (planning/devis/aides/journal) sont du 1920×1080 dense affiché à ~340px → lisibles dans les grandes lignes (prix, barres, badges) mais pas dans le détail. Pour un vrai « zoom » mobile, produire des captures cadrées serré sur l'essentiel de chaque écran. ⚠️ NE PAS recadrer en dur le **devis** (perdrait son comparatif 3 colonnes).

---

## UX/UI cockpit GMC — issus de l'audit #2 (2026-05-09)

### P0 — Frein produit majeur

- [ ] **I3 — Surface persistante Assistant IA** : aujourd'hui les alertes IA (`agent_insights`) ne sont visibles que dans l'onglet "Assistant" + badge sidebar + toasts < 5 min. Un user qui n'ouvre jamais cet onglet ne voit jamais une alerte. À faire : bandeau discret (amber, lien vers onglet) sur DashboardHome si `agentInsights.unreadCount > 0` ; idem en haut du BudgetTab si insights financiers non lus ; rouge si `hasCriticalInsight`. Décision UX préalable : où placer (Dashboard seul ? toutes les pages ?), quel wording, quel comportement de fermeture.

### P0 — Mobile

- [ ] **N5b — IntervenantsListView en cards mobile** : actuellement tableau 6 colonnes `min-w-[760px]` qui force scroll-X sur 375px (font 10px illisible). À faire : variant cartes empilées sous breakpoint `sm`, comme déjà appliqué dans `BudgetTab` (`sm:hidden` / `hidden sm:flex`). Fichier : `src/components/chantier/cockpit/lots/IntervenantsListView.tsx:185`.

- [ ] **N5c — Touch events Planning Gantt** : `PlanningTimeline` écoute uniquement `MouseEvent` (`onMouseDown/Move/Up`). Aucun `onTouchStart/Move/End` → drag/resize impossible sur mobile. Poignées de resize en `opacity-0 group-hover/bar:opacity-100` → invisibles sur touch. À faire : ajouter touch events (ou `pointerdown` qui couvre les deux), forcer poignées visibles sous `lg:hidden`, ou afficher une vue list-mode alternative sur mobile. Fichier : `src/components/chantier/cockpit/planning/PlanningTimeline.tsx:60-160`. Effort estimé : 1 j.

### P1 — UX moyens

- [ ] **I5 — Vue expert / novice en toggle** : le tableau Budget reste dense par défaut (6 colonnes). À faire : toggle "🌱 Vue simple / 🔧 Vue détaillée" dans ActionBar. En mode simple → masquer "Facturé" et "Avancement", garder Artisan/Engagé/Solde/Actions. Persistance localStorage. Refonte invasive du tableau (colgroup table-fixed + headers + cells) → planifier un sprint dédié pour éviter régressions.

- [ ] **BudgetTabMobile split complet** : la Vague C polish (2026-05-16) a ajouté `useIsMobile()` pour amplifier les zones tactiles dans ActionBar (search h-11, CTAs min-h-44px) et les drawers (safe-area-inset-bottom + role dialog). Mais ~25-30% du JSX bénéficierait d'un composant mobile dédié (pattern `TresorerieMobile` / `EcheancierMobile`) plutôt que des classes Tailwind responsive imbriquées. Sections cibles : ActionBar single-col stack + filtres en bottom-sheet, Devis rows / Facture rows en cards empilées (déjà partiel via `ArtisanCardMobile`), Drawer artisan en bottom-sheet plein écran. À attaquer si feedback user "le tableau est illisible sur mobile" remonte ou si on observe un drop-off mobile sur l'onglet Budget. Fichier cible : `src/components/chantier/cockpit/budget/BudgetTabMobile.tsx` + wrapper d'export default avec routing isMobile + state shared via props.

- [ ] **Audit a11y messagerie + assistant** : la Vague C polish (2026-05-16) a fixé les aria-label sur BudgetTab/Echeancier/DepenseRapideModal/BottomNav/ScreenQualification mais n'a PAS audité `ConversationThread` ni `WhatsAppThread` (panneau messagerie). Tour rapide à programmer : send button, search clear, scroll-to-bottom, attach paperclip — vérifier qu'ils ont tous `aria-label` + icônes `aria-hidden`. Effort ~30 min.

- [x] ~~**Pencil edit durée LotDetail (touch target)**~~ — fait 2026-05-09. Pencil + Check + X durée passés à `w-11 h-11 lg:w-7 lg:h-7` (44 mobile, 28 desktop) avec `aria-label` + `touch-manipulation`. `LotDetail.tsx:143,148,162`.

---

## Refacto code (suite de l'audit structure 2026-05-08/09)

Étapes 1-4 livrées. Reste à programmer, priorisé par ROI.

- [ ] **Étape 5 — Casser `BudgetTab.tsx` (2581 lignes 🔥)**
  Le pire fichier du repo. Effort : ~1j. Risque : moyen (fichier critique, plusieurs flux paiement).
  Plan minimal : extraire 4-5 sous-composants (`IntervenantsList`, `PaymentSummary`, `MissingDocAlerts`, `LineItemRow`) en gardant `BudgetTab.tsx` comme orchestrateur < 500 lignes.

- [ ] **Étape 6 — Consolider Trésorerie ×3**
  `tresorerie/{TresoreriePanel, TresorerieView, BudgetTresorerie}` = 4 niveaux de cascade pour afficher un même domaine. Effort : ~1j. Risque : moyen — `showBudgetDetail` flag dans ChantierCockpit suggère 2 modes distincts. **Audit avant de fusionner**.

- [x] ~~**Étape 7 — Partition `lib/` par domaine**~~ — fait 2026-05-09 (commits `5d6ff19` + `8b07ec1`).
  38 fichiers plats → 6 sous-dossiers : `analyse/` (11), `chantier/` (11), `auth/` (7), `integrations/` (4), `api/` (1), `blog/` (1). Restent à la racine : `utils.ts`, `constants.ts`, `prompts/`. 249 imports mis à jour automatiquement via sed dans 164 fichiers consommateurs. 0 nouvelle erreur TS introduite.

- [ ] **Étape 8 — Header ×3 sync**
  3 variantes (`layout/Header.tsx` React + `astro/Header.astro` + `gmc-landing/Header.astro`) imposent de modifier 3 fichiers à chaque changement d'auth state. Extraire un `<HeaderUserMenu />` partagé client:only — les 3 Headers se réduisent à layout + branding + import du même menu.
  Effort : 2-3h. Risque : moyen.

- [ ] **Étape 9 — Découper `AnalysisResult.tsx` (1341 lignes)**
  Page principale d'analyse de devis. Les sections `Block*` sont déjà extraites — reste 1341 lignes d'orchestrateur dont gros useMemo (`effectiveScore`, `weightedAnomalies`) à sortir en hooks dédiés (`useEffectiveScore.ts`, `useWeightedAnomalies.ts`). Cible : ~600 lignes.
  Effort : ~1j. Risque : moyen (page critique, beaucoup de logique TDZ-sensible — cf. règle "TDZ in edge functions and React").

- [ ] **Étape 10 — Tests unitaires (couverture critique)**
  Au minimum couvrir avec Vitest :
  - `lib/planningUtils.ts` (CPM forward pass — bug zone historique)
  - `lib/market-prices.ts` (matching 5 niveaux + emergency fallback)
  - `pages/api/analyse/[id]/conclusion.ts` (`extractKnownSurface`, `hasSurfaceUnitMismatch`)
  - `verdictEngine.ts` ✅ déjà couvert (27 cas)

  Effort : 2-3j. Risque : bas. Filet de sécurité critique vu que l'agent IA prend des actions destructives.

---

## Dette technique

- [ ] **Cron timeout — fan-out pattern**
  Le cron quotidien `agent-orchestrator-evening-digest` traite les chantiers actifs en batches de 3. Au-delà de ~10 chantiers actifs, on risque le timeout edge function 60s.
  **Solution** : edge function "dispatcher" qui fire N appels indépendants à l'edge function `agent-orchestrator` (1 par chantier). Pas bloquant — juste à anticiper avant que la base utilisateur grossisse.

- [ ] **Migration `useInsights` legacy → `agent_insights`**
  6 composants utilisent encore `cockpit/useInsights.ts` (ancien système Gemini MOE — appel éphémère sans persistance) :
  - `BudgetTresorerie.tsx`
  - `AnalyseDevisSection.tsx`
  - `LotCard.tsx`
  - `LotIntervenantCard.tsx`
  - `BudgetKpiCard.tsx`
  - `dashboardHelpers.ts`

  À terme : remplacer par lecture des `agent_insights` persistants (mêmes données mais cachées + traçables). Pas urgent — ça marche aujourd'hui.

---

## Architecture agent IA — évolutions à programmer (issu de WIP § 12)

- [ ] **P4 — Fan-out cron evening**
  Aujourd'hui batch 3 séquentiels → > 30-50 chantiers actifs = timeout edge function 60s.
  Edge function "dispatcher" qui fire N invocations indépendantes (1 par chantier) au lieu de boucler. Chaque invocation = 1 chantier, timeout indépendant.
  *(Recouvre partiellement "Cron timeout fan-out pattern" ci-dessus — fusionner les deux quand on attaque.)*

- [ ] **P5 — POC Claude Sonnet 4.7 + prompt caching**
  **Hypothèse à valider** : Claude + prompt caching réduit le TCO total malgré un prix au token brut plus élevé, parce que :
  - Prompt caching = -90% sur le contexte (notre `context.ts` rebuild ~6-10k tokens à chaque appel — gain énorme)
  - Taux de succès tool_call plus élevé = moins de retries
  - Moins d'hallucinations = moins de "défaire ce qu'a fait l'agent" côté user
  - Suppression progressive des hacks Gemini

  **À mesurer sur 1 chantier de test, 1 mois** : taux tool_calls qui aboutissent, coût par run (avec cache hit rate visible), latence (avec streaming Anthropic), qualité subjective des messages générés.

  **Quand le faire** : > 100 chantiers actifs OU dès qu'un user signale un comportement bizarre récurrent qu'on ne peut pas patcher facilement.

  **Risque** : compatibilité tool calling (Anthropic format ≠ OpenAI format Gemini). Réécriture du dispatcher tools. Mais après P2 modularisation (livré), c'est isolé.

- [ ] **P6 — Multi-agents chaînés (planner + executors)**
  **Hypothèse** : splitter l'orchestrator en 2 niveaux :
  - 1 agent **planner** (full context) qui décide quoi faire
  - N agents **executors** spécialisés (planning, finance, comm) avec prompt minimal et tools restreints

  **Bénéfices attendus** : -40 à -60% sur les tokens cumulés, prompts plus précis par domaine, meilleure observabilité (chaque sous-agent loggé séparément).

  **Coût** : latence cumulée (2-3 calls Gemini/Claude par tour), complexité du dispatcher.

  **Quand le faire** : si après P5 on a encore des problèmes de qualité tool_call sur les workflows à 6+ étapes. Pas avant.

- [ ] **P7 — Évaluer un framework agent (Vercel AI SDK / Mastra)**
  **Contexte** : aujourd'hui dispatcher, retry logic, history compaction = 100% custom artisanal.

  **Hypothèse** : Vercel AI SDK (déjà sur Vercel, intégration TS native) ou Mastra (TS-first, workflows + memory natifs) pourrait remplacer 60% du code custom.

  **Bénéfices potentiels** : streaming natif (UX chat améliorée), observabilité native (LangSmith, Helicone), memory long terme (résumés glissants automatiques), workflows multi-step sans bricolage.

  **Coût** : courbe d'apprentissage, dépendance externe (lock-in, breaking changes), perte de contrôle fin (ex: nos hacks Gemini).

  **Quand le faire** : POC à 6 mois (mi-2026) sur 1 fonctionnalité périphérique avant de migrer le coeur.

  **À NE PAS faire** : 🔴 LangGraph en Python — ajoute Python à notre stack (Astro + Deno + Python = 3 runtimes), trop de friction pour le bénéfice.

- [ ] **P8 — State machine explicite pour workflows critiques**
  Si la complexité des workflows pending explose (>3 états avec branches conditionnelles), envisager XState ou home-made. Aujourd'hui : pending → resolved/expired suffit, donc pas pertinent. À reconsidérer si on ajoute des workflows multi-acteurs (ex: validation simultanée artisan + comptable).

- [ ] **P10 — Canaux proactifs alternatifs (Web Push / email)**
  ⚠️ **À ne pas confondre avec la vague 3** qui livre le canal proactif principal **via WhatsApp privé** (groupe "Mon Chantier — X" avec uniquement le user dedans). P10 = canaux **alternatifs** pour les users qui ne veulent pas / ne peuvent pas WhatsApp.

  Pistes :
  - **Web Push API** (notif browser) : permission demandée au premier login, push depuis edge function via VAPID. Fonctionne même app fermée si browser ouvert.
  - **Email transactionnel SendGrid** : digest quotidien ou notif immédiate sur les triggers critiques (alertes, clarifications urgentes).

  Settings UI à enrichir : checkboxes par canal (WhatsApp / Web Push / Email) × par catégorie de trigger (clarifications / alertes critiques / rappels / etc.). Sinon spam.

  Pas urgent : à activer si on identifie une cohorte significative de users sans WhatsApp.

---

## Tools agent IA — vague 3 reste à câbler

Vagues 1, 2, 3 livrées (cf. WIP § 13 historique). Sous-items non commencés :

- [x] ~~**UI activation canal owner WhatsApp**~~ — fait 2026-05-09. Composant `OwnerChannelToggle.tsx` ajouté dans la section Settings de `ChantierCockpit`. Bouton "Activer le canal WhatsApp IA" qui POST `is_owner_channel: true`. Gère 4 états : idle / loading / success (avec `already_existed` flag + invite_link) / error. Touch target 44×44 sur mobile. Le user qui ne passe jamais par le chat peut maintenant activer le canal via UI.

- [ ] **8 triggers proactifs à câbler**
  Définis dans `WIP § 12` round précédent. Pas encore tous implémentés. À faire après stabilisation de la vague 3 :
  1. Clarification urgente (`request_clarification`) — déjà routé via `agent_insights`
  2. Alerte critique (`severity=critical`) — à câbler vers WA owner channel
  3. Paiement en retard — déjà détecté par `agent-checks`, à router vers WA owner
  4. Lot bloqué sans devis depuis 14j — à ajouter dans `agent-checks`
  5. Rappel programmé (`schedule_reminder`) — ✅ implémenté via `agent-scheduled-tick`
  6. Déblocage attendu non reçu — nécessite tracking sur `payment_events` type entrée
  7. Action automatique prise (debrief) — à câbler dans `log_insight`
  8. Décision à prendre — ✅ implémenté via `notify_owner_for_decision`

  UI Settings : checkboxes par catégorie pour activer/désactiver chaque trigger. Sinon risque de spam owner.

---

## Vue mobile — passes restantes (suite de WIP § 9)

Étapes 1-6+8 livrées (cf. WIP § 9). Reste :

- [x] ~~**ÉTAPE 7 — Touch targets 44px min**~~ — fait 2026-05-09 sur DocumentsView mobile (boutons Analyse + Supprimer 44×44 avec aria-label). Pencil/Check/X dur ée LotDetail aussi. **Reste à finir** : ContactsSection icon buttons, chevrons divers — à compléter dans une passe globale.
- [ ] **ÉTAPE 9 — AnalysisResult blocs secondaires collapsés par défaut sur mobile** : aujourd'hui tous les blocs (Entreprise, Sécurité, Urbanisme…) sont déroulés → page très longue sur mobile. Collapse les blocs secondaires, garder l'essentiel ouvert (Conclusion + Prix marché).
- [ ] **ÉTAPE 10 — Homepage : résultat visuel + exemple concret** : la homepage parle au mobile mais ne montre pas un exemple concret de résultat d'analyse. Ajouter un screenshot annoté ou un mini-flow interactif.
- [ ] **PlanningTimeline mobile** (gros chantier) — le Gantt est galère sur petit écran. Recouvre N5c de l'audit UX #2.
- [ ] **ContactsSection + DocumentsView mobile** (LotBadge dropdown débordant, KPIs lisibles) — issues #16 du précédent audit.

---

## Cohérence Budget initial (estimation IA) ↔ Budget/Trésorerie (suivi réel)

UX à repenser — fracture entre les 2 phases du chantier.

Aujourd'hui on a deux mondes parallèles autour du budget :

- **Phase 1 — "Avant travaux"** : Accueil → Budget chantier → bouton "Affiner". Logique vague d'estimation IA (`market_prices`, qualification), l'utilisateur ne sait pas vraiment combien ça va coûter, on lui donne une fourchette. Réfine progressivement par questions (surface précise, choix matériaux, etc.).
- **Phase 2 — "On a lancé"** : Budget & Trésorerie. Logique de suivi de dépenses réelles. On a des devis signés, des factures, des paiements. Échéancier prévisionnel et réel. Cashflow.

### Le problème
Pas de **passerelle UX** entre les deux. Quand l'utilisateur passe de "j'ai mon estimation IA" à "j'ai mes devis et je commence à payer", il y a une rupture :
- Le budget IA initial n'apparaît plus en référence dans Budget & Trésorerie (sauf un encadré statique "budget cible XXX €").
- Pas de comparaison "estimation IA vs devis reçus" mise en avant — l'écart n'est visible qu'à travers les conseils proactifs (`buildConseils` "dépassement budget").
- L'utilisateur n'est pas guidé vers "tu peux maintenant figer ton budget réel à partir des devis validés" — on reste sur l'estimation initiale.

### Pistes de hitch / passerelle
- **Étape de transition explicite** : quand X% des lots ont un devis validé, proposer "Bascule vers le suivi réel — fige ton budget cible à partir des devis signés". Stocke un nouveau `budget_real` distinct du `budget_ia` initial.
- **Vue comparée side-by-side** dans Budget & Trésorerie : "Estimation IA initiale | Devis validés | Écart | % engagement". Visible en haut de l'onglet.
- **Sur l'écran Affiner** : à la fin du flow d'affinage, CTA explicite "Tu as ton estimation. Maintenant uploade tes devis pour passer en suivi de dépenses réelles" → routage vers tab Budget.
- **Ligne du temps narrative** dans l'Accueil : "Phase 1 estimation → Phase 2 suivi → Phase 3 bilan" avec progression visible (pourcentage de devis validés).

### À décider avant d'attaquer
- Faut-il créer un champ `budget_real_locked` distinct de `budget_ia` ?
- Le passage Phase 1 → Phase 2 est-il automatique (heuristique sur nb devis validés) ou manuel (CTA user) ?
- Faut-il garder l'estimation IA visible en permanence comme "rétroviseur" ou la masquer après bascule ?

---

## Idées produit en réflexion (pas codées)

- [ ] **"Joindre une preuve a posteriori"**
  Quand un frais est déclaré au chat, l'utilisateur reçoit le ticket plusieurs jours après. Pouvoir uploader le ticket et "promouvoir" le frais en `ticket_caisse` rattaché au document. Évite la double saisie.

- [ ] **Notification push proactive**
  Aujourd'hui les insights critical apparaissent dans le fil d'activité + WhatsApp digest. Pour des alertes vraiment urgentes (paiement à faire dans 24h, retard critique chantier), envisager push browser ou email immédiat. *(Recouvre P10 ci-dessus — à fusionner.)*

- [ ] **Rapport PDF chantier**
  À la fin du chantier, générer un PDF récap : timeline, lots, devis, factures, photos, total dépensé vs budget initial. Genre "livret de fin de chantier" remis au propriétaire.

- [ ] **Mode "invité collaborateur"**
  Inviter un conjoint / un proche à voir le chantier sans pouvoir tout modifier. Lecture + commentaires uniquement.

- [ ] **Recommandation artisan**
  Quand un lot a 0 devis depuis X jours, proposer une short-list d'artisans RGE / proches géographiquement / bien notés Google.

---

## Audit scalabilité + dette technique (2026-05-09)

Audit en 4 axes (DB/Supabase, edge functions/agent IA, dette code, coûts/observabilité). Les items déjà listés ailleurs dans ce TODO ne sont pas dupliqués — référencés inline.

**Verdict global** : aujourd'hui le projet scale bien jusqu'à ~30 chantiers actifs. Plafonds identifiés à 50-100 chantiers : (1) timeouts edge functions Supabase 60s sur extraction PDF gros, (2) cap Gemini 1k req/min sur batch evening, (3) queries DB en cascade sur views complexes (`payment_events_v`, `admin_kpis_*` non matérialisées). **Coût marginal estimé : ~€0.65-1.65/chantier actif/mois variable + ~€25-50/mois fixe (Supabase Pro + Vercel)**.

### P0 — Critique (à traiter avant 50 chantiers actifs)

- [ ] **Sentry / error tracking centralisé** — pas de Sentry installé. Silent failures détectés : whapi photo download (`webhooks/whapi.ts:69`), JSON truncation extraction (CLAUDE.md piège connu), agent tool_calls aborted, edge functions catch sans alerte. À faire : `npm i @sentry/node` + init dans edge functions Deno + serverless routes Vercel. ROI très haut, effort ~M (½ j).

- [x] ~~**Webhook idempotence whapi**~~ — vérifié 2026-05-09 : `whapi.ts` utilise déjà `upsert({ onConflict: 'id' })` ligne 264 ✅. **Reste à faire** : idempotence pour `inbound-email.ts` (SendGrid) qui fait un `.insert()` simple ligne 189 — nécessite migration DB pour stocker `message-id` SendGrid externe.

- [x] ~~**Timeouts explicites + retry backoff sur fetch Gemini**~~ — fait 2026-05-09. Helper partagé `supabase/functions/_shared/gemini-fetch.ts` avec `fetchWithTimeout` + `fetchGeminiWithRetry` (timeout dur, retry 429/5xx avec backoff exponentiel + jitter). Appliqué sur `market-prices.ts:359` et `summarize.ts:44` (3 tentatives, timeout 20s). **Reste à étendre** sur `agent-orchestrator/index.ts` (5 fetchs Gemini, scope laissé en TODO car critique — appliquer prudemment avec maxAttempts=2 pour respecter le budget time 60s par tour).

- [x] ~~**Sanitize XSS sur `dangerouslySetInnerHTML`**~~ — fait 2026-05-09. `ChatDrawer.tsx`, `ScreenAmeliorations.tsx` (contenu LLM) et `ConversationThread.tsx` (body_html email entrant) passent désormais par `sanitizeForRender()` (DOMPurify allowlist-based). `ArticleContent.tsx` était déjà sanitizé. `BlogArticle.tsx` JSON-LD = `JSON.stringify` direct (script type=application/ld+json) → safe.

- [ ] **Gemini timeout sur gros PDF (>50 pages)** — `extract-document` peut hit le 240s edge function ceiling. À faire : chunk async + multi-part upload via Gemini Files API (déjà à moitié construit dans `extract.ts:86`). Effort ~M (½ j).

### P1 — Important (entre 50 et 100 chantiers)

- [x] ~~**Retry avec backoff exponentiel sur Gemini 429/500**~~ — fait 2026-05-09 sur market-prices et summarize via le helper partagé. Pour extract.ts : laissé sans retry car chaque tentative ~40s vs budget Supabase 60s (commentaire historique respecté). Pour agent-orchestrator : à étendre dans une prochaine session (5 fetchs Gemini, prudence requise).

- [ ] **Prompt caching côté agent orchestrator** — supprimé 2026-04-23 pour garantir sync, mais `context.ts` rebuild ~6-10k tokens à chaque appel (cf. CLAUDE.md). Réimplémenter via Gemini `cache_control={"type":"ephemeral", "ttl_seconds": 3600}` sur le system prompt + portion stable du contexte. Gain : ~30-40% sur LLM agent ≈ -€0.05-0.06/chantier/mois. *Recouvre P5 backlog archi agent IA*. Effort ~M (1 j).

- [x] ~~**Audit RLS systématique**~~ — fait 2026-05-09 via Supabase advisor. Vérité plus précise que l'audit initial : 102 policies au total (pas 152), 0 `IN (SELECT)`, 23 `EXISTS` (acceptable avec FK indexées). **18 policies non wrappées** identifiées sur 6 tables (chantiers, subscriptions, journal_entries, relances, lots_chantier, chantier_whatsapp_messages) + **7 policies doublons** (`multiple_permissive_policies` sur analyses ×4, analysis_work_items ×1, chantier_whatsapp_messages ×1, subscriptions ×1). Migration corrective écrite : `supabase/migrations/20260509133525_rls_wrap_remaining_auth_uid_and_drop_duplicates.sql`. **Pas appliquée auto** — à exécuter via `supabase db push` ou Studio quand validé. Vérification post-apply : query SQL en bas de la migration doit retourner 0. **Reste** : tables price_observations, post_signature_tracking, blog_posts, document_extractions, dvf_prices, user_roles ont des `multiple_permissive_policies` non triviaux (besoin décision RESTRICTIVE vs PERMISSIVE) — à examiner case par case dans une prochaine session.

- [ ] **`payment_events_v` — vue UNION 3 branches sur JSONB** — `cashflow_terms` JSONB sans index, CROSS JOIN LATERAL + UNION ALL = O(N²) à O(N³). Risque timeout sur admin KPIs à 1M+ events. Refacto : table matérialisée incrémentale (refresh sur trigger) ou MATERIALIZED VIEW avec refresh cron 15min. Fichier : migration `20260428230000_drop_payment_events_legacy.sql:34-115`. Effort ~M (½-1 j).

- [ ] **Partitionnement temporel `agent_insights` / `agent_scheduled_actions`** — tables à croissance explosive (10-100k rows/jour à terme). Sans range partitioning par mois, WAL + VACUUM vont paralyser à 10M rows. Ajouter partitioning + politique d'archivage (insights > 90 j → cold storage). Effort ~M (½-1 j).

- [ ] **Fan-out cron evening — throttle + backoff** — `agent-orchestrator` MAX_FAN_OUT=200 hardcoded sans throttling Google Gemini (1k req/min cap). 200 invocations parallèles + 8 tool_rounds = pic 1600 req/min. Fix : queue + adaptive throttle si 429 détecté. *Recouvre P4 backlog archi agent IA*. Effort ~M (1 j).

- [ ] **Réduire 118 `as any` sans justification** — concentrés dans TresorerieView.tsx (10), ConclusionIA.tsx (8), budget.ts (7), TresoreriePanel.tsx (7), ChantierCockpit.tsx (7). Audit 2026-05-09 : un fix superficiel (replace `as any` → `as unknown`) casserait facilement la TS. Approche structurée requise : (1) helpers typés réutilisables pour les casts Supabase (`SupabaseClient<Database>`), (2) audit des handlers d'événements DOM (event.target as HTMLInputElement), (3) migrer fichier par fichier en testant. Effort 2 j, ne pas faire en quick win.

- [x] ~~**SendGrid 5/contact/24h cap non tracké**~~ — fait 2026-05-09. Vérité plus précise : le cap **existait déjà** côté agent (`tools/comm.ts:252-267`) mais **manquait sur l'API REST `messages.ts`** (utilisée par la Messagerie UI ET indirectement par l'agent). Fix : check ajouté dans `src/pages/api/chantier/[id]/messages.ts` avant l'INSERT — count outbound dans `chantier_messages` filtré sur les 24h via `created_at`. Retourne 429 + message clair si cap atteint. Pas besoin de nouvelle table — source unique de vérité = `chantier_messages` qui persiste déjà tout. **À noter** : l'agent et l'API utilisent maintenant le même check sémantiquement, donc plus de drift possible.

### P2 — Polish observabilité + qualité

- [ ] **Logger centralisé (268 console.log/error/warn non filtrés)** — risque fuite données sensibles en prod (CLAUDE.md règle "fuites de secrets"). Fix : `lib/logger.ts` avec `isDev ? console.log : noop`, et masquage automatique des `Bearer\s+[a-zA-Z0-9_.-]+`. Effort 4h.

- [x] ~~**`/api/health` endpoint**~~ — fait 2026-05-09. `src/pages/api/health.ts` retourne 200 si DB Supabase ping OK + variables d'env présentes, 503 sinon. Pas de check externe (Gemini, whapi, SendGrid) pour ne pas gonfler la latence — ces APIs ont leurs propres SLA. Réponse JSON avec `status` + `checks` détaillés.

- [x] ~~**Code mort — partiel**~~ — fait 2026-05-09 sur 2 items. **`skipN8N` supprimé** de `analyze-quote/index.ts` + des 2 callers (`NewAnalysis.tsx`, `documents/[docId]/analyser.ts`) — confirmé jamais `true` en prod. **Fichier `n8n.ts` supprimé** — aucun import dans le repo, complètement orphelin. **Pas supprimé** : `score_legacy` (encore actif dans verdictEngine + types + 4 consumers — migration progressive nécessaire) ; `register_avenant` (vrai tool actif dans `tools/finance.ts:60`, pas obsolète) ; hacks Gemini 2.5-flash (workarounds nécessaires pour bugs documentés CLAUDE.md).

- [x] ~~**`lot_dependencies` batch delete/insert**~~ — fait 2026-05-09. Refacto `planning.ts:194-249` : 1 SELECT global (au lieu de N) + 1 DELETE batch sur ids (au lieu de N) + 1 INSERT batch (au lieu de N). 3 round trips DB max quel que soit le nombre de lots, contre 3N avant.

- [ ] **MATERIALIZED VIEWS pour `admin_kpis_*`** — 8+ vues temps-réel non matérialisées (daily_evolution, retention_weekly, documents safe_json) avec CTE complexes sur tables volumineuses. Cron `REFRESH MATERIALIZED VIEW` 15 min → gain ~100x sur dashboards admin. Fichier : `20260227200000_optimize_rls_views_constraints.sql:58-175`. Effort ~M (½ j).

- [ ] **Logs trop verbeux (1 MB/min en batch evening)** — 60+ console.log dans `analyze-quote` + agent-orchestrator log raw_body 2k chars sliced. Couper 80% des logs verbeux, garder WARN/ERROR + opt-in DEBUG. Effort 4h.

- [ ] **Stripe webhook CORS restreint** — `*` aujourd'hui (vercel.json header global). Restreindre à signature-only en prod (déjà signé mais belt-and-suspenders). Effort ~S (1h).

- [x] ~~**Hook CI types Supabase drift**~~ — fait 2026-05-09. Workflow `.github/workflows/supabase-types-drift.yml` qui run sur PR touchant `supabase/migrations/**` ou `types.ts`. Compare la régen distante avec le fichier committé, fail avec instruction de régénération si drift. **Pré-requis** : configurer le secret `SUPABASE_ACCESS_TOKEN` dans GitHub Settings → Secrets → Actions (token perso depuis https://supabase.com/dashboard/account/tokens). Sans le secret, le workflow skip avec un warning (pas un fail).

### P3 — Nice to have

- [ ] **Correlation IDs end-to-end** — aucun trace ID partagé entre agent-orchestrator + tools + APIs. Debug en prod = matching manuel sur chantier_id + timestamp. Fix : injecter UUID au start de chaque run + propager via `X-Correlation-ID` sur tous les fetch. Effort ~M (½ j).

- [x] ~~**Tools dispatcher — runtime monitoring "Unknown tool"**~~ — fait 2026-05-09. `console.error("[tools] ${chantierId} unknown tool '${toolName}' (run_type=...)")` ajouté dans `tools/index.ts:85`. Trace désormais les hallucinations LLM côté Supabase logs.

- [ ] **RLS `chantier_whatsapp_messages` optimisation** — triple subquery (chantier_id → groups → user_id). Index sur `group_id` créé récemment mais pattern reste lourd. Évaluer denormalization de `user_id` sur la table messages directement. Effort ~M (½ j).

### Quick wins isolables (< 4h, sans risque régression)

1. **`/api/health` endpoint** (15 min) — visibilité ops, pas d'effet de bord
2. **Logger centralisé** (4h) — supprime risque fuite secrets en logs
3. **DOMPurify sur dangerouslySetInnerHTML** (4h) — élimine 5 vecteurs XSS potentiels
4. **Sentry init basique** (1h sur edge fns + 30min sur API routes) — capture les silent fails immédiatement
5. **Webhook UPSERT idempotence** (2h) — évite double WhatsApp / double facturation
6. **Stripe CORS restreint** (1h) — durcissement low-effort

### Coûts marginaux estimés

| Composant | Par chantier actif / mois |
|---|---|
| Gemini extraction (1-2 devis) | €0.06-0.16 |
| Gemini agent (2-3 runs/jour) | €0.18-0.45 |
| Supabase (DB + edge fn marginal) | €0.05-0.10 |
| Vercel functions (Hobby = 0, Pro = ~€0.05) | €0-0.05 |
| WhatsApp (whapi, ~20-30 msg) | €0.40-1.20 |
| SendGrid + Google Places | €0-0.05 |
| **Total variable** | **€0.65-1.65** |
| **Fixe (Supabase Pro + Vercel Pro)** | **~€25-50/mois total** |

**Gains potentiels du prompt caching agent** : -30 à -40% sur LLM agent ≈ **-€0.05-0.06/chantier/mois** + meilleure latence.

**Plafonds identifiés** :
- Gemini free tier 1k req/min → ~100+ chantiers en batch evening = saturation
- Supabase edge function 60s timeout → extraction PDF >50 pages risquée
- Supabase free tier 5k queries/sec → fan-out 200 chantiers × 8 queries context = 1600 req/min spike OK mais sans marge

**Recommandation** : avant 30 chantiers, attaquer P0 (Sentry + idempotence + timeouts). Avant 50 chantiers, P1 (caching + RLS audit + payment_events_v + retry backoff). P2/P3 = polish à mesure que la base grossit.

---

## GMC — Monétisation : essai gratuit 1 mois + gate paywall

> ⚠️ **MAJ 2026-06-12 : l'implémentation a DIVERGÉ du plan figé ci-dessous.** Fondation
> activation construite, déployée, testée de bout en bout. Source de vérité à jour =
> [`docs/plans/2026-06-12-activation-gmc.md`](docs/plans/2026-06-12-activation-gmc.md) +
> brief emails [`docs/plans/2026-06-12-brief-emails-claude-design.md`](docs/plans/2026-06-12-brief-emails-claude-design.md).
> Décisions qui SUPERSÈDENT le plan figé : essai = **1 mois (30 j)** ; **table dédiée
> `gmc_subscriptions`** (séparée de `subscriptions` VMD, avec `trial_started_at`) ; **trigger**
> `auth.users → gmc_create_trial_on_signup` (essai créé au signup si `signup_source=gerermonchantier`) ;
> **edge function `gmc-on-signup`** (Resend : welcome + notif admin) ; domaine `gerermonchantier.fr`
> **vérifié sur Resend** (`bonjour@`). Le plan figé (15 j, ancre `created_at`) est obsolète pour
> l'archi essai/trigger ; les **SKU Stripe + le paywall** restent valides.
>
> ⚠️ **MAJ 2026-06-14 : MONÉTISATION LIVRÉE + LIVE EN PROD** (commits cfa3845..bb708fa). Stripe complet
> (checkout/portail/webhook routé `metadata.product`/`/api/gmc/status`), **coupon -50% retenu** (`duration:once`,
> Live `Nb2ITi2O`, mensuel via `?offer=1` — PAS code promo), page `/gmc-abonnement`, **gate 2e chantier** (3
> couches, flag `GMC_PAYMENTS_LIVE` = présence des price env vars), bloc « Mon abonnement » + bandeau essai,
> **Phase B emails** (scheduler cycle de vie : conversion/winback/payant). `paymentsLive:true` confirmé. E2E
> sandbox OK. **Reste** : lecture seule J30 (mutations), confirmer prix Multi annuel 210, `RESEND_API_KEY`
> Vercel, test webhook auto, cron trial→expired. Le « plan figé Phase 2 » ci-dessous est **superseded** pour la
> partie Stripe/SKU ; sa partie **read-only/quota reste la réf pour la lecture seule J30**.
>
> ### 🔴 GROS TODO À NE PAS LOUPER (2026-06-12)
>
> ✅ **GATE MULTI-CHANTIER — FAIT + LIVE (2026-06-14)** : gratuit/essai/Essentiel = 1 chantier, Multi payant = illimité. 3 couches (garde backend `sauvegarder.ts` → 403 `code:multi_required` ; carte `AddChantierCard` verrouillée → `/gmc-abonnement?plan=multi` ; garde au montage `NouveauChantier` ; `/api/gmc/status` expose `isMulti`+`paymentsLive`). Conditionné à `GMC_PAYMENTS_LIVE` (présence des price env vars) → actif depuis le go-live. Q1 tunnel (mono/multi) gardée comme signal d'intention.
> 1. ✅ **FAIT (2026-06-13)** : tunnel **auth-first**. Au clic "Tester gratuitement" (déconnecté) → écran
>    **inscription** (plus connexion) → après création du compte, les 3 questions du tunnel s'affichent
>    **une seule fois** (réponses préservées au retour). CTA header → `/mon-chantier/nouveau`. Inscriptions
>    Google embarquées aussi (essai + welcome). Détail : `WIP.md` § Activation GMC.
> 2. **STRIPE -50% (1er mois : 6 € au lieu de 12 €)** : trancher l'implémentation. Reco = **coupon Stripe
>    `duration: once`** appliqué via la checkout (même prix 12 €/mois + coupon, PAS un produit séparé).
>    Julien penche pour un **code réduction sur le produit** (à évaluer : plus simple ?). L'offre -50% est
>    portée par les emails J-3, J-1, trial_ended + relance J+60 (cf. brief Claude Design).
> 3. **Reste activation (Phase B, Stripe)** : intégration **Stripe** + **gates** (lecture seule J30, gate 2e
>    chantier) ; **emails conversion/winback/payant** (J-7/J-3/J-1/fin, winback, paid_welcome/renewal/dunning/
>    goodbye) déclenchés par le scheduler/webhooks Stripe ; `getGmcStatus` + compteur essai visible ;
>    `RESEND_API_KEY` sur **Vercel** (notif /avis) ; nettoyer `AddIntervenantModal` + `migration repair`
>    (lot 12/13/14/15 + 0613090000). ✅ FAIT cette session : scheduler engagement (J1/J3/J7/J14) live, OAuth
>    Google, tunnel auth-first + cohérent, budget estimation affiché, enquête /avis.

> Plan d'implémentation **figé Phase 2 (2026-05-20)** — décisions ci-dessous validées par Johan, à confirmer par Julien avant attaque code (cf. message en bas du document). ⚠️ Voir MAJ ci-dessus : archi essai/trigger superseded, SKU/paywall encore valides.

### Décisions Phase 2 — non-négociables sans validation explicite

- [ ] **Trial 15 jours sans CB** — ancre = `auth.users.created_at` (pas de colonne dédiée `trial_started_at`). Trial actif si `(NOW() - users.created_at) < 15 days`. Aucun field à ajouter sur `subscriptions` pour ça. ⚠️ Conséquence assumée : un user qui s'inscrit VMD et arrive sur GMC > 15j après n'a plus de trial GMC. Acceptable car flux VMD→GMC marginal en V1.
- [ ] **Trial row** = `status='trial'`, `plan='trial'` (générique). Le vrai plan (Essentiel/Multi) est choisi au checkout Stripe.
- [ ] **4 SKU Stripe** alignés avec la landing GMC (`Pricing.astro`) :
  - `gmc_essentiel_monthly` 12 €/mois (1 chantier)
  - `gmc_essentiel_annual` 120 €/an
  - `gmc_multi_monthly` 25 €/mois (chantiers illimités)
  - `gmc_multi_annual` 210 €/an
  - 4 nouvelles env vars : `GMC_STRIPE_PRICE_ESSENTIEL_{MONTHLY,ANNUAL}_ID`, `GMC_STRIPE_PRICE_MULTI_{MONTHLY,ANNUAL}_ID`
- [ ] **Post-trial = read-only + paywall sur écritures** (PAS blocage total). Endpoints GET = 200 OK. Endpoints POST/PATCH/DELETE premium = 403 + payload `{ accessState: 'trial_expired', upgrade_url }`. Justification : conformité RGPD (data hostage = mauvaise pratique B2C) + meilleure conversion (l'user voit ce qu'il rate).
- [ ] **Grace period past_due** = 7 jours (Stripe `past_due` après échec de paiement → l'user garde l'accès 7j le temps de mettre sa carte à jour, puis bascule en `trial_expired`).
- [ ] **Quota IA pendant trial** = appels coûteux uniquement, 30/mois calendaire (UTC) :
  - **Comptabilisé** : `chantier/generer`, `chantier/ameliorer`, `chantier/[id]/regenerer`, `documents/[docId]/analyser`, `assistant/message` (agent-orchestrator)
  - **Gratuit pendant trial** : `chantier/conseils`, `chantier/qualifier`, `documents/[docId]/describe`, `documents/[docId]/extract-invoice`
  - Subscribed = 500/mois (anti-abus). Beta = illimité. Admin = illimité.
  - Indicateur quota visible dans le header cockpit ("12/30 analyses IA ce mois", devient orange < 5 restantes).
- [ ] **Analytics segmentation stricte** : tous les events Amplitude/tracking incluent `userTier: 'trial' | 'beta' | 'active' | 'expired' | 'admin'`. Aucun mélange. Permet de mesurer conversion trial→active séparément par segment.
- [ ] **Grandfathering** : INSERT explicite Johan + Julien par email dans la migration Phase A (`is_beta_tester=true`, `beta_expires_at=NULL`). Pas de trigger auto.
- [ ] **Réponse HTTP paywall** = 403 Forbidden (pas 402). Payload JSON explicite `{ error: 'trial_expired', upgrade_url, accessState }`.

### Hors scope Phase 3 (à coder plus tard)

- [ ] **Limite chantier Essentiel** : pendant V1 paywall, tous les plans = chantiers illimités. La limite "1 chantier" du tier Essentiel sera codée dans une phase ultérieure (upsell modal "Passer en Multi" à la création du 2e chantier).
- [ ] **Pré-câblage onboarding** : la question "un seul / plusieurs chantiers" de `ScreenOnboarding` est posée mais n'est PAS encore persistée. À ajouter quand on codera la limite chantier (point précédent).
- [ ] **Notification email "trial expire dans 3j"** : pas en V1, à ajouter Phase 5+ si besoin retention.
- [ ] **Coupons/promos** : pas en V1.

### Bandeau J restants pendant trial

- [ ] **Composant `TrialBanner`** dans le header cockpit : affiche "Il vous reste X jours d'essai" + CTA "Choisir une formule". Discret, sticky top. Caché pour beta/admin/active.

---

## Comment ce fichier fonctionne

- **Quand on ajoute un item** : description courte + fichier:ligne quand pertinent + effort estimé si on l'a.
- **Quand on attaque un item** : retirer d'ici, créer une entrée `🟡 En cours` dans `WIP.md`.
- **Quand on finit un item** : retirer du WIP, ajouter à `FEATURES.md` si user-facing.
- **Quand on bloque** : reste dans WIP.md avec `🔴` et la raison ; ne pas remettre dans TODO.md.
