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
