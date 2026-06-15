# Taxonomie métier — Piste B anti-hallucination

**Statut** : 🟡 Spec en relecture (validation user requise avant implémentation).

**Date** : 2026-06-15  
**ENGINE_VERSION cible** : `3.6.0` (refonte majeure du pipeline matching)

---

## Pourquoi cette refonte

14 versions de patches anti-hallucination V3.4.x → V3.5.x ont colmaté des bugs spécifiques sans résoudre la cause architecturale : **on essaie de faire du matching sémantique générique sur un domaine (BTP) qui a des conventions métier ultra-spécifiques** que ni Gemini ni les embeddings vectoriels ne capturent intrinsèquement.

Exemples vus en prod :
- "Application 2 couches sur 138 m²" → l'IA somme 276 m² → comparé au prix marché /m² → +500% absurde
- "Fourniture de carrelage à 25€/m² à l'achat" → matché au catalogue "Pose carrelage (hors fourniture)" → comparaison invalide
- "Logistique livraison nettoyage" → matché à "Échafaudage location +220€" → anomalie hallucinée
- "Enduit ratissage 25€/m²" → verdict dit "45€/m² → +500€" alors que le devis affiche 25€

**Le problème** : ces conventions sont stables et limitées (50-200 patterns dans tout le BTP français), mais elles sont invisibles au matching cosine sur des embeddings sémantiques.

**La solution** : un **référentiel métier explicite** codifié, qui décrit pour chaque famille de travaux :
1. Les **sous-types** distincts (sol vs mural, intérieur vs extérieur, etc.)
2. Les **variantes opératoires** (fourniture seule vs pose seule vs fourniture+pose)
3. Les **conventions composites** (multiplicateurs de couches, ajustements préparation, etc.)
4. Les **fourchettes de prix** validées par sous-type × variante × convention

Le pipeline devient :

```
┌──────────────────┐      ┌───────────────────────┐
│ Ligne devis      │ ───→ │ Gemini classifie la   │
│ (description)    │      │ FAMILLE (whitelist)   │
└──────────────────┘      └───────────┬───────────┘
                                      │
                          ┌───────────▼────────────┐
                          │ Règles déterministes   │
                          │ codées de la famille : │
                          │ - détection sous-type  │
                          │ - détection variantes  │
                          │ - extraction multipl.  │
                          │ - comparaison prix     │
                          └───────────┬────────────┘
                                      │
                          ┌───────────▼────────────┐
                          │ Verdict + classification│
                          │ déterministe           │
                          └────────────────────────┘
```

## Avantages vs matching vectoriel

| Critère | Matching vectoriel V3.5 | Taxonomie métier V3.6 |
|---|---|---|
| Reproductibilité | ❌ Cosine fluctue selon embedding | ✅ Code déterministe à 100% |
| Debuggabilité | ❌ "Pourquoi 0.74 et pas 0.81 ?" opaque | ✅ Chaque règle est lisible et corrigeable |
| Conventions BTP | ❌ Invisibles au matcher | ✅ Codifiées explicitement |
| Composites (couches, préparation) | ❌ Confond multiplicateur et quantité | ✅ Règles dédiées |
| Coût | ❌ Embeddings + similarity search par ligne | ✅ Gemini classifie famille (1 token) + code local |
| Évolution | ❌ Re-embedder le catalogue à chaque modif | ✅ Modifier le YAML, redéployer |

## Architecture des fichiers

```
docs/taxonomy/
├── README.md                  ← ce fichier (vue d'ensemble)
├── peinture.yaml              ← spec famille peinture (à valider)
├── carrelage.yaml             ← spec famille carrelage (à valider)
├── plomberie.yaml             ← (semaine 3)
├── electricite.yaml           ← (semaine 4)
├── maconnerie.yaml            ← (semaine 5)
└── menuiserie.yaml            ← (semaine 6)
```

