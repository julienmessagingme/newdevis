# Liste des features — VerifierMonDevis + GérerMonChantier

Documentation fonctionnelle (point de vue utilisateur). Décrit ce qu'on peut faire, pas comment c'est fait techniquement.

---

## 0. Vue d'ensemble : 2 produits, 1 mission

### VerifierMonDevis (VMD) — le lead magnet

**Service gratuit** d'analyse de devis d'artisans. Le particulier upload un devis (PDF, photo, scan), notre IA :
- **Extrait les lignes** (description, prix, unité, quantité)
- **Vérifie l'entreprise** (SIRET, ancienneté, santé financière, RGE, avis Google) via 7 APIs publiques
- **Compare les prix** au marché (catalogue de ~270 prix unitaires régionalement ajustés, big data des analyses précédentes)
- **Note la fiabilité** du devis avec un score 🟢 / 🟡 / 🔴 et un rapport détaillé

**Pourquoi VMD existe** : c'est un outil **d'acquisition** (lead magnet). Quelqu'un qui s'apprête à faire des travaux a UN besoin immédiat = "ce devis est-il honnête ?". On répond gratuitement, on capture l'email/téléphone, on lui ouvre la porte de GérerMonChantier.

**Ce que VMD apporte au business** :
- Audience qualifiée (gens qui ont déjà un projet travaux concret)
- SEO long-tail ("vérifier devis plombier", "prix carrelage au m²")
- Crédibilité : on devient l'expert tiers de confiance
- Conversion vers GMC : "tu as ton devis vérifié, maintenant gère ton chantier avec nous"

VMD reste **gratuit à vie** sur les 5 premières analyses. Au-delà, le **Pass Sérénité** (4,99€/mois) débloque les analyses illimitées + le rapport PDF + le tri par type de travaux.

### GérerMonChantier (GMC) — le produit principal

**Outil complet de pilotage** d'un chantier de rénovation, de l'idée à la réception. Pour le particulier qui se lance dans des travaux et qui n'a ni le temps ni l'expertise d'être maître d'œuvre.

Couvre les 5 phases d'un chantier :
1. **Conception** — décrire le projet, l'IA en extrait les lots et le budget
2. **Planification** — Gantt CPM avec dépendances entre lots, réorganisable au drag-and-drop
3. **Devis** — récupérer, comparer, valider les devis artisans
4. **Financier** — suivre le budget engagé / facturé / payé, l'échéancier de trésorerie
5. **Exécution & Réception** — communiquer avec les artisans (WhatsApp + email), suivre les photos, marquer les lots terminés

**L'agent IA "Pilote de Chantier"** (Gemini 2.5-flash function calling) tourne en arrière-plan : il analyse les messages WhatsApp / emails entrants, déclenche des actions, anticipe les retards, propose des décisions à arbitrer, génère un digest journalier.

GMC est en cours de monétisation (les modalités exactes ne sont pas encore arrêtées).

---

## 0bis. Intégrations VMD ↔ GMC — comment l'un nourrit l'autre

C'est le **point névralgique du business model** : VMD attire les leads, GMC les retient.

### Pont 1 — Compte unique
Un user qui crée son compte sur VMD pour analyser un devis a **automatiquement** accès à GMC sans nouveau signup. Même login, même profil, même Pass Sérénité.

### Pont 2 — "Importer depuis mes analyses" (lots → devis)
Dans GMC, à la création d'un chantier, le user voit **toutes ses analyses VMD passées** et peut les rattacher à des lots du nouveau chantier. Bénéfices :
- Pas de double saisie : artisan, montant, score de fiabilité, lignes détaillées, déjà extraites
- Historique : on garde la traçabilité "ce devis vient d'une analyse VMD du 12/03 avec score 8/10"

### Pont 3 — "Uploader un devis" depuis GMC = analyse VMD automatique
Quand le user upload un PDF de devis dans GMC (onglet Documents ou directement dans un lot), le pipeline VMD se lance automatiquement :
- OCR + extraction lignes
- Vérification entreprise
- Score de fiabilité
- Comparaison marché par job_type

Le résultat est rattaché au document, accessible via le lien "Voir l'analyse →" partout où le devis apparaît dans GMC. Pas besoin de changer d'onglet.

### Pont 4 — Contacts auto-créés depuis les analyses
Chaque analyse VMD identifie un artisan (nom, SIRET, téléphone, email si présent dans le devis). Quand on rattache l'analyse à un lot GMC, le contact est **automatiquement créé** dans le carnet du chantier — pas de re-saisie.

### Pont 5 — Catalogue prix mutualisé (`market_prices`)
Le catalogue de ~270 prix unitaires utilisé pour :
- Le verdict prix de VMD ("votre carrelage est 15% au-dessus du marché")
- L'estimation budget initiale de GMC à la création d'un chantier
- Le test de cohérence en continu dans le tableau Budget de GMC ("alerte : devis Maçon dépasse la fourchette marché")

C'est **la même source de vérité** côté backend → un nouveau prix ajouté pour VMD bénéficie immédiatement à GMC, et inversement.

### Pont 6 — Calculatrice prix homepage (entrée VMD pure)
Sur la home VMD, un widget permet d'estimer rapidement un prix au m² pour un type de travaux + un code postal. Branché sur la même `market_prices` table. C'est typiquement le premier point de contact d'un user (recherche Google "prix carrelage m²" → tombe sur la calculatrice → utilise → s'inscrit pour analyser un devis).

### Pont 7 — Big data des analyses → recommandations futures
Chaque analyse VMD insère une ligne dans `price_observations` (anonymisée, avec code postal et job_type). Au bout de quelques mois × milliers d'analyses, on a un dataset unique en France. Usage GMC futur : recommandations d'artisans, prédiction de coûts par localité, alertes "ce prix est anormalement élevé / bas vs autres analyses similaires".

### Diagramme synthèse
```
┌──────────────────────┐         ┌──────────────────────┐
│  VerifierMonDevis    │         │  GérerMonChantier    │
│  (lead magnet)       │  ─────→ │  (produit principal) │
│                      │         │                      │
│  Analyse devis       │         │  Pilotage chantier   │
│  Note fiabilité      │         │  Planning CPM        │
│  Vérifie entreprise  │         │  Budget/Trésorerie   │
│  Calculatrice prix   │         │  Messagerie WA+Email │
│  Pass Sérénité 4,99€ │         │  Agent IA pro-actif  │
└──────────────────────┘         └──────────────────────┘
        │                                ▲
        │  Compte unique, market_prices, │
        │  pipeline d'analyse partagé,   │
        │  contacts auto, big data       │
        └────────────────────────────────┘
```

---

## 0ter. Multi-domaine : verifiermondevis.fr + gerermonchantier.fr

Depuis 2026-05-07/08, les deux produits ont leur propre domaine — mais c'est **toujours le même build** Vercel, le même Supabase, le même utilisateur sous-jacent.

### Ce que voit l'utilisateur

| Quand il est sur… | Il voit… |
|---|---|
| `verifiermondevis.fr` | Marque VMD (logo "VerifierMonDevis.fr"), landing analyse de devis, tableau de bord VMD |
| `gerermonchantier.fr` | Marque GMC (logo "GérerMonChantier" + Syne), landing produit chantier, cockpit |
| `verifiermondevis.fr/connexion` | Form de connexion brandé VMD (titre, panneau droit, OG, canonical) |
| `gerermonchantier.fr/connexion` | Form de connexion brandé GMC (titre "Connexion à votre Pilote IA", panneau navy, OG GMC) |

### La landing GMC et sa vidéo démo

Sur `gerermonchantier.fr/`, le visiteur découvre le produit : hero "Votre chantier, piloté au millimètre", deux portes d'entrée ("Je démarre un projet" / "J'ai déjà mes devis"), fonctionnalités, Pilote IA, tarifs.

