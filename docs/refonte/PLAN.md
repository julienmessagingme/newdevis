# Refonte de l'outil d'analyse de prix — Plan de route

**Statut** : 🟢 Phases 0+1+2 livrées · Phase 3 = prochain gros chantier
**Démarrage** : 2026-06-23
**Source** : `refonte outil scoring VMD.pdf` (16 juin 2026), validation Julien 2026-06-23
**Dernière mise à jour** : 2026-06-23 fin de journée

---

## État actuel des 4 maillons

| # | Maillon | Avant refonte | Après Phase 0+1+2 |
|---|---|---|---|
| 1 | **Lire juste** | 🔴 à construire | 🔴 inchangé (Phase 3 le couvre — gros chantier extract.ts) |
| 2 | **Comparer à vraie référence** | 🟡 partiel (57% sans métier) | 🟢 **fait** — 891 entrées rangées par metier × nature_prix × gamme + 33 métiers + 0 doublon |
| 3 | **Verdict honnête** | 🟡 partiel | 🟡 inchangé (Phase 4 le couvre — prix unitaire + confiance) |
| 4 | **Apprendre** | 🟡 moitié (socle vide) | 🟢 **fait** — écran `/admin/reviews` + table `analysis_corrections` (socle gold standard prêt) |

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

### ✅ Phase 0 — Nettoyage + cartographie (LIVRÉE 2026-06-23)

- [x] **0.1** Étendre Piste C aux ratios aberrants (>5× marché_max) — `detectReviewTriggers` étendu, protège la prod
- [ ] **0.2** Flag manuel de l'analyse ALES 8950€ en `pending_review` — peut maintenant se faire via `/admin/reviews` (Phase 2)
- [x] **0.3** `docs/refonte/BUGS-A-CORRIGER.md` créé (3 bugs notés : ALES WC, IBAN CIC tirets, placo 25€/m²)
- [x] **0.4** `docs/refonte/RUSTINES.md` créé (50 patches V3.4.x/V3.5.x classifiés KEEP / PHASE-3 / PHASE-4 / MORT)
- [x] **0.5** Code mort marqué `🔴 CLEANUP-PHASE-1` (`MARKET_MATCHER_V36`, `MARKET_MATCHER_VECTORIAL=shadow`)
- [x] **0.6** `ENGINE_VERSION` reset à `"1.0.0-refonte"`
- [x] **0.7** YAML peinture/carrelage pivotés en `docs/refonte/catalogue-classement/`
- [x] **0.8** `PLAN.md` créé
- [x] **0.9** `CLAUDE.md` mis à jour (section REFONTE EN COURS en tête)
- [x] **0.10** Commit + push main (`62d3572`)

### ✅ Phase 1 — Catalogue d'aplomb (LIVRÉE 2026-06-23)

**Résultat** : 891 entrées (911 initiales − 21 nettoyées + 1 créée) rangées par métier × nature_prix × multiplicateur_couches × gamme. **33 métiers distincts**, 4 natures de prix, 100% couverture, 0 doublon, 0 inclassable.

- [x] **1.3** Script `scripts/phase1-audit-catalogue.ts` v4 (auto-classifie 891 entrées par parsing label + heuristique nature_prix par défaut)
- [x] **1.4a** Fix doublons : 39 doublons réglés via `phase1-fix-doublons.sql` (16 forfaits par taille supprimés + 10 labels expliciter + 5 fusions + F2 + G1)
- [x] **1.4b** Relecture 152 conflits : 18 corrections Claude + 6 arbitrages Julien + 128 validés en bloc
- [x] **1.5** Migration `phase1-migration-colonnes.sql` appliquée (ALTER TABLE + 891 UPDATE + indexes + CHECK constraints)
- [ ] **1.6** ⏳ Régénération embeddings sur 11 entrées modifiées (10 labels Cat B + 1 nouveau `pose_carrelage_sdb_m2`) — script `scripts/seed_market_prices_embeddings.mjs` existant
- [ ] **1.7** ⏳ Recalibrage fourchettes vs prix réels observés dans `analyses` (94% des 1200 devis-postes recalculables) — facultatif court terme

### ✅ Phase 2 — Écran de revue (LIVRÉE 2026-06-23)

**Résultat** : page `/admin/reviews` opérationnelle, table `analysis_corrections` prête à recevoir, mécanisme back Piste C V3.5.16 enfin pleinement exploitable.

