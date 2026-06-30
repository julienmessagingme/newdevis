# Comparateur de devis V1 — Spec produit

**Date** : 2026-06-30
**Statut** : spec validée Julien, code à venir (après bascule extract_v2 idéalement)

---

## La promesse

> *"Vous avez consulté plusieurs artisans pour les mêmes travaux. On vous aide à choisir le meilleur **pour vous**, pas le moins cher."*

VMD existant analyse 1 devis. Le comparateur analyse 2 à 4 devis et tranche.

**Différence fondamentale avec le multi-devis existant** :
- Multi-devis VMD = 1 PDF contenant N artisans pour 1 chantier (cas SALLEM)
- Comparateur V1 = N analyses indépendantes (1 PDF chacun) groupées en comparaison

---

## Cas d'usage couvert en V1 — Cas A uniquement

**Cas A — Même chantier, 4 artisans, périmètres alignés**
> "J'ai consulté 4 électriciens pour la même rénovation, lequel choisir ?"

V1 refuse silencieusement les cas suivants (avec message UX dédié) :
- **Cas B** (périmètres partiels qui se chevauchent) → V2
- **Cas C** (devis hétérogènes type toiture + cuisine) → "Vos devis ne portent pas sur les mêmes travaux, comparaison non applicable"

---

## Décisions actées Julien (2026-06-30)

| Question | Décision |
|---|---|
| Promesse | Meilleur choix global (prix + fiabilité + transparence + clauses) |
| Périmètre V1 | Cas A seul (mêmes travaux, devis comparables) |
| Bouton "Comparer" | Sur accueil ET dashboard |
| Flow upload | Progressif (réutilise upload existant + groupement) |
| Vue | Tableau desktop / cards mobile |
| Verdict | Conditionnel (Si X : A. Si Y : B. Notre choix par défaut : C parce que…) |
| Business | 1 comparaison gratuite, paywall au-delà (Pass Sérénité) |

---

## Architecture proposée

### Modèle de données

Nouvelle table `comparisons` :
```sql
CREATE TABLE public.comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT,              -- "Comparaison Rénovation SDB" (auto ou éditable)
  analysis_ids UUID[],     -- [analysis_id_1, analysis_id_2, ...]
  verdict JSONB,           -- ConclusionComparator (verdict conditionnel + ranking)
  perimeter JSONB,         -- périmètre commun reconstruit (poste→présence par devis)
  status TEXT,             -- 'pending' | 'computing' | 'ready' | 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

RLS : SELECT/INSERT/UPDATE par user_id propriétaire.

### Calcul du verdict

Pipeline :
1. **Validation du cas A** : pour chaque paire (A, B), calculer le score d'alignement périmètre (catégories communes / total catégories). Si min(alignement) < 50% → refus avec message "périmètres trop différents".
2. **Reconstruction du périmètre commun** : pour chaque `catalog_job_type` présent dans ≥ 1 devis :
   - Présent partout → on compare directement
   - Absent chez un → estimation surcoût ajoutée à son total (flag "non inclus chez X")
3. **Score multi-critères pondéré** :
   - Prix ajusté (avec estimations des manquants) : **40%**
   - Fiabilité entreprise (statut INSEE, ancienneté, notes Google, assurance) : **25%**
   - Transparence devis (% lignes avec unités précises, échéancier détaillé, etc.) : **20%**
   - Clauses contractuelles (pas de clauses litigieuses, acompte raisonnable) : **15%**
4. **Verdict conditionnel** :
   - "Si vous voulez le moins cher : artisan X"
   - "Si vous voulez la tranquillité : artisan Y"
   - "Si vous voulez l'expertise : artisan Z"
   - "**Notre choix par défaut : artisan W** parce que [raisons synthétiques]"

### Endpoints API

- `POST /api/comparison` — créer une comparaison (body : `{ analysis_ids: [...], title? }`)
- `GET /api/comparison/[id]` — fetch la comparaison + verdict
- `PATCH /api/comparison/[id]` — éditer le titre ou ajouter/retirer une analyse
- `DELETE /api/comparison/[id]` — supprimer
- `GET /api/comparisons` — liste des comparaisons de l'utilisateur

### Routes / Pages

- `/comparateur` — landing avec bouton "Démarrer une comparaison"
- `/comparateur/nouvelle` — page de sélection des analyses (cards des analyses existantes + bouton "Upload un nouveau devis")
- `/comparateur/[id]` — page de la comparaison (vue tableau)

### Composants

- `pages/ComparateurAccueil.tsx` — landing
- `pages/ComparateurNouveau.tsx` — sélection multi-analyses
- `pages/ComparateurResult.tsx` — vue comparaison (tableau / cards)
- `app/ComparateurAccueilApp.tsx` — wrapper React (cf. pattern Islands Astro)

Réutilisations possibles :
- `ComparateurDevisModal.tsx` (cockpit GMC) — UI base de tableau N colonnes. À adapter en standalone.

---

## UX / Vue de comparaison

### Desktop — tableau N colonnes

```
┌─────────────────────────────────────────────────────────────────┐
│  Verdict (en haut, mis en avant)                                 │
│  ✓ Notre choix par défaut : Artisan A (Plomberie Martin)         │
│  > Équilibre optimal prix / fiabilité / transparence             │
│                                                                  │
│  3 leviers conditionnels :                                       │
│  · Si moins cher → B (mais attention acompte excessif)           │
│  · Si tranquillité → A                                           │
│  · Si expertise → C (mais clause à faire retirer)                │
└─────────────────────────────────────────────────────────────────┘

