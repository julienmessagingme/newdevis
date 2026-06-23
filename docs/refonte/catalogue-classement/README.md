# Catalogue market_prices — classement métier × nature_prix

**Statut** : 🟡 Input de Phase 1 de la refonte (voir [`../PLAN.md`](../PLAN.md))
**Date pivot** : 2026-06-23

---

## Ce que ce dossier EST aujourd'hui

Les YAML peinture / carrelage ne sont **plus** un système de matching déterministe parallèle au matcher vectoriel.

Ils sont la **grille de classement métier × nature_prix** qui sera utilisée en **Phase 1** pour ranger les 911 entrées de `market_prices` :

- **Métier** : peinture, carrelage, plomberie, électricité, maçonnerie, menuiserie, placo/isolation, toiture, démolition, logistique
- **Nature_prix** : `pose_seule` | `fourniture_pose` | `fourniture_seule`

Cette grille manque aujourd'hui — **57 % des 911 entrées du catalogue n'ont aucun métier identifiable** (le champ "categorie" vaut "travaux" pour tout).

## Ce que ce dossier N'EST PLUS

❌ **Pas** un référentiel de règles déterministes qui remplace le matcher vectoriel
❌ **Pas** une taxonomie hiérarchique parallèle à ajouter au pipeline d'analyse

→ Ce qui était proposé comme "Piste B" autonome est **réabsorbé** comme phase d'audit catalogue.

---

## Comment utiliser cette grille en Phase 1

1. **Audit** : lancer les 3 SQL de [`AUDIT_CATALOGUE.md`](AUDIT_CATALOGUE.md) sur la prod (lecture seule, sans risque)
2. **Migration colonnes** : ajouter `metier` (text) + `nature_prix` (enum) à `market_prices`
3. **Classement automatique** : heuristique de pré-classement par mots-clés (cf. SQL 1 dans AUDIT_CATALOGUE.md)
4. **Validation Julien** : arbitrer les ambigus, valider les cas durs
5. **YAML peinture / carrelage = référence terrain** : les fourchettes et conventions composites des YAML servent à **valider** que le classement + les fourchettes du catalogue sont cohérents avec la réalité métier (deux couches = ×2 prix, fourniture seule = ¼ du fourniture+pose, etc.)
6. **Recalibrage** : confronter les fourchettes catalogue aux prix réels observés dans `analyses` (94 % des 1200 devis-postes ont un prix unitaire recalculable)
7. **Régénération embeddings** : obligatoire après modification des libellés

---

## Fichiers

| Fichier | Rôle |
|---|---|
| [`AUDIT_CATALOGUE.md`](AUDIT_CATALOGUE.md) | 3 SQL d'audit du catalogue actuel — à lancer pour démarrer Phase 1 |
| [`peinture.yaml`](peinture.yaml) | Référence terrain peinture : sous-types, fourchettes, conventions composites (multiplicateur N couches, etc.) |
| [`carrelage.yaml`](carrelage.yaml) | Référence terrain carrelage : 3 variantes opératoires, fourchettes par variante × sous-type × gamme |

Familles à ajouter par la suite (au fil de la Phase 1) : plomberie, électricité, maçonnerie, menuiserie.

---

## Anti-régression

Tant que la Phase 1 n'est pas livrée + validée :
- Ne **PAS** créer de fichier `src/lib/analyse/taxonomy/peinture.ts` ou équivalent
- Ne **PAS** brancher de `TAXONOMY_MATCHER_ENABLED` flag dans le pipeline
- Ne **PAS** créer de table `taxonomy_*` en DB

La Phase 1 ne modifie que :
- Le catalogue `market_prices` (ajout colonnes, classement, recalibrage)
- Les embeddings (régénération après modif libellés)

C'est tout.