Une fois validés, ces YAMLs alimentent :
- `src/lib/analyse/taxonomy/loader.ts` — charge les YAMLs au build
- `src/lib/analyse/taxonomy/<famille>.ts` — module déterministe par famille
- `supabase/functions/analyze-quote/taxonomy-matcher.ts` — pipeline serveur

## Liste des familles cibles (V3.6 final)

| # | Famille | Volume devis observé | Priorité |
|---|---|---|---|
| 1 | **Peinture** | ~25% des devis | 🔴 P0 (cette session) |
| 2 | **Carrelage** | ~20% des devis | 🔴 P0 (cette session) |
| 3 | Plomberie | ~15% des devis | 🟠 P1 (semaine 3) |
| 4 | Électricité | ~12% des devis | 🟠 P1 (semaine 4) |
| 5 | Maçonnerie | ~10% des devis | 🟡 P2 (semaine 5) |
| 6 | Menuiserie | ~8% des devis | 🟡 P2 (semaine 6) |
| 7 | Placo / Isolation | ~6% des devis | 🟡 P2 (semaine 7) |
| 8 | Toiture / Couverture | ~3% des devis | 🟢 P3 (plus tard) |
| 9 | Démolition | (souvent dans d'autres familles) | 🟢 P3 |
| 10 | Logistique / Préparation | (souvent dans d'autres familles) | 🟢 P3 |
| 11 | Autre (fallback) | (5-10% inclassables) | — Mode dégradé V3.5 |

**Top 6 = ~90% du volume.** Après ça, le retour sur investissement diminue (peu de devis touchés, beaucoup de cas particuliers).

## Workflow de validation user

Pour chaque famille (peinture + carrelage cette session) :

1. **Tu relis le YAML proposé** (15-30 min/famille)
2. **Tu m'envoies tes corrections** :
   - Sous-types manquants / non pertinents
   - Variantes opératoires absentes
   - Fourchettes prix à ajuster (tu connais ton catalogue mieux que moi)
   - Conventions composites manquantes ("avec dépose ancien", "en hauteur > 3m", etc.)
3. **J'intègre tes corrections** dans le YAML
4. **Tu re-valides** le YAML final
5. → **Implémentation** la semaine d'après

**Effort estimé côté toi** : 30-45 min par famille (relecture + corrections). Total ~3-4h pour les 6 familles top.

## Critères d'acceptation pour passer à l'implémentation

Une famille est "prête à coder" quand :
- [x] Sous-types listés et exclusifs (pas de chevauchement)
- [x] Variantes opératoires couvrent ≥ 95% des descriptions observées en prod
- [x] Fourchettes prix validées par toi (référentiel terrain)
- [x] Au moins 5 patterns de descriptions BTP testés contre la taxonomie
- [x] Conventions composites identifiées et règles d'ajustement écrites

## Rollback plan

V3.6 sera déployée derrière un flag env `TAXONOMY_MATCHER_ENABLED` :
- `false` (défaut) → comportement V3.5.x vectoriel actuel inchangé
- `true` → bascule sur le nouveau pipeline taxonomie

Tu peux désactiver instantanément si un bug critique apparaît, sans redéploiement.

## Calendrier prévisionnel

| Semaine | Livrable |
|---|---|
| **S0 (cette session)** | Specs YAML peinture + carrelage à valider |
| S1 | Tes corrections sur peinture + carrelage |
| S2 | Implémentation `src/lib/analyse/taxonomy/peinture.ts` + tests |
| S3 | Implémentation `carrelage.ts` + tests + intégration pipeline |
| S4 | A/B test 30 devis (flag SHADOW) |
| S5 | Rollout `TAXONOMY_MATCHER_ENABLED=true` + spec plomberie |
| S6+ | Itérations sur les 4 familles restantes |

**Total : 6-8 semaines pour les 6 familles top.** Pendant ce temps, la Piste C (revue humaine V3.5.16) protège la prod des hallucinations résiduelles.
