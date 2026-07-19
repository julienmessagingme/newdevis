# File de test — Bugs signalés (deviennent cas du filet anti-régression)

**Règle absolue** : à partir du 2026-06-23, **plus aucun patch inline** sur un bug user signalé. Chaque bug est noté ici. Au moment de la livraison de la phase qui le corrigera, il devient :

1. Un **cas test** du filet anti-régression (la phase ne peut être livrée tant que ce cas ne passe pas)
2. Un **exemple** pour guider le modèle (Phase 3 prompt extract.ts)
3. Un **correctif** pour la référence de prix si applicable (Phase 1 catalogue)

---

## Format d'une entrée

```
### YYYY-MM-DD — [Identifiant court]

- **Signalé par** : Julien / user X / auto-détecté
- **Analyse ID** : `uuid` (et nom fichier source)
- **Symptôme observé** : ce que voit l'utilisateur (1 phrase)
- **Cause racine** : ce qui foire dans la chaîne (extract / matcher / verdict / UI)
- **Maillon concerné** : 1 Lire / 2 Comparer / 3 Verdict / 4 Apprendre
- **Phase qui corrige** : 1 Catalogue / 2 Revue / 3 Lecture / 4 Verdict
- **Cas test à passer** : description du test (input + sortie attendue)
- **Statut** : 🔴 à corriger / 🟡 en cours / 🟢 corrigé (avec commit + ENGINE_VERSION)
```

---

## Bugs ouverts

### 2026-06-23 — ALES-8950-WC

