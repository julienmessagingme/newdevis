# Refonte de l'outil d'analyse de prix — Plan de route

**Statut** : 🟢 Phase 0 en cours
**Démarrage** : 2026-06-23
**Source** : `refonte outil scoring VMD.pdf` (16 juin 2026), validation Julien 2026-06-23

---

## La cible — 4 maillons d'une chaîne fiable

| # | Maillon | État actuel | Trou à combler |
|---|---|---|---|
| 1 | **Lire juste** | 🔴 à construire | Extract.ts lit ligne par ligne, ne calcule jamais le prix unitaire. ~250 lignes de rustines empilées. **Origine de ~70 % des faux verdicts.** |
| 2 | **Comparer à vraie référence** | 🟡 partiel | Catalogue 911 entrées, **57 % sans métier identifiable**, doublons, fourchettes fausses |
| 3 | **Verdict honnête** | 🟡 partiel | Décision sur montants globaux (pas prix unitaires), pas de gradation de confiance |
| 4 | **Apprendre** | 🟡 moitié | Piste C (attente + bannière + email) en prod V3.5.16 ; **écran de revue absent → socle de cas validés vide** |

**Principe de la chaîne** : chaque maillon doit être solide et honnête sur sa propre confiance. Pas de patch correctif — chaque maillon est solide ou il dit "non comparable".

---

## Principes inviolables

1. **Honnêteté avant exhaustivité** — mieux vaut dire "comparaison indicative" que d'inventer une anomalie. Un faux "refuser" peut coûter un contrat à l'utilisateur.
2. **Comparer à base identique** — un prix "pose seule" ne se compare pas à un "fourniture+pose". Base inconnue → plafonné à "indicatif".
3. **Comparer le coût complet, pas la ligne isolée** — les frais annexes (préparation, ragréage, dépose) sont rattachés à l'ouvrage qu'ils servent, jamais comparés seuls.
4. **L'humain valide, la machine n'invente pas** — seules les corrections humaines fiables modifient la référence et les exemples.
5. **Zéro régression** — chaque évolution passe le filet des cas validés avant la prod. Activation par drapeau, repli immédiat.
6. **Coût ≈ 0** — pas d'usine à gaz, pas de modèle maison. La valeur vient de la rigueur de la chaîne, pas de la puissance brute.

---

## Ce qui s'ARRÊTE immédiatement

- ❌ **Plus de bumps `ENGINE_VERSION`** pour patcher un cas user signalé
- ❌ **Plus de "Garde n°X" inline** qui s'empile dans extract.ts / verdictEngine.ts / market-matcher / score.ts
- ❌ **Plus de fix réactifs ad hoc** — chaque bug signalé est noté dans `BUGS-A-CORRIGER.md` et devient un **cas test** du filet anti-régression
- ❌ **Plus de feature flags zombies** — code mort retiré

---

## Décisions actées (2026-06-23)

| ID | Décision | Justification |
|---|---|---|
| **A** | `ENGINE_VERSION` repart à `1.0.0-refonte` | Clarté visuelle, marque la nouvelle ère, casse le lien avec la série V3.4.x/V3.5.x |
| **B** | Quick fix Piste C élargie (ratio aberrant > 5× marché_max → `pending_review`) | Protège la prod pendant la refonte. Esprit "honnêteté avant exhaustivité" |
| **C** | YAML peinture/carrelage → input de Phase 1 (grille classement catalogue) | C'est la grille métier+nature dont la Phase 1 a besoin, pas un système parallèle |

---

## Ordre d'exécution

### 🟢 Phase 0 — Nettoyage + cartographie (en cours)

Avant de construire, on cartographie et on enlève le bruit. **Sans risque** (lecture seule sur la prod, suppression de code mort uniquement).

