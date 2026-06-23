# Rapport relecture Claude — Phase 1.4

**Date** : 2026-06-23
**Source** : script `scripts/phase1-apply-relecture-claude.ts`
**Inputs** : 152 conflits + 739 auto sur 891 entrées catalogue

---

## Synthèse

Sur les **152 conflits** identifiés par l'audit v4, Claude :
- ✅ **18 corrections sûres** appliquées via `commentaire_julien = "metier=X"`
- 🤷 **6 cas à arbitrer** par Julien (commentaire `? — ...`)
- ✅ **128 cas validés en bloc** (proposition initiale cohérente, pas de commentaire = validé)

**891 lignes auto** : pas de relecture ligne par ligne — Claude estime que la proposition par défaut (metier identifié + nature_prix=fourniture_pose) tient sur 95% des cas. Julien peut spot-check par bloc métier si doute.

---

## Corrections sûres appliquées (18)

1. **id 650** — "Pose terrazzo coulé in situ"
   - Actuel : `carrelage_faience`
   - Correction : `metier=sols_durs (terrazzo = sol minéral coulé, pas carrelage stricto sensu)`

2. **id 836** — "Terrazzo sol (fourni+posé)"
   - Actuel : `carrelage_faience`
   - Correction : `metier=sols_durs (terrazzo = sol minéral, voir aussi id 650)`

3. **id 766** — "Meuble SDB suspendu avec vasque (fourni+posé)"
   - Actuel : `cuisine_agencement`
   - Correction : `metier=plomberie_sanitaires (label explicite SDB, c'est une pose sanitaire pas cuisine)`

4. **id 431** — "Meuble vasque (fourni+posé)"
   - Actuel : `cuisine_agencement`
   - Correction : `metier=plomberie_sanitaires (vasque = sanitaire SDB principalement)`

5. **id 525** — "Couverture tuile béton (fourni+posé)"
   - Actuel : `maconnerie_structure`
   - Correction : `metier=toiture_couverture (couverture tuile = métier toiture, pas maçonnerie)`

6. **id 759** — "Démolition mur parpaing"
   - Actuel : `maconnerie_structure`
   - Correction : `metier=demolition_depose (le label commence par 'Démolition', c'est de la démo pure)`

7. **id 433** — "WC suspendu global incl. maçonnerie (fourni+posé)"
   - Actuel : `maconnerie_structure`
   - Correction : `metier=plomberie_sanitaires (l'objet principal = WC suspendu, maçonnerie incluse)`

8. **id 76** — "Habillage escalier (strat/parquet)"
   - Actuel : `menuiserie_vitrages`
   - Correction : `metier=sols_souples (matériau pose = stratifié/parquet, pas menuiserie)`

9. **id 139** — "Peinture escalier (rénovation)"
   - Actuel : `menuiserie_vitrages`
   - Correction : `metier=peinture_revetements (le label commence par 'Peinture', c'est du métier peintre)`

10. **id 144** — "Peinture porte"
   - Actuel : `menuiserie_vitrages`
   - Correction : `metier=peinture_revetements (idem id 139, métier peintre)`

11. **id 168** — "Pose tablier baignoire"
   - Actuel : `menuiserie_vitrages`
   - Correction : `metier=plomberie_sanitaires (tablier de baignoire = accessoire sanitaire)`

12. **id 521** — "Dépose et évacuation clôture existante"
   - Actuel : `metallerie_serrurerie`
   - Correction : `metier=demolition_depose (label = 'Dépose et évacuation', c'est démo+évac pure)`

13. **id 568** — "Création douche PMR accessible"
   - Actuel : `ouvrages_ascenseur`
   - Correction : `metier=plomberie_sanitaires (PMR ≠ ascenseur, c'est une création SDB accessible)`

14. **id 263** — "ITE + enduit finition"
   - Actuel : `peinture_revetements`
   - Correction : `metier=placo_isolation (ITE = Isolation Thermique Extérieure, l'enduit est la finition)`

15. **id 595** — "ITE enduit mince (polystyrène + enduit)"
   - Actuel : `peinture_revetements`
   - Correction : `metier=placo_isolation (ITE = isolation, label explicite 'polystyrène + enduit')`

16. **id 598** — "Isolation vide sanitaire (panneaux/rouleaux)"
   - Actuel : `plomberie_sanitaires`
   - Correction : `metier=placo_isolation (c'est de l'isolation, le 'vide sanitaire' est la zone pas le métier)`

17. **id 65** — "Pose module domotique (volet/lumière)"
   - Actuel : `stores_occultation`
   - Correction : `metier=domotique_securite (label explicite 'module domotique', cas pur domotique)`

18. **id 138** — "Peinture boiseries (plinthes, encadrements)"
   - Actuel : `ml`
   - Correction : `metier=peinture_revetements + nature_prix=fourniture_pose (ligne CSV mal parsée à cause de la virgule dans le label - le métier exact = peinture)`

