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

### 2026-08-01 — INCOMPLETE-QUOTE-FAUX-POSITIF-SURFACES-INLINE

- **Signalé par** : Julien (feedback négatif utilisateur devis HEXA BAT)
- **Analyse ID** : `d1ddad9d` (devis-d202600056-hexa-bat.pdf, 34 403 € TTC, rénovation totale appartement 55 j, Montpellier)
- **User** : ctrithuong@gmail.com — feedback négatif enregistré
- **Symptôme observé** : Le bypass `incomplete_quote` (V3.5.1) se déclenche et l'utilisateur reçoit le message « Ce devis est trop synthétique pour être relu poste par poste » à la place de l'analyse. Or le devis est **bien détaillé** : 19 lignes avec descriptions techniques riches (ossature métallique, isolant 45mm/100mm, BA13 hydro, enduit, jointoiement, trappe 40x40, bloc porte 73cm...), les **surfaces sont EXPLICITEMENT indiquées dans les descriptions** (« Création salle d'eau - 13,23m² », « Coffrage plafond rempant avec isolation - 21.74m² », « Coffrage murs extérieurs avec isolation - 60,61m² », « Ponçage parquet existant 21,74m² », « Salle d'eau : murs + sol = 16,03m² »), et **au moins 2 postes ont des unités catalogue standards** : Peinture 2.8.1 = 84,18 m² × 39 €/m² = 3 283 € ; Climatisation 2.5.1 = 1 u × 1 950 €.
- **Cause racine** : L'heuristique de détection `incomplete_quote` (probablement Gemini côté extract ou conclusion) regarde uniquement les champs `quantite` / `unite` / `prix_unitaire` des lignes structurées. Comme la majorité des lignes sont en `Qté=1 ens` (forfait par corps de métier), elle conclut à un devis « sous-totaux uniquement ». Elle ignore trois contre-signaux forts :
  1. Les surfaces mentionnées **dans le texte des descriptions** (regex `\d+[,.]?\d*\s*m[²2]` détecterait ≥ 5 surfaces).
  2. Au moins 1 poste avec une vraie ligne détaillée (peinture 84,18 m² × 39 €).
  3. Le nombre de lignes total (19) qui exclut le pattern « 5 sous-totaux corps de métier ».
