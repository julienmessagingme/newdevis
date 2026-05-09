# UX-AUDIT.md — Gérer Mon Chantier

Fichier de référence pour les audits UX/UI successifs du module GMC.  
Chaque audit = une section datée avec verdict + score + delta par rapport au précédent.  
Objectif : mesurer les progrès, détecter les régressions.

---

## Comment utiliser ce fichier

- **Avant chaque sprint UX** : relire l'audit actif pour prioriser
- **Après chaque correction majeure** : mettre à jour le statut dans le tableau "Problèmes critiques"
- **Tous les 2-3 mois** : refaire un audit complet et ajouter une nouvelle section datée
- **En cas de régression signalée** : ajouter une note dans la section en cours

---

## AUDIT #1 — 2026-05-02

### Verdict global

**NO GO pour les novices. GO conditionnel pour les avancés.**

Le module a les fondations solides (modèle de données, logique financière, fonctionnalités pertinentes).  
Problème central : l'interface reflète l'architecture du code, pas le modèle mental de l'utilisateur.

### Score par axe (sur 10)

| Axe | Score | Commentaire |
|-----|-------|-------------|
| Compréhension en 3 secondes | 4/10 | KPIs peu lisibles, terminologie technique |
| Flow "payer une facture" | 3/10 | 6 étapes pour 1 action simple (corrigé partiellement) |
| Guidance novice | 2/10 | Pas d'onboarding, état vide sans prompt |
| Hiérarchie visuelle | 5/10 | "Reste à payer" noyé, colonnes trop équilibrées |
| Assistant IA | 3/10 | Décoratif, invisible sauf dans son onglet |
| Terminologie | 4/10 | Jargon technique visible en UI |
| Mobile | 3/10 | Tableau 9 colonnes illisible |

**Score global : 3.4/10**

---

### Problèmes critiques identifiés

#### C1 — Bouton direct "Enregistrer paiement" manquant
- **Statut :** ✅ Corrigé — 2026-05-02 · commit `6be85c8`
- **Description :** Pour enregistrer un versement, l'utilisateur doit trouver la facture → cliquer le badge statut → ouvrir le drawer → cliquer "+ Ajouter". 6 étapes pour 1 action banale.
- **Impact :** Les utilisateurs n'enregistrent pas leurs paiements → données fausses → produit perd sa valeur.
- **Correction :** Bouton "💸 Paiement" visible sur chaque ligne artisan avec facture. Formulaire ultra-minimal : montant pré-rempli (restant dû), date = aujourd'hui, 1 clic = validé.
- **Corrigé le :** —

#### C2 — Terminologie technique visible en UI
- **Statut :** ✅ Corrigé — 2026-05-02 · commit `c697b3c`
- **Description :** Messages "Lié à la facture — impacte le Budget", "Acompte précédent — ajoutez un versement pour migrer" visibles en prod.
- **Impact :** Perte de confiance. L'utilisateur voit les coulisses de la DB.
- **Correction :** Supprimer ou reformuler : "✓ Comptabilisé dans le budget" / supprimer le message legacy migration.
- **Corrigé le :** —

#### C3 — KPIs header non orientés action
- **Statut :** ✅ Corrigé — 2026-05-02 · commit `c588f59`
- **Description :** KPIs actuels (Budget / Intervenants / Documents / À traiter) informent sans orienter. "Documents: 14" ne dit pas quoi faire.
- **Impact :** Le header est regardé à chaque visite mais ne génère aucune action.
- **Correction :** Remplacer par "X€ à payer cette semaine", "X artisans sans devis", alerte dépassement budget.
- **Corrigé le :** —

#### C4 — État vide sans guidance
- **Statut :** ✅ Corrigé — 2026-05-02 · commit `62234d9`
- **Description :** Chantier avec peu de données = KPIs à 0 + tableau vide. Pas de "prochaine étape".
- **Impact :** Churn à l'adoption. Le produit est utile quand rempli mais ne guide pas pour le remplir.
- **Correction :** Prompt d'action contextuel + barre de progression onboarding (5 étapes).
- **Corrigé le :** —

---

### Problèmes importants identifiés

