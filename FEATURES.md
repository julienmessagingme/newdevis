# GérerMonChantier — Liste des features

Documentation fonctionnelle (point de vue utilisateur) du module chantier de VerifierMonDevis. Décrit ce qu'on peut faire, pas comment c'est fait techniquement.

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

## 14. Capacités de l'Assistant IA (côté actions)

Tout ce que l'utilisateur peut déclencher en parlant à l'IA dans le chat. L'IA exécute les actions directement quand elles sont sans risque, ou demande confirmation pour les actions irréversibles.

### Planning & lots
- **Décaler un lot** de N jours (avec ou sans cascade sur les successeurs)
- **Modifier la durée** d'un lot
- **Chaîner deux lots** (l'un démarre quand l'autre finit)
- **Paralléliser deux lots** (ils démarrent en même temps)
- **Modifier les dépendances** d'un lot (qui doit finir avant lui)
- **Marquer un lot comme terminé** (avec photo preuve optionnelle)
- **Changer le statut** d'un lot (à faire / en cours / terminé)

### Tâches
- **Créer une tâche** dans la checklist (urgent / important / normal)
- **Cocher une tâche** existante

### Finances
- **Déclarer un frais** sans uploader de pièce ("j'ai dépensé 200€ chez Leroy Merlin pour l'élec"). L'IA demande le lot si non précisé. Crée un lot "Divers" si l'utilisateur n'a pas de lot particulier.

### Communication
- **Envoyer un message WhatsApp** dans un groupe ou à un contact (toujours avec confirmation explicite avant envoi)
- **Vérifier les accusés de lecture** d'un message envoyé

### Mémoire
- **Logger un insight** dans le journal (l'IA le fait automatiquement après chaque action)
- **Demander une clarification** si elle a un doute (ex : "cette photo est-elle bien pour le lot Maçon ?")

### Lecture seule (pour répondre aux questions)
- Résumé du chantier, dates, budget global
- Planning : ordre des lots, dates, durées, dépendances
- Contacts du chantier (filtrés par lot ou rôle)
- Photos récentes avec descriptions IA
- Groupes WhatsApp et leurs membres
- Statuts de lecture des messages WhatsApp

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
