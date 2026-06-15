# Audit du catalogue `market_prices` actuel — Pré-implémentation Piste B

**Objectif** : confronter les specs YAML (peinture + carrelage) au contenu réel du catalogue actuel `market_prices` (~900 entrées) pour :
1. Détecter les entrées qui ne rentrent dans aucun sous-type → on les ajoute aux specs
2. Identifier les job_types qui chevauchent plusieurs variantes (source de hallucination)
3. Calibrer les fourchettes prix proposées vs les vraies données catalogue

**Lance ces 3 SQL dans Supabase Dashboard SQL Editor et envoie-moi les résultats.** Je consoliderai dans les YAML avant l'implémentation.

---

## SQL 1 — Inventaire familles candidates dans le catalogue

```sql
-- Compte les job_types par "famille" détectée via mots-clés du label
WITH classified AS (
  SELECT
    id,
    job_type,
    label,
    unit,
    price_min_unit_ht,
    price_avg_unit_ht,
    price_max_unit_ht,
    CASE
      WHEN label ~* '\m(peinture|enduit|ratissage|lessivage|sous[- ]couche)' THEN 'peinture'
      WHEN label ~* '\m(carrelage|faïence|grès|mosaïque|plinthe.*carrel)' THEN 'carrelage'
      WHEN label ~* '\m(plomberie|évier|wc|robinet|mitigeur|sanitaire|chauffe[- ]eau|baignoire|douche|lavabo)' THEN 'plomberie'
      WHEN label ~* '\m(électric|electric|tableau|prise|interrupteur|disjoncteur|câble|gaine)' THEN 'electricite'
      WHEN label ~* '\m(maçonnerie|maconnerie|béton|brique|parpaing|dalle|chape|gros[- ]œuvre|gros[- ]oeuvre|fondation)' THEN 'maconnerie'
      WHEN label ~* '\m(menuiserie|porte|fenêtre|baie|volet|escalier)' THEN 'menuiserie'
      WHEN label ~* '\m(placo|ba\s*13|isolation|cloison|laine|pare[- ]vapeur)' THEN 'placo_isolation'
      WHEN label ~* '\m(toiture|couverture|tuile|ardoise|zinguerie|gouttière|chevron)' THEN 'toiture'
      WHEN label ~* '\m(démolition|demolition|dépose|depose|évacuation|evacuation|gravats)' THEN 'demolition'
      WHEN label ~* '\m(logistique|livraison|nettoyage|mise.*disposition|protection)' THEN 'logistique'
      ELSE 'autre'
    END AS famille_candidate
  FROM public.market_prices
)
SELECT
  famille_candidate,
  COUNT(*) AS nb_entrees,
  ROUND(AVG(price_avg_unit_ht)::numeric, 2) AS prix_moyen_unitaire,
  COUNT(DISTINCT unit) AS nb_unites_distinctes,
  STRING_AGG(DISTINCT unit, ', ' ORDER BY unit) AS unites_distinctes
FROM classified
GROUP BY famille_candidate
ORDER BY nb_entrees DESC;
```

Ce qui m'intéresse dans les résultats :
- Le **volume par famille** (confirmation des % du README)
- La **diversité d'unités** par famille (m² uniquement ? aussi ml, u, forfait ?)
- Le **prix unitaire moyen** par famille (calibration grossière de mes fourchettes)

---

## SQL 2 — Détail du catalogue peinture

```sql
SELECT
  job_type,
  label,
  unit,
  price_min_unit_ht || ' - ' || price_max_unit_ht AS fourchette_unitaire,
  COALESCE(fixed_min_ht::text, '0') || ' - ' || COALESCE(fixed_max_ht::text, '0') AS fourchette_forfait
FROM public.market_prices
WHERE label ~* '\m(peinture|enduit|ratissage|lessivage|sous[- ]couche|toile.*verre|fibre.*verre|papier.*peint)'
ORDER BY label;
```

Avec ça, je vais :
- Voir si mes 5 sous-types (murs_interieurs / plafonds / murs_plus_plafonds / boiseries / facade_exterieure / preparation_lourde) couvrent toutes les entrées
- Identifier si des entrées orphelines existent (ex: "Peinture sol époxy", "Peinture anti-humidité", etc. cf. question 6 du YAML peinture)
- Ajuster les fourchettes prix si elles divergent trop des entrées catalogue

---

## SQL 3 — Détail du catalogue carrelage

```sql
SELECT
  job_type,
  label,
  unit,
  price_min_unit_ht || ' - ' || price_max_unit_ht AS fourchette_unitaire,
  COALESCE(fixed_min_ht::text, '0') || ' - ' || COALESCE(fixed_max_ht::text, '0') AS fourchette_forfait
FROM public.market_prices
WHERE label ~* '\m(carrelage|faïence|faience|grès|gres|mosaïque|mosaique|plinthe.*carrel|nez.*marche)'
ORDER BY
  CASE
    WHEN label ~* 'fourniture' AND label !~* 'pos' THEN 1
    WHEN label ~* 'pos' AND (label ~* 'hors\s+fourniture' OR label !~* 'fourniture') THEN 2
    WHEN label ~* 'fournit.*pos|fourniture\s+(et|\+)\s+pos' THEN 3
    ELSE 9
  END,
  label;
```

Ce SQL trie les entrées dans l'ordre des 3 variantes opératoires de ma taxonomie (fourniture seule / pose seule / fourniture+pose / autre). Si l'ordre est cohérent et complet, ma spec carrelage tient. Sinon je vois quelles variantes sont mal couvertes.

---

## Comment me partager les résultats

Le plus simple : **Export → CSV** depuis Supabase (en haut à droite de la table Results), puis tu me partages le CSV.

OU bien (plus rapide) :
- Pour SQL 1 → screenshot de la table de 10 lignes max
- Pour SQL 2 et 3 → CSV (volume plus grand)

Une fois reçu, je révise les 2 YAMLs en fonction du vrai catalogue, on les valide ensemble, et on attaque l'implémentation `src/lib/analyse/taxonomy/peinture.ts` + `carrelage.ts` la semaine prochaine.