#### I1 — Statut "En litige" accessible en 1 clic
- **Statut :** 🟠 Backlog
- Risque de mise en litige accidentelle. Correction : confirmation requise + note obligatoire.

#### I2 — Sous-lignes devis visibles par défaut
- **Statut :** ✅ Corrigé — 2026-05-02 · commit `ebe745c`
- Le tableau Budget affiche toutes les sous-lignes. Sur un artisan avec 3 devis = surcharge. Masquer par défaut, expand on click.

#### I3 — Assistant IA invisible sauf dans son onglet
- **Statut :** 🟠 Backlog
- L'IA tourne en arrière-plan et génère des insights mais personne ne va dans l'onglet "Assistant". Surface persistante nécessaire.

#### I4 — Couleur "Reste à payer" anxiogène par défaut
- **Statut :** ✅ Corrigé — 2026-05-02 · commit `2d16ca2`
- Orange sur le restant dû = signal d'alerte sur un état normal. Passer en gris neutre, orange seulement si retard réel.

#### I5 — Vue expert = vue par défaut
- **Statut :** 🟠 Backlog
- Le tableau dense avec 9 colonnes devrait être la vue "expert" accessible via toggle.

#### I6 — Dépense rapide introuvable
- **Statut :** ✅ Corrigé — 2026-05-03
- Le bouton "Dépense" (achat matériaux, paiement liquide) est dans la barre d'actions du Budget. Un novice ne le trouvera jamais là.
- **Correction :** Bouton "🧾 Dépense rapide" ajouté dans une barre "Actions rapides" sur le tableau de bord principal (DashboardHome), entre les KPIs et le planning. Ouvre un drawer complet (libellé, montant, type, lot, note) sans naviguer ailleurs. Token passé depuis les props (pas de createClient au niveau module).

---

### Ce qui marche bien (à ne pas casser)

