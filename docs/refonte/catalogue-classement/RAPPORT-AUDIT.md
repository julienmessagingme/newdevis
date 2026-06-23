# Rapport audit catalogue — Phase 1.3

**Date** : 2026-06-23
**Source** : script `scripts/phase1-audit-catalogue.ts`
**Inputs** : 891 entrées de `market_prices`

---

## Synthèse

| Statut | Nb entrées | % |
|---|---|---|
| 🟢 `auto` (consensuel, à valider d'un œil) | 739 | 82.9% |
| 🟡 `doute` (nature_prix ambiguë) | 0 | 0.0% |
| 🟠 `conflit` (capté par plusieurs familles) | 152 | 17.1% |
| 🔴 `doublon_probable` (label identique) | 0 | 0.0% |
| ⚫ `inclassable` (aucune règle métier ne match) | 0 | 0.0% |

---

## Distribution par métier proposé

| Métier | Total | 🟢 auto | 🟡 doute | 🟠 conflit | 🔴 doublon | ⚫ inclassable |
|---|---:|---:|---:|---:|---:|---:|
| `menuiserie_vitrages` | 94 | 85 | 0 | 9 | 0 | 0 |
| `plomberie_sanitaires` | 71 | 66 | 0 | 5 | 0 | 0 |
| `electricite` | 65 | 63 | 0 | 2 | 0 | 0 |
| `cuisine_agencement` | 64 | 44 | 0 | 20 | 0 | 0 |
| `chauffage` | 58 | 52 | 0 | 6 | 0 | 0 |
| `maconnerie_structure` | 57 | 36 | 0 | 21 | 0 | 0 |
| `placo_isolation` | 49 | 42 | 0 | 7 | 0 | 0 |
| `ouvrages_piscine` | 43 | 31 | 0 | 12 | 0 | 0 |
| `sols_souples` | 37 | 32 | 0 | 5 | 0 | 0 |
| `cvc_ventilation` | 34 | 30 | 0 | 4 | 0 | 0 |
| `toiture_couverture` | 34 | 30 | 0 | 4 | 0 | 0 |
| `peinture_revetements` | 33 | 30 | 0 | 3 | 0 | 0 |
| `ouvrages_vrd` | 31 | 22 | 0 | 9 | 0 | 0 |
| `stores_occultation` | 29 | 25 | 0 | 4 | 0 | 0 |
| `forfait_renovation_globale` | 26 | 20 | 0 | 6 | 0 | 0 |
| `carrelage_faience` | 25 | 21 | 0 | 4 | 0 | 0 |
| `diagnostic_reglementaire` | 21 | 18 | 0 | 3 | 0 | 0 |
| `ouvrages_paysagisme` | 15 | 12 | 0 | 3 | 0 | 0 |
| `ouvrages_anc` | 14 | 11 | 0 | 3 | 0 | 0 |
| `sols_durs` | 13 | 12 | 0 | 1 | 0 | 0 |
| `metallerie_serrurerie` | 13 | 12 | 0 | 1 | 0 | 0 |
| `ouvrages_photovoltaique` | 12 | 11 | 0 | 1 | 0 | 0 |
| `facade_ravalement` | 12 | 0 | 0 | 12 | 0 | 0 |
| `logistique_chantier` | 8 | 8 | 0 | 0 | 0 | 0 |
| `bardage_exterieur` | 7 | 7 | 0 | 0 | 0 | 0 |
| `charpente_bois` | 6 | 6 | 0 | 0 | 0 | 0 |
| `demolition_depose` | 6 | 2 | 0 | 4 | 0 | 0 |
| `ouvrages_ascenseur` | 3 | 1 | 0 | 2 | 0 | 0 |
| `petits_ouvrages_divers` | 3 | 3 | 0 | 0 | 0 | 0 |
| `ouvrages_geothermie` | 2 | 2 | 0 | 0 | 0 | 0 |
| `energie_environnement` | 2 | 2 | 0 | 0 | 0 | 0 |
| `prestations_intellectuelles` | 2 | 2 | 0 | 0 | 0 | 0 |
| `domotique_securite` | 2 | 1 | 0 | 1 | 0 | 0 |

---

## Distribution nature_prix proposée

| Nature prix | Nb entrées | Note |
|---|---:|---|
| `fourniture_pose` | 684 |  |
| `pose_seule` | 160 |  |
| `non_applicable` | 47 |  |

---

## Top 20 doublons (label normalisé)

| Label | Nb |
|---|---:|


---

## Comment relire le CSV `audit-911-classified.csv`

Le CSV est **trié par métier proposé**, puis par niveau de doute, puis par label.

**Stratégie de relecture rapide** :
1. **Filtre sur `niveau_doute = inclassable`** (0 lignes) → c'est là qu'il y a le plus de boulot
2. **Filtre sur `niveau_doute = conflit`** (152 lignes) → arbitrer entre 2 familles
3. **Filtre sur `niveau_doute = doublon_probable`** (0 lignes) → décider quoi fusionner / expliciter
4. **Filtre sur `niveau_doute = doute`** (0 lignes) → souvent juste préciser la nature_prix
5. **Les 739 `auto` ne nécessitent QU'un coup d'œil rapide** par métier (relecture en bloc)

**Colonnes à remplir si nécessaire** :
- `commentaire_julien` : correction métier proposé OU nature_prix OU notes libres

**Une fois le CSV relu**, je reprends la version validée pour générer la migration SQL Phase 1.4 (ALTER TABLE market_prices + UPDATE en bloc).

---

## Prochaines actions

1. ⏳ Julien relit `audit-911-classified.csv` (~2-4h)
2. 🟡 Génération de la migration SQL Phase 1.4 depuis le CSV validé
3. 🟡 Recalibrage fourchettes vs prix réels observés dans `analyses` (Phase 1.5)
4. 🟡 Régénération embeddings après modif libellés (Phase 1.6)
