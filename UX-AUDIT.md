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
- **Statut :** 🟠 À corriger
- **Description :** Pour enregistrer un versement, l'utilisateur doit trouver la facture → cliquer le badge statut → ouvrir le drawer → cliquer "+ Ajouter". 6 étapes pour 1 action banale.
- **Impact :** Les utilisateurs n'enregistrent pas leurs paiements → données fausses → produit perd sa valeur.
- **Correction :** Bouton "💸 Paiement" visible sur chaque ligne artisan avec facture. Formulaire ultra-minimal : montant pré-rempli (restant dû), date = aujourd'hui, 1 clic = validé.
- **Corrigé le :** —

#### C2 — Terminologie technique visible en UI
- **Statut :** 🟠 À corriger
- **Description :** Messages "Lié à la facture — impacte le Budget", "Acompte précédent — ajoutez un versement pour migrer" visibles en prod.
- **Impact :** Perte de confiance. L'utilisateur voit les coulisses de la DB.
- **Correction :** Supprimer ou reformuler : "✓ Comptabilisé dans le budget" / supprimer le message legacy migration.
- **Corrigé le :** —

#### C3 — KPIs header non orientés action
- **Statut :** 🟠 À corriger
- **Description :** KPIs actuels (Budget / Intervenants / Documents / À traiter) informent sans orienter. "Documents: 14" ne dit pas quoi faire.
- **Impact :** Le header est regardé à chaque visite mais ne génère aucune action.
- **Correction :** Remplacer par "X€ à payer cette semaine", "X artisans sans devis", alerte dépassement budget.
- **Corrigé le :** —

#### C4 — État vide sans guidance
- **Statut :** 🟠 À corriger
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
- **Statut :** 🟠 Backlog
- Le tableau Budget affiche toutes les sous-lignes. Sur un artisan avec 3 devis = surcharge. Masquer par défaut, expand on click.

#### I3 — Assistant IA invisible sauf dans son onglet
- **Statut :** 🟠 Backlog
- L'IA tourne en arrière-plan et génère des insights mais personne ne va dans l'onglet "Assistant". Surface persistante nécessaire.

#### I4 — Couleur "Reste à payer" anxiogène par défaut
- **Statut :** 🟠 Backlog
- Orange sur le restant dû = signal d'alerte sur un état normal. Passer en gris neutre, orange seulement si retard réel.

#### I5 — Vue expert = vue par défaut
- **Statut :** 🟠 Backlog
- Le tableau dense avec 9 colonnes devrait être la vue "expert" accessible via toggle.

#### I6 — Dépense rapide introuvable
- **Statut :** 🟠 Backlog
- Le bouton "Dépense" (achat matériaux, paiement liquide) est dans la barre d'actions du Budget. Un novice ne le trouvera jamais là.

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

## AUDIT #2 — À venir

*(Refaire après les corrections C1-C4)*

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