- [ ] **0.1** Étendre Piste C aux ratios aberrants (>5× marché_max) — protège la prod
- [ ] **0.2** Flag manuel de l'analyse ALES 8950€ en `pending_review`
- [ ] **0.3** Créer `docs/refonte/BUGS-A-CORRIGER.md` (file de test des signalements)
- [ ] **0.4** Inventaire `docs/refonte/RUSTINES.md` (classification des ~50 patches V3.4.x/V3.5.x)
- [ ] **0.5** Retirer le code mort (flag `MARKET_MATCHER_V36`, modes shadow vectoriel)
- [ ] **0.6** Reset `ENGINE_VERSION` → `"1.0.0-refonte"`
- [ ] **0.7** Pivoter YAML peinture/carrelage en input Phase 1 (catalogue-classement)
- [x] **0.8** Créer `docs/refonte/PLAN.md` (ce fichier)
- [ ] **0.9** Mettre à jour `CLAUDE.md` (interdits + pointer vers PLAN.md)
- [ ] **0.10** Commit + push tout sur main

### 🟡 Phase 1 — Catalogue d'aplomb (Maillon 2)

Objectif : catalogue rangé par métier + nature de prix, sans doublons, fourchettes vérifiées contre les prix réels observés.

**Sans risque** : lecture seule sur la prod jusqu'à validation Julien sur le classement.

- Audit `market_prices` (911 entrées) — SQL déjà spec dans `docs/refonte/catalogue-classement/AUDIT_CATALOGUE.md`
- Ajout colonnes `metier` (text) + `nature_prix` (`pose_seule` | `fourniture_pose` | `fourniture_seule`) à `market_prices`
- Heuristique de classement initial : ratio main-d'œuvre 100 % → pose seule, libellé "Fourniture + pose…" → fourniture+pose
- Julien valide le classement, arbitre les ambigus
- Fusion doublons, normalisation unités, recalibrage fourchettes vs `analyses` réelles (94 % des 1200 devis-postes ont un prix unitaire recalculable)
- Régénération embeddings (obligatoire après modif libellés)

**Risques** :
- Re-génération embeddings oubliée → audit invisible au moteur
- Validation circulaire (ne pas recalibrer uniquement sur nos propres observations)
- Ratio ≠ nature (un "fourniture+pose" à ratio MO ~50 % est exploitable mais à confirmer)

### 🟡 Phase 2 — Écran de revue (Maillon 4) — en parallèle de Phase 1

Objectif : passer le socle de cas validés de zéro à utile.

**Sans risque** : nouvelle page admin, ne touche pas la prod publique.

- Page `/admin/reviews` qui liste les `analyses.review_status='pending_review'`
- Détail 2 colonnes : gauche = lecture IA (verdict, postes, prix), droite = champs corrigeables
- Bouton "Valider" 1 clic / "Corriger" si modification
- Persistance corrections → table `analysis_corrections`
- Chaque correction = 1 cas du filet anti-régression

**Décisions préalables** :
- **Grain de revue** = verdict global d'abord (rapide, suffit pour démarrer), descente ligne par ligne seulement si correction de prix l'exige. Un outil trop lourd finit inutilisé.
- **"Validé" ≠ "corrigé"** : tracer la correction réelle, pas le clic
- **Réutiliser le mécanisme d'attente existant** — ne pas créer de parcours parallèle

### 🔴 Phase 3 — Lecture juste (Maillon 1) — le gros chantier

Objectif : ne plus confondre quantité / unité / prix unitaire, extraire le prix unitaire, vérifier l'arithmétique du devis sur lui-même.

**Risque modéré** : refonte complète de extract.ts. Déploiement derrière drapeau, repli immédiat.

- **Lecture "structure d'abord"** : cartographier la grille du tableau **une seule fois** (quelles colonnes, schéma numérotation, devise, sous-totaux), puis remplir les valeurs dans ce schéma figé
- **Extraire le prix unitaire** (+ texte brut original de la ligne, pour réparation ciblée)
- **Réconciliation arithmétique côté code** (gratuit) : `montant = qty × prix_unitaire` ; `sous-total = somme lignes filles` ; `devis = somme − remise`. La redondance du devis devient un correcteur d'erreur — **la plupart des rustines deviennent inutiles**
- **Niveau de confiance par champ** (prix lu vs recalculé, unité explicite vs déduite)
- **Tagger chaque ligne par nature** : ancre surfacique (pose au m²) / annexe corrélée sans unité propre (ragréage, primaire, dépose, joints…) / ligne transverse (nettoyage, déchets). Prérequis du rattachement annexes au coût unitaire (Phase 4).

