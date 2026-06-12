# Plan Phase 2 — Taxonomie hiérarchique + politique anti-hallucination

**Statut** : 🟢 PLAN DORMANT — non démarré. À déclencher quand l'audit log de la Phase 1 aura mûri 2 semaines (~3000 entrées attendues).

**Auteur** : Brief utilisateur 2026-06-09 + analyse critique pipeline V3.5.x.

**Précondition** : Phase 1 (V3.5.11) livrée — `match_audit_log` actif, classification `low_confidence_match` opérationnelle.

---

## 1 — Pourquoi cette phase

Phase 1 a corrigé le symptôme visible des faux positifs sur des matchs similarity 0.70-0.85 via la classification `low_confidence_match` + le badge UI "Comparaison incertaine". Mais 3 problèmes restent ouverts :

1. **Catalogue plat** : les 900+ entrées `market_prices` sont indexées sans hiérarchie. Une requête vectorielle peut traverser une famille sémantique sans le savoir (cas "Logistique" → "Échafaudage", V3.5.9 bug 4). Les gardes lexicales V3.5.9 mitigent mais ne résolvent pas structurellement.

2. **Pas de famille déterministe** : le matcher n'extrait pas explicitement la famille de travaux (carrelage / plomberie / élec / etc.) avant la similarity search. Sur une ligne ambiguë, le top-1 peut tomber dans la mauvaise famille.

3. **Pas de feedback loop** : les 280 devis réels du dataset ne sont pas exploités comme gold standard. La calibration des seuils CONFIDENCE_HIGH/MEDIUM se fait à dire d'expert.

La Phase 2 traite ces 3 axes : **catalogue hiérarchique + extraction famille déterministe + dataset gold standard**.

---

## 2 — Architecture cible

### 2.1 Schéma DB enrichi

`market_prices` gagne 2 colonnes :

```sql
ALTER TABLE public.market_prices
  ADD COLUMN family   TEXT,     -- ex: "Carrelage", "Plomberie", "Électricité"
  ADD COLUMN subtype  TEXT;     -- ex: "Sol intérieur", "Mural", "Évacuation"

CREATE INDEX market_prices_family_idx ON public.market_prices (family);
CREATE INDEX market_prices_family_subtype_idx
  ON public.market_prices (family, subtype);
```

Taxonomie cible — **3 niveaux** comme dans le brief :

```
Famille                  Sous-type                    Job types
─────────────────────────────────────────────────────────────────
Carrelage                Sol intérieur                pose_carrelage_sol_60x60
                                                      pose_carrelage_sol_30x30
                                                      pose_carrelage_sol_mosaique
                         Mural                        pose_faience_sdb
                                                      pose_faience_cuisine
                         Fourniture seule             fourniture_carrelage_sol
                                                      fourniture_faience_mural
Plomberie                Sanitaire                    pose_wc_suspendu
                                                      pose_lavabo
                         Chauffe-eau                  pose_chauffe_eau_complet
                                                      groupe_securite_chauffe_eau
                         ...
Électricité              ...
...
```

### 2.2 Pipeline modifié

```
┌──────────────────┐    ┌──────────────────────┐
│ Ligne devis      │ -> │ Gemini extract       │
│ (description     │    │ + famille candidate  │
│  + qty + unit)   │    │ (déterministe sur 12 │
└──────────────────┘    │  familles connues)   │
                       └─────────┬────────────┘
                                 │
                       ┌─────────▼────────────┐
                       │ Vectorial similarity │
                       │ search RESTREINTE    │
                       │ à WHERE family = ?   │
                       └─────────┬────────────┘
                                 │
                       ┌─────────▼────────────┐
                       │ Gardes V3.5.9        │
                       │ (overlap lexical,    │
                       │  antonymes, ratio)   │
                       └─────────┬────────────┘
                                 │
                       ┌─────────▼────────────┐
                       │ Classification :     │
                       │ high / medium / low  │
                       │ / no_match           │
                       └──────────────────────┘
```

