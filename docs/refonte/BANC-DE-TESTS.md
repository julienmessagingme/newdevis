# Banc de tests Phase 3 — 15 devis canoniques

**Statut** : 🟡 Spec V1 — à compléter au fur et à mesure des PDFs récupérés
**Date** : 2026-06-24

---

## But

Le PDF de refonte dit :
> "Chaque évolution passe le filet des cas validés avant la prod ; activation par drapeau, repli immédiat."

Ce banc de tests est le **filet de validation** pour Phase 3 (refonte `extract.ts`). Chaque PDF est joué avec :
- l'**ancien pipeline** (`extract.ts` v1, prod actuelle)
- le **nouveau pipeline** (`extract_v2.ts` en cours de construction)

On compare les sorties JSON. Le nouveau pipeline ne passe en prod (Phase 3.3) que quand :
1. Les 15 cas attendus produisent le résultat attendu
2. Le shadow run sur ~100 analyses prod ne montre pas de régression structurelle

---

## Organisation des fichiers

Dans `docs/refonte/banc-de-tests/` (à créer progressivement) :

```
docs/refonte/banc-de-tests/
├── README.md                              ← ce fichier (lien)
├── cas-01-cuisine-simple/
│   ├── source.pdf                          ← le PDF original (taillé léger si possible)
│   ├── attendu.json                        ← ExtractedData attendu après Phase 3 v2
│   ├── notes.md                            ← contexte, particularités
│   └── verdict-attendu.md                  ← verdict que doit produire le pipeline complet (Phase 4)
├── cas-02-tva-melangee/
│   └── ...
└── ...
```

Chaque cas est versionné dans git (sauf les PDF qui peuvent être lourds → on les met sous `.gitignore` + on documente la source dans `notes.md`).

---

## Les 15 cas canoniques

### 🟢 Facile (5) — la baseline

| # | Cas | Critère de réussite |
|---|---|---|
| **01** | **Devis cuisine simple 4 lignes** | Tous champs extraits, arithmétique cohérente, confiance globale = `certifie` |
| **02** | **Devis SDB simple 5 lignes** | Idem |
| **03** | **Devis travaux simple avec sous-total + total HT/TVA/TTC** | Réconciliation section + devis OK |
| **04** | **Devis avec remise globale (5%)** | `remise_appliquee` extraite, total recalculé tient compte de la remise |
| **05** | **Devis CIC IBAN avec tirets (`FR76-3006-...`)** | `entreprise.iban` correctement extrait, normalisation sans tirets |

### 🟡 Moyen (5) — cas réels fréquents

| # | Cas | Critère de réussite |
|---|---|---|
| **06** | **Devis avec colonne TVA mélangée 10% / 20%** | Toutes les lignes extraites avec leur TVA, totaux différenciés |
| **07** | **Devis avec sections N/N.M (Florian Miranda type)** | `type=titre_section` natif pour les "1", "2", "3" ; pas de duplication montant titre vs Σ enfants |
| **08** | **Devis multi-pages (>3 pages, IBAN page 3)** | IBAN trouvé sur la dernière page, totaux corrects |
| **09** | **Devis étranger (Casafit Belgique)** | `is_foreign_quote=true`, `country_code=BE`, bypass métier respecté |
| **10** | **Devis courtier (Renovation Man / Ootravaux)** | `type_document=estimation_courtier`, `courtier_nom` rempli |

### 🔴 Difficile (5) — cas tordus qui ont fait les rustines

| # | Cas | Critère de réussite |
|---|---|---|
| **11** | **Devis ALES — tableau multi-lignes physiques par cellule (bug WC 8950€)** | Lignes 2.3 (WC 620€) ET 3.1 (dépose cloisons 8950€) extraites séparément. Pas de mix description/montant. |
| **12** | **Devis multi-devis (3 artisans dans un PDF)** | `multi_devis=true`, `devis_list[]` contient 3 entrées avec leur entreprise + total |
| **13** | **Devis "résumé par lot" sans prix unitaire (Créteil 49 700€)** | `is_incomplete_quote=true`, `incomplete_quote_reason` documenté. Pas d'invention de prix |
| **14** | **Devis avec HT > TTC inversé (baseline V3.4.8)** | Réconciliation arithmétique détecte l'incohérence devis HT/TVA/TTC. Pas de swap auto silencieux. |
| **15** | **Devis hors-scope (réparation voiture / électroménager)** | `type_document=hors_scope`, `hors_scope_categorie` correct |

---

## Format `attendu.json` (par cas)

```json
{
  "type_document": "devis_travaux",
  "is_foreign_quote": false,
  "is_incomplete_quote": false,
  "is_hors_scope": false,
  "multi_devis": false,
  "cartographie": {
    "colonnes": ["numero", "designation", "unite", "quantite", "prix_unitaire", "montant_ht", "tva"],
    "schema_numerotation": "N.M",
    "devise": "EUR",
    "sous_totaux_presents": true
  },
  "entreprise": {
    "nom": "ALES Rénovation",
    "siret": "48374319100031",
    "iban": "...",
    "...": "..."
  },
  "sections": [
    {
      "id_hierarchique": "1",
      "libelle": "Salle de bain",
      "sous_total_lu": 7330,
      "lignes": [
        {
          "id_hierarchique": "1.3",
          "libelle": "Dépose totale de douche existante + évacuation",
          "type": "ligne_travaux",
          "quantite": 1,
          "unite": "U",
          "prix_unitaire": 180,
          "montant_total": 180,
          "tags_nature": ["ligne_transverse"],
          "texte_brut": "1.3 Dépose totale de douche éxistante + évacuation U 1,00 180,00 180,00 10,00"
        }
      ]
    }
  ],
  "totaux": {
    "ht": 22150,
    "tva": 2215,
    "ttc": 24365,
    "taux_tva": 10
  },
  "reconciliation_attendue": {
    "total_devis_coherent": true,
    "ecart_total_pct": 0,
    "confiance_globale": "certifie"
  }
}
```

