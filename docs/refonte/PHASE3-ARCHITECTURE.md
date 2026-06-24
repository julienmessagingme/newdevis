# Phase 3 — Architecture de la refonte `extract.ts`

**Statut** : 🟢 Architecture validée — prêt pour Phase 3.1 (implémentation)
**Date** : 2026-06-24
**Source** : PDF refonte, principes inviolables PLAN.md, cartographie extract.ts actuel

---

## 1. État actuel — diagnostic factuel

### Volumétrie

| Métrique | Valeur |
|---|---|
| Lignes totales `extract.ts` | **924** |
| Lignes de prompt Gemini | ~210 (lignes 209-418) |
| **Lignes de rustines empilées** | **~250** (10 rustines V3.4.x / V3.5.x) |
| Pipeline post-extraction | ~400 lignes |
| Fonctions auxiliaires | 3 (`uploadToGeminiFiles`, `detectIncompleteQuote`, `sanitizeEntrepriseNom`) |

### Ce qu'on fait aujourd'hui

```
┌─────────────────────────────────────────────────────────────┐
│ Un seul appel Gemini 2.5-flash (responseMimeType=JSON)      │
│ Le PDF est uploadé via Files API                            │
│ Prompt : 210 lignes de règles                               │
│ Sortie attendue : JSON avec entreprise + travaux[] + totaux │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Pipeline post-extraction (~400 lignes)                      │
│                                                             │
│ 1. Parse JSON (avec fallback cleanup truncated)             │
│ 2. Filtre RECAP_PATTERNS (V3.4.11)         ← RUSTINE        │
│ 3. Filtre titres de section (V3.5.10)      ← RUSTINE        │
│ 4. Sanitize nom entreprise (V3.4.8)        ← RUSTINE        │
│ 5. Swap HT/TTC si inversé (V3.4.8)         ← RUSTINE        │
│ 6. Validation clauses litigieuses (V3.4.17)                 │
│ 7. Détection multi-devis                                    │
│ 8. Détection bypass (étranger, courtier, hors-scope, incomplete) │
└─────────────────────────────────────────────────────────────┘
```

### Faiblesses fondamentales identifiées par le PDF

1. **L'extraction lit chaque ligne de façon isolée** sans cartographier la grille du tableau une seule fois
2. **Le prix unitaire n'est jamais extrait** → aucune vérification arithmétique possible (on ne peut pas contrôler que `montant = qty × prix_unitaire`)
3. Les rustines pansent chaque bug observé → fragile et grossissant
4. Le prompt impose déjà "lis la bonne colonne, ne recopie pas l'unité de la ligne voisine" — **preuve que le modèle se trompe de colonne**, exactement le problème à régler structurellement

### Conséquence en production

**Bug ALES 8950€** (cas test BUGS-A-CORRIGER.md) :
- La ligne 2.3 "Fourniture et pose de nouveaux wc en-dessous de l'escalier" (vrai montant 620€, sur 3 lignes physiques du tableau)
- La ligne 3.1 "Dépose totale de toutes les cloisons intérieures sur combles" (vrai montant 8950€, sur 3 lignes physiques aussi)
- **Gemini a collé** : description tronquée de 2.3 + montant de 3.1 → entrée fantôme "WC 8950€"
- La ligne 3.1 originale (dépose cloisons 8950€) a **disparu**
- Une autre vraie ligne (2.3 wc 620€) a **disparu**

C'est exactement le mode de défaillance que la lecture ligne-par-ligne produit sur un tableau complexe.

---

## 2. La cible — pipeline structure-d'abord

### Schéma d'architecture cible

