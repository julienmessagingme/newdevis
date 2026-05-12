# Test Pack V3.6 — Régression (PHASE 5)

À exécuter manuellement après déploiement de l'edge function en SHADOW MODE
ou V36 ONLY. Les résultats sont à vérifier dans Supabase Functions Logs
(filtrer par `[V36_MATCH]` et `[V36_SHADOW]`).

## Setup

```bash
# Mode SHADOW (défaut — V3.5 visible, V3.6 silencieuse)
# → ne rien faire côté env, c'est la valeur par défaut

# Mode V3.6 ONLY (après validation shadow)
# Supabase Dashboard → Functions → analyze-quote → Settings → Env vars :
MARKET_MATCHER_V36=true

# Rollback rapide V3.5 ONLY
MARKET_MATCHER_V36=false
```

## Cas 1 — Thouret Elec (devis chambre, jamais cuisine)

**Fichier** : `devis elec.pdf` (Desktop)

**Signature V3.6 attendue** :
```json
{
  "domain": "electricite",
  "subcategory": "raccordement",
  "room": null,
  "unit": "u",
  "keywords": ["prise","disjoncteur","batibox","moulure","fil"]
}
```

**Comportement attendu** :
- ❌ Plus aucun match avec `raccordements_electricite_cuisine` (room mismatch reject)
- ❌ Plus aucune mention de "cuisine" dans le label affiché
- ✅ Si `raccordements_electricite_generic` existe → match (strategy=exact ou indicative)
- ✅ Sinon → `match_strategy=rejected_room_mismatch` ou `no_match` → comparaison indicative honnête

**Log [V36_MATCH] attendu** :
```
[V36_MATCH] "Travaux électricité" EXACT → raccordements_electricite_generique (score=80+/100, ...) | sig: domain=electricite sub=raccordement room=null unit=u
```
OU
```
[V36_MATCH] "Travaux électricité" REJECTED_ROOM_MISMATCH | reason: 6 candidates rejected by room mismatch (sample: catalog room_specific (room="cuisine") but signature.room=null)
```

---

## Cas 2 — Kern Terrassement (mix carrelage + chape + primaire + IP14)

**Fichier** : `devis kern terrassement.pdf` (Desktop)

**Signatures V3.6 attendues** : 3 ou 4 groupes distincts (exclusivité de domaine V3.5+) :

1. **Chape ciment** (escalier + terrasse) :
   ```json
   { "domain": "chape", "subcategory": "ciment", "room": null, "unit": "m2" }
   ```

2. **Primaire d'accrochage** (escalier + terrasse) :
   ```json
   { "domain": "primaire", "subcategory": "accrochage", "room": null, "unit": "m2" }
   ```

3. **Carrelage fourniture + pose** (dalle céramique + coupe) :
   ```json
   { "domain": "carrelage", "subcategory": "fourniture_pose", "room": null, "unit": "m2" }
   ```

4. **Acier IP14** (optionnel — si pas matché → NO_MATCH honnête) :
   ```json
   { "domain": "acier", "subcategory": "ip14", "room": null, "unit": "u" }
   ```

5. **Pavage + terrassement** (cour 65m²) :
   ```json
   { "domain": "pavage", "subcategory": "fourniture_pose", "room": null, "unit": "m2" }
   ```

**Comportement attendu** :
- ❌ Plus de groupe mixte unique "Carrelage" avec tout dedans
- ❌ Plus d'anomalie aberrante "carrelage à 327€/m²"
- ✅ Chaque groupe matche son catalogue propre, avec un score ≥ 60
- ✅ Si acier pas au catalogue → NO_MATCH honnête (pas de comparaison)

---

## Cas 3 — Zitelec Chauffage Clim (gainable multi-zones)

**Fichier** : `devis sci parelle chauffage.pdf` (Desktop)

**Signatures V3.6 attendues** :

Plusieurs groupes selon le mapping cuisine/salon/chambre/bureau mentionnés dans le devis (les descriptions du devis Zitelec mentionnent les pièces dans les bocs gainable étage 1/2 etc.) :