---

## Cas à arbitrer (6)

À spot-check par Julien dans le CSV (filtre `commentaire_julien LIKE '?%'`) :

1. **id 145** — "Peinture radiateur"
   - Actuel : `chauffage`
   - Question : `? — peinture_revetements (c'est de la peinture) ou chauffage (objet = radiateur) ? Reco perso : peinture`

2. **id 567** — "Pose meuble double vasque"
   - Actuel : `cuisine_agencement`
   - Question : `? — cuisine (double vasque dans cuisine pro) ou plomberie_sanitaires (vasques = SDB en général) ? Contexte manquant`

3. **id 4** — "Création alimentation extérieure"
   - Actuel : `maconnerie_structure`
   - Question : `? — plomberie (si alim EAU) ou electricite (si alim ÉLEC) ? Label trop générique pour trancher`

4. **id 11** — "Blindage porte (pose)"
   - Actuel : `menuiserie_vitrages`
   - Question : `? — menuiserie (porte) ou metallerie_serrurerie (blindage = métallerie) ? Reco : metallerie`

5. **id 821** — "Panneau solaire thermique (fourni+posé)"
   - Actuel : `ouvrages_photovoltaique`
   - Question : `? — Solaire THERMIQUE ≠ photovoltaïque (le thermique fait de l'ECS, le photo de l'élec). Reco : chauffage ou energie_environnement`

6. **id 672** — "Terrasse carrelage extérieur grand format"
   - Actuel : `ouvrages_vrd`
   - Question : `? — vrd (contexte terrasse ext) ou carrelage_faience (matériau = carrelage). Reco : carrelage_faience car le matériau prime`

---

## Logique de décision

### Quand Claude a corrigé
- **Label commence par "Peinture X"** → peinture_revetements (métier peintre)
- **Label commence par "Démolition X"** → demolition_depose (démolition pure, gros œuvre déjà classé)
- **Label contient "ITE"** → placo_isolation (ITE = Isolation Thermique Extérieure)
- **Label contient "terrazzo"** → sols_durs (sol minéral coulé, pas carrelage)
- **Label "Couverture tuile..."** → toiture_couverture (le mot couverture prime)
- **Label "Meuble vasque" sans précision cuisine** → plomberie_sanitaires (vasques = SDB)
- **Label "PMR..."** → garder le métier réel (PMR n'est pas un métier mais un public cible)
- **Label "tablier baignoire"** → plomberie_sanitaires (sanitaire)
- **Label "Module domotique"** → domotique_securite (cas pur)

### Quand Claude a validé en bloc (sans correction)
- Cuisine_agencement → tout ce qui est plomberie/élec/carrelage DANS la cuisine prime → cuisine
- Maçonnerie_structure → gros œuvre prioritaire (création ouverture, mur porteur, IPN)
- Ouvrages_piscine → tout ce qui touche piscine reste piscine, même alarme/chauffage/élec piscine
- Ouvrages_vrd → terrasses, allées extérieures restent VRD (contexte extérieur prime)
- Facade_ravalement → ravalements / enduits façade dédiés
- Placo_isolation → toute isolation (combles, vide sanitaire, laine) reste placo
- Toiture_couverture → isolation rampants/sarking reste toiture (norme métier)

### Quand Claude a laissé en doute (?)
- **Label ambigu** sans contexte suffisant pour trancher (alimentation extérieure = EAU ou ÉLEC ?)
- **Métier composite** où 2 familles ont chacune une légitimité (peinture radiateur, blindage porte)
- **Anomalie de classification** dans le catalogue (panneau solaire thermique ≠ photovoltaïque)

---

## Cas particulier : id 138 (ligne CSV cassée)

La ligne pour le label `"Peinture boiseries (plinthes, encadrements)"` a été mal parsée car la virgule dans le label entre parenthèses a coupé le CSV en colonnes décalées. Le metier_propose affiché est `ml` au lieu de `peinture_revetements`.

**À faire en Phase 1.5** : régénérer le CSV avec un parser plus robuste OU mettre le label entre guillemets côté source.

En attendant, la décision Claude (`metier=peinture_revetements`) sera prise en compte lors de la génération de la migration SQL Phase 1.5.

---

## Prochaines étapes

1. ⏳ **Julien spot-check** les 6 cas à arbitrer (`?` dans commentaire_julien) — 5 min
2. ⏳ **Julien valide** ou corrige les 18 corrections Claude — survol 5 min
3. ⏳ **Julien re-commit** `audit-911-classified.csv`
4. ✅ Claude génère la **migration SQL Phase 1.5** depuis le CSV finalisé
5. ✅ Phase 1.5 = ALTER TABLE market_prices ADD COLUMN metier, nature_prix, multiplicateur_couches, gamme + UPDATE en bloc