```
┌─────────────────────────────────────────────────────────────┐
│ APPEL GEMINI UNIQUE (responseMimeType=JSON)                 │
│ Prompt restructuré en 2 sections solidaires :               │
│                                                             │
│  ┌──────────────────────────────────────────────┐           │
│  │ SECTION A — CARTOGRAPHIE (faite UNE FOIS)    │           │
│  │ • colonnes du tableau (qty / prix_u / total / unite)     │
│  │ • schéma de numérotation (N / N.M / N.M.K)   │           │
│  │ • devise détectée (€ / autre)                │           │
│  │ • sous-totaux par section présents/absents   │           │
│  │ • multi-devis détecté                        │           │
│  └──────────────────────────────────────────────┘           │
│                                                             │
│  ┌──────────────────────────────────────────────┐           │
│  │ SECTION B — LIGNES (remplit la carte ci-dessus) │         │
│  │ Pour chaque ligne du tableau :               │           │
│  │  - id_hierarchique : "1.1" / "2.3" / "3.1"   │           │
│  │  - type : ligne_travaux | sous_total | total | titre_section │
│  │  - libelle (TEXTE EXACT du devis)            │           │
│  │  - quantite (depuis la colonne mappée)       │           │
│  │  - unite (depuis la colonne mappée)          │           │
│  │  - prix_unitaire (depuis la colonne mappée)  │           │
│  │  - montant_total (depuis la colonne mappée)  │           │
│  │  - tags_nature : ["ancre_surfacique"] | ["annexe_correlee"] │
│  │  - texte_brut (la ligne complète telle qu'écrite) │       │
│  └──────────────────────────────────────────────┘           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ RÉCONCILIATION ARITHMÉTIQUE — module TS pur (gratuit)       │
│                                                             │
│ Pour chaque ligne ligne_travaux :                           │
│   Si qty + prix_u + montant → vérifier qty × prix_u ≈ montant │
│   Si 2 connus → calculer le 3e + confiance "calculé"        │
│   Si désaccord → diagnostic + correction via le plus fiable │
│                                                             │
│ Pour chaque sous_total :                                    │
│   Vérifier sous_total ≈ Σ lignes_filles                     │
│                                                             │
│ Pour le total devis :                                       │
│   Vérifier total ≈ Σ sous_totaux − remise                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ CONFIANCE PAR CHAMP (sortie enrichie)                       │
│                                                             │
│ Pour chaque champ critique :                                │
│   - prix_unitaire : lu | calculé | déduit                   │
│   - unite : explicite | déduite                             │
│   - qty : lu | calculé                                      │
│   - total : lu | recalculé                                  │
│                                                             │
│ Score global : prix_unitaire_extrait_fiabilite (0..1)       │
└─────────────────────────────────────────────────────────────┘
```

### Décision design clé : tagging par nature

Chaque ligne de travaux reçoit un tag dans `tags_nature[]` :

| Tag | Définition | Exemple | Effet Phase 4 |
|---|---|---|---|
| `ancre_surfacique` | Poste avec unité m² / ml / m³ qui constitue un ouvrage principal | "Pose carrelage sol 85 m²" | Cible du rattachement annexes |
| `annexe_correlee` | Poste sans unité propre qui dépend d'un ancrage | "Ragréage chape", "Primaire d'accrochage", "Joints" | Rattaché à l'ancrage du même métier dans la même zone |
| `ligne_transverse` | Poste qui s'applique au chantier entier | "Nettoyage fin chantier", "Évacuation déchets", "Échafaudage" | Comparé seul, jamais agrégé à un ancrage |

→ **Prérequis de Phase 4** (rattachement annexes au coût unitaire complet, cf. PDF page 11)

---

## 3. Inventaire des rustines actuelles → Phase 3

Mapping détaillé : chaque rustine actuelle disparaît, survit ou évolue.