- ✅ Drawer versements unifié (statut + paiements en 1 seul endroit)
- ✅ KPI "À traiter : 0 — tout est suivi" (feedback positif explicite)
- ✅ Structure par lot + artisan (correspond au modèle mental chantier)
- ✅ Badge score IA sur les devis (différenciant, pas d'équivalent concurrent)
- ✅ Barre de progression bicolore par artisan (lecture instantanée)
- ✅ Accès direct au document (lien externe sur chaque ligne)

---

### Corrections déjà appliquées pendant cet audit

| Fix | Date | Commit |
|-----|------|--------|
| Dropdown statut coupait "Payée intégralement" (overflow viewport) | 2026-05-02 | `66b2fc3` |
| Fusionner statut + drawer versements en 1 seul clic | 2026-05-02 | `c834d42` |
| Comptage "intervenants validés" inclut les factures payées | 2026-05-02 | `2f13fb6` |

---

## AUDIT #2 — 2026-05-09

### Verdict global

**GO conditionnel sur desktop. NO GO mobile sur planning + intervenants.**

Les corrections C1-C4 et I2/I4/I6 sont **toutes confirmées en place**. Le DashboardHome a basculé d'écran de comptage vers écran d'action : ActionCenter 3 boutons + barre d'onboarding 4 étapes + KPIs orientés (À régler / À traiter / Engagés). Le flow paiement est désormais en **2 clics** depuis le BudgetTab (I1 audit précédent).

**Le frein principal vs audit #1 a changé de nature :** ce n'est plus la guidance qui manque, c'est (1) la visibilité de l'Assistant IA hors de son onglet (I3 toujours backlog), (2) le mobile sur planning + tableau intervenants, et (3) quelques incohérences fines (couleur mobile, harmonisation KPIs financiers).

### Score par axe (sur 10)

| Axe | #1 | #2 | Delta | Commentaire |
|-----|----|----|-------|-------------|
| Compréhension en 3 secondes | 4 | **8** | +4 | KPIs orientés action ("💸 X€ à régler" vs "14 documents") |
| Flow "payer une facture" | 3 | **8** | +5 | Bouton 💸 sur chaque ligne artisan, drawer pré-rempli |
| Guidance novice | 2 | **8** | +6 | Onboarding 4 étapes + ActionCenter + cards dashed |
| Hiérarchie visuelle | 5 | **7** | +2 | Action → Onboarding → KPIs → Étapes → Intervenants |
| Assistant IA | 3 | **4** | +1 | Tri-pane livré, mais toujours invisible hors onglet |
| Terminologie | 4 | **8** | +4 | Jargon legacy supprimé, 1 résidu mineur restant |
| Mobile | 3 | **4** | +1 | Sidebar 240px écrase mobile, planning mouse-only, intervenants scroll-X |

**Score global : 6.7/10** (était 3.4/10 → **+3.3**)

---

### Statut des problèmes — synthèse

#### Critiques (audit #1)

| # | Problème | Statut | Vérification AUDIT #2 |
|---|----------|--------|------------------------|
| C1 | Bouton "Enregistrer paiement" direct | ✅ Confirmé | Bouton "💸 Paiement" sur chaque ligne avec `a_payer > 0` (`BudgetTab.tsx:2225-2253`) + sur ArtisanCardMobile (`:1216`) |
| C2 | Terminologie technique | ✅ Confirmé (1 résidu mineur) | Pas de "cashflow_extras" / "manuel" / "source_id" visibles. Reste : "Comptabilisé dans le budget" dans VersementsDrawer header (`:479`) — acceptable mais pourrait disparaître |
| C3 | KPIs orientés action | ✅ Confirmé | `À régler · À traiter · Engagés · Budget` — chaque KPI a icon + label + valeur + sub-texte (`DashboardHome.tsx:1046-1078`) |
| C4 | État vide + onboarding | ✅ Confirmé | OnboardingBar 4 étapes (`DashboardHome.tsx:13-99`), auto-hide à 100%, CTAs inline + cards dashed sur sections vides |

#### Importants (audit #1)

| # | Problème | Statut | Vérification AUDIT #2 |
|---|----------|--------|------------------------|
| I1 | "En litige" en 1 clic | 🟠 Backlog | Toujours dans dropdown direct (`VersementsDrawer.tsx:49`) sans confirmation ni note obligatoire |
| I2 | Sous-lignes devis collapsed | ✅ Confirmé | Devis multiples dans drawer collapsed, "+N autres" expand on click |
| I3 | Assistant IA invisible hors onglet | 🔴 **Backlog persistant** | Pas de bandeau alerts sur DashboardHome ni BudgetTab. Seuls les toasts < 5 min + badge sidebar signalent. User qui n'ouvre jamais l'onglet ne voit rien. |
| I4 | "Reste" couleur neutre | ⚠️ **Partiel** | Desktop = gris (`BudgetTab.tsx:2149`) ✅ · **Mobile = `text-amber-600` par défaut** (`:1204`) ❌ → incohérence à corriger |
| I5 | Vue expert en toggle | 🟠 Backlog | Toujours un seul mode (dense). Pas de toggle "Vue novice / Expert" |
| I6 | Dépense rapide visible | ✅ Confirmé | Bouton "🧾" dans QuickActions DashboardHome, modal complète avec lot/note |

---

### Nouveaux problèmes identifiés (AUDIT #2)

#### N1 — Couleur "Reste à payer" incohérente mobile vs desktop
- **Sévérité :** P1
- **Statut :** 🔴 À corriger
- **Description :** I4 a été corrigé sur le tableau desktop (gris-700) mais la card mobile `ArtisanCardMobile` affiche encore `text-amber-600` (orange) par défaut sur le restant dû — exactement le pattern anxiogène que I4 voulait éliminer.
- **Fichier :** `src/components/chantier/cockpit/budget/BudgetTab.tsx:1200-1207`
- **Fix :** Aligner sur la règle desktop — `text-gray-700` par défaut, `text-orange-600` uniquement si retard avéré (date dépassée ou anomalie).

#### N2 — Assistant IA invisible hors onglet (régression I3 non résolue)
- **Sévérité :** P0 — **frein produit majeur**
- **Statut :** 🔴 Backlog
- **Description :** L'IA tourne, génère des insights pertinents, mais l'utilisateur doit naviguer activement vers l'onglet "Assistant" pour les voir. Le badge sidebar signale un count mais ne dit ni l'urgence ni le contenu. Pas de bandeau persistant sur DashboardHome / BudgetTab / Trésorerie. Toasts limités à `< 5 min`.
- **Impact :** L'IA est l'élément différenciant du produit. Si elle n'est pas visible là où l'utilisateur passe son temps, elle est perçue comme un gadget.
- **Fix proposé :** Bandeau discret (bg-amber-50 + lien vers onglet) sur DashboardHome si `agentInsights.unreadCount > 0`, idem en haut du BudgetTab si insights financiers non lus. Couleur red si `hasCriticalInsight`.

#### N3 — 5 KPIs financiers non harmonisés Budget ↔ Trésorerie
- **Sévérité :** P2
- **Statut :** 🟠 Backlog
- **Description :** CLAUDE.md définit 5 chiffres canoniques (Budget cible / Engagé / Décaissé / À payer / Flux certains). Le BudgetTab les affiche tous via `BudgetKpiDashboard`. La vue Trésorerie en affiche seulement 2-3 explicitement (Budget cible + À payer 30j) ; Engagé / Décaissé / Flux certains sont implicites dans la consommation par source. L'utilisateur doit naviguer entre onglets pour confronter les chiffres.
- **Fix :** Header KPI commun aux deux onglets (Budget + Trésorerie) reprenant les 5 chiffres avec mêmes labels et mêmes couleurs.

#### N4 — PaymentDetailPanel découvrabilité faible
- **Sévérité :** P2
- **Statut :** 🟠 Backlog
- **Description :** Le split d'échéance s'ouvre au clic sur la row d'un payment_event dans Echeancier. Pas de cue visuel (cursor pointer + hover state suffisants ne sont pas assez explicites). L'utilisateur novice ne saura pas qu'on peut splitter une échéance.
- **Fichier :** `src/components/chantier/cockpit/tresorerie/Echeancier.tsx`
- **Fix :** Icon "✏️" ou label "Modifier / Splitter" visible sur hover, ou un menu kebab par row.

#### N5 — Mobile critiques (NO GO sur ces 3 points)
- **Sévérité :** P0
- **Statut :** 🔴 À corriger

**N5a — Sidebar 240px sur mobile**  
La sidebar est `w-[240px]` même sur 375px → ~135px de contenu utile (35% perdu).  
Fichier : `src/components/chantier/cockpit/Sidebar.tsx:67`  
Fix : `w-full sm:w-[240px]` ou drawer fullscreen mobile (pattern PanneauDetail).

**N5b — IntervenantsListView : tableau horizontal sur mobile**  
Tableau 6 colonnes `min-w-[760px]` qui force scroll-X sur 375px, font 10px illisible.  
Fichier : `src/components/chantier/cockpit/lots/IntervenantsListView.tsx:185`  
Fix : variant cartes empilées sous breakpoint `sm` (déjà appliqué dans BudgetTab via `sm:hidden` / `hidden sm:flex`).

**N5c — Planning Gantt non utilisable sur mobile**  
`PlanningTimeline` écoute uniquement `MouseEvent` (`onMouseDown`/`Move`/`Up`). Aucun `onTouchStart`/`Move`/`End`. Les poignées de resize sont en `opacity-0 group-hover/bar:opacity-100` → invisibles sur touch.  
Fichier : `src/components/chantier/cockpit/planning/PlanningTimeline.tsx:60-160`  
Fix : ajouter touch events parallèles (ou utiliser `pointerdown` qui couvre les deux), forcer poignées visibles sous `lg:hidden`. Ou afficher une vue list-mode alternative sur mobile.

#### N6 — Mobile importants
- **Sévérité :** P1
- **Statut :** 🟠 Backlog

**N6a — Icon buttons sous 44×44px**  
Bouton retour ChantierCockpit (`:610`) et LotDetail (`:71`) en `w-8 h-8` (32px). Pencil edit durée LotDetail (`:162`) en `w-6 h-6` (24px). Bouton retour ConversationThread (`:71`) en `p-1` (~20px). Violations WCAG 2.1 (cible tactile minimale 44×44).

**N6b — PanneauDetail sans safe-area iOS**  
Drawer fullscreen sur mobile mais le `overflow-y-auto` du contenu n'a pas `pb-[max(1rem,env(safe-area-inset-bottom))]` — sur iPhone à gesture bar, le contenu scrollable est masqué.  
Fichier : `src/components/chantier/cockpit/PanneauDetail.tsx:60`

**N6c — LotDetail durée sans inputMode**  
`type="number"` sans `inputMode="numeric"` → pavé alpha sur iOS au lieu de pavé numérique.  
Fichier : `src/components/chantier/cockpit/lots/LotDetail.tsx:136`

#### N7 — TresorerieView : référence à champ FinancingConfig non typé
- **Sévérité :** P3
- **Description :** `cfg.tvaOn` et `cfg.tva` référencés mais absents de l'interface `FinancingConfig` (`TresorerieView.tsx:1126`). Pas de bug user-facing immédiat mais TypeScript laxiste = risque TDZ-style en prod (cf. CLAUDE.md "Pièges connus / TDZ").
- **Fix :** Compléter l'interface ou supprimer les références.

---

### Régressions détectées

Aucune régression franche par rapport à l'audit #1 — les correctifs C1-C4 n'ont pas cassé d'autres flows. Les "anciens" problèmes I1, I3, I5 restent simplement non traités.

**Seul cas de demi-régression : N1** — la correction de I4 a été appliquée au tableau desktop mais oubliée sur la card mobile (couleur du restant dû).

---

### Priorisation recommandée pour le prochain sprint UX

| # | Pourquoi en premier | Effort estimé |
|---|---------------------|---------------|
| **N5c** Touch events Planning | Le module est le 2e onglet le plus utilisé après Budget — inutilisable sur mobile = chantier piloté en partie aveugle | 1 j |
| **N2** Assistant IA bandeau persistant | Frein produit majeur — l'IA est invisible donc inutilisée | 0.5 j |
| **N1** Couleur reste mobile | Quick win, 1 ligne | 5 min |
| **N5a + N5b** Sidebar + IntervenantsListView mobile | 30% du trafic est mobile (à valider via analytics) | 1 j |
| **I5** Vue expert toggle | Alternative simple : densité éditable via bouton "compact / aéré" | 0.5 j |
| **I1** Confirmation litige | Risque réel d'erreur + confiance utilisateur | 2 h |
| **N3** Harmoniser KPIs Budget/Trésorerie | Cohérence cognitive | 0.5 j |
| **N6** Touch targets + safe-area | Polish + WCAG | 0.5 j |

**Total estimé pour repasser à 8/10 global :** ~4 jours de travail.

---

### Ce qui est confirmé excellent (à protéger)

- ✅ ActionCenter 3 boutons en haut du DashboardHome — conversion immédiate
- ✅ OnboardingBar 4 étapes auto-hide — guidance progressive sans pollution permanente
- ✅ Bouton paiement direct sur chaque ligne (C1) — flow 2 clics inattaquable
- ✅ Sidebar badges sémantiques (assistant=critical+amber+green, documents=amber-only) — pas de noise
- ✅ AssistantTriPane 3 colonnes desktop / tabs mobile — bonne adaptation
- ✅ Cards dashed sur sections vides au lieu de tableaux blancs
- ✅ Cohérence financière `budgetReel` source unique 3 couches (localStorage + event + DB)

---

## AUDIT #3 — À venir

*(Refaire après corrections N1-N7 + clarification I3/I5)*

---

## Guide pour le prochain audit

Questions à se poser pour chaque écran :

1. Un utilisateur qui n'a jamais vu le produit comprend-il ce qu'il doit faire en 3 secondes ?
2. La prochaine action est-elle évidente visuellement (contraste, taille, position) ?
3. Y a-t-il des mots que seul un développeur comprend ?
4. Combien d'étapes pour accomplir l'action principale de cet écran ?
5. L'assistant IA est-il visible sans qu'on le cherche ?
6. Sur mobile (375px), est-ce lisible sans zoom ?
7. Qu'est-ce qui a régressé par rapport à l'audit précédent ?