Sous le hero, un lien **"Voir une démo en 60 s"** ouvre en plein écran (modale) une **vidéo motion design** : 60 secondes, 12 scènes animées qui racontent le parcours — du chaos d'un chantier à son pilotage par l'IA (hub multi-chantiers, simulation d'aides, comparaison de devis, planning en cascade, trésorerie prédictive, canal WhatsApp, journal horodaté). Fermeture par la croix, le fond ou la touche Échap.

### Comportement post-login

- Login Julien (allowlist GMC) sur `vmd.fr/connexion` → handoff SSO → atterit sur `gerermonchantier.fr/mon-chantier`. URL et marque cohérentes avec le produit accessible.
- Login Julien sur `gmc.fr/connexion` → reste sur `gmc.fr/mon-chantier` (pas de handoff inutile, déjà sur la bonne marque).
- Login d'un user random VMD (pas allowlist GMC) → reste sur `vmd.fr/tableau-de-bord` (son produit).

### "Mon chantier" = bouton omniprésent côté VMD

- Toujours visible dans le header VMD (desktop + mobile) et le bandeau Chantier sur le tableau de bord VMD.
- Pour un user allowlisté GMC : click → SSO handoff → cockpit GMC sur `gerermonchantier.fr/mon-chantier`.
- Pour les autres : click → landing GMC `gerermonchantier.fr/` (futur upsell Stripe avec 15j gratuits).

### Déconnexion = cross-domaine

Cliquer "Déconnexion" sur **n'importe quel domaine** déconnecte instantanément l'utilisateur des **deux** :
1. Supabase global signOut serveur-side (invalide tous les refresh tokens).
2. Redirect chain visible (~300ms) vers `<other>/auth/clear-session` qui vide le localStorage de l'autre origine, puis revient.

### Tracking d'acquisition

Tout signup envoie un champ `signup_source` (`verifiermondevis` ou `gerermonchantier`) au webhook analytics. À terme, sera persisté en DB pour distinguer les cohortes d'acquisition.

### Limitation v1

L'accès GMC est aujourd'hui **par allowlist hardcodée** (`src/lib/gmcAccess.ts` : julien + Johan). Quand Stripe sera prêt, sera remplacé par lecture DB (colonne `subscriptions.has_gmc_access`) avec proposition d'onboarding 15 jours gratuits.

---

## 1. Création d'un chantier — phase Conception

Accès : **/mon-chantier/nouveau**

> **Pain résolu** : aujourd'hui un particulier qui se lance dans une rénovation passe **15-30h sur internet** à essayer de comprendre quels lots il faut, dans quel ordre, combien ça coûte vraiment, quels artisans contacter, et quelles formalités sont obligatoires. Beaucoup démarrent à l'aveugle, sous-estiment le budget de 30-50%, et abandonnent en cours de route.
>
> **Avantage marché** : aucun outil grand public ne fait du **chiffrage prédictif IA + planification CPM + checklist formalités** en 60 secondes depuis un simple texte libre. Travaux.com / Habitatpresto / Constructeurs n'offrent que de la mise en relation. Notre concurrence indirecte (Excel, Trello, Notion templates) demande au user de tout saisir lui-même.

### Étape 1 — Choix du mode de gestion (`ScreenModeSelection`)
3 modes au choix (impacte les prompts IA et le dashboard) :
- 🟦 **Guidé** — pédagogique pas-à-pas, conseils détaillés, idéal premier chantier
- 🟧 **Flexible** — dashboard complet, pour utilisateurs expérimentés (auto-promoteur, famille déjà au 2e/3e chantier)
- 🟪 **Investisseur** — focus trésorerie et rentabilité, métriques financières (loyer/m², ROI, valorisation patrimoniale)

### Étape 2 — Description libre du projet (`ScreenPrompt`)
Champ texte naturel : *"rénovation maison 120m² avec piscine enterrée et terrasse bois 30m²"*. L'IA détecte automatiquement les éléments via un mapping de keywords (~60 patterns piscine/extension/cuisine/SDB/façade/toiture/etc.) et **pré-remplit déjà des fourchettes budget min/max + durée par élément** AVANT même de demander des précisions.

Exemples :
- `piscine enterrée` → 25-45k€, 8 semaines
- `pool house` → 15-35k€, 6 semaines
- `cuisine équipée 12m²` → 8-25k€, 3 semaines

### Étape 3 — Qualification IA (`ScreenQualification`)
Pour chaque élément détecté, l'IA pose **4-5 questions ciblées** (Gemini 2.5-flash) qui réduisent l'incertitude budget :
- Surface précise (m²) → divise par 2 la fourchette typique
- Matériau (gamme entrée/intermédiaire/premium) → ajuste de ±30%
- État actuel (à neuf / rénovation lourde / rafraîchissement) → -20% à +40%
- Ambition (basique / standard / haut de gamme) → ±15%
- Localisation précise (code postal) → coefficient régional ×0.8 à ×1.3

3 questions FIXES sont aussi injectées si non détectées : `budget_tranche`, `date_debut`, `code_postal`. Sans ces 3, la fiabilité tombe à "faible".

### Étape 4 — Génération progressive (`ScreenGenerating`)
5 étapes affichées en temps réel à l'utilisateur (rassurant, augmente le sentiment de valeur) :
1. **Analyse du projet** — identification des travaux concrets
2. **Structure & planning** — création de la roadmap CPM avec lots chaînés (Maçon → Élec/Plombier en parallèle → Plaquiste → Carreleur → Peinture)
3. **Budget estimatif par poste** — fourchettes min/avg/max avec **niveau de fiabilité** (haute / moyenne / faible) calculé sur 5 signaux extraits de la description (cf. § 1bis)
4. **Formalités & artisans** — normes applicables (RT2012/RE2020, NF DTU, RGE), permis nécessaires (déclaration préalable / permis de construire / Consuel), types d'artisans recommandés
5. **Checklist & aides** — démarches administratives détaillées avec liens .gouv.fr, aides financières éligibles avec montants estimés

### Étape 5 — Wow (`ScreenWow`)
Affichage animé des stats clés du projet généré : budget total, durée totale, nombre de lots, nombre d'artisans à contacter, nombre de formalités. **Effet "wow" pour transformer le visiteur en utilisateur engagé** avant la sauvegarde.

### Étape 6 — Sauvegarde + accès dashboard
- INSERT `chantiers` + `lots_chantier` (avec planning CPM) + `todo_chantier` (checklist)
- Redirection vers `/mon-chantier/[id]` (cockpit complet)

### Résultat
Chantier complet en moins de **5 minutes** au lieu de 15-30h de recherche. **Budget prévisionnel calibré** par notre dataset (cf. § 1bis) plutôt que des estimations en l'air. **Planning CPM réaliste** avec dépendances métier. **Checklist administrative** pour ne rien oublier. **Prêt à l'emploi** : il ne reste plus qu'à demander les devis aux artisans (lots déjà créés, types détectés, contact à faire).

---

## 1bis. Comment l'IA détermine le budget à la création

> **Pain résolu** : un particulier moyen sous-estime son budget travaux de **30-50%** parce qu'il oublie les coûts cachés (préparation, déchets, frais fixes par poste, finition) et utilise des prix au m² trouvés sur des forums datés. Conséquence : il signe un devis qu'il ne peut pas honorer ou il découvre en cours de chantier qu'il ne peut pas finir.
>
> **Avantage marché** : on est l'une des seules plateformes grand public à brancher l'estimation budget sur **un dataset réel et vivant** (270+ entrées catalogue prix + big data des analyses VMD passées) plutôt que des moyennes statiques. Calculé en temps réel avec coefficient géographique. Intégré au flux de création — pas un simulateur séparé.

Le budget prévisionnel n'est pas saisi à la main — il est estimé par l'IA à partir de la description du projet, puis affiné par lot avec un indicateur de fiabilité.

### Sources de données utilisées
- **Catalogue interne `market_prices`** : ~270 lignes de prix unitaires HT (avec fourchette min/avg/max + frais fixes) couvrant les principaux types de travaux. Issus de l'historique des devis analysés sur VerifierMonDevis.
- **Coefficient géographique** : la zone (code postal) module les prix de référence (zone détendue / standard / chère).
- **Catalogue matériaux** (`MATERIALS_MAP`) : 17 types de chantier × 3+ options matériaux (économique / intermédiaire / premium), avec `priceMin/Max` par unité.
- **Données prix immobiliers DVF** : utilisées dans les recommandations de valorisation patrimoniale, pas dans le budget directement.

### Indicateur de fiabilité (haute / moyenne / faible)
Affiché à côté de chaque ligne de budget. Calculé à partir de **5 signaux** présents dans la description initiale :
- **`hasLocalisation`** — code postal ou ville donnés
- **`hasBudget`** — budget cible mentionné
- **`hasDate`** — date de démarrage souhaitée
- **`hasSurface`** — m², ml, ou format `X×Y` mentionnés
- **`typeProjetPrecis`** — l'IA a su classifier le projet (pas "autre")
- **`nbLignesBudget`** — nombre de postes que l'IA a détaillés

Plus de signaux → plus la fourchette est resserrée. Si la description est très vague (ex: "je veux refaire ma maison"), l'IA donne quand même un budget mais avec fiabilité **faible** et une fourchette large.

### Affinage post-création
- **Inline edit dans LotDetail** : on peut modifier la durée et observer l'impact CPM en cascade. Le budget min/max du lot reste celui de l'IA jusqu'à ce qu'un devis soit validé.
- **Devis validé** : prend le pas sur l'estimation IA → le budget du lot devient le montant du devis signé (visible dans la colonne "Engagé" du tableau Budget).
- **Ré-estimation manuelle** : pas encore exposée en UI directe (à demander à l'agent IA via le chat).

### Conseils budget générés en continu
6 types de conseils calculés en arrière-plan et affichés dans le tableau Budget + journal :
- **Budget global dépassé** (somme devis validés > budget cible)
- **Budget lot dépassé** (devis validé d'un lot > fourchette IA max × 1.2)
- **Devis manquant** (lot avec uniquement des factures, aucun devis signé)
- **Comparaison nécessaire** (un seul devis reçu pour un lot, pas de comparable)
- **Devis à relancer** (devis "en cours" depuis plus de 14j)
- **Frais annexes signalés** (frais déclarés au chat hors devis)

---

## 2. Hub /mon-chantier

Liste de tous les chantiers de l'utilisateur.

- **Vue en grille** : pour chaque chantier on voit l'emoji, le nom, le budget cible, la phase en cours (conception / planification / devis / financier / exécution / réception), le nombre de devis reçus, le montant des devis signés
- **Actions par chantier** (bouton crayon au survol) : **renommer** le chantier en ligne, **"Modifier le projet avec l'IA"** (ouvre l'éditeur de prompt du cockpit), **supprimer** (avec confirmation)
- Bouton **"+ Nouveau chantier"** pour créer un projet

---

## 3. Onglet **Accueil** (cockpit du chantier)

Vue d'entrée du chantier — refonte design GMC (sidebar navy, fond crème). Tout le projet lisible en un écran.

### Header
- Emoji + **nom du chantier** en grand titre.
- **Stepper de démarrage** "N/4 étapes" (Chantier créé · 1er artisan · 1er devis · Budget défini) avec un CTA vers l'étape manquante. Disparaît une fois les 4 étapes faites.

### 3 actions rapides
Enregistrer un paiement · Ajouter un devis ou facture · Ajouter un artisan.

### Colonne gauche
- **Bulle Planning** — flèche temporelle début → fin de chantier, avec les rendez-vous posés en jalons (titre + date visibles). Libellés adaptatifs : "Début" + "Livraison estimée" si le chantier a démarré par une date de début, "Début estimé" + "Livraison visée" s'il a démarré par une date de fin. Clic → onglet Planning. Si aucune date : CTA "Définir le planning".
- **Panneau Intervenants** — une carte par lot : émoji du métier, état (à démarrer / en sélection / engagé), **dernière action** sur le lot (devis reçu, facture payée, frais… avec le nom de l'entreprise) et sa date. Clic → vue détail du lot.

### Colonne droite
- **Carte Budget** — montant cible, jauge décaissé / à payer / reste, encart "Flux certains".
- **Tuile "À régler"** — montant des factures non soldées ; cliquable → onglet Budget & Trésorerie filtré sur "À payer".
- **Tuile "À traiter"** — nombre d'actions en attente (factures à régler + devis à valider) ; clic → liste détaillée.
- **Alerte IA** — entrée vers l'Assistant chantier.

### Vue détail lot (clic sur une carte intervenant)
- En-tête : emoji, nom, fourchette budget
- **Section Planning éditable** : durée en jours (édition inline), date début/fin (calculées), statut modifiable
- **Tableau Devis & Factures** : artisan, type, score fiabilité, montant, statut (en cours / valide / attente facture)
- **Section "Frais annexes déclarés"** (ambre) : liste des frais déclarés au chat, date + montant + total
- **Photos du lot** : grille miniature, zoom au clic, suppression individuelle
- **Autres documents** : plans, autorisations, etc.

---

## 4. Onglet **Budget & Trésorerie**

> **Pain résolu** : 70% des chantiers de rénovation dérapent en coût ET en délai. Le particulier découvre les dépassements **trop tard** (à la facture finale) parce qu'il pilote dans Excel sans vue agrégée. Il ne sait pas si la trésorerie passera dans 3 semaines, ni si une aide MaPrimeRénov est en retard. Stress permanent.
>
> **Avantage marché** : 4 vues qui dialoguent ensemble (Budget, Cashflow, Plan financement, Échéancier prédictif) — vs Excel ou Notion qui demandent au user de tout maintenir. Alimentation **automatique** : devis uploadé via VMD → engagé. Facture analysée → facturé. Paiement déclaré au chat IA → payé. Le user clique 0 fois pour avoir une vue à jour.

Quatre vues complémentaires (sous-onglets internes).

### A. Vue Budget — tableau par lot/artisan
- KPIs en haut : budget estimé · devis validés · total facturé · total payé
- **Tableau** : 1 ligne par artisan groupé par lot. Colonnes : artisan, devis (montant + statut + lien doc), factures, statut, reste à payer, progression paiement, actions
- **Accordéon dépliable** : détail devis/factures avec dropdown pour changer le statut
- Statuts devis cliquables : en cours · valide · attente facture · litige
- Statuts facture cliquables : reçue · payée partiellement · payée · en litige
- **Recherche + filtres** : par artisan, statut, lot
- **Indicateurs d'alerte** :
  - "Devis manquant" (ambre) si une facture existe sans devis associé — **exclu** pour `ticket_caisse`, `achat_materiaux`, `frais` (pas de devis par définition)
  - "📝 X€ frais" si des frais déclarés au chat sont rattachés
- **Statut des tickets et achats** : `ticket_caisse` et `achat_materiaux` affichent un badge "Payé" statique sans dropdown — ces documents sont toujours déjà payés. Ils sont comptés dans le total `payé` peu importe leur `facture_statut` DB.
- Bouton "+ Ajouter un document" : upload manuel d'un devis/facture/ticket
- **Gestion des versements échelonnés** (`VersementsDrawer`) : pour chaque artisan dont le devis est "acompte" ou "soldé", un drawer slide-right permet de créer / modifier / supprimer des versements individuels. Règle de plafond : la somme des versements ne peut pas dépasser le montant engagé de l'artisan (cap validé à la saisie). Chaque nouveau versement invite à joindre un justificatif (reçu, virement, photo). Date de versement = jour même par défaut, modifiable. Les versements sont stockés dans `documents_chantier.cashflow_terms` (JSONB) et reflétés via la VIEW `payment_events_v` dans le cashflow et l'échéancier — voir DOCUMENTATION.md § Architecture cashflow.
- **Enveloppe budget** : la valeur initiale est chargée depuis `chantiers.enveloppe_prevue` (DB) au montage — plus d'initialisation auto depuis le montant engagé.

### B. Vue Cashflow / Trésorerie
- 4 KPIs : solde disponible · à payer 30j · financement attendu · retards
- Graphique 14 semaines : barres entrées/sorties + courbe solde prévisionnel
- **Alertes IA** : tension trésorerie, retards de paiement, déblocages à relancer
- Projection 7/30/60 jours : cash entrant vs engagé vs payé
- **Sources de financement** : 3 cartes configurables (Apport / Crédit / Aides)

### C. Plan de financement
- Jauge colorée par source (apport / crédit / aides) avec montants
- Donuts % restant par source + barres de consommation par artisan
- Liste paiements attendus : crédit débloqué, aides reçues, apports versés

### D. Échéancier — vue prédictive
- Réponse à "Vais-je avoir des difficultés de trésorerie ?"
- Graphique barres + courbe de solde par semaine
- 2 colonnes : sorties (factures à payer) et entrées (déblocages, aides)
- Bandeaux IA : tension détectée, retards, déblocages à relancer

### E. Aides énergétiques (MaPrimeRénov' / CEE / Éco-PTZ)

> **Pain résolu** : les aides sont éclatées sur 5+ sites (france-renov, ANAH, Effy, ADEME, son fournisseur d'énergie). Calcul complexe (tranche revenu × type travaux × statut occupant). 60% des particuliers éligibles à MaPrimeRénov ne la demandent pas par méconnaissance ou complexité.
>
> **Avantage marché** : simulateur en 3 étapes intégré au flux Budget → import direct dans le plan de financement. Pas un outil séparé. Couvre les 3 dispositifs principaux + tranches MPR à jour 2026.

Simulateur intégré pour estimer les aides État disponibles selon les travaux réalisés. Accès depuis le panneau "Plan de financement" → carte "Aides".

#### Étape 1 — Type de travaux + coût
Liste de **8 types éligibles** aux aides énergétiques (basée sur le barème Effy) :
- Pompe à chaleur (air/eau, géothermie)
- Chauffage bois (poêle, insert, chaudière)
- Isolation (combles, murs, planchers)
- Fenêtres (double vitrage)
- Chauffe-eau solaire / thermodynamique
- Ventilation double flux
- Audit énergétique
- Rénovation globale

Coût HT à saisir → la simulation se base sur ce montant.

#### Étape 2 — Profil
3 questions qualifiantes :
- **Statut** : propriétaire occupant / propriétaire bailleur / locataire (MaPrimeRénov' réservée aux propriétaires)
- **Logement > 2 ans** : MPR + CEE + Éco-PTZ exigent un logement achevé depuis plus de 2 ans
- **Résidence principale** : MPR et Éco-PTZ uniquement sur résidence principale

Puis :
- **Composition du foyer** (1 à 5+ personnes)
- **Revenu fiscal de référence annuel** (€) → détermine la tranche MPR

#### Étape 3 — Résultats
Carte gradient bleu/vert avec :
- **Économie totale estimée** (somme des 3 aides)
- **% du coût absorbé** par les aides
- **Reste à charge** vs **Aides directes** côte à côte

Détail par aide :
- 🟢 **MaPrimeRénov'** : taux par tranche revenu (Bleu/Jaune/Violet/Rose) × coût, plafonné par type de travaux. Artisan RGE requis.
- 💡 **CEE (Certificats d'Économie d'Énergie)** : montant forfaitaire par type de travaux. Cumulable MPR.
- 🏦 **Éco-PTZ** : prêt à taux 0% jusqu'à 50 000€, complémentaire (pas une subvention).

#### Tranches MPR (calcul automatique)
| Tranche | Foyer 1 pers (revenu max) | Foyer 4 pers (revenu max) |
|---|---|---|
| 🔵 Bleu (très modeste) | ~17 000€ | ~33 000€ |
| 🟡 Jaune (modeste) | ~22 000€ | ~42 000€ |
| 🟣 Violet (intermédiaire) | ~30 000€ | ~58 000€ |
| 🌸 Rose (supérieur) | au-delà | au-delà |

Plus le revenu est bas, plus le taux MPR est élevé.

#### Import dans le plan de financement
Bouton **"Importer ces aides"** : pré-remplit la carte "Aides" du plan de financement avec le montant simulé → visible dans Cashflow et Échéancier.

#### Limites du simulateur
- Estimation indicative — les barèmes réels évoluent (Anah).
- Ne remplace pas le formulaire officiel france-renov.gouv.fr.
- Ne calcule pas la TVA réduite à 5,5% (à voir avec l'artisan).

---

## 5. Onglet **Planning**

> **Pain résolu** : un chantier sans planning visuel = retards en cascade non anticipés. Le particulier appelle le plombier le matin pour découvrir que le maçon n'a pas fini → décalage non programmé → carreleur arrive dans la maison sans préparation. Coût caché énorme (artisans payés à se déplacer pour rien, journées d'attente).
>
> **Avantage marché** : Gantt drag-and-drop **avec recalcul CPM en temps réel** (algorithme MS Project / Primavera, normalement réservé aux pros BTP). Multi-parent : "Plaquiste démarre quand Plombier ET Élec ont fini". L'agent IA peut aussi le modifier à la voix dans le chat ("décale plombier d'1 semaine"). Aucun outil grand public ne fait ça.

Gantt interactif basé sur la méthode CPM (Critical Path Method).

### En-tête du planning
- Nombre de semaines + d'intervenants.
- **Réception estimée** = fin du dernier lot du chemin critique. Si une date de fin souhaitée existe : badge "✓ dans les temps" ou "⚠ dépasse l'objectif de N jours".
- Le chantier se pilote par une **date de début** (le CPM calcule la fin) OU par une **date de fin souhaitée** (le CPM remonte le chemin critique pour déduire la date de début). "Modifier la date de fin" enregistre l'objectif.

### Vue Gantt
- **Colonne gauche sticky** : noms des lots
- **Barres colorées par lot** sur axe horizontal (semaines en haut), 1 couleur stable par lot
- **Drag-and-drop horizontal** : déplacer une barre change la date de début. Si le lot a des successeurs (lots qui dépendent de lui), l'IA peut demander cascade ou détaché.
- **Drag-and-drop vertical** : changer la "lane" (ligne) du lot pour le parallel-iser avec un autre ou le détacher de la chaîne
- **Resize bordures** : tirer le bord droit de la barre pour modifier la durée
- **Ghost row** : ligne vide en bas pour drop = créer une lane indépendante (lot sort de la chaîne)
- **Recalcul CPM automatique** : après chaque modification, toutes les dates dépendantes se mettent à jour
- **Dépendances multi-parent** : un lot peut attendre la fin de plusieurs prédécesseurs (ex : "Plaquiste démarre quand Plombier ET Électricien ont fini")

### Vue avancée — sous-phases (premium)

> **Pain résolu** : un lot "Plombier" ou "Électricien" n'est pas monolithique. À l'intérieur il y a des étapes qui s'enchaînent et qui conditionnent d'autres métiers (la mise en eau du plombier doit être finie avant que l'électricien intervienne). Le Gantt au niveau lot ne capture pas ce détail → l'utilisateur ne voit pas ces enchaînements fins.

Un **toggle Simplifié / Avancé** en haut de l'onglet Planning. Le mode **Avancé** fait partie de l'abonnement premium GérerMonChantier (cadenas + invitation à s'abonner pour les autres ; pour l'instant ouvert aux comptes habilités).

En mode avancé :
- Chaque lot peut être **découpé en sous-phases** (ex : Plombier → « Mise en eau », « Test pression », « Finitions »).
- On **chaîne les sous-phases**, y compris **entre métiers** : « l'électricité démarre quand la mise en eau du plombier est terminée ». Les dates se recalculent automatiquement.
- Cliquer un lot ouvre un **panneau en bas** : ajouter/modifier/supprimer les sous-phases (nom, durée, statut) et définir leurs dépendances.
- **Protection anti-boucle** : impossible de créer une dépendance circulaire (message clair de refus).
- La **vue simplifiée reste identique** : on bascule entre les deux sans rien perdre. Le budget, les devis et les factures restent gérés au niveau du lot.

### Vue Rendez-vous
- Calendrier avec navigation flèches ← →
- Ajouter un RDV : titre, date, heure, type (Artisan / Visite / Signature / Autre)
- Liste triée par date, édition / suppression inline

---

## 6. Onglet **Intervenants & Devis**

Réponse à : *"Ai-je tout pour choisir mes artisans ?"*

- **Vue par lot** : 1 carte par lot, empilées verticalement
- **Statut visuel** clair par badge :
  - "Aucun devis" (gris) → CTA "+ Ajouter un devis"
  - "1 devis" (ambre) → "Obtenez un 2e devis pour comparer"
  - "Comparaison possible" (bleu) → consultez les scores
  - "Artisan sélectionné" (vert) → "lot suivi dans l'échéancier"
- **Sous chaque lot** : liste des devis reçus avec nom artisan, date, montant, score d'analyse IA, statut, lien "Voir l'analyse"
- **Section "Frais annexes déclarés"** (ambre) sous le lot : frais déclarés au chat (date + montant + détail)
- **Modal Comparateur** (si 2+ devis) : 2 devis côte à côte avec montants, scores, durées, prix unitaires détaillés
- **Devis non affectés** : section spéciale pour les devis uploadés sans lot (drag pour rattacher)

---

## 7. Onglet **Documents**

Bibliothèque de tous les documents du chantier, organisés par catégorie.

### 7 sections dépliables
- 📋 **Devis** — devis artisan
- 🧾 **Factures** — factures fournisseur (avec pièce jointe)
- 🛒 **Achats & tickets** — tickets de caisse, achats matériaux
- 📝 **Frais déclarés** — frais déclarés au chat IA (sans pièce jointe)
- 📷 **Photos** — photos du chantier (avec miniatures)
- 📐 **Plans** — plans architecte, photos plans
- 📁 **Documents administratifs** — permis, attestations assurance, autres

### Pour chaque document
- Icône type, nom, date, taille, lot rattaché (badge cliquable)
- Photos : miniature image au lieu d'icône
- Actions : renommer, changer le lot, ouvrir, télécharger, supprimer
- **Drag-and-drop** : glisser un doc sur un autre lot pour le réaffecter
- Recherche globale en haut de page

### Upload
- Bouton "+ Ajouter un document" : multi-upload, détection automatique du type (devis/facture/photo), suggestion de lot par IA après extraction OCR

---

## 8. Onglet **Contacts**

Carnet du chantier — sources unifiées (manuels + extraits des devis/factures).

### Pour chaque contact
- Nom, email, téléphone, SIRET/SIREN, rôle (artisan / architecte / maitre d'œuvre / bureau études / client / autre)
- Source : manuel / devis / facture / analyse
- Lot rattaché (cliquable)
- Notes libres
- Actions : éditer, changer de lot, supprimer

### Fonctionnalités
- **Recherche** : par nom, email, téléphone
- **Bouton "+ Ajouter contact"** (modal) : nom, email, téléphone (avec sélecteur indicatif pays), rôle, lot optionnel
- **Auto-enrichissement** : les contacts détectés via les analyses de devis sont créés automatiquement
- **Liens vers les conversations** : un contact avec email/téléphone ouvre directement le thread email ou WhatsApp dans Messagerie

---

## 9. Onglet **Messagerie**

> **Pain résolu** : un chantier moyen = 5-10 artisans + 2-3 fournisseurs + architecte + maître d'œuvre + admin. Soit 100+ messages par semaine éparpillés sur WhatsApp perso, SMS, mail Gmail, devis Facebook Messenger. Le particulier perd des trucs critiques (devis non répondu, RDV oublié, photo perdue).
>
> **Avantage marché** : tout dans **une boîte unique liée au chantier**. WhatsApp pro via whapi (vrais groupes WhatsApp + accusés de lecture), email avec reply-to dédié SendGrid (réponses arrivent direct dans le thread). Templates pré-rédigés par cas (relance devis, demande facture, etc.). Aucun concurrent grand public n'offre ça.

Centralise les emails et WhatsApp du chantier.

### Email (SendGrid)
- **Liste conversations** : 1 par contact, expéditeur, sujet, date, badge non-lus
- **Thread message** : chronologie des échanges
- **Composer** : zone de saisie + sélecteur de templates pré-rédigés
- **Envoi** : depuis l'adresse `chantier-{id}+{convId}@reply.verifiermondevis.fr`. Les réponses arrivent automatiquement dans le thread.

### WhatsApp (whapi.cloud)
- **Plusieurs groupes possibles par chantier** (ex : "Plomberie", "Général", "Maçonnerie")
- **Création de groupe** : sélection des contacts du chantier → création du vrai groupe WhatsApp avec lien d'invitation
- **Membres visibles** par groupe avec leur rôle (gmc / client / artisan)
- **Thread** : bulles colorées par rôle (vert client/gmc à droite, blanc artisan à gauche, façon WhatsApp)
- **Filtre** : un groupe à la fois ou vue agrégée
- **Templates de messages** : relance artisan, demande devis, demande facture, etc.

### Mobile
- Vue 2 colonnes en desktop, vue unique avec bouton retour en mobile

---

## 10. Onglet **Journal de chantier**

Mémoire long-terme du chantier — un digest IA par jour, en livre.

- **Navigation** : flèches ← / → pour parcourir les jours
- **Mini calendrier 14 jours** : pastilles colorées par sévérité du jour (vert info / ambre warning / rouge critical)
- **Page du jour** :
  - Markdown rédigé par l'IA (digest généré chaque soir à 19h)
  - Résumé des décisions prises ce jour (planning modifié, dépenses déclarées, etc.)
  - Alertes du jour avec horodatage
  - Clarifications demandées par l'IA
- Bouton "Voir l'assistant" pour discuter du jour avec l'IA

---

## 11. Onglet **Assistant chantier**

> **Pain résolu** : pendant un chantier le particulier a 50+ questions urgentes ("le plombier dit qu'il faut +800€, je valide ?", "je peux décaler l'élec d'1 semaine sans casser le planning ?", "j'ai claqué 200€ chez Leroy Merlin, où je le note ?"). Personne pour répondre, ou un proche bricoleur sollicité 10x/jour. Décisions prises au feeling avec angoisse.
>
> **Avantage marché** : véritable copilote IA qui **connaît le chantier en profondeur** (planning, budget, contacts, messages reçus, photos). Peut PRENDRE des actions (décaler le planning, créer une facture, envoyer un WhatsApp à l'artisan) — pas juste répondre. Channel WhatsApp privé pour notifs proactives même quand l'app est fermée. Aucun équivalent grand public.

Centre de discussion avec l'IA + traçabilité de ses actions. Layout **3 colonnes** (desktop) ou **tabs** (mobile, switch entre les 3 panneaux).

### Colonne gauche — Alertes IA
- Tout ce que l'IA a remonté **qui demande ton attention** : budget dépassé, retard paiement, risque détecté, demandes de clarification.
- 30 derniers jours, triés chrono décroissant.
- Click sur une alerte = marquée comme lue (le point bleu disparaît). Bouton "Tout marquer lu" en haut à droite.
- Icônes colorées : 🔴 critique, 💰 budget, 📅 planning, ⏰ retard, 🔄 changement statut, ⚠️ risque, 🔔 clarification, 💭 résumé conv.
- Compteur d'alertes non-lues affiché dans le badge sidebar de l'onglet Assistant (orange si non-critique, rouge si critique, vert "✓ OK" si rien à voir).

### Colonne centrale — Chat IA
- Historique des messages user/assistant
- Messages "agent_initiated" (initiative IA) marqués différemment
- Zone de saisie : Ctrl+Entrée pour envoyer
- Badge non-lus quand l'IA a écrit en proactif

### Colonne droite — Décisions IA du jour
- Tout ce que l'IA a **fait** aujourd'hui (les tool_calls qui ont muté ton chantier).
- Reset à minuit Paris (la mémoire long-terme reste dans le Journal de chantier).
- Exemples : "📅 Plombier décalé +5j (cascade)", "💰 Frais 300€ déclaré", "✅ Lot Toiture marqué terminé", "💬 Message WhatsApp envoyé".
- Auto-refresh toutes les 20s.
- Footer "Voir journal complet" → onglet Journal.

### Cohérence avec la sidebar
Chaque badge ⚠ dans la sidebar pointe vers l'onglet où l'action se résout :
- **Documents** ⚠ N → devis à valider (statut "reçu")
- **Budget & Trésorerie** ⚠ N → factures à régler (reçues ou partiellement payées)
- **Assistant chantier** ⚠ N → alertes IA non-lues (= ce qui est dans la colonne gauche de l'onglet)

### Workflow chat — exemples
- *"Bouge la plomberie de 3 jours"* → l'IA détecte les successeurs, demande "cascade ou détaché ?", attend la réponse, exécute, met à jour le planning
- *"J'ai dépensé 200€ chez Leroy Merlin pour l'élec"* → l'IA crée un frais rattaché au lot Électricien (demande le lot si pas clair)
- *"Quand commence le maçon ?"* → l'IA va chercher la donnée fraîche dans la DB et répond
- *"Mets l'électricien à la suite du plaquiste"* → l'IA modifie les dépendances + lane visuelle, le Gantt se met à jour
- *"Le carrelage est fini, voici les photos"* → upload photos, l'IA propose de marquer le lot terminé

---

## 11bis. Les agents IA — qui fait quoi sous le capot

Pour les agents marketing qui doivent comprendre **précisément** ce que fait chaque brique IA, ses inputs, ses outputs et son moment de déclenchement.

> **Pain résolu** : "IA" est un mot fourre-tout. Le particulier ne sait pas si "agent IA chantier" = un chatbot type ChatGPT ou autre chose. Il faut lui expliquer concrètement ce que ça lui apporte vs un assistant générique.
>
> **Avantage marché** : on ne déploie pas UN agent IA, on en a **5 spécialisés**, chacun branché sur un événement précis. Aucun concurrent grand public n'a cette architecture.

### Agent 1 — `analyze-quote` (pipeline d'analyse VMD)
**Quand il tourne** : à chaque upload d'un devis dans VerifierMonDevis OU dans GérerMonChantier.

**Ce qu'il fait, étape par étape** :
1. **OCR** : extraction du texte du PDF/image (Gemini 2.5-flash, ~5s)
2. **Parsing** : structure les lignes en JSON (description, quantité, unité, prix unitaire HT, total HT) en COPIANT mot pour mot le devis (pas de réécriture)
3. **Vérification entreprise** (Phase 2, 100% APIs publiques, pas d'IA) : recherche-entreprises.api.gouv.fr (identité, statut juridique, date création), data.economie.gouv.fr (ratios INPI : CA, résultat net, endettement, autonomie financière), Google Places (note + nb avis), ADEME RGE (qualifications RGE si travaux énergie), OpenIBAN (validation IBAN si fourni), Géorisques (zone risques)
4. **Groupement IA des lignes par job_type** : Gemini 2.0-flash regroupe les 20-50 lignes du devis en 3-7 groupes métier (carrelage, plomberie, électricité, etc.) en matchant contre notre catalogue `market_prices` (~270 entrées validées)
5. **Comparaison prix marché** : pour chaque groupe, calcule le prix théorique attendu (min/avg/max ajusté géographiquement) vs ce que le devis propose. Verdict 🟢 / 🟡 / 🔴.
6. **Scoring final** : agrège vérifications entreprise + cohérence prix + complétude + clauses légales en une note de fiabilité

**Output** : objet `analyses` complet avec score, lignes parsées, vérifications, verdict prix, recommandations actions.

**Modèle utilisé** : Gemini 2.5-flash pour extraction, Gemini 2.0-flash pour groupement (le 2.5 invente des codes catalogue, c'est documenté dans CLAUDE.md "Pièges connus").

---

### Agent 2 — `chantier-generer` (génération initiale du chantier)
**Quand il tourne** : à la fin du flow de création (`/mon-chantier/nouveau`), après que l'utilisateur a répondu aux questions de qualification.

**Ce qu'il fait** :
1. Reçoit la description du projet + les réponses de qualification
2. Génère un JSON complet avec :
   - **Liste des lots** (Maçon / Plombier / Élec / Plaquiste / Carreleur / etc.) avec rôle, durée, dépendances entre lots, ordre planning
   - **Budget par poste** : min/avg/max HT, avec niveau de fiabilité (haute/moyenne/faible)
   - **Formalités** : permis nécessaires, normes applicables, types d'artisans recommandés (avec mention RGE si pertinent)
   - **Checklist** : tâches admin à faire dans l'ordre (déclaration préalable, devis à demander, signature contrat, ouverture compteur, etc.)
   - **Aides éligibles** : MaPrimeRénov estimation, CEE, Éco-PTZ
3. Le résultat est sauvegardé en DB et l'utilisateur arrive sur le cockpit avec tout pré-rempli.

**Modèle utilisé** : Gemini 2.5-flash (raisonnement nécessaire pour structurer un projet complet).

**Source des prix** : catalogue `market_prices` (mutualisé avec VMD) + coefficients géographiques par code postal.

---

### Agent 3 — `chantier-qualifier` (questions intelligentes en création)
**Quand il tourne** : juste après la description libre du projet, avant la génération du chantier.

**Ce qu'il fait** :
- Lit la description du user
- Génère **4-5 questions ciblées et contextuelles** qui maximiseront la précision du budget
- Exemples : si l'utilisateur dit "rénovation cuisine" → questions sur la surface, la gamme matériaux, l'état actuel (à neuf vs rafraîchissement), si la plomberie est à reprendre, si on bouge l'évier
- Injecte automatiquement 3 questions FIXES si elles ne sont pas dans la description : budget cible, date début souhaitée, code postal

**Output** : tableau de 4-8 questions structurées (label + type input + suggestions de réponses).

---

### Agent 4 — `agent-checks` (alertes déterministes, $0 — pas de LLM)
**Quand il tourne** : à chaque upload de document dans un chantier (fire-and-forget, ne bloque pas l'upload).

**Ce qu'il fait** : **pas d'IA, juste 7 checks SQL déterministes** sur l'état du chantier :
1. **Budget overrun** : somme devis validés > budget cible × 1.1 ?
2. **Paiements en retard** : facture statut `recue` avec `due_date < now() - 7j` ?
3. **Lots sans devis** : lot avec aucun document `devis` rattaché depuis création > 14j ?
4. **Facture en litige** : statut `en_litige` non résolu depuis 7j ?
5. **Budget global** : somme engagée + factures > budget cible ?
6. **Devis à relancer** : devis statut `en_cours` depuis > 14j sans réponse ?
7. **Preuve manquante** : facture `payee` sans document `preuve_paiement` rattaché ?

**Output** : INSERT dans `agent_insights` avec sévérité info/warning/critical. Idempotent (dédup unique sur `(chantier_id, title, day)`).

**Coût** : 0€ (pas de LLM). Tourne très souvent.

---

### Agent 5 — `agent-orchestrator` (Pilote de Chantier — **LE** copilote)
**Quand il tourne** :
- À chaque **message WhatsApp** reçu dans un groupe du chantier (mode `morning`)
- À chaque **email entrant** dans une conversation du chantier (mode `morning`)
- À chaque **upload + extraction IA d'un document** (mode `morning`, après `extract-invoice`/`describe`)
- À chaque **affectation de lot** sur un document (mode `morning`)
- Tous les soirs à **19h Paris** (cron, mode `evening`) — digest quotidien
- À chaque **message du user dans le chat assistant** (mode `interactive`)
- À chaque **message du user dans son canal WhatsApp privé** (mode `interactive` avec historique restauré)

**Ce qu'il fait** :
1. Construit un contexte fresh : lots avec dates/budget/contact, messages récents (WhatsApp + email + photos), tâches, alertes, frais déclarés, devis pending, paiements en retard, contacts, groupes WhatsApp, **pending decisions en attente**, **reminders programmés**
2. Envoie le contexte + le user message + le system prompt à Gemini 2.5-flash avec function calling
3. Gemini décide quel(s) tool(s) appeler — boucle jusqu'à 8 rounds OU 30 000 completion tokens
4. Pour chaque tool call : exécute via le dispatcher (`tools/index.ts`), enregistre le résultat
5. Persiste en DB : message assistant + tool_calls dans `chantier_assistant_messages`, run dans `agent_runs`, alertes éventuelles dans `agent_insights`

**Tools dont il dispose** : 17+ tools couvrant lecture (planning, budget, contacts, photos, messages), planning (shift, arrange, durée, dépendances), statuts (lot, devis), tâches (création, complétion), finance (frais, paiement, échéance), communication (WhatsApp, email, canal owner privé), décisions à arbitrer (`notify_owner_for_decision` + `resolve_pending_decision`), rappels (`schedule_reminder`, `cancel_reminder`).

**Différence par mode** :
- `morning` : tools "action irréversibles" bloqués (envoi WhatsApp/email à un tiers, marquage lot terminé). Mais **`notify_owner_for_decision` est dispo en morning** — clé du workflow "décision à arbitrer".
- `evening` : idem morning + génère un digest markdown ajouté au journal de chantier
- `interactive` : tous les tools dispo, dialogue multi-tour avec confirmations explicites

**Modèle** : Gemini 2.5-flash (function calling robuste, contexte 1M).

---

### Agent 6 — `agent-scheduled-tick` (cron rappels programmés)
**Quand il tourne** : automatiquement toutes les 15 minutes (cron pg_cron).

**Ce qu'il fait** :
1. Récupère atomiquement (RPC SQL `claim_pending_reminders` avec `FOR UPDATE SKIP LOCKED`) les rappels programmés dont la date est dépassée
2. Pour chaque rappel :
   - Cherche le canal WhatsApp privé du chantier (`is_owner_channel = true`)
   - Si pas de canal → marque `failed` avec raison claire
   - Sinon → envoie le message WhatsApp `⏰ Rappel : {texte}` au user
   - Met à jour le statut (`fired` / `failed`) + log du résultat
3. Process en parallèle (batches de 8) pour éviter le timeout edge function 60s

**Pas de LLM** : c'est juste un délivreur. Coût : 0€.

---

### Agent 7 — `extract-invoice` / `describe` / `parse-quote` (utilitaires Vision IA)
**Quand ils tournent** :
- `extract-invoice` : à l'upload d'une facture
- `describe` : à l'upload d'une photo / plan / attestation (Gemini Vision auto-décrit le contenu)
- `parse-quote` : variante allégée de `analyze-quote` pour parsing structuré rapide

**Ce qu'ils font** : extraction OCR ciblée, retour structuré (montant facture, description photo, etc.). Permet à l'agent orchestrator de raisonner sur les uploads sans avoir à les voir lui-même.

**Modèles** : Gemini Vision pour `describe`, Gemini 2.5-flash pour `extract-invoice`.

---

### Récap qui tourne quand

| Événement | Agent déclenché | Mode | Coût LLM |
|---|---|---|---|
| Upload devis | `analyze-quote` (full pipeline) | sync | ~$0.005 |
| Upload facture | `extract-invoice` + `agent-checks` + `orchestrator` | async | ~$0.001 |
| Upload photo / plan | `describe` (Vision) + `orchestrator` | async | ~$0.002 |
| Création chantier | `chantier-qualifier` + `chantier-generer` | sync | ~$0.01 |
| Message WhatsApp groupe artisan | `orchestrator` mode morning | async | ~$0.003 |
| Message WhatsApp canal owner privé | `orchestrator` mode interactive | async | ~$0.005 |
| Email entrant | `orchestrator` mode morning | async | ~$0.003 |
| Chat user dans Assistant | `orchestrator` mode interactive | sync | ~$0.005 |
| 19h Paris quotidien | `orchestrator` mode evening (tous chantiers actifs) | cron | ~$0.003/chantier |
| Toutes les 15min | `agent-scheduled-tick` (rappels dus) | cron | $0 |

**Coût estimé moyen** : ~0,10€ par chantier actif par mois en mode normal. Beaucoup moins cher que le concurrent humain (un assistant chantier = 30-80€/h).

---

## 12. Onglet **Travaux DIY**

Suivi des achats matériaux faits par le client (sans rattachement à un lot artisan).

- **2 KPIs** : nombre d'achats enregistrés · économie main d'œuvre estimée
- **Liste factures matériaux** sans lot : nom, date, montant
- Actions par ligne : renommer, modifier le montant, supprimer
- **Logique d'estimation** : compare le coût client (fourniture seule) vs un devis artisan équivalent (fourniture + pose) → différence = économie sur la main d'œuvre
- Bouton "+ Ajouter facture matériaux"

---

## 13. Onglet **Paramètres**

### A. Vos coordonnées
- Prénom, nom, téléphone (utilisés dans les conversations / contrats)
- Sauvegarde automatique

### B. Configuration de l'agent IA
- **Mode** :
  - `edge_function` (par défaut) : l'agent tourne sur nos serveurs, on paye les jetons
  - `openclaw` : intégration externe (instance utilisateur, on paye soi-même les jetons OpenAI)
  - `disabled` : agent inactif
- **Si openclaw** : URL, token, agent ID configurables
- **Toggle ON/OFF** indépendant du mode

---

## 14. Capacités de l'Assistant IA — détail des tools

L'agent IA dispose de **17 outils** (tools) qu'il peut appeler à la suite d'une demande utilisateur ou en réaction à un événement (message WhatsApp, email entrant, upload doc). Cette section liste chaque tool avec un cas d'usage concret, les paramètres qu'il prend, et ce qui se passe en aval.

> **Convention** : les tools "action" demandent confirmation explicite avant exécution irréversible. Les tools "lecture" sont sans risque et peuvent être appelés librement par l'IA pour répondre aux questions.

### A. Planning & dépendances de lots

#### `update_planning(lot_id, duree_jours?, delai_avant_jours?, depends_on_ids?)`
Modifie la structure d'un lot. Combine plusieurs champs dans un seul appel.
- *"Le maçon a annoncé +5 jours"* → l'IA met `duree_jours += 5`
- *"Plaquiste démarre quand Plombier ET Électricien ont fini"* → `depends_on_ids = [plombier_id, elec_id]`
- *"Décale le carreleur d'1 semaine sans toucher aux autres"* → `delai_avant_jours = 5`

Le serveur recalcule **toutes les dates** du planning par tri topologique (CPM).

#### `shift_lot(lot_id, jours, cascade, raison)`
Décalage simple en jours ouvrés. Plus expressif que `update_planning` quand l'IA veut un dialogue cascade/détaché.
- **`cascade=true`** : les successeurs DAG suivent (ex: si Plombier décalé +5j, l'Électricien qui dépend de lui suit)
- **`cascade=false`** : le lot est **détaché** de la chaîne. Les successeurs perdent ce lot comme prédécesseur ET héritent de ses anciens prédécesseurs (ils restent à leur date). Le lot va sur une side lane indépendante.

L'IA suit un protocole 2 tours systématique : si le lot a des successeurs détectés, elle demande "cascade ou détache ?" avant d'appeler.

#### `arrange_lot(lot_id, mode: chain_after|parallel_with, reference_lot_id, raison)`
Réorganise un lot par rapport à un autre.
- **`chain_after`** : *"Mets l'Électricien à la suite du Plaquiste"* → l'Électricien démarre quand le Plaquiste finit, **même ligne visuelle** sur le Gantt
- **`parallel_with`** : *"Fais tourner Maçonnerie et Charpente en parallèle"* → Maçonnerie hérite des prédécesseurs de Charpente, démarre en même temps, **ligne distincte** sur le Gantt

#### `update_lot_dates(lot_id, new_start_date, new_end_date?, raison)`
Force une date de début explicite. *Legacy — préférer `shift_lot` ou `update_planning`.*

#### `update_lot_status(lot_id, statut: a_faire|en_cours|termine, raison)`
Change le statut. *"Le maçon a démarré"* → `statut: en_cours`.

#### `mark_lot_completed(lot_id, evidence_doc_id?, raison)`
Marque un lot comme terminé. Si une photo preuve a été uploadée, on peut la lier via `evidence_doc_id`. **Confirmation explicite obligatoire** avant exécution.

### B. Statuts devis & paiements (vague 1 — nouveau)

#### `update_devis_statut(devis_id, statut, raison)`
Change le statut d'un devis. *"Je valide le devis du plombier"* → `statut: valide`. Statuts : `en_cours | a_relancer | valide | attente_facture`.

L'IA récupère le `devis_id` via `get_chantier_data`. Si plusieurs devis correspondent (2 plombiers ?), elle demande lequel avant d'appeler.

#### `register_payment(artisan_or_lot_hint, amount_paid, date_paid?)`
**Pièce maîtresse de la vague 1.** L'utilisateur déclare un paiement au chat → le serveur cherche la facture qui matche et applique le statut.

*"J'ai viré 1500€ au plombier ce matin"* → l'IA appelle `register_payment("plombier", 1500)`. Le serveur :
- Cherche les factures du chantier en statut `recue` ou `payee_partiellement`, hors frais
- Filtre par hint avec **priorité de match** : contact > lot > nom du document (anti faux-positif)
- Si **1 facture matche** et `montant_paid ≈ restant ±5€` → marque `payee` (cas A)
- Si **1 facture, restant > paid** → `payee_partiellement` avec `montant_paye` cumulé (cas B)
- Si **0 facture** → erreur `no_facture` → l'IA propose de basculer en `register_expense`
- Si **plusieurs candidates** → erreur `ambiguous` → l'IA relais la liste au user
- Si **paiement > restant + 10€** ou +1% → erreur `amount_exceeds` → l'IA demande confirmation

Tool **mono-directionnel** : impossible d'annuler un paiement (correction manuelle UI requise). Race-protection : ne pas appeler 2× en parallèle sur la même facture.

### C. Finance étendue

#### `register_expense(amount, label, lot_id? OR lot_name?, vendor?, depense_type?)`
Déclaration d'une dépense **sans pièce jointe** (ticket de caisse, frais Leroy Merlin, etc.). Différent de `register_payment` qui s'applique à une facture existante.

*"J'ai dépensé 200€ chez Leroy Merlin pour l'électricité"* → l'IA appelle avec `vendor: "Leroy Merlin"`, `lot_name: "Électricien"`. Le tool :
- Cherche le lot par nom (case-insensitive). Si trouvé → utilise. Si pas trouvé → **crée un nouveau lot** avec ce nom.
- Si l'utilisateur ne précise pas de lot → l'IA demande *"Pour quel lot cette dépense ?"* en texte. Si user dit "divers / aucun" → `lot_name: "Divers"` → tool crée/réutilise le lot Divers.
- Type par défaut : `'frais'` (déclaration orale). Apparaît avec icône 📝 ambre dans le budget et lot detail.

#### `add_payment_event(label, amount, due_date)` *(vague 2)*
Ajoute une **échéance future** dans l'Échéancier — sortie planifiée OU entrée attendue.

Cas d'usage :
- *"Le crédit débloque 30k le 15 mai"* → `add_payment_event(label='Déblocage crédit', amount=30000, due_date='2026-05-15')`
- *"Le plombier veut 1500€ d'acompte la semaine prochaine"* → l'IA calcule today+7j puis ajoute
- *"Aide MaPrimeRénov 4500€ attendue en juillet"* → `add_payment_event(label='Aide MaPrimeRénov', amount=4500, due_date='2026-07-15')`

Le **label** sert à indiquer le sens (entrée vs sortie) — préfixes recommandés : *"Acompte X"* / *"Déblocage X"* / *"Aide X"* / *"Solde X"*. Le format date est strict YYYY-MM-DD.

Différent de `register_payment` (paiement déjà effectué) et de `register_expense` (dépense sans facture).

### D. Documents (vague 1)

#### `move_document_to_lot(doc_id, lot_id, raison?)`
Réaffecte un document (devis, facture, photo, plan) à un autre lot. Cas typique : suite à `request_clarification` *"Cette photo est mal affectée à Maçon, c'est pour Carreleur"* → user confirme → l'IA bouge en DB.

`lot_id = ""` (chaîne vide) pour détacher complètement le document.

### E. Contacts (vague 1 — nouveau)

#### `update_contact(contact_id, telephone?, email?, role?, lot_id?, notes?, ...)`
Met à jour un contact existant. *"Jean a changé de numéro, c'est 0612345678"* → l'IA récupère `contact_id` via `get_contacts_chantier` puis appelle.

**Normalisation téléphone automatique** : `0612345678` → `+33612345678` pour matcher le format whapi des messages WhatsApp inbound.

> Pas d'`add_contact` volontaire — les contacts viennent du flux VerifierMonDevis (analyse de devis) ou de l'ajout manuel UI uniquement.

### F. Tâches checklist

#### `create_task(titre, priorite: urgent|important|normal)`
*"Crée une tâche pour relancer le plombier"* → `create_task("Relancer plombier", "important")`.

#### `complete_task(titre)`
*"J'ai relancé le plombier, coche la tâche"* → `complete_task("Relancer plombier")`.

### G. Communication

#### `send_whatsapp_message(to, body)`
Envoie un message dans un **groupe WhatsApp** (`xxx@g.us`) déjà connu — typiquement le canal privé owner. L'envoi à un numéro individuel est impossible (whapi le refuse) : le tool a un garde-fou qui rejette tout `to` non-`@g.us`. **Confirmation explicite obligatoire**.

#### `send_whatsapp_to_contact(contact_id, body, group_jid?, create_dedicated?)` *(2026-05-17)*
LE tool pour « écris un WhatsApp à l'artisan X ». L'IA appelle d'abord `list_artisan_whatsapp_targets` pour voir les groupes existants du contact, puis **demande à l'utilisateur quel canal** :
- un **groupe existant** (ex: « Groupe principal » — tous les artisans voient) → `group_jid`,
- un **groupe dédié à 3** (l'utilisateur + GérerMonChantier + l'artisan) → `create_dedicated: true` (le tool crée le groupe puis envoie dedans).

**Confirmation explicite obligatoire** du texte avant l'envoi.

#### `list_artisan_whatsapp_targets(contact_id)` *(2026-05-17)*
Lecture seule — liste les groupes WhatsApp où un contact est déjà présent, pour que l'IA propose le choix du canal avant `send_whatsapp_to_contact`.

#### `send_email(contact_id, subject, body)` *(vague 2)*
Envoie un email via SendGrid à un contact existant. Beaucoup d'artisans ne sont qu'en email — préféré pour les communications formelles (relance facture, validation devis écrite). **Confirmation explicite obligatoire** comme WhatsApp.

Limitations :
- Le contact doit avoir un email enregistré (sinon erreur claire renvoyée à l'IA, qui propose à l'utilisateur d'ajouter via `update_contact`).
- **Cap 5 emails / contact / 24h** côté tool — anti-spam si bug agent.
- Subject sanitizé (suppression CRLF) côté API pour bloquer les injections de headers SMTP.
- Sender display name = "Prénom Nom via VerifierMonDevis" (récupéré du profil user via auth admin en mode agent). L'adresse `from` reste `chantier-{id}+{convId}@reply.verifiermondevis.fr` pour capter les réponses inbound dans le thread Messagerie.

#### `notify_owner_for_decision(question, expected_action, context?, source_event?, expires_in_hours?)`
Le tool clé du **canal proactif**. L'IA détecte une décision à arbitrer (ex: artisan demande +800€) → appelle ce tool avec :
- La question à poser au user (ex: *"Le plombier annonce +800€ pour pompe de relevage. Tu valides ?"*)
- L'`expected_action` à exécuter si OUI (ex: `{ tool: 'register_expense', args: { amount: 800, label: 'Avenant pompe', lot_name: 'Plombier' } }`)

Le tool crée une ligne `agent_pending_decisions` (mémoire long-terme, non bloquante par la conversation history) + envoie un WhatsApp dans le **canal privé owner**. Quand l'owner répond OUI/NON, l'orchestrator résout via le tool suivant.

#### `resolve_pending_decision(decision_id, answer)`
Boucle la décision pending après réponse owner. Détection automatique du sens :
- `oui / ok / valide / parfait...` → exécute l'`expected_action` stockée
- `non / pas / annule...` → marque résolu sans exécuter
- Pré-check négatif : "ok mais en fait non" → false (priorité au mot de refus)

L'IA voit dans son contexte la liste des PENDING DECISIONS du chantier et appelle ce tool dès qu'une réponse claire arrive dans le chat ou WhatsApp privé.

#### `create_owner_whatsapp_channel()` *(vague 3)*
Crée le **groupe WhatsApp privé "📋 Mon Chantier (canal IA)"** avec uniquement le user dedans (numéro pris du profil). C'est LE canal où l'agent envoie ses notifications proactives (clarifications, alertes critiques, rappels, décisions à arbitrer).

Préconditions :
- Le user doit avoir renseigné son téléphone dans Paramètres.
- Un seul canal owner par chantier (contrainte unique partial index).

Quand l'utilisateur écrit dans ce canal, le webhook whapi route le message à l'orchestrator en mode `interactive` avec l'historique restauré → l'agent peut répondre, résoudre les pending decisions, lancer des actions (avec protocole 2-tours pour les irréversibles).

### H. Actions programmées *(vague 3)*

#### `schedule_reminder(due_at_local, reminder_text, tz?, lot_id?)`
Programme un rappel à envoyer dans le canal WhatsApp privé du user à la date prévue.

- *"Rappelle-moi dans 3 jours de relancer le plombier"* → `due_at_local='2026-04-29T09:00', tz='Europe/Paris', reminder_text='Relancer le plombier pour le devis'`
- *"Préviens-moi 2 jours avant la livraison du carrelage"* → l'IA calcule la date+09h
- *"Rappel pour le RDV architecte vendredi 14h"* → `due_at_local='2026-05-02T13:45', reminder_text='RDV architecte dans 15 minutes'`

Format **heure locale** (l'agent ne calcule pas l'UTC — c'est le serveur qui convertit en gérant DST hiver/été via `Intl.DateTimeFormat`). Évite les erreurs récurrentes où l'IA décale de 1h le rappel au changement d'heure.

Cap **30 rappels pending par chantier** — défense contre boucle agent. Refus si `due_at < now - 5min` (anti-immédiat).

Cron `agent-scheduled-tick` toutes les 15min : SELECT FOR UPDATE SKIP LOCKED → marque `firing` atomiquement → envoi WhatsApp parallélisé par batches de 8 → status `fired` ou `failed`. Si pas de canal owner configuré → status `failed` avec raison claire dans `fired_result`.

#### `cancel_reminder(reminder_id)`
Annule un rappel pending (avant qu'il parte). L'IA voit la liste dans son contexte (section SCHEDULED REMINDERS, limit 10 plus proches) et peut annuler à la demande *"oublie le rappel pour le plombier"*.

### I. Mémoire & journal

#### `log_insight(type, severity, title, body, needs_confirmation?, actions_summary?)`
Journalise une analyse pour le journal de chantier et le fil d'activité. Types : `planning_impact | budget_alert | conversation_summary | risk_detected | lot_status_change | needs_clarification`. **L'IA appelle TOUJOURS `log_insight` en dernier** dans une chaîne d'actions pour assurer la traçabilité.

#### `request_clarification(phone, message_summary, message_id?, suggested_lot?)`
Spécifique au flux WhatsApp : un numéro inconnu envoie un message → l'IA crée un insight `needs_clarification` + une tâche urgente *"Identifier le contact 33XXX"* visible dans le panneau Activité IA. **Ne modifie pas le planning** tant que le user n'a pas dit qui c'est.

### J. Lecture seule (pour répondre aux questions)

Tous batch-safe (peuvent être appelés librement, aucun effet de bord) :

| Tool | Usage typique |
|---|---|
| `get_chantier_summary` | *"Où en est mon chantier ?"* — phase, budget, lots avec dates et statuts |
| `get_chantier_planning` | *"Donne-moi le planning"* — ordre, dates, durées, dépendances complètes |
| `get_chantier_data(query_type)` | Requêtes ad-hoc : `count_devis`, `sum_travaux_en_cours`, `sum_travaux_totaux`, `list_documents`, `list_intervenants` |
| `get_contacts_chantier(lot_id?, role?)` | *"Qui sont les artisans du lot Plomberie ?"* — filtre par lot ou rôle |
| `get_recent_photos(days?)` | *"Montre-moi les photos récentes"* — photos WhatsApp 7 derniers jours avec descriptions Vision IA |
| `list_chantier_groups` | *"Qui est dans le groupe WhatsApp ?"* — groupes du chantier + membres actifs |
| `get_message_read_status(phone)` | *"Le plombier a-t-il vu mon message ?"* — statuts des 3 derniers messages envoyés à un contact |

### K. Modes d'invocation

L'agent tourne dans 3 contextes :
- **`interactive`** : chat user dans l'onglet Assistant **OU canal WhatsApp privé owner** (vague 3 — quand le user écrit dans le groupe "Mon Chantier", le webhook route en interactive avec historique 20 derniers msgs restauré). Tous les tools dispo, dialogues 2-tours pour confirmations.
- **`morning`** : déclenché par les triggers temps réel (upload doc, message WhatsApp dans groupe artisan, email entrant). Tools "action" bloqués — uniquement lecture + journalisation. Évite que l'agent prenne une décision irréversible sans validation user.
- **`evening`** : cron quotidien 19h Paris. Génère le digest journal + envoie WhatsApp si activité significative. Tools "action" bloqués aussi.

Les tools "action" (irréversibles ou irréversibles côté tiers) sont restreints au mode interactive : `mark_lot_completed`, `update_lot_dates`, `send_whatsapp_message`, `send_email`, `arrange_lot`, `shift_lot`, `register_expense`, `register_payment`, `add_payment_event`, `notify_owner_for_decision`, `resolve_pending_decision`, `move_document_to_lot`, `update_contact`, `create_owner_whatsapp_channel`, `schedule_reminder`, `cancel_reminder`.

### L. Cron arrière-plan

| Cron | Fréquence | Job |
|---|---|---|
| `agent-orchestrator-evening-digest` | 17h UTC = 19h Paris | Digest journal quotidien (cf. § 15) |
| `agent-scheduled-tick` *(vague 3)* | toutes les 15min | Fire les rappels `schedule_reminder` dus dans le canal WhatsApp privé owner |
| `purge-expired-company-cache` | 03h UTC quotidien | Cleanup cache vérification entreprises (>30j) |
| `publish-scheduled-blog-posts` | toutes les 15min | Publication articles blog programmés |

---

## 15. Surveillance automatique (digest quotidien) + Journal de chantier

Une fois par jour à 19h Paris, l'IA agent-orchestrator passe sur tous les chantiers actifs et :

- **Analyse les événements** des dernières 24h (messages WhatsApp, uploads, paiements, modifications planning)
- **Génère un récit narratif** (digest markdown) dans le Journal de chantier
- **Envoie un message proactif** dans le chat assistant si quelque chose d'important s'est passé

L'IA fait aussi des contrôles déterministes (pas de jetons IA consommés) à chaque upload de document : budget overrun, paiement en retard, lot sans devis, facture en litige, devis à relancer, preuve manquante. Ces alertes apparaissent dans le panneau Alertes IA de l'Assistant et dans le Journal du jour.

### Le Journal de chantier — récit + timeline *(refonte 2026-05-17)*

L'onglet Journal présente chaque journée en **2 blocs** :

1. **Récit du jour** — le digest narratif rédigé par l'IA à 19h.
2. **Timeline horodatée** — tous les événements de la journée, triés par heure : dépôts de documents, changements de statut (facture passée en payé, devis validé, lot terminé…), décisions prises par l'IA (planning décalé, tâche créée, message envoyé…), alertes émises. Les messages WhatsApp individuels n'y figurent **pas**.

**Export PDF + Excel** : chaque journée — ou une plage de dates au choix (bouton « Période… ») — s'exporte en PDF (rapport mis en page) ou en tableur CSV (lignes date/heure/catégorie/détail). La timeline des changements de statut est précise depuis le 17/05/2026 (date de mise en place du traçage) ; avant cette date, seuls les dépôts de documents, alertes et décisions IA sont reconstitués.

---

## 17. Homepage VerifierMonDevis — refonte positionnement (2026-04-30)

La page d'accueil VMD a été rebalancée pour couvrir les 3 dimensions du produit (prix, entreprise, risques) et améliorer la conversion.

### Changements

- **H1** : "Votre devis est-il trop cher… ou risqué ?"
- **Sous-titre** : analyse en 3 dimensions (prix poste par poste, vérification entreprise, anomalies)
- **Micro-copy** : "Analyse immédiate · Compte gratuit pour le détail complet"
- **Bullets** : 💶 Surcoût en euros / 🏢 Entreprise vérifiée / ⚠️ Risques détectés
- **HowItWorksSection** : Step 2 "Analyse en 3 dimensions" + tags [Prix marché][Entreprise][Conformité], Step 3 verdict + tags [Signer][Négocier][Refuser]
- **WhatYouGetSection** (nouveau) : 5 livrables avec cartes uniformes — Verdict global, Surcoût estimé, Arguments négociation, Fiabilité entreprise, Risques détectés
- **Positionnement** : "Pas un comparateur de prix — un outil pour décider en toute connaissance de cause."

---

## 19. Moteur de verdict déterministe — verdictEngine (2026-05-01)

Remplace la logique de verdict dispersée dans 3 fichiers par une source de vérité unique.

### Ce que l'utilisateur voit

- **Zéro contradiction** entre le badge Feu en haut de page et le verdict de l'expert ci-dessous
- Le badge se met à jour dès que l'analyse prix est disponible, sans attendre l'IA
- La règle "À négocier" s'affiche dès que le prix dépasse 5% du marché, même si l'IA n'a pas encore généré son verdict

### Logique

| Priorité | Condition | Verdict |
|---|---|---|
| 1 (absolu) | Entreprise radiée / SIRET invalide / absence assurance / paiement cash / IBAN suspect | Refuser |
| 2 | Surcoût ≤ 5% ET 0 anomalie majeure | Signer |
| 2 | Surcoût ≤ 15% ET ≤ 1 anomalie majeure | À négocier |
| 2 | Au-delà | Refuser |
| 3 | Mentions légales manquantes / acompte excessif / risque entreprise élevé | Au moins À négocier |

Résultat final = gravité maximale des critères prix + risque.

---

## 18. Feedback post-analyse — FeedbackModal (refonte V3.4.14, 2026-05-16)

Popup de feedback contextuel qui s'ouvre après que l'utilisateur a tiré une vraie valeur de l'analyse.

### Flow (refonte)

1. **Step 1 — Feedback** : question "Cette analyse vous a-t-elle aidé ?" + 3 boutons (👍/😐/❌) + textarea optionnelle (max 200 chars). Bouton Continuer disable + spinner pendant la persistance.
2. **Step 2 — Reward (UNIQUEMENT si choix 👍 positif)** : offre d'activation GérerMonChantier gratuit ("✨ Débloquer mon accès offert"). Wording centré sur "continuer son projet" plutôt que "+200 propriétaires". Sur 😐 ou ❌ → step 2 est sauté.
3. **Step 3 — Done** : wording adapté au choix :
   - 👍 reward activé : "🎁 Accès débloqué — accès GMC actif"
   - 👍 reward skip : "Merci 🙏 + bouton Trustpilot"
   - 😐 : "Merci pour votre retour, on note vos remarques"
   - ❌ : "Désolé que ça n'ait pas répondu à vos attentes — écrivez-nous à hello@verifiermondevis.fr"

### Trigger (refonte)

**UNIQUEMENT manuel** via `openFeedback()` appelé par `onCopy` du composant `ConclusionIA` (clic "Copier le message pour négocier") = vrai moment de valeur. Le déclenchement auto au scroll 60% / timer 5s a été supprimé : il interrompait la lecture et le taux de réponse était ~0%.

**Anti-spam** : `localStorage` avec TTL 7 jours (inchangé).

### Persistance (nouveau V3.4.14)

Table dédiée `analysis_feedback` (PK `id`, FK `analysis_id` CASCADE + `user_id` CASCADE, UNIQUE `(user_id, analysis_id)`, choice CHECK, text TEXT, `verdict_at_submission` snapshot, created_at, updated_at).

- `POST /api/feedback` — Bearer JWT obligatoire, upsert idempotent via ON CONFLICT. Le user_id vient toujours du JWT validé, jamais du body.
- RLS user-own : un utilisateur peut INSERT/SELECT/UPDATE son propre feedback. Pas de DELETE policy.

### Admin (nouveau V3.4.14)

Section "Feedback utilisateurs" dans `/admin` (rendue par `FeedbackSection.tsx`) avec :
- Compteurs total / 👍 positive / 😐 neutral / ❌ negative
- Tableau filtré par choice (pills cliquables)
- Pour chaque ligne : date, choix avec emoji, snapshot verdict (VERT/ORANGE/ROUGE), email user (mailto), lien vers l'analyse, commentaire texte
- Source : `GET /api/admin/feedback` (rôle admin requis via `user_roles`), enrichit `auth.admin.listUsers` + `analyses.file_name`

Permet de cohorter "feedbacks négatifs sur des verdicts ROUGE" → wording trop alarmant ? Et de relancer ciblé un user mécontent par email.

### Tracking Amplitude (inchangé en parallèle de la DB)

`feedback_open` · `feedback_choice` · `feedback_text` · `reward_activated` · `reward_skipped` · `trustpilot_click`

### Architecture

- `useFeedback({ analysisId, verdict })` hook — accepte les opts pour la persistance DB, expose `{ openFeedback, FeedbackModal }`
- `POST /api/feedback` — persiste, fallback silencieux si fail (Amplitude a déjà la donnée, l'UI continue son flow)
- `POST /api/activate-chantier` — userId déduit du JWT Bearer, écrit `user_metadata.gerer_mon_chantier_access: true`
- Intégré dans `AnalysisResult.tsx` + prop `onCopy` dans `ConclusionIA`

---

## 18bis. Détection devis étranger — bannière 🌍 (V3.4.14, 2026-05-16)

Quand l'utilisateur upload un devis émis par une entreprise hors-France (Belgique, Luxembourg, Suisse, Allemagne, etc.), l'outil détecte automatiquement la nationalité du devis et bypass complètement le scoring catalogue marché — qui est calibré sur la réglementation et les tarifs français.

### Comment c'est détecté

Helper `detectQuoteCountry(extracted)` dans `supabase/functions/analyze-quote/country.ts` agrège 4 signaux :
1. **Préfixe IBAN** (BE86, FR76, LU28, CH56, DE89…) → signal FORT, gagne seul
2. **Préfixe TVA intracom** (BE1000162842, LU12345678…) → signal FORT, gagne seul
3. **Mots-clés adresse** : "Belgique", "Luxembourg", "Schweiz", "Deutschland", "España"… → signal modéré, gagne sans contradiction
4. **Taux TVA non-FR** (6% / 21% / 17% / 19% / 22% selon pays) → signal faible, confirme uniquement un autre signal

Le verdict pays va dans `extracted_data.country_code` ("FR" / "BE" / "LU" / "CH" / "DE" / "ES" / "IT" / "GB" / "NL" / "OTHER") et `is_foreign_quote` (boolean).

### Ce que voit l'utilisateur

Bannière ambre 🌍 dédiée AVANT le verdict :
> **Devis Belgique détecté**
> L'outil VerifierMonDevis est calibré sur la réglementation et les tarifs français. La comparaison automatique au marché, les vérifications SIRET/RGE/RNE et l'analyse financière ne s'appliquent pas à ce devis.
> ✓ Ce qui reste fiable : sécurité paiement (IBAN, acompte, modes), anomalies de structure, modalités contractuelles. Pour valider le prix, demandez 1-2 devis concurrents locaux en Belgique.

Le hero "+X €" alarmiste est entièrement masqué (`showAccusatoryHero` ANDé avec `!isForeignQuote`). Le verdict décisionnel passe en "À négocier" avec 3 actions adaptées : registre commerce local (BCE Belgique / RCS Luxembourg / ZEFIX Suisse / Handelsregister Allemagne), 1-2 devis concurrents locaux, vérification IBAN/BIC pour virement international.

### Architecture

- `extract.ts` post-extraction : appelle `detectQuoteCountry` après le parsing Gemini, ajoute les champs au `ExtractedData` retourné
- `conclusion.ts` sortie anticipée : si `is_foreign_quote=true` → ConclusionData synthétique sans appel Gemini ni matching catalogue (gain ~2-4s + 0 token Gemini)
- `ConclusionIA.tsx` : nouvelle prop `conclusion.foreign_quote` → rend la bannière ambre + masque les chiffres de comparaison
- Le prompt d'extraction IBAN a été renforcé pour scanner TOUTES les pages (l'IBAN d'un devis multi-pages est presque toujours sur la dernière page avec les modalités de paiement, ratés systématiques avant V3.4.14)

---

## 20. Verdict pondéré V3 — anomalies par poids dans le devis (2026-05-06)

Évite les faux verdicts "Refuser" causés par un seul poste aberrant isolé sur un devis globalement correct.

### Problème résolu

Avant : un poste à 80% de surcoût représentant 3% du total faisait basculer l'analyse en rouge. L'utilisateur voyait "Refuser" alors que 97% du devis était correct.

### Nouvelle logique

Chaque poste est analysé individuellement :
- **Surcoût poste** = prix devis vs médiane marché
- **Poids poste** = montant HT du poste / total devis HT
- **Impact global** = somme des poids des postes surdévalués (> 30% au-dessus du marché)

| Impact (poids des postes surdévalués) | Verdict |
|---|---|
| < 20% du total | Signer — anomalies isolées, impact limité |
| 20–50% du total | À négocier — part significative mais pas majoritaire |
| ≥ 50% du total | Refuser — plus de la moitié du devis est surévaluée |

### Ce que l'utilisateur voit

- La ConclusionIA mentionne "X postes présentent des prix élevés — impact limité (X% du total)" pour les cas faibles
- Le message de négociation précise le montant en euros ET le poids dans le devis, pas juste un pourcentage de surcoût global
- Un devis avec 1 poste cher isolé ne génère plus de faux "Refuser"

---

## 21. Alerte admin + maintenance automatique des analyses en erreur (2026-05-06)

Surveillance automatique des analyses qui échouent (visibles en admin par un "-" à la place du score).

### Alerte immédiate

Dès qu'une analyse échoue (peu importe la raison), un email est envoyé à `julien@messagingme.fr` et `bridey.johan@gmail.com` avec :
- ID de l'analyse + nom du fichier + user concerné
- Message d'erreur exact
- Lien direct vers le dashboard admin

### Maintenance automatique (cron 15 min)

Toutes les 15 minutes, un job automatique :
1. **Détecte** les analyses en `error`/`failed` dans les 4 dernières heures
2. **Retente** automatiquement jusqu'à 2 fois les analyses éligibles (en les re-soumettant au pipeline complet)
3. **Escalade** par email les analyses qui échouent encore après 2 tentatives (marquées "⛔ Intervention requise")

### Email admin récapitulatif

- Section bleue 🔄 : analyses relancées automatiquement (tentative N/2)
- Section rouge ⛔ : échecs persistants nécessitant une intervention manuelle
- Email non envoyé si aucune action requise (run silencieux)

### Architecture

- Edge function `analysis-maintenance` (Supabase, cron `*/15 * * * *`)
- `alertAdminOnFailure()` dans `analyze-quote` (fire-and-forget, Resend API)
- Retry tracking via tag `[auto-retry-N]` dans `error_message` — pas de migration DB
- Auth cron : `X-Cron-Secret` (même pattern que l'agent chantier)

---

## 22. Cohérence financière — logique globale (2026-05-07, mis à jour 2026-05-07)

### Modèle mental : 5 chiffres qui racontent l'histoire du chantier

```
Budget cible (50k€)   ← ce que tu pensais dépenser, défini par toi
Engagé (67k€)         ← ce à quoi tu t'es engagé (devis signés)
─────────────────────────────────────────────────────
Décaissé (24,6k€)     ← ce qui est sorti de ton compte
À payer (30,1k€)      ← ce qui va sortir de façon certaine
= Flux certains (54,7k€) ← tu sais que tu vas dépenser ça, quoi qu'il arrive
```

### Source unique de vérité pour `budgetReel`

`budgetReel` est **un seul chiffre** synchronisé sur tous les onglets via 3 couches :
1. `localStorage budget_reel_${chantierId}` — lecture prioritaire au démarrage
2. `window.budgetReelChanged` custom event — propagation temps réel entre composants
3. DB : `chantiers.budget` (enveloppePrevue) + `chantiers.metadonnees.tresoreieFinancing.budgetReel`

Écriture toujours via `persistBudgetReel` (BudgetTab) ou `setCfg+syncServer` (TresorerieView) qui alimentent **les deux** destinations DB + les deux localStorage + l'event.

### Règle de cohérence

| Comparaison | Si vrai → alerte |
|---|---|
| Engagé > Budget cible | Dépassement d'engagement (onglet Budget) |
| Déblocages crédit enregistrés > crédit prévu dans le plan | Plan de financement obsolète (onglet Trésorerie) |
| Flux certains > Budget cible | Badge ambre inline sur "Budget de référence" + bouton "Actualiser à X€ ?" |
| Flux certains > Financement disponible | Risque de découvert (onglet Trésorerie) |

### Auto-update après 1ère confirmation

- Flag `autoUpdateBudget: boolean` dans `FinancingConfig` (localStorage + DB)
- Première fois → l'utilisateur clique "Actualiser" ou "Ajuster à X€" → flag = `true`
- Fois suivantes → si flux certains > budget : **mise à jour silencieuse automatique** sans popup
- S'active depuis TresorerieView ET BudgetTab

### Où chaque chiffre vit

| Chiffre | Source de données | Onglet de détail |
|---|---|---|
| Budget cible | `chantiers.budget` + `metadonnees.tresoreieFinancing.budgetReel` (même valeur) | Budget + Trésorerie |
| Engagé | Somme des devis validés + factures sans devis | Budget |
| Décaissé | `budget API totaux.paye + totaux.acompte` | Trésorerie |
| À payer | `budget API totaux.a_payer` | Trésorerie |
| Flux certains | Décaissé + À payer | Trésorerie |
| Plan de financement | `chantiers.metadonnees.tresoreieFinancing` (crédit, aides) | Trésorerie |
| Entrées réelles | `chantier_entrees` (déblocages crédit, apports, aides reçus) | Trésorerie → Entrées |

### Card "Budget chantier" sur la homepage

Résumé en 3 secondes, structuré en 2 sections :

**Section "Engagements" (→ onglet Budget)**
- Budget cible + donut d'engagement
- Engagé : total devis signés, badge rouge si dépassement

**Section "Trésorerie réelle" (→ onglet Trésorerie)**
- Décaissé : acomptes + factures réglées (valeur réelle, API budget)
- À payer (certain) : sorties inévitables
- Flux certains = Décaissé + À payer — fond rouge si > budget cible

### Entrées de fonds (`chantier_entrees`)

- Libellé facultatif : fallback automatique sur le nom du type si laissé vide
- Édition inline : clic sur une entrée → formulaire inline (type, libellé, montant, date, statut)
- PATCH API accepte `label`, `montant`, `date_entree`, `source_type`, `statut`

### Échéancier — panel détail par échéance

Clic sur une ligne d'échéance → `PaymentDetailPanel` inline :
- **3 cartes contexte** : Total facture / Déjà payé / Cette échéance
- **Autres échéances** du même document (barré si payées)
- **Édition** : libellé, montant (avec % du total), date prévue
- **Split automatique** : si montant réduit → badge "Solde restant X€" + date obligatoire → PATCH terme courant + POST nouveau terme `addToDocument`
- Bouton "Payé" → ouvre le wizard de paiement guidé existant

### Alertes et mises à jour

1. **À l'ajout d'une entrée** : si déblocages crédit > crédit prévu → confirmation "Mettre à jour le plan ?"
2. **Onglet Trésorerie — badge inline** : si flux certains > budget de référence → badge ambre + "Actualiser à X€ ?" sur la ligne budget (sans bannière séparée)
3. **Onglet Trésorerie — bannière** : si entrées crédit réelles > crédit configuré
4. **Homepage** : alerte rouge si flux certains > budget cible

### Types d'entrées et catégories

| `source_type` | Catégorie | Plan de financement |
|---|---|---|
| `deblocage_credit`, `eco_ptz` | Crédit | Colonne Crédit travaux |
| `apport_personnel`, `remboursement`, `autre` | Apport | Colonne Apport (déduit) |
| `aide_maprime`, `aide_cee` | Aides | Colonne Aides & subventions |

---

## 16. Récapitulatif navigation

| Groupe sidebar | Onglets | Réponse à la question |
|---|---|---|
| **Projet** | Accueil · Budget & Trésorerie · Planning | Où en est mon chantier ? Combien j'ai dépensé ? Quel est le calendrier ? |
| **Devis & Finances** | Intervenants & Devis · Documents | Ai-je tous les devis ? Où sont mes documents ? |
| **Équipe** | Contacts · Messagerie | Qui sont mes artisans ? Comment je leur parle ? |
| **Suivi IA** | Journal de chantier · Assistant chantier | Que s'est-il passé ? L'IA peut-elle m'aider ? |
| **Paramètres** | Vos coordonnées · Config agent IA | — |