| ID | Rustine | Couverture | Phase 3 |
|---|---|---|---|
| **R1** | V3.5.1 `detectIncompleteQuote` (devis résumé par lot, ≥5 lignes + ≥70% sans unité physique) | Métier (l'absence de qty/unite est un signal métier valide) | ✅ **KEPT** — bypass métier, reste tel quel |
| **R2** | V3.5.4 PHYSICAL_UNIT_NAMES étendu (u, pce, piece...) | Métier (extension du référentiel) | ✅ **KEPT** |
| **R3** | V3.4.8 `sanitizeEntrepriseNom` (rejet fragments légaux) | Extraction (Gemini lit mal le bloc en-tête entreprise) | ❌ **RETIRÉ** — la cartographie en section A distingue clairement le bloc en-tête vs corps du devis |
| **R4** | V3.4.14 `detectQuoteCountry` (devis étranger) | Métier | ✅ **KEPT** |
| **R5** | V3.4.11 RECAP_PATTERNS (filtre lignes Total HT/TVA/TTC) | Extraction (Gemini confond récap et travaux) | ❌ **RETIRÉ** — la section B impose `type ∈ {ligne_travaux, sous_total, total, titre_section}` natif |
| **R6** | V3.5.10 Filtre titres de section (Σ enfants ≈ parent) | Extraction (Gemini inclut titres N comme travaux) | ❌ **RETIRÉ** — la section B distingue `type=titre_section` natif via la cartographie hiérarchique N / N.M |
| **R7** | V3.4.20 Whitelist `estimation_courtier` | Métier (validation enum type_document) | ✅ **KEPT** |
| **R8** | V3.4.28 Whitelist `hors_scope` + `hors_scope_categorie` | Métier | ✅ **KEPT** |
| **R9** | V3.4.8 Swap HT/TTC si inversé | Extraction (Gemini confond colonnes) | ❌ **RETIRÉ** — la section A demande explicitement la convention HT/TVA/TTC ; la réconciliation arithmétique post-extraction détecte l'incohérence |
| **R10** | V3.4.17 Validation clauses litigieuses (5 types, citation ≥10 chars) | Métier | ✅ **KEPT** |

**Bilan** : **4 rustines retirées** (R3, R5, R6, R9 = ~120 lignes de code), **6 rustines métier conservées** (R1, R2, R4, R7, R8, R10 = ~130 lignes de code).

Le pipeline passe de **~924 lignes** à **~600 lignes attendues** (-35%).

---

## 4. Nouveau prompt Gemini — esquisse

### Principe

Le prompt actuel donne 210 lignes de règles imbriquées. Le nouveau prompt fait :

1. **Une description sèche du JSON attendu** (avec exemples)
2. **2 contraintes structurelles fortes** :
   - "Avant TOUTE extraction de ligne, cartographie le tableau"
   - "Chaque ligne extraite vient d'UNE position physique du tableau, jamais d'un mix de positions"
3. **Pas de règles de filtrage** (RECAP, titres, sanitize) — la structure JSON l'impose

### Esquisse de prompt v2 (à valider en Phase 3.1)

```
Tu es un OCR de devis BTP français. Tu lis un PDF de devis et tu retournes un JSON STRICT.

## Étape 1 — CARTOGRAPHIE
Avant d'extraire la moindre ligne, observe le tableau principal et remplis :

  "cartographie": {
    "colonnes": ["numero", "designation", "unite", "quantite", "prix_unitaire", "montant_ht", "tva"],
    "ordre_colonnes": [0, 1, 2, 3, 4, 5, 6],
    "schema_numerotation": "N.M",  // ou "N" ou "absent"
    "devise": "EUR",
    "sous_totaux_presents": true,
    "multi_devis": false
  }

Cette cartographie est OBLIGATOIRE. Tous les extraits de la section B viendront des colonnes mappées ici.

## Étape 2 — LIGNES
Pour chaque ligne physique du tableau (du haut vers le bas) :

  {
    "id_hierarchique": "1.1",                    // depuis colonne[numero]
    "type": "ligne_travaux",                      // OU "sous_total" OU "total" OU "titre_section"
    "libelle": "Pose carrelage sol",              // TEXTE EXACT depuis colonne[designation]
    "quantite": 85,                                // depuis colonne[quantite], null si absent
    "unite": "m2",                                 // depuis colonne[unite], null si absent
    "prix_unitaire": 30,                          // depuis colonne[prix_unitaire], null si absent
    "montant_total": 2550,                        // depuis colonne[montant_ht]
    "tags_nature": ["ancre_surfacique"],          // au choix : ancre_surfacique | annexe_correlee | ligne_transverse
    "texte_brut": "1.1 Pose carrelage sol  85 m²  30  2550",  // ligne entière telle qu'écrite
    "page": 1                                     // n° de page où la ligne apparaît
  }

## RÈGLES ABSOLUES

1. **Tu n'extrais JAMAIS un montant d'une autre ligne** que celle dont tu lis la designation.
   Si la designation s'étend sur plusieurs lignes physiques (cellule multi-lignes), regroupe-les
   en UN seul item avec `texte_brut` qui contient les N lignes physiques.

2. **type="titre_section"** quand la ligne contient un titre N seul (pas N.M) sans qty/prix/montant
   significatifs. Son montant éventuel = somme de ses lignes filles. Ne JAMAIS le compter dans
   les calculs de surface.

3. **type="sous_total"** / **type="total"** quand la ligne est explicitement marquée "Sous-total X",
   "Total HT", "TVA Y %", "Total TTC", "Net à payer". JAMAIS dans les travaux.

4. **prix_unitaire est OBLIGATOIRE si la colonne existe**. Si tu vois "30 €/m²", c'est prix_unitaire=30.

5. **Cas multi-devis** : si tu vois plusieurs blocs avec des numéros de devis différents OU des
   entreprises différentes en en-tête, retourne `multi_devis=true` + un array `devis_list[]`.

(... entreprise / paiement / clauses litigieuses / type_document / hors_scope inchangés ...)
```

Le gain : Gemini n'a plus à deviner "est-ce un titre, un récap, un travail" — c'est dans le format de sortie. Les rustines de filtrage post-extraction deviennent inutiles.

---

## 5. Module de réconciliation arithmétique — design

### Fichier : `src/lib/analyse/extract/reconciliation.ts` (NOUVEAU)

Module **TS pur** (zero dépendance, 100% testable sans DB ni API).

### API publique

```typescript
export interface FieldConfidence {
  source: "lu" | "calcule" | "deduit" | "absent";
  value_extracted?: number;
  value_recalculated?: number;
  delta_pct?: number;
}

export interface LigneReconciliee {
  id_hierarchique: string;
  libelle: string;
  quantite: number | null;
  quantite_confidence: FieldConfidence;
  unite: string | null;
  unite_confidence: FieldConfidence;
  prix_unitaire: number | null;
  prix_unitaire_confidence: FieldConfidence;
  montant_total: number | null;
  montant_total_confidence: FieldConfidence;
  tags_nature: Array<"ancre_surfacique" | "annexe_correlee" | "ligne_transverse">;
  texte_brut: string;
  // Diagnostic global pour la ligne
  arithmetique_valide: boolean;
  diagnostic?: string;
}

export interface SectionReconciliee {
  id_hierarchique: string;
  libelle: string;
  sous_total_lu: number | null;
  sous_total_recalcule: number;
  ecart_pct: number;
  coherent: boolean;
  lignes: LigneReconciliee[];
}

export interface DevisReconcilie {
  sections: SectionReconciliee[];
  total_ht_lu: number | null;
  total_ht_recalcule: number;
  total_tva_lu: number | null;
  total_ttc_lu: number | null;
  remise_appliquee: number;
  total_devis_coherent: boolean;
  // Confiance globale du devis pour piloter le verdict Phase 4
  confiance_globale: "certifie" | "indicatif" | "non_comparable";
}

/**
 * Réconcilie une seule ligne : si qty/prix_u/total sont 3 connus,
 * vérifie qty × prix_u ≈ total. Si 2 connus, calcule le 3e.
 * Si désaccord, propose une correction via le plus fiable
 * (généralement prix_unitaire car le montant_total est souvent juste).
 */
export function reconcileLigne(input: {
  quantite: number | null;
  prix_unitaire: number | null;
  montant_total: number | null;
}): {
  resolved: { quantite: number | null; prix_unitaire: number | null; montant_total: number | null };
  confidence: {
    quantite: FieldConfidence;
    prix_unitaire: FieldConfidence;
    montant_total: FieldConfidence;
  };
  diagnostic?: string;
};

/**
 * Pour une section avec sous_total connu et N lignes filles,
 * vérifie sous_total ≈ Σ lignes.montant_total
 */
export function reconcileSection(
  sousTotalLu: number | null,
  lignes: Array<{ montant_total: number | null }>,
): { coherent: boolean; recalcule: number; ecart_pct: number };

/**
 * Pour le devis entier : vérifie total ≈ Σ sous_totaux − remise
 */
export function reconcileDevis(
  totalLu: number | null,
  sousTotaux: number[],
  remise: number = 0,
): { coherent: boolean; recalcule: number; ecart_pct: number };

/**
 * Calcule le score de confiance global du devis (alimente verdict Phase 4)
 */
export function evaluerConfianceGlobale(devis: DevisReconcilie): "certifie" | "indicatif" | "non_comparable";
```

### Logique de tolérance arithmétique

- **Tolérance ligne** : 0.50 € OU 1 % (le plus grand des deux) — couvre les arrondis
- **Tolérance section** : 1 € OU 0.5 % — légèrement plus stricte
- **Tolérance devis** : 1 € OU 0.5 % — légèrement plus stricte

### Critères de confiance globale

| Statut | Critères |
|---|---|
| `certifie` | 95%+ des lignes avec prix_unitaire LU + arithmétique OK ligne + section + devis |
| `indicatif` | Soit prix_unitaire calculé sur > 5% des lignes, soit écart section/devis 1-5%, soit unité déduite |
| `non_comparable` | Soit prix_unitaire absent sur > 30% des lignes, soit écart > 5%, soit qty non lisible |

Le verdict Phase 4 pondère le surcoût par ce score :
- `certifie` → coefficient 1
- `indicatif` → coefficient 0.5
- `non_comparable` → coefficient 0 (pas de verdict, affichage indicatif)

---

## 6. Banc de tests — devis canoniques

15 devis à constituer dans `docs/refonte/banc-de-tests/` à partir de notre historique :

| # | Cas | Difficulté | Couvert par Phase 3 |
|---|---|---|---|
| 1 | Devis simple BTP standard 5 lignes (cuisine ou SDB) | Facile | Lecture structure |
| 2 | Devis avec colonne TVA 10% / 20% mélangée | Moyen | Cartographie colonnes |
| 3 | Devis avec sections N/N.M (Florian Miranda type) | Moyen | Titres section type=titre_section |
| 4 | Devis ALES — tableau multi-lignes physiques par cellule | **Difficile** | Cartographie cellule multi-lignes (bug WC 8950€) |
| 5 | Devis avec sous-totaux par lot + total général | Moyen | Réconciliation section |
| 6 | Devis avec remise globale | Facile | Réconciliation devis |
| 7 | Devis multi-devis (3 artisans dans un PDF) | **Difficile** | multi_devis=true + devis_list |
| 8 | Devis sans prix unitaire (résumé par lot, 49k Créteil) | Difficile | is_incomplete=true (R1 KEPT) |
| 9 | Devis CIC IBAN avec tirets | Facile | Extraction entreprise robuste |
| 10 | Devis étranger (Belgique, Casafit) | Moyen | is_foreign=true (R4 KEPT) |
| 11 | Devis courtier (Renovation Man / Ootravaux) | Moyen | type=estimation_courtier (R7 KEPT) |
| 12 | Devis hors-scope (réparation voiture) | Facile | type=hors_scope (R8 KEPT) |
| 13 | Devis avec clauses abusives texte libre | Moyen | clauses_litigieuses (R10 KEPT) |
| 14 | Devis pages multi (>3 pages, totaux page 3) | Moyen | Multi-pages, IBAN dernière page |
| 15 | Devis avec HT > TTC inversé (V3.4.8 baseline) | Difficile | Réconciliation arithmétique détecte l'incohérence sans swap auto |

**Format de chaque cas** : PDF source + JSON attendu (extraction validée) + critères de réussite. À constituer lors de la phase 3.1.

---

## 7. Stratégie de déploiement progressive

### Phase 3.1 — Implémentation locale (semaine 1)

- Écrire `reconciliation.ts` + tests unitaires Vitest (zero risque, code mort isolé)
- Écrire `extract_v2.ts` (le nouveau pipeline) à côté de l'ancien (zero risque, code mort tant que pas appelé)
- Le banc de tests tourne sur 15 PDFs en local

### Phase 3.2 — Shadow run en prod (semaine 2)

- Ajouter feature flag `EXTRACT_V2_ENABLED` (par défaut `false`)
- Si `EXTRACT_V2_ENABLED=shadow` : on appelle V2 en background (EdgeRuntime.waitUntil) + on log la comparaison V1 vs V2 dans une table `extract_comparisons`
- L'utilisateur final voit toujours V1 — zero risque de régression
- Au bout de 50-100 analyses shadow → analyse des divergences

### Phase 3.3 — Bascule contrôlée (semaine 3)

- Si shadow OK : `EXTRACT_V2_ENABLED=on` (rollback immédiat possible via secret Supabase)
- Pendant 7 jours, monitoring rapproché de la liste `/admin/reviews` (le filet Piste C alerte si régression)
- Retrait progressif des rustines retirées (R3, R5, R6, R9) une fois la couverture confirmée par le banc de tests

### Phase 3.4 — Nettoyage et bump ENGINE_VERSION (semaine 4)

- Retirer le code mort `extract.ts` v1
- Bump `ENGINE_VERSION` → `"2.0.0-refonte"` (Phase 3 livrée = bump majeur)
- Mise à jour HISTORY.md
- Mise à jour RUSTINES.md (R3/R5/R6/R9 marqués ✅ retirés)

---

## 8. Risques et mitigations

| Risque | Probabilité | Mitigation |
|---|---|---|
| Budget temps Gemini > 80s avec prompt étendu | Moyen | Le prompt s'allège (210 → ~120 lignes) ; le format JSON est plus riche mais structuré → token compte similaire |
| JSON tronqué (sortie plus verbeuse) | Moyen | maxOutputTokens reste à 32768 ; on monitore la longueur sortie en shadow |
| Cas multi-devis pas couvert par le nouveau format | Faible | Test #7 du banc le couvre explicitement |
| Cas "devis résumé par lot" pas couvert | Faible | R1 (`detectIncompleteQuote`) conservée |
| Régression sur cas non couverts par les 15 tests | Moyen | Shadow run en prod sur ~100 analyses avant bascule |
| Le tagging `tags_nature` foire | Faible | Phase 4 le valide avant de l'utiliser ; pour Phase 3 on accepte un best-effort |

---

## 9. Décisions actées

1. **Pas de 2 appels Gemini** — un seul appel avec sortie structurée (PDF point de vigilance "Budget temps ~150s")
2. **Pas de format CSV-like ou propriétaire** — JSON strict (`responseMimeType=application/json`)
3. **La cartographie fait partie du JSON de sortie** — pas un appel séparé
4. **Le module de réconciliation est en TS pur** — testable sans DB ni API
5. **Conservation des 6 rustines métier** (R1, R2, R4, R7, R8, R10) — ce sont des garde-fous métier, pas des patchs extraction
6. **Suppression des 4 rustines extraction** (R3, R5, R6, R9) — couvertes par le format structuré
7. **Tags `tags_nature[]` introduits maintenant** — prérequis Phase 4, coût marginal pour l'extracteur
8. **Stratégie shadow** — 50-100 analyses shadow avant bascule
9. **Bump `ENGINE_VERSION` réservé à Phase 3.4 livrée** — pas de bump intermédiaire

---

## 10. Prochaines étapes (à l'exécution)

| Step | Tâche | Bloque sur |
|---|---|---|
| 3.1.a | Écrire `reconciliation.ts` + tests Vitest | Rien — peut commencer immédiatement |
| 3.1.b | Écrire `extract_v2.ts` (nouveau pipeline) | Rien (zero risque tant que pas appelé) |
| 3.1.c | Constituer le banc de tests (15 PDFs + JSON attendu) | Récupération des PDFs (peut être progressif) |
| 3.2 | Brancher le feature flag shadow + table `extract_comparisons` | 3.1 terminé |
| 3.3 | Bascule contrôlée | 3.2 + analyse shadow OK |
| 3.4 | Nettoyage + bump ENGINE_VERSION | 3.3 stabilisé 7j |

**Effort estimé** : 2-4 sessions live (semaines 1-4 si itération hebdo).

---

## Annexe — Mapping vers le PDF de refonte

| Point PDF page 5 (Phase 3 "Fiabiliser la lecture du devis") | Couvert dans cette architecture |
|---|---|
| Lecture "structure d'abord" | Section A du prompt + format JSON imposé |
| Extraire le prix unitaire + texte brut | Champ `prix_unitaire` + `texte_brut` obligatoires |
| Réconciliation arithmétique côté code | Module `reconciliation.ts` |
| Niveau de confiance par champ | `FieldConfidence` par champ + `confiance_globale` |
| Tagger chaque ligne par nature | `tags_nature[]` |
| Retirer les rustines une fois couvertes | R3, R5, R6, R9 listées comme retirables |
| Banc de tests | 15 devis canoniques |
| Feature flag + repli immédiat | Stratégie shadow → bascule |