---

## Workflow de validation à l'exécution Phase 3

```
Pour chaque PDF du banc :
  1. Lancer extract_v2 (le nouveau pipeline)
  2. Comparer la sortie au "attendu.json"
  3. Si différences :
     a. C'est un bug du pipeline → fix + retry
     b. C'est une amélioration légitime non encore dans attendu.json → update attendu.json
  4. Tracer les divergences dans un rapport
```

Un script `scripts/phase3-run-banc-de-tests.ts` (à écrire en Phase 3.1) orchestre tout ça.

---

## Cas spéciaux à documenter

### Cas 11 (ALES 8950€) — le bug emblématique

**Le piège** : sur le tableau ALES, la cellule "Désignation" de la ligne 2.3 occupe 2-3 lignes physiques du PDF :

```
2.3  Fourniture et pose de nouveaux wc en-dessous de
     l'escalier
     wc posés au sol             U  1,00  620,00  620,00  10,00
```

Et la cellule de 3.1 occupe aussi 3 lignes physiques :

```
3.1  Dépose totale de toutes les cloisons intérieures sur
     combles
     compris portes et revêtement de sol + plâtre fixé sur la
     charpente compris évacuation de déchets   U  1,00  8 950,00  8 950,00  10,00
```

Le pipeline V1 a extrait une seule ligne fantôme :
```json
{
  "libelle": "Fourniture et pose de nouveaux wc en-dessous de",
  "montant": 8950
}
```

Le pipeline V2 doit extraire 2 lignes séparées, chacune avec son texte_brut complet :
```json
[
  {
    "id_hierarchique": "2.3",
    "libelle": "Fourniture et pose de nouveaux wc en-dessous de l'escalier — wc posés au sol",
    "montant_total": 620,
    "texte_brut": "2.3 Fourniture et pose de nouveaux wc en-dessous de l'escalier / wc posés au sol U 1,00 620,00 620,00 10,00"
  },
  {
    "id_hierarchique": "3.1",
    "libelle": "Dépose totale de toutes les cloisons intérieures sur combles compris portes et revêtement de sol + plâtre fixé sur la charpente compris évacuation de déchets",
    "montant_total": 8950,
    "texte_brut": "3.1 Dépose totale de toutes les cloisons intérieures sur combles compris portes et revêtement de sol + plâtre fixé sur la charpente compris évacuation de déchets U 1,00 8 950,00 8 950,00 10,00"
  }
]
```

**Comment le prompt v2 fait** : il impose la cartographie (Section A) AVANT toute extraction. Dans cette cartographie, le modèle dit "le schéma de numérotation est N.M et les cellules désignation peuvent être multi-lignes". Puis dans la Section B, il extrait UN item par numéro hiérarchique (2.3, 3.1), avec toutes les lignes physiques de la cellule "Désignation" regroupées dans `texte_brut`.

### Cas 13 (Créteil 49 700€) — devis résumé par lot

**Le piège** : aucune colonne quantité ni prix_unitaire. Juste 9 sections "Lot 1 — Démolition : 8 500 €", "Lot 2 — Plomberie : 6 200 €", etc.

Le pipeline V2 doit retourner :
```json
{
  "is_incomplete_quote": true,
  "incomplete_quote_reason": "Devis résumé par lot : aucune colonne quantité/prix unitaire, totaux par section uniquement (9 lots / 70%+ sans unité physique).",
  "sections": [
    {
      "id_hierarchique": "1",
      "libelle": "Lot 1 — Démolition",
      "sous_total_lu": 8500,
      "lignes": []
    }
  ]
}
```

La rustine `detectIncompleteQuote` (R1) est conservée — c'est un bypass métier, pas une rustine d'extraction.

---

## Constitution progressive

Pour démarrer Phase 3.1, **on n'a pas besoin des 15 cas immédiatement**. On commence par :
- **Cas 01** (cuisine simple) → valider que le pipeline tourne bout en bout
- **Cas 11** (ALES) → le cas le plus difficile, valide la cartographie multi-lignes
- **Cas 13** (résumé par lot) → valide la rustine R1 conservée

3 cas suffisent pour itérer. Les 12 autres se complètent au fil de Phase 3.2 (shadow run) qui les remontera naturellement comme divergences.

---

## Source des PDFs

À récupérer dans :
1. **Notre archive Supabase** (table `analyses`, `file_path` Storage) — les analyses récentes
2. **Demande à Julien** — il a probablement gardé localement les PDFs de tests
3. **Génération synthétique** — pour les cas simples (01, 02), on peut produire un PDF de test depuis un template