Le filtre `WHERE family = ?` divise le candidate set de ~900 → ~50-200, ce qui :
- Réduit drastiquement les faux positifs cross-famille
- Accélère le RPC (index family activé)
- Permet de générer un `no_match` propre si la famille extraite n'est pas dans le catalogue (signal fort de hors-scope ou poste très spécifique)

### 2.3 Garde famille échec

Si Gemini ne peut pas extraire de famille (ambiguïté), pipeline degrade gracefully :
- Mode A — recherche sans filtre family (= comportement V3.5.x actuel)
- Mode B — utilise la classification cosine sur le label (helper) pour deviner la famille
- Mode C — `no_match` direct si on veut être strict

Mon choix : **Mode B** (pragmatique, ne casse pas la couverture).

---

## 3 — Découpage en sous-phases

### Phase 2.A — Audit catalogue + construction taxonomie (3-4 jours)

Objectif : produire un YAML/JSON de la taxonomie 3 niveaux validé manuellement.

1. **Export catalogue** : `SELECT * FROM market_prices ORDER BY job_type` → CSV 900 lignes
2. **Clustering auto** : utiliser les embeddings existants pour clusteriser via k-means (k=12-15 familles) + sub-clustering par famille (k=4-8 sous-types)
3. **Proposition initiale** : script Node qui produit un YAML avec chaque cluster nommé + suggestions de label
4. **Validation manuelle** : session 4-6h avec utilisateur pour valider/renommer/regrouper. Output : `docs/data/market_taxonomy_v1.yml`
5. **Critère d'acceptation** : 100% des 900 entrées catalogue assignées à exactement 1 famille × 1 sous-type, aucun "Autre" résiduel.

### Phase 2.B — Migration DB + seed taxonomie (1 jour)

1. Migration SQL : ajout colonnes `family`, `subtype`, index
2. Script Node `scripts/seed_market_taxonomy.mjs` qui lit le YAML validé et UPDATE chaque row
3. Vérification : aucune row avec `family IS NULL`
4. Index pgvector reste inchangé, ajout d'un index B-tree sur `(family, subtype)`

### Phase 2.C — Refonte prompt extract.ts (1-2 jours)

1. Nouveau champ `family` dans le prompt extraction Gemini
2. Liste fermée des 12-15 familles connues (whitelist stricte pour éviter hallucination)
3. Rule : "Si tu ne peux pas déterminer la famille avec certitude, mets `null`"
4. Validation côté serveur : si family ∉ whitelist → null + log warning
5. Champ propagé jusqu'au matcher via `WorkItemFull.family?`

### Phase 2.D — Refonte matcher vectoriel (2-3 jours)

1. Nouvelle RPC `search_market_prices_v3(query_embedding, family_filter, threshold, count)`
2. Si `family_filter` fourni : `WHERE family = family_filter` avant l'ORDER BY similarity
3. Mode dégradé : si family_filter=null → comportement V3.5.x actuel (full catalog)
4. Si family_filter fourni mais top_similarity < MEDIUM → `no_match` direct (pas de fallback hors-famille pour ne pas annuler le bénéfice)
5. Garde "famille extraite mais pas dans catalogue" → `no_match` + log spécifique

### Phase 2.E — Output JSON structuré (1 jour)

Aligné sur le brief utilisateur :
```json
{
  "ligne": "Pose de carrelage sol 20 m²",
  "famille": "Carrelage",
  "sous_type": "Sol intérieur",
  "job_type": "pose_carrelage_sol_60x60",
  "anomalie": "Prix unitaire 35€/m² > 28€/m² moyenne marché (+25%)",
  "score_confiance": 0.92,
  "rejected_reasons": []
}
```

Exposé dans :
- `VectorialJobTypePriceResult.vectorial` (déjà existant, juste enrichi)
- API `/api/analyse/[id]/conclusion` (nouveau champ `structured_output[]`)
- UI `VectorialPriceList` : tooltip "Voir l'analyse structurée" qui affiche le JSON

### Phase 2.F — A/B test sur 30 devis réels (1 semaine)

