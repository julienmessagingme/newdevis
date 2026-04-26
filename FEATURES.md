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

## 1. Création d'un chantier

Accès : **/mon-chantier/nouveau**

- **Description libre du projet** : on tape "rénovation maison 120m² avec piscine et terrasse" → l'IA détecte automatiquement les éléments (piscine, terrasse, extension, cuisine, SDB, etc.)
- **Mode de création** : guidé (formulaire pas à pas) ou libre (texte naturel)
- **Questions de qualification IA** : pour chaque élément détecté, l'IA pose les questions clés (surface, matériau, état actuel, ambition de rénovation)
- **Génération progressive** affichée en 5 étapes :
  1. Analyse du projet — identification des travaux
  2. Structure & planning — création de la roadmap avec lots chaînés / parallèles selon dépendances métier
  3. Budget estimatif par poste — fourchettes min/avg/max avec niveau de fiabilité (haute / moyenne / faible)
  4. Formalités & artisans — normes applicables, permis, types d'artisans recommandés
  5. Checklist & aides — démarches administratives, aides financières éligibles
- **Résultat** : chantier complet avec lots, planning CPM, budget prévisionnel, checklist, prêt à l'emploi.

---

## 1bis. Comment l'IA détermine le budget à la création

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
- **Actions par chantier** : ouvrir, modifier, supprimer (avec confirmation)
- Bouton **"+ Nouveau chantier"** pour créer un projet

---

## 3. Onglet **Accueil** (vue d'ensemble lots)

Vue d'entrée du chantier. Tout le projet est lisible en un écran.

### Bandeau projet
- Emoji + nom du chantier, phase en cours
- Budget min–max estimé (popover détail par poste avec niveau de fiabilité)

### 4 KPIs principaux
- **Budget fourchette** estimée (HT)
- **Devis validés** (somme des devis signés)
- **Total facturé** (somme des factures reçues)
- **Total payé** (somme effectivement décaissée)

### Cartes par lot (grille)
Pour chaque lot du chantier :
- Emoji + nom du lot, statut (à faire / en cours / terminé)
- Budget fourchette estimée
- Compteurs : devis reçus (avec score IA si analysés), photos, autres documents
- **Badge ambre "📝 X€ frais"** si des frais ont été déclarés
- Jauge d'avancement avec message contextuel ("Demander des devis" / "Obtenez un 2e devis pour comparer" / "Artisan sélectionné" / "Travaux en cours" / "Terminé")
- Boutons : Voir détails · Comparer (si 2+ devis) · Ajouter un document · Supprimer

### Vue détail lot (clic sur la carte)
- En-tête : emoji, nom, fourchette budget
- **Section Planning éditable** : durée en jours (édition inline), date début/fin (calculées), statut modifiable
- **Tableau Devis & Factures** : artisan, type, score fiabilité, montant, statut (en cours / valide / attente facture)
- **Section "Frais annexes déclarés"** (ambre) : liste des frais déclarés au chat, date + montant + total
- **Photos du lot** : grille miniature, zoom au clic, suppression individuelle
- **Autres documents** : plans, autorisations, etc.

### Widget Planning compact
Chronologie horizontale, 1 barre par lot, durée totale du chantier visible. Clic → onglet Planning.

---

## 4. Onglet **Budget & Trésorerie**

Quatre vues complémentaires (sous-onglets internes).

### A. Vue Budget — tableau par lot/artisan
- KPIs en haut : budget estimé · devis validés · total facturé · total payé
- **Tableau** : 1 ligne par artisan groupé par lot. Colonnes : artisan, devis (montant + statut + lien doc), factures, statut, reste à payer, progression paiement, actions
- **Accordéon dépliable** : détail devis/factures avec dropdown pour changer le statut
- Statuts devis cliquables : en cours · valide · attente facture · litige
- Statuts facture cliquables : reçue · payée partiellement · payée · en litige
- **Recherche + filtres** : par artisan, statut, lot
- **Indicateurs d'alerte** :
  - "Devis manquant" (ambre) si une facture existe sans devis associé
  - "📝 X€ frais" si des frais déclarés au chat sont rattachés
- Bouton "+ Ajouter un document" : upload manuel d'un devis/facture/ticket

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

Gantt interactif basé sur la méthode CPM (Critical Path Method).