**Risques** :
- **Budget temps ~150 s** (extraction a déjà délai 80 s). Faire 2 appels (structure puis valeurs) risque de dépasser → un seul appel à sortie structurée
- **Troncature** : ajouter le prix unitaire + structure alourdit la sortie ; JSON tronqué = extraction ratée
- **Ne pas casser ce qui marche** : les rustines couvrent de vrais cas ; ne les retirer **qu'après** que la réconciliation couvre le même cas (prouvé par le filet de tests)
- **Cas particuliers à préserver** : multi-devis, devis "résumé par lot" (sans prix unitaire)

### 🔴 Phase 4 — Verdict honnête (Maillon 3)

Objectif : reconstituer le coût complet d'un ouvrage (annexes corrélées comprises), décider sur le prix unitaire, afficher la confiance honnêtement.

- **Rattachement des annexes au coût unitaire** : pour chaque poste surfacique, rattacher les frais annexes corrélés (même métier, même zone, sans unité propre). Ex : `(2550 € pose + 400 € ragréage) / 85 m² = 34,7 €/m²`. Liste codifiée par métier.
- **Décision "prix unitaire d'abord"** : le sens cher/normal = rapport prix unitaire devis vs marché. La quantité ne sert qu'à chiffrer l'ampleur en €. Une quantité douteuse n'affiche plus qu'une **fourchette d'ampleur**, sans changer la couleur.
- **Gradation de confiance** : certifié / indicatif / non comparable, avec pondération du surcoût (1 / ~0,5 / 0)
- **Blocages anti-verdict-dur** : liste de raisons qui interdisent une anomalie rouge (unité incompatible, nature de prix inconnue, HT/TTC incertain, rapprochement incertain) → basculent en "indicatif"
- **Garder intacts** les garde-fous critiques existants (entreprise radiée, clauses litigieuses, IBAN suspect, cash)

**Risques** :
- **Anti-double-comptage de surface** : une zone = une seule ancre (piège : fond de forme + concassé + pavé sur la même surface ne s'additionnent pas)
- **Abstention si zone ambiguë** : plusieurs métiers surfaciques mélangés → on ne rattache pas, on garde séparé et "indicatif"
- **2 jeux de valeurs verdict_global coexistent** (mono-devis vs multi-devis) — tout changement doit gérer les deux
- **Une seule source d'affichage** : pastille et bandeau doivent lire la même valeur
- **Changer la logique invalide le cache** → régénération massive, à activer hors heures de pointe

### 🟢 En continu — boucle d'amélioration

Chaque correction humaine devient :
1. Un test du filet anti-régression
2. Un exemple pour guider le modèle
3. Un correctif pour la référence de prix

**Plus on l'utilise, meilleur c'est — sans surcoût.**

---

## Documents associés

| Fichier | Rôle |
|---|---|
| [`PLAN.md`](PLAN.md) | Ce fichier — boussole de la refonte |
| [`BUGS-A-CORRIGER.md`](BUGS-A-CORRIGER.md) | File de test des bugs signalés (deviennent cas du filet anti-régression) |
| [`RUSTINES.md`](RUSTINES.md) | Inventaire des ~50 patches V3.4.x/V3.5.x avec classification (KEEP-GUARD-CRITIQUE / RUSTINE-PHASE-3 / MORT) |
| [`catalogue-classement/`](catalogue-classement/) | Phase 1 — grille métier+nature_prix + audit catalogue (anciennement `docs/taxonomy/`) |

---

## Pour toute prochaine session

Ouvrir **CE FICHIER** en premier. Puis :
- Si on bosse sur un bug user → noter dans `BUGS-A-CORRIGER.md`, ne **PAS** patcher inline
- Si on bosse sur le catalogue → Phase 1, lire `catalogue-classement/`
- Si on bosse sur l'écran de revue → Phase 2
- Si on bosse sur extract.ts → on est entré en Phase 3, suivre le scope strict

**Règle absolue** : la priorité va à la phase en cours. Pas de saut de phase. Pas de patch parallèle.