```json
{ "domain": "climatisation", "subcategory": "gainable", "room": "chambre", "unit": "lot" }
{ "domain": "climatisation", "subcategory": "gainable", "room": "bureau",  "unit": "lot" }
{ "domain": "climatisation", "subcategory": "gainable", "room": "salon",   "unit": "lot" }
```

**Comportement attendu** :
- ✅ Si catalogue contient `clim_gainable_chambre` etc. → match exact par room
- ✅ Sinon fallback sur `clim_gainable_generique` → match strategy=indicative ou exact
- ❌ Plus jamais de match avec un room "inventé" (cuisine si pas dans descriptions)

---

## Cas 4 — Multi-devis (devis SALLEM Ibrahim, multi-artisans)

**Fichier** : `multi devis, plusieurs entreprises.pdf` (Desktop)

**Comportement attendu** :
- ✅ Segmentation des devis intacte (chaque artisan = 1 segment)
- ✅ Chaque segment analysé indépendamment avec V3.6
- ✅ Signature par domaine cohérente (terrassement, maçonnerie, charpente, couverture, etc.)
- ✅ Verdict global agrégé inchangé en logique

---

## Cas 5 — Cas bruités ("divers fournitures", "petit matériel", "forfait")

**Devis fictif** : un poste "Divers fournitures - 250€" ou "Petit matériel - 80€".

**Signature V3.6 attendue** :
```json
{ "domain": "autre", "subcategory": "fournitures", "room": null, "unit": "forfait" }
```

**Comportement attendu** :
- ❌ JAMAIS un faux match agressif sur un domaine arbitraire
- ✅ `match_strategy=no_match` ou `fuzzy_fallback` avec confidence faible
- ✅ Comparaison indicative uniquement (pas d'anomalie générée downstream)

---

## Cas 6 — Cas room explicite ("prise cuisine", "plomberie salle de bain")

**Devis fictif** :
- "Installation 5 prises CUISINE - 150€"
- "Plomberie salle de bain : douche italienne + lavabo - 2 500€"

**Signatures V3.6 attendues** :

1. ```json
   { "domain": "electricite", "subcategory": "raccordement", "room": "cuisine", "unit": "u" }
   ```

2. ```json
   { "domain": "plomberie", "subcategory": "sanitaire", "room": "salle_de_bain", "unit": "forfait" }
   ```

**Comportement attendu** :
- ✅ Match exact avec un job_type room_specific correspondant à la pièce
- ✅ Score breakdown : domain=40 + subcategory=30 + room=20 + unit=10 = 100 (ou très proche)
- ✅ Si pas de catalogue room_specific cuisine → fallback generic + warning

---

## Comment vérifier après deploy

### Mode SHADOW (recommandé en premier)

1. Re-uploader chaque devis test
2. Aller dans Supabase Dashboard → Functions → analyze-quote → Logs
3. Filtrer par `[V36_SHADOW]` → voir les JSON structurés
4. Vérifier que `same_match` est cohérent avec les attentes
5. Vérifier qu'aucun `signature_invalid: true` n'apparaît

### Mode V3.6 ONLY (après validation shadow)

1. Set `MARKET_MATCHER_V36=true` dans env Supabase Functions
2. Re-uploader chaque devis test
3. Vérifier dans le rapport généré (UI VerifierMonDevis) :
   - Pas de mention "cuisine" sur Thouret Elec
   - Groupes séparés sur Kern (chape/carrelage/etc.)
   - KPI répartition cohérents
4. Filtrer logs par `[V36_MATCH]` → voir les détails de chaque décision

### Rollback en cas de problème

```
MARKET_MATCHER_V36=false
```

Rollback INSTANTANÉ (pas besoin de redéploiement edge function).

---

## KPI à vérifier (PHASE 6)

Cf. `scripts/kpi-shadow-v36.sql` pour les requêtes complètes. Seuils GO :

| KPI | Seuil GO |
|---|---|
| coverage_match_rate | > 80% |
| no_match_rate | < 20% |
| v36_regression_pct | < 15% |
| invalid_signature_pct | < 5% |

Si tous ces seuils sont atteints sur 100+ observations → **GO V3.6 prod**.
Sinon → rollback ou hardening additionnel.