### Vue Gantt
- **Colonne gauche sticky** : noms des lots
- **Barres colorées par lot** sur axe horizontal (semaines en haut), 1 couleur stable par lot
- **Drag-and-drop horizontal** : déplacer une barre change la date de début. Si le lot a des successeurs (lots qui dépendent de lui), l'IA peut demander cascade ou détaché.
- **Drag-and-drop vertical** : changer la "lane" (ligne) du lot pour le parallel-iser avec un autre ou le détacher de la chaîne
- **Resize bordures** : tirer le bord droit de la barre pour modifier la durée
- **Ghost row** : ligne vide en bas pour drop = créer une lane indépendante (lot sort de la chaîne)
- **Recalcul CPM automatique** : après chaque modification, toutes les dates dépendantes se mettent à jour
- **Dépendances multi-parent** : un lot peut attendre la fin de plusieurs prédécesseurs (ex : "Plaquiste démarre quand Plombier ET Électricien ont fini")

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

Centre de discussion avec l'IA + traçabilité de ses actions. Layout 2 colonnes (desktop) ou empilé (mobile).

### Colonne gauche — Chat IA
- Historique des messages user/assistant
- Messages "agent_initiated" (initiative IA) marqués différemment
- Zone de saisie : Ctrl+Entrée pour envoyer
- Badge non-lus quand l'IA a écrit en proactif

### Colonne droite — Fil d'activité IA
- **Reset à minuit Paris** : ne montre que les événements du jour (la mémoire long-terme reste dans le Journal)
- **3 types d'items mélangés**, triés chrono décroissant :
  1. **Décisions** (tool_calls de l'IA) : "📅 Plombier décalé +5j (cascade)", "💰 Frais 300€ déclaré", "✅ Lot Toiture marqué terminé"
  2. **Alertes** : budget dépassé, retard paiement, risque détecté
  3. **Clarifications** : "Je pense que cette photo est mal affectée au lot Maçon, confirme ?"
- Icônes colorées par catégorie (planning bleu, frais ambre, statut vert, alertes rouge/ambre, clarifications orange)
- Heure exacte affichée pour chaque item
- Auto-refresh toutes les 20s
- Footer "Voir journal complet" → onglet Journal

### Workflow chat — exemples
- *"Bouge la plomberie de 3 jours"* → l'IA détecte les successeurs, demande "cascade ou détaché ?", attend la réponse, exécute, met à jour le planning
- *"J'ai dépensé 200€ chez Leroy Merlin pour l'élec"* → l'IA crée un frais rattaché au lot Électricien (demande le lot si pas clair)
- *"Quand commence le maçon ?"* → l'IA va chercher la donnée fraîche dans la DB et répond
- *"Mets l'électricien à la suite du plaquiste"* → l'IA modifie les dépendances + lane visuelle, le Gantt se met à jour
- *"Le carrelage est fini, voici les photos"* → upload photos, l'IA propose de marquer le lot terminé

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
Envoie un message WhatsApp à un groupe (`xxx@g.us`) ou à un contact individuel (`33XXXXXXXXX@s.whatsapp.net`). **Confirmation explicite obligatoire** : l'IA propose le texte exact, attend "ok / envoie / confirme" avant d'envoyer.

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

## 15. Surveillance automatique (digest quotidien)

Une fois par jour à 19h Paris, l'IA agent-orchestrator passe sur tous les chantiers actifs et :

- **Analyse les événements** des dernières 24h (messages WhatsApp, uploads, paiements, modifications planning)
- **Génère un digest markdown** dans le Journal de chantier
- **Annexe automatiquement** au digest 3 sections déterministes :
  - ⚙️ Décisions prises aujourd'hui
  - ⚠️ Alertes du jour
  - ❓ Clarifications demandées
- **Envoie un message proactif** dans le chat assistant si quelque chose d'important s'est passé
- **Pousse une alerte WhatsApp** dans le groupe principal si critique

L'IA fait aussi des contrôles déterministes (pas de jetons IA consommés) à chaque upload de document : budget overrun, paiement en retard, lot sans devis, facture en litige, devis à relancer, preuve manquante. Ces alertes apparaissent dans le fil d'activité de l'Assistant et dans le Journal du jour.

---

## 16. Récapitulatif navigation

| Groupe sidebar | Onglets | Réponse à la question |
|---|---|---|
| **Projet** | Accueil · Budget & Trésorerie · Planning | Où en est mon chantier ? Combien j'ai dépensé ? Quel est le calendrier ? |
| **Devis & Finances** | Intervenants & Devis · Documents | Ai-je tous les devis ? Où sont mes documents ? |
| **Équipe** | Contacts · Messagerie | Qui sont mes artisans ? Comment je leur parle ? |
| **Suivi IA** | Journal de chantier · Assistant chantier | Que s'est-il passé ? L'IA peut-elle m'aider ? |
| **Paramètres** | Vos coordonnées · Config agent IA | — |