1. Sélectionner 30 devis du backlog `match_audit_log` couvrant les 12 familles
2. Re-analyser chacun en parallèle V3.5.11 (ancien) vs V3.6 (nouveau) — flag `ENGINE_VERSION=3.6`
3. Mesurer 4 KPI :
   - Taux de `no_match` (cible : ≤ 25%)
   - Taux de `low_confidence_match` (cible : ≤ 10%)
   - Faux positifs visibles (manuel) sur 5 devis témoins
   - Latence p95 du pipeline

4. Gate de release : tous les KPI dans la cible ET aucun faux positif nouveau détecté.

### Phase 2.G — Rollout + monitoring (3 jours)

1. Flag `ENGINE_VERSION=3.6` activable côté env (rollback express possible)
2. Shadow run 48h en prod (V3.5.11 actif côté user, V3.6 calcule en parallèle et logue)
3. Comparaison des audit logs entre versions
4. Bascule `ENGINE_VERSION=3.6` côté env si OK
5. Monitoring : dashboard admin avec compteur quotidien des `confidence` par tier

**Total** : ~12-15 jours-homme.

---

## 4 — Risques & mitigations

| Risque | Mitigation |
|---|---|
| Taxonomie incomplète (poste très spécifique sans famille) | Famille "Autre" autorisée comme fallback. Garde : `IF family = "Autre" → matcher mode actuel sans filtre` |
| Gemini halluciné une famille pour une ligne ambiguë | Whitelist stricte + validation côté serveur. Si mauvaise famille détectée → no_match plus large mais pas faux positif |
| Régression latence (ajout extraction famille) | Famille extraite dans le même call Gemini que les travaux (pas de round-trip supplémentaire) |
| Catalogue désynchronisé entre Phase 2.A et prod (autres commits) | Lock-out modification catalogue pendant la phase 2.A. Reprise sync via script idempotent |
| Casse rétrocompat des analyses existantes | Bump `ENGINE_VERSION` invalide cache mais ne casse pas DB. Code legacy V3.5.x conservé sous flag pour rollback |

---

## 5 — Critères d'acceptation Phase 2

Avant de déclarer la Phase 2 livrée :

- [ ] 100% des 900 entrées catalogue ont une famille + sous-type assignés
- [ ] Whitelist des 12-15 familles documentée dans `docs/data/market_taxonomy_v1.yml`
- [ ] RPC `search_market_prices_v3` testée unitairement (15 cas couvrant chaque famille + cas dégradé)
- [ ] A/B test 30 devis : 0 nouveau faux positif détecté manuellement
- [ ] Output JSON structuré exposé dans l'API + visible dans l'UI (au minimum en tooltip debug)
- [ ] Dashboard admin avec distribution confidence par jour (issue de `match_audit_log`)
- [ ] Rollback ENGINE_VERSION=3.5.11 testé en env staging
- [ ] Documentation `CLAUDE.md` mise à jour avec les nouveaux invariants ACTIFS

---

## 6 — Quand attaquer ?

**Conditions de démarrage** :

1. `match_audit_log` contient ≥ 2000 entrées (= ~2-3 semaines de prod)
2. Distribution observée :
   - high ≥ 50% (signal que le catalogue couvre bien les cas)
   - low + no_match ≤ 35% (sinon Phase 2.A doit d'abord enrichir le catalogue)
3. ≥ 5 faux positifs identifiés par l'utilisateur sur des cas que Phase 1 n'a pas résolus
4. Décision business : OK pour bloquer 2-3 semaines de roadmap sur la qualité matching

**Si moins de 5 faux positifs en 3 semaines → ne pas démarrer Phase 2**, calibrer juste les seuils via les data audit.

---

## 7 — Liens

- Phase 1 livraison : commit `<à compléter>` (V3.5.11)
- Brief utilisateur original : conversation 2026-06-09
- Code matcher actuel : `supabase/functions/analyze-quote/market-matcher-vectorial.ts`
- Audit log : `supabase/migrations/20260609_001_match_audit_log.sql`
- Historique versions : [`HISTORY.md`](../../HISTORY.md)
