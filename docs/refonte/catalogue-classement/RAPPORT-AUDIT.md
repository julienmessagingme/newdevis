# Rapport audit catalogue — Phase 1.3

**Date** : 2026-06-23
**Source** : script `scripts/phase1-audit-catalogue.ts`
**Inputs** : 911 entrées de `market_prices`

---

## Synthèse

| Statut | Nb entrées | % |
|---|---|---|
| 🟢 `auto` (consensuel, à valider d'un œil) | 284 | 31.2% |
| 🟡 `doute` (nature_prix ambiguë) | 351 | 38.5% |
| 🟠 `conflit` (capté par plusieurs familles) | 132 | 14.5% |
| 🔴 `doublon_probable` (label identique) | 39 | 4.3% |
| ⚫ `inclassable` (aucune règle métier ne match) | 105 | 11.5% |

---

## Distribution par métier proposé

| Métier | Total | 🟢 auto | 🟡 doute | 🟠 conflit | 🔴 doublon | ⚫ inclassable |
|---|---:|---:|---:|---:|---:|---:|
| `menuiserie_vitrages` | 108 | 45 | 31 | 30 | 2 | 0 |
| `non_classable` | 105 | 0 | 0 | 0 | 0 | 105 |
| `plomberie_sanitaires` | 69 | 36 | 25 | 4 | 4 | 0 |
| `chauffage` | 53 | 31 | 19 | 3 | 0 | 0 |
| `cuisine_agencement` | 52 | 23 | 17 | 12 | 0 | 0 |
| `placo_isolation` | 50 | 10 | 31 | 5 | 4 | 0 |
| `sols_souples` | 44 | 10 | 16 | 6 | 12 | 0 |
| `ouvrages_piscine` | 41 | 15 | 17 | 9 | 0 | 0 |
| `electricite` | 41 | 10 | 19 | 12 | 0 | 0 |
| `peinture_revetements` | 37 | 6 | 18 | 13 | 0 | 0 |
| `cvc_ventilation` | 35 | 5 | 25 | 3 | 2 | 0 |
| `toiture_couverture` | 34 | 17 | 12 | 5 | 0 | 0 |
| `maconnerie_structure` | 33 | 6 | 25 | 2 | 0 | 0 |
| `carrelage_faience` | 32 | 9 | 8 | 2 | 13 | 0 |
| `forfait_renovation_globale` | 23 | 3 | 16 | 4 | 0 | 0 |
| `ouvrages_vrd` | 21 | 4 | 11 | 6 | 0 | 0 |
| `diagnostic_reglementaire` | 19 | 16 | 1 | 2 | 0 | 0 |
| `metallerie_serrurerie` | 14 | 4 | 8 | 2 | 0 | 0 |
| `stores_occultation` | 13 | 10 | 3 | 0 | 0 | 0 |
| `ouvrages_paysagisme` | 12 | 3 | 8 | 1 | 0 | 0 |
| `ouvrages_anc` | 12 | 3 | 8 | 1 | 0 | 0 |
| `ouvrages_photovoltaique` | 9 | 1 | 6 | 2 | 0 | 0 |
| `sols_durs` | 8 | 3 | 3 | 2 | 0 | 0 |
| `bardage_exterieur` | 7 | 5 | 2 | 0 | 0 | 0 |
| `charpente_bois` | 7 | 2 | 4 | 1 | 0 | 0 |
| `demolition_depose` | 6 | 0 | 1 | 3 | 2 | 0 |
| `logistique_chantier` | 5 | 2 | 3 | 0 | 0 | 0 |
| `petits_ouvrages_divers` | 5 | 2 | 3 | 0 | 0 | 0 |
| `prestations_intellectuelles` | 4 | 0 | 4 | 0 | 0 | 0 |
| `ouvrages_ascenseur` | 3 | 0 | 1 | 2 | 0 | 0 |
| `facade_ravalement` | 3 | 2 | 1 | 0 | 0 | 0 |
| `ouvrages_geothermie` | 2 | 0 | 2 | 0 | 0 | 0 |
| `energie_environnement` | 2 | 0 | 2 | 0 | 0 | 0 |
| `domotique_securite` | 2 | 1 | 1 | 0 | 0 | 0 |

---

## Distribution nature_prix proposée

| Nature prix | Nb entrées | Note |
|---|---:|---|
| `inconnu` | 516 | → à arbitrer manuellement |
| `fourniture_pose` | 191 |  |
| `pose_seule` | 163 |  |
| `non_applicable` | 41 |  |

---

## Top 20 doublons (label normalisé)

| Label | Nb |
|---|---:|
| depose carrelage | 5 |
| depose moquette | 5 |
| depose parquet | 5 |
| pose carrelage salle de bain mo | 4 |
| carrelage fournipose | 2 |
| evacuation gravats | 2 |
| isolation combles perdus | 2 |
| isolation murs interieurs | 2 |
| paroi douche fournipose | 2 |
| parquet stratifie fournipose | 2 |
| porte de garage sectionnelle fournipose | 2 |
| pose plinthes carrelage | 2 |
| vmc simple flux | 2 |
| wc suspendu fournipose | 2 |

---

## Comment relire le CSV `audit-911-classified.csv`

Le CSV est **trié par métier proposé**, puis par niveau de doute, puis par label.

**Stratégie de relecture rapide** :
1. **Filtre sur `niveau_doute = inclassable`** (105 lignes) → c'est là qu'il y a le plus de boulot
2. **Filtre sur `niveau_doute = conflit`** (132 lignes) → arbitrer entre 2 familles
3. **Filtre sur `niveau_doute = doublon_probable`** (39 lignes) → décider quoi fusionner / expliciter
4. **Filtre sur `niveau_doute = doute`** (351 lignes) → souvent juste préciser la nature_prix
5. **Les 284 `auto` ne nécessitent QU'un coup d'œil rapide** par métier (relecture en bloc)

**Colonnes à remplir si nécessaire** :
- `commentaire_julien` : correction métier proposé OU nature_prix OU notes libres

**Une fois le CSV relu**, je reprends la version validée pour générer la migration SQL Phase 1.4 (ALTER TABLE market_prices + UPDATE en bloc).

---

## Prochaines actions

1. ⏳ Julien relit `audit-911-classified.csv` (~2-4h)
2. 🟡 Génération de la migration SQL Phase 1.4 depuis le CSV validé
3. 🟡 Recalibrage fourchettes vs prix réels observés dans `analyses` (Phase 1.5)
4. 🟡 Régénération embeddings après modif libellés (Phase 1.6)