- [x] **2.1** Migration `20260624_001_phase2_analysis_corrections.sql` appliquée (table + vue `admin_pending_reviews` + RLS 3 policies)
- [x] **2.2** 3 routes API admin (`/api/admin/reviews` GET list, `/api/admin/reviews/[id]` GET detail, `/api/admin/reviews/[id]/decide` POST action)
- [x] **2.3** Page `/admin/reviews` (layout 2 colonnes : liste pending_review à gauche, détail + formulaire correction inline à droite, 3 boutons Valider/Corriger/Rejeter)

**Grain de revue** (validé PDF) : verdict global d'abord, descente ligne par ligne reportée à Phase 2.4 (édition anomalies détaillées) — à faire seulement si on constate qu'on en a besoin en pratique.

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
- Si on bosse sur les fourchettes catalogue → Phase 1.7 (recalibrage)
- Si on bosse sur les embeddings → Phase 1.6 (régénération)
- Si on bosse sur extract.ts → on entre en Phase 3, suivre le scope strict
- Si on bosse sur le verdict → on entre en Phase 4

**Règle absolue** : la priorité va à la phase en cours. Pas de saut de phase. Pas de patch parallèle.

---

## ⏸️ Où on s'est arrêté — fin de journée 2026-06-23

**État livré ce jour** : Phase 0 ✅ · Phase 1 ✅ (1.6 et 1.7 reportées) · Phase 2 ✅ (déployée et migration appliquée)

**Reprise possible demain — 3 options** (à arbitrer début de session) :

### (A) Phase 1.6 — Régénération embeddings (10 min)
Re-générer les embeddings pour 11 entrées `market_prices` dont le label a été modifié en Phase 1.4a (10 entrées Cat B "standard/premium" + 1 nouvelle entrée `pose_carrelage_sdb_m2`). Sans ça, le matcher vectoriel V3.5 prod cherche encore les anciens libellés.
- Script existant : `scripts/seed_market_prices_embeddings.mjs`
- Effort : nul côté Julien si script déjà OK, sinon 10 min pour ajouter une option `--only-modified`

### (B) Phase 1.7 — Recalibrage fourchettes vs prix réels (1-2h)
Le PDF dit : "auditer le catalogue contre les ~1200 devis-postes observés, dont 94% avec prix unitaire recalculable". On confronte les fourchettes théoriques aux médianes + quartiles réels pour identifier les entrées catalogue qui divergent significativement.
- Sortie : SQL d'ajustement des fourchettes avec proposition (median±IQR) + validation Julien sur les cas douteux
- Risque : validation circulaire — ne pas recalibrer uniquement sur nos propres observations sur les postes sensibles

### (C) Phase 3 — Refonte extract.ts (le GROS chantier)
Le maillon 1 du PDF, origine de ~70% des faux verdicts (mauvaise lecture du PDF avant tout matching).
- Lecture "structure d'abord" : cartographier la grille du tableau une seule fois
- Extraire le prix unitaire (+ texte brut original)
- Réconciliation arithmétique côté code (`montant = qty × prix_unitaire`, `sous-total = somme lignes filles`, `devis = somme − remise`)
- Niveau de confiance par champ
- Tagger chaque ligne par nature (ancre surfacique / annexe corrélée / ligne transverse)
- **Risques** : budget temps 150s · troncature JSON · ne pas casser ce qui marche (rustines à enlever progressivement)
- **Effort** : 2-4 sessions (le plus gros morceau de la refonte)

**Ma reco** : (A) puis (C). La (B) peut attendre que la Phase 2 ait commencé à produire des corrections expert qui valideront/invalideront naturellement les fourchettes. (A) est rapide et complète Phase 1 proprement avant d'attaquer Phase 3.

**Décisions actées le 2026-06-23** :
- ENGINE_VERSION = `"1.0.0-refonte"` (ne plus bumper sauf phase livrée)
- Bugs ALES 8950€ WC, IBAN CIC tirets, placo 25€ → restent en `BUGS-A-CORRIGER.md`, deviendront cas test Phase 3
- Catalogue verrouillé : 891 entrées, 33 métiers, 4 natures, 100% couverture
- Piste C élargie au ratio aberrant (>5×) protège la prod pendant Phase 3