- **Signalé par** : Julien
- **Analyse ID** : `d3b3f014-7441-42fb-b3b7-95c7b56eb521` (`Devis_n°467.pdf` — ALES Rénovation)
- **Symptôme observé** : Carte "WC (fourni+posé) — Anomalie marché — Devis 8 950 € · Marché 292-608 €" affichée à l'utilisateur. Le devis ne contient pas de WC à 8 950 €.
- **Cause racine** : Bug d'extraction Gemini sur tableau multi-lignes (description ALES s'étend sur 2-3 lignes physiques). Le libellé de la ligne 2.3 "Fourniture et pose de nouveaux wc en-dessous de [l'escalier]" (vrai montant 620 €) a été collé au montant de la ligne 3.1 "Dépose totale des cloisons intérieures sur combles" (vrai montant 8 950 €). Résultat : 1 ligne fantôme à 8 950 € + 2 lignes réelles disparues.
- **Maillon concerné** : 1 (Lire juste — alignement colonnes cassé)
- **Phase qui corrige** : 3 (lecture structure-d'abord cartographie la grille en une passe)
- **Cas test à passer** :
  - Input : `Devis_n°467.pdf` ALES Rénovation
  - Sortie attendue : 35+ lignes extraites incluant 2.3 (620 € wc) ET 3.1 (8 950 € dépose cloisons) distinctes. Réconciliation arithmétique passe (Σ montants ≈ 22 150 € HT).
- **Statut** : 🔴 à corriger (Phase 3). Mitigation immédiate : Piste C élargie au ratio aberrant (>5× marché_max) + flag manuel `pending_review`.

### 2026-06-23 — CIC-IBAN-TIRETS

- **Signalé par** : Julien
- **Analyse ID** : devis CIC avec IBAN `FR76-3006-6108-7700-0209-7520-110`
- **Symptôme observé** : Bandeau "Statut IBAN — Aucun IBAN n'a été détecté dans le devis" alors que l'IBAN est visible et valide.
- **Cause racine** : Double bug. (1) Prompt Gemini extract.ts ne mentionnait que les espaces comme séparateurs internes — Gemini retournait `null` sur le format à tirets. (2) Normalisation `verify.ts` ne retirait que `/\s/g` → si Gemini renvoyait avec tirets, OpenIBAN refusait silencieusement.
- **Maillon concerné** : 1 (Lire juste — robustesse extraction champ entreprise)
- **Phase qui corrige** : 3 (refonte extract.ts élargit la robustesse multi-format)
- **Cas test à passer** :
  - Input : ligne `IBAN : FR76-3006-6108-7700-0209-7520-110`
  - Sortie attendue : `entreprise.iban = "FR7630066108770002097520110"` + OpenIBAN valide
  - **Variantes** : espaces, tirets, points, mixte, en pied de page sur page N>1
- **Statut** : 🟡 patché 2026-06-23 (commit `2e2553b`) **avant la décision de refonte** — sera réabsorbé dans Phase 3 (l'arithmétique fragile sera remplacée par le maillon "Lire juste").

### 2026-06-23 — PLACO-25-EUR-M2

- **Signalé par** : Julien
- **Analyse ID** : devis placo 276 m² × 26 €/m² (à retrouver)
- **Symptôme observé** : Le verdict expert affiche "45 €/m² → +500 €" alors que le devis affiche bien 25 €/m² (dans la fourchette).
- **Cause racine** : Hallucination du verdict expert (Gemini conclusion.ts). Le matching catalogue avait extrait correctement la ligne, le matcher avait trouvé un comparable, mais Gemini a inventé un prix unitaire de 45 €/m² qui n'apparait nulle part dans le devis ni dans le catalogue.
- **Maillon concerné** : 3 (Verdict honnête — confond montants et prix unitaires)
- **Phase qui corrige** : 4 (décision "prix unitaire d'abord", retire l'invention par le LLM)
- **Cas test à passer** :
  - Input : ligne placo 276 m² × 26 €/m² = 7 176 €, fourchette marché 22-32 €/m²
  - Sortie attendue : verdict "dans la norme" (25 ∈ [22, 32]), pas d'anomalie inventée
- **Statut** : 🔴 à corriger (Phase 4)

### 2026-06-29 — FORFAIT-VS-PRIX-UNITAIRE-CATALOGUE

- **Signalé par** : Julien (pattern récurrent identifié pendant les revues Phase 2.4)
- **Analyses concernées** :
  - `8060adbf-31fb-4cda-8a07-e2f17fab3cfc` (Toiture Boxes) : "Échafaudage location + montage/démontage" devis 295€ forfait vs catalogue ~45€/jour → ratio 6.56× faux
  - Devis Mélier Cognac : "Échafaudage location + montage/démontage" forfait multi-mois → ratio 112.5× faux
  - Devis Travaux Maçonnerie : 7 postes en forfait (démolition mur parpaing, évacuation gravats, piliers portail, scellements, rebouchage, reprise fissures) tous classés "Anomalie marché"
  - `d3b3f014-7441-42fb-b3b7-95c7b56eb521` (ALES n°467) : "Dépose et évacuation clôture existante 950€ ×27.14" alors qu'il s'agit en réalité de "Fourniture + fermeture séparation chambre/SDB" (mauvais matching)
- **Symptôme observé** : Le moteur classe massivement en "Anomalie marché" des postes facturés en forfait quand le catalogue contient le même travail mais en prix unitaire (au ml / m² / U / jour). L'utilisateur voit un nombre élevé d'anomalies rouges qui contredisent le verdict global, sans pouvoir distinguer les vrais signaux des artefacts.
- **Cause racine** : Le matching catalogue actuel ne tient pas compte de la **nature_prix** (forfait / unitaire) de l'entrée catalogue ni de la **structure de tarification** de la ligne devis (qté=1 unique = forfait probable). Quand l'écart d'unité est de plusieurs ordres de grandeur (forfait journée vs forfait chantier multi-mois), aucune comparaison n'a de sens.
- **Maillon concerné** : 2 (Comparer à vraie référence) + 3 (Verdict honnête — il faut ne PAS lever d'anomalie sur du non-comparable)
- **Phase qui corrige** : 1 (catalogue : la colonne `nature_prix` ajoutée Phase 1.5 va servir) + 4 (verdict ignore les "anomalies" sur des matchings de natures incompatibles)
- **Cas test à passer** :
  - Input : ligne "Échafaudage location + montage/démontage 1 forfait 295€"
  - Sortie attendue : classification `non_comparable` (ou `low_confidence_match`) — pas `anomalie_marche`. Le poste apparaît dans une section "Comparaison non applicable" et n'entre PAS dans le compte d'anomalies du verdict global.
- **Statut** : 🔴 à corriger (Phase 4). Mitigation immédiate : la garde V3.5.11 `low_confidence_match` rattrape une partie des cas (similarity < 0.85). Mais le pattern forfait est si massif qu'il déborde quand même.

### 2026-07-11 — PACKAGE-MULTI-ELEMENTS-AVEC-MAX-DESCRIPTEURS

- **Signalé par** : Julien (revue devis SDB fort351, 2026-07-14)
- **Analyse ID** : `e205bc1a-8d7e-4340-9d31-c3f3dd50dbd2` (b8f6f03c2b697b3c8bea4c0160c25871fedcca10daf786839be5c268d17a.pdf)
- **Symptôme observé** : Une ligne 4.1.1 « Fournitures ET pose : - receveur de douche (300€ max) - colonne de douche (200€ max) - paroi (300€ max) - meuble vasque suspendu (350€ max) - mitigeur (80€ max) - miroir LED (100€ max) - sèche-serviette électrique (250€ max) - WC simple (250€ max) » facturée **4 200 € en 1 unité forfait**. Gemini a extrait les prix « max » descripteurs, les a **sommés** (~1 830 €), et généré une anomalie « Miroir LED (fourni+posé) — la somme des prix maximums des éléments listés est bien inférieure au prix total facturé (1 850 € vs 4 200 €) ». Ce n'est pas absurde en soi : les 4 200 € couvrent un forfait fourniture + pose de **8 éléments installés** en douche italienne complète (matériel max ~1 830 € + pose + accessoires + raccords ≈ 2 300 €).
- **Cause racine** : Les mentions « (300€ max) » dans les descripteurs de ligne sont des **indications de gamme pour l'acheteur** (choix haut de gamme du budget prévu), pas des prix théoriques du poste. Gemini les traite comme des composants de prix agrégés et fait un contrôle brut (somme = ? total) sans tenir compte de :
  - la nature « fourniture ET pose » de la ligne
  - la présence de main d'œuvre / accessoires / raccords hors matériel
  - la sémantique du token « max » qui indique un plafond de choix, pas un total attendu
- **Maillon concerné** : 1 (Lire juste — la sémantique des sous-éléments est mal comprise) + 3 (Verdict honnête — l'anomalie n'aurait pas dû être générée)
- **Phase qui corrige** : 3 (extract_v2 doit reconnaître ces packages avec sous-éléments décrits en « prix max ») + 4 (verdict expert ne remonte plus d'anomalie sur ce type de ligne)
- **Cas test à passer** :
  - Input : ligne forfait 1 unité 4 200 € avec descripteur listant 8 sous-éléments chacun avec « (prix max €) »
  - Sortie attendue : le poste est classé « package multi-éléments non décomposé » — ni « anomalie » ni « comparaison automatique ». Une action ciblée peut proposer : « Demandez le détail chiffré poste par poste : receveur X €, colonne Y €, pose Z €… pour vérifier chaque élément individuellement. »
- **Statut** : 🔴 à corriger (Phase 3 + Phase 4). Note : ce cas est un excellent training data pour extract_v2 — la ligne montre à la fois la structure hiérarchique (parent 4.1 + enfant 4.1.1) et la présence de descripteurs avec prix max qui ne doivent PAS être traités comme composants.

### 2026-06-29 — DEVIS-DATE-NON-EXTRAIT-COMME-LEVIER

- **Signalé par** : Julien (revue devis Mélier Cognac 2024)
- **Analyse ID** : `2c52e2f6-...` (Devis Mr Mélier Cognac.pdf, daté 2024)
- **Symptôme observé** : Un devis daté de 2024 est validé "dans_la_norme/signer" pour 2026, alors que l'évolution des coûts matériaux entre 2024 et 2026 (+5-8% selon poste) constitue un levier de négociation factuel pour le client ("vos prix 2024 doivent être révisés"). VMD n'extrait pas la `date_devis` du PDF et ne l'utilise pas comme signal.
- **Cause racine** : Champ `date_devis` non extrait par `extract.ts` (le prompt actuel demande date d'analyse, pas date du devis lui-même).
- **Maillon concerné** : 1 (Lire juste — un champ manquant à extraire) + 3 (Verdict honnête — un levier de négo à proposer)
- **Phase qui corrige** : 3 (extract_v2 ajoute date_devis dans la structure ExtractedData) + 4 (verdict génère une action "demander révision tarifaire" si âge devis > 12 mois)
- **Cas test à passer** :
  - Input : devis daté 2024, analysé 2026
  - Sortie attendue : `date_devis` extraite + action "Demandez à l'artisan de réviser ses prix : votre devis date de 2024, les coûts matériaux ont évolué de ~5-8% depuis. Marge de négociation possible : 3-5% du montant total."
- **Statut** : 🔴 à corriger (Phase 3 + Phase 4)

---

## Spec produit validée — Maillon 3 (Verdict honnête)

**Session 2026-06-29** : critique produit fondamentale soulevée par Julien sur 2 devis (Toiture Boxes + Mélier Cognac).

### Verbatim de la critique
> "compliqué pour l'utilisateur et fastidieux dans l'analyse de prix de lire ligne par ligne si on est dans le marché ou hors marché, on voit plein de ligne avec anomalie marché, dans la norme, pas de référence marché, comparaison incertaine. Et difficile au final d'avoir un avis global sur le devis (est-ce une bonne affaire ou je me fais avoir), que dire à l'artisan et comment négocier (véritable valeur ajoutée du site)"

### Reformulation des 2 vraies questions de l'utilisateur
1. **Est-ce une bonne affaire ou je me fais avoir ?** → 1 ligne, pas 13
2. **Quoi dire à l'artisan, comment négocier, sur quels leviers ?** → 3 leviers max, hiérarchisés par puissance

### Les 4 exigences UX à coder en Phase 4

1. **Verdict tranché above-the-fold** (1 ligne) :
   ```
   ✓ Vous pouvez signer ce devis.
      77 568€ HT pour rénovation complète = prix correct, dans le marché.
      Levier de négociation envisageable : 3-5%.
   ```
   OU
   ```
   ⚠️ À négocier avant signature.
      35 570€ HT — niveau de prix incertain (manque de détails) + acompte 50% excessif.
      Levier principal : exiger un devis détaillé avec quantités.
   ```

2. **3 leviers de négociation hiérarchisés** (pas une liste exhaustive de 8 actions) :
   ```
   1. 🔴 LE PLUS PUISSANT : exiger des quantités précises (ml de fissure, m² de mur)
      → bascule le rapport de force, oblige l'artisan à justifier le prix
   2. 🟠 IMPORTANT : ramener l'acompte de 50% à 30% maximum
   3. 🟡 BONUS : demander une révision tarifaire (devis 2024 → coûts 2026)
   ```

3. **Message à copier-coller** : aligné sur les **vrais** leviers, pas sur les fausses anomalies (aujourd'hui le message reflète les anomalies catalogue qui contiennent du bruit forfait/unitaire).

4. **Détail poste par poste replié par défaut** ("Voir le détail" expand). Pour les rares users qui veulent rentrer dans la matière. Pas dans le chemin de lecture principal.

### Sources de bruit identifiées à éliminer ou contextualiser

- **Statuts contradictoires** : "Dans la norme" + 7 anomalies marché simultanément (cas Toiture Boxes, Travaux Maçonnerie). L'utilisateur ne sait pas qui croire.
- **Tableau de répartition par catégorie sans contexte** : "2 correct / 0 légèrement / 0 survalué / 7 anomalie" — un décompte hors-sol qui n'aide pas à décider. À retirer ou requalifier.
- **Liste exhaustive de 8 actions** : aujourd'hui Gemini génère 6-8 actions par analyse. L'utilisateur ne sait pas par où commencer. À ramener à 3 max.
- **Anomalies forfait/unitaire** : voir bug FORFAIT-VS-PRIX-UNITAIRE-CATALOGUE ci-dessus. 60% des "anomalies marché" sont des artefacts de matching.

### Cas test acceptance pour la Phase 4

- Toiture Boxes 8 841€ → verdict 1 ligne "signer, marge 3-5%", 3 leviers (assurance / références / révision tarifaire), détail replié. PAS de "7 anomalies marché" dans le chemin principal.
- Travaux Maçonnerie 35 570€ → verdict "à négocier", 3 leviers (quantités précises / acompte 30% max / révision tarifaire). Anomalies forfait ignorées, on parle d'abord transparence.
- Mélier Cognac 77 568€ → verdict "signer, marge 3-5%", levier principal "devis 2024, demander révision 2026".
- DUBOIS clavier VELUX 372€ → verdict "ne pas signer en l'état", levier unique "retirer les 2 clauses abusives" (citation à la lettre).

---

## Bugs corrigés (clos)

*(rien pour l'instant — chaque bug clos déménagera ici avec son commit + ENGINE_VERSION cible)*

---

## Note méthode

Tant qu'un bug est en 🔴 ou 🟡, il :
- Apparaît dans `pending_review` côté admin (Piste C élargie le capte automatiquement si le ratio est aberrant ou si le verdict est rouge)
- N'est **PAS** patché inline dans le code (sauf garde de sécurité Piste C qui protège la prod sans toucher à la logique métier)
- Sert de cas d'acceptation pour la phase qui le couvre

Quand la phase est livrée :
- On lance le pipeline sur tous les bugs 🔴/🟡 du maillon couvert
- Ceux qui passent → 🟢 corrigé, commit ref noté
- Ceux qui restent rouges → diagnostic Phase suivante ou ouverture d'un sous-bug