- **Maillon concerné** : 1 (Lire juste — la structure hiérarchique + les surfaces inline ne sont pas capturées) + 3 (Verdict honnête — le bypass laisse le user sans avis alors qu'il est analysable)
- **Phase qui corrige** : 3 (extract_v2 doit reconnaître les surfaces inline dans les descriptions) + 4 (verdict expert ne déclenche `incomplete_quote` que si contre-signaux absents)
- **Cas test à passer** :
  - Input : devis ≥ 15 lignes, avec ≥ 3 surfaces mentionnées dans les descriptions (regex m² / ml / u), et ≥ 1 ligne complète (qté ≠ 1 ou unité ≠ "ens/forfait")
  - Sortie attendue : PAS de bypass `incomplete_quote`. Analyse standard produite avec matching catalogue sur les postes détaillables.
- **Statut** : 🟢 **corrigé le 2026-08-15** (commit `aa53a8e`, déployé, validé sur le devis d'origine). Module `inline-quantities.ts` (déterministe, regex + gardes) branché dans extract_v2 (moteur primaire depuis la bascule Phase 3.3) : les surfaces écrites dans les descriptions sont remontées vers `quantite`/`unite=m²` AVANT la détection incomplete et la réconciliation. Résultat sur HEXA BAT rejoué : 6 surfaces remontées (13,23/21,74/60,61/21,74/16,03/84,18 m²), `is_incomplete_quote=false`, 14/14 postes comparés au marché, verdict réel « à négocier, surcoût 319-593 € » avec actions ciblées — à la place du faux « devis trop synthétique ». 27 tests anti-régression (`npx tsx supabase/functions/analyze-quote/inline-quantities.test.ts`) couvrant les pièges R=X m².K/W, €/m², 5à7 m2, dimensions. Gardes : remontée uniquement si UNE surface non ambiguë ; `ml` exclu (collision millilitres). Limite : ne bénéficie qu'aux nouvelles analyses (le stock garde ses conclusions).

### 2026-08-02 — ACOMPTE-SUR-MESURE-VS-BTP

- **Signalé par** : Johan (revue analyse DevisD2026019Sentis-Remi.pdf, 2026-08-01 22:46)
- **User** : mathos4102@gmail.com
- **Analyse** : porte d'entrée chalet **sur mesure**, 12 semaines de fabrication, BATIBASE HAUTES ALPES, 2 605 € HT / 2 748 € TTC, IBAN France valide, entreprise notée.
- **Symptôme observé** : Verdict ROUGE `ne_pas_signer` avec phrase intro « ...un devis à risque en raison de modalités de paiement inacceptables ». Les modalités déclenchantes : 40% à la commande + 40% au début des travaux + 20% solde. Or ces modalités sont la **norme du métier** pour un bien fabriqué sur mesure (menuiserie, cuisine, ébénisterie...). Trois défauts cumulés produisent un verdict injustifié :

  **Défaut 1 — heuristique acompte insensible au contexte produit.**
  Le seuil « 30% max d'acompte » de la loi conso (art. L114-1 Code conso) s'applique aux **chantiers travaux BTP courants** (peinture, plomberie, maçonnerie), pas aux biens sur mesure fabriqués. Un fabricant de porte / cuisine / meuble sur mesure doit couvrir la matière première spécifique et bloquer un atelier plusieurs semaines — 40-50% à la commande est la norme sectorielle (Bel'M, Zilten, ADI, cuisinistes). Le moteur ne fait pas la distinction et applique le seuil BTP.

  **Défaut 2 — cumul avant pose non calculé.**
  Le moteur évalue le poste `acompte_à_la_commande = 40%` en isolation → classé « modéré ». Mais le vrai enjeu est le **cumul avant que le bien soit livré/posé** : 40% + 40% = **80% avant délivrance**. C'est ce chiffre qu'il faut évaluer.

  **Défaut 3 — incohérence wording hero vs détail sur la même page.**
  Le hero affiche « modalités de paiement inacceptables » (verdict rouge, ton alarmiste) et 200 px plus bas le bloc « Conditions de paiement » affiche « Acompte modéré (40%) » comme observation factuelle. Ces deux wordings sont produits par des évaluations moteur distinctes qui ne se parlent pas. L'utilisateur voit deux verdicts opposés et perd confiance dans l'analyse. Bonus incohérence : le prix (correct pour du sur mesure haut de gamme) n'est jamais évoqué — la lecture est écrasée par le verdict acompte.

- **Cause racine** : Combinaison de 3 lacunes de la couche extract/verdict :
  1. Aucune détection du **contexte produit sur mesure** (mots-clés `sur mesure`, `fabrication X semaines`, `porte / cuisine / meuble` + `délai fabrication`, quantité unique, fournisseur menuisier/cuisiniste).
  2. Aucun **calcul de cumul jalons avant délivrance** dans l'évaluation acompte (on regarde chaque jalon séparément).
  3. Aucun **contrat de cohérence** entre les wordings des différents blocs de l'analyse (hero, conditions, poste par poste) — chaque bloc est calculé indépendamment.

- **Maillon concerné** : 1 (Lire juste — le contexte produit doit être extrait) + 3 (Verdict honnête — le seuil doit s'adapter au contexte + les blocs doivent être cohérents entre eux) + 4 (Wording sobre — les 2 wordings contradictoires cassent la crédibilité)

- **Phase qui corrige** : 3 (extract_v2 détecte le contexte sur mesure + le délai fabrication + le cumul acompte) + 4 (verdict honnête différencie BTP standard et bien sur mesure ; contrat de cohérence entre blocs)

- **Cas test à passer** :
  - Input : devis avec description contenant `sur mesure`, `fabrication X semaines` ou `à commande`, ou fournisseur type menuisier / cuisiniste / ébéniste, et modalités 40% commande + 40% pose + 20% solde
  - Sortie attendue :
    - Verdict NON ROUGE (au maximum `eleve_justifie` ou `signer_avec_negociation`) — les modalités 40+40+20 sont la norme métier
    - Cumul avant délivrance calculé : « 80% avant pose (40% commande + 40% début travaux) — dans la norme sur mesure »
    - Bloc conditions de paiement cohérent avec le hero (pas « inacceptable » d'un côté et « modéré » de l'autre)
    - Prix du poste évalué et communiqué (« 2 605 € HT pour porte chalet sur mesure fourniture+pose est dans la fourchette normale du marché »)

- **Statut** : 🔴 à corriger (Phase 3 + Phase 4). Mitigation immédiate : revue humaine (Piste C) — le cas est en pending_review depuis le fix `9e2635b`, l'expert corrige à la main.

### 2026-08-03 — INCOMPLETE-QUOTE-FAUX-POSITIF-FORFAITS-LEGITIMES

- **Signalé par** : Johan (revue Piste C, trigger `ratio_aberrant=58.4×`)
- **Analyse ID** : `d3cc843d` (Devis-SAS Florim-ATEX-D-2026-04115.pdf, ravalement de façade avec bardage Cedral, 17 936 € HT / 21 523 € TTC)
- **User** : dbaty102@gmail.com (très probablement l'artisan ATEX lui-même — émetteur du devis `dbatyatex@gmail.com`)
- **Symptôme observé** : Bypass `incomplete_quote` déclenché avec le message « Ce devis est trop synthétique… il manque les quantités précises et le prix unitaire de chaque prestation » alors que le devis est **complet** : 8 lignes, chacune avec colonnes Qté + Prix unitaire HT + Total HT remplies. Le poste principal (bardage Cedral **80 m² × 142,50 €/m²** = 11 400 €, 64 % du devis) et l'option laine de roche (80 m² × 24 €) sont parfaitement quantifiés. Les 6 lignes « 1 unité » sont des **forfaits BTP légitimes** (échafaudage, déplacement, purge, dépose descentes, nettoyage) — pratique normale sur un ravalement. Deuxième couche de bug : le matching vectoriel a produit **5 faux matchs forfait-vs-prix-unitaire** (échafaudage 2 630 € forfait vs 15-45 €/m² × qty 1 → ×58,4 ; descentes EP ×21,7 ; nettoyage ×8,6 ; purge matchée sur « ravalement complet » ×6,9 ; dépose descentes matchée sur « dépose clôture » ×5,3).
- **Cause racine** : `detectIncompleteQuote` (extract.ts, V3.5.5) compte les **lignes**, pas les **montants** : 6/8 lignes en « unité » qty=1 → 75 % ≥ seuil 70 % sur les 2 critères → bypass. L'heuristique est aveugle au fait que **74 % du montant HT** (13 320 €/17 936 €) est porté par des lignes m² parfaitement quantifiées. Différence avec le cas HEXA BAT (2026-08-01, surfaces inline dans les descriptions) : ici les quantités sont dans les **colonnes structurées** — le faux positif est encore plus flagrant. Côté matching : les forfaits qty=1 sont comparés à des prix unitaires m²/ml catalogue sans conversion (cf. FORFAIT-VS-PRIX-UNITAIRE-CATALOGUE 2026-06-29 — même famille).
- **Maillon concerné** : 1 (Lire juste — distinguer forfait légitime et devis résumé) + 2 (Comparer — un forfait qty=1 ne doit jamais être comparé à un prix unitaire surfacique) + 3 (Verdict honnête — le bypass a privé l'utilisateur d'une analyse possible)
- **Phase qui corrige** : 3 (extract_v2) + fix candidat immédiat discutable : **pondérer `detectIncompleteQuote` par montant** — ne déclencher que si ≥ 70 % du **montant HT** est porté par des lignes sans unité physique/quantité.
- **Cas test à passer** :
  - Input : devis ≥ 5 lignes dont ≥ 60 % du montant HT porté par des lignes avec unité physique + quantité + prix unitaire (ex. bardage 80 m² × 142,50 €), le reste en forfaits « 1 unité » (échafaudage, purge, nettoyage…)
  - Sortie attendue : PAS de bypass `incomplete_quote`. Analyse standard : postes m² comparés au catalogue, forfaits classés « non comparable » (JAMAIS d'anomalie ×58 par comparaison forfait vs prix unitaire).
- **Statut** : 🟢 **corrigé le 2026-08-03** (commit `3259074`, déployé). Garde montant livrée dans le module partagé `incomplete-quote.ts` (V1 `extract.ts` + V2 `extract_v2.ts`) : le bypass exige désormais AUSSI ≥ 70 % du montant HT porté par des lignes sans unité physique (fallback comptage lignes si montants indisponibles). 7 cas anti-régression : `npx tsx supabase/functions/analyze-quote/incomplete-quote.test.ts`. Le volet matching (faux matchs forfait-vs-prix-unitaire, ×58 échafaudage) reste couvert par FORFAIT-VS-PRIX-UNITAIRE-CATALOGUE (🔴 Phase 3). Mitigation données appliquée le jour même sur l'analyse d'origine : revue expert « Corriger » (verdict `a_negocier`, surcoût 0-600 € échafaudage) + chirurgie via service_role (retrait du flag `incomplete_quote` de `conclusion_ia`, réécriture phrase_intro/actions/verdict_reasons honnêtes — vrai point : acompte 40 % > usage 30 % —, passage des 6 groupes forfait en `vectorial.confidence='no_match'` + `prices=[]` pour affichage « Non comparable »).

### 2026-08-17 — INCOMPLETE-QUOTE-FAUX-POSITIF-EQUIPEMENT

- **Signalé par** : Johan (capture page analyse FCE)
- **Analyse ID** : `5a44b80d` (FRANCOIS CLIMATISATION ELECTRICITE, clim gainable Mitsubishi PEAD-M60JA, 8 542,63 € TTC)
- **Symptôme observé** : bannière « devis trop synthétique » sur un devis d'installation de climatisation **détaillé** : 7 lignes avec références produit (PEAD-M60JA, FOURGAIZO71, AIRZ3…), prix par ligne, main-d'œuvre séparée. 3e faux positif de la famille en 15 jours (après ATEX forfaits et HEXA BAT surfaces inline).
- **Cause racine** : un devis d'ÉQUIPEMENT se quantifie naturellement à l'unité matérielle → 100 % des lignes en qty=1 sans unité physique ET 100 % du montant aussi. La garde montant (fix ATEX) est structurellement inopérante sur cette famille : il n'existe AUCUNE ligne surfacique dans un devis de pose de clim. V2 a extrait `unite=null` partout (pas de colonne unité sur le devis).
- **Maillon concerné** : 1 (Lire juste — distinguer résumé par lot et devis d'équipement)
- **Cas test à passer** :
  - Input : lignes qty=1 sans unité MAIS libellés avec références produit + prix par ligne → PAS de bypass
  - Input : lignes qty=1 avec libellés génériques de corps de métier (« Plomberie », « Dépose de l'existant ») → bypass conservé
- **Statut** : 🟢 **corrigé le 2026-08-17** (commit `bd08099`, déployé). 3e garde-fou dans `incomplete-quote.ts` : garde « libellés de lot » — le bypass n'est légitime que si ≥ 50 % des lignes non quantifiées ressemblent à des intitulés génériques de corps de métier (vocabulaire 40 termes, veto sur les codes produit alphanumériques). 9 cas anti-régression couvrant les 3 variantes de la famille + les 2 vrais positifs (Créteil, résumé toiture). Analyse d'origine rejouée et page corrigée.

### 2026-08-18 — V2-MONTANT-DUPLIQUE-SUR-LIGNE-DESCRIPTION

- **Signalé par** : revue expert MALNOY (`68eced3d`, Electricité Gelir 25 410 € HT)
- **Symptôme observé** : la ligne de description « Comprend : prise de terre complète… » (suite de la ligne « Mise à la terre de l'ensemble » 890 €) s'est vu attribuer par extract_v2 un montant de 4 000 € **dupliqué depuis la ligne suivante** (« Forfait : saignée et rebouchage » 4 000 €). Le sous-total du lot extrait (17 360 €) dépasse le sous-total réel (13 360 €) de exactement 4 000 €. Le total global reste correct (25 410 €) car lu depuis le récapitulatif. Conséquence : une fausse carte rouge « Mise à la terre 4 000 € ×3.08 » dans le détail.
- **Cause racine** : violation de la règle R du prompt V2 (« le montant_total vient de la même position — NE JAMAIS prendre un montant d'une autre cellule ») sur une mise en page où la description de continuation est visuellement proche de la ligne suivante. La réconciliation arithmétique aurait dû dégrader la confiance (Σ lignes ≠ sous-total lu) — à vérifier pourquoi elle n'a pas signalé.
- **Maillon concerné** : 1 (Lire juste)
- **Cas test à passer** : devis MALNOY — la ligne « Comprend : prise de terre… » doit sortir montant=null (description), le sous-total commun doit réconcilier à 13 360 €.
- **Statut** : 🔴 à corriger (itération prompt V2 ou garde réconciliation par section). Mitigation : chirurgie du 18/08 (carte passée en no_match) ; le shadow inversé trace ce type d'écart.

### 2026-08-14 — ESPECES-ACCEPTE-CONFONDU-AVEC-ESPECES-EXIGE

- **Signalé par** : Johan (capture bloc « Conditions de paiement » — analyse DM PAYSAGES `7194c0fe`)
- **Symptôme observé** : « Paiement en espèces explicitement demandé » affiché en observation factuelle rouge + critère ROUGE + hard block verdict, alors que le devis dit seulement dans ses CGV « Les paiements seront effectués par chèque, en espèce ou virement » — une liste de modes ACCEPTÉS, pas une exigence. Faux rouge de masse : quasi toutes les CGV du BTP contiennent cette phrase.
- **Cause racine** : `score.ts` poussait un critère rouge dès que « especes » figurait dans `paiement.modes` (rempli par Gemini depuis n'importe quelle mention). 4 étages propageaient : score.ts (critère rouge) → render.ts (alerte 🔴) → verdictEngine `extractFlagsFromCriteria` (match « espèces » → `paiement_cash_suspect` → hard block) → front `securiteUtils` (observation rouge « explicitement demandé »).
- **Maillon concerné** : 3 (Verdict honnête — gravité disproportionnée d'un signal banal)
- **Cas test à passer** :
  - Input : modes = ["virement","chèque","espèces"] → AUCUN critère rouge, information neutre « espèces mentionnées parmi les modes acceptés »
  - Input : modes = ["espèces"] seul → critère ROUGE « paiement en espèces uniquement » + hard block (blanchiment/travail dissimulé, illégal > 1 000 €)
- **Statut** : 🟢 **corrigé le 2026-08-14** — règle « rouge seulement si espèces est le SEUL mode » appliquée aux 4 étages (`score.ts`, `render.ts`, `verdictEngine.ts` wording, `securiteUtils.ts` motifs). Les analyses legacy ne montrent plus l'observation rouge (motif « demandé » volontairement exclu des patterns front).

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