┌────────────────┬──────────┬──────────┬──────────┬──────────┐
│  Critère       │ Artisan A│ Artisan B│ Artisan C│ Artisan D│
├────────────────┼──────────┼──────────┼──────────┼──────────┤
│  Total HT      │ 12 450 € │ 10 800 € │ 13 200 € │ 11 600 € │
│  Verdict prix  │ Correct  │ Bas      │ Élevé    │ Correct  │
│  Acompte       │ 30%      │ 50% ⚠️   │ 30%      │ 30%      │
│  Ancienneté    │ 8 ans    │ 2 ans    │ 12 ans   │ 5 ans    │
│  Google        │ 4.7/5    │ 3.8/5    │ 4.5/5    │ 4.6/5    │
│  Assurance     │ ✓        │ ✓        │ ✓        │ ✓        │
│  Clauses       │ OK       │ OK       │ 1 abusive│ OK       │
│  Quantités     │ 100%     │ 60%      │ 100%     │ 90%      │
│  ─── Postes ──── (replié par défaut, expand) ────────────────│
│  Dépose existant│ 800 €   │ —        │ 950 €    │ 850 €    │
│  Plomberie      │ 4 200 € │ 4 500 €  │ 4 600 €  │ 4 100 €  │
│  Carrelage      │ ...     │ ...      │ ...      │ ...      │
└────────────────┴──────────┴──────────┴──────────┴──────────┘
```

### Mobile — cards swipeables

```
┌─────────────────────────┐
│  Card Artisan A         │
│  Notre choix par défaut │
│  ⭐ 4.7 · 8 ans          │
│  12 450 € HT            │
│  ► Voir détail          │
└─────────────────────────┘
     ← swipe →
┌─────────────────────────┐
│  Card Artisan B         │
│  ...                    │
└─────────────────────────┘
```

---

## Verdict conditionnel — wording type

```
✓ Notre choix par défaut : Artisan A — Plomberie Martin

  Total : 12 450 € HT (correct, dans le marché)
  → Équilibre optimal entre prix, fiabilité et transparence du devis.

  Pourquoi A et pas les autres ?
  · 8 ans d'ancienneté + 4.7/5 Google → fiabilité confirmée
  · Quantités 100% précisées → vous saurez exactement ce qui est facturé
  · Acompte raisonnable 30% → pas de risque financier
  · Aucune clause litigieuse → contrat propre

  Autres choix possibles selon votre priorité :

  💰 Si vous voulez le moins cher : Artisan B (10 800 € HT)
     ⚠️ Mais 2 ans d'ancienneté seulement + acompte 50% à la signature.
     Économie 1 650 € qui peut se transformer en problème si chantier rate.

  🏛️ Si vous voulez l'expertise maximale : Artisan C (13 200 € HT)
     12 ans d'expérience, signal le plus fort. MAIS clause "pas de
     rétractation" dans son devis → demandez-la-lui de la retirer
     avant signature (illégale en France).

  Pas de scénario où je conseille Artisan D : c'est un choix correct
  mais aucun de ses critères ne dépasse A.
```

---

## Pièges à anticiper

1. **Devis formulé en forfait global vs devis détaillés** → bandeau "Devis n°X formulé en forfait, comparaison indicative sur ce devis"
2. **Validation circulaire (extraction faussée)** → si `confiance_globale=indicatif` chez un devis, exclure ses chiffres du verdict prix mais l'afficher quand même
3. **Promesse légale** → wording "À votre place, je commencerais par négocier avec X" jamais "Signez X"
4. **Quantités fantaisistes** → warning "Surfaces déclarées (non vérifiées). Une visite avec mètre laser change tout"
5. **Devis dupliqué (le même artisan upload 2 fois)** → détection par SIRET + total HT, prompt "Est-ce une version révisée ?"

---

## Plan d'exécution

### V0 — Spec + mockup (2-3h, cette session ou prochaine)
- ✅ Spec consolidée (ce document)
- 🟡 Mockup HTML interactif (à générer dans la foulée)

### V1 — Implémentation Cas A (~3-4 jours)
- Migration SQL `comparisons` + RLS
- API routes
- Pages React (3 écrans)
- Algo verdict conditionnel
- Paywall léger (1 gratuite, illimité avec Pass)

### V2 — Cas B + amélioration (~2-3 jours)
- Périmètres partiels
- Export PDF
- Partage par lien

### V3 — Apprentissage (après 50 comparaisons)
- Ajustement pondérations
- Calibrage seuils
- Nouvelles catégories de pièges détectés

---

## Dépendances

- **Bascule extract_v2 (Phase 3.3)** — préférable AVANT V1 du comparateur, sinon on construit sur de l'extraction qui sera réécrite
- **Phase 4 Maillon 3 (verdict unitaire)** — facilite l'algo du comparateur (1 prix unitaire par poste plutôt que 1 forfait global ambigu)
- **Phase 1.7 (recalibrage catalogue)** — fourchettes catalogue bien calibrées pour le score prix du comparateur

**Reco** : ne pas attaquer V1 du comparateur avant que Phase 3.3 soit basculée. Sinon on devra réécrire la moitié du code après. Estimation Phase 3.3 = mi-juillet 2026 si shadow run propre la semaine prochaine.
